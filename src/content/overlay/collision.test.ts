import { describe, it, expect } from 'vitest';
import { computeBadgePlacements, doesOverlap, clamp, BADGE_SIZE } from './collision';

describe('Collision & Badge Placement Helpers', () => {
  it('correctly detects overlapping rectangles', () => {
    const b1 = { x: 10, y: 10, w: 20, h: 20 };
    const b2 = { x: 20, y: 20, w: 20, h: 20 };
    const b3 = { x: 100, y: 100, w: 20, h: 20 };

    expect(doesOverlap(b1, b2)).toBe(true);
    expect(doesOverlap(b1, b3)).toBe(false);
  });

  it('clamps coordinates strictly within margins', () => {
    expect(clamp(-10, 4, 100)).toBe(4);
    expect(clamp(150, 4, 100)).toBe(100);
    expect(clamp(50, 4, 100)).toBe(50);
  });

  it('places a single badge near target element within bounds', () => {
    const matches = [{ id: 'm1', rect: { x: 100, y: 100, w: 80, h: 30 } }];
    const viewport = { width: 1000, height: 800 };
    const placed = computeBadgePlacements(matches, viewport);

    expect(placed).toHaveLength(1);
    expect(placed[0].matchId).toBe('m1');
    expect(placed[0].number).toBe(1);
    expect(placed[0].x).toBeGreaterThanOrEqual(4);
    expect(placed[0].y).toBeGreaterThanOrEqual(4);
    expect(placed[0].x + BADGE_SIZE).toBeLessThanOrEqual(viewport.width);
    expect(placed[0].y + BADGE_SIZE).toBeLessThanOrEqual(viewport.height);
  });

  it('never places badges offscreen when target is at viewport corner', () => {
    const cornerMatches = [
      { id: 'top-left', rect: { x: 0, y: 0, w: 40, h: 40 } },
      { id: 'bottom-right', rect: { x: 990, y: 790, w: 40, h: 40 } },
    ];
    const viewport = { width: 1000, height: 800 };
    const placed = computeBadgePlacements(cornerMatches, viewport);

    expect(placed).toHaveLength(2);
    for (const b of placed) {
      expect(b.x).toBeGreaterThanOrEqual(4);
      expect(b.y).toBeGreaterThanOrEqual(4);
      expect(b.x + BADGE_SIZE).toBeLessThanOrEqual(viewport.width - 4);
      expect(b.y + BADGE_SIZE).toBeLessThanOrEqual(viewport.height - 4);
    }
  });

  it('resolves collisions when elements are tightly stacked', () => {
    // 3 elements placed right on top of each other
    const denseMatches = [
      { id: 'm1', rect: { x: 200, y: 200, w: 60, h: 25 } },
      { id: 'm2', rect: { x: 200, y: 200, w: 60, h: 25 } },
      { id: 'm3', rect: { x: 200, y: 200, w: 60, h: 25 } },
    ];
    const viewport = { width: 1200, height: 900 };
    const placed = computeBadgePlacements(denseMatches, viewport);

    expect(placed).toHaveLength(3);
    // Ensure no two placed badges overlap each other
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(doesOverlap(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it('keeps badges in view when target is inside a sticky top header or at y=0', () => {
    const stickyHeaderMatches = [
      { id: 'logo', rect: { x: 16, y: 0, w: 120, h: 32 } },
      { id: 'search', rect: { x: 200, y: 4, w: 240, h: 28 } },
      { id: 'cart', rect: { x: 920, y: 2, w: 60, h: 30 } },
    ];
    const viewport = { width: 1000, height: 700 };
    const placed = computeBadgePlacements(stickyHeaderMatches, viewport);

    expect(placed).toHaveLength(3);
    for (const b of placed) {
      expect(b.y).toBeGreaterThanOrEqual(4);
      expect(b.y + BADGE_SIZE).toBeLessThanOrEqual(viewport.height - 4);
      expect(b.x).toBeGreaterThanOrEqual(4);
      expect(b.x + BADGE_SIZE).toBeLessThanOrEqual(viewport.width - 4);
    }
  });

  it('handles zoom levels and edge boundaries without clipping', () => {
    // 150% zoomed smaller viewport simulation
    const zoomedViewport = { width: 640, height: 480 };
    const edgeMatches = [
      { id: 'sticky-footer', rect: { x: 20, y: 460, w: 200, h: 20 } },
      { id: 'right-drawer', rect: { x: 610, y: 150, w: 30, h: 80 } },
    ];
    const placed = computeBadgePlacements(edgeMatches, zoomedViewport);

    expect(placed).toHaveLength(2);
    for (const b of placed) {
      expect(b.x).toBeGreaterThanOrEqual(4);
      expect(b.y).toBeGreaterThanOrEqual(4);
      expect(b.x + BADGE_SIZE).toBeLessThanOrEqual(zoomedViewport.width - 4);
      expect(b.y + BADGE_SIZE).toBeLessThanOrEqual(zoomedViewport.height - 4);
    }
  });
});
