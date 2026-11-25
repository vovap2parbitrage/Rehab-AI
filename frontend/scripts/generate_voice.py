"""Record every phrase of the pose assistant into public/voice/<id>.mp3.

The phrases live in src/lib/voicePhrases.json. Recorded files make the voice the same in every
browser (many browsers, Chrome on Windows among them, have no Ukrainian voice of their own).
Run it again after adding or changing a phrase; unchanged phrases are skipped.

    python3 -m venv .venv-voice
    .venv-voice/bin/pip install edge-tts
    .venv-voice/bin/python scripts/generate_voice.py

It sends only these fixed phrases to Microsoft's text-to-speech service, nothing about patients.
"""

import asyncio
import json
from pathlib import Path

import edge_tts

VOICE = "uk-UA-PolinaNeural"
ROOT = Path(__file__).resolve().parents[1]
PHRASES = ROOT / "src/lib/voicePhrases.json"
OUT = ROOT / "public/voice"
MANIFEST = OUT / "manifest.json"


async def main() -> None:
    phrases: dict[str, str] = json.loads(PHRASES.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    done: dict[str, str] = {}
    if MANIFEST.exists():
        done = json.loads(MANIFEST.read_text(encoding="utf-8")).get("phrases", {})

    recorded: dict[str, str] = {}
    for phrase_id, text in phrases.items():
        target = OUT / f"{phrase_id}.mp3"
        if done.get(phrase_id) != text or not target.exists():
            await edge_tts.Communicate(text, VOICE).save(str(target))
            print("recorded", phrase_id)
        recorded[phrase_id] = text

    # Files of phrases that no longer exist.
    for stale in OUT.glob("*.mp3"):
        if stale.stem not in phrases:
            stale.unlink()

    MANIFEST.write_text(
        json.dumps({"voice": VOICE, "phrases": recorded}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{len(recorded)} phrases in {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
