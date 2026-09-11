# Android local Qwen for Buddy

Buddy now treats a local Qwen server as the first chat route when the app is running in a browser/TWA. If the local server is unavailable, Buddy falls through to the existing server-side/free Qwen route automatically.

## Recommended local runtime

`llama.cpp` provides an OpenAI-compatible HTTP server for Qwen3. Its documented default is `http://localhost:8080/v1/`. Qwen3 is supported by current llama.cpp releases.

For the Android/Termux setup, use a Qwen3 GGUF that is appropriate for the phone. Qwen3-0.6B is the smallest practical starting point for this device class; quantized GGUF reduces memory use further.

The Buddy web app does **not** bundle model weights. The model stays on the phone, which keeps the APK small and allows the reasoning path to work without internet access.

## Endpoint configuration

The app defaults to:

`http://127.0.0.1:8080`

To use another local endpoint, set `localStorage` key `buddy.localQwen.url` in the app. To turn the local path off, set `buddy.localQwen.enabled` to `false`.

The local server must expose the OpenAI-compatible `/v1/chat/completions` endpoint and allow the TWA/browser origin through CORS.

## Health check

From Termux, run:

```sh
BUDDY_LOCAL_QWEN_URL=http://127.0.0.1:8080 node scripts/local-qwen-healthcheck.mjs
```

The check first probes `/health` when available, then sends a tiny request to `/v1/chat/completions`. A successful response proves the local endpoint is actually usable; merely having a model file or server process is not treated as proof.

## Important behavior

- Local Qwen is attempted before the remote Buddy chat providers.
- A local timeout, connection refusal, CORS failure, malformed response, or empty response does not break Buddy; it falls through to the existing online route.
- Image/multimodal turns continue to the existing remote Qwen/vision path because the local adapter intentionally sends text-only OpenAI-compatible messages.
- No API key is required for the local route.
- Red voice generation remains a separate pipeline and is not replaced by the local reasoning adapter.
