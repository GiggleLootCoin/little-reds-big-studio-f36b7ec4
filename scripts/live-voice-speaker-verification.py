import hashlib
import json
import os
import subprocess
import tempfile
import wave

import numpy as np
from resemblyzer import VoiceEncoder, preprocess_wav

BASE = os.environ["PRODUCTION_URL"].rstrip("/")
SAMPLE_URL = os.environ["SAMPLE_URL"]
IMPOSTOR_URL = os.environ.get("IMPOSTOR_URL", "https://huggingface.co/datasets/hf-internal-testing/dummy-audio-samples/resolve/main/bcn_weather.mp3")
SENTENCES = [
    "Good morning, this is a fresh voice test for Buddy.",
    "I am checking whether the same speaker comes through across a completely new sentence.",
    "The voice should still sound like the person in the reference recording, not a generic narrator.",
    "Please tell me what you think of this new sentence when you hear it spoken aloud.",
    "This is another independent sentence so the speaker identity must remain stable.",
    "The final test checks whether the cloned voice remains recognizably the same person.",
]
FULL_REFERENCE_MIN = 0.88
SEGMENT_MEDIAN_MIN = 0.90
SEGMENT_MIN = 0.80
IMPOSTOR_MARGIN_MIN = 0.25
OVERALL_MEDIAN_MIN = 0.90
LEGACY_FAILING_SCORE = 0.7934315204620361
if FULL_REFERENCE_MIN <= LEGACY_FAILING_SCORE:
    raise RuntimeError("strict speaker gate calibration was weakened below the known failing score")


def cosine(a, b):
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom <= 0:
        raise RuntimeError("speaker embedding norm was zero")
    return float(np.dot(a, b) / denom)


def download(url, path):
    subprocess.run(["curl", "-L", "-sS", "--max-time", "60", url, "-o", path], check=True)
    if os.path.getsize(path) <= 0:
        raise RuntimeError(f"download produced an empty file: {url}")


def probe_audio(path):
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=sample_rate,channels,codec_name", "-of", "json", path,
    ], check=True, capture_output=True, text=True)
    data = json.loads(result.stdout)
    stream = (data.get("streams") or [{}])[0]
    return {
        "duration": float((data.get("format") or {}).get("duration") or 0),
        "sample_rate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
        "codec": str(stream.get("codec_name") or ""),
    }


def header_value(headers, name):
    prefix = name.lower() + ":"
    return next((line.split(":", 1)[1].strip() for line in headers.splitlines() if line.startswith(prefix)), "")


