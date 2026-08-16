# Buddy Chatterbox Colab backend setup

## 1. Start the Android-friendly backend

Open `notebooks/Buddy_Chatterbox_Colab_Android.ipynb` in Google Colab and run the cells from top to bottom.

The notebook:

- installs the current open Chatterbox Multilingual V3 package;
- detects CUDA and reports the assigned GPU;
- converts Android audio formats through FFmpeg;
- requires reference audio for every request, so no preset voice is used;
- accepts `text`, `refText`/`referenceTranscript`, and `language`;
- generates a WAV artifact;
- creates a random 32-byte Bearer token;
- exposes the local server through a temporary HTTPS Cloudflare Quick Tunnel.

## 2. Connect the Worker

The deployed Worker reads two encrypted Cloudflare Worker secrets:

- `COLAB_CHATTERBOX_URL` — the temporary `https://....trycloudflare.com` URL printed by the notebook.
- `COLAB_CHATTERBOX_TOKEN` — the random token printed by the notebook.

In Cloudflare Dashboard: **Workers & Pages → Little Red’s Big Studio → Settings → Variables and Secrets → Add → Secret**.

Do not put the token in GitHub, `wrangler.jsonc`, or client-side code.

## 3. Runtime routing

Buddy keeps the Hugging Face Chatterbox Inference Provider as the first route when it has capacity.

If Hugging Face returns `402`, `429`, or `503`, the Worker sends the same uploaded reference audio and transcript fields to the Colab backend. If the Colab backend is unavailable, Buddy returns a real error instead of silently switching to a preset voice.

If `HF_TOKEN` is absent but the Colab secrets are configured, Colab is used directly.

## 4. Temporary tunnel limitation

The free Quick Tunnel URL is temporary and changes when the Colab runtime restarts. When that happens, update `COLAB_CHATTERBOX_URL` and keep the newly generated token in `COLAB_CHATTERBOX_TOKEN`.

For a stable long-running service, a named Cloudflare Tunnel or another persistent compute host is required; that is outside the free Colab Quick Tunnel arrangement.

## 5. Verification

The notebook contains a real Android file-picker smoke test. It uploads a selected reference recording to `/v1/voice-clone`, checks for a RIFF/WAVE response larger than 4 KB, saves `buddy-cloned-live-test.wav`, and downloads it.

The Buddy Worker also marks successful audio responses with `X-Buddy-Clone-Verified: true` / `x-clone-verified: true`.
