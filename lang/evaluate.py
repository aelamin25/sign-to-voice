"""Compare translation setups on the 20 held-out pairs. This is your pitch slide.

    python evaluate.py                                # few-shot fallback only
    $env:ADAPTION_BASE="<base model id>"              # the open model AutoScientist started from
    $env:ADAPTION_FINETUNED="<your fine-tune id>"
    python evaluate.py --wandb                        # all setups, logged to W&B

Score = a judge model checks each output means the same as the reference (0-2), plus latency.
"""
import argparse
import json
import os
import statistics
import time

from translate import _chat, gloss_to_sentence

HERE = os.path.dirname(os.path.abspath(__file__))

JUDGE = (
    "Compare a candidate translation with the reference. Score 2 if it means the same thing and adds "
    "no facts, 1 if it's close but loses or adds a detail, 0 if wrong. Reply with the digit only."
)


def parse(prompt):
    doctor, tokens = None, []
    for line in prompt.splitlines():
        if line.startswith("Doctor: "):
            doctor = line[len("Doctor: "):]
        if line.startswith("Patient signs: "):
            tokens = line[len("Patient signs: "):].split()
    return tokens, doctor


def judge(ref, cand):
    out = _chat(JUDGE, [{"role": "user", "content": f"Reference: {ref}\nCandidate: {cand}"}], max_tokens=5)
    return int(out[0]) if out[:1].isdigit() else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wandb", action="store_true")
    args = ap.parse_args()

    with open(os.path.join(HERE, "data", "test.jsonl"), encoding="utf-8") as f:
        test = [json.loads(line) for line in f]

    setups = {"few-shot (general model)": ("fewshot", None)}
    if os.environ.get("ADAPTION_BASE"):
        setups["base model, no examples"] = ("zeroshot", os.environ["ADAPTION_BASE"])
    if os.environ.get("ADAPTION_FINETUNED"):
        setups["Adaption fine-tune"] = ("finetuned", os.environ["ADAPTION_FINETUNED"])

    rows, summary = [], {}
    for name, (backend, model) in setups.items():
        scores, lat = [], []
        for ex in test:
            tokens, doctor = parse(ex["prompt"])
            t = time.time()
            try:
                out = gloss_to_sentence(tokens, doctor, backend=backend, model=model)
            except Exception as e:
                out = f"ERROR {e}"
            lat.append(time.time() - t)
            s = judge(ex["completion"], out)
            scores.append(s)
            rows.append([name, " ".join(tokens), doctor or "", ex["completion"], out, s])
        summary[name] = {"meaning_score_pct": round(100 * sum(scores) / (2 * len(scores)), 1),
                         "median_latency_s": round(statistics.median(lat), 2)}
        print(f"{name:28s} meaning {summary[name]['meaning_score_pct']:5.1f}%   "
              f"median latency {summary[name]['median_latency_s']}s")

    with open(os.path.join(HERE, "data", "eval_results.json"), "w") as f:
        json.dump({"summary": summary, "rows": rows}, f, indent=2)
    print("details -> data/eval_results.json")

    if args.wandb:
        import wandb
        wandb.init(project="signvoice", job_type="eval")
        wandb.log({"examples": wandb.Table(columns=["setup", "gloss", "doctor", "reference", "output", "score"],
                                           data=rows)})
        wandb.log({f"{k}/{m}": v for k, d in summary.items() for m, v in d.items()})
        wandb.finish()


if __name__ == "__main__":
    main()
