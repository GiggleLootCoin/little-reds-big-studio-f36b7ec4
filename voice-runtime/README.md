# Controlled Chatterbox runtime

This service runs the upstream open-source Chatterbox model without a public Hugging Face Space. It is designed for a genuinely free persistent VM such as Oracle Cloud Always Free Ampere A1.

## Contract

`POST /tts` accepts multipart `audio` and `text` plus an optional Bearer token. The uploaded reference is written to a temporary file and passed explicitly as `audio_prompt_path` to Chatterbox. Reference conditioning is mandatory. There is no default-speaker fallback.

A successful response includes:

- `X-Chatterbox-Reference-Conditioned: true`
- `X-Chatterbox-Default-Fallback: false`
- `X-Chatterbox-Audio-Prompt-Path: true`

If reference conditioning fails, `/tts` returns an error and never generates fallback speech.

## Free VM target

Oracle Cloud Always Free currently provides an Ampere A1 ARM VM allocation with up to 4 OCPUs and 24 GB RAM in the Always Free pool. This is persistent compute rather than a notebook session. Verify current availability in the Oracle console before provisioning.

Suggested VM:

- Ubuntu 24.04 ARM64
- 4 OCPUs
- 24 GB RAM
- 80+ GB boot volume
- public IPv4 or a reverse tunnel

The service is CPU-only and may be slow. The first request downloads/loads the model; keep one worker so the model is loaded once.

## Deployment

Build and run:

```bash
docker build -t little-red-chatterbox ./voice-runtime
docker run -d --restart unless-stopped \
  -p 8000:8000 \
  -e CHATTERBOX_TOKEN='replace-with-a-long-random-secret' \
  little-red-chatterbox
```

Put the service behind HTTPS. A reverse proxy or a Cloudflare Tunnel can provide the public authenticated endpoint without exposing port 8000 directly.

The production Worker must set `CHATTERBOX_ENDPOINT` to the HTTPS `/tts` endpoint and `CHATTERBOX_TOKEN` to the same secret.
