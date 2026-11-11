import { useEffect, useRef, useState } from 'react';
import { speechSupport } from '../hooks/useSpeech.js';

function VoiceBars({ active, tone }) {
  return (
    <span className="flex h-4 items-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-full w-[3px] rounded-full ${tone} ${active ? 'voice-bar' : 'scale-y-[0.25] opacity-40'}`}
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </span>
  );
}

function Message({ message, onJump }) {
  if (message.role === 'candidate') {
    return (
      <div className="ml-8 rounded-lg rounded-br-sm bg-ink-800 px-3 py-2 text-sm text-ink-100">
        {message.text}
      </div>
    );
  }
  if (message.kind === 'interruption') {
    const meta = message.meta || {};
    return (
      <div className="rounded-lg border border-alarm/40 bg-alarm-dim px-3 py-2.5">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-alarm">
          <span>Interruption</span>
          {meta.timeComplexity && <span className="rounded bg-alarm/15 px-1.5 py-0.5 font-mono normal-case tracking-normal">{meta.timeComplexity}</span>}
        </div>
        <p className="text-sm text-ink-100">{message.text}</p>
        {meta.startLine && (
          <button type="button" onClick={() => onJump(meta)} className="mt-2 font-mono text-xs text-alarm underline-offset-2 hover:underline">
            Show lines {meta.startLine}–{meta.endLine}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mr-8 text-sm leading-relaxed text-ink-100">
      {message.text}
      {message.streaming && <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-signal" />}
      {message.aborted && <span className="ml-1 text-ink-400">—</span>}
    </div>
  );
}

export default function InterviewerPanel({ messages, voice, aiMode, disabled, onSend, onJump }) {
  const [draft, setDraft] = useState('');
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages]);

  const submit = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text, false);
    setDraft('');
  };

  return (
    <aside className="flex h-full min-h-0 flex-col bg-ink-900">
      <header className="flex items-center gap-3 border-b border-ink-800 px-4 py-3">
        <div className={`grid h-9 w-9 place-items-center rounded-full ${voice.speaking ? 'bg-signal-dim' : 'bg-ink-800'}`}>
          <VoiceBars active={voice.speaking} tone="bg-signal" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Interviewer</div>
          <div className="truncate text-xs text-ink-400">
            {voice.speaking ? 'Speaking…' : aiMode === 'llm' ? 'Senior engineer · listening' : 'Rule-based mode · no API key set'}
          </div>
        </div>
        {speechSupport.synthesis && (
          <button
            type="button"
            onClick={voice.toggleVoice}
            aria-pressed={voice.voiceOn}
            className="ml-auto rounded-md border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:border-ink-600 hover:text-ink-100"
          >
            {voice.voiceOn ? 'Voice on' : 'Voice off'}
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <p className="text-sm text-ink-400">Your interviewer is joining…</p>}
        {messages.map((m) => <Message key={m.id} message={m} onJump={onJump} />)}
        <div ref={end} />
      </div>

      <div className="border-t border-ink-800 p-3">
        {voice.micError && <p className="mb-2 text-xs text-fail">{voice.micError}</p>}
        {voice.listening && (
          <div className="mb-2 flex min-h-5 items-center gap-2 text-xs text-ink-300">
            <VoiceBars active tone="bg-note" />
            <span className="truncate">{voice.interim || 'Listening. Just talk.'}</span>
          </div>
        )}
        <form onSubmit={submit} className="flex gap-2">
          {speechSupport.recognition && (
            <button
              type="button"
              disabled={disabled}
              onClick={voice.listening ? voice.stopListening : voice.startListening}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? 'Mute microphone' : 'Unmute microphone'}
              className={`shrink-0 rounded-md px-3 text-sm font-medium disabled:opacity-40 ${voice.listening ? 'bg-note text-ink-950' : 'border border-ink-700 text-ink-300 hover:text-ink-100'}`}
            >
              {voice.listening ? 'Mic on' : 'Mic'}
            </button>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled}
            maxLength={2000}
            placeholder={speechSupport.recognition ? 'Or type your answer…' : 'Type your answer…'}
            className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm placeholder:text-ink-400 focus:border-signal focus:outline-none disabled:opacity-40"
          />
          <button type="submit" disabled={disabled || !draft.trim()} className="shrink-0 rounded-md bg-ink-100 px-3 text-sm font-medium text-ink-950 disabled:opacity-30">
            Send
          </button>
        </form>
        {!speechSupport.recognition && <p className="mt-2 text-xs text-ink-400">Voice input needs Chrome or Edge. Typing works everywhere.</p>}
      </div>
    </aside>
  );
}
