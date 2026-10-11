import React, { useState, useEffect, useRef } from 'react';
import type { Transport } from '../../shared/bus';
import type {
  Phase, Gear, Quadrant, HeadEvent, SpeechEvent, OverlayState
} from '../../shared/contract';
import { SetupWizard } from './SetupWizard';
import { SettingsScreen } from './SettingsScreen';
import { CheatSheet } from './CheatSheet';

export interface AppProps {
  transport?: Transport;
}

export type SidepanelTab = 'monitor' | 'settings' | 'cheatsheet' | 'wizard';

export function App({ transport }: AppProps) {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<SidepanelTab>('monitor');

  // Status & State
  const [phase, setPhase] = useState<Phase>('AIMING');
  const [gear, setGear] = useState<Gear>('voice');
  const [gearReason, setGearReason] = useState<string>('Voice quality good (SNR 22dB)');
  const [quadrant, setQuadrant] = useState<Quadrant | null>('TL');
  const [quadrantLocked, setQuadrantLocked] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [listening, setListening] = useState<boolean>(true);

  // Vision / Head Quality
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [headPos, setHeadPos] = useState<{ x: number; y: number }>({ x: 0.35, y: 0.42 });
  const [jitter, setJitter] = useState<number>(0.04);
  const [brightness, setBrightness] = useState<number>(0.78);
  const [faceConf, setFaceConf] = useState<number>(0.96);
  const [fps, setFps] = useState<number>(31.4);

  // Speech / Audio
  const [micLevel, setMicLevel] = useState<number>(0.42);
  const [noiseFloor, setNoiseFloor] = useState<number>(0.15);
  const [liveTranscript, setLiveTranscript] = useState<string>('click add to cart');
  const [transcriptFinal, setTranscriptFinal] = useState<boolean>(true);
  const [confidence, setConfidence] = useState<number>(0.92);

  // Command History Log
  const [commandLog, setCommandLog] = useState<Array<{ id: string; time: string; text: string; kind: 'cmd' | 'gesture' | 'system' }>>([
    { id: '1', time: '12:00:01', text: 'Head tracking calibrated', kind: 'system' },
    { id: '2', time: '12:00:15', text: 'Quadrant locked: TL', kind: 'gesture' },
    { id: '3', time: '12:00:18', text: 'Action: click "add to cart"', kind: 'cmd' },
  ]);

  // Canvas ref for camera simulation
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Bus event listener
  useEffect(() => {
    if (!transport) return;

    const unsubs = [
      transport.on('overlay', (st: OverlayState) => {
        setPhase(st.phase);
        setGear(st.gear);
        if (st.gearReason) setGearReason(st.gearReason);
        setQuadrant(st.quadrant);
        setQuadrantLocked(st.quadrantLocked);
        setPaused(st.paused);
        setListening(st.listening);
        if (st.transcript) setLiveTranscript(st.transcript);
      }),
      transport.on('head.event', (evt: HeadEvent) => {
        if (evt.t === 'head.pointer') setHeadPos({ x: evt.x, y: evt.y });
        if (evt.t === 'head.quadrant') {
          setQuadrant(evt.q);
          setQuadrantLocked(!evt.stable);
        }
        if (evt.t === 'head.quality') {
          setJitter(evt.jitter);
          setBrightness(evt.brightness);
          setFaceConf(evt.faceConf);
          setFps(evt.fps);
        }
        if (evt.t === 'head.flick') {
          addLogEntry(`Flick gesture: ${evt.dir}`, 'gesture');
        }
      }),
      transport.on('speech', (evt: SpeechEvent) => {
        if (evt.t === 'speech.onset') {
          setListening(true);
        }
        if (evt.t === 'speech.level') {
          setMicLevel(evt.level);
          setNoiseFloor(evt.noiseFloor);
        }
        if (evt.t === 'speech.result') {
          setLiveTranscript(evt.text);
          setTranscriptFinal(evt.final);
          setConfidence(evt.confidence);
          if (evt.final) {
            addLogEntry(`Utterance: "${evt.text}"`, 'cmd');
          }
        }
      }),
    ];

    return () => unsubs.forEach(u => u());
  }, [transport]);

  // Fallback Mock Ticker: Keep meters subtly moving if no live messages arrive
  useEffect(() => {
    const timer = setInterval(() => {
      setFps(f => +(30 + Math.sin(Date.now() / 1000) * 1.5).toFixed(1));
      setMicLevel(l => +(0.2 + Math.abs(Math.sin(Date.now() / 700)) * 0.45).toFixed(2));
      setJitter(j => +(0.03 + Math.random() * 0.02).toFixed(3));
    }, 400);
    return () => clearInterval(timer);
  }, []);

  // Draw Camera Mesh simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dark webcam viewport
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Vignette
    const grad = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 20,
      canvas.width / 2, canvas.height / 2, canvas.width / 2
    );
    grad.addColorStop(0, '#131b2e');
    grad.addColorStop(1, '#050811');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width * headPos.x;
    const cy = canvas.height * headPos.y;

    // Head silhouette
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Facial Landmarks overlay
    if (showLandmarks) {
      // Eyes
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.arc(cx - 11, cy - 8, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 11, cy - 8, 3, 0, Math.PI * 2); ctx.fill();

      // Nose bridge and tip
      ctx.beginPath(); ctx.arc(cx, cy + 2, 2.5, 0, Math.PI * 2); ctx.fill();

      // Mouth contour
      ctx.beginPath();
      ctx.arc(cx, cy + 14, 8, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();

      // Orientation axis vector
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 14, cy - 10);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [headPos, showLandmarks]);

  const addLogEntry = (text: string, kind: 'cmd' | 'gesture' | 'system') => {
    const time = new Date().toLocaleTimeString();
    setCommandLog(prev => [{ id: Math.random().toString(), time, text, kind }, ...prev.slice(0, 19)]);
  };

  const handleRecenter = () => {
    setHeadPos({ x: 0.5, y: 0.5 });
    addLogEntry('Head pose manual recenter', 'system');
    transport?.send('head.command', { t: 'head.recenter' });
  };

  const handleTogglePause = () => {
    setPaused(!paused);
    addLogEntry(!paused ? 'System paused' : 'System resumed', 'system');
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 font-sans text-xs selection:bg-sky-500 selection:text-white">
      {/* Top Header */}
      <header className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]"></div>
          <span className="font-extrabold text-sm tracking-wide text-white">HANDSFREE</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">MV3</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('monitor')}
            className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${
              activeTab === 'monitor' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Monitor
          </button>
          <button
            onClick={() => setActiveTab('cheatsheet')}
            className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${
              activeTab === 'cheatsheet' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Cheat Sheet
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${
              activeTab === 'settings' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Settings
          </button>
          <button
            onClick={() => setActiveTab('wizard')}
            className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${
              activeTab === 'wizard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Wizard
          </button>
        </div>
      </header>

      {/* Main Content Area based on Active Tab */}
      <div className="flex-1 overflow-hidden p-3">
        {activeTab === 'monitor' && (
          <div className="flex flex-col h-full overflow-y-auto space-y-3 pr-0.5">
            {/* Status HUD Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Orchestrator Phase</span>
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${paused ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-sky-950 text-sky-400 border border-sky-800'}`}>
                    {paused ? 'PAUSED' : phase}
                  </span>
                  <button
                    onClick={handleTogglePause}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[10px] border border-slate-700"
                  >
                    {paused ? 'Resume' : 'Pause'}
                  </button>
                </div>
              </div>

              {/* Quadrant & Shifter Grid */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                {/* Quadrant Mini Map */}
                <div className="bg-slate-950/70 p-2 rounded border border-slate-800 flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] text-slate-400 font-bold">QUADRANT</span>
                    <span className={`text-[10px] font-extrabold ${quadrantLocked ? 'text-amber-400' : 'text-sky-400'}`}>
                      {quadrantLocked ? '🔒 LOCKED' : quadrant ?? 'NONE'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 w-full h-12">
                    {(['TL', 'TR', 'BL', 'BR'] as Quadrant[]).map(q => (
                      <div
                        key={q}
                        className={`rounded flex items-center justify-center text-[9px] font-bold border transition-all ${
                          quadrant === q
                            ? quadrantLocked
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                              : 'bg-sky-500/20 border-sky-400 text-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                            : 'bg-slate-900 border-slate-800 text-slate-600'
                        }`}
                      >
                        {q}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Shifter Gear */}
                <div className="bg-slate-950/70 p-2 rounded border border-slate-800 flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-slate-400 font-bold">SHIFTER</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${gear === 'hop' ? 'bg-blue-950 text-blue-400 border border-blue-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'}`}>
                      {gear.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-300 leading-tight">
                    {gear === 'hop' ? '⇄ Flick head to move focus' : '🎙 Say badge number to select'}
                  </div>
                  <div className="text-[9px] text-slate-500 truncate" title={gearReason}>
                    {gearReason}
                  </div>
                </div>
              </div>
            </div>

            {/* Camera View & Face Tracker */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Head Pose & Vision</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer text-[10px] text-slate-400 hover:text-slate-200">
                    <input
                      type="checkbox"
                      checked={showLandmarks}
                      onChange={e => setShowLandmarks(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-sky-500"
                    />
                    Landmarks
                  </label>
                  <button
                    onClick={handleRecenter}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[10px] border border-slate-700"
                  >
                    Recenter
                  </button>
                </div>
              </div>

              <div className="relative w-full h-32 rounded overflow-hidden border border-slate-800 bg-slate-950">
                <canvas ref={canvasRef} width={280} height={128} className="w-full h-full object-cover" />
                <div className="absolute top-1.5 left-1.5 bg-black/60 px-1.5 py-0.5 rounded text-[9px] font-mono text-emerald-400">
                  {fps} FPS
                </div>
              </div>

              {/* Quality Metrics */}
              <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
                  <div className="text-slate-500 text-[9px]">Jitter</div>
                  <div className="font-bold text-slate-200">{jitter.toFixed(3)}</div>
                </div>
                <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
                  <div className="text-slate-500 text-[9px]">Brightness</div>
                  <div className="font-bold text-slate-200">{Math.round(brightness * 100)}%</div>
                </div>
                <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
                  <div className="text-slate-500 text-[9px]">Face Conf</div>
                  <div className="font-bold text-emerald-400">{Math.round(faceConf * 100)}%</div>
                </div>
              </div>
            </div>

            {/* Audio & Speech Meter */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Acoustic & Noise Floor</span>
                <span className={`text-[10px] font-bold flex items-center gap-1 ${listening ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <span className={`w-2 h-2 rounded-full ${listening ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
                  {listening ? 'LISTENING' : 'MUTED'}
                </span>
              </div>

              {/* VU Meter Bar */}
              <div className="space-y-1">
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                    style={{ left: `${Math.round(noiseFloor * 100)}%` }}
                    title="Noise floor threshold"
                  />
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-sky-400 to-amber-500 transition-all duration-75"
                    style={{ width: `${Math.min(100, Math.round(micLevel * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>0 dB</span>
                  <span>Floor: {Math.round(noiseFloor * 100)}%</span>
                  <span>Peak: {Math.round(micLevel * 100)}%</span>
                </div>
              </div>

              {/* Live Transcript Box */}
              <div className="bg-slate-950/80 p-2 rounded border border-slate-800 space-y-1">
                <div className="flex justify-between items-center text-[9px] text-slate-400">
                  <span>LIVE TRANSCRIPT</span>
                  <span className="text-emerald-400 font-bold">{Math.round(confidence * 100)}% Conf</span>
                </div>
                <div className={`font-medium ${transcriptFinal ? 'text-white' : 'text-slate-400 italic'}`}>
                  "{liveTranscript}"
                </div>
              </div>
            </div>

            {/* Action History Log */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Command Log</span>
                <button
                  onClick={() => transport?.send('engine.request', { t: 'engine.undo' })}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[10px] border border-slate-700"
                >
                  Undo
                </button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-[10px] pr-1">
                {commandLog.map(log => (
                  <div key={log.id} className="flex justify-between items-start text-slate-300 py-0.5 border-b border-slate-800/40">
                    <span className="truncate pr-2">{log.text}</span>
                    <span className="text-slate-500 shrink-0">{log.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <SettingsScreen
            transport={transport}
            onOpenWizard={() => setActiveTab('wizard')}
          />
        )}

        {activeTab === 'cheatsheet' && (
          <CheatSheet />
        )}

        {activeTab === 'wizard' && (
          <SetupWizard
            transport={transport}
            onComplete={() => setActiveTab('monitor')}
            onCancel={() => setActiveTab('monitor')}
          />
        )}
      </div>

      {/* Footer Status Bar */}
      <footer className="px-3 py-1.5 bg-slate-950 border-t border-slate-800/80 flex justify-between items-center text-[10px] text-slate-500">
        <span>Handsfree v0.1.0</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          Ready
        </span>
      </footer>
    </div>
  );
}
