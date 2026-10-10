import type { Transport } from '../../shared/bus';
import type { HeadCommand, HeadEvent } from '../../shared/contract';
import { HeadTracker } from './HeadTracker';
import { HeadSimulator } from './HeadSimulator';

export interface VisionModuleHandle {
  tracker: HeadTracker;
  simulator: HeadSimulator;
  setSimulatorActive: (active: boolean) => void;
  isSimulatorActive: () => boolean;
}

let activeHandle: VisionModuleHandle | null = null;

export function getActiveVisionHandle(): VisionModuleHandle | null {
  return activeHandle;
}

export function createHeadModule(transport: Transport): VisionModuleHandle {
  const tracker = new HeadTracker();
  const simulator = new HeadSimulator();

  let useSimulator = false;

  const handleEvent = (evt: HeadEvent) => {
    transport.send('head.event', evt);
  };

  // Wire event emitters
  tracker.onEvent((evt) => {
    if (!useSimulator) {
      handleEvent(evt);
    }
  });

  simulator.onEvent((evt) => {
    if (useSimulator) {
      handleEvent(evt);
    }
  });

  // Wire command receiver
  transport.on('head.command', (cmd: HeadCommand) => {
    switch (cmd.t) {
      case 'head.setMode':
        tracker.setMode(cmd.mode);
        break;
      case 'head.recenter':
        tracker.recenter();
        break;
      case 'head.tune':
        tracker.setFilterParams(cmd.minCutoff, cmd.beta);
        break;
      case 'head.impairment':
        tracker.setImpairment(cmd.cfg);
        break;
      case 'head.startSetup':
        // Setup sequence trigger
        tracker.recenter();
        transport.send('head.event', {
          t: 'head.setup',
          step: 'neutral',
          progress: 0.5,
          prompt: 'Keep your head facing the center of the screen',
        });
        break;
    }
  });

  const handle: VisionModuleHandle = {
    tracker,
    simulator,
    setSimulatorActive(active: boolean) {
      useSimulator = active;
      if (useSimulator) {
        simulator.enable();
      } else {
        simulator.disable();
      }
    },
    isSimulatorActive() {
      return useSimulator;
    },
  };

  activeHandle = handle;
  return handle;
}

export { HeadTracker, HeadSimulator };
export { OneEuroFilter } from './OneEuroFilter';
