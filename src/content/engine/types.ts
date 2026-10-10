import type { Quadrant, Rect } from '../../shared/contract';

export interface IndexedElement {
  id: string;
  element: Element;
  label: string;
  role: string;
  rect: Rect;
  center: { x: number; y: number };
  quadrant: Quadrant;
  isVisible: boolean;
  isHitTestable: boolean;
  colorName?: string;
  tagName: string;
  inputType?: string;
  disabled?: boolean;
}

export interface IndexerOptions {
  viewportWidth?: number;
  viewportHeight?: number;
  rootDocument?: Document;
  scopeWindow?: Window;
  includeNonInteractive?: boolean;
}
