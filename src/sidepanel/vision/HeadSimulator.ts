import type { HeadEvent, Quadrant, Dir } from '../../shared/contract';

export class HeadSimulator {
  private enabled = false;
  private listeners: Set<(evt: HeadEvent) => void> = new Set();
  private facingState = true;
  private activeQuadrant: Quadrant | null = null;

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;

    // Ignore if typing in an input or textarea
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    const key = e.key.toLowerCase();

    // Quadrant selection: Q, E, Z, C
    if (key === 'q') {
      this.setQuadrant('TL');
    } else if (key === 'e') {
      this.setQuadrant('TR');
    } else if (key === 'z') {
      this.setQuadrant('BL');
    } else if (key === 'c') {
      this.setQuadrant('BR');
    }
    // Flicks: Arrow keys
    else if (e.key === 'ArrowUp') {
      this.emit({ t: 'head.flick', dir: 'up' });
    } else if (e.key === 'ArrowDown') {
      this.emit({ t: 'head.flick', dir: 'down' });
    } else if (e.key === 'ArrowLeft') {
      this.emit({ t: 'head.flick', dir: 'left' });
    } else if (e.key === 'ArrowRight') {
      this.emit({ t: 'head.flick', dir: 'right' });
    }
    // Gestures: N = Nod, X = Shake
    else if (key === 'n') {
      this.emit({ t: 'head.nod' });
    } else if (key === 'x') {
      this.emit({ t: 'head.shake' });
    }
    // Facing / Look-away toggle: L
    else if (key === 'l') {
      this.facingState = !this.facingState;
      this.emit({ t: 'head.facing', facing: this.facingState });
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.enabled) return;

    const winW = window.innerWidth || 1;
    const winH = window.innerHeight || 1;

    const x = Math.max(0, Math.min(1, e.clientX / winW));
    const y = Math.max(0, Math.min(1, e.clientY / winH));

    this.emit({ t: 'head.pointer', x, y });
  };

  public enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('mousemove', this.handleMouseMove);
  }

  public disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public onEvent(callback: (evt: HeadEvent) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public emit(evt: HeadEvent): void {
    for (const listener of this.listeners) {
      listener(evt);
    }
  }

  private setQuadrant(q: Quadrant): void {
    this.activeQuadrant = q;
    this.emit({ t: 'head.quadrant', q: this.activeQuadrant, stable: true });
  }
}
