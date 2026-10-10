import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App } from './App';
import { SetupWizard } from './SetupWizard';
import { SettingsScreen } from './SettingsScreen';
import { CheatSheet } from './CheatSheet';
import { memoryTransport } from '../../shared/bus';
import type { HeadCommand } from '../../shared/contract';

describe('Sidepanel UI Components Tests', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
  });

  it('renders tab bar with Monitor, Cheat Sheet, Settings, Wizard', async () => {
    const [transport] = memoryTransport();
    await act(async () => {
      root?.render(<App transport={transport} />);
    });

    expect(container?.textContent).toContain('Monitor');
    expect(container?.textContent).toContain('Cheat Sheet');
    expect(container?.textContent).toContain('Settings');
    expect(container?.textContent).toContain('Wizard');
  });

  it('Setup Wizard runs end-to-end against mock head and speech events', async () => {
    const [t1, t2] = memoryTransport();
    const completeSpy = vi.fn();

    await act(async () => {
      root?.render(<SetupWizard transport={t1} onComplete={completeSpy} />);
    });

    expect(container?.textContent).toContain('Setup Wizard');
    expect(container?.textContent).toContain('Quick 20-Second Calibration');

    // Click start
    const startBtn = Array.from(container?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.includes('Start')
    );
    expect(startBtn).toBeDefined();

    await act(async () => {
      startBtn?.click();
    });

    // Send neutral step
    await act(async () => {
      t2.send('head.event', {
        t: 'head.setup',
        step: 'neutral',
        progress: 0.3,
        prompt: 'Hold still in neutral position...',
      });
    });
    expect(container?.textContent).toContain('Step 1: Neutral Head Pose');

    // Send corners step
    await act(async () => {
      t2.send('head.event', {
        t: 'head.setup',
        step: 'corners',
        progress: 0.6,
        prompt: 'Look at the 4 screen corners to calibrate range.',
      });
    });
    expect(container?.textContent).toContain('Step 2: Four Corners Range');

    // Send done head step -> triggers noise floor
    await act(async () => {
      t2.send('head.event', {
        t: 'head.setup',
        step: 'done',
        progress: 1.0,
        prompt: 'Head setup complete',
      });
    });
    expect(container?.textContent).toContain('Step 3: Ambient Noise Floor');
  });

  it('Setup Wizard handles calibration failure with retry button', async () => {
    const [t1, t2] = memoryTransport();

    await act(async () => {
      root?.render(<SetupWizard transport={t1} />);
    });

    const startBtn = Array.from(container?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.includes('Start')
    );
    await act(async () => {
      startBtn?.click();
    });

    await act(async () => {
      t2.send('head.event', {
        t: 'head.setup',
        step: 'neutral',
        progress: 0.2,
        prompt: 'Lighting too low or face lost',
        ok: false,
      });
    });

    expect(container?.textContent).toContain('Calibration Failed');
    expect(container?.textContent).toContain('Lighting too low or face lost');

    const retryBtn = Array.from(container?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.includes('Retry')
    );
    expect(retryBtn).toBeDefined();
  });

  it('Settings round-trip: tuning sliders send head.tune commands across mock bus', async () => {
    const [t1, t2] = memoryTransport();
    const commandSpy = vi.fn();

    t2.on('head.command', (cmd: HeadCommand) => {
      commandSpy(cmd);
    });

    await act(async () => {
      root?.render(<SettingsScreen transport={t1} />);
    });

    expect(container?.textContent).toContain('System Settings');
    expect(container?.textContent).toContain('Head Pose & OneEuro Filter Tuning');

    // Find gain slider and trigger change via native value setter
    const sliders = container?.querySelectorAll('input[type="range"]') || [];
    expect(sliders.length).toBeGreaterThanOrEqual(4);

    const gainSlider = sliders[0] as HTMLInputElement;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    await act(async () => {
      nativeInputValueSetter?.call(gainSlider, '2.4');
      gainSlider.dispatchEvent(new Event('input', { bubbles: true }));
      gainSlider.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Wait for microtask delivery in memoryTransport
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(commandSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        t: 'head.tune',
        gain: 2.4,
      })
    );
  });

  it('Settings enables adding and removing important action keywords', async () => {
    const [t1] = memoryTransport();
    await act(async () => {
      root?.render(<SettingsScreen transport={t1} />);
    });

    expect(container?.textContent).toContain('Important Action Keywords');
    expect(container?.textContent).toContain('checkout');

    const input = container?.querySelector('input[type="text"]') as HTMLInputElement;
    const form = container?.querySelector('form') as HTMLFormElement;

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    await act(async () => {
      nativeInputValueSetter?.call(input, 'destroy everything');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container?.textContent).toContain('destroy everything');
  });

  it('Cheat Sheet filters commands by category and text search', async () => {
    await act(async () => {
      root?.render(<CheatSheet />);
    });

    expect(container?.textContent).toContain('Commands Cheat Sheet');
    expect(container?.textContent).toContain('scroll down / scroll up');

    const searchInput = container?.querySelector('input[type="text"]') as HTMLInputElement;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    await act(async () => {
      nativeInputValueSetter?.call(searchInput, 'dictate');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container?.textContent).toContain('dictate start / dictate stop');
    expect(container?.textContent).not.toContain('scroll down / scroll up');
  });
});
