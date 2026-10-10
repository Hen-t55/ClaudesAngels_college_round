import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { memoryTransport } from '../../src/shared/bus';
import { SpeechModule, parseIntent } from '../../src/sidepanel/voice';
import type { Intent, SpeechEvent } from '../../src/shared/contract';

export function VoiceDevHarness() {
  const [transport] = useState(() => memoryTransport()[0]);
  const [speechModule, setSpeechModule] = useState<SpeechModule | null>(null);
  const [simText, setSimText] = useState('');
  const [isInterim, setIsInterim] = useState(false);
  const [events, setEvents] = useState<SpeechEvent[]>([]);
  const [parsedIntent, setParsedIntent] = useState<Intent | null>(null);
  const [mode, setMode] = useState<'command' | 'dictation'>('command');
  const [lang, setLang] = useState('en-IN');
  const [level, setLevel] = useState(0);
  const [noiseFloor, setNoiseFloor] = useState(0.05);
  const [recognizerActive, setRecognizerActive] = useState(false);

  useEffect(() => {
    const mod = new SpeechModule(transport, { lang, enableAudioLevel: true });
    setSpeechModule(mod);

    const offSpeech = transport.on('speech', (ev) => {
      setEvents((prev) => [ev, ...prev.slice(0, 19)]);
      if (ev.t === 'speech.level') {
        setLevel(ev.level);
        setNoiseFloor(ev.noiseFloor);
      }
    });

    mod.onIntent((intent) => {
      setParsedIntent(intent);
    });

    return () => {
      offSpeech();
      mod.stop();
    };
  }, []);

  const handleSimulate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!speechModule || !simText.trim()) return;

    speechModule.setMode(mode);
    const intent = speechModule.simulateUtterance(simText.trim(), { interim: isInterim });
    setParsedIntent(intent);
  };

  const toggleMic = () => {
    if (!speechModule) return;
    if (recognizerActive) {
      speechModule.stop();
      setRecognizerActive(false);
    } else {
      speechModule.start();
      setRecognizerActive(true);
    }
  };

  const handleModeChange = (newMode: 'command' | 'dictation') => {
    setMode(newMode);
    speechModule?.setMode(newMode);
  };

  const handleLangChange = (newLang: string) => {
    setLang(newLang);
    speechModule?.setLanguage(newLang);
  };

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 800, margin: '0 auto' }}>
      <h1>🎤 Voice Dev Harness & Parser Sandbox</h1>
      <p style={{ color: '#666' }}>P3: Speech recognition, audio level monitoring, and Intent parser testing.</p>

      {/* Controls Bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
        <button
          onClick={toggleMic}
          style={{
            padding: '8px 16px',
            backgroundColor: recognizerActive ? '#ef4444' : '#22c55e',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          {recognizerActive ? '🛑 Stop Recognizer' : '🎙️ Start Mic'}
        </button>

        <label>
          Mode:
          <select
            value={mode}
            onChange={(e) => handleModeChange(e.target.value as 'command' | 'dictation')}
            style={{ marginLeft: 6, padding: 4 }}
          >
            <option value="command">Command Mode</option>
            <option value="dictation">Dictation Mode</option>
          </select>
        </label>

        <label>
          Language:
          <select
            value={lang}
            onChange={(e) => handleLangChange(e.target.value)}
            style={{ marginLeft: 6, padding: 4 }}
          >
            <option value="en-IN">en-IN (India / English)</option>
            <option value="en-US">en-US (US English)</option>
            <option value="en-GB">en-GB (UK English)</option>
          </select>
        </label>

        <span style={{ fontSize: 13, color: recognizerActive ? '#16a34a' : '#666' }}>
          Status: {recognizerActive ? 'Listening (Auto-restart active)' : 'Idle'}
        </span>
      </div>

      {/* Noise Level Meter */}
      <div style={{ marginBottom: 20, background: '#fafafa', border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: 15 }}>Audio Level & Noise Floor</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 16, background: '#e5e7eb', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, level * 100)}%`,
                backgroundColor: level > 0.6 ? '#ef4444' : '#3b82f6',
                transition: 'width 0.1s ease',
              }}
            />
            {/* Noise floor marker */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${Math.min(100, noiseFloor * 100)}%`,
                width: 2,
                backgroundColor: '#f59e0b',
              }}
              title="Noise Floor"
            />
          </div>
          <span style={{ fontSize: 13, fontFamily: 'monospace' }}>
            Mic: {(level * 100).toFixed(1)}% | Floor: {(noiseFloor * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Text Simulator Form */}
      <form onSubmit={handleSimulate} style={{ marginBottom: 24 }}>
        <h3>Typed-Text Simulation Input</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={simText}
            onChange={(e) => setSimText(e.target.value)}
            placeholder="Type utterance (e.g., 'click the second blue button', 'scroll down', 'four')..."
            style={{ flex: 1, padding: '10px 14px', fontSize: 15, borderRadius: 6, border: '1px solid #ccc' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={isInterim}
              onChange={(e) => setIsInterim(e.target.checked)}
            />
            Interim
          </label>
          <button
            type="submit"
            style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Simulate
          </button>
        </div>
      </form>

      {/* Live Parsed Intent Display */}
      <div style={{ marginBottom: 24, padding: 16, background: '#1e293b', color: '#f8fafc', borderRadius: 8 }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: 16 }}>Live Parsed Intent</h3>
        <pre style={{ margin: 0, fontSize: 14, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          {parsedIntent ? JSON.stringify(parsedIntent, null, 2) : '(No intent parsed yet)'}
        </pre>
      </div>

      {/* Event Stream Log */}
      <div>
        <h3>Recent Speech Events Bus Log</h3>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, maxHeight: 220, overflowY: 'auto' }}>
          {events.length === 0 && <span style={{ color: '#94a3b8' }}>No events emitted yet.</span>}
          {events.map((ev, i) => (
            <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontFamily: 'monospace' }}>
              <strong>[{ev.t}]</strong> {JSON.stringify(ev)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<VoiceDevHarness />);
