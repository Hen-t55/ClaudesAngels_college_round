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
import type { OverlayState } from '../src/shared/contract';

describe('Orchestrator State Machine Suite', () => {
  let tSidepanel: any;
  let tContent: any;
  let orchestrator: Orchestrator;
  let mockHead: MockHeadModule;
  let mockEngine: MockEngineModule;
  let latestOverlay: OverlayState;

  beforeEach(() => {
    [tSidepanel, tContent] = memoryTransport();
    tSidepanel.on('overlay', (st: OverlayState) => {
      latestOverlay = st;
    });
    orchestrator = startOrchestrator({ transport: tSidepanel, confirmTimeoutMs: 5000 });
    mockHead = createMockHead(tSidepanel);
    mockEngine = createMockEngine(tContent);
  });

  afterEach(() => {
    orchestrator.stop();
    mockHead.destroy();
    mockEngine.destroy();
  });

  // 1. Initial State & Head Aiming
  it('starts in IDLE and arms head tracking in quadrant mode', async () => {
    await new Promise((r) => setTimeout(r, 10));
    expect(orchestrator.getPhase()).toBe('IDLE');
    expect(mockHead.getMode()).toBe('quadrant');
    expect(latestOverlay.quadrant).toBeNull();
    expect(latestOverlay.quadrantLocked).toBe(false);
  });

  it('transitions IDLE <-> AIMING based on head quadrant events', async () => {
    mockHead.sendQuadrant('TL');
    await new Promise((r) => setTimeout(r, 10));
    expect(orchestrator.getPhase()).toBe('AIMING');
    expect(latestOverlay.quadrant).toBe('TL');

    mockHead.sendQuadrant(null);
    await new Promise((r) => setTimeout(r, 10));
    expect(orchestrator.getPhase()).toBe('IDLE');
    expect(latestOverlay.quadrant).toBeNull();
  });

  // 2. Lock on Speech Onset
  it('locks quadrant and transitions to LOCKED on speech.onset', async () => {
    mockHead.sendQuadrant('TR');
    await new Promise((r) => setTimeout(r, 10));
    expect(orchestrator.getPhase()).toBe('AIMING');

    // Speech starts
    tSidepanel.send('speech', { t: 'speech.onset' });
    await new Promise((r) => setTimeout(r, 10));

    expect(orchestrator.getPhase()).toBe('LOCKED');
    expect(mockHead.getMode()).toBe('locked');
    expect(latestOverlay.quadrantLocked).toBe(true);
    expect(latestOverlay.quadrant).toBe('TR');

    // Head quadrant changes must now be ignored while locked
    mockHead.sendQuadrant('BL');
    await new Promise((r) => setTimeout(r, 10));
    expect(latestOverlay.quadrant).toBe('TR');
  });

  // 3. Resolving: ONE match -> Immediate Action & Re-arm
  it('transitions to RESOLVING, then acts immediately and re-arms on ONE routine match', async () => {
    mockHead.sendQuadrant('TL');
    await new Promise((r) => setTimeout(r, 10));

    // Lock and issue target intent
    tSidepanel.send('speech', { t: 'speech.onset' });
    orchestrator.handleIntent({
      k: 'target',
      verb: 'click',
      query: { raw: 'second blue button', text: 'second blue button' },
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(orchestrator.getPhase()).toBe('RESOLVING');
    expect(mockEngine.lastRequest?.t).toBe('engine.resolve');
    const resolveReq = mockEngine.lastRequest as any;
    expect(resolveReq.scope).toEqual({ k: 'quadrant', q: 'TL' });

    // Engine returns ONE match
    mockEngine.simulateResolveResult(resolveReq.id, 'one', [
      {
        id: 'btn_2',
        label: 'Blue Button 2',
        role: 'button',
        rect: { x: 10, y: 10, w: 50, h: 20 },
      },
    ]);
    await new Promise((r) => setTimeout(r, 10));

    // Routine action: engine.activate sent, phase re-arms to AIMING
    expect(mockEngine.lastRequest?.t).toBe('engine.activate');
    expect((mockEngine.lastRequest as any).matchId).toBe('btn_2');
    expect(orchestrator.getPhase()).toBe('AIMING');
    expect(mockHead.getMode()).toBe('quadrant');
    expect(latestOverlay.quadrantLocked).toBe(false);
  });

  // 4. Resolving: MANY matches -> Disambiguation in both gears
  it('transitions to DISAMBIGUATE on MANY matches and supports HOP gear navigation', async () => {
    mockHead.sendQuadrant('BR');
    await new Promise((r) => setTimeout(r, 10));

    orchestrator.handleIntent({ k: 'control', name: 'hop_mode' });
    orchestrator.handleIntent({
      k: 'target',
      verb: 'click',
      query: { raw: 'link', role: 'link' },
    });
    await new Promise((r) => setTimeout(r, 10));

    const resolveReq = mockEngine.lastRequest as any;
    mockEngine.simulateResolveResult(resolveReq.id, 'many', [
      { id: 'l1', label: 'Link 1', role: 'link', rect: { x: 0, y: 0, w: 10, h: 10 } },
      { id: 'l2', label: 'Link 2', role: 'link', rect: { x: 0, y: 20, w: 10, h: 10 } },
    ]);
    await new Promise((r) => setTimeout(r, 10));

    expect(orchestrator.getPhase()).toBe('DISAMBIGUATE');
    expect(latestOverlay.gear).toBe('hop');
    expect(latestOverlay.matches[0].focused).toBe(true);

    // Head flick down moves focus to next match
    mockHead.sendFlick('down');
    await new Promise((r) => setTimeout(r, 10));
    expect(mockEngine.lastRequest?.t).toBe('engine.hop');
    expect(latestOverlay.matches[1].focused).toBe(true);

    // Head nod activates focused match
    mockHead.sendNod();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockEngine.lastRequest?.t).toBe('engine.activate');
    expect((mockEngine.lastRequest as any).matchId).toBe('l2');
    expect(orchestrator.getPhase()).toBe('AIMING');
  });

  it('supports VOICE gear disambiguation: selects match by number intent', async () => {
    mockHead.sendQuadrant('BL');
    await new Promise((r) => setTimeout(r, 10));

    orchestrator.handleIntent({ k: 'control', name: 'voice_mode' });
    orchestrator.handleIntent({
      k: 'target',
      verb: 'click',
      query: { raw: 'button', role: 'button' },
    });
    await new Promise((r) => setTimeout(r, 10));

    const resolveReq = mockEngine.lastRequest as any;
    mockEngine.simulateResolveResult(resolveReq.id, 'many', [
      { id: 'b1', label: 'B1', role: 'button', rect: { x: 0, y: 0, w: 10, h: 10 }, number: 1 },
      { id: 'b2', label: 'B2', role: 'button', rect: { x: 0, y: 20, w: 10, h: 10 }, number: 2 },
    ]);
    await new Promise((r) => setTimeout(r, 10));

    expect(orchestrator.getPhase()).toBe('DISAMBIGUATE');
    expect(latestOverlay.gear).toBe('voice');

    // User says number "two"
    orchestrator.handleIntent({ k: 'number', n: 2 });
    await new Promise((r) => setTimeout(r, 10));

    expect(mockEngine.lastRequest?.t).toBe('engine.activate');
    expect((mockEngine.lastRequest as any).matchId).toBe('b2');
    expect(orchestrator.getPhase()).toBe('AIMING');
  });

  // 5. Fallback Ladder
  it('executes fallback ladder: widens scope to whole page on NONE, then triggers zoom grid', async () => {
    mockHead.sendQuadrant('TL');
    await new Promise((r) => setTimeout(r, 10));

    orchestrator.handleIntent({
      k: 'target',
      verb: 'click',
      query: { raw: 'nonexistent', text: 'nonexistent' },
    });
    await new Promise((r) => setTimeout(r, 10));

    // First resolve returns NONE in quadrant -> widens to page
    const req1 = mockEngine.lastRequest as any;
    expect(req1.scope).toEqual({ k: 'quadrant', q: 'TL' });

    mockEngine.simulateResolveResult(req1.id, 'none', [], false);
    await new Promise((r) => setTimeout(r, 10));

    // Next resolve request is widened to whole page
    const req2 = mockEngine.lastRequest as any;
    expect(req2.scope).toEqual({ k: 'page' });

    // Page resolve also returns NONE -> enters ZOOM grid
    mockEngine.simulateResolveResult(req2.id, 'none', [], true);
    await new Promise((r) => setTimeout(r, 10));

    expect(orchestrator.getPhase()).toBe('ZOOM');
    expect(mockEngine.lastRequest?.t).toBe('engine.zoom');
    expect((mockEngine.lastRequest as any).op.k).toBe('start');
  });

  // 6. Confirmation Flow: Accept, Cancel, and Timeout
  it('asks confirmation for Important actions; yes or nod accepts', async () => {
    mockHead.sendQuadrant('TR');
    await new Promise((r) => setTimeout(r, 10));

    orchestrator.handleIntent({
      k: 'target',
      verb: 'click',
      query: { raw: 'delete account', text: 'delete account' },
    });
    await new Promise((r) => setTimeout(r, 10));

    const req = mockEngine.lastRequest as any;
    // Engine returns match with important metadata
    mockEngine.simulateResolveResult(req.id, 'one', [
      {
        id: 'del_acc',
        label: 'Delete Account',
        role: 'button',
        rect: { x: 0, y: 0, w: 20, h: 20 },
        important: { reason: 'delete', description: 'Delete Account Action' },
      },
    ]);
    await new Promise((r) => setTimeout(r, 10));

    expect(orchestrator.getPhase()).toBe('CONFIRM');
    expect(latestOverlay.banner?.kind).toBe('confirm');

    // Nod to confirm
    mockHead.sendNod();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockEngine.lastRequest?.t).toBe('engine.confirm');
    expect((mockEngine.lastRequest as any).accept).toBe(true);
    expect(orchestrator.getPhase()).toBe('AIMING');
  });

  it('cancels Important actions when head shake or no intent received', async () => {
    mockHead.sendQuadrant('TR');
    await new Promise((r) => setTimeout(r, 10));

    orchestrator.handleIntent({
      k: 'target',
      verb: 'click',
      query: { raw: 'purchase', text: 'purchase' },
    });
    await new Promise((r) => setTimeout(r, 10));

    const req = mockEngine.lastRequest as any;
    mockEngine.simulateResolveResult(req.id, 'one', [
      {
        id: 'buy_now',
        label: 'Purchase',
        role: 'button',
        rect: { x: 0, y: 0, w: 20, h: 20 },
        important: { reason: 'purchase', description: 'Checkout Purchase' },
      },
    ]);
    await new Promise((r) => setTimeout(r, 10));

    expect(orchestrator.getPhase()).toBe('CONFIRM');

    // Head shake cancels
    mockHead.sendShake();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockEngine.lastRequest?.t).toBe('engine.confirm');
    expect((mockEngine.lastRequest as any).accept).toBe(false);
    expect(orchestrator.getPhase()).toBe('AIMING');
  });

  it('times out after 5 seconds of silence during confirmation and cancels', async () => {
    const [t1, t2] = memoryTransport();
    const shortOrch = startOrchestrator({ transport: t1, confirmTimeoutMs: 50 });
    const localHead = createMockHead(t1);
    const localEngine = createMockEngine(t2);

    localHead.sendQuadrant('TL');
    await new Promise((r) => setTimeout(r, 10));

    shortOrch.handleIntent({
      k: 'target',
      verb: 'click',
      query: { raw: 'close tab', text: 'close tab' },
    });
    await new Promise((r) => setTimeout(r, 10));

    const req = localEngine.lastRequest as any;
    localEngine.simulateResolveResult(req.id, 'one', [
      {
        id: 'close_tab_btn',
        label: 'Close Tab',
        role: 'button',
        rect: { x: 0, y: 0, w: 10, h: 10 },
        important: { reason: 'close_tab', description: 'Close this tab' },
      },
    ]);
    await new Promise((r) => setTimeout(r, 10));

    expect(shortOrch.getPhase()).toBe('CONFIRM');

    // Wait past 50 ms timeout
    await new Promise((r) => setTimeout(r, 80));

    expect(localEngine.lastRequest?.t).toBe('engine.confirm');
    expect((localEngine.lastRequest as any).accept).toBe(false);
    expect(shortOrch.getPhase()).toBe('AIMING');

    shortOrch.stop();
    localHead.destroy();
    localEngine.destroy();
  });

  // 7. Global commands bypass quadrant
  it('global scroll command bypasses quadrant and fires engine.global', async () => {
    mockHead.sendQuadrant('TL');
    await new Promise((r) => setTimeout(r, 10));

    orchestrator.handleIntent({ k: 'global', name: 'scroll_down' });
    await new Promise((r) => setTimeout(r, 10));

    expect(mockEngine.lastRequest?.t).toBe('engine.global');
    expect((mockEngine.lastRequest as any).name).toBe('scroll_down');
    expect(orchestrator.getPhase()).toBe('AIMING');
  });

  // 8. Pause and Resume (via head.facing and user command)
  it('pauses on look-away (head.facing false) and resumes on look-back (head.facing true)', async () => {
    mockHead.sendQuadrant('TL');
    await new Promise((r) => setTimeout(r, 10));
    expect(orchestrator.getPhase()).toBe('AIMING');

    // Look-away
    mockHead.sendFacing(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(orchestrator.getPhase()).toBe('PAUSED');
    expect(latestOverlay.paused).toBe(true);

    // Look back
    mockHead.sendFacing(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(orchestrator.getPhase()).toBe('AIMING');
    expect(latestOverlay.paused).toBe(false);
  });

  it('pauses and resumes via voice control commands', async () => {
    orchestrator.handleIntent({ k: 'control', name: 'pause' });
    await new Promise((r) => setTimeout(r, 10));
    expect(orchestrator.getPhase()).toBe('PAUSED');

    orchestrator.handleIntent({ k: 'control', name: 'resume' });
    await new Promise((r) => setTimeout(r, 10));
    expect(orchestrator.getPhase()).toBe('IDLE');
  });

  // 9. Dictation Mode
  it('handles DICTATION phase and sends text to engine', async () => {
    orchestrator.handleIntent({ k: 'control', name: 'dictate_start' });
    await new Promise((r) => setTimeout(r, 10));
    expect(orchestrator.getPhase()).toBe('DICTATION');

    orchestrator.handleIntent({ k: 'dictation', text: 'Hello world', final: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockEngine.lastRequest?.t).toBe('engine.type');
    expect((mockEngine.lastRequest as any).mode).toBe('insert');

    orchestrator.handleIntent({ k: 'control', name: 'dictate_stop' });
    await new Promise((r) => setTimeout(r, 10));
    expect(orchestrator.getPhase()).toBe('IDLE');
  });
});
