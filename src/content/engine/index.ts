import type { Transport } from '../../shared/bus';
import type {
  EngineRequest,
  EngineEvent,
  Dir,
  MatchMeta,
  Rect,
  Scope,
  TargetQuery,
  Verb,
} from '../../shared/contract';
import { DomIndexer } from './dom-indexer';
import { Resolver } from './resolver';
import { HopNavigator } from './hop-navigator';
import { Executor } from './executor';
import type { IndexedElement } from './types';

export class Engine {
  private indexer: DomIndexer;
  private hopNavigator: HopNavigator;
  private transport: Transport | null = null;
  private currentMatches: IndexedElement[] = [];

  // Zoom state
  private zoomStack: Rect[] = [];
  private zoomDepth = 0;

  // Undo log (up to 10 reversible actions)
  private undoStack: { 
    type: 'type' | 'scroll'; 
    target?: HTMLElement; 
    value?: string; 
    scrollX?: number; 
    scrollY?: number; 
  }[] = [];

  // Pending confirmation
  private pendingConfirm: { id: string; matchId: string; verb: Verb } | null = null;
  private pendingFormSubmit: HTMLFormElement | null = null;
  private isConfirmingSubmit = false;

  private handleSubmit = (e: SubmitEvent) => {
    if (this.isConfirmingSubmit) return;

    const form = e.target as HTMLFormElement;
    // Reject already-cancelled events, detached forms, or non-form targets
    if (!form || !(form instanceof HTMLFormElement) || !form.isConnected || e.defaultPrevented) return;

    const inputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
    if (inputs.length <= 1) return; // single-field search forms are routine

    e.preventDefault();
    e.stopImmediatePropagation();

    const actionId = `submit_${Date.now()}`;
    this.pendingConfirm = { id: actionId, matchId: 'form', verb: 'click' };
    this.pendingFormSubmit = form;

    this.transport?.send('engine.event', {
      t: 'engine.confirmNeeded',
      actionId,
      info: { reason: 'form_submit', description: 'Submit multi-field form' }
    });
  };

  constructor(transport?: Transport) {
    this.indexer = new DomIndexer();
    this.hopNavigator = new HopNavigator();
    if (transport) {
      this.attachTransport(transport);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('submit', this.handleSubmit, true); // capture phase
    }
  }

  public getIndexer(): DomIndexer {
    return this.indexer;
  }

  public getHopNavigator(): HopNavigator {
    return this.hopNavigator;
  }

  public attachTransport(transport: Transport): void {
    this.transport = transport;

    transport.on('engine.request', (req: EngineRequest) => {
      this.handleRequest(req);
    });

    transport.send('engine.event', {
      t: 'engine.ready',
      url: typeof location !== 'undefined' ? location.href : '',
    });
  }

  public handleRequest(req: EngineRequest): void {
    switch (req.t) {
      case 'engine.resolve':
        this.handleResolve(req.id, req.verb, req.query, req.scope);
        break;

      case 'engine.activate':
        this.handleActivate(req.id, req.matchId, req.verb, req.confirmed);
        break;

      case 'engine.hop':
        this.handleHop(req.dir);
        break;

      case 'engine.showNumbers':
        this.handleShowNumbers(req.scope);
        break;

      case 'engine.zoom':
        this.handleZoom(req.op);
        break;

      case 'engine.global':
        this.pushUndo({ type: 'scroll', scrollX: window.scrollX, scrollY: window.scrollY });
        Executor.scroll(req.name, req.scope);
        this.transport?.send('engine.event', {
          t: 'engine.done',
          ok: true,
          what: req.name,
        });
        break;

      case 'engine.type':
        this.handleType(req.text, req.mode, req.field);
        break;

      case 'engine.key':
        Executor.key(req.key);
        this.transport?.send('engine.event', {
          t: 'engine.done',
          ok: true,
          what: `key_${req.key}`,
        });
        break;

      case 'engine.undo':
        this.handleUndo();
        break;

      case 'engine.confirm':
        this.handleConfirm(req.actionId, req.accept);
        break;

      case 'engine.clear':
        this.currentMatches = [];
        this.hopNavigator.setMatches([]);
        this.zoomStack = [];
        this.zoomDepth = 0;
        this.pendingConfirm = null;
        this.pendingFormSubmit = null;
        this.transport?.send('engine.event', {
          t: 'engine.result',
          id: 'clear',
          status: 'none',
          matches: [],
          widened: false,
        });
        break;

      default:
        break;
    }
  }

