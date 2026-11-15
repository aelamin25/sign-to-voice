"""The two functions the rest of the app calls.

    gloss_to_sentence(["HEAD", "PAIN", "THREE", "DAY"], doctor_said=None) -> "I've had a headache for three days."
    sentence_to_gloss("Take this medicine twice a day.") -> ["TAKE", "MEDICINE", "TWICE", "DAY"]
    simplify("Have you taken any analgesia for it?") -> "Have you taken any painkillers, like paracetamol?"

Everything runs on Adaption-hosted models by default, so you only need ADAPTION_API_KEY.
    ADAPTION_CHAT_MODEL   general model for the few-shot fallback, reply glossing and judging
                          (see `python translate.py --models`; if unset, the first listed model is used)
    TRANSLATE_BACKEND     fewshot (default) | finetuned | together | stack
    ADAPTION_STACK        slug of a self-improving Adaption stack (Inference stacks in the Adaption app),
                          used when TRANSLATE_BACKEND=stack, e.g. deepseek-v4-flash-1. The stack must be
                          live and owned by the account whose ADAPTION_API_KEY is set.
    ADAPTION_MODEL        your AutoScientist fine-tune id, used when TRANSLATE_BACKEND=finetuned
    LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY  -> use Claude for the general model instead

Try it:  python translate.py --models
         python translate.py HEAD PAIN THREE DAY
         python translate.py --doctor "Have you taken any medicine?" NO
         python translate.py --reply "Take this medicine twice a day and rest."
"""
import json
import os
import random

from prompt_format import format_prompt
from vocab import REPLY_CLIPS

HERE = os.path.dirname(os.path.abspath(__file__))

SYSTEM = (
    "You turn ASL gloss from a sign recogniser into what a Deaf patient means, as natural first-person "
    "English spoken to their doctor. ASL word order differs from English (time and topic often come first). "
    "'?' marks a sign that wasn't recognised: ignore it, and if nothing is left, say the patient will sign again. "
    "Repeated tokens are usually double detections. Use the doctor's last line as context for short answers. "
    "Never add symptoms, times or facts that aren't in the signs. Reply with the sentence only."
)


def _few_shot(k=12):
    path = os.path.join(HERE, "data", "train.jsonl")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f]
    return random.Random(1).sample(rows, min(k, len(rows)))


_EXAMPLES = _few_shot()
_clients = {}


def _adaption():
    if "adaption" not in _clients:
        from adaption import Adaption
        # A hosted model that never answers must not freeze the backend (it did: start-up hung for
        # minutes on one). Give up after a few seconds; the web app then falls back to its own sentence.
        _clients["adaption"] = Adaption(timeout=float(os.environ.get("ADAPTION_TIMEOUT", "8")), max_retries=0)
    return _clients["adaption"]


def list_models():
    return [m.id for m in _adaption().models.list().data]


# Hosted models that answered a one-sentence request quickly and correctly when checked on
# 15 Nov 2026 (0.3 to 0.4 s). Several others returned nothing within 60 tokens, and the first one
# listed timed out, so "use the first listed" is not a safe default.
PREFERRED_CHAT_MODELS = ("gemma-4-31b-it", "gemma-4-26b-a4b-it")


def _chat_model():
    if not os.environ.get("ADAPTION_CHAT_MODEL"):
        models = [m for m in list_models() if not m.startswith("stack:")]
        if not models:
            raise RuntimeError("No hosted models listed; set ADAPTION_CHAT_MODEL")
        pick = next((m for m in PREFERRED_CHAT_MODELS if m in models), models[0])
        os.environ["ADAPTION_CHAT_MODEL"] = pick
        print(f"[translate] ADAPTION_CHAT_MODEL not set, using {pick}")
    return os.environ["ADAPTION_CHAT_MODEL"]


def _chat(system, messages, max_tokens=120, model=None):
    """One chat call. messages = [{"role": "user"|"assistant", "content": str}, ...]"""
    if os.environ.get("LLM_PROVIDER") == "anthropic" and model is None:
        if "anthropic" not in _clients:
            import anthropic
            _clients["anthropic"] = anthropic.Anthropic()
        kw = dict(model=os.environ.get("CLAUDE_MODEL", "claude-haiku-5-5"), max_tokens=max_tokens,
                  system=system or "", messages=messages)
        try:
            r = _clients["anthropic"].messages.create(temperature=0, **kw)  # same signs -> same words every take
        except Exception as e:
            if "temperature" not in str(e).lower():
                raise
            r = _clients["anthropic"].messages.create(**kw)  # model doesn't accept temperature=0
        # newer models may return a thinking block first: keep only the text blocks
        return "".join(b.text for b in r.content if getattr(b, "type", "") == "text").strip()
    kw = {"instructions": system} if system else {}
    r = _adaption().responses.create(model=model or _chat_model(), input=messages,
                                     max_output_tokens=max_tokens, temperature=0, **kw)
    return r.output_text.strip()