with tempfile.TemporaryDirectory() as tmp:
    ref = os.path.join(tmp, "reference.wav")
    impostor = os.path.join(tmp, "impostor.wav")
    download(SAMPLE_URL, ref)
    download(IMPOSTOR_URL, impostor)

    ref_bytes = open(ref, "rb").read()
    reference_sha = hashlib.sha256(ref_bytes).hexdigest()
    ref_info = probe_audio(ref)
    if ref_info["duration"] < 3.0:
        raise RuntimeError(f"reference is too short for speaker verification: {ref_info['duration']:.3f}s")

    reference_wav = os.path.join(tmp, "reference-16k-mono.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", ref, "-ac", "1", "-ar", "16000", reference_wav], check=True)
    with wave.open(reference_wav, "rb") as wav:
        reference_duration = wav.getnframes() / wav.getframerate()
    if reference_duration < 6.0:
        raise RuntimeError("reference does not contain enough audio for the 6-second T3 conditioning window")

    encoder = VoiceEncoder()
    reference_embedding = encoder.embed_utterance(preprocess_wav(reference_wav))
    segment_starts = [0.0, max(0.0, reference_duration / 2.0 - 3.0), max(0.0, reference_duration - 6.0)]
    reference_segments = []
    for index, start in enumerate(segment_starts, 1):
        segment = os.path.join(tmp, f"reference-segment-{index}.wav")
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-t", "6", "-i", reference_wav,
            "-ac", "1", "-ar", "16000", segment,
        ], check=True)
        reference_segments.append(encoder.embed_utterance(preprocess_wav(segment)))

    impostor_wav = os.path.join(tmp, "impostor-16k-mono.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", impostor, "-ac", "1", "-ar", "16000", impostor_wav], check=True)
    impostor_embedding = encoder.embed_utterance(preprocess_wav(impostor_wav))

    print(f"REFERENCE_SHA256={reference_sha}")
    print(f"REFERENCE_BYTES={len(ref_bytes)}")
    print(f"REFERENCE_SOURCE duration={ref_info['duration']:.3f}s sample_rate={ref_info['sample_rate']} channels={ref_info['channels']} codec={ref_info['codec']}")
    print("CONTROLLED_RUNTIME_ONLY=true")
    print("PUBLIC_CHATTERBOX_SPACE_FALLBACK=false")
    print("REFERENCE_CONDITIONING=audio_prompt_path")

    results = []
    for index, sentence in enumerate(SENTENCES, 1):
        output = os.path.join(tmp, f"clone-{index}.wav")
        headers_path = os.path.join(tmp, f"clone-{index}.headers")
        subprocess.run([
            "curl", "-L", "-sS", "--max-time", "300", "-D", headers_path, "-o", output,
            "-X", "POST", "-F", f"audio=@{ref};type=audio/wav", "-F", f"text={sentence}",
            "-F", f"target_text={sentence}", f"{BASE}/api/ai/voice-clone?speaker_verify={index}",
        ], check=True)

        raw = open(output, "rb").read()
        if len(raw) <= 4096:
            raise RuntimeError(f"sentence {index}: output is empty or too small")
        with wave.open(output, "rb") as wav:
            channels, rate, frames, width = wav.getnchannels(), wav.getframerate(), wav.getnframes(), wav.getsampwidth()
        if width != 2 or channels < 1 or rate < 8000:
            raise RuntimeError(f"sentence {index}: unexpected output WAV format")

        headers = open(headers_path, encoding="utf-8", errors="replace").read().lower()
        if header_value(headers, "x-chatterbox-reference-conditioned") != "true":
            raise RuntimeError(f"sentence {index}: controlled runtime did not prove reference conditioning")
        if header_value(headers, "x-clone-reference-sha256") != reference_sha:
            raise RuntimeError(f"sentence {index}: Worker reference SHA mismatch")
        if header_value(headers, "x-clone-reference-bytes") != str(len(ref_bytes)):
            raise RuntimeError(f"sentence {index}: Worker reference byte count mismatch")
        if header_value(headers, "x-clone-verified") != "true":
            raise RuntimeError(f"sentence {index}: artifact was not marked verified")

        generated_wav = os.path.join(tmp, f"clone-{index}-16k.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", output, "-ac", "1", "-ar", "16000", generated_wav], check=True)
        generated_embedding = encoder.embed_utterance(preprocess_wav(generated_wav))
        full_score = cosine(reference_embedding, generated_embedding)
        segment_scores = [cosine(segment, generated_embedding) for segment in reference_segments]
        segment_median = float(np.median(segment_scores))
        segment_min = float(min(segment_scores))
        impostor_score = cosine(impostor_embedding, generated_embedding)
        margin = segment_median - impostor_score
        results.append((full_score, segment_median, segment_min, margin))

        print(f"STRICT_SPEAKER sentence={index} full={full_score:.4f} segments={[round(x,4) for x in segment_scores]} segment_median={segment_median:.4f} segment_min={segment_min:.4f} impostor={impostor_score:.4f} margin={margin:.4f}")
        if full_score < FULL_REFERENCE_MIN:
            raise RuntimeError(f"sentence {index}: full-reference speaker score below strict floor")
        if segment_median < SEGMENT_MEDIAN_MIN:
            raise RuntimeError(f"sentence {index}: multi-utterance median below strict floor")
        if segment_min < SEGMENT_MIN:
            raise RuntimeError(f"sentence {index}: one reference utterance scored too low")
        if margin < IMPOSTOR_MARGIN_MIN:
            raise RuntimeError(f"sentence {index}: speaker-vs-impostor margin too small")

    overall_median = float(np.median([r[1] for r in results]))
    overall_margin = float(np.median([r[3] for r in results]))
    print(f"STRICT_SPEAKER_SUMMARY full_scores={[round(r[0],4) for r in results]}")
    print(f"STRICT_SPEAKER_SUMMARY segment_medians={[round(r[1],4) for r in results]} median={overall_median:.4f} margin_median={overall_margin:.4f}")
    if overall_median < OVERALL_MEDIAN_MIN or overall_margin < IMPOSTOR_MARGIN_MIN:
        raise RuntimeError("strict speaker verification failed")
    print("STRICT_SPEAKER_VERIFICATION=PASS")
