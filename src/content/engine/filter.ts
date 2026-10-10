import type { TargetQuery } from '../../shared/contract';
import type { IndexedElement } from './types';
import { normalizeLabel } from './label-extractor';

export function matchesFilter(item: IndexedElement, query: TargetQuery): boolean {
  // 1. Role filter
  if (query.role && query.role !== 'any') {
    if (query.role === 'button' && item.role !== 'button') return false;
    if (query.role === 'link' && item.role !== 'link') return false;
    if (query.role === 'input' && item.role !== 'input') return false;
    if (query.role === 'checkbox' && item.role !== 'checkbox') return false;
    if (query.role === 'image' && item.tagName !== 'img' && item.role !== 'img') return false;
  }

  // 2. Color filter
  if (query.color) {
    const qColor = query.color.toLowerCase();
    if (!item.colorName || !item.colorName.includes(qColor)) {
      return false;
    }
  }

  // 3. Text query filter
  if (query.text) {
    const normTarget = normalizeLabel(query.text);
    const normItemLabel = normalizeLabel(item.label);
    if (!normItemLabel.includes(normTarget)) {
      return false;
    }
  }

  return true;
}

export function applyPositionalFilters(
  items: IndexedElement[],
  query: TargetQuery,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight
): IndexedElement[] {
  let filtered = [...items];

  // Side filter
  if (query.side) {
    if (query.side === 'left') {
      filtered = filtered.filter((it) => it.center.x < viewportWidth / 2);
    } else if (query.side === 'right') {
      filtered = filtered.filter((it) => it.center.x >= viewportWidth / 2);
    } else if (query.side === 'top') {
      filtered = filtered.filter((it) => it.center.y < viewportHeight / 2);
    } else if (query.side === 'bottom') {
      filtered = filtered.filter((it) => it.center.y >= viewportHeight / 2);
    } else if (query.side === 'middle') {
      const marginX = viewportWidth * 0.25;
      const marginY = viewportHeight * 0.25;
      filtered = filtered.filter(
        (it) =>
          it.center.x >= marginX &&
          it.center.x <= viewportWidth - marginX &&
          it.center.y >= marginY &&
          it.center.y <= viewportHeight - marginY
      );
    }
  }

  // Ordinal: nth / last
  if (query.last) {
    return filtered.length > 0 ? [filtered[filtered.length - 1]] : [];
  }

  if (typeof query.nth === 'number' && query.nth > 0) {
    const index = query.nth - 1;
    return index < filtered.length ? [filtered[index]] : [];
  }

  return filtered;
}
