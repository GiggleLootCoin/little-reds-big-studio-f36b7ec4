# Merge the LoRA adapter and create a Q4_K_M GGUF.
from pathlib import Path
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE="Qwen/Qwen2.5-0.5B-Instruct"
ADAPTER="red_ai_lora"
MERGED=Path("red_ai_merged")

base=AutoModelForCausalLM.from_pretrained(BASE, torch_dtype="auto")
model=PeftModel.from_pretrained(base, ADAPTER)
model=model.merge_and_unload()
model.save_pretrained(MERGED, safe_serialization=True)
AutoTokenizer.from_pretrained(BASE).save_pretrained(MERGED)
print("merged model:", MERGED)
