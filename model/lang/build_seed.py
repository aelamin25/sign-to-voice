"""Builds the gloss -> English seed data for Adaption and the held-out test set.

    python build_seed.py

Writes data/train.jsonl (for Adaption), data/test.jsonl (never uploaded, used by evaluate.py)
and data/train.csv (same as train.jsonl, in case the upload prefers CSV).
Each row: {"prompt": "<formatted gloss + context>", "completion": "<English>"}.
Add more pairs to PAIRS whenever you think of them. Only use tokens from vocab.py.
"""
import csv
import json
import os
import random

from prompt_format import format_prompt
from vocab import PATIENT_SIGNS, UNKNOWN

HERE = os.path.dirname(os.path.abspath(__file__))

# (gloss, doctor's last line or None, what the patient means)
PAIRS = [
    ("HELLO", None, "Hello."),
    ("HELLO HELP", None, "Hello, I need some help."),
    ("HEAD PAIN", None, "I have a headache."),
    ("PAIN HEAD", None, "I have a headache."),
    ("HEAD PAIN THREE DAY", None, "I've had a headache for three days."),
    ("HEAD PAIN YESTERDAY", None, "My head has been hurting since yesterday."),
    ("STOMACH PAIN", None, "I have stomach pain."),
    ("STOMACH PAIN YESTERDAY", None, "My stomach has been hurting since yesterday."),
    ("STOMACH PAIN THREE DAY", None, "I've had stomach pain for three days."),
    ("CHEST PAIN", None, "I have chest pain."),
    ("CHEST PAIN YESTERDAY", None, "I've had chest pain since yesterday."),
    ("CHEST PAIN THREE DAY", None, "I've had chest pain for three days."),
    ("SLEEP CANT", None, "I can't sleep."),
    ("CANT SLEEP", None, "I can't sleep."),
    ("SLEEP CANT THREE DAY", None, "I haven't been able to sleep for three days."),
    ("HEAD PAIN SLEEP CANT", None, "I have a headache and I can't sleep."),
    ("STOMACH PAIN SLEEP CANT", None, "My stomach hurts so much I can't sleep."),
    ("CHEST PAIN SLEEP CANT", None, "My chest hurts and I can't sleep."),
    ("MEDICINE", "What do you need today?", "I need some medicine."),
    ("MEDICINE HELP", None, "Can you help me with my medicine?"),
    ("MEDICINE NO", None, "I haven't taken any medicine."),
    ("NO MEDICINE", None, "I haven't taken any medicine."),
    ("MEDICINE YESTERDAY", None, "I took some medicine yesterday."),
    ("MEDICINE YES", "Have you taken any medicine?", "Yes, I've taken some medicine."),
    ("YES", "Have you taken any medicine?", "Yes, I have."),
    ("NO", "Have you taken any medicine?", "No, I haven't."),
    ("YES", "Does it hurt here?", "Yes, it hurts there."),
    ("NO", "Does it hurt here?", "No, it doesn't hurt there."),
    ("YES", "Are you sleeping okay?", "Yes, I'm sleeping okay."),
    ("NO", "Are you sleeping okay?", "No, I'm not sleeping well."),
    ("NO SLEEP CANT", "Are you sleeping okay?", "No, I can't sleep."),
    ("YES", "Is this your first visit?", "Yes, it is."),
    ("NO", "Do you have any allergies?", "No, I don't have any allergies."),
    ("THREE DAY", "How long has this been going on?", "For three days."),
    ("YESTERDAY", "When did it start?", "It started yesterday."),
    ("THREE DAY", "When did it start?", "It started three days ago."),
    ("HEAD", "Where does it hurt?", "My head."),
    ("STOMACH", "Where does it hurt?", "In my stomach."),
    ("CHEST", "Where does it hurt?", "In my chest."),
    ("HEAD STOMACH", "Where does it hurt?", "My head and my stomach."),
    ("THANK-YOU", None, "Thank you."),
    ("THANK-YOU HELP", None, "Thank you for your help."),
    ("YES THANK-YOU", "Shall I prescribe something for you?", "Yes, please. Thank you."),
    ("HELP", None, "I need help."),
    ("HELP PAIN", None, "Please help, I'm in pain."),
    ("PAIN", "How are you feeling today?", "I'm in pain."),
    ("HELLO HEAD PAIN", "Hello, what brings you in today?", "Hello, I have a headache."),
    ("HELLO STOMACH PAIN", "Hello, what brings you in today?", "Hello, I've got stomach pain."),
    ("HELLO CHEST PAIN", "What brings you in today?", "Hello. I have chest pain."),
    ("HEAD PAIN STOMACH PAIN", None, "I have a headache and stomach pain."),
    ("YESTERDAY HEAD PAIN", None, "I've had a headache since yesterday."),
    ("THREE DAY STOMACH PAIN", None, "I've had stomach pain for three days."),
    ("THREE DAY HEAD PAIN", None, "My head has been hurting for three days."),
    ("PAIN THREE", "On a scale of one to ten, how bad is the pain?", "About a three."),
    ("THREE", "How many tablets do you take a day?", "Three."),
    ("MEDICINE THREE DAY", None, "I've been taking medicine for three days."),
    ("MEDICINE HELP NO", None, "The medicine hasn't helped."),
    ("SLEEP NO", "Did you sleep last night?", "No, I didn't sleep."),
    ("YESTERDAY SLEEP CANT", None, "I couldn't sleep yesterday."),
    ("PAIN YES", "Does it still hurt?", "Yes, it still hurts."),
    ("NO PAIN", "Does it still hurt?", "No, it doesn't hurt anymore."),
    ("PAIN NO", None, "I'm not in pain."),
    ("YES HELP", "Would you like me to explain the treatment?", "Yes, please."),
    ("YES CHEST", "Is the pain in your chest?", "Yes, in my chest."),
    ("NO STOMACH", "Is the pain in your stomach?", "No, not my stomach."),
    ("NO HEAD", "Do you have a headache?", "No, I don't have a headache."),
    ("YES HEAD PAIN", "Do you have a headache?", "Yes, I have a headache."),
    ("MEDICINE CANT", None, "I can't take medicine."),
    ("HELP SLEEP CANT", None, "I need help, I can't sleep."),
    ("HELLO THANK-YOU", None, "Hello, thank you for seeing me."),
    ("THANK-YOU YES", "Come back if it gets worse, okay?", "Yes, thank you."),
    ("YES", "Do you understand?", "Yes, I understand."),
    ("NO", "Do you understand?", "No, I don't understand."),
    ("NO HELP", "Do you understand?", "No, can you help me understand?"),
    ("YESTERDAY", "When did you last take your medicine?", "Yesterday."),
    ("THREE DAY", "When did you last take your medicine?", "Three days ago."),
    ("STOMACH PAIN MEDICINE", None, "My stomach has hurt since I took the medicine."),
    ("HEAD PAIN MEDICINE NO", None, "I have a headache and I haven't taken any medicine."),
    ("CHEST PAIN THREE DAY SLEEP CANT", None, "I've had chest pain for three days and I can't sleep."),
    ("CHEST PAIN HELP", None, "My chest hurts, please help."),
    # Recogniser noise: '?' = sign not recognised, repeated tokens = double detection
    ("? HEAD PAIN", None, "I have a headache."),
    ("HEAD ? PAIN", None, "My head hurts."),
    ("HEAD HEAD PAIN", None, "My head hurts."),
    ("STOMACH PAIN ?", None, "I have stomach pain."),
    ("CHEST ? THREE DAY", None, "Something about my chest, for three days."),
    ("?", "Have you taken any medicine?", "Sorry, let me sign that again."),
]


