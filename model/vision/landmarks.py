"""Webcam frame -> normalised feature vector, using MediaPipe Tasks (hands + pose).

Feature per frame (100 numbers):
  pose  : nose, L/R shoulder, L/R elbow, L/R wrist  -> 7 x (x, y)  = 14
  hands : left 21 x (x, y), right 21 x (x, y)       -> 84
  flags : left hand seen, right hand seen            -> 2
Coordinates are centred on the shoulder midpoint and divided by shoulder width,
so distance from the camera and position in frame don't matter.
"""
import os
import urllib.request

import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "models")
MODELS = {
    "hand_landmarker.task": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
    "pose_landmarker_lite.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
}
POSE_IDX = [0, 11, 12, 13, 14, 15, 16]  # nose, shoulders, elbows, wrists
FEAT_DIM = len(POSE_IDX) * 2 + 2 * 21 * 2 + 2  # 100
N_FRAMES = 30  # every sign is resampled to this many frames


def ensure_models():
    os.makedirs(MODEL_DIR, exist_ok=True)
    for name, url in MODELS.items():
        path = os.path.join(MODEL_DIR, name)
        if not os.path.exists(path) or os.path.getsize(path) < 10_000:
            print(f"Downloading {name} ...")
            urllib.request.urlretrieve(url, path)


def features_from(pose_lms, hands, aspect):
    """pose_lms: list of 33 landmarks (or None). hands: list of (label, 21 landmarks).
    aspect: width / height of the frame. Returns (vec[100] or None, any_hand_seen)."""
    if not pose_lms:
        return None, bool(hands)

    def xy(lm):
        return np.array([lm.x * aspect, lm.y], dtype=np.float32)

    pose = np.stack([xy(pose_lms[i]) for i in POSE_IDX])
    origin = (pose[1] + pose[2]) / 2
    scale = float(np.linalg.norm(pose[1] - pose[2])) or 1.0

    left = np.zeros((21, 2), np.float32)
    right = np.zeros((21, 2), np.float32)
    seen = {"Left": 0.0, "Right": 0.0}
    for label, lms in hands:
        arr = np.stack([xy(p) for p in lms])
        arr = (arr - origin) / scale
        if label == "Left":
            left, seen["Left"] = arr, 1.0
        else:
            right, seen["Right"] = arr, 1.0

    pose = (pose - origin) / scale
    vec = np.concatenate([pose.ravel(), left.ravel(), right.ravel(),
                          [seen["Left"], seen["Right"]]]).astype(np.float32)
    return vec, bool(hands)


class Tracker:
    """Call .process(bgr_frame, timestamp_ms) once per frame."""

    def __init__(self):
        ensure_models()
        mode = vision.RunningMode.VIDEO
        self.hands = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=os.path.join(MODEL_DIR, "hand_landmarker.task")),
            running_mode=mode, num_hands=2,
            min_hand_detection_confidence=0.5, min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5))
        self.pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=os.path.join(MODEL_DIR, "pose_landmarker_lite.task")),
            running_mode=mode, num_poses=1))
        self._last_ts = -1

    def process(self, bgr, ts_ms):
        """Returns (vec or None, hands_seen, points_for_drawing)."""
        ts_ms = max(int(ts_ms), self._last_ts + 1)  # MediaPipe needs increasing timestamps
        self._last_ts = ts_ms
        rgb = bgr[:, :, ::-1].copy()
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        h_res = self.hands.detect_for_video(image, ts_ms)
        p_res = self.pose.detect_for_video(image, ts_ms)

        hands = []
        for lms, hd in zip(h_res.hand_landmarks, h_res.handedness):
            hands.append((hd[0].category_name, lms))
        pose_lms = p_res.pose_landmarks[0] if p_res.pose_landmarks else None

        h, w = bgr.shape[:2]
        vec, seen = features_from(pose_lms, hands, w / h)
        points = [(int(p.x * w), int(p.y * h)) for _, lms in hands for p in lms]
        if pose_lms:
            points += [(int(pose_lms[i].x * w), int(pose_lms[i].y * h)) for i in POSE_IDX]
        return vec, seen, points


def resample(seq, n=N_FRAMES):
    """(T, D) -> (n, D) by linear interpolation over time."""
    seq = np.asarray(seq, dtype=np.float32)
    if len(seq) == 1:
        return np.repeat(seq, n, axis=0)
    src = np.linspace(0, 1, len(seq))
    dst = np.linspace(0, 1, n)
    return np.stack([np.interp(dst, src, seq[:, d]) for d in range(seq.shape[1])], axis=1).astype(np.float32)


