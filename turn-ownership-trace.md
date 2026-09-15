# Conversational turn ownership trace

## Scope
Maps the exact ownership chain from user input to return-to-prompt for Hermes CLI voice/typed turns.

## Typed input path

1. `cli.py:8191-8199` — typed text is accepted into `_pending_input` if idle, or `_interrupt_queue` if agent busy.
2. `cli.py:20139-20144` — `process_loop()` reads `_pending_input`.
3. `cli.py:20173` — `is_voice_input == False`; typed path taken.
4. `cli.py:20200-20267` — stop phrase, slash commands, bang-shell checks.
5. `cli.py:20283-20291` — `_agent_running = True`; `chat(user_input, ..., voice_input=False)`.
6. `cli.py:16068` — `chat()` starts.
7. `cli.py:16230-16246` — staged user message appended to `conversation_history`.
8. `cli.py:16262-16271` — if voice+continuous: `_voice_full_duplex_listener` daemon started.
9. `cli.py:16298-16335` — if streaming TTS: `text_queue`, `stop_event`, `tts_thread` started; `_voice_tts_stop` bound.
10. `cli.py:16423` — agent thread executes `run_conversation()`.
11. `cli.py:16514-16563` — main thread polls `_interrupt_queue`; on interrupt: `stop_event.set()` then `agent.interrupt()`.
12. `cli.py:16615-16625` — normal completion: `text_queue.put(None)` sentinel + `tts_thread.join(timeout=120)`.
13. `cli.py:16857-16858` — fallback TTS dispatch if streaming not used.
14. `cli.py:16892` — `return response`.
15. `cli.py:20293-20365` — finally block: `_agent_running = False`; continuous-voice auto-restart daemon started.
16. `cli.py:20144` — next `process_loop` iteration picks next input.

## Voice input path

1. `cli.py:14364-14477` — `_voice_start_recording()`; `_voice_recording = True`; recorder started with `_on_silence` callback.
2. `cli.py:14458-14466` — `_on_silence()` calls `_voice_stop_and_transcribe()`.
3. `cli.py:14546-14669` — stop/transcribe:
   - `cli.py:14551-14555` — atomic guard: `_voice_recording = False`, `_voice_processing = True`.
   - `cli.py:14564` — `wav_path = self._voice_recorder.stop()`.
   - `cli.py:14591-14592` — `transcribe_recording(wav_path)`.
   - `cli.py:14594-14607` — on success: `_pending_input.put(_VoiceInputMessage(transcript))`, `submitted = True`.
4. `cli.py:20173-20175` — `process_loop` unwraps `_VoiceInputMessage`.
5. `cli.py:20291` — `chat(user_input, ..., voice_input=True)`.
6. `cli.py:16348-16353` — `_voice_prefix` prepended because `voice_input=True`.
7. `cli.py:16262-16335` onward — identical to typed from listener arm through TTS setup.
8. `cli.py:20347-20365` — post-turn: `_voice_restart_recording_async()` started.

## Unification point
After `cli.py:20175`, typed and voice inputs follow identical ownership. All modality-specific behavior is before that line.

## Split ownership: continuous-mode restart
- If transcript submitted: restart deferred to `process_loop` finally block (`cli.py:20361`).
- If transcript not submitted: restart happens in `_voice_stop_and_transcribe()` finally block (`cli.py:14669`).
- These two paths can race when old turn teardown overlaps new turn startup.

## Key owner summary
- **Single queue owner:** `process_loop` consumes `_pending_input`.
- **Single turn owner:** `chat()` stages message, arms listener, starts agent thread, owns interrupt monitor, owns post-turn cleanup.
- **Single generation owner:** `run_conversation()` on the agent thread.
- **Single TTS shutdown owner:** main thread in `chat()` after agent thread exits.
- **Single return-to-input owner:** implicit continuation of `process_loop` while-loop.