def _ask_together(prompt):
    import requests
    r = requests.post(
        "https://api.together.xyz/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['TOGETHER_API_KEY']}"},
        json={"model": os.environ["TOGETHER_MODEL"], "max_tokens": 60, "temperature": 0,
              "messages": [{"role": "user", "content": prompt}]},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()


def _ask_stack(prompt):
    """A self-improving Adaption stack: a hosted model that searches our example sentences
    (file_search over the stack's dataset) and that Adaption keeps tuning from its own usage."""
    r = _adaption().responses.create(
        model="stack:" + os.environ["ADAPTION_STACK"],
        instructions=SYSTEM,
        input=prompt,
        tools=[{"type": "file_search"}],
        max_output_tokens=60,
        temperature=0,
    )
    return r.output_text


# A single short answer sign is said as just that word: fast, predictable, no model call.
SHORT_ANSWERS = {"NO": "No.", "NONE": "None.", "YES": "Yes."}


def gloss_to_sentence(tokens, doctor_said=None, backend=None, model=None):
    tokens = [t for t in tokens if t and t != "THUMBS-UP"]
    if not tokens:
        return ""
    if len(tokens) == 1 and tokens[0] in SHORT_ANSWERS:
        return SHORT_ANSWERS[tokens[0]]
    prompt = format_prompt(tokens, doctor_said)
    backend = backend or os.environ.get("TRANSLATE_BACKEND", "fewshot")
    if backend == "together":
        out = _ask_together(prompt)
    elif backend == "stack":
        out = _ask_stack(prompt)
    elif backend == "finetuned":
        # the fine-tune learned the format itself: no instructions or examples needed
        out = _chat(None, [{"role": "user", "content": prompt}], max_tokens=60,
                    model=model or os.environ["ADAPTION_MODEL"])
    elif backend == "zeroshot":
        # base model with the instructions but no examples: the comparison point for the pitch
        out = _chat(SYSTEM, [{"role": "user", "content": prompt}], max_tokens=60, model=model)
    else:
        messages = []
        for ex in _EXAMPLES:
            messages += [{"role": "user", "content": ex["prompt"]}, {"role": "assistant", "content": ex["completion"]}]
        messages.append({"role": "user", "content": prompt})
        out = _chat(SYSTEM, messages, model=model)
    return out.strip().split("\n")[0]


SIMPLIFY = (
    "A Deaf patient didn't understand what their doctor just said and asked for it again more simply. "
    "Rewrite the doctor's line in plain everyday English a 10-year-old would understand: replace medical "
    "jargon with common words and an everyday example (e.g. 'analgesia' -> 'painkillers, like paracetamol'). "
    "Keep the same meaning and the same question type. Use British English and UK medicine names "
    "(paracetamol, not Tylenol or acetaminophen). One short sentence, max 15 words. Reply with it only."
)


def simplify(doctor_text):
    """Doctor's jargon -> plain words, for when the patient signs DONT-UNDERSTAND."""
    return _chat(SIMPLIFY, [{"role": "user", "content": doctor_text}], max_tokens=80).strip().split("\n")[0]


def sentence_to_gloss(text):
    """Doctor's English -> the reply clips to play, in ASL order. Unknown words are dropped."""
    system = (
        "Convert the doctor's English into ASL gloss using ONLY these signs: " + ", ".join(REPLY_CLIPS) +
        ". Use ASL order (time first, then topic, then comment). Skip anything with no matching sign. "
        'Reply with a JSON list of signs only, e.g. ["MEDICINE", "TAKE", "TWICE", "DAY"].'
    )
    out = _chat(system, [{"role": "user", "content": text}], max_tokens=80)
    try:
        signs = json.loads(out[out.index("["): out.rindex("]") + 1])
    except ValueError:
        return []
    return [s for s in signs if s in REPLY_CLIPS]


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("tokens", nargs="*")
    ap.add_argument("--doctor", default=None)
    ap.add_argument("--reply", default=None)
    ap.add_argument("--models", action="store_true", help="list models Adaption hosts for you")
    ap.add_argument("--simplify", default=None, help="rewrite a doctor's line in plain words")
    a = ap.parse_args()
    if a.models:
        print("\n".join(list_models()))
    elif a.simplify:
        print(simplify(a.simplify))
    elif a.reply:
        print(sentence_to_gloss(a.reply))
    else:
        print(gloss_to_sentence(a.tokens, a.doctor))
