import React, { useState, useEffect } from 'react';
import type { Transport } from '../../shared/bus';
import type { HeadEvent, SpeechEvent } from '../../shared/contract';

export interface SetupWizardProps {
  transport?: Transport;
  onComplete?: () => void;
  onCancel?: () => void;
}

export type WizardStep = 'welcome' | 'neutral' | 'corners' | 'noise_floor' | 'complete' | 'failed';

export function SetupWizard({ transport, onComplete, onCancel }: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [progress, setProgress] = useState<number>(0);
  const [promptText, setPromptText] = useState<string>('Look directly at the center of the screen with a natural posture.');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [noiseFloorLevel, setNoiseFloorLevel] = useState<number>(0);
  const [cornerIndex, setCornerIndex] = useState<number>(0); // 0: TL, 1: TR, 2: BR, 3: BL
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Elapsed timer tracking
  useEffect(() => {
    let timer: any = null;
    if (startTime && step !== 'complete' && step !== 'failed') {
      timer = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    }
    return () => clearInterval(timer);
  }, [startTime, step]);

  // Subscribe to transport events
  useEffect(() => {
    if (!transport) return;

    const unsubs = [
      transport.on('head.event', (evt: HeadEvent) => {
        if (evt.t === 'head.setup') {
          if (evt.ok === false) {
            setStep('failed');
            setErrorMessage(evt.prompt || 'Head tracking setup failed.');
            return;
          }

          if (evt.step === 'neutral') {
            setStep('neutral');
            setProgress(evt.progress);
            setPromptText(evt.prompt || 'Hold still in neutral position...');
          } else if (evt.step === 'corners') {
            setStep('corners');
            setProgress(evt.progress);
            setPromptText(evt.prompt || 'Look at the 4 screen corners to calibrate range.');
            setCornerIndex(Math.min(3, Math.floor(evt.progress * 4)));
          } else if (evt.step === 'done') {
            // Proceed to acoustic noise floor calibration step
            setStep('noise_floor');
            setPromptText('Stay quiet for a moment to measure ambient background noise.');
            setProgress(0.85);
          }
        }
      }),
      transport.on('speech', (evt: SpeechEvent) => {
        if (evt.t === 'speech.level') {
          setAudioLevel(evt.level);
          setNoiseFloorLevel(evt.noiseFloor);
        }
      }),
    ];

    return () => unsubs.forEach(u => u());
  }, [transport]);

  // Noise floor auto-advancement simulation if no external orchestrator finishes it
  useEffect(() => {
    let noiseTimer: any = null;
    if (step === 'noise_floor') {
      noiseTimer = setTimeout(() => {
        setProgress(1.0);
        setStep('complete');
        setPromptText('Handsfree calibration complete! You are ready to browse.');
      }, 3500);
    }
    return () => clearTimeout(noiseTimer);
  }, [step]);

  const handleStartSetup = () => {
    setStartTime(Date.now());
    setElapsedSeconds(0);
    setStep('neutral');
    setProgress(0.1);
    setPromptText('Look directly at the screen center in your neutral comfortable posture.');
    transport?.send('head.command', { t: 'head.startSetup' });
  };

  const handleRetry = () => {
    setErrorMessage('');
    handleStartSetup();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl text-slate-100 flex flex-col space-y-4">
      {/* Header with Title and Elapsed Time */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8] animate-pulse"></div>
          <span className="font-extrabold text-sm tracking-wide text-white">Setup Wizard</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-slate-400">Total time:</span>
          <span className={`font-bold px-2 py-0.5 rounded ${elapsedSeconds > 30 ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-slate-800 text-sky-400'}`}>
            {elapsedSeconds}s / 30s
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-slate-400 font-semibold">
          <span>Calibration Progress</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
          <div
            className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(56,189,248,0.5)]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      {/* Step Content Visualizer */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-4 min-h-[160px] flex flex-col items-center justify-center text-center space-y-3 relative overflow-hidden">
        {step === 'welcome' && (
          <div className="space-y-2">
            <div className="text-2xl">🎯</div>
            <div className="font-bold text-sm text-slate-100">Quick 20-Second Calibration</div>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              We'll calibrate your neutral resting head pose, screen corners, and ambient microphone floor.
            </p>
          </div>
        )}

        {step === 'neutral' && (
          <div className="space-y-2">
            <div className="relative flex items-center justify-center w-14 h-14 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-sky-400/40 animate-ping" />
              <div className="w-10 h-10 rounded-full bg-sky-500/20 border-2 border-sky-400 flex items-center justify-center font-bold text-sky-300 text-xs shadow-[0_0_12px_#38bdf8]">
                POSE
              </div>
            </div>
            <div className="text-xs font-bold text-sky-300">Step 1: Neutral Head Pose</div>
            <p className="text-xs text-slate-300">{promptText}</p>
          </div>
        )}

        {step === 'corners' && (
          <div className="w-full space-y-2">
            <div className="grid grid-cols-2 gap-2 w-44 h-24 mx-auto bg-slate-900/80 p-1.5 rounded-lg border border-slate-800">
              {['Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right'].map((c, i) => (
                <div
                  key={c}
                  className={`rounded flex items-center justify-center text-[9px] font-bold border transition-all ${
                    cornerIndex === i
                      ? 'bg-sky-500/30 border-sky-400 text-sky-300 shadow-[0_0_10px_#38bdf8]'
                      : 'bg-slate-950 border-slate-800 text-slate-600'
                  }`}
                >
                  {c}
                </div>
              ))}
            </div>
            <div className="text-xs font-bold text-sky-300">Step 2: Four Corners Range</div>
            <p className="text-xs text-slate-300">{promptText}</p>
          </div>
        )}

        {step === 'noise_floor' && (
          <div className="w-full space-y-2 max-w-xs">
            <div className="text-xl">🎙️</div>
            <div className="text-xs font-bold text-sky-300">Step 3: Ambient Noise Floor</div>
            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800 relative">
              <div
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.round(audioLevel * 100))}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400">{promptText}</p>
          </div>
        )}

        {step === 'complete' && (
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center font-bold text-emerald-300 text-xl mx-auto shadow-[0_0_12px_#34d399]">
              ✓
            </div>
            <div className="font-bold text-sm text-emerald-400">Setup Complete!</div>
            <p className="text-xs text-slate-300 max-w-xs">
              Finished in <span className="font-bold text-white">{elapsedSeconds}s</span>. Head tracking & voice filters are calibrated.
            </p>
          </div>
        )}

        {step === 'failed' && (
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center font-bold text-rose-300 text-xl mx-auto shadow-[0_0_12px_#f43f5e]">
              ✕
            </div>
            <div className="font-bold text-sm text-rose-400">Calibration Failed</div>
            <p className="text-xs text-rose-300 max-w-xs">{errorMessage}</p>
          </div>
        )}
      </div>

      {/* Action Footer Buttons */}
      <div className="flex justify-end gap-2 pt-1">
        {step === 'welcome' && (
          <button
            onClick={handleStartSetup}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg shadow-sky-900/30 transition-all"
          >
            Start 20s Calibration
          </button>
        )}

        {step === 'failed' && (
          <button
            onClick={handleRetry}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-all"
          >
            Retry Calibration
          </button>
        )}

        {step === 'complete' && (
          <button
            onClick={() => onComplete?.()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/30 transition-all"
          >
            Start Browsing
          </button>
        )}

        {onCancel && step !== 'complete' && (
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-all"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
