# Red AI — local GGUF build

This branch prepares the reproducible build for a mobile-suitable custom Red AI model.

## Source
The authoritative source is the existing repository file:
`Red's Ways Of Thinking`

The build does **not** treat those statements as verified facts. Training examples explicitly frame them as Red's perspective, hypotheses, or questions.

## Base model
Qwen/Qwen2.5-0.5B-Instruct — 0.49B parameters, Apache-2.0.

Why this base: it is small enough to target an Android Galaxy A12 while retaining an instruction-tuned chat model. The final target is GGUF Q4_K_M.

## Training method
Parameter-efficient supervised fine-tuning (LoRA) over a generated conversational dataset derived from the source file.

The dataset also contains explicit host-tool boundaries:
- no claiming web access unless the host supplies web results;
- no claiming current date/time unless the host supplies it;
- no claiming image generation unless the host actually invokes an image tool;
- no claiming file/device access unless the host supplies the file/device result.

## Target artifact
`Red_AI_Qwen2.5-0.5B_Q4_K_M.gguf`

The model is not considered finished until:
1. the LoRA training completes;
2. the adapter is merged into the base model;
3. the merged model converts successfully to GGUF;
4. Q4_K_M quantization succeeds;
5. the GGUF passes a load/inference smoke test;
6. tool-boundary tests pass.

## Current blocker
Training compute is external to this repository. Hugging Face Jobs requires a positive/prepaid compute credit balance. No paid compute is started automatically by this branch.
