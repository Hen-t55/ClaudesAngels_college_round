import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { memoryTransport } from '../src/shared/bus';
import { startOrchestrator, Orchestrator } from '../src/sidepanel/orchestrator';
import { createHeadModule, VisionModuleHandle } from '../src/sidepanel/vision';
import { startEngine, Engine } from '../src/content/engine';
import { mountOverlay } from '../src/content/overlay';
import type { OverlayState } from '../src/shared/contract';

describe('Integration 1: End-to-End Module Wiring Suite', () => {
  let tSidepanel: any;
  let tContent: any;
  let orchestrator: Orchestrator;
  let visionHandle: VisionModuleHandle;
  let engine: Engine;
  let unmountOverlayFn: () => void;
  let latestOverlay: OverlayState;

  // JSDOM has an issue where UIEventImpl rejects window in PointerEventInit/MouseEventInit if not passed directly through its internal proxy
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

  beforeEach(() => {
    // Setup simulated DOM fixture for "Color-Differentiated Buttons" / "Repeated Buttons"
    document.body.innerHTML = `
      <div id="container" style="position:relative; width:800px; height:600px;">
        <!-- Top-Left Quadrant Buttons (TL) -->
        <div id="card-1" style="position:absolute; top:50px; left:50px; width:200px; height:100px;">
          <button id="btn-blue-1" class="btn btn-blue" style="background-color: rgb(59, 130, 246);">Select Option</button>
        </div>
        <div id="card-2" style="position:absolute; top:180px; left:50px; width:200px; height:100px;">
          <button id="btn-blue-2" class="btn btn-blue" style="background-color: rgb(59, 130, 246);">Select Option</button>
        </div>
        <div id="card-3" style="position:absolute; top:320px; left:50px; width:200px; height:100px;">
          <button id="btn-blue-3" class="btn btn-blue" style="background-color: rgb(59, 130, 246);">Select Option</button>
        </div>
      </div>
    `;

    // Mock bounding rects in JSDOM so elements have realistic coordinates
    const btn1 = document.getElementById('btn-blue-1')!;
    const btn2 = document.getElementById('btn-blue-2')!;
    const btn3 = document.getElementById('btn-blue-3')!;

    btn1.getBoundingClientRect = () => ({
      x: 50, y: 50, width: 120, height: 40, top: 50, left: 50, right: 170, bottom: 90, toJSON: () => {},
    } as any);
    btn2.getBoundingClientRect = () => ({
      x: 50, y: 180, width: 120, height: 40, top: 180, left: 50, right: 170, bottom: 220, toJSON: () => {},
    } as any);
    btn3.getBoundingClientRect = () => ({
      x: 50, y: 320, width: 120, height: 40, top: 320, left: 50, right: 170, bottom: 360, toJSON: () => {},
    } as any);

    // Create bidirectional transport (sidepanel <-> content)
    [tSidepanel, tContent] = memoryTransport();

    // 1. Sidepanel hosts: Orchestrator + Vision + Overlay listener
    tSidepanel.on('overlay', (st: OverlayState) => {
      latestOverlay = st;
    });

    orchestrator = startOrchestrator({ transport: tSidepanel });
    visionHandle = createHeadModule(tSidepanel);
    visionHandle.setSimulatorActive(true); // Enable keyboard head simulator

    // 2. Content script hosts: Engine + Shadow DOM Overlay
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

  it('Scenario: Aim at TL quadrant with keyboard simulator, say "click the second blue button", right button clicked', async () => {
    let button2Clicked = false;
    document.getElementById('btn-blue-2')!.addEventListener('click', () => {
      button2Clicked = true;
    });

    // 1. Keyboard simulator selects Top-Left quadrant (Key: 'q')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    await new Promise((r) => setTimeout(r, 20));

    expect(orchestrator.getPhase()).toBe('AIMING');
    expect(latestOverlay.quadrant).toBe('TL');

    // 2. Voice recognition simulates speech: "click the second blue button"
    // Triggers speech.onset (locking quadrant) then final speech.result
    tSidepanel.send('speech', { t: 'speech.onset' });
    await new Promise((r) => setTimeout(r, 10));

    expect(latestOverlay.quadrantLocked).toBe(true);

    tSidepanel.send('speech', {
      t: 'speech.result',
      text: 'click the second blue button',
      final: true,
      confidence: 0.95,
    });
    await new Promise((r) => setTimeout(r, 50));

    // 3. Right button (#btn-blue-2) should have received the click event from P2's executor
    expect(button2Clicked).toBe(true);
    // 4. Orchestrator state re-arms back to AIMING after routine action completion
    expect(orchestrator.getPhase()).toBe('AIMING');
    expect(latestOverlay.quadrantLocked).toBe(false);
  });

  it('Scenario: Global command "scroll down" executes without a quadrant', async () => {
    let scrolled = false;
    // JSDOM window.scrollBy spy
    window.scrollBy = () => {
      scrolled = true;
    };

    // No quadrant selected (IDLE)
    expect(orchestrator.getPhase()).toBe('IDLE');

    // Utterance: "scroll down"
    tSidepanel.send('speech', {
      t: 'speech.result',
      text: 'scroll down',
      final: true,
      confidence: 0.98,
    });
    await new Promise((r) => setTimeout(r, 30));

    expect(scrolled).toBe(true);
  });

  it('Scenario: Keyboard simulator head flick navigates hop shifter and nod selects', async () => {
    let button1Clicked = false;
    document.getElementById('btn-blue-1')!.addEventListener('click', () => {
      button1Clicked = true;
    });

    // Aim at TL quadrant
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    await new Promise((r) => setTimeout(r, 20));

    // Force hop mode
    orchestrator.handleIntent({ k: 'control', name: 'hop_mode' });

    // Say ambiguous query "click button" matching multiple buttons in TL
    tSidepanel.send('speech', {
      t: 'speech.result',
      text: 'click button',
      final: true,
      confidence: 0.95,
    });
    await new Promise((r) => setTimeout(r, 30));

    expect(orchestrator.getPhase()).toBe('DISAMBIGUATE');
    expect(latestOverlay.gear).toBe('hop');

    // Keyboard simulator Head Nod (Key: 'n') activates focused element (first button)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    await new Promise((r) => setTimeout(r, 30));

    expect(button1Clicked).toBe(true);
    expect(orchestrator.getPhase()).toBe('AIMING');
  });
});
