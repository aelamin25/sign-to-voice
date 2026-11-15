"""Reading the face as well as the hands (optional: live.py --face).

In sign language the face is part of the grammar: raised eyebrows mark a yes/no question, and a
strained face (furrowed brows, narrowed eyes) says "a lot" or "it's bad". Hands alone lose that.

This uses MediaPipe's ready-made face model, which scores expressions ("blendshapes") from 0 to 1,
so there is nothing to train. For each turn it reports one of:

    neutral    nothing notable
    question   eyebrows clearly raised compared with this person's resting face
    strained   brows furrowed and eyes narrowed compared with their resting face

How it decides: it learns the person's resting face from frames where their hands are out of the
picture, then for a turn it looks at how far the face moved from that resting face on average.

Status: the deciding logic below is tested with made-up numbers. It has NOT been tried on a real
face yet, and the two cut-offs (QUESTION_AT, STRAINED_AT) will need adjusting on a real person.
It is off unless live.py is started with --face, and it only looks at the face every few frames so
the camera does not slow down and upset the sign recogniser.
"""
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "models", "face_landmarker.task")
MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/"
             "float16/latest/face_landmarker.task")

# The blendshape scores we use, grouped into the three things we care about.
BROWS_UP = ("browInnerUp", "browOuterUpLeft", "browOuterUpRight")
FURROW = ("browDownLeft", "browDownRight")
SQUINT = ("eyeSquintLeft", "eyeSquintRight")
FROWN = ("mouthFrownLeft", "mouthFrownRight")
USED = BROWS_UP + FURROW + SQUINT + FROWN

QUESTION_AT = 0.25   # brows this much higher than resting, on average over the turn
STRAINED_AT = 0.20   # the furrow/squint/frown mix this much above resting
MIN_FRAMES = 3       # fewer face readings than this in a turn: say nothing


def _mean(scores, names):
    vals = [scores[n] for n in names if n in scores]
    return sum(vals) / len(vals) if vals else 0.0


def measures(scores):
    """One face reading -> the three numbers we use."""
    return {
        "brows_up": _mean(scores, BROWS_UP),
        "strain": 0.5 * _mean(scores, FURROW) + 0.3 * _mean(scores, SQUINT) + 0.2 * _mean(scores, FROWN),
    }


class Resting:
    """This person's resting face: a slow-moving average of readings taken while they are not signing."""

    def __init__(self, rate=0.05):
        self.rate, self.value, self.n = rate, None, 0

    def update(self, scores):
        if not scores:
            return
        m = measures(scores)
        self.n += 1
        if self.value is None:
            self.value = dict(m)
        else:
            for k in m:
                self.value[k] += self.rate * (m[k] - self.value[k])

    def get(self):
        return self.value or {"brows_up": 0.0, "strain": 0.0}


def summarise(turn_readings, resting, question_at=QUESTION_AT, strained_at=STRAINED_AT):
    """Readings from one turn + the resting face -> {"expression": ..., "brows_up": .., "strain": .., "frames": n}.

    The numbers are how far above resting the face was, averaged over the turn (never below 0)."""
    readings = [r for r in turn_readings if r]
    if len(readings) < MIN_FRAMES:
        return {"expression": "unknown", "brows_up": 0.0, "strain": 0.0, "frames": len(readings)}
    ms = [measures(r) for r in readings]
    up = max(0.0, sum(m["brows_up"] for m in ms) / len(ms) - resting["brows_up"])
    strain = max(0.0, sum(m["strain"] for m in ms) / len(ms) - resting["strain"])
    is_q, is_s = up >= question_at, strain >= strained_at
    if is_q and is_s:
        label = "question" if up / question_at >= strain / strained_at else "strained"
    else:
        label = "question" if is_q else "strained" if is_s else "neutral"
    return {"expression": label, "brows_up": round(up, 2), "strain": round(strain, 2), "frames": len(readings)}


class FaceReader:
    """Wraps MediaPipe's face model. .process(bgr_frame, timestamp_ms) returns a dict of scores,
    or None on frames it skips or when no face is found."""

    def __init__(self, every=3):
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        if not os.path.exists(MODEL_PATH) or os.path.getsize(MODEL_PATH) < 10_000:
            print("Downloading face_landmarker.task (about 4 MB, from Google's MediaPipe models) ...", flush=True)
            urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        self._mp = mp
        self.model = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=vision.RunningMode.VIDEO, num_faces=1, output_face_blendshapes=True))
        self.every, self._count, self._last_ts = max(1, every), 0, -1

    def process(self, bgr, ts_ms):
        self._count += 1
        if self._count % self.every:
            return None
        ts_ms = max(int(ts_ms), self._last_ts + 1)
        self._last_ts = ts_ms
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=bgr[:, :, ::-1].copy())
        res = self.model.detect_for_video(image, ts_ms)
        if not res.face_blendshapes:
            return None
        return {c.category_name: float(c.score) for c in res.face_blendshapes[0] if c.category_name in USED}


if __name__ == "__main__":
    # The deciding logic, checked with made-up readings (no camera, no model).
    rest = Resting()
    for _ in range(40):
        rest.update({"browInnerUp": 0.10, "browOuterUpLeft": 0.05, "browOuterUpRight": 0.05,
                     "browDownLeft": 0.05, "browDownRight": 0.05, "eyeSquintLeft": 0.10, "eyeSquintRight": 0.10,
                     "mouthFrownLeft": 0.02, "mouthFrownRight": 0.02})
    r = rest.get()
    calm = [{"browInnerUp": 0.12, "browOuterUpLeft": 0.06, "browOuterUpRight": 0.06, "browDownLeft": 0.06,
             "browDownRight": 0.06, "eyeSquintLeft": 0.12, "eyeSquintRight": 0.1, "mouthFrownLeft": 0.02,
             "mouthFrownRight": 0.03}] * 6
    asking = [{"browInnerUp": 0.7, "browOuterUpLeft": 0.5, "browOuterUpRight": 0.5, "browDownLeft": 0.02,
               "browDownRight": 0.02, "eyeSquintLeft": 0.05, "eyeSquintRight": 0.05, "mouthFrownLeft": 0.02,
               "mouthFrownRight": 0.02}] * 6
    hurting = [{"browInnerUp": 0.2, "browOuterUpLeft": 0.02, "browOuterUpRight": 0.02, "browDownLeft": 0.6,
                "browDownRight": 0.6, "eyeSquintLeft": 0.5, "eyeSquintRight": 0.5, "mouthFrownLeft": 0.3,
                "mouthFrownRight": 0.3}] * 6
    assert summarise(calm, r)["expression"] == "neutral", summarise(calm, r)
    assert summarise(asking, r)["expression"] == "question", summarise(asking, r)
    assert summarise(hurting, r)["expression"] == "strained", summarise(hurting, r)
    assert summarise(asking[:2], r)["expression"] == "unknown"
    assert summarise([None, None], r)["expression"] == "unknown"
    # someone whose resting face is already a frown must not read as strained all the time
    grumpy = Resting()
    for _ in range(40):
        grumpy.update(hurting[0])
    assert summarise(hurting, grumpy.get())["expression"] == "neutral"
    print("face.py: deciding logic checks pass")
    for name, turn in (("calm", calm), ("asking", asking), ("hurting", hurting)):
        print(f"  {name:8s} -> {summarise(turn, r)}")
