import type { Verb, Scope } from '../../shared/contract';
import type { IndexedElement } from './types';

export class Executor {
  /**
   * Dispatches full pointer and mouse event sequence, followed by .click() fallback:
   * pointerover -> mouseover -> pointerdown -> mousedown -> focus -> pointerup -> mouseup -> click
   */
  public static click(element: Element): void {
    const doc = element.ownerDocument || document;
    const win = doc.defaultView || window;
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const eventInit: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: win,
      clientX: cx,
      clientY: cy,
      screenX: cx,
      screenY: cy,
      button: 0,
      buttons: 1,
      isPrimary: true,
    };

    // 1. Pointer over & Mouse over
    element.dispatchEvent(new PointerEvent('pointerover', eventInit));
    element.dispatchEvent(new MouseEvent('mouseover', eventInit));

    // 2. Pointer down & Mouse down
    element.dispatchEvent(new PointerEvent('pointerdown', eventInit));
    element.dispatchEvent(new MouseEvent('mousedown', eventInit));

    // 3. Focus if applicable
    if (element instanceof HTMLElement) {
      element.focus();
    }

    // 4. Pointer up & Mouse up
    element.dispatchEvent(new PointerEvent('pointerup', eventInit));
    element.dispatchEvent(new MouseEvent('mouseup', eventInit));

    // 5. Click event
    const clickEv = new MouseEvent('click', {
      ...eventInit,
      buttons: 0,
    });
    const dispatched = element.dispatchEvent(clickEv);

    // Fallback: If not handled or standard button/link, call .click()
    if (dispatched && typeof (element as HTMLElement).click === 'function') {
      try {
        (element as HTMLElement).click();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Double click sequence
   */
  public static doubleClick(element: Element): void {
    this.click(element);
    this.click(element);

    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const win = element.ownerDocument?.defaultView || window;

    element.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: win,
        clientX: cx,
        clientY: cy,
        detail: 2,
      })
    );
  }

  /**
   * Right click (context menu)
   */
  public static rightClick(element: Element): void {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const win = element.ownerDocument?.defaultView || window;

    const eventInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: win,
      clientX: cx,
      clientY: cy,
      button: 2,
      buttons: 2,
    };

    element.dispatchEvent(new MouseEvent('mousedown', eventInit));
    element.dispatchEvent(new MouseEvent('mouseup', eventInit));
    element.dispatchEvent(new MouseEvent('contextmenu', eventInit));
  }

  /**
   * Focus target element
   */
  public static focus(element: Element): void {
    if (element instanceof HTMLElement) {
      element.focus();
    }
  }

  /**
   * Perform given verb on target element
   */
  public static performVerb(verb: Verb, target: IndexedElement): void {
    switch (verb) {
      case 'click':
      case 'open':
        this.click(target.element);
        break;
      case 'double_click':
        this.doubleClick(target.element);
        break;
      case 'right_click':
        this.rightClick(target.element);
        break;
      case 'focus':
        this.focus(target.element);
        break;
      case 'search':
        this.focus(target.element);
        break;
    }
  }

  /**
   * Find scrollable container within scope, else page
   */
  public static scroll(
    direction: 'scroll_down' | 'scroll_up' | 'scroll_top' | 'scroll_bottom',
    scope?: Scope
  ): void {
    let container: HTMLElement | Window = window;

    if (scope && scope.k === 'rect') {
      const { x, y } = scope.rect;
      const el = document.elementFromPoint(x + 10, y + 10);
      if (el) {
        let curr: Element | null = el;
        while (curr) {
          const style = window.getComputedStyle(curr);
          if (
            ['auto', 'scroll'].includes(style.overflowY) &&
            curr.scrollHeight > curr.clientHeight
          ) {
            container = curr as HTMLElement;
            break;
          }
          curr = curr.parentElement;
        }
      }
    }

    const delta = window.innerHeight * 0.7;

    if (container instanceof Window) {
      switch (direction) {
        case 'scroll_down':
          window.scrollBy({ top: delta, behavior: 'smooth' });
          break;
        case 'scroll_up':
          window.scrollBy({ top: -delta, behavior: 'smooth' });
          break;
        case 'scroll_top':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'scroll_bottom':
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          break;
      }
    } else {
      switch (direction) {
        case 'scroll_down':
          container.scrollBy({ top: delta, behavior: 'smooth' });
          break;
        case 'scroll_up':
          container.scrollBy({ top: -delta, behavior: 'smooth' });
          break;
        case 'scroll_top':
          container.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'scroll_bottom':
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
          break;
      }
    }
  }

  /**
   * Keyboard actions (Enter, Tab, Backspace, SelectAll, DeleteWord, DeleteSentence)
   */
  public static key(
    key: 'Enter' | 'Tab' | 'Backspace' | 'SelectAll' | 'DeleteWord' | 'DeleteSentence'
  ): void {
    const active = document.activeElement;

    if (key === 'SelectAll') {
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        active.select();
      } else {
        const sel = window.getSelection();
        if (sel && active) {
          const range = document.createRange();
          range.selectNodeContents(active);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      return;
    }

    if (key === 'DeleteWord' || key === 'DeleteSentence') {
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const val = active.value;
        const start = active.selectionStart || 0;
        if (key === 'DeleteWord') {
          // Find preceding word boundary
          const before = val.slice(0, start);
          const match = before.match(/(\s*\S+)\s*$/);
          const len = match ? match[0].length : 1;
          const newVal = val.slice(0, Math.max(0, start - len)) + val.slice(start);
          active.value = newVal;
          active.setSelectionRange(start - len, start - len);
        } else {
          // Delete sentence/line
          active.value = val.slice(start);
          active.setSelectionRange(0, 0);
        }
        active.dispatchEvent(new Event('input', { bubbles: true }));
        active.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }

    // Standard Enter, Tab, Backspace event dispatch
    const target = active || document.body;
    const keyData: Record<string, { key: string; code: string; keyCode: number }> = {
      Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
      Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
      Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
    };

    const d = keyData[key] || { key, code: key, keyCode: 0 };

    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: d.key,
        code: d.code,
        keyCode: d.keyCode,
        which: d.keyCode,
      })
    );

    target.dispatchEvent(
      new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
        key: d.key,
        code: d.code,
        keyCode: d.keyCode,
        which: d.keyCode,
      })
    );

    // Default browser fallback for Backspace on input
    if (key === 'Backspace' && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
      const val = active.value;
      const start = active.selectionStart || 0;
      if (start > 0) {
        active.value = val.slice(0, start - 1) + val.slice(start);
        active.setSelectionRange(start - 1, start - 1);
        active.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }
}
