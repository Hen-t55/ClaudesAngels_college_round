import { describe, it, expect, beforeEach } from 'vitest';
import { DomIndexer } from '../../src/content/engine/dom-indexer';
import { extractLabel } from '../../src/content/engine/label-extractor';

describe('DomIndexer & LabelExtractor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('correctly assigns quadrants based on element center', () => {
    const w = 1000;
    const h = 800;
    expect(DomIndexer.computeQuadrant(200, 200, w, h)).toBe('TL');
    expect(DomIndexer.computeQuadrant(800, 200, w, h)).toBe('TR');
    expect(DomIndexer.computeQuadrant(200, 600, w, h)).toBe('BL');
    expect(DomIndexer.computeQuadrant(800, 600, w, h)).toBe('BR');
  });

  it('extracts aria-labelledby with multiple IDs', () => {
    document.body.innerHTML = `
      <span id="part1">Add to</span>
      <span id="part2">Cart</span>
      <button id="btn" aria-labelledby="part1 part2"></button>
    `;
    const btn = document.getElementById('btn')!;
    const label = extractLabel(btn);
    expect(label.raw).toBe('Add to Cart');
    expect(label.normalized).toBe('add to cart');
  });

  it('extracts label from associated input label', () => {
    document.body.innerHTML = `
      <label for="username-input">User Name:</label>
      <input id="username-input" type="text" />
    `;
    const input = document.getElementById('username-input')!;
    const label = extractLabel(input);
    expect(label.raw).toBe('User Name:');
    expect(label.normalized).toBe('user name:');
  });

  it('extracts label from placeholder and title fallback', () => {
    document.body.innerHTML = `
      <input id="query" placeholder="Search the web" />
      <button id="icon-btn" title="Settings icon"></button>
    `;
    const input = document.getElementById('query')!;
    const btn = document.getElementById('icon-btn')!;
    expect(extractLabel(input).normalized).toBe('search the web');
    expect(extractLabel(btn).normalized).toBe('settings icon');
  });

  it('indexes open shadow root elements', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<button id="shadow-btn">Shadow Action</button>`;

    const indexer = new DomIndexer();
    const candidates = indexer.traverseCandidates(document);
    const hasShadowBtn = candidates.some(
      (c) => c.element.id === 'shadow-btn' && (c.element.textContent?.trim() === 'Shadow Action')
    );
    expect(hasShadowBtn).toBe(true);
    indexer.destroy();
  });
});
