import Editor from '@monaco-editor/react';
import { useEffect, useRef } from 'react';

const THEME = 'whiteboard-dark';

function defineTheme(monaco) {
  monaco.editor.defineTheme(THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5d6880', fontStyle: 'italic' },
      { token: 'keyword', foreground: '8fb4ff' },
      { token: 'string', foreground: '7ce0b4' },
      { token: 'number', foreground: 'ffb38a' },
      { token: 'type', foreground: 'c4a7ff' },
    ],
    colors: {
      'editor.background': '#10131a',
      'editor.foreground': '#e6e9f0',
      'editor.lineHighlightBackground': '#1b202c',
      'editorLineNumber.foreground': '#3a4356',
      'editorLineNumber.activeForeground': '#a3acbf',
      'editorCursor.foreground': '#7ce0b4',
      'editor.selectionBackground': '#2b4a40',
      'editorIndentGuide.background1': '#1b202c',
      'editorGutter.background': '#10131a',
      'scrollbarSlider.background': '#272e3d80',
    },
  });
}

/**
 * Monaco wrapper. Uncontrolled after mount: the parent reads the buffer through `editorRef`
 * and is told about edits (debounced) and cursor moves via `onChange(code, cursorLine)`.
 */
export default function CodeEditor({ language, initialValue, readOnly, highlight, onChange, editorRef }) {
  const monacoRef = useRef(null);
  const decorations = useRef(null);
  const timer = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const notify = (immediate = false) => {
    clearTimeout(timer.current);
    const fire = () => {
      const editor = editorRef.current;
      if (editor) onChangeRef.current?.(editor.getValue(), editor.getPosition()?.lineNumber || 1);
    };
    if (immediate) fire();
    else timer.current = setTimeout(fire, 350);
  };

  const handleMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorations.current = editor.createDecorationsCollection([]);
    editor.onDidChangeModelContent(() => notify());
    editor.focus();
  };

  // Paint the lines the interviewer is pointing at and scroll them into view.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !decorations.current) return;
    if (!highlight) {
      decorations.current.clear();
      return;
    }
    const lineCount = editor.getModel()?.getLineCount() || 1;
    const start = Math.min(highlight.startLine, lineCount);
    const end = Math.min(Math.max(highlight.endLine, start), lineCount);
    decorations.current.set([{
      range: new monaco.Range(start, 1, end, 1),
      options: { isWholeLine: true, className: 'interrupt-line', glyphMarginClassName: 'interrupt-glyph', overviewRuler: { color: '#ff8a5c', position: monaco.editor.OverviewRulerLane.Full } },
    }]);
    editor.revealLinesInCenterIfOutsideViewport(start, end);
  }, [highlight, editorRef]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Editor
      height="100%"
      theme={THEME}
      language={language}
      defaultValue={initialValue}
      beforeMount={defineTheme}
      onMount={handleMount}
      loading={<div className="p-4 font-mono text-sm text-ink-400">Loading editor…</div>}
      options={{
        readOnly,
        fontSize: 14,
        fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
        fontLigatures: true,
        minimap: { enabled: false },
        glyphMargin: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: language === 'javascript' ? 2 : 4,
        automaticLayout: true,
        padding: { top: 14, bottom: 14 },
        renderLineHighlight: 'line',
        wordWrap: language === 'markdown' ? 'on' : 'off',
        bracketPairColorization: { enabled: true },
      }}
    />
  );
}
