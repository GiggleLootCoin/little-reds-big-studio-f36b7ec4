"""Persistent HTTP adapter for Buddy's self-hosted Chatterbox voice cloning.

Deploy with:
    modal deploy infra/modal/chatterbox_voice_server.py

The service accepts the same reference audio Buddy already sends to the Worker:
    multipart/form-data: audio=<file>, text=<optional text>

It returns a real WAV file. No preset voice is used.
"""

import io
import os
import tempfile
from pathlib import Path

import modal
from fastapi import File, Form, HTTPException, Response, UploadFile

APP_NAME = "little-reds-buddy-chatterbox"
MODEL = os.getenv("CHATTERBOX_MODEL", "standard")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install(
        "chatterbox-tts==0.1.6",
        "fastapi[standard]==0.124.4",
        "peft==0.18.0",
    )
)

app = modal.App(APP_NAME, image=image)


@app.cls(gpu="L4", scaledown_window=300)
class ChatterboxVoice:
    @modal.enter()
    def load(self):
        from chatterbox.tts import ChatterboxTTS

        self.tts = ChatterboxTTS.from_pretrained(device="cuda")

    @modal.fastapi_endpoint(method="POST", docs=False)
    async def clone(
        self,
        audio: UploadFile = File(...),
        text: str = Form(""),
    ):
        """Generate speech conditioned on the uploaded reference recording."""
        import torchaudio as ta

        raw = await audio.read()
        if len(raw) < 4096:
            raise HTTPException(status_code=400, detail="reference audio is empty or too small")

        suffix = Path(audio.filename or "reference.wav").suffix or ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as reference:
            reference.write(raw)
            reference_path = reference.name

        try:
            prompt = (
                text.strip()
                or "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?"
            )[:5000]
            wav = self.tts.generate(prompt, audio_prompt_path=reference_path)
            buffer = io.BytesIO()
            ta.save(buffer, wav, self.tts.sr, format="wav")
            data = buffer.getvalue()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Chatterbox generation failed: {exc}") from exc
        finally:
            try:
                os.unlink(reference_path)
            except OSError:
                pass

        if len(data) < 4096 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
            raise HTTPException(status_code=502, detail="Chatterbox returned an invalid WAV artifact")

        return Response(
            content=data,
            media_type="audio/wav",
            headers={
                "cache-control": "no-store",
                "x-buddy-clone-verified": "true",
                "x-buddy-clone-provider": "self-hosted-chatterbox",
                "x-buddy-clone-model": MODEL,
            },
        )
