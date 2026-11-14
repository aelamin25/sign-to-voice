"""Adaption pipeline: seed data -> adapted + augmented dataset -> AutoScientist fine-tune.

Windows PowerShell:  $env:ADAPTION_API_KEY="pt_live_..."
Windows cmd:         set ADAPTION_API_KEY=pt_live_...

Run these in order (each is safe to re-run; ids are saved in data/adaption_state.json):
    python adaption_pipeline.py upload [file]     # upload data/train.jsonl (or e.g. data/train_expanded.jsonl)
    python adaption_pipeline.py adapt --estimate  # how many credits / minutes it will take
    python adaption_pipeline.py adapt             # clean + improve the rows
    python adaption_pipeline.py augment 400 --estimate
    python adaption_pipeline.py augment 400       # grow it with ~400 similar rows
    python adaption_pipeline.py wait              # block until processing finishes
    python adaption_pipeline.py use <dataset_id>  # point later steps at a different dataset
    python adaption_pipeline.py evaluate          # quality score before/after  -> pitch number
    python adaption_pipeline.py download          # data/adapted.jsonl, rows with unknown signs filtered out
    python adaption_pipeline.py models            # base models you can fine-tune
    python adaption_pipeline.py train [model_id]  # start AutoScientist fine-tune (default model if omitted)
    python adaption_pipeline.py status            # progress, best win rate
    python adaption_pipeline.py artifact          # download the trained model -> data/model_artifact.*
"""
import json
import os
import sys

from vocab import PATIENT_SIGNS, UNKNOWN

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
STATE = os.path.join(DATA, "adaption_state.json")
MAPPING = {"prompt": "prompt", "completion": "completion"}
MAX_WORDS = 25  # the patient speaks one short sentence, never an explanation

# Without this, Adaption "improves" one-line answers into 150-word explanations.
BRAND = {
    "length": "minimal",
    "blueprint": (
        "Each row turns ASL gloss from a sign recogniser into what a Deaf patient says to their doctor. "
        "The completion is ONLY the patient's own words: one short, natural, first-person spoken sentence, "
        "at most 15 words. No explanation, no analysis, no lists, no markdown, no quotation marks. "
        "Never add symptoms, times or facts that are not in the signs. "
        "Keep the 'Patient signs:' line exactly as written; never invent new signs."
    ),
}
RECIPES = {"recipes": {"prompt_rephrase": False, "reasoning_traces": False, "deduplication": True}}


def load_state():
    if os.path.exists(STATE):
        with open(STATE) as f:
            return json.load(f)
    return {}


def save_state(s):
    os.makedirs(DATA, exist_ok=True)
    with open(STATE, "w") as f:
        json.dump(s, f, indent=2)


def show(obj):
    print(obj.model_dump_json(indent=2) if hasattr(obj, "model_dump_json") else obj)


def gloss_ok(prompt):
    import re
    allowed = set(PATIENT_SIGNS) | {UNKNOWN}
    m = re.search(r"Patient signs:\s*(.*?)\s*(?:Patient means|$)", prompt, re.S)
    if not m or not m.group(1).split():
        return False
    return all(t in allowed for t in m.group(1).split())


