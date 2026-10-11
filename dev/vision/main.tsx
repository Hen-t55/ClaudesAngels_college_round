import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { memoryTransport } from '../../src/shared/bus';
import type { HeadEvent, Quadrant, HeadMode, ImpairmentConfig } from '../../src/shared/contract';
import { createHeadModule, VisionModuleHandle } from '../../src/sidepanel/vision';
import { RECOMMENDED_IMPAIRMENT_PRESETS } from '../../src/sidepanel/vision/ImpairmentInjector';
import { VisionErrorState } from '../../src/sidepanel/vision/HeadTracker';
import { TrialManager, TrialRecord } from './TrialManager';

export function VisionDevHarness() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moduleHandleRef = useRef<VisionModuleHandle | null>(null);

  const [isCameraStarted, setIsCameraStarted] = useState(false);
  const [isSimulator, setIsSimulator] = useState(false);
  const [mode, setModeState] = useState<HeadMode>('quadrant');

  // Tuning thresholds
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

  // Error State Demonstration
  const [activeErrorState, setActiveErrorState] = useState<VisionErrorState>('none');

  // Soak Test Monitor State
  const [soakRunning, setSoakRunning] = useState(false);
  const [soakElapsedSec, setSoakElapsedSec] = useState(0);
  const [soakFrameCount, setSoakFrameCount] = useState(0);
  const [soakMaxDrift, setSoakMaxDrift] = useState(0);

  // Impairment controls state
  const [impairmentLevel, setImpairmentLevel] = useState<0 | 1 | 2>(0);
  const [impairment, setImpairment] = useState<ImpairmentConfig>({
    seed: 42,
    tremorAmp: 0.035,
    tremorHz: [4, 7],
    brightness: 0.5,
    dropFramePct: 15,
  });

  // Recording & Trial state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedJSON, setRecordedJSON] = useState<string | null>(null);

  // Trial Manager state
  const trialManagerRef = useRef<TrialManager>(new TrialManager('Tester 1', 'normal'));
  const [testerName, setTesterName] = useState('Tester 1');
  const [lightingCondition, setLightingCondition] = useState<'normal' | 'low_light'>('normal');
  const [trialAction, setTrialAction] = useState<TrialRecord['action']>('nod');
  const [trialHits, setTrialHits] = useState(0);
  const [trialMisses, setTrialMisses] = useState(0);
  const [trialFalsePositives, setTrialFalsePositives] = useState(0);
  const [exportedTrialJSON, setExportedTrialJSON] = useState<string | null>(null);

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
          if (soakRunning) {
            setSoakFrameCount((fc) => fc + 1);
            const drift = Math.sqrt(Math.pow(evt.x - 0.5, 2) + Math.pow(evt.y - 0.5, 2));
            setSoakMaxDrift((prev) => Math.max(prev, drift));
          }
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
  }, [soakRunning]);

  // Soak Test Timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (soakRunning) {
      interval = setInterval(() => {
        setSoakElapsedSec((s) => s + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [soakRunning]);

  const handleStartCamera = async () => {
    if (!moduleHandleRef.current) return;
    try {
      await moduleHandleRef.current.tracker.start(videoRef.current || undefined);
      setIsCameraStarted(true);
      requestCanvasRender();
    } catch (err) {
      console.error('Failed to start camera:', err);
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

  const handleTriggerErrorState = (errType: VisionErrorState) => {
    setActiveErrorState(errType);
    if (!moduleHandleRef.current) return;
    moduleHandleRef.current.tracker.simulateErrorState(errType);
  };

  const handleToggleSoakTest = () => {
    if (!soakRunning) {
      setSoakElapsedSec(0);
      setSoakFrameCount(0);
      setSoakMaxDrift(0);
      setSoakRunning(true);
    } else {
      setSoakRunning(false);
    }
  };

  const handleApplyPreset = (level: 0 | 1 | 2) => {
    setImpairmentLevel(level);
    if (!moduleHandleRef.current) return;
    if (level === 0) {
      moduleHandleRef.current.tracker.setImpairment(null);
    } else {
      const preset = RECOMMENDED_IMPAIRMENT_PRESETS[level];
      const cfg: ImpairmentConfig = { seed: impairment.seed, ...preset };
      setImpairment(cfg);
      moduleHandleRef.current.tracker.setImpairment(cfg);
    }
  };

  const handleLogTrial = () => {
    const trial: TrialRecord = {
      action: trialAction,
      expectedCount: trialAction === 'neutral_reading' ? 0 : trialHits + trialMisses,
      hits: trialHits,
      misses: trialMisses,
      falsePositives: trialFalsePositives,
    };
    trialManagerRef.current.addTrial(trial);
    setTrialHits(0);
    setTrialMisses(0);
    setTrialFalsePositives(0);
  };

  const handleExportTrialJSON = () => {
    trialManagerRef.current.setTester(testerName);
    trialManagerRef.current.setLighting(lightingCondition);
    const json = trialManagerRef.current.exportSessionJSON();
    setExportedTrialJSON(json);
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

  const trialStats = trialManagerRef.current.calculateStats();

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh' }}>
      <header style={{ marginBottom: 12, borderBottom: '1px solid #334155', paddingBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#38bdf8' }}>🎥 Vision Dev Harness - Prompt 6 Polish & Robustness</h1>
        <p style={{ margin: '2px 0 0 0', color: '#94a3b8', fontSize: 12 }}>
          Error States, Auto-Recovery, Tab Throttling, Soak Test Monitor, and Buffer Allocation Verification
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 480px', gap: 14 }}>
        {/* Left Column */}
        <div>
          {/* Main Controls Bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {!isCameraStarted ? (
              <button onClick={handleStartCamera} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
                ▶ Start Webcam
              </button>
            ) : (
              <button onClick={handleStopCamera} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
                ⏹ Stop Webcam
              </button>
            )}

            <button onClick={handleStartSetup} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
              🛠️ Start Setup
            </button>

            <button onClick={handleToggleSoakTest} style={{ background: soakRunning ? '#f59e0b' : '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
              {soakRunning ? '⏹ Stop Soak Test' : '⏱️ Run 10-Min Soak Test'}
            </button>

            {!isRecording ? (
              <button onClick={handleStartRecording} style={{ background: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                🔴 Record Trace
              </button>
            ) : (
              <button onClick={handleStopRecording} style={{ background: '#d97706', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                ⏹ Export Trace
              </button>
            )}
          </div>

          {/* Error State Demonstrator Bar */}
          <div style={{ background: '#1e293b', border: '1px solid #334155', padding: 8, borderRadius: 6, marginBottom: 10, fontSize: 12 }}>
            <span style={{ fontWeight: 600, color: '#f8fafc', marginRight: 8 }}>Demonstrate Error State:</span>
            <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
              {(['none', 'permission_denied', 'camera_busy', 'no_face', 'disconnected'] as VisionErrorState[]).map((err) => (
                <button
                  key={err}
                  onClick={() => handleTriggerErrorState(err)}
                  style={{
                    background: activeErrorState === err ? '#ef4444' : '#334155',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {err.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Soak Test Monitor Panel */}
          {soakRunning && (
            <div style={{ background: '#064e3b', border: '1px solid #10b981', padding: 10, borderRadius: 6, marginBottom: 10, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#a7f3d0' }}>
                <span>⏱️ 10-Minute Soak Test Running</span>
                <span>Elapsed: {Math.floor(soakElapsedSec / 60)}m {soakElapsedSec % 60}s</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 6, textAlign: 'center', fontSize: 11 }}>
                <div style={{ background: '#022c22', padding: 4, borderRadius: 4 }}>Frames: <b>{soakFrameCount}</b></div>
                <div style={{ background: '#022c22', padding: 4, borderRadius: 4 }}>FPS: <b>{quality.fps} FPS</b></div>
                <div style={{ background: '#022c22', padding: 4, borderRadius: 4 }}>Drift: <b>{soakMaxDrift.toFixed(3)}</b></div>
              </div>
            </div>
          )}

          {/* Setup Progress */}
          {setupState && (
            <div style={{ background: '#1e1b4b', border: '1px solid #6366f1', padding: 8, borderRadius: 6, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
                <span style={{ color: '#a5b4fc' }}>Setup Step: {setupState.step.toUpperCase()}</span>
                <span>{(setupState.progress * 100).toFixed(0)}%</span>
              </div>
              <div style={{ fontSize: 12, color: setupState.ok === false ? '#f87171' : '#e0e7ff', marginTop: 4 }}>
                {setupState.prompt}
              </div>
            </div>
          )}

          {/* Viewport Canvas */}
          <div style={{ position: 'relative', width: '100%', height: 380, backgroundColor: '#020617', borderRadius: 8, overflow: 'hidden', border: '2px solid #334155' }}>
            <video ref={videoRef} style={{ display: 'none' }} />
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isCameraStarted ? 0.7 : 0.2 }} />

            {/* Quadrant Highlights */}
            <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', pointerEvents: 'none' }}>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'TL' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', padding: 6, fontWeight: 700, color: activeQuadrant === 'TL' ? '#38bdf8' : '#64748b', fontSize: 11 }}>
                TL {activeQuadrant === 'TL' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'TR' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', textAlign: 'right', padding: 6, fontWeight: 700, color: activeQuadrant === 'TR' ? '#38bdf8' : '#64748b', fontSize: 11 }}>
                TR {activeQuadrant === 'TR' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'BL' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', display: 'flex', alignItems: 'flex-end', padding: 6, fontWeight: 700, color: activeQuadrant === 'BL' ? '#38bdf8' : '#64748b', fontSize: 11 }}>
                BL {activeQuadrant === 'BL' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'BR' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 6, fontWeight: 700, color: activeQuadrant === 'BR' ? '#38bdf8' : '#64748b', fontSize: 11 }}>
                BR {activeQuadrant === 'BR' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
            </div>

            {/* Pointer Dot */}
            <div style={{ position: 'absolute', left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%`, width: 14, height: 14, borderRadius: '50%', backgroundColor: '#f43f5e', boxShadow: '0 0 10px #f43f5e', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Quality Metrics */}
          <div style={{ background: '#1e293b', padding: 10, borderRadius: 6, border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#38bdf8' }}>📊 Performance & Quality</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center', fontSize: 11 }}>
              <div style={{ background: '#090d16', padding: 4, borderRadius: 4 }}>
                <div style={{ color: '#94a3b8' }}>FPS</div>
                <div style={{ fontWeight: 700, color: quality.fps >= 30 ? '#4ade80' : '#f87171' }}>{quality.fps}</div>
              </div>
              <div style={{ background: '#090d16', padding: 4, borderRadius: 4 }}>
                <div style={{ color: '#94a3b8' }}>Jitter</div>
                <div style={{ fontWeight: 700, color: '#38bdf8' }}>{quality.jitter.toFixed(3)}</div>
              </div>
              <div style={{ background: '#090d16', padding: 4, borderRadius: 4 }}>
                <div style={{ color: '#94a3b8' }}>Luma</div>
                <div style={{ fontWeight: 700, color: '#fbbf24' }}>{(quality.brightness * 100).toFixed(0)}%</div>
              </div>
              <div style={{ background: '#090d16', padding: 4, borderRadius: 4 }}>
                <div style={{ color: '#94a3b8' }}>Conf</div>
                <div style={{ fontWeight: 700, color: '#4ade80' }}>{(quality.faceConf * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>

          {/* Chaos Lab Presets */}
          <div style={{ background: '#1e293b', padding: 10, borderRadius: 6, border: '1px solid #334155', fontSize: 11 }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#f8fafc' }}>🧪 Chaos Lab Presets</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => handleApplyPreset(0)} style={{ flex: 1, background: impairmentLevel === 0 ? '#0284c7' : '#334155', color: '#fff', border: 'none', padding: '4px 6px', borderRadius: 4, cursor: 'pointer' }}>Normal</button>
              <button onClick={() => handleApplyPreset(1)} style={{ flex: 1, background: impairmentLevel === 1 ? '#eab308' : '#334155', color: '#fff', border: 'none', padding: '4px 6px', borderRadius: 4, cursor: 'pointer' }}>Mild (L1)</button>
              <button onClick={() => handleApplyPreset(2)} style={{ flex: 1, background: impairmentLevel === 2 ? '#ef4444' : '#334155', color: '#fff', border: 'none', padding: '4px 6px', borderRadius: 4, cursor: 'pointer' }}>Severe (L2)</button>
            </div>
          </div>

          {/* Live Event Log */}
          <div style={{ background: '#1e293b', padding: 10, borderRadius: 6, border: '1px solid #334155', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#f8fafc' }}>📜 Live Event Stream</h3>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 180, background: '#090d16', padding: 6, borderRadius: 4, fontSize: 10, fontFamily: 'monospace' }}>
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
