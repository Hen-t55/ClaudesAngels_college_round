import type { Dir } from '../../shared/contract';
import type { IndexedElement } from './types';

/**
 * HopNavigator handles 2D spatial navigation among current matches:
 * Computes direction cone (angular penalty) plus euclidean distance.
 */
export class HopNavigator {
  private matches: IndexedElement[] = [];
  private focusedIndex = -1;

  public setMatches(matches: IndexedElement[]): void {
    this.matches = [...matches];
    this.focusedIndex = this.matches.length > 0 ? 0 : -1;
  }

  public getFocusedMatch(): IndexedElement | undefined {
    if (this.focusedIndex >= 0 && this.focusedIndex < this.matches.length) {
      return this.matches[this.focusedIndex];
    }
    return undefined;
  }

  public getFocusedIndex(): number {
    return this.focusedIndex;
  }

  public setFocusIndex(index: number): void {
    if (index >= 0 && index < this.matches.length) {
      this.focusedIndex = index;
    }
  }

  public setFocusById(matchId: string): void {
    const idx = this.matches.findIndex((m) => m.id === matchId);
    if (idx !== -1) {
      this.focusedIndex = idx;
    }
  }

  /**
   * Move focus in given direction ('up' | 'down' | 'left' | 'right')
   * Uses spatial cone and distance + angular penalty.
   */
  public hop(dir: Dir): IndexedElement | undefined {
    if (this.matches.length <= 1 || this.focusedIndex < 0) {
      return this.getFocusedMatch();
    }

    const current = this.matches[this.focusedIndex];
    const targetVector = HopNavigator.getDirectionVector(dir);

    let bestMatchIndex = -1;
    let minScore = Infinity;

    for (let i = 0; i < this.matches.length; i++) {
      if (i === this.focusedIndex) continue;
      const candidate = this.matches[i];

      const dx = candidate.center.x - current.center.x;
      const dy = candidate.center.y - current.center.y;
      const dist = Math.hypot(dx, dy);

      if (dist === 0) continue;

      // Normalize candidate direction vector
      const nx = dx / dist;
      const ny = dy / dist;

      // Dot product: cos(theta) between desired direction and candidate vector
      const dot = nx * targetVector.x + ny * targetVector.y;

      // Candidate must be in the general forward half-plane (dot > 0, angle < 90 deg)
      if (dot > 0.1) {
        // Angular penalty: penalty increases as direction diverges from target vector
        const anglePenalty = (1 - dot) * 300;
        const totalScore = dist + anglePenalty;

        if (totalScore < minScore) {
          minScore = totalScore;
          bestMatchIndex = i;
        }
      }
    }

    // Fallback: If no candidate in cone, wrap around cyclically
    if (bestMatchIndex === -1) {
      if (dir === 'right' || dir === 'down') {
        bestMatchIndex = (this.focusedIndex + 1) % this.matches.length;
      } else {
        bestMatchIndex = (this.focusedIndex - 1 + this.matches.length) % this.matches.length;
      }
    }

    this.focusedIndex = bestMatchIndex;
    return this.matches[bestMatchIndex];
  }

  private static getDirectionVector(dir: Dir): { x: number; y: number } {
    switch (dir) {
      case 'right':
        return { x: 1, y: 0 };
      case 'left':
        return { x: -1, y: 0 };
      case 'down':
        return { x: 0, y: 1 };
      case 'up':
        return { x: 0, y: -1 };
    }
  }
}
