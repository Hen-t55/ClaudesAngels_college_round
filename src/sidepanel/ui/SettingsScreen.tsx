import React, { useState } from 'react';
import type { Transport } from '../../shared/bus';
import type { Gear, ImpairmentConfig } from '../../shared/contract';

export interface SettingsScreenProps {
  transport?: Transport;
  onOpenWizard?: () => void;
}

export const IMPAIRMENT_PRESETS: Record<string, { label: string; desc: string; cfg: ImpairmentConfig | null }> = {
  none: {
    label: 'None (Clean)',
    desc: 'Standard healthy user input with baseline OneEuro smoothing.',
    cfg: null,
  },
  mild_tremor: {
    label: 'Mild Tremor (Parkinsonian 4-6Hz)',
    desc: 'Simulates rhythmic involuntary shaking at ~5 Hz with moderate amplitude.',
    cfg: { seed: 42, tremorAmp: 0.08, tremorHz: [4, 6], brightness: 1.0, dropFramePct: 0 },
  },
  severe_tremor: {
    label: 'Severe Ataxia (Tremor & Spasms)',
    desc: 'High amplitude irregular jitter challenging filtering stability.',
    cfg: { seed: 101, tremorAmp: 0.18, tremorHz: [3, 8], brightness: 1.0, dropFramePct: 0 },
  },
  low_light: {
    label: 'Low Light / Dim Room',
    desc: 'Simulates camera under-exposure with noisy face confidence.',
    cfg: { seed: 77, tremorAmp: 0.02, tremorHz: [1, 3], brightness: 0.25, dropFramePct: 0 },
  },
  frame_drops: {
    label: 'Low Frame Rate / USB Lag',
    desc: 'Drops 40% of camera frames to evaluate lag recovery.',
    cfg: { seed: 999, tremorAmp: 0.03, tremorHz: [2, 5], brightness: 0.85, dropFramePct: 40 },
  },
};

