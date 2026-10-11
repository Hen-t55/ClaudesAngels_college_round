import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import type { OverlayState, Phase, Gear, Quadrant, Rect } from '../../src/shared/contract';
import { memoryTransport } from '../../src/shared/bus';
import { mountOverlay } from '../../src/content/overlay';
import { create3x3ZoomCells } from '../../src/content/overlay/zoom';

type BackgroundType = 'white' | 'dark' | 'busy-image' | 'dense-page';

export function OverlayDevApp() {
  // Transport setup
  const [orchestratorSide, contentSide] = useMemo(() => memoryTransport(), []);

  // Background state
  const [bgType, setBgType] = useState<BackgroundType>('dense-page');
  const [panelOpen, setPanelOpen] = useState<boolean>(true);

  // Overlay state fields
  const [phase, setPhase] = useState<Phase>('DISAMBIGUATE');
  const [gear, setGear] = useState<Gear>('voice');
  const [gearReason, setGearReason] = useState<string>('Voice quality good (SNR 24dB)');
  const [paused, setPaused] = useState<boolean>(false);
  const [listening, setListening] = useState<boolean>(true);
  const [quadrant, setQuadrant] = useState<Quadrant | null>('TL');
  const [quadrantLocked, setQuadrantLocked] = useState<boolean>(true);
  const [showHeadDot, setShowHeadDot] = useState<boolean>(true);
  const [headDotX, setHeadDotX] = useState<number>(0.28);
  const [headDotY, setHeadDotY] = useState<number>(0.32);

  // Matches configuration
  const [matchesPreset, setMatchesPreset] = useState<'none' | 'few' | 'dense' | 'single'>('few');
  const [focusedIndex, setFocusedIndex] = useState<number>(1);
  const [showNumbers, setShowNumbers] = useState<boolean>(true);

  // Zoom configuration
  const [zoomActive, setZoomActive] = useState<boolean>(false);
  const [zoomDepth, setZoomDepth] = useState<number>(1);

  // Banner configuration
  const [bannerActive, setBannerActive] = useState<boolean>(false);
  const [bannerKind, setBannerKind] = useState<'confirm' | 'info' | 'error'>('confirm');
  const [bannerText, setBannerText] = useState<string>('Close this tab? Say yes or nod');
  const [bannerTimeout, setBannerTimeout] = useState<number>(5000);

  // Transcript
  const [transcript, setTranscript] = useState<string>('click add to cart');

  // Compute matches list based on preset
  const matches = useMemo(() => {
    const list: { id: string; rect: Rect; number?: number; focused?: boolean }[] = [];
    if (matchesPreset === 'none') return list;

    if (matchesPreset === 'single') {
      list.push({
        id: 'btn-main',
        rect: { x: 120, y: 160, w: 180, h: 48 },
        number: 1,
        focused: focusedIndex === 0,
      });
      return list;
    }

    if (matchesPreset === 'few') {
      const positions = [
        { x: 80, y: 140, w: 140, h: 40 },
        { x: 260, y: 140, w: 140, h: 40 },
        { x: 80, y: 220, w: 140, h: 40 },
        { x: 260, y: 220, w: 140, h: 40 },
      ];
      positions.forEach((pos, idx) => {
        list.push({
          id: `match-${idx + 1}`,
          rect: pos,
          number: idx + 1,
          focused: focusedIndex === idx,
        });
      });
      return list;
    }

    if (matchesPreset === 'dense') {
      // 8 dense colliding elements in top-left quadrant
      for (let i = 0; i < 8; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        list.push({
          id: `dense-${i + 1}`,
          rect: {
            x: 60 + col * 180,
            y: 100 + row * 60,
            w: 160,
            h: 36,
          },
          number: i + 1,
          focused: focusedIndex === i,
        });
      }
      return list;
    }

    return list;
  }, [matchesPreset, focusedIndex]);

  // Compute zoom state
  const zoomState = useMemo(() => {
    if (!zoomActive) return undefined;
    const baseBounds: Rect = { x: 40, y: 60, w: 500, h: 400 };
    return {
      rect: baseBounds,
      cells: create3x3ZoomCells(baseBounds),
      depth: zoomDepth,
    };
  }, [zoomActive, zoomDepth]);

  // Mount overlay once
  useEffect(() => {
    const unmount = mountOverlay(contentSide);
    return unmount;
  }, [contentSide]);

  // Broadcast state changes whenever any control is updated
  useEffect(() => {
    const state: OverlayState = {
      phase,
      gear,
      gearReason,
      paused,
      listening,
      quadrant,
      quadrantLocked,
      headDot: showHeadDot ? { x: headDotX, y: headDotY } : undefined,
      matches,
      showNumbers,
      zoom: zoomState,
      banner: bannerActive
        ? {
            kind: bannerKind,
            text: bannerText,
            timeoutMs: bannerTimeout > 0 ? bannerTimeout : undefined,
          }
        : undefined,
      transcript,
    };

    orchestratorSide.send('overlay', state);
  }, [
    orchestratorSide,
    phase,
    gear,
    gearReason,
    paused,
    listening,
    quadrant,
    quadrantLocked,
    showHeadDot,
    headDotX,
    headDotY,
    matches,
    showNumbers,
    zoomState,
    bannerActive,
    bannerKind,
    bannerText,
    bannerTimeout,
    transcript,
  ]);

  // Presets
  const applyPreset = (presetName: string) => {
    if (presetName === 'aiming') {
      setPhase('AIMING');
      setQuadrant('TL');
      setQuadrantLocked(false);
      setListening(false);
      setMatchesPreset('none');
      setZoomActive(false);
      setBannerActive(false);
      setTranscript('');
      setGear('voice');
    } else if (presetName === 'locked') {
      setPhase('LOCKED');
      setQuadrant('TR');
      setQuadrantLocked(true);
      setListening(true);
      setMatchesPreset('none');
      setZoomActive(false);
      setBannerActive(false);
      setTranscript('search documentation');
      setGear('voice');
    } else if (presetName === 'voice-disambiguate') {
      setPhase('DISAMBIGUATE');
      setGear('voice');
      setGearReason('Clean speech detected');
      setQuadrant('TL');
      setQuadrantLocked(true);
      setMatchesPreset('dense');
      setShowNumbers(true);
      setZoomActive(false);
      setBannerActive(false);
      setTranscript('two');
    } else if (presetName === 'hop-disambiguate') {
      setPhase('DISAMBIGUATE');
      setGear('hop');
      setGearReason('High ambient noise (62dB) — shifted to Hop');
      setQuadrant('TL');
      setQuadrantLocked(true);
      setMatchesPreset('few');
      setFocusedIndex(1);
      setShowNumbers(false);
      setZoomActive(false);
      setBannerActive(false);
      setTranscript('flick right');
    } else if (presetName === 'zoom') {
      setPhase('ZOOM');
      setQuadrant(null);
      setQuadrantLocked(false);
      setMatchesPreset('none');
      setZoomActive(true);
      setZoomDepth(2);
      setBannerActive(false);
      setTranscript('five');
    } else if (presetName === 'confirm') {
      setPhase('CONFIRM');
      setQuadrant('TL');
      setQuadrantLocked(true);
      setMatchesPreset('single');
      setZoomActive(false);
      setBannerActive(true);
      setBannerKind('confirm');
      setBannerText('Close this tab? Say yes or nod');
      setBannerTimeout(5000);
      setTranscript('close tab');
    }
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100vw' }}>
      {/* Background layer */}
      {bgType === 'white' && (
        <div style={{ minHeight: '100vh', background: '#ffffff', color: '#111827', padding: 40 }}>
          <h1 style={{ fontSize: 32, marginBottom: 12 }}>Clean White Background</h1>
          <p style={{ fontSize: 18, maxWidth: 640, color: '#4b5563' }}>
            Testing high-contrast visibility of quadrant dividers, dimmed masks, cyan borders, and
            number badges over light background content.
          </p>
          <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
            <button style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid #ccc' }}>Light Button 1</button>
            <button style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid #ccc' }}>Light Button 2</button>
          </div>
        </div>
      )}

      {bgType === 'dark' && (
        <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', padding: 40 }}>
          <h1 style={{ fontSize: 32, marginBottom: 12, color: '#60a5fa' }}>Dark Slate Theme</h1>
          <p style={{ fontSize: 18, maxWidth: 640, color: '#94a3b8' }}>
            Testing overlay glow, amber lock rings, head pointer dot, and breadcrumb contrast over dark background colors.
          </p>
          <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
            <button style={{ padding: '10px 20px', borderRadius: 6, background: '#1e293b', color: '#fff', border: '1px solid #334155' }}>Dark Action</button>
            <button style={{ padding: '10px 20px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none' }}>Primary Action</button>
          </div>
        </div>
      )}

      {bgType === 'busy-image' && (
        <div
          style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #f43f5e 0%, #8b5cf6 25%, #06b6d4 50%, #10b981 75%, #f59e0b 100%)',
            color: '#ffffff',
            padding: 40,
            backgroundImage:
              'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 20%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.6) 0%, transparent 30%)',
          }}
        >
          <h1 style={{ fontSize: 36, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>Busy Multi-Color Gradient Background</h1>
          <p style={{ fontSize: 20, maxWidth: 640, textShadow: '0 2px 6px rgba(0,0,0,0.8)' }}>
            High-chroma, noisy visual background to ensure all text badges, confirm banners, and HUD pills maintain
            exceptional readability without blending into saturated page elements.
          </p>
        </div>
      )}

      {bgType === 'dense-page' && (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', padding: '20px 40px' }}>
          {/* Sticky Top Header */}
          <header style={{ position: 'sticky', top: 0, zIndex: 100, background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', padding: '12px 0', backdropFilter: 'blur(8px)' }}>
            <div style={{ fontWeight: 800, fontSize: 22, color: '#2563eb' }}>StoreDirect</div>
            <div style={{ display: 'flex', gap: 14, fontSize: 14, fontWeight: 600, alignItems: 'center' }}>
              <span>Home</span>
              <span>Catalog</span>
              <span>Deals</span>
              <button id="sticky-header-btn" style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                Cart (3)
              </button>
            </div>
          </header>

          {/* Hero Banner */}
          <div style={{ background: '#e0f2fe', borderRadius: 12, padding: '24px 32px', margin: '20px 0', border: '1px solid #bae6fd' }}>
            <h2 style={{ fontSize: 24, margin: '0 0 8px 0', color: '#0369a1' }}>Handsfree Ready E-Commerce Portal</h2>
            <p style={{ margin: 0, color: '#0284c7' }}>Look at any quadrant, say "click" or the item number to navigate.</p>
          </div>

          {/* Product Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
              <div key={item} style={{ background: '#ffffff', borderRadius: 8, padding: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ height: 90, background: '#f1f5f9', borderRadius: 6, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontWeight: 600 }}>
                  Item #{item}
                </div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Wireless Headset #{item}</div>
                <div style={{ color: '#64748b', fontSize: 13, margin: '4px 0 12px 0' }}>$79.99 • In Stock</div>
                <button
                  id={`buy-btn-${item}`}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Buy Now
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Control Panel */}
      <div
        id="dev-harness-panel"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: panelOpen ? 380 : 160,
          maxHeight: '90vh',
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#f8fafc',
          borderRadius: 12,
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(12px)',
          zIndex: 2147483640,
          padding: 16,
          boxSizing: 'border-box',
          overflowY: 'auto',
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ fontSize: 14, color: '#38bdf8' }}>Overlay Harness</strong>
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            style={{
              background: '#334155',
              border: 'none',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {panelOpen ? 'Hide' : 'Expand'}
          </button>
        </div>

        {panelOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Background Selector */}
            <div>
              <label style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>Test Background</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                {(['white', 'dark', 'busy-image', 'dense-page'] as BackgroundType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setBgType(type)}
                    style={{
                      padding: '5px 8px',
                      borderRadius: 4,
                      border: bgType === type ? '1.5px solid #38bdf8' : '1px solid #334155',
                      background: bgType === type ? '#1e293b' : '#0f172a',
                      color: bgType === type ? '#38bdf8' : '#94a3b8',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Presets */}
            <div>
              <label style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>Scenario Presets</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                <button onClick={() => applyPreset('aiming')} style={presetBtnStyle}>🎯 1. Aiming (TL)</button>
                <button onClick={() => applyPreset('locked')} style={presetBtnStyle}>🔒 2. Locked (TR)</button>
                <button onClick={() => applyPreset('voice-disambiguate')} style={presetBtnStyle}>🔢 3. Voice (Badges)</button>
                <button onClick={() => applyPreset('hop-disambiguate')} style={presetBtnStyle}>⇄ 4. Hop (Focus)</button>
                <button onClick={() => applyPreset('zoom')} style={presetBtnStyle}>🔍 5. Zoom (3x3)</button>
                <button onClick={() => applyPreset('confirm')} style={presetBtnStyle}>⚠️ 6. Confirm Banner</button>
              </div>
            </div>

            {/* Phase & Gear */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontWeight: 700, display: 'block', marginBottom: 2 }}>Phase</label>
                <select
                  value={phase}
                  onChange={(e) => setPhase(e.target.value as Phase)}
                  style={selectStyle}
                >
                  {['SETUP', 'IDLE', 'AIMING', 'LOCKED', 'RESOLVING', 'DISAMBIGUATE', 'ZOOM', 'CONFIRM', 'DICTATION', 'PAUSED'].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontWeight: 700, display: 'block', marginBottom: 2 }}>Gear</label>
                <select
                  value={gear}
                  onChange={(e) => setGear(e.target.value as Gear)}
                  style={selectStyle}
                >
                  <option value="voice">Voice</option>
                  <option value="hop">Hop</option>
                </select>
              </div>
            </div>

            {/* Gear Reason */}
            <div>
              <label style={{ fontWeight: 700, display: 'block', marginBottom: 2 }}>Gear Reason</label>
              <input
                type="text"
                value={gearReason}
                onChange={(e) => setGearReason(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Quadrant Controls */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontWeight: 700, display: 'block', marginBottom: 2 }}>Quadrant</label>
                <select
                  value={quadrant ?? 'none'}
                  onChange={(e) => setQuadrant(e.target.value === 'none' ? null : (e.target.value as Quadrant))}
                  style={selectStyle}
                >
                  <option value="none">None</option>
                  <option value="TL">TL</option>
                  <option value="TR">TR</option>
                  <option value="BL">BL</option>
                  <option value="BR">BR</option>
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 14 }}>
                <input
                  type="checkbox"
                  checked={quadrantLocked}
                  onChange={(e) => setQuadrantLocked(e.target.checked)}
                />
                Locked
              </label>
            </div>

            {/* Status Flags */}
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={listening}
                  onChange={(e) => setListening(e.target.checked)}
                />
                Listening
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={paused}
                  onChange={(e) => setPaused(e.target.checked)}
                />
                Paused
              </label>
            </div>

            {/* Head Dot */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={showHeadDot}
                  onChange={(e) => setShowHeadDot(e.target.checked)}
                />
                Head Dot (X: {headDotX.toFixed(2)}, Y: {headDotY.toFixed(2)})
              </label>
              {showHeadDot && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={headDotX}
                    onChange={(e) => setHeadDotX(parseFloat(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={headDotY}
                    onChange={(e) => setHeadDotY(parseFloat(e.target.value))}
                    style={{ flex: 1 }}
                  />
                </div>
              )}
            </div>

            {/* Matches & Badges */}
            <div>
              <label style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>Matches Preset</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['none', 'single', 'few', 'dense'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMatchesPreset(m)}
                    style={{
                      flex: 1,
                      padding: '4px',
                      background: matchesPreset === m ? '#1e293b' : '#0f172a',
                      border: matchesPreset === m ? '1.5px solid #38bdf8' : '1px solid #334155',
                      color: matchesPreset === m ? '#38bdf8' : '#94a3b8',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 10,
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showNumbers}
                    onChange={(e) => setShowNumbers(e.target.checked)}
                  />
                  Show Numbers
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Focus:</span>
                  <select
                    value={focusedIndex}
                    onChange={(e) => setFocusedIndex(parseInt(e.target.value, 10))}
                    style={selectStyle}
                  >
                    <option value="-1">None</option>
                    <option value="0">#1</option>
                    <option value="1">#2</option>
                    <option value="2">#3</option>
                    <option value="3">#4</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Zoom Grid */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={zoomActive}
                  onChange={(e) => setZoomActive(e.target.checked)}
                />
                Zoom Grid
              </label>
              {zoomActive && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>Depth:</span>
                  <select
                    value={zoomDepth}
                    onChange={(e) => setZoomDepth(parseInt(e.target.value, 10))}
                    style={selectStyle}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </div>
              )}
            </div>

            {/* Confirm Banner */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={bannerActive}
                  onChange={(e) => setBannerActive(e.target.checked)}
                />
                Banner Alert
              </label>
              {bannerActive && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      value={bannerKind}
                      onChange={(e) => setBannerKind(e.target.value as 'confirm' | 'info' | 'error')}
                      style={selectStyle}
                    >
                      <option value="confirm">Confirm</option>
                      <option value="info">Info</option>
                      <option value="error">Error</option>
                    </select>
                    <input
                      type="text"
                      value={bannerText}
                      onChange={(e) => setBannerText(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Transcript */}
            <div>
              <label style={{ fontWeight: 700, display: 'block', marginBottom: 2 }}>Transcript Toast</label>
              <input
                type="text"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Spoken utterance..."
                style={inputStyle}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const presetBtnStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 4,
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#f8fafc',
  cursor: 'pointer',
  fontSize: 10,
  fontWeight: 600,
  textAlign: 'left',
};

const selectStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#f8fafc',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '4px 6px',
  fontSize: 11,
  width: '100%',
};

const inputStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#f8fafc',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '4px 6px',
  fontSize: 11,
  width: '100%',
  boxSizing: 'border-box',
};

const root = createRoot(document.getElementById('root')!);
root.render(<OverlayDevApp />);
