import type { Transport } from '../shared/bus';
import type { HeadEvent } from '../shared/contract';

export interface NaiveBaselineOptions {
  dwellTimeMs?: number;
  cursorRadius?: number;
  cursorColor?: string;
  dwellColor?: string;
}

export interface NaiveBaselineHandle {
  destroy: () => void;
  getCursorPos: () => { x: number; y: number };
  getDwellProgress: () => number;
  getHoveredElement: () => Element | null;
}

/**
 * Naive baseline cursor system for Handsfree evaluation / Chaos Lab benchmarks.
 * Consumes `head.pointer` (0..1 normalized coordinates), draws a virtual cursor overlay,
 * tracks continuous dwell over clickable DOM targets, and triggers a synthetic click.
 * Has NO snapping, NO voice disambiguation, and NO quadrant filtering.
 */
export function startNaiveBaseline(
  transport: Transport,
  doc: Document = document,
  options: NaiveBaselineOptions = {}
): NaiveBaselineHandle {
  const dwellTimeMs = options.dwellTimeMs ?? 1000;
  const cursorRadius = options.cursorRadius ?? 12;
  const cursorColor = options.cursorColor ?? '#ef4444'; // Red virtual cursor
  const dwellColor = options.dwellColor ?? '#22c55e'; // Green filling ring

  // 1. Create or attach shadow DOM host for cursor overlay to prevent CSS pollution
  const hostId = '__hf_naive_baseline_host__';
  let host = doc.getElementById(hostId) as HTMLElement | null;
  if (host) {
    host.remove();
  }
  host = doc.createElement('div');
  host.id = hostId;
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '100vw';
  host.style.height = '100vh';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483647';
  doc.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Add styles
  const style = doc.createElement('style');
  style.textContent = `
    .naive-cursor {
      position: absolute;
      width: ${cursorRadius * 2}px;
      height: ${cursorRadius * 2}px;
      margin-left: -${cursorRadius}px;
      margin-top: -${cursorRadius}px;
      border-radius: 50%;
      background: ${cursorColor};
      border: 2px solid #ffffff;
      box-shadow: 0 0 10px rgba(0,0,0,0.5), inset 0 0 4px rgba(0,0,0,0.4);
      pointer-events: none;
      transform: translate3d(0, 0, 0);
      will-change: transform;
      z-index: 10;
      transition: transform 0.05s ease-out;
    }
    .naive-dwell-ring {
      position: absolute;
      top: -6px;
      left: -6px;
      width: ${cursorRadius * 2 + 12}px;
      height: ${cursorRadius * 2 + 12}px;
      border-radius: 50%;
      border: 3px solid transparent;
      border-top-color: ${dwellColor};
      border-right-color: ${dwellColor};
      box-sizing: border-box;
      pointer-events: none;
      transform-origin: center center;
    }
    .naive-click-ripple {
      position: absolute;
      width: ${cursorRadius * 2}px;
      height: ${cursorRadius * 2}px;
      margin-left: -${cursorRadius}px;
      margin-top: -${cursorRadius}px;
      border-radius: 50%;
      border: 3px solid #22c55e;
      pointer-events: none;
      animation: ripple 0.4s ease-out forwards;
    }
    @keyframes ripple {
      0% { transform: scale(1); opacity: 1; }
      100% { transform: scale(2.5); opacity: 0; }
    }
  `;
  shadow.appendChild(style);

  const cursorEl = doc.createElement('div');
  cursorEl.className = 'naive-cursor';
  const ringEl = doc.createElement('div');
  ringEl.className = 'naive-dwell-ring';
  ringEl.style.display = 'none';
  cursorEl.appendChild(ringEl);
  shadow.appendChild(cursorEl);

  const winW = typeof window !== 'undefined' ? window.innerWidth || 1024 : 1024;
  const winH = typeof window !== 'undefined' ? window.innerHeight || 768 : 768;
  let currentX = winW / 2;
  let currentY = winH / 2;
  let hoveredTarget: Element | null = null;
  let dwellStartTime: number | null = null;
  let dwellProgress = 0;
  let animTimer: any = null;
  let lastClickTime = 0;

  function updateCursorPos(cssX: number, cssY: number) {
    currentX = cssX;
    currentY = cssY;
    cursorEl.style.transform = `translate3d(${cssX}px, ${cssY}px, 0)`;
  }

  // Find clickable target underneath point
  function getClickableTargetAt(x: number, y: number): Element | null {
    if (typeof doc.elementFromPoint !== 'function') return null;
    // Hide host temporarily to query document underneath
    host!.style.visibility = 'hidden';
    const rawEl = doc.elementFromPoint(x, y);
    host!.style.visibility = 'visible';
    if (!rawEl) return null;

    // Check if element or its ancestors match clickable selector
    const clickable = rawEl.closest(
      'button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [tabindex]:not([tabindex="-1"]), [onclick]'
    );
    return clickable || rawEl;
  }

  function triggerClick(element: Element) {
    // Ripple effect
    const ripple = doc.createElement('div');
    ripple.className = 'naive-click-ripple';
    ripple.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    shadow.appendChild(ripple);
    setTimeout(() => ripple.remove(), 450);

    // Synthetic click dispatch
    if (typeof (element as any).click === 'function') {
      (element as any).click();
    } else {
      const clickEvt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: currentX,
        clientY: currentY,
      });
      element.dispatchEvent(clickEvt);
    }

    if (element instanceof HTMLElement) {
      try {
        element.focus();
      } catch {
        // ignore focus errors
      }
    }
  }

  // Periodic dwell progress checker
  function stepDwell() {
    const now = Date.now();
    if (hoveredTarget && dwellStartTime !== null) {
      const elapsed = now - dwellStartTime;
      dwellProgress = Math.min(1, elapsed / dwellTimeMs);

      if (dwellProgress > 0) {
        ringEl.style.display = 'block';
        ringEl.style.transform = `rotate(${dwellProgress * 360}deg)`;
      }

      if (dwellProgress >= 1.0) {
        if (now - lastClickTime > 500) {
          triggerClick(hoveredTarget);
          lastClickTime = now;
        }
        dwellStartTime = now; // reset dwell
        dwellProgress = 0;
      }
    } else {
      dwellProgress = 0;
      ringEl.style.display = 'none';
    }
  }
  animTimer = setInterval(stepDwell, 30);

  // Subscribe to transport head.event
  const unsubscribe = transport.on('head.event', (evt: HeadEvent) => {
    if (evt.t === 'head.pointer') {
      const width = typeof window !== 'undefined' ? window.innerWidth || 1024 : 1024;
      const height = typeof window !== 'undefined' ? window.innerHeight || 768 : 768;
      const x = Math.max(0, Math.min(1, evt.x)) * width;
      const y = Math.max(0, Math.min(1, evt.y)) * height;
      updateCursorPos(x, y);

      const target = getClickableTargetAt(x, y);
      if (target !== hoveredTarget) {
        hoveredTarget = target;
        dwellStartTime = target ? Date.now() : null;
        dwellProgress = 0;
      }
    }
  });

  updateCursorPos(currentX, currentY);

  return {
    destroy: () => {
      unsubscribe();
      if (animTimer !== null) clearInterval(animTimer);
      host?.remove();
    },
    getCursorPos: () => ({ x: currentX, y: currentY }),
    getDwellProgress: () => dwellProgress,
    getHoveredElement: () => hoveredTarget,
  };
}
