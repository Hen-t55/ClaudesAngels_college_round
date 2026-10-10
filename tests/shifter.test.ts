// Tests for: gear-shifter hysteresis, settings round-trip, telemetry rows
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { memoryTransport } from '../src/shared/bus';
import {
  startOrchestrator,
  createMockHead,
  createMockEngine,
  type MockHeadModule,
  type MockEngineModule,
  type Orchestrator,
} from '../src/sidepanel/orchestrator';
import { loadSettings, saveSettings } from '../src/shared/settings';
import type { OverlayState, Telemetry } from '../src/shared/contract';

// ============================================================
// 1. Gear Shifter Hysteresis
// ============================================================
describe('Gear-Shifter Hysteresis', () => {
  let tSide: any, tContent: any;
  let orch: Orchestrator;
  let mockHead: MockHeadModule, mockEngine: MockEngineModule;
  let latestOverlay: OverlayState;

  function emitQuality(jitter: number, count = 1): void {
    for (let i = 0; i < count; i++) {
      tSide.send('head.event', { t: 'head.quality', jitter, brightness: 0.8, faceConf: 0.9, fps: 30 });
    }
  }

  const flush = () => new Promise<void>((r) => queueMicrotask(r));

  beforeEach(async () => {
    vi.useFakeTimers();
    [tSide, tContent] = memoryTransport();
    tSide.on('overlay', (st: OverlayState) => { latestOverlay = st; });
    orch = startOrchestrator({ transport: tSide, settings: { preferredGear: 'hop' } });
    mockHead = createMockHead(tSide);
    mockEngine = createMockEngine(tContent);
    await flush();
  });

  afterEach(() => {
    orch.stop();
    mockHead.destroy();
    mockEngine.destroy();
    vi.useRealTimers();
  });

  it('starts in preferred gear (hop)', async () => {
    await flush();
    expect(latestOverlay.gear).toBe('hop');
  });

  it('manual hop_mode pins the gear and sets gearReason', async () => {
    // Start already in hop, switch to voice first so we can observe a change
    orch.handleIntent({ k: 'control', name: 'voice_mode' });
    await flush();
    expect(latestOverlay.gear).toBe('voice');
    expect(latestOverlay.gearReason).toMatch(/manual/i);

    orch.handleIntent({ k: 'control', name: 'hop_mode' });
    await flush();
    expect(latestOverlay.gear).toBe('hop');
    expect(latestOverlay.gearReason).toMatch(/manual/i);
  });

  it('manual voice_mode pins the gear', async () => {
    orch.handleIntent({ k: 'control', name: 'voice_mode' });
    await flush();
    expect(latestOverlay.gear).toBe('voice');
    expect(latestOverlay.gearReason).toMatch(/manual/i);
  });

  it('auto-shifts to voice after 3 s of high head jitter', async () => {
    const t0 = Date.now();
    emitQuality(0.15); // bad: jitter high
    await flush();
    expect(latestOverlay.gear).toBe('hop'); // not yet

    // Advance just under 3 s — should NOT shift yet
    vi.setSystemTime(t0 + 2999);
    emitQuality(0.15);
    await flush();
    expect(latestOverlay.gear).toBe('hop');

    // Advance to exactly 3 s — should shift
    vi.setSystemTime(t0 + 3001);
    emitQuality(0.15);
    await flush();
    expect(latestOverlay.gear).toBe('voice');
    expect(latestOverlay.gearReason).toMatch(/jitter/i);
  });

  it('auto-shifts back to hop after 10 s of good signal', async () => {
    // First: shift to voice via bad jitter for 3 s
    const t0 = Date.now();
    emitQuality(0.15);
    await flush();

    vi.setSystemTime(t0 + 3100);
    emitQuality(0.15);
    await flush();
    expect(latestOverlay.gear).toBe('voice');

    // Now good signal for 10 s
    const t1 = Date.now();
    emitQuality(0.02); // start good timer
    await flush();

    vi.setSystemTime(t1 + 9990);
    emitQuality(0.02);
    await flush();
    expect(latestOverlay.gear).toBe('voice'); // not yet 10s

    vi.setSystemTime(t1 + 10100);
    emitQuality(0.02);
    await flush();
    expect(latestOverlay.gear).toBe('hop');
    expect(latestOverlay.gearReason).toMatch(/good/i);
  });

  it('does NOT auto-shift while in DISAMBIGUATE phase (never mid-action)', async () => {
    // Enter DISAMBIGUATE
    mockHead.sendQuadrant('TL');
    await flush();
    orch.handleIntent({ k: 'target', verb: 'click', query: { raw: 'button', role: 'button' } });
    await flush();
    const req = mockEngine.lastRequest as any;
    mockEngine.simulateResolveResult(req.id, 'many', [
      { id: 'b1', label: 'B1', role: 'button', rect: { x: 0, y: 0, w: 10, h: 10 } },
      { id: 'b2', label: 'B2', role: 'button', rect: { x: 0, y: 20, w: 10, h: 10 } },
    ]);
    await flush();
    expect(orch.getPhase()).toBe('DISAMBIGUATE');

    // Emit bad jitter for > 3 s — should NOT shift
    const t0 = Date.now();
    emitQuality(0.20);
    vi.setSystemTime(t0 + 3001);
    emitQuality(0.20);
    await flush();

    expect(orch.getPhase()).toBe('DISAMBIGUATE');
    expect(latestOverlay.gear).toBe('hop'); // unchanged
  });

  it('manual pin prevents auto-shift', async () => {
    orch.handleIntent({ k: 'control', name: 'hop_mode' }); // pin
    await flush();

    const t0 = Date.now();
    emitQuality(0.20);
    vi.setSystemTime(t0 + 3001);
    emitQuality(0.20);
    await flush();

    expect(latestOverlay.gear).toBe('hop'); // pinned — no change
  });

  it('bad signal timer resets when signal improves before 3 s', async () => {
    const t0 = Date.now();
    emitQuality(0.15); // start bad timer at t0

    // Advance to 2 s — still bad, not shifted
    vi.setSystemTime(t0 + 2000);
    emitQuality(0.15);
    await flush();
    expect(latestOverlay.gear).toBe('hop');

    // One good event resets the timer
    emitQuality(0.02);
    await flush();

    // Now bad again — timer restarts from this point
    const t1 = Date.now();
    emitQuality(0.15);
    vi.setSystemTime(t1 + 2999);
    emitQuality(0.15);
    await flush();

    expect(latestOverlay.gear).toBe('hop'); // should NOT have shifted (only ~2 s bad since reset)
  });
});

