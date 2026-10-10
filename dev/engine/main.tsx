import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { startEngine } from '../../src/content/engine';
import { memoryTransport } from '../../src/shared/bus';
import type { Transport } from '../../src/shared/bus';
import type {
  EngineRequest,
  EngineEvent,
  MatchMeta,
  Quadrant,
  TargetQuery,
  Verb,
  Dir,
  Rect,
  Scope,
} from '../../src/shared/contract';

export function DevHarness() {
  const [activeFixture, setActiveFixture] = useState<
    'repeated' | 'colors' | 'stacked' | 'form' | 'canvas' | 'iframe' | 'dense' | 'search'
  >('repeated');
  const [selectedQuadrant, setSelectedQuadrant] = useState<Quadrant | 'ALL'>('ALL');
  const [commandInput, setCommandInput] = useState('click blue button');
  const [matches, setMatches] = useState<MatchMeta[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState<string>('idle');
  const [lastAction, setLastAction] = useState<string>('');

  // Zoom overlay state
  const [zoomCells, setZoomCells] = useState<{ n: number; rect: Rect }[]>([]);
  const [zoomRect, setZoomRect] = useState<Rect | null>(null);

  // Type panel state
  const [typeText, setTypeText] = useState('Hello world');
  const [typeField, setTypeField] = useState('');

  const transportRef = useRef<Transport | null>(null);

  // Parse natural language or verb+query
  const parseVerbAndQuery = (text: string): { verb: Verb; query: TargetQuery } => {
    let raw = text.trim();
    let verb: Verb = 'click';
    const words = raw.split(/\s+/);
    const firstWord = words[0]?.toLowerCase();

    if (['click', 'open', 'focus', 'search'].includes(firstWord)) {
      verb = firstWord as Verb;
      raw = words.slice(1).join(' ');
    } else if (firstWord === 'double' && words[1]?.toLowerCase() === 'click') {
      verb = 'double_click';
      raw = words.slice(2).join(' ');
    } else if (firstWord === 'right' && words[1]?.toLowerCase() === 'click') {
      verb = 'right_click';
      raw = words.slice(2).join(' ');
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
    const strippedRole = cleanText.replace(/\b(button|link|input|checkbox|field|box)\b/gi, '').trim();
    query.text = strippedRole || cleanText.trim() || undefined;

    return { verb, query };
  };

  const sendResolve = () => {
    if (!transportRef.current) return;
    const { verb, query } = parseVerbAndQuery(commandInput);
    const scope =
      selectedQuadrant === 'ALL'
        ? { k: 'page' as const }
        : { k: 'quadrant' as const, q: selectedQuadrant };

    transportRef.current.send('engine.request', {
      t: 'engine.resolve',
      id: `req_${Date.now()}`,
      verb,
      query,
      scope,
    });
  };

  const sendHop = (dir: Dir) => {
    transportRef.current?.send('engine.request', {
      t: 'engine.hop',
      dir,
    });
  };

  const sendActivate = (matchId?: string) => {
    const targetId = matchId || focusedId || matches[0]?.id;
    if (!targetId || !transportRef.current) return;
    const { verb } = parseVerbAndQuery(commandInput);

    transportRef.current.send('engine.request', {
      t: 'engine.activate',
      id: `act_${Date.now()}`,
      matchId: targetId,
      verb,
      confirmed: true,
    });
  };

  const sendKey = (key: 'Enter' | 'Tab' | 'Backspace' | 'SelectAll') => {
    transportRef.current?.send('engine.request', {
      t: 'engine.key',
      key,
    });
  };

  const sendScroll = (dir: 'scroll_down' | 'scroll_up' | 'scroll_top' | 'scroll_bottom') => {
    transportRef.current?.send('engine.request', {
      t: 'engine.global',
      name: dir,
    });
  };

  const sendShowNumbers = () => {
    if (!transportRef.current) return;
    const scope: Scope =
      selectedQuadrant === 'ALL'
        ? { k: 'page' }
        : { k: 'quadrant', q: selectedQuadrant };
    transportRef.current.send('engine.request', {
      t: 'engine.showNumbers',
      scope,
    });
  };

  const sendZoom = (op: { k: 'start' } | { k: 'pick'; n: number } | { k: 'back' } | { k: 'click' }) => {
    if (!transportRef.current) return;
    if (op.k === 'start') {
      const scope: Scope =
        selectedQuadrant === 'ALL'
          ? { k: 'page' }
          : { k: 'quadrant', q: selectedQuadrant };
      transportRef.current.send('engine.request', {
        t: 'engine.zoom',
        op: { k: 'start', scope },
      });
    } else {
      transportRef.current.send('engine.request', {
        t: 'engine.zoom',
        op,
      });
    }
  };

  const sendType = (mode: 'fill' | 'insert') => {
    if (!transportRef.current) return;
    transportRef.current.send('engine.request', {
      t: 'engine.type',
      text: typeText,
      field: typeField || undefined,
      mode,
    });
  };

  const sendSearch = () => {
    if (!transportRef.current) return;
    transportRef.current.send('engine.request', {
      t: 'engine.resolve',
      id: `search_${Date.now()}`,
      verb: 'search',
      query: { raw: 'search', role: 'input' },
      scope: { k: 'page' },
    });
  };

  useEffect(() => {
    // Set up in-memory transport pairing harness and engine
    const [engineTransport, harnessTransport] = memoryTransport();
    transportRef.current = harnessTransport;

    const unsubs = [
      harnessTransport.on('engine.event', (event: EngineEvent) => {
        if (event.t === 'engine.result') {
          setMatches(event.matches);
          setEngineStatus(`${event.status}${event.widened ? ' (widened)' : ''}`);
        } else if (event.t === 'engine.focus') {
          setFocusedId(event.matchId);
        } else if (event.t === 'engine.done') {
          setLastAction(`${event.what} [${event.ok ? 'OK' : 'FAIL'}]`);
          // Clear zoom overlay on done
          if (event.what === 'zoom_cancelled' || event.ok) {
            setZoomCells([]);
            setZoomRect(null);
          }
        } else if (event.t === 'engine.ready') {
          setEngineStatus('ready');
        } else if (event.t === 'engine.zoomState') {
          setZoomRect(event.rect);
          setZoomCells(event.cells);
          setEngineStatus(`zoom depth=${event.depth}${event.outcome ? ' [' + event.outcome + ']' : ''}`);
          if (event.outcome === 'clicked' || event.outcome === 'center') {
            // Clear after short delay so user can see
            setTimeout(() => { setZoomCells([]); setZoomRect(null); }, 800);
          }
        }
      }),
    ];

    const engine = startEngine(engineTransport);

    const timer = setTimeout(sendResolve, 150);

    return () => {
      clearTimeout(timer);
      unsubs.forEach((u) => u());
      engine.destroy();
    };
  }, [activeFixture, selectedQuadrant]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top Controls Header */}
      <div style={{ padding: '12px 16px', background: '#1e293b', color: '#fff', borderBottom: '1px solid #334155' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>🎯 P2 Engine Harness</strong>
          <span style={{ color: '#94a3b8' }}>Fixture:</span>
          {(['repeated', 'colors', 'stacked', 'form', 'canvas', 'iframe', 'dense', 'search'] as const).map((f) => (
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

        {/* Query Input, Quadrants, and Engine Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendResolve()}
            placeholder="e.g. click blue button, second submit, right link"
            style={{
              flex: 1,
              minWidth: 220,
              padding: '6px 12px',
              borderRadius: 4,
              border: '1px solid #475569',
              background: '#0f172a',
              color: '#fff',
            }}
          />
          <button
            onClick={sendResolve}
            style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer' }}
          >
            Resolve
          </button>
          <button
            onClick={() => sendActivate()}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer' }}
          >
            Activate
          </button>

          {/* Hop Buttons */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['up', 'down', 'left', 'right'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => sendHop(dir)}
                style={{ background: '#475569', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
              >
                Hop {dir}
              </button>
            ))}
          </div>

          {/* Quadrant Selector */}
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

        {/* ShowNumbers / Zoom / Type Controls Row */}
        <div id="advanced-controls" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid #334155' }}>
          {/* ShowNumbers */}
          <button
            id="btn-show-numbers"
            onClick={sendShowNumbers}
            style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            ShowNumbers
          </button>

          {/* Zoom */}
          <button
            id="btn-zoom-start"
            onClick={() => sendZoom({ k: 'start' })}
            style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            Zoom Start
          </button>
          {([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => (
            <button
              key={n}
              id={`btn-zoom-pick-${n}`}
              onClick={() => sendZoom({ k: 'pick', n })}
              style={{ background: '#334155', color: '#fff', border: 'none', padding: '4px 7px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
            >
              {n}
            </button>
          ))}
          <button
            id="btn-zoom-back"
            onClick={() => sendZoom({ k: 'back' })}
            style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            ← Back
          </button>
          <button
            id="btn-zoom-click"
            onClick={() => sendZoom({ k: 'click' })}
            style={{ background: '#f97316', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            Click Here
          </button>

          {/* Type controls */}
          <span style={{ color: '#94a3b8', fontSize: 11 }}>│ Type:</span>
          <input
            id="type-field-input"
            type="text"
            value={typeField}
            onChange={(e) => setTypeField(e.target.value)}
            placeholder="field (optional)"
            style={{ width: 120, padding: '4px 8px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: 11 }}
          />
          <input
            id="type-text-input"
            type="text"
            value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
            placeholder="text to type"
            style={{ width: 140, padding: '4px 8px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: 11 }}
          />
          <button
            id="btn-type-fill"
            onClick={() => sendType('fill')}
            style={{ background: '#10b981', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            Fill
          </button>
          <button
            id="btn-type-insert"
            onClick={() => sendType('insert')}
            style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            Insert
          </button>
          <button
            id="btn-search"
            onClick={sendSearch}
            style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            Search verb
          </button>
        </div>
      </div>

      {/* Main Split: Workspace Fixture + Side Results Panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Fixture Area */}
        <div
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
                <button
                  key={i}
                  id={`rep-btn-${i}`}
                  onClick={() => setLastAction(`Clicked Submit Order ${i}`)}
                  style={{ padding: '12px 16px', background: '#3b82f6', color: '#fff', borderRadius: 6 }}
                >
                  Submit Order
                </button>
              ))}
            </div>
          )}

          {activeFixture === 'colors' && (
            <div id="fixture-colors" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <button id="color-blue" onClick={() => setLastAction('Clicked Blue')} style={{ background: 'rgb(59, 130, 246)', color: '#fff', padding: '10px 20px', borderRadius: 6 }}>Blue Action</button>
              <button id="color-red" onClick={() => setLastAction('Clicked Red')} style={{ background: 'rgb(239, 68, 68)', color: '#fff', padding: '10px 20px', borderRadius: 6 }}>Red Danger</button>
              <button id="color-green" onClick={() => setLastAction('Clicked Green')} style={{ background: 'rgb(34, 197, 94)', color: '#fff', padding: '10px 20px', borderRadius: 6 }}>Green Success</button>
              <button id="color-yellow" onClick={() => setLastAction('Clicked Yellow')} style={{ background: 'rgb(234, 179, 8)', color: '#000', padding: '10px 20px', borderRadius: 6 }}>Yellow Warn</button>
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
            <form id="fixture-form" onSubmit={(e) => { e.preventDefault(); setLastAction('Form Submitted'); }} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 350 }}>
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
                Canvas Node 1
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
                        sendResolve();
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

          {activeFixture === 'search' && (
            <div id="fixture-search" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 420 }}>
              <h3 style={{ margin: 0, color: '#1e293b' }}>Search &amp; Type Fixture</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label htmlFor="search-input" style={{ fontSize: 13, fontWeight: 600 }}>Search box:</label>
                <input
                  id="search-input"
                  type="search"
                  aria-label="Search"
                  placeholder="Search…"
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #94a3b8', fontSize: 14 }}
                  onChange={(e) => setLastAction(`Search: ${e.target.value}`)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label htmlFor="react-input" style={{ fontSize: 13, fontWeight: 600 }}>React controlled input:</label>
                <input
                  id="react-input"
                  type="text"
                  placeholder="React input"
                  aria-label="React controlled"
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #94a3b8', fontSize: 14 }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>ContentEditable div:</label>
                <div
                  id="ce-div"
                  contentEditable
                  aria-label="Content editable"
                  suppressContentEditableWarning
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #94a3b8',
                    minHeight: 60,
                    fontSize: 14,
                    outline: 'none',
                    background: '#fff',
                  }}
                >
                  Edit me…
                </div>
              </div>
              <button
                id="search-submit"
                type="button"
                style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', borderRadius: 6, border: 'none', fontSize: 14 }}
                onClick={() => setLastAction('Search submitted')}
              >
                Submit Search
              </button>
            </div>
          )}

          {/* Zoom Grid Overlay */}
          {zoomCells.length > 0 && zoomRect && (
            <div
              id="zoom-overlay"
              style={{
                position: 'fixed',
                left: zoomRect.x,
                top: zoomRect.y,
                width: zoomRect.w,
                height: zoomRect.h,
                border: '2px solid #0ea5e9',
                pointerEvents: 'none',
                zIndex: 10000,
              }}
            >
              {zoomCells.map((cell) => (
                <div
                  key={cell.n}
                  id={`zoom-cell-${cell.n}`}
                  style={{
                    position: 'absolute',
                    left: cell.rect.x - zoomRect.x,
                    top: cell.rect.y - zoomRect.y,
                    width: cell.rect.w,
                    height: cell.rect.h,
                    border: '1px dashed rgba(14,165,233,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 'bold',
                    color: 'rgba(14,165,233,0.9)',
                  }}
                >
                  {cell.n}
                </div>
              ))}
            </div>
          )}

          {/* Minimal Debug Highlights of Matches */}
          {matches.map((m) => {
            const isFocused = m.id === focusedId;
            return (
              <div
                key={m.id}
                style={{
                  position: 'fixed',
                  left: m.rect.x,
                  top: m.rect.y,
                  width: m.rect.w,
                  height: m.rect.h,
                  border: isFocused ? '3px solid #22c55e' : '2px dashed #ef4444',
                  background: isFocused ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.15)',
                  pointerEvents: 'none',
                  zIndex: 9999,
                  fontSize: 10,
                  color: isFocused ? '#15803d' : '#ef4444',
                  fontWeight: 'bold',
                  padding: 2,
                }}
              >
                #{m.number} [{m.role}] {isFocused ? '★ FOCUS' : ''}
              </div>
            );
          })}
        </div>

        {/* Results Sidebar */}
        <div id="results-sidebar" style={{ width: 380, background: '#fff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <div id="results-header" style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', background: '#f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13 }}>Matches: {matches.length}</strong>
              <span style={{ fontSize: 11, background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>
                Status: <b>{engineStatus}</b>
              </span>
            </div>
            {lastAction && (
              <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>Last action: {lastAction}</div>
            )}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {matches.map((m) => {
              const isFocused = m.id === focusedId;
              return (
                <div
                  key={m.id}
                  onClick={() => sendActivate(m.id)}
                  style={{
                    border: isFocused ? '2px solid #22c55e' : '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: 8,
                    marginBottom: 6,
                    background: isFocused ? '#f0fdf4' : '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 'bold', color: '#1e293b' }}>
                      #{m.number} {m.label || '<em><no label></em>'}
                    </span>
                    {isFocused && (
                      <span style={{ background: '#22c55e', color: '#fff', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>FOCUSED</span>
                    )}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 11 }}>
                    Role: <code>{m.role}</code> {m.important ? `| ⚠️ ${m.important.reason}` : ''}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>
                    Rect: {m.rect.x},{m.rect.y} ({m.rect.w}x{m.rect.h})
                  </div>
                </div>
              );
            })}
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
