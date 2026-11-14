"""Train the sign classifier.

    python train.py                 # baseline + GRU, saves models/sign_model.pt and models/baseline.joblib
    python train.py --wandb         # also log to Weights & Biases

Prints held-out accuracy and the most confused sign pairs, so you know what to re-record.
"""
import argparse
import glob
import json
import os
from collections import Counter

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from landmarks import N_FRAMES, enrich, hold_cut

HERE = os.path.dirname(os.path.abspath(__file__))


def load(data_dir):
    X, y, who = [], [], []
    for path in sorted(glob.glob(os.path.join(data_dir, "*", "*.npy"))):
        seq = np.load(path)
        if len(seq) < 2:
            continue
        X.append(seq)
        y.append(os.path.basename(os.path.dirname(path)))
        who.append(os.path.basename(path).split("_")[0])
    return X, np.array(y), np.array(who)


def variants(seq):
    """Extra copies of a take cut the way hold mode in live.py cuts them, so the model also knows a
    sign that stops at the hold (no hands dropping) or starts from the previous sign (no hands rising)."""
    out = [seq]
    cut = hold_cut(seq)
    if cut:
        out.append(seq[:cut])                       # ends at the hold
    k = len(seq) // 4
    if len(seq) - k >= 8:
        out.append(seq[k:])                         # starts mid-rise
        tail = seq[k:]
        cut2 = hold_cut(tail)
        if cut2:
            out.append(tail[:cut2])                 # both
    return out


def top_confusions(y_true, y_pred, labels, k=5):
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    np.fill_diagonal(cm, 0)
    pairs = sorted(((cm[i, j], labels[i], labels[j]) for i in range(len(labels))
                    for j in range(len(labels)) if cm[i, j]), reverse=True)
    return pairs[:k]


def augment(xb, torch):
    """Small random changes so 30 takes behave like a few hundred."""
    b = xb.shape[0]
    scale = 1 + 0.1 * (torch.rand(b, 1, 1) * 2 - 1)
    shift = 0.05 * (torch.rand(b, 1, 1) * 2 - 1)
    noise = 0.02 * torch.randn_like(xb)
    out = xb * scale + shift + noise
    out[:, :, -2:] = xb[:, :, -2:]  # keep the hand-seen flags clean
    return out


