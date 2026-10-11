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
    it('handles microphone permission denied error, switches to Hop gear with banner', async () => {
      // Start in voice gear
      orchestrator.handleIntent({ k: 'control', name: 'voice_mode' });
      await flush();
      expect(latestOverlay.gear).toBe('voice');

      // SpeechModule emits speech.error for not-allowed
      tSide.send('speech', {
        t: 'speech.error',
        error: 'not-allowed',
        message: 'Permission denied',
      });
      await flush();

      expect(latestOverlay.gear).toBe('hop');
      expect(latestOverlay.banner?.kind).toBe('error');
      expect(latestOverlay.banner?.text).toContain('Microphone permission denied');
    });

    it('handles microphone busy / audio-capture error', async () => {
      orchestrator.handleIntent({ k: 'control', name: 'voice_mode' });
      await flush();

      tSide.send('speech', {
        t: 'speech.error',
        error: 'audio-capture',
      });
      await flush();

      expect(latestOverlay.gear).toBe('hop');
      expect(latestOverlay.banner?.kind).toBe('error');
      expect(latestOverlay.banner?.text).toContain('Microphone busy');
    });

    it('handles speech service offline / unavailable error', async () => {
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
    });

    it('handles engine non-response timeout and recovers gracefully', async () => {
      vi.useFakeTimers();

      // Trigger resolve request
      orchestrator.handleIntent({
        k: 'target',
        verb: 'click',
        query: { raw: 'button' },
      });
      expect(orchestrator.getPhase()).toBe('RESOLVING');

      // Advance past engine timeout (1500ms)
      vi.advanceTimersByTime(1600);
      await Promise.resolve();

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
