import os
import tempfile
from pathlib import Path

import torch
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

TOKEN = os.environ.get("CHATTERBOX_TOKEN", "").strip()
DEVICE = os.environ.get("CHATTERBOX_DEVICE", "cpu").strip() or "cpu"
MAX_TEXT = 300

app = FastAPI(title="Little Red's Big Studio Controlled Chatterbox", version="1.0.0")
model = None


def require_token(authorization: str | None) -> None:
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def get_model():
    global model
    if model is None:
        model = ChatterboxMultilingualTTS.from_pretrained(device=DEVICE)
    return model


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": "ChatterboxMultilingualTTS",
        "device": DEVICE,
        "reference_conditioning": "required",
        "default_speaker_fallback": False,
        "audio_prompt_path": True,
    }


@app.post("/tts")
async def tts(
    audio: UploadFile = File(...),
    text: str = Form(...),
    authorization: str | None = Header(default=None),
):
    require_token(authorization)
    text = text.strip()[:MAX_TEXT]
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    data = await audio.read()
    if len(data) < 4096:
        raise HTTPException(status_code=400, detail="Reference audio is empty or too small")

    suffix = Path(audio.filename or "reference.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(data)
        reference_path = f.name

    try:
        runtime = get_model()
        # This is intentionally the only generation path. There is no default
        # voice fallback: if the reference cannot be conditioned, the request fails.
        try:
            runtime.prepare_conditionals(reference_path, exaggeration=0.5)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Reference conditioning failed: {exc}") from exc

        try:
            wav = runtime.generate(
                text,
                audio_prompt_path=reference_path,
                exaggeration=0.5,
                temperature=0.8,
                cfg_weight=0.3,
                seed=42,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Chatterbox generation failed: {exc}") from exc

        if wav is None:
            raise HTTPException(status_code=502, detail="Chatterbox returned no audio")

        import io
        import soundfile as sf
        out = io.BytesIO()
        sf.write(out, wav.detach().cpu().numpy(), runtime.sr, format="WAV", subtype="PCM_16")
        body = out.getvalue()
        if len(body) < 4096:
            raise HTTPException(status_code=502, detail="Generated audio is empty")

        return Response(
            body,
            media_type="audio/wav",
            headers={
                "X-Chatterbox-Reference-Conditioned": "true",
                "X-Chatterbox-Default-Fallback": "false",
                "X-Chatterbox-Audio-Prompt-Path": "true",
            },
        )
    finally:
        try:
            os.unlink(reference_path)
        except OSError:
            pass
