# Buddy Qwen audio integration note

The current Qwen3-TTS integration must accept both Gradio FileData outputs and raw `(sample_rate, waveform)` audio tuples and convert raw waveforms to browser-playable WAV audio.
