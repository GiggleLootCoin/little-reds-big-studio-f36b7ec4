import hashlib
import json
import math
import os
import subprocess
import tempfile
import urllib.parse
import urllib.request
import wave

import numpy as np
from resemblyzer import VoiceEncoder, preprocess_wav

BASE = os.environ["PRODUCTION_URL"].rstrip("/")
SAMPLE_URL = os.environ["SAMPLE_URL"]
IMPOSTOR_URL = os.environ.get(
    "IMPOSTOR_URL",
    "https://huggingface.co/datasets/hf-internal-testing/dummy-audio-samples/resolve/main/bcn_weather.mp3",
)
SPACE = "https://rahul7star-chatterbox-multilingual-tts.hf.space"
SENTENCES = [
    "Good morning, this is a fresh voice test for Buddy.",
    "I am checking whether the same speaker comes through across a completely new sentence.",
    "The voice should still sound like the person in the reference recording, not a generic narrator.",
    "Please tell me what you think of this new sentence when you hear it spoken aloud.",
    "This is another independent sentence so the speaker identity must remain stable.",
    "The final test checks whether the cloned voice remains recognizably the same person.",
]

# These limits are deliberately above the previous production gate. The previous run's
# weakest score was 0.7934; keeping this floor above that value makes the old passing
# result an explicit regression that cannot silently become a pass again.
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
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration:stream=sample_rate,channels,codec_name",
            "-of", "json", path,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(result.stdout)
    stream = (data.get("streams") or [{}])[0]
    return {
        "duration": float((data.get("format") or {}).get("duration") or 0),
        "sample_rate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
        "codec": str(stream.get("codec_name") or ""),
    }


