"""Live sign recognition.

    python live.py                          # prints one JSON line per sign and per phrase
    python live.py --translate              # also turns each phrase into English (needs ../lang + ANTHROPIC_API_KEY)
    python live.py --send http://localhost:8000/phrase --stream 8001 --no-window
                                            # for the web app: each sign, then the finished turn, to the
                                            # backend (model/backend); camera view inside the page
    python live.py --replay samples/*/take1.npy --send http://localhost:8000/phrase
                                            # no camera: plays recorded takes through the same code, to test the link

Sign one sign at a time: hands up, sign, hands down briefly (~0.3 s).
Rest your hands for ~1.5 s to finish the phrase.
Keys in the camera window: C clear   Q quit   (with --no-window there is no window: stop with Ctrl+C)
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


def same_signs(label):
    """The signs a label stands for, without a thumbs up that only ends the turn.
    "NO" and "NO+THUMBS-UP" are the same signs; "THUMBS-UP" on its own stays itself."""
    parts = [p for p in str(label).split("+") if p != APPROVE]
    return "+".join(parts) if parts else APPROVE


def read_answer(probs, labels):
    """Pick the answer. Labels that stand for the same signs share their confidence, so the model
    being torn between "NO" and "NO, thumbs up" no longer comes out as "not sure".
    Returns (the most likely label in the winning group, the group's total confidence)."""
    groups = {}
    for p, l in zip(probs, labels):
        groups[same_signs(l)] = groups.get(same_signs(l), 0.0) + float(p)
    best = max(groups, key=groups.get)
    top = max((float(p), str(l)) for p, l in zip(probs, labels) if same_signs(l) == best)[1]
    return top, min(1.0, groups[best])


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
        return read_answer(probs, self.labels)


class _Stream:
    """Latest camera frame as JPEG, served as an MJPEG stream (an <img> tag can show it)."""

    def __init__(self):
        self.jpeg, self.cond = b"", threading.Condition()

    def publish(self, frame):
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        if ok:
            with self.cond:
                self.jpeg = buf.tobytes()
                self.cond.notify_all()


def start_stream(port):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    stream = _Stream()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # keep the terminal quiet
            pass

        def do_GET(self):
            if not self.path.startswith("/video"):
                self.send_response(404)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            try:
                while True:
                    with stream.cond:
                        stream.cond.wait(timeout=1.0)
                        jpeg = stream.jpeg
                    if not jpeg:
                        continue
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                                     + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n")
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Camera stream: http://localhost:{port}/video", flush=True)
    return stream


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--threshold", type=float, default=0.7)
    ap.add_argument("--sign-gap", type=float, default=0.3)
    ap.add_argument("--phrase-gap", type=float, default=1.5)
    ap.add_argument("--send", default=None, help="URL to POST each phrase to")
    ap.add_argument("--translate", action="store_true")
    ap.add_argument("--stream", type=int, default=0, metavar="PORT",
                    help="serve the camera view (with tracking) at http://localhost:PORT/video for the web app")
    ap.add_argument("--no-window", action="store_true", help="don't open the OpenCV window (use with --stream)")
    ap.add_argument("--rest", action="store_true",
                    help="hands lowered below the yellow line count as resting, so they need not leave the picture")
    ap.add_argument("--plain", action="store_true",
                    help="camera window shows only the picture and the dots, no words (for the demo)")
    ap.add_argument("--face", action="store_true",
                    help="also read the face (question / strained / neutral) and send it with each turn; see face.py")
    ap.add_argument("--face-every", type=int, default=3, metavar="N",
                    help="read the face on every Nth camera frame (keeps the camera fast for the hands)")
    ap.add_argument("--expression", choices=["question", "strained", "neutral"],
                    help="with --replay: attach this expression to every replayed turn, to test the link")
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

    stream = start_stream(args.stream) if args.stream else None

    # The face, alongside the hands (optional). Readings taken while the hands are out of the picture
    # teach it this person's resting face; readings during a turn are compared with that.
    face_reader, resting_face, turn_face = None, None, []
    if args.face and not replaying:
        import face as face_mod
        face_reader, resting_face = face_mod.FaceReader(every=args.face_every), face_mod.Resting()

    def take_expression():
        """The expression for the turn that just ended, or None when the face isn't being read."""
        if replaying:
            return {"expression": args.expression} if args.expression else None
        if face_reader is None:
            return None
        if resting_face.n < 10:
            # not enough of this person's resting face seen yet to compare against: say nothing
            turn_face.clear()
            return None
        out = face_mod.summarise(turn_face, resting_face.get())
        turn_face.clear()
        return out

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

    # The team backend's /phrase takes both: each sign as it is recognised (the web app shows it
    # live as a chip) and then the finished turn. Its older /tokens only takes finished turns.
    signs_too = bool(args.send) and args.send.rstrip("/").endswith(("/phrase", "/api/signs"))

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

    def finish_phrase(toks, cs, expr=None):
        msg = {"type": "phrase", "tokens": toks, "confs": cs}
        if expr and expr.get("expression") in ("question", "strained", "neutral"):
            msg["expression"] = expr["expression"]
            if "frames" in expr:
                msg["expression_detail"] = {k: expr[k] for k in ("brows_up", "strain", "frames")}
        print(json.dumps(msg), flush=True)
        post(msg)
        if translate:
            status["sentence"] = "..."
            status["sentence"] = translate(toks)
            print(json.dumps({"type": "sentence", "text": status["sentence"]}), flush=True)

    for frame, now, vec, hands_seen, points in (replay_frames() if replaying else camera_frames()):
        resting = args.rest and hands_resting(vec)
        if face_reader is not None and frame is not None:
            reading = face_reader.process(frame, now * 1000)
            if reading:
                if hands_seen and not resting:
                    turn_face.append(reading)
                elif not tokens:
                    # between turns only: a gap inside a turn still carries the turn's expression
                    resting_face.update(reading)
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
                    background(finish_phrase, tokens, confs, take_expression())
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
                def send_all(ms=msgs, done=(list(tokens), list(confs), take_expression()) if ends_turn else None):
                    for m in ms if signs_too else []:
                        post(m)
                    if done:
                        finish_phrase(*done)
                background(send_all)
                if ends_turn:
                    print(json.dumps({"type": "turn_done", "by": APPROVE, "conf": round(conf, 2)}), flush=True)
                    tokens, confs = [], []
        elif event == "phrase_end":
            if tokens:
                background(finish_phrase, tokens, confs, take_expression())
                tokens, confs = [], []
            else:
                turn_face.clear()  # a fidget or a flicker: its face readings must not colour the next turn

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
        if stream is not None:
            stream.publish(frame)
        if args.no_window:
            continue
        cv2.imshow("live", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("c"):
            tokens, confs, status["sentence"] = [], [], ""
            turn_face.clear()

    if cap is not None:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
