import { describe, it, expect, beforeEach } from 'vitest';
import { memoryTransport } from '../../src/shared/bus';
import { createHeadModule } from '../../src/sidepanel/vision';
import type { HeadEvent } from '../../src/shared/contract';

describe('Vision Module Integration (MemoryTransport)', () => {
  it('instantiates createHeadModule and handles commands and simulator events across transport bus', async () => {
    const [sidepanelBus, orchestratorBus] = memoryTransport();
    const handle = createHeadModule(sidepanelBus);

    const emittedEvents: HeadEvent[] = [];
    orchestratorBus.on('head.event', (evt) => {
      emittedEvents.push(evt);
    });

    // Enable simulator mode
    handle.setSimulatorActive(true);
    expect(handle.isSimulatorActive()).toBe(true);

    // Send a simulator keypress to emit nod
    handle.simulator.emit({ t: 'head.nod' });

    // Wait for microtask delivery on in-memory transport
    await new Promise((r) => setTimeout(r, 20));

    expect(emittedEvents).toContainEqual({ t: 'head.nod' });

    // Send head.setMode command from orchestrator side
    orchestratorBus.send('head.command', { t: 'head.setMode', mode: 'locked' });
    await new Promise((r) => setTimeout(r, 20));

    // Send head.tune command
    orchestratorBus.send('head.command', { t: 'head.tune', minCutoff: 2.0, beta: 0.01 });
    await new Promise((r) => setTimeout(r, 20));

    handle.tracker.stop();
  });
});
