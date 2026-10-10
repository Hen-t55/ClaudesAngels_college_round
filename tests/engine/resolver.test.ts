import { describe, it, expect, beforeEach } from 'vitest';
import { Resolver } from '../../src/content/engine/resolver';
import { HopNavigator } from '../../src/content/engine/hop-navigator';
import type { IndexedElement } from '../../src/content/engine/types';

function createMockElement(id: string, label: string, role = 'button', color = 'blue', x = 100, y = 100, q: 'TL' | 'TR' | 'BL' | 'BR' = 'TL'): IndexedElement {
  return {
    id,
    label,
    role,
    colorName: color,
    rect: { x, y, w: 60, h: 30 },
    center: { x: x + 30, y: y + 15 },
    quadrant: q,
    isVisible: true,
    isHitTestable: true,
    tagName: role === 'button' ? 'button' : 'a',
    element: document.createElement(role === 'button' ? 'button' : 'a'),
  };
}

describe('Resolver Scoring & Filters', () => {
  it('correctly scores and filters candidates by fuzzy label', () => {
    const list = [
      createMockElement('1', 'Submit Payment Form'),
      createMockElement('2', 'Cancel Order'),
      createMockElement('3', 'Checkout Cart'),
    ];

    const scored = Resolver.scoreCandidates(list, 'payment');
    expect(scored.length).toBeGreaterThan(0);
    expect(scored[0].item.id).toBe('1');
  });

  it('filters candidates by role and color', () => {
    const list = [
      createMockElement('1', 'Action Button', 'button', 'blue'),
      createMockElement('2', 'Action Link', 'link', 'red'),
      createMockElement('3', 'Red Button', 'button', 'red'),
    ];

    const filtered = Resolver.filterByRoleAndColor(list, { raw: '', role: 'button', color: 'red' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('3');
  });

  it('filters candidates by side relative to candidate set', () => {
    const list = [
      createMockElement('1', 'Left Btn', 'button', 'blue', 50, 100),
      createMockElement('2', 'Right Btn', 'button', 'blue', 500, 100),
    ];

    const left = Resolver.filterBySide(list, 'left');
    expect(left.length).toBe(1);
    expect(left[0].id).toBe('1');

    const right = Resolver.filterBySide(list, 'right');
    expect(right.length).toBe(1);
    expect(right[0].id).toBe('2');
  });

  it('returns status one if top candidate clearly leads runner-up', () => {
    const list = [
      createMockElement('1', 'Submit Order Now'),
      createMockElement('2', 'Something Else Completely Unrelated'),
    ];

    const res = Resolver.resolve(list, { raw: 'Submit Order', text: 'Submit Order' }, { k: 'page' });
    expect(res.status).toBe('one');
    expect(res.matches[0].id).toBe('1');
  });

  it('returns status many when multiple candidates match similarly', () => {
    const list = [
      createMockElement('1', 'Submit Order 1'),
      createMockElement('2', 'Submit Order 2'),
    ];

    const res = Resolver.resolve(list, { raw: 'Submit Order', text: 'Submit Order' }, { k: 'page' });
    expect(res.status).toBe('many');
    expect(res.matches.length).toBe(2);
  });

  it('widens from quadrant to page when no matches in quadrant', () => {
    const list = [
      createMockElement('1', 'Help Center', 'link', 'blue', 800, 600, 'BR'),
    ];

    const res = Resolver.resolve(list, { raw: 'Help Center', text: 'Help Center' }, { k: 'quadrant', q: 'TL' });
    expect(res.status).toBe('one');
    expect(res.widened).toBe(true);
    expect(res.matches[0].id).toBe('1');
  });
});

describe('HopNavigator 2D Spatial Cone', () => {
  it('hops horizontally and vertically between candidates', () => {
    const nav = new HopNavigator();
    const m1 = createMockElement('1', 'Item 1', 'button', 'blue', 100, 100);
    const m2 = createMockElement('2', 'Item 2', 'button', 'blue', 300, 100); // Right of m1
    const m3 = createMockElement('3', 'Item 3', 'button', 'blue', 100, 300); // Below m1

    nav.setMatches([m1, m2, m3]);
    expect(nav.getFocusedIndex()).toBe(0);

    // Hop right from m1 -> m2
    const next1 = nav.hop('right');
    expect(next1?.id).toBe('2');

    // Hop down from m2 -> fallback wrap or closest
    nav.setFocusIndex(0); // Back to m1
    const next2 = nav.hop('down');
    expect(next2?.id).toBe('3');
  });
});
