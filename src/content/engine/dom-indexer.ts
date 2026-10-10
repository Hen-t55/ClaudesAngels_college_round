import type { Quadrant, Rect } from '../../shared/contract';
import type { IndexedElement, IndexerOptions } from './types';
import { extractLabel, extractColorName } from './label-extractor';

/**
 * Interactive selector set including:
 * - Native interactive elements (a[href], button, input, select, textarea, details/summary)
 * - ARIA interactive roles (button, link, checkbox, radio, tab, menuitem, switch, option, textbox, searchbox)
 * - tabindex elements (except tabindex="-1")
 * - onclick attribute or contenteditable
 */
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[contenteditable="true"]',
  '[onclick]',
].join(', ');

export class DomIndexer {
  private cache: IndexedElement[] = [];
  private lastIndexedTime = 0;
  private isThrottled = false;
  private throttleTimeout: ReturnType<typeof setTimeout> | null = null;
  private mutationObserver: MutationObserver | null = null;
  private listeners: (() => void)[] = [];
  private elementIdMap = new WeakMap<Element, string>();
  private nextId = 1;

  constructor() {
    this.setupListeners();
  }

  public getOrCreateElementId(el: Element): string {
    let id = this.elementIdMap.get(el);
    if (!id) {
      id = `el_${this.nextId++}`;
      this.elementIdMap.set(el, id);
    }
    return id;
  }

  /**
   * Assigns an element to one of the 4 quadrants based strictly on its CENTER:
   * TL: x < midX && y < midY
   * TR: x >= midX && y < midY
   * BL: x < midX && y >= midY
   * BR: x >= midX && y >= midY
   */
  public static computeQuadrant(
    centerX: number,
    centerY: number,
    viewportWidth: number,
    viewportHeight: number
  ): Quadrant {
    const midX = viewportWidth / 2;
    const midY = viewportHeight / 2;

    if (centerX < midX) {
      return centerY < midY ? 'TL' : 'BL';
    } else {
      return centerY < midY ? 'TR' : 'BR';
    }
  }

