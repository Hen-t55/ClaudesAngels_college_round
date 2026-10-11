import type { Rect } from '../../shared/contract';

export interface PlacedBadge {
  matchId: string;
  number: number;
  x: number;
  y: number;
  w: number;
  h: number;
  focused: boolean;
}

export interface ViewportDim {
  width: number;
  height: number;
}

export const BADGE_SIZE = 26;
export const BADGE_MARGIN = 4;

export function doesOverlap(
  b1: { x: number; y: number; w: number; h: number },
  b2: { x: number; y: number; w: number; h: number }
): boolean {
  return !(
    b1.x + b1.w <= b2.x ||
    b2.x + b2.w <= b1.x ||
    b1.y + b1.h <= b2.y ||
    b2.y + b2.h <= b1.y
  );
}

export function clamp(val: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.max(min, Math.min(val, max));
}

/**
 * Calculates collision-aware, viewport-bounded badge positions for matches.
 */
export function computeBadgePlacements(
  matches: Array<{ id: string; rect: Rect; number?: number; focused?: boolean }>,
  viewport: ViewportDim,
  badgeSize: number = BADGE_SIZE
): PlacedBadge[] {
  const placed: PlacedBadge[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const num = match.number ?? i + 1;
    const r = match.rect;

    const maxX = Math.max(BADGE_MARGIN, viewport.width - badgeSize - BADGE_MARGIN);
    const maxY = Math.max(BADGE_MARGIN, viewport.height - badgeSize - BADGE_MARGIN);

    const isNearTop = r.y < 35;
    const isNearRight = r.x + r.w > viewport.width - 35;
    const isNearBottom = r.y + r.h > viewport.height - 35;

    // Candidate positions relative to target element rect
    // Intelligently adapt when target is near sticky top header or viewport borders
    const candidates = [
      // 1. Top offset (or inside top if touching top margin / sticky header)
      isNearTop
        ? { x: r.x + 4, y: Math.max(BADGE_MARGIN, r.y + 4) }
        : { x: r.x - 8, y: r.y - 8 },
      // 2. Centered above (or centered inside if near top)
      isNearTop
        ? { x: r.x + r.w / 2 - badgeSize / 2, y: Math.max(BADGE_MARGIN, r.y + 4) }
        : { x: r.x + r.w / 2 - badgeSize / 2, y: r.y - badgeSize - 4 },
      // 3. Top-Right offset (or inside right if near edge)
      isNearRight
        ? { x: r.x + r.w - badgeSize - 4, y: isNearTop ? r.y + 4 : r.y - 8 }
        : { x: r.x + r.w - badgeSize + 8, y: r.y - 8 },
      // 4. Bottom-Left offset (or inside bottom if near bottom edge)
      isNearBottom
        ? { x: r.x + 4, y: r.y + r.h - badgeSize - 4 }
        : { x: r.x - 8, y: r.y + r.h - badgeSize + 8 },
      // 5. Bottom-Right offset
      { x: r.x + r.w - badgeSize + 8, y: r.y + r.h - badgeSize + 8 },
      // 6. Centered inside
      { x: r.x + r.w / 2 - badgeSize / 2, y: r.y + r.h / 2 - badgeSize / 2 },
    ];

    let chosenPos = {
      x: clamp(candidates[0].x, BADGE_MARGIN, maxX),
      y: clamp(candidates[0].y, BADGE_MARGIN, maxY),
      w: badgeSize,
      h: badgeSize,
    };

    let resolved = false;

    // Try each candidate for non-collision with previously placed badges
    for (const cand of candidates) {
      const candidateBox = {
        x: clamp(cand.x, BADGE_MARGIN, maxX),
        y: clamp(cand.y, BADGE_MARGIN, maxY),
        w: badgeSize,
        h: badgeSize,
      };

      const hasCollision = placed.some((other) => doesOverlap(candidateBox, other));
      if (!hasCollision) {
        chosenPos = candidateBox;
        resolved = true;
        break;
      }
    }

    // If still colliding, shift in multiple directions (downwards, rightwards, upwards)
    if (!resolved) {
      for (let offset = 1; offset <= 6; offset++) {
        // 1. Try shifting downwards
        const shiftedDown = {
          x: clamp(chosenPos.x, BADGE_MARGIN, maxX),
          y: clamp(chosenPos.y + offset * (badgeSize + 4), BADGE_MARGIN, maxY),
          w: badgeSize,
          h: badgeSize,
        };
        if (!placed.some((other) => doesOverlap(shiftedDown, other))) {
          chosenPos = shiftedDown;
          resolved = true;
          break;
        }

        // 2. Try shifting rightwards
        const shiftedRight = {
          x: clamp(chosenPos.x + offset * (badgeSize + 4), BADGE_MARGIN, maxX),
          y: clamp(chosenPos.y, BADGE_MARGIN, maxY),
          w: badgeSize,
          h: badgeSize,
        };
        if (!placed.some((other) => doesOverlap(shiftedRight, other))) {
          chosenPos = shiftedRight;
          resolved = true;
          break;
        }

        // 3. Try shifting upwards (if not at top edge)
        const shiftedUp = {
          x: clamp(chosenPos.x, BADGE_MARGIN, maxX),
          y: clamp(chosenPos.y - offset * (badgeSize + 4), BADGE_MARGIN, maxY),
          w: badgeSize,
          h: badgeSize,
        };
        if (!placed.some((other) => doesOverlap(shiftedUp, other))) {
          chosenPos = shiftedUp;
          resolved = true;
          break;
        }
      }
    }

    placed.push({
      matchId: match.id,
      number: num,
      x: chosenPos.x,
      y: chosenPos.y,
      w: badgeSize,
      h: badgeSize,
      focused: Boolean(match.focused),
    });
  }

  return placed;
}
