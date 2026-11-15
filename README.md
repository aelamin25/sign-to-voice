# Sign to voice (working title)

A prototype built at Imperial AI Hack 2026. A Deaf patient signs to the camera, sees the sentence the
system understood, and approves it with a thumbs up. Only then does a voice speak it to the doctor.
The doctor's spoken reply comes back as a short caption.

It recognises a small, fixed set of American Sign Language signs for a doctor's visit. It is a helper
for when an interpreter doesn't arrive, not a translator and not a replacement for interpreters.

## Run it

```
npm install
cp .env.example .env     # then fill in the values (see below)
npm run dev
```

Open http://localhost:5173 in Chrome.

With an empty `.env` the app runs in **practice mode**: a stand-in voice in the browser, and you type
the doctor's reply. Add `ELEVENLABS_AGENT_ID` (and `ELEVENLABS_API_KEY` if the agent is private) to
use the real voice agent.

## How the pieces fit

| Piece | Where | What it does |
|---|---|---|
| Recogniser | `src/recognizer.js` | Watches the camera and reports each sign. Currently a keyboard stand-in. |
| Page | `src/main.js`, `index.html` | Sign row, approval card, doctor captions. |
| Agent link | `src/agent.js` | Connects the page to the ElevenLabs agent, or to the practice stand-in. |
| Agreed names | `src/signs.js` | Sign names, the message format and the tool names. |
| Server | `server/index.js` | Keeps the secret key off the page. |

The recogniser calls `onSign({ sign, confidence, tone, question })`. The page sends the agent a line
such as `SIGNS: PAIN HOW_LONG | tone=urgent | question=true`. The agent calls three tools on the page:
`propose_sentence`, `show_caption` and `request_interpreter`.

## APIs, models and libraries

- ElevenLabs Agents (`@elevenlabs/client`) for the real-time voice agent.
- Anam (`@anam-ai/js-sdk`) for the avatar that speaks with the agent's voice.
- Vite and Express.
- To be added: MediaPipe for hand and body tracking.

All code in this repository was written during the hackathon.