// ============================================================
// 2. Settings Round-Trip
// ============================================================
describe('Settings Round-Trip', () => {
  it('loadSettings returns defaults for fresh store', async () => {
    const s = await loadSettings();
    expect(s.preferredGear).toBe('hop');
    expect(s.language).toBe('en-IN');
    expect(s.importantKeywords).toEqual([]);
    expect(s.jitterThresholdHigh).toBe(0.08);
    expect(s.confidenceThresholdLow).toBe(0.55);
    expect(s.simulatorEnabled).toBe(false);
  });

  it('saveSettings persists and loadSettings reflects the change', async () => {
    await saveSettings({ preferredGear: 'voice', language: 'en-US' });
    const s = await loadSettings();
    expect(s.preferredGear).toBe('voice');
    expect(s.language).toBe('en-US');
    // Reset for other tests
    await saveSettings({ preferredGear: 'hop', language: 'en-IN' });
  });

  it('orchestrator broadcasts settings.state in response to settings.get', async () => {
    const [tSide] = memoryTransport();
    const orch = startOrchestrator({ transport: tSide, settings: { preferredGear: 'voice', language: 'en-US' } });

    const replies: any[] = [];
    tSide.on('settings', (msg: any) => { replies.push(msg); });

    tSide.send('settings', { t: 'settings.get' });
    await tick(20);

    const stateMsg = replies.find((r: any) => r.t === 'settings.state');
    expect(stateMsg).toBeDefined();
    expect(stateMsg.values.preferredGear).toBe('voice');
    expect(stateMsg.values.language).toBe('en-US');

    orch.stop();
  });

  it('orchestrator applies settings.set patch and broadcasts updated gear', async () => {
    const [tSide] = memoryTransport();
    const orch = startOrchestrator({ transport: tSide, settings: { preferredGear: 'hop' } });
    await tick(10);

    const overlays: OverlayState[] = [];
    tSide.on('overlay', (st: OverlayState) => overlays.push(st));

    tSide.send('settings', { t: 'settings.set', patch: { preferredGear: 'voice' } });
    await tick(20);

    const lastOverlay = overlays[overlays.length - 1];
    expect(lastOverlay?.gear).toBe('voice');

    orch.stop();
  });

  it('saveSettings with importantKeywords merges correctly', async () => {
    await saveSettings({ importantKeywords: ['send report', 'archive'] });
    const s = await loadSettings();
    expect(s.importantKeywords).toEqual(['send report', 'archive']);
    await saveSettings({ importantKeywords: [] });
  });

  it('settings.set with jitterThresholdHigh updates the field', async () => {
    const [tSide] = memoryTransport();
    const orch = startOrchestrator({ transport: tSide });

    const replies: any[] = [];
    tSide.on('settings', (msg: any) => { replies.push(msg); });

    tSide.send('settings', { t: 'settings.set', patch: { jitterThresholdHigh: 0.12 } });
    await tick(20);

    const state = replies.find((r: any) => r.t === 'settings.state');
    expect(state?.values?.jitterThresholdHigh).toBe(0.12);

    orch.stop();
  });
});

