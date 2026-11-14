"""One prompt format shared by the seed data, the few-shot model and the fine-tuned model."""


def format_prompt(tokens, doctor_said=None):
    lines = []
    if doctor_said:
        lines.append(f"Doctor: {doctor_said}")
    lines.append(f"Patient signs: {' '.join(tokens)}")
    lines.append("Patient means:")
    return "\n".join(lines)
