"""Reads live.py's output and walks through the demo script, turn by turn.

Used by rehearse.sh. For each turn it shows what the doctor says and what to sign, checks the signs
that came back, shows the sentence, waits for a thumbs up, then speaks it with the Mac's own voice
(a stand-in for the real voice, so the loop can be rehearsed without the page or the backend).
"""
import json
import subprocess
import sys

SCRIPT = [
    ("Hello, I'm Dr Veer. What's brought you in today?", ["PAIN", "HEAD"], "I have a headache."),
    ("I'm sorry to hear that. How long has it been going on?", ["THREE", "DAY"], "About three days."),
    ("Have you taken any analgesia for it?", ["DONT-UNDERSTAND"], "Sorry, I don't understand."),
    ("Have you taken any painkillers, like paracetamol?", ["NO"], "No."),
    ("This sounds like a tension headache. Take paracetamol, and come back if it isn't better in a week.",
     ["THANK-YOU"], "Thank you."),
]


def show_turn(i):
    doctor, signs, _ = SCRIPT[i]
    print(f"\n--- Turn {i + 1} of {len(SCRIPT)} ---")
    print(f"VEER SAYS:   {doctor}")
    print(f"AHMED SIGNS: {' '.join(signs)}, thumbs up, hands down")


def main():
    turn, waiting, misses, done = 0, None, 0, set()
    log = open("rehearse_log.txt", "a")
    log.write("\n=== new rehearsal ===\n")
    print("Rehearsal started. Keep your hands out of the picture for 2 seconds first.")
    print("Press Q in the camera window to stop.")
    show_turn(turn)
    for line in sys.stdin:
        line = line.strip()
        if not line.startswith("{"):
            continue
        log.write(line + "\n")
        log.flush()
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        kind = msg.get("type")

        if kind == "ignored":
            print(f"             (saw a movement and ignored it as a fidget, {msg.get('conf')})")
            continue
        if kind == "sign" and msg.get("token") == "?":
            print(f"             (not sure: best guess {msg.get('guess')} at {msg.get('conf')}, below 0.7)")
            continue

        if waiting is not None:
            if kind == "sign" and msg.get("token") == "THUMBS-UP":
                sentence = SCRIPT[waiting][2]
                print(f"APPROVED.    Voice says: \"{sentence}\"")
                subprocess.run(["say", sentence], check=False)
                done.add(waiting)
                turn, waiting = waiting + 1, None
                if turn >= len(SCRIPT):
                    missing = [str(i + 1) for i in range(len(SCRIPT)) if i not in done]
                    print(f"\nEnd of script. Turns that needed another try: {misses}."
                          + (f" Turns never read: {', '.join(missing)}." if missing else " Every turn was read."))
                    print("Press Q in the camera window to close, or carry on for another run.")
                    turn, misses, done = 0, 0, set()
                show_turn(turn)
            elif kind == "phrase":
                got = [t for t in msg.get("tokens", []) if t != "THUMBS-UP"]
                if got:
                    print(f"             (read {' '.join(got)} while waiting for your approving thumbs up)")
            continue

        if kind == "phrase":
            got = [t for t in msg.get("tokens", []) if t not in ("THUMBS-UP", "?")]
            if not got:
                continue
            match = next((i for i, t in enumerate(SCRIPT) if t[1] == got), None)
            if match is None:
                misses += 1
                print(f"READ:        {' '.join(got)}   (not a turn in the script). Sign the turn again.")
                continue
            note = "right" if match == turn else f"this is turn {match + 1}, so turn {turn + 1} was missed"
            print(f"READ:        {' '.join(got)}   ({note})")
            print(f"ON SCREEN:   \"{SCRIPT[match][2]}\"")
            print("             Thumbs up to approve, then hands down.")
            waiting = match


if __name__ == "__main__":
    main()
