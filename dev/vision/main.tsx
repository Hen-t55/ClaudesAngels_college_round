import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { memoryTransport } from '../../src/shared/bus';
import type { HeadEvent, Quadrant, HeadMode, ImpairmentConfig } from '../../src/shared/contract';
import { createHeadModule, VisionModuleHandle } from '../../src/sidepanel/vision';
import { RECOMMENDED_IMPAIRMENT_PRESETS } from '../../src/sidepanel/vision/ImpairmentInjector';
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
  const [flickVel, setFlickVel] = useState(2.2);
  const [nodDelta, setNodDelta] = useState(0.08);
  const [shakeDelta, setShakeDelta] = useState(0.10);

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
  const [loggedTrials, setLoggedTrials] = useState<TrialRecord[]>([]);
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

  const updateThresholds = (
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

  const handleLogTrial = () => {
    const trial: TrialRecord = {
      action: trialAction,
      expectedCount: trialAction === 'neutral_reading' ? 0 : trialHits + trialMisses,
      hits: trialHits,
      misses: trialMisses,
      falsePositives: trialFalsePositives,
    };
    trialManagerRef.current.addTrial(trial);
    setLoggedTrials(trialManagerRef.current.getTrials());
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
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 18, backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh' }}>
      <header style={{ marginBottom: 14, borderBottom: '1px solid #334155', paddingBottom: 10 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: '#38bdf8' }}>🎥 Vision Dev Harness & Chaos Lab (P1)</h1>
        <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: 13 }}>
          Tuning Dashboard, Trial Logger (Hits/Misses/FP), and Chaos Lab Impairment Presets
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 480px', gap: 16 }}>
        {/* Left Column: Viewport, Trial Logger & Controls */}
        <div>
          {/* Main Controls */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
              🛠️ Start Setup
            </button>

            {!isRecording ? (
              <button onClick={handleStartRecording} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                🔴 Record Trace
              </button>
            ) : (
              <button onClick={handleStopRecording} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                ⏹ Export Trace
              </button>
            )}

            <button onClick={() => moduleHandleRef.current?.tracker.recenter()} style={{ background: '#334155', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              🎯 Recenter
            </button>
          </div>

          {/* Setup Progress if active */}
          {setupState && (
            <div style={{ background: '#1e1b4b', border: '1px solid #6366f1', padding: 10, borderRadius: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
                <span style={{ color: '#a5b4fc' }}>Setup Step: {setupState.step.toUpperCase()}</span>
                <span>{(setupState.progress * 100).toFixed(0)}%</span>
              </div>
              <div style={{ background: '#312e81', height: 6, borderRadius: 3, margin: '6px 0' }}>
                <div style={{ background: '#818cf8', width: `${setupState.progress * 100}%`, height: '100%' }} />
              </div>
              <div style={{ fontSize: 12, color: setupState.ok === false ? '#f87171' : '#e0e7ff' }}>
                {setupState.prompt}
              </div>
            </div>
          )}

          {/* Viewport Canvas with Quadrant Overlays */}
          <div style={{ position: 'relative', width: '100%', height: 380, backgroundColor: '#020617', borderRadius: 10, overflow: 'hidden', border: '2px solid #334155' }}>
            <video ref={videoRef} style={{ display: 'none' }} />
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isCameraStarted ? 0.7 : 0.2 }} />

            {/* Hysteresis Band (0.45..0.55) */}
            <div style={{ position: 'absolute', left: '45%', width: '10%', top: 0, bottom: 0, backgroundColor: 'rgba(234, 179, 8, 0.08)', borderLeft: '1px dotted #eab308', borderRight: '1px dotted #eab308', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: '45%', height: '10%', left: 0, right: 0, backgroundColor: 'rgba(234, 179, 8, 0.08)', borderTop: '1px dotted #eab308', borderBottom: '1px dotted #eab308', pointerEvents: 'none' }} />

            {/* Quadrant Highlights */}
            <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', pointerEvents: 'none' }}>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'TL' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', padding: 8, fontWeight: 700, color: activeQuadrant === 'TL' ? '#38bdf8' : '#64748b', fontSize: 12 }}>
                TL {activeQuadrant === 'TL' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'TR' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', textAlign: 'right', padding: 8, fontWeight: 700, color: activeQuadrant === 'TR' ? '#38bdf8' : '#64748b', fontSize: 12 }}>
                TR {activeQuadrant === 'TR' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'BL' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', display: 'flex', alignItems: 'flex-end', padding: 8, fontWeight: 700, color: activeQuadrant === 'BL' ? '#38bdf8' : '#64748b', fontSize: 12 }}>
                BL {activeQuadrant === 'BL' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
              <div style={{ border: '1px dashed #475569', backgroundColor: activeQuadrant === 'BR' ? (isStable ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.2)') : 'transparent', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 8, fontWeight: 700, color: activeQuadrant === 'BR' ? '#38bdf8' : '#64748b', fontSize: 12 }}>
                BR {activeQuadrant === 'BR' && (isStable ? '✓ STABLE' : '⌛ DWELL')}
              </div>
            </div>

            {/* Pointer Dot */}
            <div style={{ position: 'absolute', left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%`, width: 14, height: 14, borderRadius: '50%', backgroundColor: '#f43f5e', boxShadow: '0 0 10px #f43f5e', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
          </div>

          {/* Quick Trial Mode Logger */}
          <div style={{ marginTop: 12, background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#38bdf8' }}>📝 Record a Trial (Hit / Miss / False-Positive)</h3>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Accuracy: <b style={{ color: '#4ade80' }}>{(trialStats.accuracy * 100).toFixed(1)}%</b> | FP Rate: <b style={{ color: '#f87171' }}>{(trialStats.falsePositiveRate * 100).toFixed(1)}%</b>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8, fontSize: 12 }}>
              <div>
                <label>Tester:</label>
                <select value={testerName} onChange={(e) => setTesterName(e.target.value)} style={{ width: '100%', background: '#090d16', color: '#fff', border: '1px solid #334155', padding: 4, borderRadius: 4 }}>
                  <option value="Tester 1">Tester 1</option>
                  <option value="Tester 2">Tester 2</option>
                  <option value="Tester 3">Tester 3</option>
                  <option value="Custom Tester">Custom Tester</option>
                </select>
              </div>

              <div>
                <label>Lighting:</label>
                <select value={lightingCondition} onChange={(e) => setLightingCondition(e.target.value as 'normal' | 'low_light')} style={{ width: '100%', background: '#090d16', color: '#fff', border: '1px solid #334155', padding: 4, borderRadius: 4 }}>
                  <option value="normal">Normal (Daylight)</option>
                  <option value="low_light">Low Light (Dim)</option>
                </select>
              </div>

              <div>
                <label>Target Action:</label>
                <select value={trialAction} onChange={(e) => setTrialAction(e.target.value as TrialRecord['action'])} style={{ width: '100%', background: '#090d16', color: '#fff', border: '1px solid #334155', padding: 4, borderRadius: 4 }}>
                  <option value="nod">Nod (Yes)</option>
                  <option value="shake">Shake (No)</option>
                  <option value="flick_up">Flick Up</option>
                  <option value="flick_down">Flick Down</option>
                  <option value="flick_left">Flick Left</option>
                  <option value="flick_right">Flick Right</option>
                  <option value="neutral_reading">Reading Neutral (FP Test)</option>
                </select>
              </div>
            </div>

            {/* Trial Counter Buttons */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <button onClick={() => setTrialHits((h) => h + 1)} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                +1 Hit ({trialHits})
              </button>
              <button onClick={() => setTrialMisses((m) => m + 1)} style={{ flex: 1, background: '#b91c1c', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                +1 Miss ({trialMisses})
              </button>
              <button onClick={() => setTrialFalsePositives((fp) => fp + 1)} style={{ flex: 1, background: '#c2410c', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                +1 False Positive ({trialFalsePositives})
              </button>
              <button onClick={handleLogTrial} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                Save Trial
              </button>
              <button onClick={handleExportTrialJSON} style={{ background: '#475569', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                Export JSON
              </button>
            </div>

            {/* Exported JSON Modal/Textarea */}
            {exportedTrialJSON && (
              <div style={{ marginTop: 8 }}>
                <textarea readOnly value={exportedTrialJSON} style={{ width: '100%', height: 70, background: '#090d16', color: '#38bdf8', border: '1px solid #334155', borderRadius: 4, fontSize: 10, fontFamily: 'monospace' }} />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Chaos Lab Impairments, Tuning & Quality */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Quality Telemetry */}
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#38bdf8' }}>📊 Quality Metrics (~500ms)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center', fontSize: 11 }}>
              <div style={{ background: '#090d16', padding: 6, borderRadius: 4 }}>
                <div style={{ color: '#94a3b8' }}>FPS</div>
                <div style={{ fontWeight: 700, color: quality.fps >= 30 ? '#4ade80' : '#f87171' }}>{quality.fps}</div>
              </div>
              <div style={{ background: '#090d16', padding: 6, borderRadius: 4 }}>
                <div style={{ color: '#94a3b8' }}>Jitter</div>
                <div style={{ fontWeight: 700, color: '#38bdf8' }}>{quality.jitter.toFixed(3)}</div>
              </div>
              <div style={{ background: '#090d16', padding: 6, borderRadius: 4 }}>
                <div style={{ color: '#94a3b8' }}>Luma</div>
                <div style={{ fontWeight: 700, color: '#fbbf24' }}>{(quality.brightness * 100).toFixed(0)}%</div>
              </div>
              <div style={{ background: '#090d16', padding: 6, borderRadius: 4 }}>
                <div style={{ color: '#94a3b8' }}>Confidence</div>
                <div style={{ fontWeight: 700, color: '#4ade80' }}>{(quality.faceConf * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>

          {/* Chaos Lab Impairment Presets */}
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155', fontSize: 12 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#f8fafc' }}>🧪 Chaos Lab Presets</h3>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button
                onClick={() => handleApplyPreset(0)}
                style={{ flex: 1, background: impairmentLevel === 0 ? '#0284c7' : '#334155', color: '#fff', border: 'none', padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
              >
                Normal (Level 0)
              </button>
              <button
                onClick={() => handleApplyPreset(1)}
                style={{ flex: 1, background: impairmentLevel === 1 ? '#eab308' : '#334155', color: '#fff', border: 'none', padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
              >
                Mild (Level 1)
              </button>
              <button
                onClick={() => handleApplyPreset(2)}
                style={{ flex: 1, background: impairmentLevel === 2 ? '#ef4444' : '#334155', color: '#fff', border: 'none', padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
              >
                Severe (Level 2)
              </button>
            </div>
            <div style={{ color: '#94a3b8', fontSize: 11, background: '#090d16', padding: 6, borderRadius: 4 }}>
              {impairmentLevel === 0 && 'Normal: No tremor, 100% brightness, 0% frame drops.'}
              {impairmentLevel === 1 && 'Level 1: tremorAmp=0.035 (~2°), tremorHz=[4,7], brightness=0.50, dropFramePct=15%.'}
              {impairmentLevel === 2 && 'Level 2: tremorAmp=0.090 (~5°), tremorHz=[5,11], brightness=0.25, dropFramePct=40%.'}
            </div>
          </div>

          {/* Threshold Tuning Sliders */}
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #334155', fontSize: 12 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#f8fafc' }}>🎛️ Real-Person Tuned Thresholds</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Gain:</span><b>{gain.toFixed(1)}x</b>
                </div>
                <input type="range" min="0.5" max="5.0" step="0.1" value={gain} onChange={(e) => { const v = parseFloat(e.target.value); setGain(v); updateThresholds(minCutoff, beta, v, deadzone, flickVel, nodDelta, shakeDelta); }} style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Deadzone:</span><b>{deadzone.toFixed(3)} rad</b>
                </div>
                <input type="range" min="0.00" max="0.08" step="0.005" value={deadzone} onChange={(e) => { const v = parseFloat(e.target.value); setDeadzone(v); updateThresholds(minCutoff, beta, gain, v, flickVel, nodDelta, shakeDelta); }} style={{ width: '100%' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Flick Vel:</span><b>{flickVel.toFixed(1)} rad/s</b>
                </div>
                <input type="range" min="1.2" max="4.5" step="0.1" value={flickVel} onChange={(e) => { const v = parseFloat(e.target.value); setFlickVel(v); updateThresholds(minCutoff, beta, gain, deadzone, v, nodDelta, shakeDelta); }} style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Nod Delta:</span><b>{nodDelta.toFixed(2)} rad</b>
                </div>
                <input type="range" min="0.03" max="0.20" step="0.01" value={nodDelta} onChange={(e) => { const v = parseFloat(e.target.value); setNodDelta(v); updateThresholds(minCutoff, beta, gain, deadzone, flickVel, v, shakeDelta); }} style={{ width: '100%' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Shake Delta:</span><b>{shakeDelta.toFixed(2)} rad</b>
              </div>
              <input type="range" min="0.04" max="0.20" step="0.01" value={shakeDelta} onChange={(e) => { const v = parseFloat(e.target.value); setShakeDelta(v); updateThresholds(minCutoff, beta, gain, deadzone, flickVel, nodDelta, v); }} style={{ width: '100%' }} />
            </div>
          </div>

          {/* Event Stream */}
          <div style={{ background: '#1e293b', padding: 10, borderRadius: 8, border: '1px solid #334155', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#f8fafc' }}>📜 Live Event Stream</h3>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 140, background: '#090d16', padding: 6, borderRadius: 4, fontSize: 10, fontFamily: 'monospace' }}>
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
