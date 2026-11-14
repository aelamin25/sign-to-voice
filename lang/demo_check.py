"""Run the demo script through the model, in order, exactly as it will happen on stage.

    python demo_check.py                                  # current backend (few-shot by default)
    python demo_check.py --backend finetuned              # your Adaption fine-tune (needs ADAPTION_MODEL)
    python demo_check.py --spare                          # include the spare sleep line
    python demo_check.py --runs 3                         # repeat to check the answers are stable

Edit SCRIPT below whenever Veer changes a line.
"""
import argparse
import time

from translate import gloss_to_sentence, simplify

# (doctor's line, signs, what the script expects the voice to say)
SCRIPT = [
    ("Hello, I'm Dr Veer. What's brought you in today?", "PAIN HEAD", "I have a headache."),
    ("I'm sorry to hear that. How long has it been going on?", "THREE DAY", "For three days."),
    ("Any changes to your vision, or feeling sick?", "NONE", "None."),
    ("Have you taken any analgesia for it?", "DONT-UNDERSTAND", "Sorry, I don't understand."),
    (None, "NO", "No."),  # doctor line = the simplified caption
    ("This sounds like a tension headache. Take paracetamol, and come back if it isn't better in a week.",
     "THANK-YOU", "Thank you."),
]
SPARE = ("How have you been sleeping?", "CANT SLEEP", "I can't sleep.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", default=None, help="fewshot | finetuned | zeroshot (default: TRANSLATE_BACKEND)")
    ap.add_argument("--spare", action="store_true")
    ap.add_argument("--runs", type=int, default=1)
    args = ap.parse_args()

    script = list(SCRIPT)
    if args.spare:
        script.insert(3, SPARE)

    for run in range(args.runs):
        print(f"\n=== run {run + 1} ===")
        last_doctor, slow = None, []
        for doctor, signs, expected in script:
            if doctor:
                last_doctor = doctor
                print(f"\nDOCTOR:  {doctor}")
            t = time.time()
            said = gloss_to_sentence(signs.split(), last_doctor, backend=args.backend)
            dt = time.time() - t
            slow += [dt] if dt > 2.0 else []
            flag = "" if said.strip().lower().rstrip(".") == expected.lower().rstrip(".") else "   <- differs from script"
            print(f"PATIENT: {signs:16s} -> \"{said}\"  ({dt:.1f}s){flag}")
            if "DONT-UNDERSTAND" in signs.split() and last_doctor:
                t = time.time()
                last_doctor = simplify(last_doctor)
                print(f"CAPTION REWRITTEN ({time.time() - t:.1f}s): {last_doctor}")
        if slow:
            print(f"\n{len(slow)} answers took over 2 s: on stage that's a noticeable pause.")
    print("\n'Differs from script' is fine if it still makes sense: just update the script or the expected line.")


if __name__ == "__main__":
    main()
