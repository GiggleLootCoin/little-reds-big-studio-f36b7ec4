import hashlib
import math
import os
import subprocess
import tempfile
import urllib.request
import wave

import numpy as np
from resemblyzer import VoiceEncoder, preprocess_wav

BASE = os.environ["PRODUCTION_URL"].rstrip("/")
SAMPLE_URL = os.environ["SAMPLE_URL"]
SENTENCES = [
    "Good morning, this is a fresh voice test for Buddy.",
    "I am checking whether the same speaker comes through across a completely new sentence.",
    "The voice should still sound like the person in the reference recording, not a generic narrator.",
]

with tempfile.TemporaryDirectory() as tmp:
    ref = os.path.join(tmp, "reference.mp3")
    urllib.request.urlretrieve(SAMPLE_URL, ref)
    ref_bytes = open(ref, "rb").read()
    reference_sha = hashlib.sha256(ref_bytes).hexdigest()
    reference_wav = os.path.join(tmp, "reference.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", ref, "-ac", "1", "-ar", "16000", reference_wav], check=True)

    encoder = VoiceEncoder()
    ref_embedding = encoder.embed_utterance(preprocess_wav(reference_wav))
    results = []

    for index, sentence in enumerate(SENTENCES, 1):
        output = os.path.join(tmp, f"clone-{index}.wav")
        headers = os.path.join(tmp, f"clone-{index}.headers")
        command = [
            "curl", "-L", "-sS", "--max-time", "240",
            "-D", headers, "-o", output,
            "-X", "POST",
            "-F", f"audio=@{ref};type=audio/mpeg",
            "-F", f"text={sentence}",
            "-F", f"target_text={sentence}",
            f"{BASE}/api/ai/voice-clone?speaker_verify={index}",
        ]
        subprocess.run(command, check=True)
        raw = open(output, "rb").read()
        if len(raw) <= 4096:
            raise RuntimeError(f"sentence {index}: output is empty or too small")
        with wave.open(output, "rb") as wav:
            channels = wav.getnchannels()
            rate = wav.getframerate()
            frames = wav.getnframes()
            width = wav.getsampwidth()
            pcm = wav.readframes(frames)
        if width != 2 or channels < 1 or rate < 8000:
            raise RuntimeError(f"sentence {index}: unexpected output WAV format")
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
        peak = float(np.max(np.abs(samples))) if samples.size else 0.0
        rms = float(math.sqrt(float(np.mean(samples * samples)))) if samples.size else 0.0
        duration = frames / rate if rate else 0.0
        if duration <= 0.25 or peak < 0.005 or rms < 0.0005:
            raise RuntimeError(f"sentence {index}: unusable audio duration={duration:.3f} peak={peak:.6f} rms={rms:.6f}")
        generated_wav = os.path.join(tmp, f"clone-{index}-16k.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", output, "-ac", "1", "-ar", "16000", generated_wav], check=True)
        generated_embedding = encoder.embed_utterance(preprocess_wav(generated_wav))
        similarity = float(np.dot(ref_embedding, generated_embedding) / (np.linalg.norm(ref_embedding) * np.linalg.norm(generated_embedding)))
        response_headers = open(headers, encoding="utf-8", errors="replace").read().lower()
        returned_sha = next((line.split(":", 1)[1].strip() for line in response_headers.splitlines() if line.startswith("x-clone-reference-sha256:")), "")
        returned_bytes = next((line.split(":", 1)[1].strip() for line in response_headers.splitlines() if line.startswith("x-clone-reference-bytes:")), "")
        results.append({"sentence": index, "similarity": similarity, "duration": duration, "peak": peak, "rms": rms, "reference_sha256": returned_sha, "reference_bytes": returned_bytes})
        if returned_sha and returned_sha != reference_sha:
            raise RuntimeError(f"sentence {index}: reference SHA changed in Worker path ({returned_sha} != {reference_sha})")
        if returned_bytes and int(returned_bytes) != len(ref_bytes):
            raise RuntimeError(f"sentence {index}: reference byte count changed in Worker path")

    scores = [item["similarity"] for item in results]
    median = float(np.median(scores))
    minimum = float(min(scores))
    print(f"REFERENCE_SHA256={reference_sha}")
    print(f"SPEAKER_SIMILARITY scores={[round(x,4) for x in scores]} median={median:.4f} minimum={minimum:.4f}")
    for item in results:
        print(item)
    if median < 0.55 or minimum < 0.45:
        raise RuntimeError(f"speaker similarity did not meet verification threshold: median={median:.4f}, minimum={minimum:.4f}")
    print("SPEAKER_VERIFICATION=PASS")
