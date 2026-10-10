export const OVERLAY_CSS = `
:host {
  all: initial !important;
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483647 !important;
  pointer-events: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
  color: #f8fafc !important;
  line-height: 1.4 !important;
}

*, *::before, *::after {
  box-sizing: border-box !important;
  margin: 0;
  padding: 0;
}

/* Layer container */
.hf-viewport {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* Quadrants layer */
.hf-quadrants-grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 50vw 50vw;
  grid-template-rows: 50vh 50vh;
  pointer-events: none;
}

.hf-quadrant {
  position: relative;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
  pointer-events: none;
}

.hf-quadrant-label {
  position: absolute;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.4);
  user-select: none;
  pointer-events: none;
}

.hf-q-tl .hf-quadrant-label { top: 12px; left: 12px; }
.hf-q-tr .hf-quadrant-label { top: 12px; right: 12px; }
.hf-q-bl .hf-quadrant-label { bottom: 12px; left: 12px; }
.hf-q-br .hf-quadrant-label { bottom: 12px; right: 12px; }

/* Dimmed other quadrants when one is active */
.hf-quadrant.hf-dimmed {
  background-color: rgba(10, 15, 30, 0.52);
  backdrop-filter: blur(1.5px);
}

/* Active aiming quadrant */
.hf-quadrant.hf-active {
  box-shadow: inset 0 0 0 3px #38bdf8, inset 0 0 25px rgba(56, 189, 248, 0.25);
  background-color: transparent;
}

.hf-quadrant.hf-active .hf-quadrant-label {
  color: #38bdf8;
  text-shadow: 0 0 8px rgba(56, 189, 248, 0.8);
}

/* Locked quadrant style */
.hf-quadrant.hf-locked {
  box-shadow: inset 0 0 0 4px #f59e0b, inset 0 0 35px rgba(245, 158, 11, 0.35);
  background-color: rgba(245, 158, 11, 0.04);
}

.hf-quadrant.hf-locked .hf-quadrant-label {
  color: #f59e0b;
  font-weight: 900;
  text-shadow: 0 0 10px rgba(245, 158, 11, 0.9);
}

.hf-locked-badge {
  position: absolute;
  top: 14px;
  right: 14px;
  background: #f59e0b;
  color: #0f172a;
  font-size: 11px;
  font-weight: 900;
  padding: 3px 8px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Subtle quadrant dividing crosshairs */
.hf-crosshair-v {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50vw;
  width: 1px;
  background: rgba(255, 255, 255, 0.12);
  pointer-events: none;
}

.hf-crosshair-h {
  position: absolute;
  left: 0;
  right: 0;
  top: 50vh;
  height: 1px;
  background: rgba(255, 255, 255, 0.12);
  pointer-events: none;
}

/* Head Dot pointer */
.hf-head-dot {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #38bdf8;
  border: 2px solid #ffffff;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.9), 0 2px 6px rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 100;
}

/* Matches highlighting */
.hf-match-highlight {
  position: absolute;
  border: 2px solid #38bdf8;
  background: rgba(56, 189, 248, 0.14);
  border-radius: 4px;
  pointer-events: none;
  transition: all 0.15s ease;
  z-index: 40;
}

/* Focused match (HOP mode) */
.hf-match-highlight.hf-focused {
  border: 3px solid #2563eb !important;
  background: rgba(37, 99, 235, 0.28) !important;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.5), 0 0 22px rgba(37, 99, 235, 0.8) !important;
  z-index: 50 !important;
}

/* Badges */
.hf-badge {
  position: absolute;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #0f172a;
  color: #ffffff;
  border: 2px solid #38bdf8;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.8), 0 0 8px rgba(56, 189, 248, 0.4);
  font-size: 13px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 60;
  transition: transform 0.12s ease;
}

.hf-badge.hf-badge-focused {
  background: #2563eb;
  border-color: #93c5fd;
  transform: scale(1.22);
  box-shadow: 0 0 14px rgba(37, 99, 235, 0.9), 0 2px 8px rgba(0, 0, 0, 0.9);
}

/* Zoom Grid */
.hf-zoom-container {
  position: absolute;
  border: 2px solid #38bdf8;
  background: rgba(15, 23, 42, 0.2);
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.7);
  pointer-events: none;
  z-index: 70;
}

.hf-zoom-breadcrumb {
  position: absolute;
  top: -34px;
  left: 0;
  background: #0f172a;
  color: #38bdf8;
  border: 1px solid #38bdf8;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 800;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
}

.hf-zoom-cell {
  position: absolute;
  border: 1px dashed rgba(56, 189, 248, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.hf-zoom-cell-badge {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #0f172a;
  color: #38bdf8;
  border: 2px solid #38bdf8;
  font-size: 16px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
}

/* Confirm / Notification Banner */
.hf-banner-container {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: min(90vw, 540px);
  background: #0f172a;
  color: #f8fafc;
  border-radius: 12px;
  padding: 16px 22px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.12);
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
  z-index: 120;
}

.hf-banner-confirm {
  border-left: 6px solid #f59e0b;
}

.hf-banner-error {
  border-left: 6px solid #ef4444;
}

.hf-banner-info {
  border-left: 6px solid #38bdf8;
}

.hf-banner-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
}

.hf-banner-icon {
  font-size: 20px;
}

.hf-banner-cues {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.05);
  padding: 6px 12px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hf-banner-timer-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.hf-banner-timer-progress {
  height: 100%;
  background: #f59e0b;
  width: 100%;
  transition: width linear;
}

/* HUD Dock (Top-Right) */
.hf-hud-dock {
  position: absolute;
  top: 14px;
  right: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
  z-index: 110;
}

.hf-hud-pill {
  background: #0f172a;
  border: 1.5px solid rgba(255, 255, 255, 0.2);
  color: #f8fafc;
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  letter-spacing: 0.03em;
  position: relative;
}

.hf-hud-pill:hover .hf-tooltip {
  visibility: visible;
  opacity: 1;
}

.hf-gear-hop {
  border-color: #3b82f6;
  color: #60a5fa;
}

.hf-gear-voice {
  border-color: #10b981;
  color: #34d399;
}

.hf-status-listening {
  border-color: #10b981;
}

.hf-status-listening .hf-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.hf-status-paused {
  border-color: #f59e0b;
  color: #f59e0b;
}

.hf-tooltip {
  visibility: hidden;
  opacity: 0;
  position: absolute;
  bottom: -32px;
  right: 0;
  background: #020617;
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.6);
  transition: opacity 0.15s ease;
  pointer-events: none;
  z-index: 200;
}

/* Transcript Toast (Bottom-Center) */
.hf-transcript-toast {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.94);
  color: #f8fafc;
  border: 1.5px solid #38bdf8;
  border-radius: 9999px;
  padding: 8px 22px;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(56, 189, 248, 0.3);
  display: flex;
  align-items: center;
  gap: 8px;
  backdrop-filter: blur(8px);
  pointer-events: none;
  z-index: 100;
  max-width: 80vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Reduced motion preferences */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
}
`;