export function SettingsScreen({ transport, onOpenWizard }: SettingsScreenProps) {
  // 1. Shifter & Preferred Gear
  const [preferredGear, setPreferredGear] = useState<Gear>('voice');

  // 2. Language selection
  const [language, setLanguage] = useState<string>('en-US');

  // 3. Editable Important Action Keywords
  const [keywords, setKeywords] = useState<string[]>([
    'checkout',
    'pay',
    'purchase',
    'buy now',
    'delete',
    'remove',
    'sign out',
    'log out',
    'submit order',
    'close tab',
    'transfer money',
  ]);
  const [newKeyword, setNewKeyword] = useState<string>('');

  // 4. Sliders: Tuning head parameters
  const [gain, setGain] = useState<number>(1.2);
  const [deadzone, setDeadzone] = useState<number>(0.08);
  const [minCutoff, setMinCutoff] = useState<number>(1.0);
  const [filterBeta, setFilterBeta] = useState<number>(0.007);
  const [gestureThreshold, setGestureThreshold] = useState<number>(0.15);

  // 5. Simulation Toggles
  const [keyboardSimulation, setKeyboardSimulation] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<string>('none');

  // Broadcast head.tune command to P1/orchestrator
  const sendTuning = (updates: { gain?: number; deadzone?: number; beta?: number; minCutoff?: number }) => {
    transport?.send('head.command', {
      t: 'head.tune',
      gain: updates.gain ?? gain,
      deadzone: updates.deadzone ?? deadzone,
      beta: updates.beta ?? filterBeta,
      minCutoff: updates.minCutoff ?? minCutoff,
    });
  };

  const handleGainChange = (v: number) => {
    setGain(v);
    sendTuning({ gain: v });
  };

  const handleDeadzoneChange = (v: number) => {
    setDeadzone(v);
    sendTuning({ deadzone: v });
  };

  const handleBetaChange = (v: number) => {
    setFilterBeta(v);
    sendTuning({ beta: v });
  };

  const handleCutoffChange = (v: number) => {
    setMinCutoff(v);
    sendTuning({ minCutoff: v });
  };

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newKeyword.trim().toLowerCase();
    if (clean && !keywords.includes(clean)) {
      setKeywords([...keywords, clean]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (kw: string) => {
    setKeywords(keywords.filter(k => k !== kw));
  };

  const handlePresetSelect = (presetKey: string) => {
    setActivePreset(presetKey);
    const preset = IMPAIRMENT_PRESETS[presetKey];
    if (preset) {
      transport?.send('head.command', {
        t: 'head.impairment',
        cfg: preset.cfg,
      });
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3.5 bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚙️</span>
          <span className="font-extrabold text-sm text-white">System Settings</span>
        </div>
        {onOpenWizard && (
          <button
            onClick={onOpenWizard}
            className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] shadow transition-all"
          >
            Launch Setup Wizard
          </button>
        )}
      </div>

      {/* Shifter & Language */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-2.5">
        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Interaction Preferences</span>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] text-slate-300 font-medium">Preferred Default Gear</label>
            <select
              value={preferredGear}
              onChange={e => setPreferredGear(e.target.value as Gear)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="voice">Voice Mode (Numbered badges)</option>
              <option value="hop">Hop Mode (Head flick arrows)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-slate-300 font-medium">Spoken Language</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="en-US">English (US)</option>
              <option value="en-IN">English (India / Hinglish)</option>
              <option value="en-GB">English (UK)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Head Sensitivity Sliders */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-3">
        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Head Pose & OneEuro Filter Tuning</span>

        {/* Gain Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-slate-300 text-[11px]">
            <span>Gain Multiplier</span>
            <span className="font-mono text-sky-400 font-bold">{gain.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            value={gain}
            onChange={e => handleGainChange(parseFloat(e.target.value))}
            className="w-full accent-sky-500"
          />
        </div>

        {/* Deadzone Slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-slate-300 text-[11px]">
            <span>Neutral Deadzone</span>
            <span className="font-mono text-sky-400 font-bold">{deadzone.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.01"
            max="0.30"
            step="0.01"
            value={deadzone}
            onChange={e => handleDeadzoneChange(parseFloat(e.target.value))}
            className="w-full accent-sky-500"
          />
        </div>

        {/* OneEuro Beta */}
        <div className="space-y-1">
          <div className="flex justify-between text-slate-300 text-[11px]">
            <span>OneEuro Tremor Beta (Velocity filter)</span>
            <span className="font-mono text-sky-400 font-bold">{filterBeta.toFixed(4)}</span>
          </div>
          <input
            type="range"
            min="0.0005"
            max="0.05"
            step="0.0005"
            value={filterBeta}
            onChange={e => handleBetaChange(parseFloat(e.target.value))}
            className="w-full accent-sky-500"
          />
        </div>

        {/* Min Cutoff */}
        <div className="space-y-1">
          <div className="flex justify-between text-slate-300 text-[11px]">
            <span>OneEuro Min Cutoff (Static jitter Hz)</span>
            <span className="font-mono text-sky-400 font-bold">{minCutoff.toFixed(2)} Hz</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="4.0"
            step="0.1"
            value={minCutoff}
            onChange={e => handleCutoffChange(parseFloat(e.target.value))}
            className="w-full accent-sky-500"
          />
        </div>

        {/* Gesture Threshold */}
        <div className="space-y-1">
          <div className="flex justify-between text-slate-300 text-[11px]">
            <span>Flick & Nod Gesture Threshold</span>
            <span className="font-mono text-sky-400 font-bold">{gestureThreshold.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="0.40"
            step="0.01"
            value={gestureThreshold}
            onChange={e => setGestureThreshold(parseFloat(e.target.value))}
            className="w-full accent-sky-500"
          />
        </div>
      </div>

      {/* Editable Important-Action Keywords */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            Important Action Keywords (Require Confirmation)
          </span>
          <span className="text-[10px] text-amber-400 font-mono font-bold">{keywords.length} active</span>
        </div>

        <form onSubmit={handleAddKeyword} className="flex gap-1.5">
          <input
            type="text"
            placeholder="Add keyword (e.g. transfer, checkout)..."
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
          >
            Add
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
          {keywords.map(kw => (
            <span
              key={kw}
              className="inline-flex items-center gap-1.5 bg-amber-950/60 border border-amber-800/80 text-amber-300 px-2 py-0.5 rounded text-[10px] font-mono font-medium"
            >
              {kw}
              <button
                type="button"
                onClick={() => handleRemoveKeyword(kw)}
                className="text-amber-400 hover:text-rose-400 font-bold"
                title={`Remove ${kw}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Impairment Presets & Simulation */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-2.5">
        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
          Chaos Lab Impairment Presets (Evaluation)
        </span>

        <div className="space-y-1.5">
          {Object.entries(IMPAIRMENT_PRESETS).map(([key, item]) => (
            <label
              key={key}
              className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-all ${
                activePreset === key
                  ? 'bg-sky-950/40 border-sky-500 text-slate-200 shadow-sm'
                  : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <input
                type="radio"
                name="impairment_preset"
                checked={activePreset === key}
                onChange={() => handlePresetSelect(key)}
                className="mt-0.5 accent-sky-500"
              />
              <div className="flex-1 space-y-0.5">
                <div className="text-xs font-bold text-slate-200">{item.label}</div>
                <div className="text-[10px] text-slate-400">{item.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {/* Keyboard Simulation Toggle */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-200">Keyboard Simulation Mode</div>
            <div className="text-[10px] text-slate-400">Use arrow keys / WASD to simulate head pointing for demo</div>
          </div>
          <button
            type="button"
            onClick={() => setKeyboardSimulation(!keyboardSimulation)}
            className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
              keyboardSimulation ? 'bg-sky-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                keyboardSimulation ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