// ============================================================
// 3. Telemetry Rows
// ============================================================
describe('Telemetry Rows', () => {
  let tSide: any, tContent: any;
  let orch: Orchestrator;
  let mockHead: MockHeadModule, mockEngine: MockEngineModule;
  let telemetryRows: Telemetry[];

  beforeEach(async () => {
    [tSide, tContent] = memoryTransport();
    telemetryRows = [];
    tSide.on('telemetry', (row: Telemetry) => { telemetryRows.push(row); });
    orch = startOrchestrator({ transport: tSide });
    mockHead = createMockHead(tSide);
    mockEngine = createMockEngine(tContent);
    await tick(10);
  });

  afterEach(() => { orch.stop(); mockHead.destroy(); mockEngine.destroy(); });

  it('emits a telemetry row on activation', async () => {
    mockHead.sendQuadrant('TL');
    await tick(10);
    orch.handleIntent({ k: 'target', verb: 'click', query: { raw: 'submit button' } });
    await tick(10);
    const req = mockEngine.lastRequest as any;
    mockEngine.simulateResolveResult(req.id, 'one', [
      { id: 'btn_1', label: 'Submit', role: 'button', rect: { x: 0, y: 0, w: 10, h: 10 } },
    ]);
    await tick(10);
    const activationRow = telemetryRows.find((r) => r.event === 'activation');
    expect(activationRow).toBeDefined();
    expect(activationRow!.target).toContain('Submit');
  });

  it('emits a telemetry row on confirm_accept', async () => {
    mockHead.sendQuadrant('TL');
    await tick(10);
    orch.handleIntent({ k: 'target', verb: 'click', query: { raw: 'delete' } });
    await tick(10);
    const req = mockEngine.lastRequest as any;
    mockEngine.simulateResolveResult(req.id, 'one', [
      {
        id: 'del_btn', label: 'Delete', role: 'button',
        rect: { x: 0, y: 0, w: 10, h: 10 },
        important: { reason: 'delete', description: 'Delete item' },
      },
    ]);
    await tick(10);
    expect(orch.getPhase()).toBe('CONFIRM');

    mockHead.sendNod();
    await tick(10);

    const confirmRow = telemetryRows.find((r) => r.event === 'confirm_accept');
    expect(confirmRow).toBeDefined();
    expect(confirmRow!.correct).toBe(true);
  });

  it('emits a telemetry row on confirm_cancel', async () => {
    mockHead.sendQuadrant('TL');
    await tick(10);
    orch.handleIntent({ k: 'target', verb: 'click', query: { raw: 'purchase' } });
    await tick(10);
    const req = mockEngine.lastRequest as any;
    mockEngine.simulateResolveResult(req.id, 'one', [
      {
        id: 'buy', label: 'Buy Now', role: 'button',
        rect: { x: 0, y: 0, w: 10, h: 10 },
        important: { reason: 'purchase', description: 'Purchase order' },
      },
    ]);
    await tick(10);
    mockHead.sendShake();
    await tick(10);

    const cancelRow = telemetryRows.find((r) => r.event === 'confirm_cancel');
    expect(cancelRow).toBeDefined();
    expect(cancelRow!.correct).toBe(false);
  });

  it('emits a gear_shift telemetry row on manual gear change', async () => {
    orch.handleIntent({ k: 'control', name: 'voice_mode' });
    await tick(10);
    const gearRow = telemetryRows.find((r) => r.event === 'gear_shift');
    expect(gearRow).toBeDefined();
    expect(gearRow!.extra?.newGear).toBe('voice');
  });

  it('emits pause and resume telemetry rows', async () => {
    mockHead.sendFacing(false);
    await tick(10);
    const pauseRow = telemetryRows.find((r) => r.event === 'pause');
    expect(pauseRow).toBeDefined();

    mockHead.sendFacing(true);
    await tick(10);
    const resumeRow = telemetryRows.find((r) => r.event === 'resume');
    expect(resumeRow).toBeDefined();
  });

  it('emits fallback telemetry rows for widen and zoom', async () => {
    mockHead.sendQuadrant('TR');
    await tick(10);
    orch.handleIntent({ k: 'target', verb: 'click', query: { raw: 'ghost element' } });
    await tick(10);

    // NONE in quadrant → widen
    const req1 = mockEngine.lastRequest as any;
    mockEngine.simulateResolveResult(req1.id, 'none', [], false);
    await tick(10);

    const widenRow = telemetryRows.find((r) => r.event === 'fallback_widen');
    expect(widenRow).toBeDefined();

    // NONE on page → zoom
    const req2 = mockEngine.lastRequest as any;
    mockEngine.simulateResolveResult(req2.id, 'none', [], true);
    await tick(10);

    const zoomRow = telemetryRows.find((r) => r.event === 'fallback_zoom');
    expect(zoomRow).toBeDefined();
  });

  it('getLog() returns the action log with timestamps', async () => {
    mockHead.sendQuadrant('TL');
    await tick(10);
    orch.handleIntent({ k: 'target', verb: 'click', query: { raw: 'ok button' } });
    await tick(10);
    const req = mockEngine.lastRequest as any;
    mockEngine.simulateResolveResult(req.id, 'one', [
      { id: 'ok', label: 'OK', role: 'button', rect: { x: 0, y: 0, w: 10, h: 10 } },
    ]);
    await tick(10);

    const log = orch.getLog();
    expect(log.length).toBeGreaterThan(0);
    const entry = log.find((e) => e.event === 'activation');
    expect(entry).toBeDefined();
    expect(entry!.ts).toBeGreaterThan(0);
  });
});

