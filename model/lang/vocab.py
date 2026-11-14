# Keep in sync with vision/vocab.py
PATIENT_SIGNS = [
    "HELLO", "PAIN", "HEAD", "STOMACH", "CHEST", "YESTERDAY", "DAY", "THREE",
    "SLEEP", "CANT", "MEDICINE", "YES", "NO", "HELP", "THANK-YOU",
    "NONE", "DONT-UNDERSTAND",
]
APPROVE = "THUMBS-UP"  # approves the sentence on screen; never part of the gloss
UNKNOWN = "?"  # vision sends this when it isn't confident

# Signs D has recorded clips for (doctor -> patient direction)
REPLY_CLIPS = [
    "MEDICINE", "TAKE", "TWICE", "DAY", "REST", "WATER", "TEST", "BLOOD",
    "COME-BACK", "WEEK", "OK",
]
