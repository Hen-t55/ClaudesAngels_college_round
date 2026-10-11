import Fuse from 'fuse.js';
import type { TargetQuery, Scope, Verb, Important } from '../../shared/contract';
import type { IndexedElement } from './types';
import { normalizeLabel } from './label-extractor';
import { extractColorBucket } from './color';

export interface ScoredCandidate {
  item: IndexedElement;
  score: number; // 0 (best) to 1 (worst) from Fuse, plus adjustments
  rankScore: number; // 1.0 (best) to 0.0 (worst)
}

export interface ResolveResult {
  status: 'one' | 'many' | 'none';
  matches: IndexedElement[];
  widened: boolean;
}

export class Resolver {
  /**
   * Filter candidates by scope (quadrant, rect, or whole page)
   */
  public static filterByScope(candidates: IndexedElement[], scope: Scope): IndexedElement[] {
    if (scope.k === 'page') return candidates;
    if (scope.k === 'quadrant') {
      return candidates.filter((c) => c.quadrant === scope.q);
    }
    if (scope.k === 'rect') {
      const { x, y, w, h } = scope.rect;
      return candidates.filter(
        (c) =>
          c.center.x >= x &&
          c.center.x <= x + w &&
          c.center.y >= y &&
          c.center.y <= y + h
      );
    }
    return candidates;
  }

  /**
   * Filter candidates by deterministic criteria: role and color
   */
  public static filterByRoleAndColor(
    candidates: IndexedElement[],
    query: TargetQuery
  ): IndexedElement[] {
    let list = [...candidates];

    // Role filter
    if (query.role && query.role !== 'any') {
      list = list.filter((c) => {
        if (query.role === 'button') return c.role === 'button';
        if (query.role === 'link') return c.role === 'link';
        if (query.role === 'input') return c.role === 'input' || c.tagName === 'textarea' || c.tagName === 'select';
        if (query.role === 'checkbox') return c.role === 'checkbox' || (c.tagName === 'input' && c.inputType === 'checkbox');
        if (query.role === 'image') return c.tagName === 'img' || c.role === 'img';
        return true;
      });
    }

    // Color filter
    if (query.color) {
      const targetColor = query.color.toLowerCase();
      list = list.filter((c) => {
        const colorName = c.colorName || (c.element ? extractColorBucket(c.element) : undefined);
        if (!colorName) return false;
        return colorName.toLowerCase() === targetColor;
      });
    }

    return list;
  }

