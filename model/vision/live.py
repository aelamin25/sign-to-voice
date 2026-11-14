"""Live sign recognition.

    python live.py                          # prints one JSON line per sign and per phrase
    python live.py --translate              # also turns each phrase into English (needs ../lang + ANTHROPIC_API_KEY)
    python live.py --send http://localhost:8000/phrase   # POSTs each finished turn to the backend (model/backend)
    python live.py --replay samples/*.npy --send http://localhost:8000/phrase
                                            # no camera: plays recorded takes through the same code, to test the link

Sign one sign at a time: hands up, sign, hands down briefly (~0.3 s).
Rest your hands for ~1.5 s to finish the phrase.
Keys: C clear   Q quit
Output per sign:   {"type": "sign", "token": "HEAD", "conf": 0.91}
Output per phrase: {"type": "phrase", "tokens": ["HEAD", "PAIN"], "confs": [0.91, 0.88]}
"""
import argparse
import json
import os
import sys
import threading
import time
import urllib.request

import cv2
import numpy as np

from landmarks import REST_LINE, Segmenter, Tracker, enrich, hands_resting
from vocab import FIDGET

HERE = os.path.dirname(os.path.abspath(__file__))
APPROVE = "THUMBS-UP"


class Classifier:
    def __init__(self):
        pt = os.path.join(HERE, "models", "sign_model.pt")
        if os.path.exists(pt):
            import torch
            import torch.nn as nn

            ckpt = torch.load(pt, map_location="cpu")

            class SignGRU(nn.Module):  # must match train.py
                def __init__(self, d_in, n_out):
                    super().__init__()
                    self.gru = nn.GRU(d_in, 128, num_layers=2, batch_first=True, bidirectional=True, dropout=0.2)
                    self.head = nn.Sequential(nn.Dropout(0.3), nn.Linear(256, n_out))

                def forward(self, x):
                    out, _ = self.gru(x)
                    return self.head(out.mean(dim=1))

            self.labels = ckpt["labels"]
            self.model = SignGRU(ckpt["feat_dim"], len(self.labels))
            self.model.load_state_dict(ckpt["state_dict"])
            self.model.eval()
            self.torch = torch
            self.kind = "gru"
        else:
            import joblib
            b = joblib.load(os.path.join(HERE, "models", "baseline.joblib"))
            self.model, self.kind = b["model"], "baseline"
            self.labels = list(self.model.classes_)  # predict_proba columns follow classes_
        print(f"Loaded {self.kind} model with {len(self.labels)} labels")

    def predict(self, frames):
        x = enrich(np.stack(frames))
        if self.kind == "gru":
            with self.torch.no_grad():
                probs = self.torch.softmax(self.model(self.torch.tensor(x[None])), dim=1)[0].numpy()
        else:
            probs = self.model.predict_proba(x.reshape(1, -1))[0]
        i = int(np.argmax(probs))
        return str(self.labels[i]), float(probs[i])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--threshold", type=float, default=0.7)
    ap.add_argument("--sign-gap", type=float, default=0.3)
    ap.add_argument("--phrase-gap", type=float, default=1.5)
    ap.add_argument("--send", default=None, help="URL to POST each phrase to")
    ap.add_argument("--translate", action="store_true")
    ap.add_argument("--rest", action="store_true",
                    help="hands lowered below the yellow line count as resting, so they need not leave the picture")
    ap.add_argument("--plain", action="store_true",
                    help="camera window shows only the picture and the dots, no words (for the demo)")
    ap.add_argument("--replay", nargs="+", metavar="TAKE.npy",
                    help="no camera: feed these recorded takes through the recogniser, one turn each")
    ap.add_argument("--replay-pause", type=float, default=0.0,
                    help="seconds to wait after each replayed take (gives the web app time to speak)")
    ap.add_argument("--hold", action="store_true",
                    help="end a sign when the hands hold still, so they can stay in view between signs")
    args = ap.parse_args()

    translate = None
    if args.translate:
        sys.path.insert(0, os.path.join(HERE, "..", "lang"))
        from translate import gloss_to_sentence as translate

    clf = Classifier()
    seg = Segmenter(args.sign_gap, args.phrase_gap, hold=args.hold)
    replaying = bool(args.replay)
    cap = None
    if not replaying:
        tracker = Tracker()
        cap = cv2.VideoCapture(args.camera)
        if not cap.isOpened():
            # printed as well as raised: the start scripts hide the error stream
            print("Can't open the camera. On Mac: System Settings > Privacy & Security > Camera, allow Terminal.",
                  flush=True)
            raise SystemExit(1)

    t0 = time.time()

    def camera_frames():
        """One item per camera frame: (picture, time, features, hands seen, points to draw)."""
        while True:
            ok, frame = cap.read()
            if not ok:
                continue
            frame = cv2.flip(frame, 1)
            now = time.time()
            vec, hands_seen, points = tracker.process(frame, (now - t0) * 1000)
            yield frame, now, vec, hands_seen, points

    def replay_frames():
        """The same items, read from recorded takes: each take, then two seconds of no hands."""
        now = 0.0
        for path in args.replay:
            print(json.dumps({"type": "replay", "take": os.path.basename(os.path.dirname(os.path.abspath(path)))}),
                  flush=True)
            for vec in np.load(path):
                now += 1 / 15
                yield None, now, vec, True, []
            for _ in range(30):
                now += 1 / 15
                yield None, now, None, False, []
            if args.replay_pause:
                time.sleep(args.replay_pause)

    def background(fn, *a):
        """Sending must not freeze the camera picture. A replay has no picture, so it just waits."""
        if replaying:
            fn(*a)
        else:
            threading.Thread(target=fn, args=a, daemon=True).start()

    tokens, confs = [], []
    status = {"last": "", "sentence": ""}

    # The team backend (/phrase) wants one message per finished turn. Only the first prototype
    # page (legacy, /api/signs) also took each sign as it happened.
    signs_too = bool(args.send) and args.send.rstrip("/").endswith("/api/signs")

    def post(msg):
        if not args.send:
            return
        try:
            req = urllib.request.Request(args.send, data=json.dumps(msg).encode(),
                                         headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=3)
        except Exception as e:
            # on the normal output, so it is seen even when the start scripts hide the error stream
            print(json.dumps({"type": "send_failed", "to": args.send, "error": str(e)}), flush=True)

    def finish_phrase(toks, cs):
        msg = {"type": "phrase", "tokens": toks, "confs": cs}
        print(json.dumps(msg), flush=True)
        post(msg)
        if translate:
            status["sentence"] = "..."
            status["sentence"] = translate(toks)
            print(json.dumps({"type": "sentence", "text": status["sentence"]}), flush=True)

    for frame, now, vec, hands_seen, points in (replay_frames() if replaying else camera_frames()):
        resting = args.rest and hands_resting(vec)
        event, frames = seg.update(vec, hands_seen and not resting, now)

        if event == "sign":
            label, conf = clf.predict(frames)
            if label == FIDGET:
                status["last"] = f"FIDGET {conf:.2f} (not a sign, ignored)"
                print(json.dumps({"type": "ignored", "guess": label, "conf": round(conf, 2)}), flush=True)
            else:
                status["last"] = f"{label} {conf:.2f}" if conf >= args.threshold else f"didn't catch that ({label} {conf:.2f})"
                # A thumbs up after some signs means "that's my turn done": send the turn now, no waiting.
                # A thumbs up on its own is the patient approving the sentence on screen.
                if label == APPROVE and conf >= args.threshold and tokens:
                    print(json.dumps({"type": "turn_done", "by": APPROVE, "conf": round(conf, 2)}), flush=True)
                    background(finish_phrase, tokens, confs)
                    tokens, confs = [], []
                    continue
                # A half-seen thumbs up after real signs must not spoil the turn: it only meant "done",
                # and the turn still ends by itself when the hands rest.
                if label == APPROVE and conf < args.threshold and tokens:
                    print(json.dumps({"type": "ignored", "guess": label, "conf": round(conf, 2)}), flush=True)
                    continue
                # A label like "PAIN+HEAD" is two signs recorded as one flowing movement: report both, in order.
                parts = label.split("+") if conf >= args.threshold else ["?"]
                # "PAIN+HEAD+THUMBS-UP" recorded as one movement: the thumbs up on the end closes the turn.
                ends_turn = len(parts) > 1 and parts[-1] == APPROVE
                if ends_turn:
                    parts = parts[:-1]
                msgs = []
                for tok in parts:
                    tokens.append(tok)
                    confs.append(round(conf, 2))
                    msg = {"type": "sign", "token": tok, "conf": round(conf, 2), "guess": label}
                    print(json.dumps(msg), flush=True)
                    msgs.append(msg)
                # one thread, so the page gets the signs in order
                def send_all(ms=msgs, done=(list(tokens), list(confs)) if ends_turn else None):
                    for m in ms if signs_too else []:
                        post(m)
                    if done:
                        finish_phrase(*done)
                background(send_all)
                if ends_turn:
                    print(json.dumps({"type": "turn_done", "by": APPROVE, "conf": round(conf, 2)}), flush=True)
                    tokens, confs = [], []
        elif event == "phrase_end" and tokens:
            background(finish_phrase, tokens, confs)
            tokens, confs = [], []

        if frame is None:  # replay: nothing to draw
            continue

        for p in points:
            cv2.circle(frame, p, 2, (0, 255, 0), -1)
        if not args.plain:
            cv2.putText(frame, " ".join(tokens) or "...", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 3)
            cv2.putText(frame, status["last"], (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        if status["sentence"] and not args.plain:
            cv2.putText(frame, status["sentence"], (20, frame.shape[0] - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                        (0, 255, 255), 2)
        if args.rest and len(points) >= 7 and vec is not None:
            # the last seven points are nose, shoulders, elbows, wrists
            (lx, ly), (rx, ry) = points[-6], points[-5]
            line_y = int((ly + ry) / 2 + REST_LINE * ((lx - rx) ** 2 + (ly - ry) ** 2) ** 0.5)
            cv2.line(frame, (0, line_y), (frame.shape[1], line_y), (0, 255, 255), 2)
            cv2.putText(frame, "rest your hands below this line", (20, min(line_y + 25, frame.shape[0] - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        if hands_seen and not resting:
            cv2.circle(frame, (frame.shape[1] - 30, 30), 12, (0, 0, 255), -1)
        cv2.imshow("live", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("c"):
            tokens, confs, status["sentence"] = [], [], ""

    if cap is not None:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