# The demo script (Dr Veer, headache consultation) plus close variations.
# Always in the training set, never in the test set.
DEMO_PAIRS = [
    ("PAIN HEAD", "Hello, I'm Dr Veer. What's brought you in today?", "I have a headache."),
    ("HEAD PAIN", "What's brought you in today?", "I've got a headache."),
    ("PAIN HEAD", "How can I help you today?", "I have a headache."),
    ("PAIN HEAD THREE DAY", "What's brought you in today?", "I've had a headache for three days."),
    ("THREE DAY", "I'm sorry to hear that. How long has it been going on?", "About three days."),
    ("DAY THREE", "How long has it been going on?", "For three days."),
    ("THREE DAY", "How long have you had the headache?", "About three days."),
    ("NONE", "Any changes to your vision, or feeling sick?", "No, nothing like that."),
    ("NO NONE", "Any changes to your vision, or feeling sick?", "No, nothing like that."),
    ("NONE", "Any other symptoms?", "No, nothing else."),
    ("NONE", "Have you had a fever or a stiff neck?", "No, nothing like that."),
    ("NONE", "Any numbness or weakness?", "No, none of that."),
    ("NONE", "Are you taking any other medication?", "No, none."),
    ("NONE", None, "No, nothing."),
    ("DONT-UNDERSTAND", "Have you taken any analgesia for it?", "Sorry, I don't understand."),
    ("DONT-UNDERSTAND", "Is the pain unilateral or bilateral?", "Sorry, I don't understand."),
    ("DONT-UNDERSTAND", "Any photophobia?", "Sorry, I don't understand."),
    ("DONT-UNDERSTAND", None, "Sorry, I don't understand."),
    ("DONT-UNDERSTAND HELP", None, "Sorry, I don't understand. Can you help?"),
    ("NO", "Have you taken any painkillers, like paracetamol?", "No."),
    ("NO", "Have you taken any analgesia for it?", "No, I haven't."),
    ("NO MEDICINE", "Have you taken any painkillers, like paracetamol?", "No, I haven't taken any."),
    ("YES", "Have you taken any painkillers, like paracetamol?", "Yes, I have."),
    ("THANK-YOU", "This sounds like a tension headache. Take paracetamol, and come back if it isn't better in a week.",
     "Thank you."),
    ("THANK-YOU", "Come back if it isn't better in a week.", "Thank you, I will."),
    ("THANK-YOU HELP", "Take paracetamol and rest.", "Thank you for your help."),
    ("CANT SLEEP", "How have you been sleeping?", "I can't sleep."),
    ("SLEEP CANT", "How have you been sleeping?", "I haven't been able to sleep."),
]


def check(pairs):
    allowed = set(PATIENT_SIGNS) | {UNKNOWN}
    for gloss, _, _ in pairs:
        bad = [t for t in gloss.split() if t not in allowed]
        assert not bad, f"{gloss!r} uses tokens not in vocab: {bad}"


def main():
    check(PAIRS)
    rows = [{"prompt": format_prompt(g.split(), ctx), "completion": out} for g, ctx, out in PAIRS]
    random.Random(0).shuffle(rows)
    test, train = rows[:20], rows[20:]
    check(DEMO_PAIRS)
    train += [{"prompt": format_prompt(g.split(), ctx), "completion": out} for g, ctx, out in DEMO_PAIRS]
    os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
    for name, data in [("train", train), ("test", test)]:
        with open(os.path.join(HERE, "data", f"{name}.jsonl"), "w", encoding="utf-8") as f:
            for r in data:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(os.path.join(HERE, "data", "train.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["prompt", "completion"])
        w.writeheader()
        w.writerows(train)
    print(f"{len(train)} train, {len(test)} test pairs -> data/")


if __name__ == "__main__":
    main()