  /**
   * Determine primary semantic role
   */
  public static extractRole(el: Element): string {
    const explicitRole = el.getAttribute('role');
    if (explicitRole) return explicitRole.toLowerCase();

    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'textarea') return 'input';
    if (tag === 'select') return 'select';
    if (tag === 'summary') return 'button';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
      if (['checkbox', 'radio'].includes(type)) return type;
      return 'input';
    }
    if (el.getAttribute('contenteditable') === 'true') return 'input';

    const cursor = window.getComputedStyle?.(el)?.cursor;
    if (cursor === 'pointer') return 'button';

    return tag;
  }

  /**
   * Check visibility and hit-testability
   */
  public static isElementVisible(
    el: Element,
    rect: DOMRect,
    viewportWidth: number,
    viewportHeight: number,
    doc: Document
  ): { isVisible: boolean; isHitTestable: boolean } {
    // 1. Dimensions check
    if (rect.width <= 0 || rect.height <= 0) {
      return { isVisible: false, isHitTestable: false };
    }

    // 2. Viewport intersection
    if (
      rect.right < 0 ||
      rect.bottom < 0 ||
      rect.left > viewportWidth ||
      rect.top > viewportHeight
    ) {
      return { isVisible: false, isHitTestable: false };
    }

    // 3. Computed style check
    try {
      const win = doc.defaultView || window;
      const style = win.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        parseFloat(style.opacity) === 0
      ) {
        return { isVisible: false, isHitTestable: false };
      }
    } catch {
      // computedStyle error fallback
    }

    // 4. Hit-test sampling at center point
    let isHitTestable = true;
    try {
      // If element is in an iframe, test within its own document using local client coordinates
      const isInsideFrame = doc !== (doc.defaultView?.top?.document ?? doc);
      const testPoint = isInsideFrame
        ? { x: el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2, y: el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 }
        : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

      if (testPoint.x >= 0 && testPoint.y >= 0) {
        if (typeof doc.elementFromPoint === 'function') {
          const hit = doc.elementFromPoint(testPoint.x, testPoint.y);
          if (hit) {
            const isSelfOrDescendant = hit === el || el.contains(hit);
            const isAncestor = hit.contains(el);
            isHitTestable = isSelfOrDescendant || isAncestor;
          }
        }
      }
    } catch {
      isHitTestable = true;
    }

    return { isVisible: true, isHitTestable };
  }

  /**
   * Traverse a document, open shadow roots, and same-origin iframes
   */
  public traverseCandidates(
    root: Document | ShadowRoot,
    offset = { x: 0, y: 0 },
    visitedFrames = new Set<Document>()
  ): { element: Element; offset: { x: number; y: number } }[] {
    const results: { element: Element; offset: { x: number; y: number } }[] = [];

    // Select candidates matching selector
    const candidates = Array.from(root.querySelectorAll(INTERACTIVE_SELECTOR));

    // Also check elements with cursor: pointer or onclick
    const allElements = Array.from(root.querySelectorAll('*'));
    for (const el of allElements) {
      if (!candidates.includes(el)) {
        try {
          const win = (el.ownerDocument || document).defaultView || window;
          const style = win.getComputedStyle(el);
          if (style.cursor === 'pointer' || (el as HTMLElement).onclick) {
            candidates.push(el);
          }
        } catch {
          // ignore
        }
      }
    }

    for (const el of candidates) {
      results.push({ element: el, offset });
    }

    // Traverse open shadow roots
    for (const el of allElements) {
      if (el.shadowRoot) {
        const shadowResults = this.traverseCandidates(el.shadowRoot, offset, visitedFrames);
        results.push(...shadowResults);
      }
    }

    // Traverse same-origin iframes
    const iframes = Array.from(root.querySelectorAll('iframe'));
    for (const iframe of iframes) {
      try {
        const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (frameDoc && !visitedFrames.has(frameDoc)) {
          visitedFrames.add(frameDoc);
          const frameRect = iframe.getBoundingClientRect();
          const frameOffset = {
            x: offset.x + frameRect.left,
            y: offset.y + frameRect.top,
          };
          const frameResults = this.traverseCandidates(frameDoc, frameOffset, visitedFrames);
          results.push(...frameResults);
        }
      } catch {
        // Cross-origin iframe security restriction - skip gracefully
      }
    }

    return results;
  }

  /**
   * Build complete index of interactive elements in the viewport
   */
  public index(options: IndexerOptions = {}): IndexedElement[] {
    const doc = options.rootDocument || document;
    const win = options.scopeWindow || doc.defaultView || window;
    const viewportWidth = options.viewportWidth ?? win.innerWidth;
    const viewportHeight = options.viewportHeight ?? win.innerHeight;

    const rawCandidates = this.traverseCandidates(doc);
    const indexed: IndexedElement[] = [];

    for (const { element, offset } of rawCandidates) {
      let rect: DOMRect;
      try {
        rect = element.getBoundingClientRect();
      } catch {
        continue;
      }

      // Apply iframe / shadow offset
      const adjustedRect: Rect = {
        x: Math.round(rect.left + offset.x),
        y: Math.round(rect.top + offset.y),
        w: Math.round(rect.width || (element as HTMLElement).offsetWidth || 50),
        h: Math.round(rect.height || (element as HTMLElement).offsetHeight || 20),
      };

      const domRect = new DOMRect(
        adjustedRect.x,
        adjustedRect.y,
        adjustedRect.w,
        adjustedRect.h
      );

      const elementDoc = element.ownerDocument || doc;
      const { isVisible, isHitTestable } = DomIndexer.isElementVisible(
        element,
        domRect,
        viewportWidth,
        viewportHeight,
        elementDoc
      );

      if (!isVisible && !options.includeNonInteractive) {
        continue;
      }

      const centerX = adjustedRect.x + adjustedRect.w / 2;
      const centerY = adjustedRect.y + adjustedRect.h / 2;

      const quadrant = DomIndexer.computeQuadrant(
        centerX,
        centerY,
        viewportWidth,
        viewportHeight
      );

      const { raw: label } = extractLabel(element);
      const role = DomIndexer.extractRole(element);
      const colorName = extractColorName(element);
      const id = this.getOrCreateElementId(element);

      const indexedEl: IndexedElement = {
        id,
        element,
        label,
        role,
        rect: adjustedRect,
        center: { x: centerX, y: centerY },
        quadrant,
        isVisible,
        isHitTestable,
        colorName,
        tagName: element.tagName.toLowerCase(),
        inputType: element instanceof HTMLInputElement ? element.type : undefined,
        disabled: (element as HTMLButtonElement).disabled,
      };

      indexed.push(indexedEl);
    }

    this.cache = indexed;
    this.lastIndexedTime = Date.now();
    return indexed;
  }

  public getCachedIndex(): IndexedElement[] {
    return this.cache;
  }

  public getByQuadrant(quadrant: Quadrant): IndexedElement[] {
    return this.cache.filter((item) => item.quadrant === quadrant);
  }

  public getById(id: string): IndexedElement | undefined {
    return this.cache.find((item) => item.id === id);
  }

  /**
   * Set up scroll, resize and MutationObserver auto-refresh listeners
   */
  private setupListeners(): void {
    if (typeof window === 'undefined') return;

    const onThrottledRefresh = () => {
      if (this.isThrottled) return;
      this.isThrottled = true;
      this.throttleTimeout = setTimeout(() => {
        this.isThrottled = false;
        this.index();
      }, 50); // 50ms throttle budget
    };

    window.addEventListener('scroll', onThrottledRefresh, { passive: true });
    window.addEventListener('resize', onThrottledRefresh, { passive: true });

    if (typeof MutationObserver !== 'undefined' && document.body) {
      this.mutationObserver = new MutationObserver(() => {
        onThrottledRefresh();
      });
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'disabled', 'aria-hidden'],
      });
    }

    this.listeners.push(() => {
      window.removeEventListener('scroll', onThrottledRefresh);
      window.removeEventListener('resize', onThrottledRefresh);
      this.mutationObserver?.disconnect();
      if (this.throttleTimeout) clearTimeout(this.throttleTimeout);
    });
  }

  public destroy(): void {
    for (const cleanup of this.listeners) {
      cleanup();
    }
    this.listeners = [];
  }
}
