# Buddy smart model routing + offline-first behavior

Buddy now has a single routing policy instead of making the user think about model names.

## Routing policy

- **Normal conversation:** Qwen3.
- **Deep reasoning / architecture / hard analysis:** GPT-OSS 20B when online.
- **Coding:** Qwen3 today; a dedicated free coder can be added later without changing the UI contract.
- **Vision:** Qwen vision route when an image is present.
- **Very short/simple requests:** Llama 3.2 1B online for a faster response.
- **Offline:** the local OpenAI-compatible Qwen endpoint is preferred whenever it is available.

The local path uses `http://127.0.0.1:8080/v1/chat/completions`, matching llama.cpp's OpenAI-compatible server contract.

## Wi-Fi behavior

The app should never require Wi-Fi for local-first features. When a local engine is running, requests stay on the device. If the local engine is absent, online-capable routes can be used when connectivity returns.

The current production APK is a TWA/web application, so truly offline generation of every heavy media operation requires the corresponding model runtime to be installed locally. The routing layer deliberately does not pretend that a remote music/image/video model is offline-capable.

## Free boundary

Cloudflare Workers AI currently provides a 10,000-Neuron daily free allocation on the Workers Free plan. It is therefore a free/no-user-key fallback, not an unlimited inference promise. Local inference has no per-request provider charge once the model/runtime is installed.

## Next local engines

- Qwen3 GGUF through llama.cpp for offline chat.
- Existing local voice-runner contract for offline TTS/voice cloning.
- Local Whisper-compatible ASR for offline microphone transcription.
- Local/open media engines where the phone's RAM/storage/performance make them practical.
