// Orchestrator stub (P3 — will implement state machine).
import type { Transport } from '../../shared/bus';

export interface OrchestratorDeps {
  transport: Transport;
}

export function startOrchestrator(deps: OrchestratorDeps): void {
  console.log('[orchestrator] stub loaded');
  // P3 will implement the SETUP->IDLE->AIMING->… state machine here.
}
