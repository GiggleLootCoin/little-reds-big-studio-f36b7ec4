# Voice runtime deployment marker

This marker intentionally triggers the production deployment workflow after the restored Studio runtime implementation.

The runtime now has a real reference-audio cloning path with provider fallbacks instead of treating Qwen ZeroGPU as the only cloning route.

The current live verification target is the multipart File/Blob -> `/api/ai/voice-clone` -> Cloudflare Worker -> Hugging Face Chatterbox path, including the free ResembleAI/Chatterbox Space fallback when the paid Inference Provider quota is exhausted.
