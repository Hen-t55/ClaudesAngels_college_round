import type { Rect } from '../../shared/contract';

export interface ZoomCell {
  n: number;
  rect: Rect;
}

export interface ZoomGridState {
  rect: Rect;
  cells: ZoomCell[];
  depth: number;
}

/**
 * Creates 9 cells in a 3x3 matrix spanning the given bounding rectangle.
 * Cell indices:
 * 1 2 3
 * 4 5 6
 * 7 8 9
 */
export function create3x3ZoomCells(bounds: Rect): ZoomCell[] {
  const cellWidth = bounds.w / 3;
  const cellHeight = bounds.h / 3;
  const cells: ZoomCell[] = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const n = row * 3 + col + 1;
      cells.push({
        n,
        rect: {
          x: Math.round(bounds.x + col * cellWidth),
          y: Math.round(bounds.y + row * cellHeight),
          w: Math.round(cellWidth),
          h: Math.round(cellHeight),
        },
      });
    }
  }

  return cells;
}

/**
 * Subdivides a specific parent cell by picking cell number `1..9`.
 */
export function subdivideCell(parentGrid: ZoomGridState, cellNumber: number): ZoomGridState {
  const picked = parentGrid.cells.find((c) => c.n === cellNumber);
  if (!picked) {
    throw new Error(`Invalid zoom cell number: ${cellNumber}`);
  }
  return {
    rect: picked.rect,
    cells: create3x3ZoomCells(picked.rect),
    depth: parentGrid.depth + 1,
  };
}

/**
 * Formats user-readable depth breadcrumb.
 */
export function formatZoomBreadcrumb(depth: number): string {
  return `Zoom: Level ${depth} (Say '1'–'9' to narrow, 'Back' to zoom out, 'Click' to select)`;
}
