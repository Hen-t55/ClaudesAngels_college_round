import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { App } from './App';
import { memoryTransport } from '../../shared/bus';

describe('Sidepanel UI App Smoke Tests', () => {
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

  it('renders sidepanel header, brand, and MV3 tag', async () => {
    const [transport] = memoryTransport();
    await act(async () => {
      root?.render(<App transport={transport} />);
    });

    expect(container?.textContent).toContain('HANDSFREE');
    expect(container?.textContent).toContain('MV3');
    expect(container?.textContent).toContain('Orchestrator Phase');
  });

  it('renders status HUD, quadrant map, and shifter gear', async () => {
    const [transport] = memoryTransport();
    await act(async () => {
      root?.render(<App transport={transport} />);
    });

    expect(container?.textContent).toContain('QUADRANT');
    expect(container?.textContent).toContain('SHIFTER');
    expect(container?.textContent).toContain('VOICE');
  });

  it('renders acoustic meter, live transcript, and command log', async () => {
    const [transport] = memoryTransport();
    await act(async () => {
      root?.render(<App transport={transport} />);
    });

    expect(container?.textContent).toContain('Acoustic & Noise Floor');
    expect(container?.textContent).toContain('LIVE TRANSCRIPT');
    expect(container?.textContent).toContain('Command Log');
  });

  it('switches to Settings tab and renders sliders', async () => {
    const [transport] = memoryTransport();
    await act(async () => {
      root?.render(<App transport={transport} />);
    });

    const settingsBtn = Array.from(container?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.trim() === 'Settings'
    );
    expect(settingsBtn).toBeDefined();

    await act(async () => {
      settingsBtn?.click();
    });

    expect(container?.textContent).toContain('Head Pose Sensitivity');
    expect(container?.textContent).toContain('Gain Multiplier');
    expect(container?.textContent).toContain('Neutral Deadzone');
  });

  it('toggles pause and resume state on button click', async () => {
    const [transport] = memoryTransport();
    await act(async () => {
      root?.render(<App transport={transport} />);
    });

    const pauseBtn = Array.from(container?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.trim() === 'Pause'
    );
    expect(pauseBtn).toBeDefined();

    await act(async () => {
      pauseBtn?.click();
    });

    expect(container?.textContent).toContain('PAUSED');
  });
});