def main():
    args = sys.argv[1:]
    cmd = args[0] if args else "help"
    if cmd not in {"upload", "adapt", "augment", "use", "wait", "evaluate", "download", "models", "train", "status",
                   "artifact"}:
        print(__doc__)
        return
    from adaption import Adaption
    c = Adaption()  # reads ADAPTION_API_KEY
    estimate = "--estimate" in args
    s = load_state()
    ds = s.get("dataset_id")

    if cmd == "upload":
        path = args[1] if len(args) > 1 and not args[1].startswith("--") else os.path.join(DATA, "train.jsonl")
        name = "signvoice-" + os.path.splitext(os.path.basename(path))[0]
        res = c.datasets.upload_file(path, name=name)
        print("uploaded", path)
        s["dataset_id"] = res.dataset_id
        save_state(s)
        print("dataset_id:", res.dataset_id)

    elif cmd == "adapt":
        show(c.datasets.run(ds, column_mapping=MAPPING, training_type="instruction_dataset",
                            brand_controls=BRAND, recipe_specification=RECIPES, estimate=estimate))

    elif cmd == "augment":
        n = int(args[1]) if len(args) > 1 and args[1].isdigit() else 400
        res = c.datasets.augment(ds, similar_rows=n, training_type="instruction_dataset", estimate=estimate)
        show(res)
        if not estimate and res.dataset_id and res.dataset_id != ds:
            # augment writes a NEW dataset: later steps (wait/evaluate/download/train) use it
            s["adapted_dataset_id"], s["dataset_id"] = ds, res.dataset_id
            save_state(s)
            print(f"switched to augmented dataset {res.dataset_id} (original kept as adapted_dataset_id)")

    elif cmd == "use":
        s["dataset_id"] = args[1]
        save_state(s)
        print("now using dataset", args[1])

    elif cmd == "wait":
        show(c.datasets.wait_for_completion(ds, timeout=3600))

    elif cmd == "evaluate":
        ev = c.datasets.wait_for_evaluation(ds, timeout=1800)
        with open(os.path.join(DATA, "adaption_evaluation.json"), "w") as f:
            f.write(ev.model_dump_json(indent=2))
        q = ev.quality
        if q:
            print(f"Quality: {q.grade_before} ({q.score_before}) -> {q.grade_after} ({q.score_after}), "
                  f"improvement {q.improvement_percent}%")
        else:
            show(ev)

    elif cmd == "download":
        raw = os.path.join(DATA, "adapted_raw.jsonl")
        c.datasets.download(ds, file_format="jsonl").write_to_file(raw)
        kept, why = [], {"unknown signs": 0, "too long": 0, "missing": 0}
        with open(raw, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                row = json.loads(line)
                # Adaption returns original_* and enhanced_* columns; older exports use prompt/completion
                p = row.get("enhanced_prompt") or row.get("original_prompt") or row.get("prompt") or ""
                options = [row.get("enhanced_completion"), row.get("original_completion"), row.get("completion")]
                options = [o.strip() for o in options if o and o.strip()]
                if not p or not options:
                    why["missing"] += 1
                    continue
                if not gloss_ok(p):
                    why["unknown signs"] += 1
                    continue
                short = [o for o in options if len(o.split()) <= MAX_WORDS and "\n" not in o]
                if not short:
                    why["too long"] += 1
                    continue
                kept.append({"prompt": p, "completion": short[0]})
        with open(os.path.join(DATA, "adapted.jsonl"), "w", encoding="utf-8") as f:
            for r in kept:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"kept {len(kept)} rows; dropped: {why}")
        print("Examples:")
        for r in kept[:5]:
            print("  ", r["prompt"].replace("\n", " | "), "->", r["completion"])

    elif cmd == "models":
        show(c.autoscientist.list_models())

    elif cmd == "train":
        model = args[1] if len(args) > 1 and not args[1].startswith("--") else None
        kw = {"dataset_id": ds, "training_method": "instruction", "column_mapping": MAPPING}
        if model:
            kw["model"] = model
        print("Recommended hyperparams:")
        show(c.autoscientist.recommend_hyperparams(dataset_id=ds, **({"model": model} if model else {})))
        run = c.autoscientist.create(**kw)
        s["experiment_id"] = run.id
        save_state(s)
        show(run)

    elif cmd == "status":
        run = c.autoscientist.get(s["experiment_id"])
        print(f"{run.status}  base={run.model}  iterations {run.iterations_completed}/{run.max_iterations}  "
              f"best win rate {run.best_win_rate}  download ready: {run.download_available}")
        if run.error:
            print("error:", run.error)

    elif cmd == "artifact":
        out = os.path.join(DATA, "model_artifact.bin")
        c.autoscientist.download(s["experiment_id"]).write_to_file(out)
        print("saved", out, "- check its format (zip/tar of weights or a LoRA adapter) before serving")

    else:
        print(__doc__)


if __name__ == "__main__":
    main()
