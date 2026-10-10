import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { memoryTransport } from '../../src/shared/bus';
import { SpeechModule } from '../../src/sidepanel/voice';
import {
  startOrchestrator,
  createMockHead,
  createMockEngine,
  type MockHeadModule,
  type MockEngineModule,
  type Orchestrator,
} from '../../src/sidepanel/orchestrator';
import type { Intent, SpeechEvent, OverlayState, Gear } from '../../src/shared/contract';

export function VoiceDevHarness() {
  const [[tSidepanel, tContent]] = useState(() => memoryTransport());
  const [speechModule, setSpeechModule] = useState<SpeechModule | null>(null);
  const [orchestrator, setOrchestrator] = useState<Orchestrator | null>(null);
  const [mockHead, setMockHead] = useState<MockHeadModule | null>(null);
  const [mockEngine, setMockEngine] = useState<MockEngineModule | null>(null);

  const [simText, setSimText] = useState('click the second blue button');
  const [isInterim, setIsInterim] = useState(false);
  const [events, setEvents] = useState<SpeechEvent[]>([]);
  const [parsedIntent, setParsedIntent] = useState<Intent | null>(null);
  const [overlayState, setOverlayState] = useState<OverlayState | null>(null);
  const [mode, setMode] = useState<'command' | 'dictation'>('command');
  const [lang, setLang] = useState('en-IN');
  const [level, setLevel] = useState(0);
  const [noiseFloor, setNoiseFloor] = useState(0.05);
  const [recognizerActive, setRecognizerActive] = useState(false);
  const [selectedGear, setSelectedGear] = useState<Gear>('hop');

  useEffect(() => {
    const orch = startOrchestrator({ transport: tSidepanel, initialGear: selectedGear });
    const head = createMockHead(tSidepanel);
    const engine = createMockEngine(tContent);
    const mod = new SpeechModule(tSidepanel, { lang, enableAudioLevel: true });

    setOrchestrator(orch);
    setMockHead(head);
    setMockEngine(engine);
    setSpeechModule(mod);

    // Track speech events
    const offSpeech = tSidepanel.on('speech', (ev) => {
      setEvents((prev) => [ev, ...prev.slice(0, 19)]);
      if (ev.t === 'speech.level') {
        setLevel(ev.level);
        setNoiseFloor(ev.noiseFloor);
      }
    });

    // Track overlay state broadcast
    const offOverlay = tSidepanel.on('overlay', (st) => {
      setOverlayState(st);
    });

    mod.onIntent((intent) => {
      setParsedIntent(intent);
      orch.handleIntent(intent);
    });

    return () => {
      offSpeech();
      offOverlay();
      orch.stop();
      head.destroy();
      engine.destroy();
      mod.stop();
    };
  }, []);

  const handleSimulate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!speechModule || !simText.trim()) return;

    speechModule.setMode(mode);
    const intent = speechModule.simulateUtterance(simText.trim(), { interim: isInterim });
    setParsedIntent(intent);
    if (intent && orchestrator) {
      orchestrator.handleIntent(intent);
    }
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

  // Replay helpers for the 3 outcomes with both gears
  const replayOutcome = (status: 'one' | 'many' | 'none', gear: Gear) => {
    if (!mockHead || !mockEngine || !speechModule || !orchestrator) return;

    // 1. Aim head into top-left quadrant
    mockHead.sendQuadrant('TL');

    // 2. Switch gear
    if (gear === 'hop') {
      orchestrator.handleIntent({ k: 'control', name: 'hop_mode' });
    } else {
      orchestrator.handleIntent({ k: 'control', name: 'voice_mode' });
    }

    // 3. Setup mock engine outcome
    mockEngine.setResolveBehavior((req) => {
      if (status === 'one') {
        mockEngine.simulateResolveResult(req.id, 'one', [
          {
            id: 'btn_2',
            label: 'Blue Button 2',
            role: 'button',
            rect: { x: 120, y: 150, w: 80, h: 40 },
          },
        ]);
      } else if (status === 'many') {
        mockEngine.simulateResolveResult(req.id, 'many', [
          {
            id: 'btn_1',
            label: 'Blue Button 1',
            role: 'button',
            rect: { x: 100, y: 100, w: 80, h: 40 },
            number: 1,
          },
          {
            id: 'btn_2',
            label: 'Blue Button 2',
            role: 'button',
            rect: { x: 200, y: 100, w: 80, h: 40 },
            number: 2,
          },
        ]);
      } else {
        mockEngine.simulateResolveResult(req.id, 'none', []);
      }
    });

    // 4. Simulate voice utterance: "click the second blue button"
    setSimText('click the second blue button');
    speechModule.simulateUtterance('click the second blue button');
  };

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto' }}>
      <h1>🎤 Voice Dev Harness & Orchestrator Replay</h1>
      <p style={{ color: '#666' }}>
        P3: State machine testbed, speech recognition, and resolve outcome scenario replay.
      </p>

      {/* Replay Scenario Panel */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#1e40af' }}>
          Scenario Replay: <em>"click the second blue button"</em>
        </h3>
        <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#1e3a8a' }}>
          Simulates head aiming in quadrant TL, locks on speech, and drives through resolve outcomes:
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => replayOutcome('one', 'hop')}
            style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            ▶ Replay: ONE Match (Acts Immediately)
          </button>
          <button
            onClick={() => replayOutcome('many', 'hop')}
            style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            ▶ Replay: MANY Matches [HOP Gear]
          </button>
          <button
            onClick={() => replayOutcome('many', 'voice')}
            style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            ▶ Replay: MANY Matches [VOICE Gear]
          </button>
          <button
            onClick={() => replayOutcome('none', 'hop')}
            style={{ padding: '8px 14px', background: '#475569', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            ▶ Replay: NONE Matches (Fallback Ladder)
          </button>
        </div>

        {/* Shifter Actions when in Disambiguate */}
        {overlayState?.phase === 'DISAMBIGUATE' && (
          <div style={{ marginTop: 12, padding: 10, background: '#fff', borderRadius: 6, border: '1px solid #cbd5e1' }}>
            <strong>Disambiguation Controls: </strong>
            {overlayState.gear === 'hop' ? (
              <>
                <button
                  onClick={() => mockHead?.sendFlick('right')}
                  style={{ marginRight: 6, padding: '4px 10px' }}
                >
                  Head Flick Right (Next)
                </button>
                <button
                  onClick={() => mockHead?.sendNod()}
                  style={{ padding: '4px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4 }}
                >
                  Head Nod (Select)
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => orchestrator?.handleIntent({ k: 'number', n: 2 })}
                  style={{ padding: '4px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4 }}
                >
                  Say "two" / Pick Badge 2
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* State Machine Status HUD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Phase</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#0f172a' }}>{overlayState?.phase || 'IDLE'}</div>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Gear</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#0f172a' }}>{overlayState?.gear?.toUpperCase() || 'HOP'}</div>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Quadrant</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#0f172a' }}>
            {overlayState?.quadrant || 'None'} {overlayState?.quadrantLocked ? '🔒 (Locked)' : ''}
          </div>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Matches Found</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#0f172a' }}>{overlayState?.matches.length || 0}</div>
        </div>
      </div>

      {/* Audio & Recognition Bar */}
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
            onChange={(e) => {
              const m = e.target.value as 'command' | 'dictation';
              setMode(m);
              speechModule?.setMode(m);
            }}
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
            onChange={(e) => {
              setLang(e.target.value);
              speechModule?.setLanguage(e.target.value);
            }}
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
      <div style={{ marginBottom: 20, background: '#fafafa', border: '1px solid #ddd', padding: 14, borderRadius: 8 }}>
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
            Mic: {(level * 100).toFixed(1)}% | Noise Floor: {(noiseFloor * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Typed Input Simulator */}
      <form onSubmit={handleSimulate} style={{ marginBottom: 20 }}>
        <h3>Typed-Text Simulation Input</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={simText}
            onChange={(e) => setSimText(e.target.value)}
            placeholder="Type utterance..."
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

      {/* Live OverlayState and Intent Inspection */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ padding: 14, background: '#1e293b', color: '#f8fafc', borderRadius: 8 }}>
          <h4 style={{ margin: '0 0 8px 0' }}>OverlayState</h4>
          <pre style={{ margin: 0, fontSize: 12, fontFamily: 'monospace', maxHeight: 180, overflowY: 'auto' }}>
            {overlayState ? JSON.stringify(overlayState, null, 2) : '(No state)'}
          </pre>
        </div>
        <div style={{ padding: 14, background: '#1e293b', color: '#f8fafc', borderRadius: 8 }}>
          <h4 style={{ margin: '0 0 8px 0' }}>Last Parsed Intent</h4>
          <pre style={{ margin: 0, fontSize: 12, fontFamily: 'monospace', maxHeight: 180, overflowY: 'auto' }}>
            {parsedIntent ? JSON.stringify(parsedIntent, null, 2) : '(No intent)'}
          </pre>
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<VoiceDevHarness />);
