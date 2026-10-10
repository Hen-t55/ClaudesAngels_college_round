import type { OverlayState } from '../../shared/contract';
import { OVERLAY_CSS } from './styles';
import { computeBadgePlacements } from './collision';

export interface OverlayHandle {
  update: (state: OverlayState) => void;
  destroy: () => void;
  getHost: () => HTMLElement;
}

export function createOverlayRenderer(targetDoc: Document = document): OverlayHandle {
  const HOST_ID = 'handsfree-overlay-host';
  let host = targetDoc.getElementById(HOST_ID) as HTMLElement | null;

  if (host) {
    host.remove();
  }

  host = targetDoc.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;margin:0;padding:0;border:0;overflow:hidden;';

  // Attach Shadow DOM for encapsulation
  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = targetDoc.createElement('style');
  styleEl.textContent = OVERLAY_CSS;
  shadow.appendChild(styleEl);

  const container = targetDoc.createElement('div');
  container.className = 'hf-viewport';
  shadow.appendChild(container);

  targetDoc.documentElement.appendChild(host);

  function render(state: OverlayState) {
    container.innerHTML = '';

    const viewportW = targetDoc.defaultView?.innerWidth ?? 1280;
    const viewportH = targetDoc.defaultView?.innerHeight ?? 800;

    // 1. Quadrants Layer
    const quadrantsGrid = targetDoc.createElement('div');
    quadrantsGrid.className = 'hf-quadrants-grid';

    const quadrants = [
      { id: 'TL', class: 'hf-q-tl' },
      { id: 'TR', class: 'hf-q-tr' },
      { id: 'BL', class: 'hf-q-bl' },
      { id: 'BR', class: 'hf-q-br' },
    ] as const;

    for (const q of quadrants) {
      const qEl = targetDoc.createElement('div');
      qEl.className = `hf-quadrant ${q.class}`;

      const label = targetDoc.createElement('span');
      label.className = 'hf-quadrant-label';
      label.textContent = q.id;
      qEl.appendChild(label);

      if (state.quadrant) {
        if (state.quadrant === q.id) {
          if (state.quadrantLocked) {
            qEl.classList.add('hf-locked');
            const lockedBadge = targetDoc.createElement('div');
            lockedBadge.className = 'hf-locked-badge';
            lockedBadge.textContent = '🔒 LOCKED';
            qEl.appendChild(lockedBadge);
          } else {
            qEl.classList.add('hf-active');
          }
        } else {
          qEl.classList.add('hf-dimmed');
        }
      }

      quadrantsGrid.appendChild(qEl);
    }

    container.appendChild(quadrantsGrid);

    // Crosshairs
    const crosshairV = targetDoc.createElement('div');
    crosshairV.className = 'hf-crosshair-v';
    container.appendChild(crosshairV);

    const crosshairH = targetDoc.createElement('div');
    crosshairH.className = 'hf-crosshair-h';
    container.appendChild(crosshairH);

    // 2. Head Dot (if provided)
    if (state.headDot) {
      const dot = targetDoc.createElement('div');
      dot.className = 'hf-head-dot';
      let x = state.headDot.x;
      let y = state.headDot.y;
      if (x <= 1 && y <= 1 && x >= 0 && y >= 0) {
        x = x * viewportW;
        y = y * viewportH;
      }
      dot.style.left = `${Math.round(x)}px`;
      dot.style.top = `${Math.round(y)}px`;
      container.appendChild(dot);
    }

    // 3. Matches highlights and focus rings
    if (state.matches && state.matches.length > 0) {
      for (const m of state.matches) {
        const matchBox = targetDoc.createElement('div');
        matchBox.className = 'hf-match-highlight';
        if (m.focused) {
          matchBox.classList.add('hf-focused');
        }
        matchBox.style.left = `${Math.round(m.rect.x)}px`;
        matchBox.style.top = `${Math.round(m.rect.y)}px`;
        matchBox.style.width = `${Math.round(m.rect.w)}px`;
        matchBox.style.height = `${Math.round(m.rect.h)}px`;
        container.appendChild(matchBox);
      }

      // Number Badges (if showNumbers or numbers provided)
      const badgesToPlace = state.matches.filter(
        (m) => state.showNumbers || m.number !== undefined
      );

      if (badgesToPlace.length > 0) {
        const placed = computeBadgePlacements(
          badgesToPlace,
          { width: viewportW, height: viewportH },
          26
        );

        for (const b of placed) {
          const badgeEl = targetDoc.createElement('div');
          badgeEl.className = 'hf-badge';
          if (b.focused) {
            badgeEl.classList.add('hf-badge-focused');
          }
          badgeEl.style.left = `${Math.round(b.x)}px`;
          badgeEl.style.top = `${Math.round(b.y)}px`;
          badgeEl.textContent = String(b.number);
          container.appendChild(badgeEl);
        }
      }
    }

    // 4. Zoom Grid (if active)
    if (state.zoom) {
      const z = state.zoom;
      const zoomContainer = targetDoc.createElement('div');
      zoomContainer.className = 'hf-zoom-container';
      zoomContainer.style.left = `${Math.round(z.rect.x)}px`;
      zoomContainer.style.top = `${Math.round(z.rect.y)}px`;
      zoomContainer.style.width = `${Math.round(z.rect.w)}px`;
      zoomContainer.style.height = `${Math.round(z.rect.h)}px`;

      const breadcrumb = targetDoc.createElement('div');
      breadcrumb.className = 'hf-zoom-breadcrumb';
      breadcrumb.textContent = `Zoom: Level ${z.depth} (Say '1'–'9' to zoom, 'Back' to return, 'Click' to select)`;
      zoomContainer.appendChild(breadcrumb);

      for (const cell of z.cells) {
        const cellEl = targetDoc.createElement('div');
        cellEl.className = 'hf-zoom-cell';
        // cell.rect is relative to viewport, map it relative to zoomContainer
        const relX = cell.rect.x - z.rect.x;
        const relY = cell.rect.y - z.rect.y;
        cellEl.style.left = `${Math.round(relX)}px`;
        cellEl.style.top = `${Math.round(relY)}px`;
        cellEl.style.width = `${Math.round(cell.rect.w)}px`;
        cellEl.style.height = `${Math.round(cell.rect.h)}px`;

        const cellBadge = targetDoc.createElement('div');
        cellBadge.className = 'hf-zoom-cell-badge';
        cellBadge.textContent = String(cell.n);
        cellEl.appendChild(cellBadge);

        zoomContainer.appendChild(cellEl);
      }

      container.appendChild(zoomContainer);
    }

    // 5. Confirm / Info Banner
    if (state.banner) {
      const banner = state.banner;
      const bannerBox = targetDoc.createElement('div');
      bannerBox.className = `hf-banner-container hf-banner-${banner.kind}`;

      const header = targetDoc.createElement('div');
      header.className = 'hf-banner-header';

      const icon = targetDoc.createElement('span');
      icon.className = 'hf-banner-icon';
      icon.textContent = banner.kind === 'confirm' ? '⚠️' : banner.kind === 'error' ? '❌' : 'ℹ️';

      const text = targetDoc.createElement('span');
      text.textContent = banner.text;

      header.appendChild(icon);
      header.appendChild(text);
      bannerBox.appendChild(header);

      if (banner.kind === 'confirm') {
        const cues = targetDoc.createElement('div');
        cues.className = 'hf-banner-cues';
        cues.innerHTML = `<span>Say <strong>"Yes"</strong> or Nod to confirm</span><span>Say <strong>"No"</strong> or Shake to cancel</span>`;
        bannerBox.appendChild(cues);
      }

      if (banner.timeoutMs && banner.timeoutMs > 0) {
        const bar = targetDoc.createElement('div');
        bar.className = 'hf-banner-timer-bar';
        const progress = targetDoc.createElement('div');
        progress.className = 'hf-banner-timer-progress';
        progress.style.transitionDuration = `${banner.timeoutMs}ms`;
        bar.appendChild(progress);
        bannerBox.appendChild(bar);

        // trigger width reduction
        requestAnimationFrame(() => {
          progress.style.width = '0%';
        });
      }

      container.appendChild(bannerBox);
    }

    // 6. HUD Dock (Top-Right)
    const hudDock = targetDoc.createElement('div');
    hudDock.className = 'hf-hud-dock';

    // Status Pill
    const statusPill = targetDoc.createElement('div');
    statusPill.className = 'hf-hud-pill';
    if (state.listening) {
      statusPill.classList.add('hf-status-listening');
      statusPill.innerHTML = `<span class="hf-dot"></span><span>LISTENING</span>`;
    } else if (state.paused) {
      statusPill.classList.add('hf-status-paused');
      statusPill.innerHTML = `<span>⏸ PAUSED</span>`;
    } else {
      statusPill.innerHTML = `<span>${state.phase}</span>`;
    }
    hudDock.appendChild(statusPill);

    // Gear Pill (HOP vs VOICE)
    const gearPill = targetDoc.createElement('div');
    gearPill.className = `hf-hud-pill hf-gear-${state.gear}`;
    const gearIcon = state.gear === 'hop' ? '⇄' : '🎙';
    gearPill.innerHTML = `<span>${gearIcon} ${state.gear.toUpperCase()} MODE</span>`;

    if (state.gearReason) {
      const tooltip = targetDoc.createElement('div');
      tooltip.className = 'hf-tooltip';
      tooltip.textContent = state.gearReason;
      gearPill.appendChild(tooltip);
    }
    hudDock.appendChild(gearPill);

    container.appendChild(hudDock);

    // 7. Transcript Toast (Bottom-Center)
    if (state.transcript && state.transcript.trim().length > 0) {
      const toast = targetDoc.createElement('div');
      toast.className = 'hf-transcript-toast';
      toast.innerHTML = `<span>🗣️</span><span>"${state.transcript}"</span>`;
      container.appendChild(toast);
    }
  }

  return {
    update: render,
    destroy: () => {
      host?.remove();
    },
    getHost: () => host!,
  };
}
