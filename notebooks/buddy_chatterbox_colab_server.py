import os
import secrets
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

MODEL_NAME = "Chatterbox Multilingual V3"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
TOKEN = os.environ.get("BUDDY_CHATTERBOX_TOKEN", "").strip()
HOST = "127.0.0.1"
PORT = int(os.environ.get("BUDDY_CHATTERBOX_PORT", "8080"))

if not TOKEN:
    raise RuntimeError("BUDDY_CHATTERBOX_TOKEN is not set.")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
if DEVICE == "cuda":
    torch.set_float32_matmul_precision("high")

LANGUAGES = {
    "en": "en", "english": "en", "es": "es", "spanish": "es",
    "fr": "fr", "french": "fr", "de": "de", "german": "de",
    "it": "it", "italian": "it", "pt": "pt", "portuguese": "pt",
    "hi": "hi", "hindi": "hi", "zh": "zh", "chinese": "zh",
    "ja": "ja", "japanese": "ja", "ko": "ko", "korean": "ko",
    "ar": "ar", "arabic": "ar", "ru": "ru", "russian": "ru",
    "nl": "nl", "dutch": "nl", "pl": "pl", "polish": "pl",
    "sv": "sv", "swedish": "sv", "tr": "tr", "turkish": "tr",
    "da": "da", "danish": "da", "el": "el", "greek": "el",
    "he": "he", "hebrew": "he", "ms": "ms", "malay": "ms",
    "no": "no", "norwegian": "no", "fi": "fi", "finnish": "fi",
    "sw": "sw", "swahili": "sw",
}

app = FastAPI(title="Buddy Chatterbox Colab Backend", docs_url=None, redoc_url=None)
_model = None


def authorized(authorization: str | None) -> bool:
    if not authorization:
        return False
    presented = authorization.removeprefix("Bearer ").strip()
    return bool(presented) and secrets.compare_digest(presented, TOKEN)


def require_auth(authorization: str | None):
    if not authorized(authorization):
        raise HTTPException(status_code=401, detail="Invalid or missing backend token.")


def load_model():
    global _model
    if _model is None:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        _model = ChatterboxMultilingualTTS.from_pretrained(device=DEVICE, t3_model="v3")
    return _model


def convert_to_wav(src: Path, dst: Path):
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-ac", "1", "-ar", "24000", str(dst)],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=415, detail=f"Audio conversion failed: {result.stderr[-800:]}")
    if not dst.exists() or dst.stat().st_size < 4096:
        raise HTTPException(status_code=415, detail="Uploaded audio could not be converted to usable WAV.")


@app.get("/health")
def health(authorization: str | None = Header(default=None)):
    require_auth(authorization)
    gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    return {
        "ok": True,
        "service": "buddy-chatterbox-colab",
        "model": MODEL_NAME,
        "model_checkpoint": "v3",
        "device": DEVICE,
        "gpu": gpu,
        "voice_cloning": "reference-audio-required",
        "preset_voices": False,
        "transcript_fields": ["text", "refText", "referenceTranscript"],
    }


@app.post("/v1/voice-clone")
async def voice_clone(
    audio: UploadFile = File(...),
    text: str = Form("Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?"),
    refText: str = Form(""),
    referenceTranscript: str = Form(""),
    language: str = Form("en"),
    exaggeration: float = Form(0.5),
    cfg_weight: float = Form(0.5),
    temperature: float = Form(0.8),
    authorization: str | None = Header(default=None),
):
    require_auth(authorization)
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Target text is required.")
    if len(text) > 3000:
        raise HTTPException(status_code=400, detail="Target text is too long.")
    lang = LANGUAGES.get(language.strip().lower(), language.strip().lower()) or "en"

    payload = await audio.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Reference audio is empty.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Reference audio is larger than 25 MB.")

    # Chatterbox V3 clones from the reference waveform and has no transcript argument;
    # accept the transcript fields so Android upload/record clients can send them safely.
    _ = refText.strip() or referenceTranscript.strip()

    with tempfile.TemporaryDirectory(prefix="buddy-chatterbox-") as tmp:
        root = Path(tmp)
        src = root / (audio.filename or "reference-audio")
        converted = root / "reference.wav"
        output = root / "buddy-cloned.wav"
        src.write_bytes(payload)
        convert_to_wav(src, converted)

        model = load_model()
        try:
            with torch.inference_mode():
                wav = model.generate(
                    text[:3000], language_id=lang, audio_prompt_path=str(converted),
                    exaggeration=max(0.25, min(2.0, float(exaggeration))),
                    temperature=max(0.05, min(2.0, float(temperature))),
                    cfg_weight=max(0.0, min(1.0, float(cfg_weight))),
                )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Chatterbox generation failed: {type(exc).__name__}: {exc}")

        if hasattr(wav, "detach"):
            wav = wav.detach().float().cpu().numpy()
        wav = np.asarray(wav).squeeze()
        if wav.size < 4096:
            raise HTTPException(status_code=502, detail="Chatterbox returned an unusably small audio artifact.")
        sf.write(output, wav, int(model.sr), subtype="PCM_16")
        if output.stat().st_size < 4096:
            raise HTTPException(status_code=502, detail="Generated WAV artifact was empty.")

        return FileResponse(
            output, media_type="audio/wav", filename="buddy-cloned.wav",
            headers={
                "Cache-Control": "no-store",
                "X-Buddy-Clone-Provider": "Google Colab / Chatterbox Multilingual V3",
                "X-Buddy-Clone-Verified": "true",
                "X-Buddy-Clone-Device": DEVICE,
            },
        )


if __name__ == "__main__":
    load_model()
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