  /**
   * Filter relative to candidate set: side ('left' | 'right' | 'top' | 'bottom' | 'middle')
   */
  public static filterBySide(
    candidates: IndexedElement[],
    side?: 'left' | 'right' | 'top' | 'bottom' | 'middle'
  ): IndexedElement[] {
    if (!side || candidates.length === 0) return candidates;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const c of candidates) {
      if (c.center.x < minX) minX = c.center.x;
      if (c.center.x > maxX) maxX = c.center.x;
      if (c.center.y < minY) minY = c.center.y;
      if (c.center.y > maxY) maxY = c.center.y;
    }

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    switch (side) {
      case 'left':
        return candidates.filter((c) => c.center.x < midX);
      case 'right':
        return candidates.filter((c) => c.center.x >= midX);
      case 'top':
        return candidates.filter((c) => c.center.y < midY);
      case 'bottom':
        return candidates.filter((c) => c.center.y >= midY);
      case 'middle':
        return candidates.filter(
          (c) =>
            Math.abs(c.center.x - midX) <= spanX * 0.25 &&
            Math.abs(c.center.y - midY) <= spanY * 0.25
        );
      default:
        return candidates;
    }
  }

  /**
   * Filter ordinal: nth or last
   */
  public static filterByOrdinal(candidates: IndexedElement[], query: TargetQuery): IndexedElement[] {
    if (query.last) {
      return candidates.length > 0 ? [candidates[candidates.length - 1]] : [];
    }
    if (typeof query.nth === 'number' && query.nth > 0) {
      const idx = query.nth - 1;
      return idx < candidates.length ? [candidates[idx]] : [];
    }
    return candidates;
  }

  // Role and color words that must not be matched against element labels
  private static readonly ROLE_STRIP =
    /\b(button|link|field|input|checkbox|tab)\b/gi;

  private static readonly COLOR_STRIP =
    /\b(red|orange|yellow|green|cyan|blue|purple|magenta|pink|black|white|gray|grey)\b/gi;

  /**
   * Score candidates using Fuse.js fuzzy matching on normalized labels.
   * Role and color words are stripped from queryText before matching so that
   * a command like "click blue button" does not try to find a label "blue button".
   */
  public static scoreCandidates(
    candidates: IndexedElement[],
    queryText?: string
  ): ScoredCandidate[] {
    if (!queryText || !queryText.trim()) {
      // No text query: uniform base score
      return candidates.map((item) => ({
        item,
        score: 0,
        rankScore: 1.0,
      }));
    }

    // Strip role and color words before label matching
    const cleanedText = queryText
      .replace(Resolver.ROLE_STRIP, '')
      .replace(Resolver.COLOR_STRIP, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const normalizedQuery = normalizeLabel(cleanedText || queryText);

    // Check for exact substring match first
    const exactMatches = candidates.filter((c) =>
      normalizeLabel(c.label).includes(normalizedQuery)
    );

    const fuse = new Fuse(candidates, {
      keys: [
        { name: 'label', weight: 0.7 },
        { name: 'element.placeholder', weight: 0.5 },
        { name: 'element.aria-label', weight: 0.5 },
        { name: 'element.name', weight: 0.4 },
      ],
      includeScore: true,
      threshold: 0.6,
      ignoreLocation: true,
      getFn: (obj: IndexedElement, path: string | string[]) => {
        if (Array.isArray(path) && path[0] === 'element') {
          const attr = path[1];
          return normalizeLabel(obj.element.getAttribute(attr) || '');
        }
        return normalizeLabel(obj.label);
      },
    });

    const results = fuse.search(normalizedQuery);
    const scoredMap = new Map<string, number>();

    for (const r of results) {
      if (r.item && r.score !== undefined) {
        scoredMap.set(r.item.id, r.score);
      }
    }

    return candidates
      .map((item) => {
        let fuseScore = scoredMap.get(item.id);
        const normLabel = normalizeLabel(item.label);

        // Exact match bonus
        if (normLabel === normalizedQuery) {
          fuseScore = 0.0;
        } else if (normLabel.startsWith(normalizedQuery)) {
          fuseScore = Math.min(fuseScore ?? 0.1, 0.05);
        } else if (exactMatches.includes(item)) {
          fuseScore = Math.min(fuseScore ?? 0.2, 0.1);
        } else if (fuseScore === undefined) {
          fuseScore = 1.0; // No match
        }

        const rankScore = Math.max(0, 1 - fuseScore);
        return { item, score: fuseScore, rankScore };
      })
      .filter((sc) => sc.score < 0.6) // Filter out poor matches
      .sort((a, b) => b.rankScore - a.rankScore);
  }

  /**
   * Resolve TargetQuery within a scope according to the margin rule:
   * status 'one' only if top candidate clearly leads runner-up by margin (>= 0.15)
   * otherwise 'many' (capped at 9)
   * if no matches in scope, widen from quadrant to page
   */
  public static resolve(
    allCandidates: IndexedElement[],
    query: TargetQuery,
    scope: Scope,
    verb?: Verb
  ): ResolveResult {
    // 1. First attempt in given scope
    const scopedCandidates = Resolver.filterByScope(allCandidates, scope);
    const resultInScope = Resolver.resolveInList(scopedCandidates, query, verb);

    if (resultInScope.status !== 'none') {
      return { ...resultInScope, widened: false };
    }

    // 2. Fallback widening: If scoped to quadrant, widen to whole page
    if (scope.k === 'quadrant') {
      const pageCandidates = Resolver.filterByScope(allCandidates, { k: 'page' });
      const widenedResult = Resolver.resolveInList(pageCandidates, query, verb);
      if (widenedResult.status !== 'none') {
        return { ...widenedResult, widened: true };
      }
    }

    return { status: 'none', matches: [], widened: false };
  }

  private static resolveInList(
    candidates: IndexedElement[],
    query: TargetQuery,
    verb?: Verb
  ): { status: 'one' | 'many' | 'none'; matches: IndexedElement[] } {
    let filtered = Resolver.filterByRoleAndColor(candidates, query);

    if (verb === 'search') {
      const searchCandidates = filtered.filter(c => {
        const el = c.element;
        const role = el.getAttribute('role') || '';
        const type = el.getAttribute('type') || '';
        const name = (el.getAttribute('name') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        const className = (el.getAttribute('class') || '').toLowerCase();
        const id = (el.getAttribute('id') || '').toLowerCase();
        const searchForm = el.closest('form[role="search"], form.search, form#search, form[action*="search"]');

        return (
          role === 'search' || role === 'searchbox' ||
          type === 'search' ||
          name.includes('search') || name === 'q' ||
          placeholder.includes('search') || placeholder === 'q' ||
          className.includes('search') || id.includes('search') ||
          searchForm !== null
        );
      });
      if (searchCandidates.length > 0) {
        filtered = searchCandidates;
      }
    }

    filtered = Resolver.filterBySide(filtered, query.side);

    // If ordinal specified (nth/last), apply directly
    if (query.nth !== undefined || query.last) {
      filtered = Resolver.filterByOrdinal(filtered, query);
      if (filtered.length === 1) {
        return { status: 'one', matches: filtered };
      }
      return filtered.length > 1
        ? { status: 'many', matches: filtered.slice(0, 9) }
        : { status: 'none', matches: [] };
    }

    // If query has no text (e.g. filtered strictly by color/role/side) and exactly 1 candidate matches
    if ((!query.text || !query.text.trim()) && filtered.length === 1) {
      return { status: 'one', matches: filtered };
    }

    // Score with fuzzy text matching
    const scored = Resolver.scoreCandidates(filtered, query.text);

    if (scored.length === 0) {
      return { status: 'none', matches: [] };
    }

    if (scored.length === 1) {
      return { status: 'one', matches: [scored[0].item] };
    }

    // Margin rule: top candidate clearly leads runner-up by >= 0.15 rank score or runner-up score is zero/uniform
    const top = scored[0];
    const runnerUp = scored[1];
    const margin = top.rankScore - runnerUp.rankScore;

    // If top score has strong rank score (>= 0.7) and leads by margin OR is sole top match
    if ((margin >= 0.15 && top.rankScore >= 0.70) || (top.rankScore === 1.0 && runnerUp.rankScore < 1.0)) {
      return { status: 'one', matches: [top.item] };
    }

    // Otherwise 'many', capped at 9 ordered by score
    return {
      status: 'many',
      matches: scored.slice(0, 9).map((s) => s.item),
    };
  }

  /**
   * Check if action is high-stakes (requires confirmation)
   */
  public static checkImportant(verb: Verb, item: IndexedElement): Important | undefined {
    const norm = normalizeLabel(item.label);

    if (/\b(delete|remove)\b/.test(norm)) {
      return { reason: 'delete', description: `Delete "${item.label}"` };
    }
    if (/\b(purchase|buy|pay|place order|submit order|complete order|confirm order|order now|checkout)\b/.test(norm)) {
      return { reason: 'purchase', description: `Purchase/Pay: "${item.label}"` };
    }
    if (/\b(sign out|log out|disconnect)\b/.test(norm)) {
      return { reason: 'sign_out', description: `Sign out "${item.label}"` };
    }
    if (/\b(send|post|submit|publish)\b/.test(norm)) {
      // Check if it's inside a multi-field form vs single search box
      const form = item.element.closest('form');
      if (form) {
        const inputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
        if (inputs.length > 1) {
          return { reason: 'form_submit', description: `Submit form: "${item.label}"` };
        }
      }
    }

    return undefined;
  }
}
