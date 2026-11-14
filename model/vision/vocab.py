# Keep this list in sync with lang/vocab.py
SIGNS = [
    "HELLO", "PAIN", "HEAD", "STOMACH", "CHEST", "YESTERDAY", "DAY", "THREE",
    "SLEEP", "CANT", "MEDICINE", "YES", "NO", "HELP", "THANK-YOU",
    "THUMBS-UP",        # how the patient approves a sentence before it is spoken
    "DONT-UNDERSTAND",  # asks for the doctor's last reply again, in simpler words
    "NONE",             # the ASL sign for "nothing / none" (a real sign; FIDGET is the bin for non-signs)
]
FIDGET = "FIDGET"  # hands up but not signing (scratching face, waving, resting)
LABELS = SIGNS + [FIDGET]
