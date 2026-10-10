import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { memoryTransport } from '../../src/shared/bus';
import type { HeadEvent, Quadrant } from '../../src/shared/contract';
import { createHeadModule, VisionModuleHandle } from '../../src/sidepanel/vision';

export function VisionDevHarness() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleHandleRef = useRef<VisionModuleHandle | null>(null);

  const [isCameraStarted, setIsCameraStarted] = useState(false);
  const [isSimulator, setIsSimulator] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(true);

  // Filter tuning sliders
  const [minCutoff, setMinCutoff] = useState(1.0);
  const [beta, setBeta] = useState(0.007);

  // Live telemetry display
  const [fps, setFps] = useState(0);
  const [activeQuadrant, setActiveQuadrant] = useState<Quadrant | null>(null);
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
          return; // Don't log spam pointer events
        case 'head.quadrant':
          setActiveQuadrant(evt.q);
          desc = `Quadrant -> ${evt.q || 'None'} (Stable: ${evt.stable})`;
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
          setFps(evt.fps);
          return;
        case 'head.setup':
          desc = `Setup Step: ${evt.step} - ${evt.prompt}`;
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
      console.error('Failed to start webcam:', err);
      alert('Could not start webcam. Make sure camera permissions are granted.');
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

  const handleMinCutoffChange = (val: number) => {
    setMinCutoff(val);
    moduleHandleRef.current?.tracker.setFilterParams(val, beta);
  };

  const handleBetaChange = (val: number) => {
    setBeta(val);
    moduleHandleRef.current?.tracker.setFilterParams(minCutoff, val);
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

          // Draw landmark mesh overlay if enabled
          if (showLandmarks) {
            const landmarker = tracker.getLandmarker();
            // Optional overlay drawing if landmarker active
          }
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
      <header style={{ marginBottom: 24, borderBottom: '1px solid #334155', paddingBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 28, color: '#38bdf8' }}>🎥 Handsfree Vision Dev Harness (P1)</h1>
        <p style={{ margin: '8px 0 0 0', color: '#94a3b8' }}>
          Real-time Head Tracking, One Euro Filter Tuning, and HeadSimulator Testing
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24 }}>
        {/* Left Column: Viewport & Quadrant Visualization */}
        <div>
          {/* Controls Bar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            {!isCameraStarted ? (
              <button
                onClick={handleStartCamera}
                style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
              >
                ▶ Start Webcam
              </button>
            ) : (
              <button
                onClick={handleStopCamera}
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
              >
                ⏹ Stop Webcam
              </button>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: '#1e293b', padding: '8px 12px', borderRadius: 6 }}>
              <input
                type="checkbox"
                checked={isSimulator}
                onChange={(e) => handleToggleSimulator(e.target.checked)}
              />
              <span>🎮 HeadSimulator Active</span>
            </label>

            <button
              onClick={() => moduleHandleRef.current?.tracker.recenter()}
              style={{ background: '#334155', color: '#f8fafc', border: 'none', padding: '10px 14px', borderRadius: 6, cursor: 'pointer' }}
            >
              🎯 Recenter Baseline
            </button>
          </div>

          {/* Interactive Viewport / Quadrants Container */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 480,
              backgroundColor: '#020617',
              borderRadius: 12,
              overflow: 'hidden',
              border: '2px solid #334155',
            }}
          >
            {/* Camera Video / Canvas Preview */}
            <video ref={videoRef} style={{ display: 'none' }} />
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isCameraStarted ? 0.7 : 0.2 }}
            />

            {/* 2x2 Viewport Quadrant Highlights */}
            <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', pointerEvents: 'none' }}>
              <div
                style={{
                  border: '1px dashed #475569',
                  backgroundColor: activeQuadrant === 'TL' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: 12,
                  fontWeight: 700,
                  color: activeQuadrant === 'TL' ? '#38bdf8' : '#64748b',
                }}
              >
                TOP_LEFT (TL) [Q]
              </div>
              <div
                style={{
                  border: '1px dashed #475569',
                  backgroundColor: activeQuadrant === 'TR' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-end',
                  padding: 12,
                  fontWeight: 700,
                  color: activeQuadrant === 'TR' ? '#38bdf8' : '#64748b',
                }}
              >
                TOP_RIGHT (TR) [E]
              </div>
              <div
                style={{
                  border: '1px dashed #475569',
                  backgroundColor: activeQuadrant === 'BL' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: 12,
                  fontWeight: 700,
                  color: activeQuadrant === 'BL' ? '#38bdf8' : '#64748b',
                }}
              >
                BOTTOM_LEFT (BL) [Z]
              </div>
              <div
                style={{
                  border: '1px dashed #475569',
                  backgroundColor: activeQuadrant === 'BR' ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'flex-end',
                  padding: 12,
                  fontWeight: 700,
                  color: activeQuadrant === 'BR' ? '#38bdf8' : '#64748b',
                }}
              >
                BOTTOM_RIGHT (BR) [C]
              </div>
            </div>

            {/* Simulated / Filtered Head Pointer Dot */}
            <div
              style={{
                position: 'absolute',
                left: `${pointer.x * 100}%`,
                top: `${pointer.y * 100}%`,
                width: 18,
                height: 18,
                borderRadius: '50%',
                backgroundColor: '#f43f5e',
                boxShadow: '0 0 12px #f43f5e',
                transform: 'translate(-50%, -50%)',
                transition: isSimulator ? 'none' : 'all 0.03s linear',
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* Keybindings guide for HeadSimulator */}
          {isSimulator && (
            <div style={{ marginTop: 16, background: '#1e293b', padding: 16, borderRadius: 8, borderLeft: '4px solid #38bdf8' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>🎮 HeadSimulator Controls Active:</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, color: '#cbd5e1' }}>
                <div>• <b>Q / E / Z / C</b> : Select TL / TR / BL / BR Quadrants</div>
                <div>• <b>Arrow Keys</b> : Emit Head Flick Up/Down/Left/Right</div>
                <div>• <b>N / X</b> : Emit Nod (Yes) / Shake (No)</div>
                <div>• <b>L</b> : Toggle Facing / Look-Away</div>
                <div>• <b>Mouse Movement</b> : Move Head Pointer dot</div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: One Euro Tuning & Real-time Diagnostics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Status Telemetry */}
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 10, border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#f8fafc' }}>📊 Telemetry & Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
              <div>FPS: <b style={{ color: fps >= 30 ? '#4ade80' : '#f87171' }}>{fps} FPS</b></div>
              <div>Facing: <b style={{ color: isFacing ? '#4ade80' : '#f87171' }}>{isFacing ? 'Yes' : 'Look-Away'}</b></div>
              <div>Pointer X: <b>{pointer.x.toFixed(3)}</b></div>
              <div>Pointer Y: <b>{pointer.y.toFixed(3)}</b></div>
            </div>
          </div>

          {/* One Euro Filter Tuning Sliders */}
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 10, border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#f8fafc' }}>🎛️ One Euro Filter Parameters</h3>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span>minCutoff (Stationary Jitter):</span>
                <b>{minCutoff.toFixed(2)} Hz</b>
              </div>
              <input
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={minCutoff}
                onChange={(e) => handleMinCutoffChange(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span>beta (Speed Adaptation):</span>
                <b>{beta.toFixed(4)}</b>
              </div>
              <input
                type="range"
                min="0.0005"
                max="0.05"
                step="0.0005"
                value={beta}
                onChange={(e) => handleBetaChange(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Live Event Log */}
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 10, border: '1px solid #334155', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#f8fafc' }}>📜 Live Event Stream</h3>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 240, background: '#090d16', padding: 10, borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }}>
              {eventLog.length === 0 ? (
                <div style={{ color: '#64748b' }}>No events recorded yet...</div>
              ) : (
                eventLog.map((log) => (
                  <div key={log.id} style={{ marginBottom: 4, color: '#38bdf8' }}>
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