def train_gru(Xtr, ytr, Xva, yva, labels, epochs, use_wandb):
    import torch
    import torch.nn as nn

    class SignGRU(nn.Module):
        def __init__(self, d_in, n_out):
            super().__init__()
            self.gru = nn.GRU(d_in, 128, num_layers=2, batch_first=True, bidirectional=True, dropout=0.2)
            self.head = nn.Sequential(nn.Dropout(0.3), nn.Linear(256, n_out))

        def forward(self, x):
            out, _ = self.gru(x)
            return self.head(out.mean(dim=1))

    torch.manual_seed(0)
    idx = {l: i for i, l in enumerate(labels)}
    Xtr_t, Xva_t = torch.tensor(Xtr), torch.tensor(Xva)
    ytr_t = torch.tensor([idx[l] for l in ytr])
    yva_t = torch.tensor([idx[l] for l in yva])

    model = SignGRU(Xtr.shape[2], len(labels))
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.05)
    best, best_state = -1.0, None

    for ep in range(epochs):
        model.train()
        perm = torch.randperm(len(Xtr_t))
        total = 0.0
        for i in range(0, len(perm), 32):
            b = perm[i:i + 32]
            opt.zero_grad()
            loss = loss_fn(model(augment(Xtr_t[b], torch)), ytr_t[b])
            loss.backward()
            opt.step()
            total += loss.item() * len(b)
        model.eval()
        with torch.no_grad():
            acc = (model(Xva_t).argmax(1) == yva_t).float().mean().item()
        if acc >= best:  # on a tie keep the later, better-trained model (">" kept the first, barely trained one)
            best, best_state = acc, {k: v.clone() for k, v in model.state_dict().items()}
        if use_wandb:
            import wandb
            wandb.log({"epoch": ep, "train_loss": total / len(perm), "val_acc": acc})
        if ep % 10 == 0 or ep == epochs - 1:
            print(f"  epoch {ep:3d}  loss {total / len(perm):.3f}  val acc {acc:.3f}")

    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        pred = [labels[i] for i in model(Xva_t).argmax(1).tolist()]
    return model, best, pred


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(HERE, "data"))
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--wandb", action="store_true")
    args = ap.parse_args()

    X, y, who = load(args.data)
    labels = sorted(str(l) for l in set(y))  # plain str so torch.load(weights_only=True) works
    y, who = np.array([str(v) for v in y]), [str(v) for v in who]
    print(f"{len(X)} takes, {len(labels)} labels, signers: {dict(Counter(who))}")
    for l, c in sorted(Counter(y).items()):
        print(f"  {l:10s} {c}")

    raw_tr, raw_va, ytr0, yva = train_test_split(X, y, test_size=0.2, stratify=y, random_state=0)
    Xtr, ytr = [], []
    for seq, label in zip(raw_tr, ytr0):
        for v in variants(seq):
            Xtr.append(enrich(v))
            ytr.append(label)
    Xtr, ytr = np.stack(Xtr), np.array(ytr)
    Xva = np.stack([enrich(s) for s in raw_va])
    # the same held-back takes, cut where hold mode would cut them
    held = [(enrich(s[:hold_cut(s)]), l) for s, l in zip(raw_va, yva) if hold_cut(s)]
    os.makedirs(os.path.join(HERE, "models"), exist_ok=True)

    if args.wandb:
        import wandb
        wandb.init(project="signvoice", config={"n_takes": len(X), "labels": labels, "epochs": args.epochs})

    # 1. Baseline: tells you in seconds whether the data is any good.
    base = make_pipeline(StandardScaler(), LogisticRegression(max_iter=3000, C=0.5))
    base.fit(Xtr.reshape(len(Xtr), -1), ytr)
    base_pred = base.predict(Xva.reshape(len(Xva), -1))
    base_acc = accuracy_score(yva, base_pred)
    print(f"\nBaseline (logistic regression) val acc: {base_acc:.3f}")
    joblib.dump({"model": base, "labels": labels}, os.path.join(HERE, "models", "baseline.joblib"))

    # 2. GRU over the 30-frame sequence.
    try:
        import torch
    except ImportError:
        print("torch not installed: live.py will use the baseline. `pip install torch` for the GRU.")
        print("Most confused (true -> predicted):", top_confusions(yva, base_pred, labels))
        return

    print("\nTraining GRU ...")
    model, gru_acc, gru_pred = train_gru(Xtr, ytr, Xva, yva, labels, args.epochs, args.wandb)
    print(f"GRU val acc: {gru_acc:.3f}")
    if held:
        idx = model(torch.tensor(np.stack([h[0] for h in held]))).argmax(1).tolist()
        right = sum(labels[i] == h[1] for i, h in zip(idx, held))
        print(f"GRU on the same takes cut at the hold (hold mode): {right}/{len(held)}")
    torch.save({"state_dict": model.state_dict(), "labels": labels, "feat_dim": int(Xtr.shape[2]), "n_frames": int(N_FRAMES)},
               os.path.join(HERE, "models", "sign_model.pt"))
    with open(os.path.join(HERE, "models", "labels.json"), "w") as f:
        json.dump(labels, f)

    best_pred = gru_pred if gru_acc >= base_acc else base_pred
    print("\nMost confused (count, true, predicted): re-record these or drop one of them")
    for c, t, p in top_confusions(yva, best_pred, labels):
        print(f"  {c}  {t} -> {p}")
    if args.wandb:
        import wandb
        wandb.log({"baseline_val_acc": base_acc, "gru_val_acc": gru_acc})
        wandb.finish()


if __name__ == "__main__":
    main()
