"""Record training takes for every sign.

    python collect.py --signer ahmed            # walks through every label
    python collect.py --signer shruti --labels HEAD PAIN --takes 20

Keys:  SPACE record a take   S skip to next sign   B delete last take   Q quit
For a sign: press SPACE with hands down, then sign; it stops when your hands go down.
For FIDGET: press SPACE and fidget naturally (scratch face, adjust hair) for 2 seconds.
Saves data/<LABEL>/<signer>_<ms>.npy with shape (frames, 100).
"""
import argparse
import os
import time

import cv2
import numpy as np

from landmarks import Tracker
from vocab import LABELS, FIDGET

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--signer", required=True)
    ap.add_argument("--labels", nargs="*", default=LABELS)
    ap.add_argument("--takes", type=int, default=30)
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--out", default=os.path.join(HERE, "data"))
    args = ap.parse_args()

    tracker = Tracker()
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit("Can't open the camera. On Mac: System Settings > Privacy > Camera > allow Terminal/VS Code.")

    t0 = time.time()
    li, last_saved = 0, None
    state, frames, rec_start, last_hand = "idle", [], 0.0, None

    while li < len(args.labels):
        label = args.labels[li]
        folder = os.path.join(args.out, label)
        os.makedirs(folder, exist_ok=True)
        count = len([f for f in os.listdir(folder) if f.startswith(args.signer + "_")])

        ok, frame = cap.read()
        if not ok:
            continue
        frame = cv2.flip(frame, 1)
        now = time.time()
        vec, hands_seen, points = tracker.process(frame, (now - t0) * 1000)

        if state == "recording":
            if label == FIDGET:
                # keep only frames with a hand in view, because that is all live.py ever sees
                if hands_seen and vec is not None:
                    frames.append(vec)
                done = now - rec_start >= 2.0
            else:
                if hands_seen and vec is not None:
                    frames.append(vec)
                    last_hand = now
                done = (last_hand is not None and now - last_hand >= 0.3) or now - rec_start >= 12.0
            if done:
                if len(frames) >= 6:
                    path = os.path.join(folder, f"{args.signer}_{int(now * 1000)}.npy")
                    np.save(path, np.stack(frames))
                    last_saved = path
                    count += 1
                    print(f"saved {label} #{count} ({len(frames)} frames)")
                else:
                    print("too short, not saved: make sure your hands are in view")
                state, frames = "idle", []
                if count >= args.takes:
                    li += 1
                    continue

        for p in points:
            cv2.circle(frame, p, 2, (0, 255, 0), -1)
        colour = (0, 0, 255) if state == "recording" else (255, 255, 255)
        cv2.putText(frame, f"{label}  {count}/{args.takes}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, colour, 3)
        msg = "RECORDING" if state == "recording" else "SPACE record | S skip | B undo | Q quit"
        cv2.putText(frame, msg, (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7, colour, 2)
        if vec is None:
            cv2.putText(frame, "Body not visible: sit back so shoulders are in frame", (20, 115),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2)
        cv2.imshow("collect", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("s"):
            li += 1
        if key == ord("b") and last_saved and os.path.exists(last_saved):
            os.remove(last_saved)
            print("deleted", last_saved)
            last_saved = None
        if key == ord(" ") and state == "idle":
            state, frames, rec_start, last_hand = "recording", [], now, None

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
