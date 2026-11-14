"""Learning from use: the first step of a self-improving sentence model.

Today the sentence model learns only from examples the team wrote by hand (data/train.jsonl and the
Adaption-expanded data/final.jsonl). This adds the missing loop:

    1. record()      each time a patient's signs are turned into a sentence, save that example
                     (the signs, the doctor's last line, the sentence) to data/usage_log.jsonl
    2. to_training   turn the saved examples into the same prompt/completion rows the Adaption
                     pipeline already uses -> data/from_usage.jsonl
    3. a person who signs checks those rows, then adaption_pipeline.py uploads and fine-tunes on them

OFF by default, because the app tells the patient nothing is stored. Turn it on only with the
patient's agreement, by setting USAGE_LOG=1 where the backend runs. The two data files are private
(real consultation text) and are ignored by git.

    python usage_log.py            # step 2: data/usage_log.jsonl -> data/from_usage.jsonl, with a summary
    python usage_log.py --show     # print the saved examples
"""
import json
import os
import sys
import time
from collections import Counter, defaultdict

from prompt_format import format_prompt
from vocab import PATIENT_SIGNS, UNKNOWN

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "data", "usage_log.jsonl")
OUT = os.path.join(HERE, "data", "from_usage.jsonl")
MAX_WORDS = 25  # same limit as adaption_pipeline.py: the patient speaks one short sentence


def enabled():
    return os.environ.get("USAGE_LOG", "").strip().lower() in ("1", "true", "yes", "on")


def record(tokens, doctor_said, text, path=None):
    """Save one example. Returns True if it was written. Never raises: logging must not break a visit."""
    if not enabled():
        return False
    try:
        tokens = [str(t) for t in (tokens or [])]
        text = (text or "").strip()
        if not tokens or not text:
            return False
        row = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "tokens": tokens,
               "doctor_said": (doctor_said or None), "text": text}
        path = path or LOG
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        return True
    except Exception as e:  # noqa: BLE001
        print("[usage_log] could not save an example:", e)
        return False


def read(path=None):
    path = path or LOG
    if not os.path.exists(path):
        return []
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except ValueError:
                pass  # a half-written line: skip it
    return rows


def to_training(rows):
    """Saved examples -> training rows. Returns (training_rows, why_dropped).

    Kept: turns made only of signs the model knows, with one short sentence.
    Dropped: turns with an unrecognised sign ('?'), unknown tokens, empty or long sentences.
    The same signs + doctor line seen several times become one row, with the sentence seen most often.
    """
    known = set(PATIENT_SIGNS)
    dropped = Counter()
    by_prompt = defaultdict(Counter)
    for r in rows:
        tokens, text = r.get("tokens") or [], (r.get("text") or "").strip()
        if UNKNOWN in tokens:
            dropped["had an unrecognised sign"] += 1
        elif any(t not in known for t in tokens):
            dropped["had a sign outside the vocabulary"] += 1
        elif not text:
            dropped["no sentence"] += 1
        elif len(text.split()) > MAX_WORDS:
            dropped["sentence too long"] += 1
        else:
            by_prompt[format_prompt(tokens, r.get("doctor_said") or None)][text] += 1
    out = []
    for prompt, sentences in by_prompt.items():
        sentence, seen = sentences.most_common(1)[0]
        out.append({"prompt": prompt, "completion": sentence, "times_seen": seen,
                    "other_sentences_seen": len(sentences) - 1})
    return out, dropped


def main():
    rows = read()
    if "--show" in sys.argv:
        for r in rows:
            print(json.dumps(r, ensure_ascii=False))
        return
    if not rows:
        print(f"No saved examples yet ({LOG}).")
        print("Start the backend with USAGE_LOG=1 (with the patient's agreement) and run a visit.")
        return
    train, dropped = to_training(rows)
    with open(OUT, "w", encoding="utf-8") as f:
        for r in train:
            f.write(json.dumps({"prompt": r["prompt"], "completion": r["completion"]}, ensure_ascii=False) + "\n")
    print(f"{len(rows)} saved examples -> {len(train)} training rows in {OUT}")
    for why, n in dropped.most_common():
        print(f"  dropped {n}: {why}")
    disputed = [r for r in train if r["other_sentences_seen"]]
    if disputed:
        print(f"  {len(disputed)} rows had more than one sentence for the same signs: check these first.")
    print("\nNext:")
    print("  1. Have someone who signs read the rows and delete any sentence that is not what the signs mean.")
    print("  2. python adaption_pipeline.py upload data/from_usage.jsonl --raw")
    print("  3. python adaption_pipeline.py train      (then: status, for the win rate against the base model)")


if __name__ == "__main__":
    main()
