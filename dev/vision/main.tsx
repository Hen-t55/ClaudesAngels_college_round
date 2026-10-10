import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { memoryTransport } from '../../src/shared/bus';
import type { HeadEvent, Quadrant, HeadMode } from '../../src/shared/contract';
import { createHeadModule, VisionModuleHandle } from '../../src/sidepanel/vision';

export function VisionDevHarness() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleHandleRef = useRef<VisionModuleHandle | null>(null);

  const [isCameraStarted, setIsCameraStarted] = useState(false);
  const [isSimulator, setIsSimulator] = useState(false);
  const [mode, setModeState] = useState<HeadMode>('quadrant');

  // Tuning sliders
  const [minCutoff, setMinCutoff] = useState(1.0);
  const [beta, setBeta] = useState(0.007);
  const [gain, setGain] = useState(2.2);
  const [deadzone, setDeadzone] = useState(0.02);
  const [flickVel, setFlickVel] = useState(2.2);
  const [nodDelta, setNodDelta] = useState(0.08);
  const [shakeDelta, setShakeDelta] = useState(0.10);

  // Live telemetry & Counters
  const [fps, setFps] = useState(0);
  const [activeQuadrant, setActiveQuadrant] = useState<Quadrant | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [isFacing, setIsFacing] = useState(true);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  const [counters, setCounters] = useState({
    flicks: 0,
    nods: 0,
    shakes: 0,
    facingChanges: 0,
  });

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
          setCounters((prev) => ({ ...prev, facingChanges: prev.facingChanges + 1 }));
          desc = `Facing -> ${evt.facing ? 'LOOKING AT SCREEN' : 'LOOK-AWAY / LOST'}`;
          break;
        case 'head.flick':
          setCounters((prev) => ({ ...prev, flicks: prev.flicks + 1 }));
          desc = `⚡ FLICK (${evt.dir.toUpperCase()})`;
          break;
        case 'head.nod':
          setCounters((prev) => ({ ...prev, nods: prev.nods + 1 }));
          desc = `✅ NOD (Yes)`;
          break;
        case 'head.shake':
          setCounters((prev) => ({ ...prev, shakes: prev.shakes + 1 }));
          desc = `❌ SHAKE (No)`;
          break;
        case 'head.quality':
          setFps(evt.fps);
          return;
        case 'head.setup':
          desc = `Setup: ${evt.step} - ${evt.prompt}`;
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

  const handleToggleSimulator = (enabled: boolean) => {
    if (!moduleHandleRef.current) return;
    setIsSimulator(enabled);
    moduleHandleRef.current.setSimulatorActive(enabled);
  };

  const handleSetMode = (newMode: HeadMode) => {
    setModeState(newMode);
    moduleHandleRef.current?.tracker.setMode(newMode);
  };

  const updateTrackerParams = (
    newMinCutoff = minCutoff,
    newBeta = beta,
    newGain = gain,
    newDeadzone = deadzone,
    newFlickVel = flickVel,
    newNodDelta = nodDelta,
    newShakeDelta = shakeDelta
  ) => {
    if (!moduleHandleRef.current) return;
    const tracker = moduleHandleRef.current.tracker;
    tracker.setFilterParams(newMinCutoff, newBeta, newGain, newDeadzone);
    tracker.gestureAnalyzer.setConfig({
      flickVelocityThreshold: newFlickVel,
      nodDeltaThreshold: newNodDelta,
      shakeDeltaThreshold: newShakeDelta,
    });
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
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh' }}>
      <header style={{ marginBottom: 20, borderBottom: '1px solid #334155', paddingBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 26, color: '#38bdf8' }}>🎥 Handsfree Vision Dev Harness (P1 - Prompt 3)</h1>
        <p style={{ margin: '6px 0 0 0', color: '#94a3b8' }}>
          Pointer Gain/Deadzone, Quadrant Hysteresis, Dwell Stability, and Gesture Counters
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 20 }}>
        {/* Left Column: Viewport & Hysteresis Grid */}
        <div>
          {/* Controls Bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {!isCameraStarted ? (
              <button onClick={handleStartCamera} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                ▶ Start Webcam
              </button>
            ) : (
              <button onClick={handleStopCamera} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                ⏹ Stop Webcam
              </button>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: '#1e293b', padding: '6px 12px', borderRadius: 6, fontSize: 13 }}>
              <input type="checkbox" checked={isSimulator} onChange={(e) => handleToggleSimulator(e.target.checked)} />
              <span>🎮 Simulator</span>
            </label>

            <button onClick={() => moduleHandleRef.current?.tracker.recenter()} style={{ background: '#334155', color: '#f8fafc', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              🎯 Recenter Baseline
            </button>

            {/* Mode selector */}
            <div style={{ display: 'flex', background: '#1e293b', borderRadius: 6, overflow: 'hidden', border: '1px solid #334155' }}>
              {(['quadrant', 'locked', 'off'] as HeadMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => handleSetMode(m)}
                  style={{
                    background: mode === m ? '#0284c7' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* 2x2 Viewport with Hysteresis Band Overlay */}
          <div style={{ position: 'relative', width: '100%', height: 460, backgroundColor: '#020617', borderRadius: 12, overflow: 'hidden', border: '2px solid #334155' }}>
            <video ref={videoRef} style={{ display: 'none' }} />
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isCameraStarted ? 0.7 : 0.2 }} />

            {/* Hysteresis Band (0.45 to 0.55 zone) */}
            <div style={{ position: 'absolute', left: '45%', width: '10%', top: 0, bottom: 0, backgroundColor: 'rgba(234, 179, 8, 0.08)', borderLeft: '1px dotted #eab308', borderRight: '1px dotted #eab308', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: '45%', height: '10%', left: 0, right: 0, backgroundColor: 'rgba(234, 179, 8, 0.08)', borderTop: '1px dotted #eab308', borderBottom: '1px dotted #eab308', pointerEvents: 'none' }} />

            {/* Quadrants Grid */}
            <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', pointerEvents: 'none' }}>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'TL' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', padding: 10, fontWeight: 700, color: activeQuadrant === 'TL' ? '#38bdf8' : '#64748b' }}>
                TOP_LEFT (TL) [Q] {activeQuadrant === 'TL' && (isStable ? '✓ STABLE' : '⌛ DWELLING...')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'TR' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', textAlign: 'right', padding: 10, fontWeight: 700, color: activeQuadrant === 'TR' ? '#38bdf8' : '#64748b' }}>
                TOP_RIGHT (TR) [E] {activeQuadrant === 'TR' && (isStable ? '✓ STABLE' : '⌛ DWELLING...')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'BL' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', display: 'flex', alignItems: 'flex-end', padding: 10, fontWeight: 700, color: activeQuadrant === 'BL' ? '#38bdf8' : '#64748b' }}>
                BOTTOM_LEFT (BL) [Z] {activeQuadrant === 'BL' && (isStable ? '✓ STABLE' : '⌛ DWELLING...')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'BR' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 10, fontWeight: 700, color: activeQuadrant === 'BR' ? '#38bdf8' : '#64748b' }}>
                BOTTOM_RIGHT (BR) [C] {activeQuadrant === 'BR' && (isStable ? '✓ STABLE' : '⌛ DWELLING...')}
              </div>
            </div>

            {/* Pointer Dot */}
            <div style={{ position: 'absolute', left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%`, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#f43f5e', boxShadow: '0 0 10px #f43f5e', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
          </div>

          {/* Gesture Counters Dashboard */}
          <div style={{ marginTop: 14, background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: '#38bdf8' }}>📊 Gesture Counters</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, textAlign: 'center' }}>
              <div style={{ background: '#090d16', padding: 8, borderRadius: 6 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>⚡ Flicks</div><div style={{ fontSize: 18, fontWeight: 700, color: '#38bdf8' }}>{counters.flicks}</div></div>
              <div style={{ background: '#090d16', padding: 8, borderRadius: 6 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>✅ Nods</div><div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80' }}>{counters.nods}</div></div>
              <div style={{ background: '#090d16', padding: 8, borderRadius: 6 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>❌ Shakes</div><div style={{ fontSize: 18, fontWeight: 700, color: '#f43f5e' }}>{counters.shakes}</div></div>
              <div style={{ background: '#090d16', padding: 8, borderRadius: 6 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>👀 Look-Away</div><div style={{ fontSize: 18, fontWeight: 700, color: '#fbbf24' }}>{counters.facingChanges}</div></div>
            </div>
          </div>
        </div>

        {/* Right Column: Tuning Controls & Event Log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Sliders Panel */}
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, border: '1px solid #334155', fontSize: 12 }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 15, color: '#f8fafc' }}>🎛️ Pointer & Gesture Tuning</h3>

            {/* Gain Slider */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span>Pointer Gain:</span><b>{gain.toFixed(1)}x</b>
              </div>
              <input type="range" min="0.5" max="5.0" step="0.1" value={gain} onChange={(e) => { const v = parseFloat(e.target.value); setGain(v); updateTrackerParams(minCutoff, beta, v, deadzone); }} style={{ width: '100%' }} />
            </div>

            {/* Deadzone Slider */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span>Deadzone Radius:</span><b>{deadzone.toFixed(3)} rad</b>
              </div>
              <input type="range" min="0.00" max="0.10" step="0.005" value={deadzone} onChange={(e) => { const v = parseFloat(e.target.value); setDeadzone(v); updateTrackerParams(minCutoff, beta, gain, v); }} style={{ width: '100%' }} />
            </div>

            {/* minCutoff Slider */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span>OneEuro minCutoff:</span><b>{minCutoff.toFixed(2)} Hz</b>
              </div>
              <input type="range" min="0.1" max="5.0" step="0.1" value={minCutoff} onChange={(e) => { const v = parseFloat(e.target.value); setMinCutoff(v); updateTrackerParams(v, beta); }} style={{ width: '100%' }} />
            </div>

            {/* Flick Velocity Slider */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span>Flick Velocity Threshold:</span><b>{flickVel.toFixed(1)} rad/s</b>
              </div>
              <input type="range" min="1.0" max="5.0" step="0.1" value={flickVel} onChange={(e) => { const v = parseFloat(e.target.value); setFlickVel(v); updateTrackerParams(minCutoff, beta, gain, deadzone, v); }} style={{ width: '100%' }} />
            </div>
          </div>

          {/* Live Event Log */}
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, border: '1px solid #334155', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 15, color: '#f8fafc' }}>📜 Live Event Stream</h3>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 220, background: '#090d16', padding: 8, borderRadius: 6, fontSize: 11, fontFamily: 'monospace' }}>
              {eventLog.length === 0 ? (
                <div style={{ color: '#64748b' }}>No events recorded...</div>
              ) : (
                eventLog.map((log) => (
                  <div key={log.id} style={{ marginBottom: 3, color: '#38bdf8' }}>
                    <span style={{ color: '#64748b' }}>[{log.ts}]</span> {log.text}
                  </div>
                ))
              )}
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
