import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { DomIndexer } from '../../src/content/engine/dom-indexer';
import { matchesFilter, applyPositionalFilters } from '../../src/content/engine/filter';
import type { IndexedElement } from '../../src/content/engine/types';
import type { Quadrant, TargetQuery } from '../../src/shared/contract';

export function DevHarness() {
  const [activeFixture, setActiveFixture] = useState<'repeated' | 'colors' | 'stacked' | 'form' | 'canvas' | 'iframe' | 'dense'>('repeated');
  const [selectedQuadrant, setSelectedQuadrant] = useState<Quadrant | 'ALL'>('ALL');
  const [commandInput, setCommandInput] = useState('click blue button');
  const [elements, setElements] = useState<IndexedElement[]>([]);
  const [matches, setMatches] = useState<IndexedElement[]>([]);
  const fixtureContainerRef = useRef<HTMLDivElement>(null);
  const indexerRef = useRef<DomIndexer | null>(null);

  // Parse natural language or verb+query
  const parseQuery = (text: string): TargetQuery => {
    let raw = text.trim();
    let verb = 'click';
    const words = raw.split(/\s+/);
    if (['click', 'open', 'focus', 'type', 'search'].includes(words[0].toLowerCase())) {
      verb = words[0].toLowerCase();
      raw = words.slice(1).join(' ');
    }

    const query: TargetQuery = { raw };

    // Role detection
    if (raw.includes('button')) query.role = 'button';
    else if (raw.includes('link')) query.role = 'link';
    else if (raw.includes('input') || raw.includes('field') || raw.includes('box')) query.role = 'input';
    else if (raw.includes('checkbox')) query.role = 'checkbox';

    // Color detection
    for (const c of ['blue', 'red', 'green', 'yellow', 'purple', 'black', 'white', 'gray']) {
      if (raw.toLowerCase().includes(c)) {
        query.color = c;
        break;
      }
    }

    // Side detection
    for (const s of ['left', 'right', 'top', 'bottom', 'middle'] as const) {
      if (raw.toLowerCase().includes(s)) {
        query.side = s;
        break;
      }
    }

    // Ordinal detection
    if (raw.includes('first')) query.nth = 1;
    else if (raw.includes('second')) query.nth = 2;
    else if (raw.includes('third')) query.nth = 3;
    else if (raw.includes('fourth')) query.nth = 4;
    else if (raw.includes('last')) query.last = true;

    // Remaining text extraction
    let cleanText = raw;
    for (const token of ['blue', 'red', 'green', 'yellow', 'first', 'second', 'third', 'last', 'top', 'bottom', 'left', 'right']) {
      cleanText = cleanText.replace(new RegExp(`\\b${token}\\b`, 'gi'), '');
    }
    // Only strip role word if there's other text, otherwise keep query text
    const strippedRole = cleanText.replace(/\b(button|link|input|checkbox|field|box)\b/gi, '').trim();
    query.text = (strippedRole || cleanText).trim() || undefined;

    return query;
  };

  const reindex = () => {
    if (!indexerRef.current) return;
    const all = indexerRef.current.index({
      rootDocument: document,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setElements(all);

    // Filter to fixture items
    let scoped = selectedQuadrant === 'ALL' ? all : all.filter((el) => el.quadrant === selectedQuadrant);
    const parsed = parseQuery(commandInput);
    let matched = scoped.filter((el) => matchesFilter(el, parsed));
    matched = applyPositionalFilters(matched, parsed);
    setMatches(matched);
  };

  useEffect(() => {
    indexerRef.current = new DomIndexer();
    const timer = setTimeout(reindex, 100);
    return () => {
      clearTimeout(timer);
      indexerRef.current?.destroy();
    };
  }, [activeFixture, selectedQuadrant]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top Controls Header */}
      <div style={{ padding: '12px 16px', background: '#1e293b', color: '#fff', borderBottom: '1px solid #334155' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>🎯 P2 Engine Harness</strong>
          <span style={{ color: '#94a3b8' }}>Fixture:</span>
          {(['repeated', 'colors', 'stacked', 'form', 'canvas', 'iframe', 'dense'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFixture(f)}
              style={{
                background: activeFixture === f ? '#38bdf8' : '#334155',
                color: activeFixture === f ? '#0f172a' : '#f8fafc',
                border: 'none',
                borderRadius: 4,
                padding: '4px 10px',
                cursor: 'pointer',
                fontWeight: activeFixture === f ? 'bold' : 'normal',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Query Input and Quadrants */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && reindex()}
            placeholder="e.g. click blue button, second submit, right link"
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: 4,
              border: '1px solid #475569',
              background: '#0f172a',
              color: '#fff',
            }}
          />
          <button
            onClick={reindex}
            style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer' }}
          >
            Resolve
          </button>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['ALL', 'TL', 'TR', 'BL', 'BR'] as const).map((q) => (
              <button
                key={q}
                onClick={() => setSelectedQuadrant(q)}
                style={{
                  background: selectedQuadrant === q ? '#f59e0b' : '#334155',
                  color: selectedQuadrant === q ? '#000' : '#fff',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: selectedQuadrant === q ? 'bold' : 'normal',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Split: Workspace Fixture + Side Results Panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Fixture Area */}
        <div
          ref={fixtureContainerRef}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'auto',
            padding: 24,
            background: '#f8fafc',
          }}
        >
          {activeFixture === 'repeated' && (
            <div id="fixture-repeated" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <button key={i} id={`rep-btn-${i}`} style={{ padding: '12px 16px', background: '#3b82f6', color: '#fff', borderRadius: 6 }}>
                  Submit Order
                </button>
              ))}
            </div>
          )}

          {activeFixture === 'colors' && (
            <div id="fixture-colors" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <button id="color-blue" style={{ background: 'rgb(59, 130, 246)', color: '#fff', padding: '10px 20px', borderRadius: 6 }}>Blue Action</button>
              <button id="color-red" style={{ background: 'rgb(239, 68, 68)', color: '#fff', padding: '10px 20px', borderRadius: 6 }}>Red Danger</button>
              <button id="color-green" style={{ background: 'rgb(34, 197, 94)', color: '#fff', padding: '10px 20px', borderRadius: 6 }}>Green Success</button>
              <button id="color-yellow" style={{ background: 'rgb(234, 179, 8)', color: '#000', padding: '10px 20px', borderRadius: 6 }}>Yellow Warn</button>
            </div>
          )}

          {activeFixture === 'stacked' && (
            <div id="fixture-stacked" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 300 }}>
              <button id="stack-1" style={{ padding: 10 }}>Stacked Top</button>
              <button id="stack-2" style={{ padding: 10 }}>Stacked Second</button>
              <button id="stack-3" style={{ padding: 10 }}>Stacked Third</button>
              <button id="stack-4" style={{ padding: 10 }}>Stacked Bottom</button>
            </div>
          )}

          {activeFixture === 'form' && (
            <form id="fixture-form" onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 350 }}>
              <label>
                Username:
                <input id="form-user" type="text" placeholder="Enter username" style={{ width: '100%', padding: 8 }} />
              </label>
              <label htmlFor="form-email">Email Address:</label>
              <input id="form-email" type="email" placeholder="user@example.com" style={{ padding: 8 }} />
              <label>
                <input id="form-agree" type="checkbox" /> Agree to terms
              </label>
              <button id="form-submit" type="submit" style={{ padding: 10, background: '#10b981', color: '#fff' }}>Register Now</button>
            </form>
          )}

          {activeFixture === 'canvas' && (
            <div id="fixture-canvas" style={{ position: 'relative' }}>
              <canvas id="target-canvas" width={400} height={300} style={{ border: '2px solid #cbd5e1', background: '#fff' }} />
              <div
                id="canvas-interactive-target"
                role="button"
                tabIndex={0}
                aria-label="Canvas Node 1"
                style={{
                  position: 'absolute',
                  top: 50,
                  left: 50,
                  width: 80,
                  height: 40,
                  background: 'rgba(59, 130, 246, 0.8)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                Node 1
              </div>
            </div>
          )}

          {activeFixture === 'iframe' && (
            <div id="fixture-iframe">
              <iframe
                id="same-origin-frame"
                src="about:blank"
                ref={(iframeEl) => {
                  if (iframeEl && !iframeEl.dataset.injected) {
                    iframeEl.dataset.injected = 'true';
                    setTimeout(() => {
                      const doc = iframeEl.contentDocument;
                      if (doc) {
                        doc.body.innerHTML = `
                          <div style="font-family: sans-serif; padding: 10px;">
                            <h4>Nested Frame</h4>
                            <button id="iframe-btn" style="padding: 8px 16px; background: #8b5cf6; color: white;">Inside Frame Button</button>
                            <a id="iframe-link" href="#" style="display: block; margin-top: 10px;">Inside Frame Link</a>
                          </div>
                        `;
                        reindex();
                      }
                    }, 50);
                  }
                }}
                style={{ width: 350, height: 200, border: '1px solid #94a3b8', borderRadius: 6 }}
              />
            </div>
          )}

          {activeFixture === 'dense' && (
            <div id="fixture-dense" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
              {Array.from({ length: 25 }, (_, i) => (
                <a key={i} id={`dense-link-${i + 1}`} href={`#link-${i + 1}`} style={{ padding: 4, textDecoration: 'none', color: '#2563eb' }}>
                  Link {i + 1}
                </a>
              ))}
            </div>
          )}

          {/* Minimal Debug Highlights of Matches */}
          {matches.map((m) => (
            <div
              key={m.id}
              style={{
                position: 'fixed',
                left: m.rect.x,
                top: m.rect.y,
                width: m.rect.w,
                height: m.rect.h,
                border: '2px dashed #ef4444',
                background: 'rgba(239, 68, 68, 0.15)',
                pointerEvents: 'none',
                zIndex: 9999,
                fontSize: 10,
                color: '#ef4444',
                fontWeight: 'bold',
                padding: 2,
              }}
            >
              #{m.id} [{m.quadrant}]
            </div>
          ))}
        </div>

        {/* Results Sidebar */}
        <div id="results-sidebar" style={{ width: 380, background: '#fff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <div id="results-header" style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', background: '#f1f5f9' }}>
            <strong style={{ fontSize: 13 }}>Indexed Elements ({elements.length}) | Matches ({matches.length})</strong>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {(matches.length > 0 ? matches : elements).map((el) => (
              <div
                key={el.id}
                style={{
                  border: matches.some((m) => m.id === el.id) ? '1px solid #ef4444' : '1px solid #e2e8f0',
                  borderRadius: 6,
                  padding: 8,
                  marginBottom: 6,
                  background: matches.some((m) => m.id === el.id) ? '#fef2f2' : '#fff',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{el.label || '<em><no label></em>'}</span>
                  <span style={{ background: '#0284c7', color: '#fff', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>{el.quadrant}</span>
                </div>
                <div style={{ color: '#64748b', fontSize: 11 }}>
                  Role: <code>{el.role}</code> | Tag: <code>{el.tagName}</code> {el.colorName ? `| Color: ${el.colorName}` : ''}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>
                  Rect: {el.rect.x},{el.rect.y} ({el.rect.w}x{el.rect.h}) | Center: {Math.round(el.center.x)},{Math.round(el.center.y)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<DevHarness />);
}
