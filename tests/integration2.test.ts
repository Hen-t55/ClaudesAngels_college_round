import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { memoryTransport } from '../src/shared/bus';
import { startOrchestrator, Orchestrator } from '../src/sidepanel/orchestrator';
import { createHeadModule, VisionModuleHandle } from '../src/sidepanel/vision';
import { startEngine, Engine } from '../src/content/engine';
import { mountOverlay } from '../src/content/overlay';
import type { OverlayState } from '../src/shared/contract';

describe('Integration 2: Full Workflow Verification Suite', () => {
  let tSidepanel: any;
  let tContent: any;
  let orchestrator: Orchestrator;
  let visionHandle: VisionModuleHandle;
  let engine: Engine;
  let unmountOverlayFn: () => void;
  let latestOverlay: OverlayState;
  let tabCommands: any[];

  // JSDOM event shim
  const OriginalPointerEvent = window.PointerEvent;
  if (OriginalPointerEvent) {
    (window as any).PointerEvent = class extends OriginalPointerEvent {
      constructor(type: string, params: any = {}) {
        const { view, ...rest } = params;
        super(type, rest);
      }
    };
  }
  const OriginalMouseEvent = window.MouseEvent;
  if (OriginalMouseEvent) {
    (window as any).MouseEvent = class extends OriginalMouseEvent {
      constructor(type: string, params: any = {}) {
        const { view, ...rest } = params;
        super(type, rest);
      }
    };
  }

  const flush = () => new Promise<void>((r) => setTimeout(r, 20));

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="viewport" style="position:relative; width:1000px; height:800px;">
        <!-- TL Quadrant: Single routine button -->
        <div id="tl-box" style="position:absolute; top:50px; left:50px; width:300px; height:200px;">
          <button id="btn-save" class="btn">Save Document</button>
          <button id="btn-delete" class="btn" data-important="delete">Delete Account</button>
        </div>

        <!-- TR Quadrant: Multiple matching buttons for disambiguation -->
        <div id="tr-box" style="position:absolute; top:50px; left:550px; width:300px; height:200px;">
          <button id="btn-card-1" class="btn-card">Card Option 1</button>
          <button id="btn-card-2" class="btn-card">Card Option 2</button>
        </div>

        <!-- BL Quadrant: Search form (single field) and Multi-field form -->
        <div id="bl-box" style="position:absolute; top:450px; left:50px; width:400px; height:300px;">
          <form id="search-form">
            <input id="search-input" name="q" type="text" placeholder="Search products..." />
            <button id="search-submit" type="submit">Search</button>
          </form>

          <form id="checkout-form">
            <input id="checkout-name" name="name" type="text" placeholder="Full name" />
            <input id="checkout-card" name="card" type="text" placeholder="Card number" />
            <button id="checkout-submit" type="submit">Pay Now</button>
          </form>
        </div>

        <!-- BR Quadrant: Empty area for zoom grid fallback -->
        <div id="br-box" style="position:absolute; top:450px; left:550px; width:400px; height:300px;">
        </div>
      </div>
    `;

    // Mock bounding client rects
    const setRect = (id: string, x: number, y: number, w: number, h: number) => {
      const el = document.getElementById(id);
      if (el) {
        el.getBoundingClientRect = () => ({
          x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => {},
        } as any);
      }
    };

    setRect('btn-save', 50, 50, 100, 30);
    setRect('btn-delete', 50, 100, 100, 30);
    setRect('btn-card-1', 550, 50, 120, 30);
    setRect('btn-card-2', 550, 100, 120, 30);
    setRect('search-input', 50, 460, 200, 30);
    setRect('search-submit', 260, 460, 80, 30);
    setRect('checkout-name', 50, 520, 200, 30);
    setRect('checkout-card', 50, 560, 200, 30);
    setRect('checkout-submit', 50, 600, 100, 30);

    tabCommands = [];
    [tSidepanel, tContent] = memoryTransport();

    tSidepanel.on('overlay', (st: OverlayState) => {
      latestOverlay = st;
    });

    tSidepanel.on('tab.command', (cmd: any) => {
      tabCommands.push(cmd);
    });

    orchestrator = startOrchestrator({ transport: tSidepanel, confirmTimeoutMs: 3000 });
    visionHandle = createHeadModule(tSidepanel);
    visionHandle.setSimulatorActive(true);

    engine = startEngine(tContent);
    unmountOverlayFn = mountOverlay(tContent);
  });

  afterEach(() => {
    orchestrator.stop();
    engine.destroy();
    unmountOverlayFn();
    visionHandle.setSimulatorActive(false);
    document.body.innerHTML = '';
  });

  // 1. Global Commands without Quadrant
  it('1. Global command "scroll down" executes in IDLE without a quadrant', async () => {
    let scrolled = false;
    window.scrollBy = () => { scrolled = true; };

    expect(orchestrator.getPhase()).toBe('IDLE');
    tSidepanel.send('speech', {
      t: 'speech.result',
      text: 'scroll down',
      final: true,
      confidence: 0.98,
    });
    await flush();

    expect(scrolled).toBe(true);
    expect(orchestrator.getPhase()).toBe('IDLE');
  });

  // 2. Quadrant Lock on Speech Onset
  it('2. Speech onset locks the active quadrant and halts quadrant switching', async () => {
    // Select TR quadrant with key 'e'
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
    await flush();
    expect(orchestrator.getPhase()).toBe('AIMING');
    expect(latestOverlay.quadrant).toBe('TR');
    expect(latestOverlay.quadrantLocked).toBe(false);

    // Utterance onset
    tSidepanel.send('speech', { t: 'speech.onset' });
    await flush();
    expect(orchestrator.getPhase()).toBe('LOCKED');
    expect(latestOverlay.quadrantLocked).toBe(true);

    // Subsequent simulator key 'q' must not change quadrant
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    await flush();
    expect(latestOverlay.quadrant).toBe('TR');
  });

  // 3. One Match -> Immediate Action
  it('3. Routine single match executes immediately and re-arms to AIMING', async () => {
    let clicked = false;
    document.getElementById('btn-save')!.addEventListener('click', () => { clicked = true; });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); // TL
    await flush();

    tSidepanel.send('speech', { t: 'speech.onset' });
    tSidepanel.send('speech', {
      t: 'speech.result',
      text: 'click save document',
      final: true,
      confidence: 0.95,
    });
    await flush();

    expect(clicked).toBe(true);
    expect(orchestrator.getPhase()).toBe('AIMING');
    expect(latestOverlay.quadrantLocked).toBe(false);
  });

  // 4. Many Matches -> Disambiguation with Hop & Voice Gears
  it('4. Many matches trigger DISAMBIGUATE; flick and nod activate in hop gear', async () => {
    let card2Clicked = false;
    document.getElementById('btn-card-2')!.addEventListener('click', () => { card2Clicked = true; });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); // TR
    await flush();

    // Set hop mode
    tSidepanel.send('speech', { t: 'speech.result', text: 'hop mode', final: true, confidence: 1 });
    await flush();
    expect(latestOverlay.gear).toBe('hop');

    // Click cards -> resolves to two candidates
    tSidepanel.send('speech', { t: 'speech.onset' });
    tSidepanel.send('speech', { t: 'speech.result', text: 'click card', final: true, confidence: 0.95 });
    await flush();

    expect(orchestrator.getPhase()).toBe('DISAMBIGUATE');
    expect(latestOverlay.matches.length).toBeGreaterThanOrEqual(2);

    // Flick down to focus second card
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await flush();
    expect(latestOverlay.matches[1].focused).toBe(true);

    // Nod to activate
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    await flush();

    expect(card2Clicked).toBe(true);
    expect(orchestrator.getPhase()).toBe('AIMING');
  });

  it('4b. Voice gear allows number selection in DISAMBIGUATE', async () => {
    let card1Clicked = false;
    document.getElementById('btn-card-1')!.addEventListener('click', () => { card1Clicked = true; });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); // TR
    await flush();

    tSidepanel.send('speech', { t: 'speech.result', text: 'voice mode', final: true, confidence: 1 });
    await flush();
    expect(latestOverlay.gear).toBe('voice');

    tSidepanel.send('speech', { t: 'speech.onset' });
    tSidepanel.send('speech', { t: 'speech.result', text: 'click card', final: true, confidence: 0.95 });
    await flush();

    expect(orchestrator.getPhase()).toBe('DISAMBIGUATE');

    // Say number 1
    tSidepanel.send('speech', { t: 'speech.result', text: 'one', final: true, confidence: 0.98 });
    await flush();

    expect(card1Clicked).toBe(true);
    expect(orchestrator.getPhase()).toBe('AIMING');
  });

  // 5. None Results -> Zoom Grid Fallback
  it('5. None matches in scope escalates to ZOOM grid fallback', async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })); // BR (empty area)
    await flush();

    tSidepanel.send('speech', { t: 'speech.onset' });
    tSidepanel.send('speech', { t: 'speech.result', text: 'click imaginary widget', final: true, confidence: 0.95 });
    await flush();

    // Enters ZOOM grid
    expect(orchestrator.getPhase()).toBe('ZOOM');
    expect(latestOverlay.zoom).toBeDefined();
    expect(latestOverlay.zoom?.cells.length).toBe(9);
  });

  // 6. Confirmation for Close Tab
  it('6. Close tab requires confirmation and cancels on "no"', async () => {
    tSidepanel.send('speech', { t: 'speech.result', text: 'close tab', final: true, confidence: 0.95 });
    await flush();

    expect(orchestrator.getPhase()).toBe('CONFIRM');
    expect(latestOverlay.banner?.kind).toBe('confirm');
    expect(tabCommands.length).toBe(0);

    // Cancel with "no"
    tSidepanel.send('speech', { t: 'speech.result', text: 'no', final: true, confidence: 0.98 });
    await flush();

    expect(tabCommands.length).toBe(0);
    expect(orchestrator.getPhase()).toBe('IDLE');
  });

  // 7. Multi-field Form Submit vs Single-field Search Box Submit
  it('7. Multi-field form submit prompts confirmation; Search form fires routinely', async () => {
    // 7a. Search form submit is routine (single input field)
    const searchForm = document.getElementById('search-form') as HTMLFormElement;
    let searchSubmitted = false;
    searchForm.addEventListener('submit', (e) => {
      searchSubmitted = true;
      e.preventDefault();
    });

    const searchBtn = document.getElementById('search-submit')!;
    searchBtn.click();
    await flush();

    expect(searchSubmitted).toBe(true);
    expect(orchestrator.getPhase()).not.toBe('CONFIRM');

    // 7b. Multi-field checkout form submit triggers confirmation
    const checkoutBtn = document.getElementById('checkout-submit')!;
    checkoutBtn.click();
    await flush();

    expect(orchestrator.getPhase()).toBe('CONFIRM');
    expect(latestOverlay.banner?.text).toContain('form');
  });

  // 8. Field-Name Typing
  it('8. Field-name typing types directly into the named field', async () => {
    const input = document.getElementById('search-input') as HTMLInputElement;

    tSidepanel.send('speech', {
      t: 'speech.result',
      text: 'type wireless headphones in search',
      final: true,
      confidence: 0.95,
    });
    await flush();

    expect(input.value).toBe('wireless headphones');
  });

  // 9. Dictation Mode
  it('9. Dictation mode inserts spoken punctuation and words', async () => {
    const input = document.getElementById('search-input') as HTMLInputElement;
    input.focus();

    tSidepanel.send('speech', { t: 'speech.result', text: 'start dictation', final: true, confidence: 1 });
    await flush();
    expect(orchestrator.getPhase()).toBe('DICTATION');

    tSidepanel.send('speech', {
      t: 'speech.result',
      text: 'hello world comma welcome period',
      final: true,
      confidence: 0.95,
    });
    await flush();

    expect(input.value).toBe('hello world, welcome.');

    tSidepanel.send('speech', { t: 'speech.result', text: 'stop dictation', final: true, confidence: 1 });
    await flush();
    expect(orchestrator.getPhase()).toBe('IDLE');
  });

  // 10. Look-away Pause and Resume
  it('10. Look-away (head.facing false) pauses orchestrator; looking back resumes', async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); // TL
    await flush();
    expect(orchestrator.getPhase()).toBe('AIMING');

    // Simulate look-away with 'L' key in simulator
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    await flush();

    expect(orchestrator.getPhase()).toBe('PAUSED');
    expect(latestOverlay.paused).toBe(true);

    // Look back
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    await flush();

    expect(orchestrator.getPhase()).toBe('AIMING');
    expect(latestOverlay.paused).toBe(false);
  });

  // 11. Undo
  it('11. Undo reverts last typing change', async () => {
    const input = document.getElementById('search-input') as HTMLInputElement;
    input.value = 'initial query';
    input.focus();

    tSidepanel.send('speech', {
      t: 'speech.result',
      text: 'type new query in search',
      final: true,
      confidence: 0.95,
    });
    await flush();
    expect(input.value).toBe('new query');

    // Say "undo"
    tSidepanel.send('speech', { t: 'speech.result', text: 'undo', final: true, confidence: 1 });
    await flush();

    expect(input.value).toBe('initial query');
  });

  // 12. Setup Flow
  it('12. Setup flow transitions phase and notifies progress', async () => {
    tSidepanel.send('head.event', {
      t: 'head.setup',
      step: 'neutral',
      progress: 0.3,
      prompt: 'Keep head centered',
      ok: true,
    });
    await flush();

    expect(orchestrator.getPhase()).toBe('SETUP');
    expect(latestOverlay.banner?.text).toContain('Keep head centered');

    // Setup finishes
    tSidepanel.send('head.event', {
      t: 'head.setup',
      step: 'done',
      progress: 1.0,
      prompt: 'Done',
      ok: true,
    });
    await flush();

    expect(orchestrator.getPhase()).toBe('IDLE');
    expect(latestOverlay.banner?.text).toContain('Calibration complete');
  });
});
