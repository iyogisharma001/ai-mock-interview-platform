// Owns the Socket.io connection and all live interview state for one session.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_ORIGIN } from '../lib/api.js';

const MAX_TERMINAL_LINES = 500;

export function useInterview(interviewId, voice) {
  const [status, setStatus] = useState('connecting'); // connecting | live | ended | error
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [initialCode, setInitialCode] = useState(null);
  const [messages, setMessages] = useState([]);
  const [terminal, setTerminal] = useState([]);
  const [run, setRun] = useState({ state: 'idle', result: null });
  const [interruption, setInterruption] = useState(null);
  const [reportReady, setReportReady] = useState(false);
  const [hints, setHints] = useState([]);

  const socketRef = useRef(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const pushTerminal = useCallback((line) => setTerminal((lines) => [...lines, line].slice(-MAX_TERMINAL_LINES)), []);

  useEffect(() => {
    const socket = io(API_ORIGIN || undefined, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const join = () => {
      socket.emit('interview:join', { interviewId }, (res) => {
        if (!res?.ok) {
          setStatus('error');
          setError(res?.error || 'Could not join the interview.');
          return;
        }
        setSession({ interview: res.interview, problem: res.problem, aiMode: res.aiMode });
        setInitialCode((prev) => prev ?? res.code);
        setHints(res.hints || []);
        // Keep any message that is still streaming: the interviewer can start talking before this
        // acknowledgement arrives, and the saved transcript does not contain that turn yet.
        const history = res.transcript.map((t, i) => ({ id: `h${i}`, role: t.role, kind: t.kind, text: t.text, meta: t.meta }));
        setMessages((live) => [...history, ...live.filter((m) => m.streaming)]);
        setStatus(res.interview.status === 'completed' ? 'ended' : 'live');
        if (res.interview.reportStatus === 'ready') setReportReady(true);
      });
    };

    socket.on('connect', join);
    socket.on('connect_error', () => setError('Connection lost. Reconnecting…'));
    socket.io.on('reconnect', () => setError(''));

    socket.on('ai:stream:start', ({ id, kind }) => {
      setMessages((list) => [...list, { id, role: 'interviewer', kind, text: '', streaming: true }]);
    });
    socket.on('ai:stream:delta', ({ id, text }) => {
      voiceRef.current.streamSay(text);
      setMessages((list) => list.map((m) => (m.id === id ? { ...m, text: m.text + text } : m)));
    });
    socket.on('ai:stream:end', ({ id, text, aborted }) => {
      if (aborted) voiceRef.current.hush();
      else voiceRef.current.flushSay();
      setMessages((list) => list.flatMap((m) => {
        if (m.id !== id) return [m];
        return text ? [{ ...m, text, streaming: false, aborted }] : [];
      }));
    });

    socket.on('ai:interrupt', (payload) => {
      voiceRef.current.interruptSay(payload.message);
      setInterruption(payload);
      setMessages((list) => [...list.map((m) => (m.streaming ? { ...m, streaming: false, aborted: true } : m)), { id: payload.id, role: 'interviewer', kind: 'interruption', text: payload.message, meta: payload }]);
    });

    socket.on('candidate:message', ({ text }) => setMessages((list) => [...list, { id: crypto.randomUUID(), role: 'candidate', kind: 'message', text }]));

    socket.on('run:queued', () => {
      setRun({ state: 'running', result: null });
      setTerminal([]);
    });
    socket.on('terminal:line', ({ stream, text }) => pushTerminal({ stream, text }));
    socket.on('run:result', (result) => setRun({ state: 'done', result }));
    socket.on('run:error', ({ message }) => {
      pushTerminal({ stream: 'stderr', text: `Execution failed: ${message}` });
      setRun({ state: 'idle', result: null });
    });

    socket.on('hint:revealed', ({ index, text }) => setHints((list) => {
      const next = [...list];
      next[index] = text;
      return next;
    }));
    socket.on('interview:ended', () => setStatus('ended'));
    socket.on('report:ready', () => setReportReady(true));
    socket.on('server:error', ({ message }) => setError(message));

    return () => socket.disconnect();
  }, [interviewId, pushTerminal]);

  const emit = useCallback((event, payload) => new Promise((resolve) => {
    socketRef.current?.emit(event, payload, (res) => {
      if (res && !res.ok) setError(res.error);
      else setError('');
      resolve(res);
    });
  }), []);

  const actions = {
    sendCode: useCallback((code, cursorLine) => socketRef.current?.emit('code:change', { code, cursorLine }), []),
    runCode: useCallback((code, cursorLine) => emit('code:run', { code, cursorLine }), [emit]),
    say: useCallback((text, viaVoice = false) => {
      setMessages((list) => [...list, { id: crypto.randomUUID(), role: 'candidate', kind: 'message', text, meta: { viaVoice } }]);
      return emit('candidate:message', { text, viaVoice });
    }, [emit]),
    bargeIn: useCallback(() => socketRef.current?.emit('candidate:barge-in'), []),
    requestReview: useCallback(() => emit('ai:review'), [emit]),
    requestHint: useCallback(() => emit('hint:request'), [emit]),
    end: useCallback(() => emit('interview:end'), [emit]),
    dismissInterruption: useCallback(() => setInterruption(null), []),
  };

  return { status, error, session, initialCode, messages, terminal, run, interruption, reportReady, hints, ...actions };
}