def enrich(seq, n=N_FRAMES):
    """Raw take (T, 100) -> model input (n, 372). Use this in train.py and live.py.

    The raw 100 numbers say where each hand is on the body, which is not enough to tell apart
    signs made in the same place. This adds:
      hand shape : each hand's 21 points measured from its own wrist and scaled by hand size,
                   so finger pose and wrist rotation show up whatever the hand's position
      fingertips : the gap between the two index fingertips (x, y, distance)
      movement   : how much every number changed since the previous frame
    Layout: 98 positions + 87 shape/fingertip + 185 movement + 2 hand-seen flags (kept last).
    """
    seq = np.asarray(seq, dtype=np.float32)
    T = len(seq)
    coords, flags = seq[:, :98], seq[:, 98:]
    seen = flags > 0.5                                   # (T, 2): left, right
    hands = coords[:, 14:].reshape(T, 2, 21, 2)
    wrist = hands[:, :, :1]
    size = np.linalg.norm(hands[:, :, 9] - hands[:, :, 0], axis=-1)   # wrist -> middle knuckle
    local = (hands - wrist) / np.maximum(size, 1e-3)[:, :, None, None]
    local[~seen] = 0.0
    both = seen[:, 0] & seen[:, 1]
    gap = hands[:, 0, 8] - hands[:, 1, 8]
    tips = np.concatenate([gap, np.linalg.norm(gap, axis=-1, keepdims=True)], axis=1)
    tips[~both] = 0.0
    base = np.concatenate([coords, local.reshape(T, 84), tips], axis=1)   # (T, 185)

    # which hand each column belongs to: -1 pose, 0 left, 1 right, 2 needs both
    owner = np.concatenate([np.full(14, -1), np.zeros(42), np.ones(42), np.zeros(42), np.ones(42), np.full(3, 2)])
    delta = np.zeros_like(base)
    if T > 1:
        delta[1:] = (base[1:] - base[:-1]) * 5.0
        for h in (0, 1):
            ok = seen[1:, h] & seen[:-1, h]
            delta[1:][np.ix_(~ok, owner == h)] = 0.0
        ok = both[1:] & both[:-1]
        delta[1:][np.ix_(~ok, owner == 2)] = 0.0
    return resample(np.concatenate([base, delta, flags], axis=1), n)


STILL_SPEED = 0.03   # average hand-point movement per frame (in shoulder widths) that counts as "holding still"
HOLD_FRAMES = 8      # this many still frames in a row ends a sign in hold mode (about half a second)


def hand_speed(prev, vec):
    """How far the hand points moved between two frames, averaged over hands seen in both. None if no hand."""
    if prev is None or vec is None:
        return None
    ok = (prev[98:] > 0.5) & (vec[98:] > 0.5)
    if not ok.any():
        return None
    d = np.linalg.norm((vec[14:98] - prev[14:98]).reshape(2, 21, 2), axis=-1)
    return float(d[ok].mean())


REST_LINE = 0.45     # this far below the shoulder line (in shoulder widths) is the rest zone


def hands_resting(vec):
    """True when every visible hand is down in the rest zone at the bottom of the picture."""
    if vec is None:
        return False
    seen = vec[98:] > 0.5
    if not seen.any():
        return False
    centre_y = vec[14:98].reshape(2, 21, 2)[:, :, 1].mean(axis=1)
    return bool((centre_y[seen] > REST_LINE).all())


def hold_cut(seq):
    """Where hold mode would end this take: the frame count up to the first held-still moment
    that comes after some movement. None if the take never holds still."""
    moved, run = False, 0
    for t in range(1, len(seq)):
        sp = hand_speed(seq[t - 1], seq[t])
        if sp is None:
            continue
        if sp >= STILL_SPEED:
            moved, run = True, 0
        else:
            run += 1
            if moved and run >= HOLD_FRAMES and t + 1 >= 6:
                return t + 1
    return None


class Segmenter:
    """Splits a stream of frames into signs.

    Default: a sign = frames while hands are visible. It ends after `sign_gap` seconds with no hands.
    Hold mode (hold=True): a sign also ends when the hands hold still for HOLD_FRAMES frames, so the
    signer can keep their hands in view and go straight on to the next sign.
    A phrase ends after `phrase_gap` seconds with no hands (or, in hold mode, with hands held still).
    """

    def __init__(self, sign_gap=0.3, phrase_gap=1.5, min_frames=6, hold=False):
        self.sign_gap, self.phrase_gap, self.min_frames, self.hold = sign_gap, phrase_gap, min_frames, hold
        self.frames, self.last_seen, self.phrase_open = [], None, False
        self.prev, self.moved, self.still_run = None, False, 0
        self.after_hold, self.last_sign_at = False, None

    def update(self, vec, hands_seen, now):
        """Returns ('sign', frames) | ('phrase_end', None) | (None, None)."""
        if hands_seen and vec is not None:
            self.last_seen = now
            if not self.hold:
                self.frames.append(vec)
                self.phrase_open = True
                return None, None

            speed = hand_speed(self.prev, vec)
            self.prev = vec
            if speed is None or speed >= STILL_SPEED:
                self.moved, self.still_run = True, 0
                self.frames.append(vec)
                self.phrase_open = True
                return None, None
            # holding still
            if not self.moved:
                # still resting on the last sign: nothing new yet. A long rest ends the phrase.
                if self.phrase_open and self.last_sign_at and now - self.last_sign_at >= self.phrase_gap:
                    self.phrase_open = False
                    self.frames = []
                    return "phrase_end", None
                return None, None
            self.frames.append(vec)
            self.still_run += 1
            if self.still_run >= HOLD_FRAMES and len(self.frames) >= self.min_frames:
                frames, self.frames = self.frames, []
                self.moved, self.still_run, self.after_hold, self.last_sign_at = False, 0, True, now
                return "sign", frames
            return None, None

        self.prev = None
        if self.last_seen is None:
            return None, None
        quiet = now - self.last_seen
        if self.frames and quiet >= self.sign_gap:
            frames, self.frames = self.frames, []
            was_after_hold, self.after_hold = self.after_hold, False
            self.moved, self.still_run = False, 0
            # after a held sign, a short burst that ends with the hands leaving is just the hands dropping
            if self.hold and was_after_hold and len(frames) < 12:
                return None, None
            if len(frames) >= self.min_frames:
                return "sign", frames
        if not self.frames:
            self.after_hold = False
        if self.phrase_open and not self.frames and quiet >= self.phrase_gap:
            self.phrase_open = False
            return "phrase_end", None
        return None, None
