import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { memoryTransport } from '../src/shared/bus';
import { startOrchestrator, Orchestrator } from '../src/sidepanel/orchestrator';
import { SpeechModule } from '../src/sidepanel/voice';
import type { OverlayState } from '../src/shared/contract';

describe('Error States & Latency Performance Suite', () => {
  let tSide: any;
  let tContent: any;
  let orchestrator: Orchestrator;
  let latestOverlay: OverlayState;

  const flush = () => new Promise<void>((r) => setTimeout(r, 20));

  beforeEach(() => {
    [tSide, tContent] = memoryTransport();
    tSide.on('overlay', (st: OverlayState) => {
      latestOverlay = st;
    });
    orchestrator = startOrchestrator({ transport: tSide });
  });

  afterEach(() => {
    orchestrator.stop();
  });

  describe('Error States', () => {
    it('a) handles microphone denied or busy: banner, switches to typed simulation input, sets gear to hop', async () => {
      let simulatorEnabledSetting: boolean | undefined;
      tSide.on('settings', (msg: any) => {
        if (msg.t === 'settings.set' && msg.patch.simulatorEnabled !== undefined) {
          simulatorEnabledSetting = msg.patch.simulatorEnabled;
        }
      });

      // Start in voice gear
      orchestrator.handleIntent({ k: 'control', name: 'voice_mode' });
      await flush();
      expect(latestOverlay.gear).toBe('voice');

      // 1. Microphone denied
      tSide.send('speech', {
        t: 'speech.error',
        error: 'not-allowed',
      });
      await flush();

      expect(latestOverlay.gear).toBe('hop');
      expect(latestOverlay.banner?.kind).toBe('error');
      expect(latestOverlay.banner?.text).toContain('Microphone permission denied');
      expect(simulatorEnabledSetting).toBe(true);

      // 2. Microphone busy (audio-capture)
      tSide.send('speech', {
        t: 'speech.error',
        error: 'audio-capture',
      });
      await flush();

      expect(latestOverlay.gear).toBe('hop');
      expect(latestOverlay.banner?.kind).toBe('error');
      expect(latestOverlay.banner?.text).toContain('Microphone busy');
    });

    it('b) handles speech service unavailable or offline: banner, switches to typed simulation input, sets gear to hop', async () => {
      let simulatorEnabledSetting: boolean | undefined;
      tSide.on('settings', (msg: any) => {
        if (msg.t === 'settings.set' && msg.patch.simulatorEnabled !== undefined) {
          simulatorEnabledSetting = msg.patch.simulatorEnabled;
        }
      });

      orchestrator.handleIntent({ k: 'control', name: 'voice_mode' });
      await flush();

      tSide.send('speech', {
        t: 'speech.error',
        error: 'service-not-allowed',
      });
      await flush();

      expect(latestOverlay.gear).toBe('hop');
      expect(latestOverlay.banner?.kind).toBe('error');
      expect(latestOverlay.banner?.text).toContain('Speech service offline');
      expect(simulatorEnabledSetting).toBe(true);
    });

    it('c) content script not available on page: banner, tab-level voice commands still work', async () => {
      vi.useFakeTimers();

      // Attempt page target resolve on page without content script
      orchestrator.handleIntent({
        k: 'target',
        verb: 'click',
        query: { raw: 'settings button' },
      });
      expect(orchestrator.getPhase()).toBe('RESOLVING');

      // 3 s engine timeout
      vi.advanceTimersByTime(3000);
      await Promise.resolve();

      expect(orchestrator.getPhase()).toBe('IDLE');
      expect(latestOverlay.banner?.kind).toBe('error');
      expect(latestOverlay.banner?.text).toContain('restricted chrome:// page');

      // Tab-level voice commands still work through background service worker
      const tabCommands: any[] = [];
      tSide.on('tab.command', (cmd: any) => {
        tabCommands.push(cmd);
      });

      orchestrator.handleIntent({ k: 'global', name: 'back' });
      orchestrator.handleIntent({ k: 'global', name: 'new_tab' });
      await Promise.resolve();

      expect(tabCommands).toContainEqual({ t: 'tab.command', name: 'back' });
      expect(tabCommands).toContainEqual({ t: 'tab.command', name: 'new_tab' });

      vi.useRealTimers();
    });

    it('d) tab changed mid-action: cancels pending action, clears matches, re-arms head quadrant tracking', async () => {
      let engineClearSent = false;
      tSide.on('engine.request', (req: any) => {
        if (req.t === 'engine.clear') engineClearSent = true;
      });

      // Mid-action: resolve returns multiple matches -> DISAMBIGUATE phase
      orchestrator.handleIntent({
        k: 'target',
        verb: 'click',
        query: { raw: 'item' },
      });
      tSide.send('engine.event', {
        t: 'engine.result',
        id: 'res_1',
        status: 'many',
        matches: [
          { id: 'item_1', label: 'Item 1', role: 'button', rect: { x: 0, y: 0, w: 10, h: 10 } },
          { id: 'item_2', label: 'Item 2', role: 'button', rect: { x: 20, y: 0, w: 10, h: 10 } },
        ],
      });
      await flush();

      expect(orchestrator.getPhase()).toBe('DISAMBIGUATE');
      expect(latestOverlay.matches.length).toBe(2);

      // Tab switches mid-action
      orchestrator.handleTabChanged();
      await flush();

      expect(engineClearSent).toBe(true);
      expect(latestOverlay.matches.length).toBe(0);
      expect(orchestrator.getPhase()).toBe('IDLE');
      expect(latestOverlay.quadrantLocked).toBe(false);
      expect(latestOverlay.banner?.text).toContain('Tab changed');
    });

    it('e) engine not responding: 3 s timeout, banner, sends engine.clear, re-arms', async () => {
      vi.useFakeTimers();

      let engineClearSent = false;
      tSide.on('engine.request', (req: any) => {
        if (req.t === 'engine.clear') engineClearSent = true;
      });

      orchestrator.handleIntent({
        k: 'target',
        verb: 'click',
        query: { raw: 'submit' },
      });
      expect(orchestrator.getPhase()).toBe('RESOLVING');

      // Exactly 3 seconds
      vi.advanceTimersByTime(3000);
      await Promise.resolve();

      expect(engineClearSent).toBe(true);
      expect(orchestrator.getPhase()).toBe('IDLE');
      expect(latestOverlay.banner?.kind).toBe('error');
      expect(latestOverlay.banner?.text).toContain('Content script not responding');

      vi.useRealTimers();
    });
  });

  describe('Performance & Latency Budgets', () => {
    it('quadrant highlight latency is well within budget (< 100 ms)', async () => {
      vi.useRealTimers();
      tSide.send('head.event', {
        t: 'head.quadrant',
        q: 'TL',
        stable: true,
      });
      await flush();

      const metrics = orchestrator.getLatencyMetrics();
      expect(metrics.quadrantHighlightMs).toBeLessThan(100);
      expect(latestOverlay.quadrant).toBe('TL');
    });

    it('final speech to action latency is well within budget (< 700 ms)', async () => {
      vi.useRealTimers();
      tSide.send('head.event', { t: 'head.quadrant', q: 'TR', stable: true });
      await flush();

      // Final speech result arrives
      tSide.send('speech', {
        t: 'speech.result',
        text: 'click next',
        final: true,
        confidence: 0.95,
      });

      // Immediate mock engine response with single match
      tSide.send('engine.event', {
        t: 'engine.result',
        id: 'res_1',
        status: 'one',
        matches: [
          { id: 'btn_next', label: 'Next', role: 'button', rect: { x: 0, y: 0, w: 50, h: 20 } },
        ],
      });
      await flush();

      const metrics = orchestrator.getLatencyMetrics();
      expect(metrics.speechToActionMs).toBeLessThan(700);
      expect(orchestrator.getPhase()).toBe('AIMING');
    });
  });
});
