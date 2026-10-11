import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { memoryTransport } from '../shared/bus';
import { startNaiveBaseline } from './naiveBaseline';

describe('NaiveBaseline Dwell Clicker Benchmark Module', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom fallback for elementFromPoint
    if (!document.elementFromPoint) {
      document.elementFromPoint = (x: number, y: number) => document.body;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates cursor position when head.pointer event is received', async () => {
    const [t1, t2] = memoryTransport();
    const baseline = startNaiveBaseline(t1, document, { dwellTimeMs: 1000 });

    t2.send('head.event', { t: 'head.pointer', x: 0.25, y: 0.75 });
    await vi.advanceTimersByTimeAsync(50);

    const pos = baseline.getCursorPos();
    expect(pos.x).toBeCloseTo(0.25 * (window.innerWidth || 1024), -1);
    expect(pos.y).toBeCloseTo(0.75 * (window.innerHeight || 768), -1);

    baseline.destroy();
  });

  it('dwells and clicks on a clickable button element after dwell duration', async () => {
    const btn = document.createElement('button');
    btn.textContent = 'Target Button';
    btn.style.position = 'fixed';
    btn.style.left = '100px';
    btn.style.top = '100px';
    btn.style.width = '100px';
    btn.style.height = '50px';
    document.body.appendChild(btn);

    // Mock elementFromPoint on document
    document.elementFromPoint = (x: number, y: number) => {
      if (x >= 100 && x <= 200 && y >= 100 && y <= 150) {
        return btn;
      }
      return document.body;
    };

    const clickSpy = vi.fn();
    btn.addEventListener('click', clickSpy);

    const [t1, t2] = memoryTransport();
    const baseline = startNaiveBaseline(t1, document, { dwellTimeMs: 600 });

    // Move pointer onto button
    const winW = window.innerWidth || 1024;
    const winH = window.innerHeight || 768;
    const normX = 150 / winW;
    const normY = 125 / winH;

    t2.send('head.event', { t: 'head.pointer', x: normX, y: normY });
    await vi.advanceTimersByTimeAsync(200);

    expect(baseline.getHoveredElement()).toBe(btn);
    expect(clickSpy).not.toHaveBeenCalled();

    // Advance past dwell timeout
    await vi.advanceTimersByTimeAsync(600);

    expect(clickSpy).toHaveBeenCalledTimes(1);

    btn.remove();
    baseline.destroy();
  });

  it('resets dwell progress if pointer moves off the element before dwell completes', async () => {
    const btn = document.createElement('button');
    btn.id = 'cancel-target';
    document.body.appendChild(btn);

    let currentPointed: Element = document.body;
    document.elementFromPoint = () => currentPointed;

    const clickSpy = vi.fn();
    btn.addEventListener('click', clickSpy);

    const [t1, t2] = memoryTransport();
    const baseline = startNaiveBaseline(t1, document, { dwellTimeMs: 800 });

    // Hover button
    currentPointed = btn;
    t2.send('head.event', { t: 'head.pointer', x: 0.1, y: 0.1 });
    await vi.advanceTimersByTimeAsync(300); // partial dwell

    // Move off button before timeout
    currentPointed = document.body;
    t2.send('head.event', { t: 'head.pointer', x: 0.8, y: 0.8 });
    await vi.advanceTimersByTimeAsync(700);

    expect(clickSpy).not.toHaveBeenCalled();

    btn.remove();
    baseline.destroy();
  });
});
