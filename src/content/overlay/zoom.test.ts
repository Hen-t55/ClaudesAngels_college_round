import { describe, it, expect } from 'vitest';
import { create3x3ZoomCells, subdivideCell, formatZoomBreadcrumb } from './zoom';

describe('Zoom Grid Geometry Helpers', () => {
  it('creates 9 cells spanning the exact bounding box', () => {
    const bounds = { x: 0, y: 0, w: 900, h: 600 };
    const cells = create3x3ZoomCells(bounds);

    expect(cells).toHaveLength(9);
    expect(cells.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // Cell 1 (top-left)
    expect(cells[0].rect).toEqual({ x: 0, y: 0, w: 300, h: 200 });
    // Cell 5 (center)
    expect(cells[4].rect).toEqual({ x: 300, y: 200, w: 300, h: 200 });
    // Cell 9 (bottom-right)
    expect(cells[8].rect).toEqual({ x: 600, y: 400, w: 300, h: 200 });
  });

  it('subdivides a picked cell into a recursive 3x3 grid at depth + 1', () => {
    const parentBounds = { x: 0, y: 0, w: 900, h: 900 };
    const initialGrid = {
      rect: parentBounds,
      cells: create3x3ZoomCells(parentBounds),
      depth: 1,
    };

    // Pick cell 5 (center: x: 300, y: 300, w: 300, h: 300)
    const level2Grid = subdivideCell(initialGrid, 5);
    expect(level2Grid.depth).toBe(2);
    expect(level2Grid.rect).toEqual({ x: 300, y: 300, w: 300, h: 300 });
    expect(level2Grid.cells).toHaveLength(9);

    // Sub-cell 1 of cell 5
    expect(level2Grid.cells[0].rect).toEqual({ x: 300, y: 300, w: 100, h: 100 });
    // Sub-cell 9 of cell 5
    expect(level2Grid.cells[8].rect).toEqual({ x: 500, y: 500, w: 100, h: 100 });
  });

  it('formats readable breadcrumb string', () => {
    const bc = formatZoomBreadcrumb(2);
    expect(bc).toContain('Level 2');
    expect(bc).toContain('Back');
  });
});
