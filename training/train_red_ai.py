# /// script
# dependencies = [
#   "torch",
#   "transformers",
#   "datasets",
#   "trl",
#   "peft",
#   "accelerate",
#   "sentencepiece",
# ]
# ///
import json, re, os
from pathlib import Path
from datasets import Dataset
from transformers import AutoTokenizer, AutoModelForCausalLM
from trl import SFTConfig, SFTTrainer
from peft import LoraConfig

BASE = "Qwen/Qwen2.5-0.5B-Instruct"
SOURCE_URL = "https://raw.githubusercontent.com/GiggleLootCoin/little-reds-big-studio-f36b7ec4/main/Red%27s%20Ways%20Of%20Thinking"
OUT = Path("red_ai_lora")
DATA = Path("red_ai_dataset.jsonl")

SYSTEM = Path("system_prompt.txt").read_text(encoding="utf-8")

def get_source():
    import urllib.request
    with urllib.request.urlopen(SOURCE_URL, timeout=30) as r:
        return r.read().decode("utf-8")

def build_examples(source):
    claims = [x.strip() for x in source.splitlines() if x.strip() and not x.lower().startswith("red's ways")]
    rows = []
    templates = [
        ("What does Red's source say about this idea?\n\n{}", "Red's source presents this as Red's perspective: {} This is a perspective from the source, not something I should present as an established fact without verification."),
        ("Explain Red's thinking here:\n\n{}", "One idea in Red's Ways Of Thinking is: {} I would treat that as Red's viewpoint or hypothesis and distinguish it from independently verified evidence."),
        ("Could you explore this Red idea?\n\n{}", "Red's source proposes: {} The useful way to explore it is to separate the underlying question from the claim itself and check evidence where evidence is available."),
        ("How should Red AI handle this statement?\n\n{}", "I should recognize this as a statement from Red's source: {} I can discuss why the idea is interesting, but I should not falsely label a disputed claim as proven."),
    ]
    for claim in claims:
        for q, a in templates:
            rows.append({"messages":[
                {"role":"system","content":SYSTEM},
                {"role":"user","content":q.format(claim)},
                {"role":"assistant","content":a.format(claim)}
            ]})

    boundaries = [
        ("Did you search the web for that?", "No. I do not have web access unless the host application actually supplies search results. If it does, I can use those supplied results."),
        ("What time is it right now?", "I cannot know the current time from the model alone. The host application must supply the current time."),
        ("Did you generate that image?", "Not unless the host application actually invoked an image-generation tool. I should never claim that I generated an image when I did not."),
        ("Can you see the files on my phone?", "Not by default. I can only use a file when the host application actually provides it to me."),
        ("Can you check my camera?", "Not by default. Camera access belongs to the host application, and I should only describe camera results that the host actually supplies."),
        ("Are the claims in Red's source proven?", "No. The source is a collection of Red's ideas and perspectives. I should not turn disputed or unverified claims into established facts."),
        ("What should you do when you are uncertain?", "Say that I am uncertain, explain what is known versus speculative, and suggest verification when appropriate rather than inventing certainty."),
    ]
    for q,a in boundaries:
        rows.append({"messages":[
            {"role":"system","content":SYSTEM},
            {"role":"user","content":q},
            {"role":"assistant","content":a}
        ]})
    return rows

source = get_source()
rows = build_examples(source)
with DATA.open("w", encoding="utf-8") as f:
    for row in rows:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
print(f"dataset examples: {len(rows)}")

tokenizer = AutoTokenizer.from_pretrained(BASE)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype="auto")

peft = LoraConfig(
    r=16, lora_alpha=32, lora_dropout=0.05, bias="none",
    task_type="CAUSAL_LM",
    target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],
)

ds = Dataset.from_list(rows)
args = SFTConfig(
    output_dir=str(OUT),
    num_train_epochs=2,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,
    learning_rate=2e-4,
    logging_steps=5,
    save_strategy="epoch",
    max_length=512,
    report_to="none",
    fp16=False,
    bf16=False,
)
trainer = SFTTrainer(
    model=model,
    args=args,
    train_dataset=ds,
    processing_class=tokenizer,
    peft_config=peft,
)
trainer.train()
trainer.save_model(str(OUT))
tokenizer.save_pretrained(str(OUT))
print(f"saved LoRA adapter to {OUT}")
