// Test mocks for HeadModule (P1) and ActionEngine (P2) using Transport
import type { Transport } from '../../shared/bus';
import type {
  HeadEvent,
  HeadCommand,
  EngineRequest,
  EngineEvent,
  MatchMeta,
  Scope,
  Quadrant,
  Dir,
} from '../../shared/contract';

export interface MockHeadModule {
  sendPointer(x: number, y: number): void;
  sendQuadrant(q: Quadrant | null, stable?: boolean): void;
  sendFlick(dir: Dir): void;
  sendNod(): void;
  sendShake(): void;
  sendFacing(facing: boolean): void;
  getMode(): string;
  destroy(): void;
}

export function createMockHead(transport: Transport): MockHeadModule {
  let mode = 'quadrant';

  const unbind = transport.on('head.command', (cmd) => {
    if (cmd.t === 'head.setMode') {
      mode = cmd.mode;
    }
  });

  return {
    sendPointer(x: number, y: number) {
      transport.send('head.event', { t: 'head.pointer', x, y });
    },
    sendQuadrant(q: Quadrant | null, stable = true) {
      transport.send('head.event', { t: 'head.quadrant', q, stable });
    },
    sendFlick(dir: Dir) {
      transport.send('head.event', { t: 'head.flick', dir });
    },
    sendNod() {
      transport.send('head.event', { t: 'head.nod' });
    },
    sendShake() {
      transport.send('head.event', { t: 'head.shake' });
    },
    sendFacing(facing: boolean) {
      transport.send('head.event', { t: 'head.facing', facing });
    },
    getMode() {
      return mode;
    },
    destroy() {
      unbind();
    },
  };
}

export interface MockEngineConfig {
  resolveHandler?: (req: Extract<EngineRequest, { t: 'engine.resolve' }>) => void;
}

export interface MockEngineModule {
  lastRequest: EngineRequest | null;
  requests: EngineRequest[];
  simulateResolveResult(
    id: string,
    status: 'one' | 'many' | 'none',
    matches: MatchMeta[],
    widened?: boolean
  ): void;
  simulateConfirmNeeded(actionId: string, description: string): void;
  simulateDone(ok: boolean, what: string): void;
  simulateZoomState(depth: number, outcome?: 'clicked' | 'many' | 'center'): void;
  setResolveBehavior(
    behavior: (req: Extract<EngineRequest, { t: 'engine.resolve' }>) => void
  ): void;
  destroy(): void;
}

export function createMockEngine(
  transport: Transport,
  config: MockEngineConfig = {}
): MockEngineModule {
  const requests: EngineRequest[] = [];
  let customResolve = config.resolveHandler;

  const unbind = transport.on('engine.request', (req) => {
    requests.push(req);
    if (req.t === 'engine.resolve' && customResolve) {
      customResolve(req);
    }
  });

  return {
    get lastRequest() {
      return requests[requests.length - 1] || null;
    },
    requests,
    simulateResolveResult(id, status, matches, widened = false) {
      transport.send('engine.event', {
        t: 'engine.result',
        id,
        status,
        matches,
        widened,
      });
    },
    simulateConfirmNeeded(actionId, description) {
      transport.send('engine.event', {
        t: 'engine.confirmNeeded',
        actionId,
        info: { reason: 'other', description },
      });
    },
    simulateDone(ok, what) {
      transport.send('engine.event', { t: 'engine.done', ok, what });
    },
    simulateZoomState(depth, outcome) {
      transport.send('engine.event', {
        t: 'engine.zoomState',
        depth,
        outcome,
        rect: { x: 0, y: 0, w: 100, h: 100 },
        cells: [
          { n: 1, rect: { x: 0, y: 0, w: 33, h: 33 } },
          { n: 2, rect: { x: 33, y: 0, w: 33, h: 33 } },
        ],
      });
    },
    setResolveBehavior(behavior) {
      customResolve = behavior;
    },
    destroy() {
      unbind();
    },
  };
}