// ============================================================
// 4. close_tab Confirmation
// ============================================================
describe('close_tab must go through confirmation', () => {
  let tSide: any, tContent: any;
  let orch: Orchestrator;
  let mockHead: MockHeadModule, mockEngine: MockEngineModule;
  let tabCommands: any[];
  let latestOverlay: OverlayState;

  beforeEach(async () => {
    [tSide, tContent] = memoryTransport();
    tabCommands = [];
    tSide.on('overlay', (st: OverlayState) => { latestOverlay = st; });
    tSide.on('tab.command', (cmd: any) => tabCommands.push(cmd));
    orch = startOrchestrator({ transport: tSide });
    mockHead = createMockHead(tSide);
    mockEngine = createMockEngine(tContent);
    await tick(10);
  });

  afterEach(() => { orch.stop(); mockHead.destroy(); mockEngine.destroy(); });

  it('close_tab intent triggers CONFIRM phase before issuing tab.command', async () => {
    orch.handleIntent({ k: 'global', name: 'close_tab' });
    await tick(10);
    expect(orch.getPhase()).toBe('CONFIRM');
    expect(latestOverlay.banner?.kind).toBe('confirm');
    expect(tabCommands.length).toBe(0); // NOT sent yet
  });

  it('close_tab accepted sends tab.command close_tab', async () => {
    orch.handleIntent({ k: 'global', name: 'close_tab' });
    await tick(10);
    orch.handleIntent({ k: 'control', name: 'yes' });
    await tick(10);
    const closeCmd = tabCommands.find((c) => c.name === 'close_tab');
    expect(closeCmd).toBeDefined();
    expect(orch.getPhase()).toBe('IDLE');
  });

  it('close_tab rejected sends nothing', async () => {
    orch.handleIntent({ k: 'global', name: 'close_tab' });
    await tick(10);
    orch.handleIntent({ k: 'control', name: 'no' });
    await tick(10);
    expect(tabCommands.filter((c: any) => c.name === 'close_tab').length).toBe(0);
    expect(orch.getPhase()).toBe('IDLE');
  });
});

// ============================================================
// Helpers
// ============================================================
function tick(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