  public handleResolve(
    reqId: string,
    verb: Verb,
    query: TargetQuery,
    scope: Scope
  ): void {
    const all = this.indexer.index();
    const { status, matches, widened } = Resolver.resolve(all, query, scope, verb);

    this.currentMatches = matches;
    this.hopNavigator.setMatches(matches);

    const matchMetas: MatchMeta[] = matches.map((item, index) => {
      const important = Resolver.checkImportant(verb, item);
      return {
        id: item.id,
        label: item.label,
        role: item.role,
        rect: item.rect,
        number: index + 1,
        important,
      };
    });

    this.transport?.send('engine.event', {
      t: 'engine.result',
      id: reqId,
      status,
      matches: matchMetas,
      widened,
    });

    if (matches.length > 0) {
      this.transport?.send('engine.event', {
        t: 'engine.focus',
        matchId: matches[0].id,
      });
    }
  }

  public handleActivate(
    reqId: string,
    matchId: string,
    verb: Verb,
    confirmed?: boolean
  ): void {
    let target = this.currentMatches.find((m) => m.id === matchId);
    if (!target) {
      target = this.indexer.getById(matchId);
    }

    if (!target) {
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: false,
        what: `Element ${matchId} not found`,
      });
      return;
    }

    const important = Resolver.checkImportant(verb, target);
    if (important && !confirmed) {
      this.pendingConfirm = { id: reqId, matchId, verb };
      this.transport?.send('engine.event', {
        t: 'engine.confirmNeeded',
        actionId: reqId,
        info: important,
      });
      return;
    }

    Executor.performVerb(verb, target);

    this.transport?.send('engine.event', {
      t: 'engine.done',
      ok: true,
      what: `${verb} on ${target.label || target.id}`,
    });
  }

  public handleHop(dir: Dir): void {
    const focused = this.hopNavigator.hop(dir);
    if (focused) {
      this.transport?.send('engine.event', {
        t: 'engine.focus',
        matchId: focused.id,
      });
    }
  }

  public handleShowNumbers(scope: Scope): void {
    const all = this.indexer.index();
    const scoped = Resolver.filterByScope(all, scope);

    // Sort candidates in reading order: top-to-bottom, then left-to-right
    const sorted = [...scoped].sort((a, b) => {
      const dy = Math.abs(a.rect.y - b.rect.y);
      if (dy < 12) {
        return a.rect.x - b.rect.x;
      }
      return a.rect.y - b.rect.y;
    });

    // Capped at about 40 matches
    this.currentMatches = sorted.slice(0, 40);
    this.hopNavigator.setMatches(this.currentMatches);

    const matches: MatchMeta[] = this.currentMatches.map((item, index) => ({
      id: item.id,
      label: item.label,
      role: item.role,
      rect: item.rect,
      number: index + 1,
    }));

    this.transport?.send('engine.event', {
      t: 'engine.result',
      id: 'show_numbers',
      status: matches.length > 0 ? 'many' : 'none',
      matches,
    });
  }

  /**
   * Recursive 3×3 zoom grid for fallback when resolver returns 'none'.
   * Operations: start (initialize grid over scope), pick (select cell 1-9),
   * back (pop to previous zoom level), click (center click via elementFromPoint).
   */
  public handleZoom(op: { k: 'start'; scope: Scope } | { k: 'pick'; n: number } | { k: 'back' } | { k: 'click' }): void {
    if (op.k === 'start') {
      let rect: Rect;
      if (op.scope.k === 'rect') {
        rect = op.scope.rect;
      } else if (op.scope.k === 'quadrant') {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
        const hw = vw / 2;
        const hh = vh / 2;
        const qx = op.scope.q === 'TR' || op.scope.q === 'BR' ? hw : 0;
        const qy = op.scope.q === 'BL' || op.scope.q === 'BR' ? hh : 0;
        rect = { x: qx, y: qy, w: hw, h: hh };
      } else {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
        rect = { x: 0, y: 0, w: vw, h: vh };
      }
      this.zoomStack = [rect];
      this.zoomDepth = 0;
      this.emitZoomState(rect);
    } else if (op.k === 'pick') {
      const current = this.zoomStack[this.zoomStack.length - 1];
      if (!current) return;

      const n = Math.max(1, Math.min(9, op.n));
      const col = (n - 1) % 3;
      const row = Math.floor((n - 1) / 3);
      const cellW = current.w / 3;
      const cellH = current.h / 3;
      const cellRect: Rect = {
        x: Math.round(current.x + col * cellW),
        y: Math.round(current.y + row * cellH),
        w: Math.round(cellW),
        h: Math.round(cellH),
      };

      this.zoomStack.push(cellRect);
      this.zoomDepth++;

      // Snapping rule: test elements in current cell rect
      const all = this.indexer.index();
      const inCell = Resolver.filterByScope(all, { k: 'rect', rect: cellRect });

      // (4b) Pick only narrows — never auto-click; only 'click' op snaps.
      if (inCell.length === 1) {
        this.currentMatches = inCell;
        this.hopNavigator.setMatches(inCell);
        this.emitZoomState(cellRect, 'one');
        return;
      } else if (inCell.length > 1) {
        this.currentMatches = inCell;
        this.hopNavigator.setMatches(inCell);
        this.emitZoomState(cellRect, 'many');
        return;
      }

      // If depth reached >= 3 and no indexed elements found, act on center point
      if (this.zoomDepth >= 3) {
        this.handleZoom({ k: 'click' });
        return;
      }

      this.emitZoomState(cellRect);
    } else if (op.k === 'back') {
      if (this.zoomStack.length > 1) {
        this.zoomStack.pop();
        this.zoomDepth = Math.max(0, this.zoomDepth - 1);
        const prev = this.zoomStack[this.zoomStack.length - 1];
        this.emitZoomState(prev);
      } else {
        this.zoomStack = [];
        this.zoomDepth = 0;
        this.transport?.send('engine.event', {
          t: 'engine.done',
          ok: false,
          what: 'zoom_cancelled',
        });
      }
    } else if (op.k === 'click') {
      const current = this.zoomStack[this.zoomStack.length - 1];
      if (!current) return;

      const cx = current.x + current.w / 2;
      const cy = current.y + current.h / 2;

      let el: Element | null = null;
      try {
        el = document.elementFromPoint(cx, cy);

        // If hit is an iframe, resolve element within iframe content document
        if (el instanceof HTMLIFrameElement) {
          try {
            const frameDoc = el.contentDocument || el.contentWindow?.document;
            if (frameDoc) {
              const frameRect = el.getBoundingClientRect();
              const localX = cx - frameRect.left;
              const localY = cy - frameRect.top;
              const innerEl = frameDoc.elementFromPoint(localX, localY);
              if (innerEl) {
                el = innerEl;
              }
            }
          } catch {
            // Cross-origin iframe fallback:
            // When cross-origin, we can't access contentDocument due to CORS restrictions.
            // Dispatching pointer/mouse events directly on the iframe element is the only local recourse.
            // This is an architectural limitation of relying on standard DOM manipulation from the parent context.
          }
        }
      } catch {
        // elementFromPoint not available
      }

      if (el) {
        Executor.click(el);
        this.emitZoomState(current, 'center');
        this.transport?.send('engine.event', {
          t: 'engine.done',
          ok: true,
          what: 'zoom_click_center',
        });
      } else {
        this.transport?.send('engine.event', {
          t: 'engine.done',
          ok: false,
          what: 'zoom_click_no_element',
        });
      }

      this.zoomStack = [];
      this.zoomDepth = 0;
    }
  }

  private emitZoomState(rect: Rect, outcome?: 'one' | 'many' | 'clicked' | 'center'): void {
    const cellW = rect.w / 3;
    const cellH = rect.h / 3;
    const cells: { n: number; rect: Rect }[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        cells.push({
          n: row * 3 + col + 1,
          rect: {
            x: Math.round(rect.x + col * cellW),
            y: Math.round(rect.y + row * cellH),
            w: Math.round(cellW),
            h: Math.round(cellH),
          },
        });
      }
    }
    this.transport?.send('engine.event', {
      t: 'engine.zoomState',
      rect,
      cells,
      depth: this.zoomDepth,
      outcome,
    });
  }

  /**
   * Type text into the focused input (or find a field by label).
   * mode='fill' replaces the value; mode='insert' appends at cursor.
   * Saves previous value for undo.
   */
  public handleType(text: string, mode: 'fill' | 'insert', field?: string): void {
    let target: HTMLElement | null = null;

    if (field) {
      const all = this.indexer.index();
      const normField = field.toLowerCase().trim();
      const match = all.find((el) => {
        if (el.role !== 'input' && el.tagName !== 'textarea' && el.tagName !== 'select' && el.element.getAttribute('contenteditable') !== 'true') {
          return false;
        }
        const label = el.label.toLowerCase();
        const placeholder = (el.element.getAttribute('placeholder') || '').toLowerCase();
        const ariaLabel = (el.element.getAttribute('aria-label') || '').toLowerCase();
        const name = (el.element.getAttribute('name') || '').toLowerCase();
        return (
          label.includes(normField) ||
          placeholder.includes(normField) ||
          ariaLabel.includes(normField) ||
          name.includes(normField)
        );
      });

      if (match && match.element instanceof HTMLElement) {
        target = match.element;
      }
    }

    if (!target) {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        target = active;
      }
    }

    if (!target) {
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: false,
        what: 'No input focused for typing',
      });
      return;
    }

    target.focus();

    // ContentEditable handling
    if (target.isContentEditable) {
      if (mode === 'fill') {
        target.textContent = text;
      } else {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(text);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          target.textContent += text;
        }
      }
      target.dispatchEvent(new Event('input', { bubbles: true }));
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: true,
        what: `typed "${text}" (${mode})`,
      });
      return;
    }

    // Input / TextArea handling (including React controlled inputs)
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.pushUndo({ type: 'type', target, value: target.value });

      let newValue = text;
      if (mode === 'insert') {
        const start = target.selectionStart ?? target.value.length;
        newValue = target.value.slice(0, start) + text + target.value.slice(start);
      }

      // Native property value setter for React inputs
      const proto = Object.getPrototypeOf(target);
      const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (valueSetter) {
        valueSetter.call(target, newValue);
      } else {
        target.value = newValue;
      }

      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));

      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: true,
        what: `typed "${text}" (${mode})`,
      });
    }
  }

  private pushUndo(action: { type: 'type' | 'scroll'; target?: HTMLElement; value?: string; scrollX?: number; scrollY?: number }) {
    this.undoStack.push(action);
    if (this.undoStack.length > 10) {
      this.undoStack.shift();
    }
  }

  /**
   * Undo: pop the last action and revert it.
   */
  public handleUndo(): void {
    const action = this.undoStack.pop();
    if (!action) {
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: false,
        what: 'nothing to undo',
      });
      return;
    }

    if (action.type === 'scroll') {
      window.scrollTo(action.scrollX ?? 0, action.scrollY ?? 0);
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: true,
        what: 'undo_scroll',
      });
    } else if (action.type === 'type' && action.target && action.target.isConnected) {
      const target = action.target as HTMLInputElement | HTMLTextAreaElement;
      target.value = action.value || '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: true,
        what: 'undo_type',
      });
    } else {
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: false,
        what: 'undo_failed',
      });
    }
  }

  /**
   * Handle confirmation response for high-stakes actions.
   */
  public handleConfirm(actionId: string, accept: boolean): void {
    if (!this.pendingConfirm || this.pendingConfirm.id !== actionId) {
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: false,
        what: `No pending action ${actionId}`,
      });
      return;
    }

    if (accept) {
      if (this.pendingFormSubmit && this.pendingConfirm.matchId === 'form') {
        this.isConfirmingSubmit = true;
        this.pendingFormSubmit.requestSubmit();
        this.isConfirmingSubmit = false;
        this.transport?.send('engine.event', {
          t: 'engine.done',
          ok: true,
          what: 'form_submitted',
        });
      } else {
        // Re-activate with confirmed=true
        this.handleActivate(
          this.pendingConfirm.id,
          this.pendingConfirm.matchId,
          this.pendingConfirm.verb,
          true
        );
      }
    } else {
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: false,
        what: 'action_cancelled',
      });
    }

    this.pendingConfirm = null;
  }

  public destroy(): void {
    this.indexer.destroy();
    if (typeof window !== 'undefined') {
      window.removeEventListener('submit', this.handleSubmit, true);
    }
  }
}

export function startEngine(transport: Transport): Engine {
  return new Engine(transport);
}
