"""Grow the seed data with extra gloss -> English pairs that ONLY use our 15 signs.

    python expand_seed.py            # ~300 new pairs -> data/train_expanded.jsonl (seed + new)
    python expand_seed.py --n 500
    python expand_seed.py --append --focus demo --n 80   # keep existing rows, add demo-focused ones

Uses the general model from translate.py (Claude if LLM_PROVIDER=anthropic).
Every generated pair is checked: only known signs, one short sentence, no copies of the test set.
"""
import argparse
import json
import os
import random

from prompt_format import format_prompt
from translate import _chat
from vocab import PATIENT_SIGNS, UNKNOWN

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

GEN_SYSTEM = (
    "You write training data for an app that voices what a Deaf patient signs to their doctor at a GP clinic. "
    "Each example: the ASL gloss the sign recogniser produced, optionally the doctor's previous line, and what "
    "the patient means as ONE short, natural, first-person spoken English sentence (max 15 words). "
    "Never add facts that are not in the signs. Use ASL-like order sometimes (time or topic first). "
    "Output JSON lines only, one object per line: "
    '{"gloss": "HEAD PAIN", "doctor": null, "patient": "I have a headache."}'
)


def load(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def parse_prompt(p):
    doctor, gloss = None, None
    for line in p.splitlines():
        if line.startswith("Doctor: "):
            doctor = line[8:]
        if line.startswith("Patient signs: "):
            gloss = line[15:]
    return gloss, doctor


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=300)
    ap.add_argument("--batch", type=int, default=25)
    ap.add_argument("--append", action="store_true", help="keep data/train_expanded.jsonl and add to it")
    ap.add_argument("--focus", choices=["all", "demo"], default="all")
    args = ap.parse_args()

    seed = load(os.path.join(DATA, "train.jsonl"))
    test = load(os.path.join(DATA, "test.jsonl"))
    allowed = set(PATIENT_SIGNS) | {UNKNOWN}
    out_path = os.path.join(DATA, "train_expanded.jsonl")
    existing = load(out_path) if args.append and os.path.exists(out_path) else []
    seen = {r["prompt"] for r in seed} | {r["prompt"] for r in test} | {r["prompt"] for r in existing}
    examples = "\n".join(
        json.dumps({"gloss": g, "doctor": d, "patient": r["completion"]})
        for r in random.Random(0).sample(seed, 15) for g, d in [parse_prompt(r["prompt"])])

    themes = [
        "first greeting and reason for visit", "headache details", "stomach pain details", "chest pain details",
        "sleep problems", "medicine already taken or not", "how long symptoms have lasted",
        "short yes/no answers to many different doctor questions", "asking for help or saying thank you",
        "combinations of two symptoms", "the recogniser missed a sign ('?') or repeated one",
        "answers to 'where does it hurt' and 'when did it start'",
    ]
    if args.focus == "demo":
        themes = [
            "a GP headache consultation: reason for visit, how long, warning signs, what they've tried, the plan",
            "NONE as the answer to many different 'any other symptoms / changes / medication?' questions",
            "DONT-UNDERSTAND after the doctor uses medical jargon (analgesia, photophobia, nausea, bilateral...)",
            "NO and YES answers to questions about painkillers, paracetamol and medicine, using the doctor's words",
            "THANK-YOU after the doctor gives advice or a plan",
            "THREE DAY and other short answers to 'how long' questions",
        ]
    new, attempts = [], 0
    while len(new) < args.n and attempts < args.n // args.batch * 3 + 3:
        attempts += 1
        theme = themes[attempts % len(themes)]
        prompt = (f"Signs you may use (nothing else): {', '.join(PATIENT_SIGNS)}, and '?' for an unrecognised sign.\n"
                  f"Examples:\n{examples}\n\nWrite {args.batch} NEW, varied examples. Focus: {theme}. "
                  "About a third should include a realistic doctor line.")
        out = _chat(GEN_SYSTEM, [{"role": "user", "content": prompt}], max_tokens=4000)
        kept = 0
        for line in out.splitlines():
            line = line.strip().strip(",")
            if not line.startswith("{"):
                continue
            try:
                ex = json.loads(line)
                tokens = ex["gloss"].upper().split()
                sentence = ex["patient"].strip()
            except (ValueError, KeyError, AttributeError):
                continue
            if not tokens or any(t not in allowed for t in tokens):
                continue
            if not sentence or len(sentence.split()) > 20 or "\n" in sentence:
                continue
            p = format_prompt(tokens, ex.get("doctor") or None)
            if p in seen:
                continue
            seen.add(p)
            new.append({"prompt": p, "completion": sentence})
            kept += 1
        print(f"batch {attempts} ({theme}): kept {kept}, total {len(new)}")

    if existing:
        have = {r["prompt"] for r in existing}
        rows = existing + [r for r in seed if r["prompt"] not in have] + new[:args.n]
    else:
        rows = seed + new[:args.n]
    random.Random(1).shuffle(rows)
    with open(out_path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"{len(rows)} rows -> {out_path}")
    print("Spot-check a few:")
    for r in random.Random(2).sample(new, min(5, len(new))):
        print(" ", r["prompt"].replace("\n", " | "), "->", r["completion"])


if __name__ == "__main__":
    main()
