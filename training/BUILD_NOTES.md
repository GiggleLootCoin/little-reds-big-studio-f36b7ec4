# Build notes

1. Run `train_red_ai.py` in a GPU-backed environment.
2. Merge the LoRA adapter into Qwen2.5-0.5B-Instruct.
3. Convert the merged Transformers model with llama.cpp's `convert_hf_to_gguf.py`.
4. Quantize with llama.cpp's `llama-quantize` using `Q4_K_M`.
5. Smoke-test the resulting GGUF.
6. Test:
   - normal Red-style responses;
   - uncertainty labeling;
   - "did you search?" boundary;
   - current-time boundary;
   - image-generation boundary;
   - phone/file/camera boundary.
7. Only then label the artifact final.

Recommended initial ChatterUI settings for the Galaxy A12:
- Context: 2048
- CPU-first execution
- Keep GPU/Vulkan off unless ChatterUI reports a stable compatible backend
- Temperature: 0.7
- Top-p: 0.9
- Repeat penalty: 1.1
- Start with short replies / 256 max output tokens

These are starting values, not a claim that they are optimal until the finished GGUF is tested on the actual phone.