def upload_and_roundtrip_reference(reference_path):
    upload = subprocess.run(
        [
            "curl", "-L", "-sS", "--max-time", "60", "-X", "POST",
            "-F", f"files=@{reference_path};type=audio/mpeg",
            f"{SPACE}/gradio_api/upload",
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    paths = json.loads(upload)
    path = str(paths[0] if isinstance(paths, list) else "")
    if not path:
        raise RuntimeError("Chatterbox upload returned no reference path")
    fetched = os.path.join(os.path.dirname(reference_path), "roundtrip-reference")
    subprocess.run(
        ["curl", "-L", "-sS", "--max-time", "60", f"{SPACE}/gradio_api/file={path}", "-o", fetched],
        check=True,
    )
    original = open(reference_path, "rb").read()
    returned = open(fetched, "rb").read()
    returned_sha = hashlib.sha256(returned).hexdigest()
    original_sha = hashlib.sha256(original).hexdigest()
    if returned_sha != original_sha or len(returned) != len(original):
        raise RuntimeError(
            f"HF reference round-trip changed bytes ({returned_sha}/{len(returned)} != {original_sha}/{len(original)})"
        )
    return path, original_sha, len(original)


def verify_gradio_mapping():
    with urllib.request.urlopen(f"{SPACE}/gradio_api/info", timeout=30) as response:
        info = json.load(response)
    endpoint = info.get("named_endpoints", {}).get("/generate_tts_audio", {})
    params = endpoint.get("parameters", [])
    if len(params) < 5:
        raise RuntimeError("Chatterbox generate_tts_audio exposes fewer than five inputs")
    fifth = params[4]
    label = str(fifth.get("label") or "")
    parameter_name = str(fifth.get("parameter_name") or "")
    if "reference audio" not in label.lower() or parameter_name != "audio_prompt_path_input":
        raise RuntimeError(f"unexpected Chatterbox argument #5: label={label!r} name={parameter_name!r}")
    return label, parameter_name


with tempfile.TemporaryDirectory() as tmp:
    ref = os.path.join(tmp, "reference.mp3")
    impostor = os.path.join(tmp, "impostor.mp3")
    download(SAMPLE_URL, ref)
    download(IMPOSTOR_URL, impostor)

    ref_bytes = open(ref, "rb").read()
    reference_sha = hashlib.sha256(ref_bytes).hexdigest()
    ref_info = probe_audio(ref)
    if ref_info["duration"] < 3.0:
        raise RuntimeError(f"reference is too short for speaker verification: {ref_info['duration']:.3f}s")

    upload_path, roundtrip_sha, roundtrip_bytes = upload_and_roundtrip_reference(ref)
    gradio_label, gradio_parameter = verify_gradio_mapping()

    # Chatterbox Multilingual internally resamples the exact uploaded reference to 24 kHz,
    # derives a 16 kHz copy, uses the first 10 s for S3Gen conditioning and the first 6 s
    # for T3 speech conditioning, while its speaker encoder operates on the 16 kHz copy.
    reference_wav = os.path.join(tmp, "reference-16k-mono.wav")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", ref, "-ac", "1", "-ar", "16000", reference_wav],
        check=True,
    )
    with wave.open(reference_wav, "rb") as wav:
        reference_duration = wav.getnframes() / wav.getframerate()
    if reference_duration < 6.0:
        raise RuntimeError("reference does not contain enough audio for the 6-second T3 conditioning window")

    # Use multiple independent reference utterances rather than one long pooled embedding.
    # This makes the gate test speaker identity across the reference, not just similarity to
    # one averaged embedding that can hide a poor clone.
    segment_starts = [0.0, max(0.0, reference_duration / 2.0 - 3.0), max(0.0, reference_duration - 6.0)]
    encoder = VoiceEncoder()
    reference_embedding = encoder.embed_utterance(preprocess_wav(reference_wav))
    reference_segments = []
    for index, start in enumerate(segment_starts, 1):
        segment = os.path.join(tmp, f"reference-segment-{index}.wav")
        subprocess.run(
            [
                "ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-t", "6",
                "-i", reference_wav, "-ac", "1", "-ar", "16000", segment,
            ],
            check=True,
        )
        reference_segments.append(encoder.embed_utterance(preprocess_wav(segment)))

    impostor_wav = os.path.join(tmp, "impostor-16k-mono.wav")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", impostor, "-ac", "1", "-ar", "16000", impostor_wav],
        check=True,
    )
    impostor_embedding = encoder.embed_utterance(preprocess_wav(impostor_wav))

    print(f"REFERENCE_SHA256={reference_sha}")
    print(f"REFERENCE_BYTES={len(ref_bytes)}")
    print(f"HF_ROUNDTRIP_SHA256={roundtrip_sha}")
    print(f"HF_ROUNDTRIP_BYTES={roundtrip_bytes}")
    print(f"REFERENCE_SOURCE duration={ref_info['duration']:.3f}s sample_rate={ref_info['sample_rate']} channels={ref_info['channels']} codec={ref_info['codec']}")
    print(f"REFERENCE_CONDITIONING_WINDOW=t3_first_6s,s3gen_first_10s; verification_audio=mono_16k")
    print(f"GRADIO_ARGUMENT_5 label={gradio_label!r} parameter={gradio_parameter!r} uploaded_path={upload_path!r}")

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
            wav.readframes(frames)
        if width != 2 or channels < 1 or rate < 8000:
            raise RuntimeError(f"sentence {index}: unexpected output WAV format")
        generated_wav = os.path.join(tmp, f"clone-{index}-16k.wav")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", output, "-ac", "1", "-ar", "16000", generated_wav],
            check=True,
        )
        generated_embedding = encoder.embed_utterance(preprocess_wav(generated_wav))
        full_score = cosine(reference_embedding, generated_embedding)
        segment_scores = [cosine(segment, generated_embedding) for segment in reference_segments]
        segment_median = float(np.median(segment_scores))
        segment_min = float(min(segment_scores))
        impostor_score = cosine(impostor_embedding, generated_embedding)
        margin = segment_median - impostor_score

        response_headers = open(headers, encoding="utf-8", errors="replace").read().lower()
        returned_sha = next((line.split(":", 1)[1].strip() for line in response_headers.splitlines() if line.startswith("x-clone-reference-sha256:")), "")
        returned_bytes = next((line.split(":", 1)[1].strip() for line in response_headers.splitlines() if line.startswith("x-clone-reference-bytes:")), "")
        if returned_sha != reference_sha:
            raise RuntimeError(f"sentence {index}: Worker reference SHA mismatch ({returned_sha} != {reference_sha})")
        if returned_bytes != str(len(ref_bytes)):
            raise RuntimeError(f"sentence {index}: Worker reference byte count mismatch ({returned_bytes} != {len(ref_bytes)})")

        results.append({
            "sentence": index,
            "full_reference": full_score,
            "segment_scores": segment_scores,
            "segment_median": segment_median,
            "segment_min": segment_min,
            "impostor": impostor_score,
            "margin": margin,
            "duration": frames / rate if rate else 0.0,
        })

        print(
            f"STRICT_SPEAKER sentence={index} full={full_score:.4f} "
            f"segments={[round(x,4) for x in segment_scores]} "
            f"segment_median={segment_median:.4f} segment_min={segment_min:.4f} "
            f"impostor={impostor_score:.4f} margin={margin:.4f}"
        )

        if full_score < FULL_REFERENCE_MIN:
            raise RuntimeError(f"sentence {index}: full-reference speaker score below strict floor")
        if segment_median < SEGMENT_MEDIAN_MIN:
            raise RuntimeError(f"sentence {index}: multi-utterance median below strict floor")
        if segment_min < SEGMENT_MIN:
            raise RuntimeError(f"sentence {index}: one reference utterance scored too low")
        if margin < IMPOSTOR_MARGIN_MIN:
            raise RuntimeError(f"sentence {index}: speaker-vs-impostor margin too small")

    full_scores = [item["full_reference"] for item in results]
    segment_medians = [item["segment_median"] for item in results]
    margins = [item["margin"] for item in results]
    overall_median = float(np.median(segment_medians))
    overall_margin = float(np.median(margins))
    print(f"STRICT_SPEAKER_SUMMARY full_scores={[round(x,4) for x in full_scores]}")
    print(f"STRICT_SPEAKER_SUMMARY segment_medians={[round(x,4) for x in segment_medians]} median={overall_median:.4f} margin_median={overall_margin:.4f}")

    if overall_median < OVERALL_MEDIAN_MIN:
        raise RuntimeError(f"strict speaker verification failed: overall median={overall_median:.4f}")
    if overall_margin < IMPOSTOR_MARGIN_MIN:
        raise RuntimeError(f"strict speaker verification failed: impostor margin median={overall_margin:.4f}")

    print("STRICT_SPEAKER_VERIFICATION=PASS")
