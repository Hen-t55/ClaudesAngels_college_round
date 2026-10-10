import type { Transport } from '../../shared/bus';
import type { EngineRequest, MatchMeta, Scope } from '../../shared/contract';
import { DomIndexer } from './dom-indexer';
import { matchesFilter, applyPositionalFilters } from './filter';

export class Engine {
  private indexer: DomIndexer;
  private transport: Transport | null = null;

  constructor(transport?: Transport) {
    this.indexer = new DomIndexer();
    if (transport) {
      this.attachTransport(transport);
    }
  }

  public getIndexer(): DomIndexer {
    return this.indexer;
  }

  public attachTransport(transport: Transport): void {
    this.transport = transport;

    transport.on('engine.request', (req: EngineRequest) => {
      this.handleRequest(req);
    });

    transport.send('engine.event', {
      t: 'engine.ready',
      url: typeof location !== 'undefined' ? location.href : '',
    });
  }

  public handleRequest(req: EngineRequest): void {
    if (req.t === 'engine.resolve') {
      const results = this.resolve(req.query, req.scope);
      const matches: MatchMeta[] = results.map((r, i) => ({
        id: r.id,
        label: r.label,
        role: r.role,
        rect: r.rect,
        number: i + 1,
      }));

      const status = matches.length === 1 ? 'one' : matches.length > 1 ? 'many' : 'none';

      this.transport?.send('engine.event', {
        t: 'engine.result',
        id: req.id,
        status,
        matches,
      });
    } else if (req.t === 'engine.showNumbers') {
      const indexed = this.resolve({ raw: '' }, req.scope);
      const matches: MatchMeta[] = indexed.map((r, i) => ({
        id: r.id,
        label: r.label,
        role: r.role,
        rect: r.rect,
        number: i + 1,
      }));
      this.transport?.send('engine.event', {
        t: 'engine.result',
        id: 'show_numbers',
        status: matches.length > 0 ? 'many' : 'none',
        matches,
      });
    }
  }

  public resolve(query: { raw?: string; text?: string; role?: any; nth?: number; last?: boolean; side?: any; color?: string }, scope?: Scope) {
    let items = this.indexer.index();

    if (scope) {
      if (scope.k === 'quadrant') {
        items = items.filter((it) => it.quadrant === scope.q);
      } else if (scope.k === 'rect') {
        const { x, y, w, h } = scope.rect;
        items = items.filter(
          (it) =>
            it.center.x >= x &&
            it.center.x <= x + w &&
            it.center.y >= y &&
            it.center.y <= y + h
        );
      }
    }

    // Filter by text/role/color
    let filtered = items.filter((it) => matchesFilter(it, query as any));

    // Filter by positional attributes (side, nth, last)
    filtered = applyPositionalFilters(filtered, query as any);

    return filtered;
  }

  public destroy(): void {
    this.indexer.destroy();
  }
}

export function startEngine(transport: Transport): Engine {
  return new Engine(transport);
}
