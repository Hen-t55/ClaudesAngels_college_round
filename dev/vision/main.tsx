import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { memoryTransport } from '../../src/shared/bus';
import type { HeadEvent, Quadrant, HeadMode, ImpairmentConfig } from '../../src/shared/contract';
import { createHeadModule, VisionModuleHandle } from '../../src/sidepanel/vision';

export function VisionDevHarness() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleHandleRef = useRef<VisionModuleHandle | null>(null);

  const [isCameraStarted, setIsCameraStarted] = useState(false);
  const [isSimulator, setIsSimulator] = useState(false);
  const [mode, setModeState] = useState<HeadMode>('quadrant');

  // Tuning parameters
  const [minCutoff, setMinCutoff] = useState(1.0);
  const [beta, setBeta] = useState(0.007);
  const [gain, setGain] = useState(2.2);
  const [deadzone, setDeadzone] = useState(0.02);

  // Setup Wizard state
  const [setupState, setSetupState] = useState<{ step: string; progress: number; prompt: string; ok?: boolean } | null>(null);

  // Quality metrics state
  const [quality, setQuality] = useState<{ jitter: number; brightness: number; faceConf: number; fps: number }>({
    jitter: 0,
    brightness: 0.85,
    faceConf: 0.95,
    fps: 0,
  });

  // Impairment controls state
  const [impairment, setImpairment] = useState<ImpairmentConfig>({
    seed: 42,
    tremorAmp: 0.05,
    tremorHz: [6, 10],
    brightness: 0.7,
    dropFramePct: 0,
  });
  const [isImpairmentActive, setIsImpairmentActive] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedJSON, setRecordedJSON] = useState<string | null>(null);

  // Live telemetry
  const [activeQuadrant, setActiveQuadrant] = useState<Quadrant | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [isFacing, setIsFacing] = useState(true);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const [eventLog, setEventLog] = useState<{ id: number; text: string; ts: string }[]>([]);

  useEffect(() => {
    const [sidepanelBus, devBus] = memoryTransport();
    const handle = createHeadModule(sidepanelBus);
    moduleHandleRef.current = handle;

    let logCounter = 0;
    const unsub = devBus.on('head.event', (evt: HeadEvent) => {
      const ts = new Date().toLocaleTimeString();
      let desc = '';

      switch (evt.t) {
        case 'head.pointer':
          setPointer({ x: evt.x, y: evt.y });
          return;
        case 'head.quadrant':
          setActiveQuadrant(evt.q);
          setIsStable(evt.stable);
          desc = `Quadrant -> ${evt.q || 'None'} (${evt.stable ? 'STABLE' : 'DWELLING'})`;
          break;
        case 'head.facing':
          setIsFacing(evt.facing);
          desc = `Facing -> ${evt.facing ? 'LOOKING AT SCREEN' : 'LOOK-AWAY / LOST'}`;
          break;
        case 'head.flick':
          desc = `⚡ FLICK (${evt.dir.toUpperCase()})`;
          break;
        case 'head.nod':
          desc = `✅ NOD (Yes)`;
          break;
        case 'head.shake':
          desc = `❌ SHAKE (No)`;
          break;
        case 'head.quality':
          setQuality({ jitter: evt.jitter, brightness: evt.brightness, faceConf: evt.faceConf, fps: evt.fps });
          return;
        case 'head.setup':
          setSetupState({ step: evt.step, progress: evt.progress, prompt: evt.prompt, ok: evt.ok });
          desc = `🛠️ SETUP [${evt.step.toUpperCase()}]: ${evt.prompt}`;
          break;
      }

      setEventLog((prev) => [
        { id: ++logCounter, text: desc, ts },
        ...prev.slice(0, 30),
      ]);
    });

    return () => {
      unsub();
      handle.tracker.stop();
    };
  }, []);

  const handleStartCamera = async () => {
    if (!moduleHandleRef.current) return;
    try {
      await moduleHandleRef.current.tracker.start(videoRef.current || undefined);
      setIsCameraStarted(true);
      requestCanvasRender();
    } catch (err) {
      console.error('Failed to start camera:', err);
      alert('Could not access webcam.');
    }
  };

  const handleStopCamera = () => {
    if (!moduleHandleRef.current) return;
    moduleHandleRef.current.tracker.stop();
    setIsCameraStarted(false);
  };

  const handleStartSetup = () => {
    if (!moduleHandleRef.current) return;
    moduleHandleRef.current.tracker.startSetup(performance.now());
  };

  const handleToggleImpairment = (active: boolean) => {
    setIsImpairmentActive(active);
    moduleHandleRef.current?.tracker.setImpairment(active ? impairment : null);
  };

  const handleStartRecording = () => {
    if (!moduleHandleRef.current) return;
    moduleHandleRef.current.tracker.poseRecorder.startRecording(performance.now());
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    if (!moduleHandleRef.current) return;
    const jsonStr = moduleHandleRef.current.tracker.poseRecorder.exportJSON(performance.now());
    setRecordedJSON(jsonStr);
    setIsRecording(false);
  };

  const requestCanvasRender = () => {
    const draw = () => {
      const tracker = moduleHandleRef.current?.tracker;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (tracker && video && canvas && isCameraStarted) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      }
      if (isCameraStarted) {
        requestAnimationFrame(draw);
      }
    };
    requestAnimationFrame(draw);
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 20, backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh' }}>
      <header style={{ marginBottom: 16, borderBottom: '1px solid #334155', paddingBottom: 10 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: '#38bdf8' }}>🎥 Vision Dev Harness (P1 - Prompt 4)</h1>
        <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: 13 }}>
          Setup Wizard, Quality Signals, Seeded Impairments & Pose Session Recorder
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 440px', gap: 16 }}>
        {/* Left Column: Viewport & Setup Wizard */}
        <div>
          {/* Controls Bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {!isCameraStarted ? (
              <button onClick={handleStartCamera} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                ▶ Start Webcam
              </button>
            ) : (
              <button onClick={handleStopCamera} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                ⏹ Stop Webcam
              </button>
            )}

            <button onClick={handleStartSetup} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              🛠️ Start Setup Wizard
            </button>

            {!isRecording ? (
              <button onClick={handleStartRecording} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                🔴 Record Pose Session
              </button>
            ) : (
              <button onClick={handleStopRecording} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                ⏹ Stop & Export JSON
              </button>
            )}
          </div>

          {/* Setup Wizard Progress Display */}
          {setupState && (
            <div style={{ background: '#1e1b4b', border: '1px solid #6366f1', padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: '#a5b4fc' }}>Setup Step: {setupState.step.toUpperCase()}</span>
                <span>{(setupState.progress * 100).toFixed(0)}%</span>
              </div>
              <div style={{ background: '#312e81', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ background: '#818cf8', width: `${setupState.progress * 100}%`, height: '100%', transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 13, color: setupState.ok === false ? '#f87171' : '#e0e7ff' }}>
                {setupState.prompt}
              </div>
            </div>
          )}

          {/* 2x2 Viewport */}
          <div style={{ position: 'relative', width: '100%', height: 420, backgroundColor: '#020617', borderRadius: 10, overflow: 'hidden', border: '2px solid #334155' }}>
            <video ref={videoRef} style={{ display: 'none' }} />
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isCameraStarted ? 0.7 : 0.2 }} />

            {/* Quadrants Grid */}
            <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', pointerEvents: 'none' }}>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'TL' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', padding: 8, fontWeight: 700, color: activeQuadrant === 'TL' ? '#38bdf8' : '#64748b' }}>
                TL {activeQuadrant === 'TL' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'TR' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', textAlign: 'right', padding: 8, fontWeight: 700, color: activeQuadrant === 'TR' ? '#38bdf8' : '#64748b' }}>
                TR {activeQuadrant === 'TR' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'BL' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', display: 'flex', alignItems: 'flex-end', padding: 8, fontWeight: 700, color: activeQuadrant === 'BL' ? '#38bdf8' : '#64748b' }}>
                BL {activeQuadrant === 'BL' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'BR' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 8, fontWeight: 700, color: activeQuadrant === 'BR' ? '#38bdf8' : '#64748b' }}>
                BR {activeQuadrant === 'BR' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
            </div>

            {/* Pointer Dot */}
            <div style={{ position: 'absolute', left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%`, width: 14, height: 14, borderRadius: '50%', backgroundColor: '#f43f5e', boxShadow: '0 0 10px #f43f5e', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Right Column: Quality & Impairments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Quality Metrics Panel */}
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 14, color: '#38bdf8' }}>📊 Live Quality Metrics (head.quality ~500ms)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center', fontSize: 12 }}>
              <div style={{ background: '#090d16', padding: 6, borderRadius: 6 }}>
                <div style={{ color: '#94a3b8' }}>FPS</div>
                <div style={{ fontWeight: 700, color: quality.fps >= 30 ? '#4ade80' : '#f87171' }}>{quality.fps}</div>
              </div>
              <div style={{ background: '#090d16', padding: 6, borderRadius: 6 }}>
                <div style={{ color: '#94a3b8' }}>Jitter</div>
                <div style={{ fontWeight: 700, color: '#38bdf8' }}>{quality.jitter.toFixed(3)}</div>
              </div>
              <div style={{ background: '#090d16', padding: 6, borderRadius: 6 }}>
                <div style={{ color: '#94a3b8' }}>Luma</div>
                <div style={{ fontWeight: 700, color: '#fbbf24' }}>{(quality.brightness * 100).toFixed(0)}%</div>
              </div>
              <div style={{ background: '#090d16', padding: 6, borderRadius: 6 }}>
                <div style={{ color: '#94a3b8' }}>Face Conf</div>
                <div style={{ fontWeight: 700, color: '#4ade80' }}>{(quality.faceConf * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>

          {/* Seeded Impairments Controls */}
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155', fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#f8fafc' }}>🧪 Seeded Impairment Controls</h3>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={isImpairmentActive} onChange={(e) => handleToggleImpairment(e.target.checked)} />
                <span style={{ fontWeight: 600, color: isImpairmentActive ? '#f43f5e' : '#94a3b8' }}>Active</span>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label>PRNG Seed:</label>
                <input type="number" value={impairment.seed} onChange={(e) => setImpairment({ ...impairment, seed: parseInt(e.target.value) || 0 })} style={{ width: '100%', background: '#090d16', border: '1px solid #334155', color: '#fff', padding: 4, borderRadius: 4 }} />
              </div>
              <div>
                <label>Tremor Amp:</label>
                <input type="number" step="0.01" value={impairment.tremorAmp} onChange={(e) => setImpairment({ ...impairment, tremorAmp: parseFloat(e.target.value) || 0 })} style={{ width: '100%', background: '#090d16', border: '1px solid #334155', color: '#fff', padding: 4, borderRadius: 4 }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Drop Frame %:</span><b>{impairment.dropFramePct}%</b>
              </div>
              <input type="range" min="0" max="80" step="5" value={impairment.dropFramePct} onChange={(e) => setImpairment({ ...impairment, dropFramePct: parseInt(e.target.value) || 0 })} style={{ width: '100%' }} />
            </div>
          </div>

          {/* Recorded JSON Session Data */}
          {recordedJSON && (
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155' }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#10b981' }}>Recorded Pose JSON Ready</h4>
              <textarea readOnly value={recordedJSON} style={{ width: '100%', height: 70, background: '#090d16', color: '#a7f3d0', border: '1px solid #334155', borderRadius: 4, fontSize: 10, fontFamily: 'monospace' }} />
            </div>
          )}

          {/* Live Event Stream */}
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 14, color: '#f8fafc' }}>📜 Event Log</h3>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 180, background: '#090d16', padding: 6, borderRadius: 4, fontSize: 11, fontFamily: 'monospace' }}>
              {eventLog.map((log) => (
                <div key={log.id} style={{ marginBottom: 2, color: '#38bdf8' }}>
                  <span style={{ color: '#64748b' }}>[{log.ts}]</span> {log.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<VisionDevHarness />);
}
