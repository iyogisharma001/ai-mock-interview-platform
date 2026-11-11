// Browser voice I/O: SpeechRecognition for the candidate, speechSynthesis for the interviewer.
import { useCallback, useEffect, useRef, useState } from 'react';

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

export const speechSupport = { recognition: Boolean(Recognition), synthesis: Boolean(synth) };

function pickVoice() {
  const voices = synth?.getVoices() || [];
  return (
    voices.find((v) => /en[-_](US|GB)/i.test(v.lang) && /natural|neural|online/i.test(v.name)) ||
    voices.find((v) => /en[-_]US/i.test(v.lang)) ||
    voices.find((v) => v.lang?.startsWith('en')) ||
    null
  );
}

export function useSpeech({ onUtterance, onBargeIn }) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [voiceOn, setVoiceOn] = useState(true);
  const [micError, setMicError] = useState('');

  const recRef = useRef(null);
  const wantListening = useRef(false);
  const voiceOnRef = useRef(true);
  const buffer = useRef('');
  const handlers = useRef({ onUtterance, onBargeIn });
  handlers.current = { onUtterance, onBargeIn };
  voiceOnRef.current = voiceOn;

  // ---- text to speech -------------------------------------------------------------------
  const say = useCallback((text) => {
    if (!synth || !voiceOnRef.current || !text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text.trim());
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1.04;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(synth.pending || synth.speaking);
    utterance.onerror = () => setSpeaking(false);
    synth.speak(utterance);
  }, []);

  const hush = useCallback(() => {
    buffer.current = '';
    synth?.cancel();
    setSpeaking(false);
  }, []);

  /** Feed streamed tokens; whole sentences are spoken as soon as they complete. */
  const streamSay = useCallback((delta) => {
    buffer.current += delta;
    const match = buffer.current.match(/^[\s\S]*[.!?](?=\s)/);
    if (match) {
      say(match[0]);
      buffer.current = buffer.current.slice(match[0].length);
    }
  }, [say]);

  const flushSay = useCallback(() => {
    say(buffer.current);
    buffer.current = '';
  }, [say]);

  /** Interruptions cut through whatever is being said. */
  const interruptSay = useCallback((text) => {
    hush();
    say(text);
  }, [hush, say]);

  // ---- speech to text -------------------------------------------------------------------
  const stopListening = useCallback(() => {
    wantListening.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim('');
  }, []);

  const startListening = useCallback(() => {
    if (!Recognition) return;
    setMicError('');
    const rec = new Recognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event) => {
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (!result.isFinal) partial += text;
        else if (text.trim()) {
          // Without headphones the mic hears the interviewer; drop finals captured during playback.
          if (synth?.speaking && result[0].confidence < 0.75) continue;
          if (synth?.speaking) {
            hush();
            handlers.current.onBargeIn?.();
          }
          handlers.current.onUtterance?.(text.trim());
        }
      }
      setInterim(partial);
    };
    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMicError('Microphone access was blocked. Allow it in the browser to speak your answers.');
        wantListening.current = false;
      }
    };
    // Chrome ends recognition after silence; keep the mic open for the whole interview.
    rec.onend = () => {
      if (wantListening.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      } else setListening(false);
    };

    recRef.current = rec;
    wantListening.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [hush]);

  const toggleVoice = useCallback(() => {
    setVoiceOn((on) => {
      if (on) hush();
      return !on;
    });
  }, [hush]);

  useEffect(() => () => {
    wantListening.current = false;
    recRef.current?.abort();
    synth?.cancel();
  }, []);

  return { listening, speaking, interim, voiceOn, micError, startListening, stopListening, toggleVoice, streamSay, flushSay, interruptSay, hush };
}
