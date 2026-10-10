// SOURCE OF TRUTH. Changes only via P3.
export type Quadrant = 'TL' | 'TR' | 'BL' | 'BR';
export type Gear = 'hop' | 'voice';
export type Dir = 'up' | 'down' | 'left' | 'right';
export type Phase = 'SETUP'|'IDLE'|'AIMING'|'LOCKED'|'RESOLVING'|'DISAMBIGUATE'|'ZOOM'|'CONFIRM'|'DICTATION'|'PAUSED';
export interface Rect { x: number; y: number; w: number; h: number } // CSS px, viewport coords

// ---------- Head (P1 -> orchestrator) ----------
export type HeadEvent =
  | { t: 'head.pointer'; x: number; y: number }                // 0..1, relative, filtered
  | { t: 'head.quadrant'; q: Quadrant | null; stable: boolean }
  | { t: 'head.flick'; dir: Dir }
  | { t: 'head.nod' } | { t: 'head.shake' }
  | { t: 'head.facing'; facing: boolean }                       // false = look-away or face lost
  | { t: 'head.quality'; jitter: number; brightness: number; faceConf: number; fps: number }
  | { t: 'head.setup'; step: 'neutral'|'corners'|'done'; progress: number; prompt: string; ok?: boolean };

export type HeadMode = 'quadrant' | 'locked' | 'off'; // gestures + look-away stay active unless 'off'
export interface ImpairmentConfig { seed: number; tremorAmp: number; tremorHz: [number, number]; brightness: number; dropFramePct: number }
export type HeadCommand =
  | { t: 'head.setMode'; mode: HeadMode }
  | { t: 'head.recenter' }
  | { t: 'head.startSetup' }
  | { t: 'head.impairment'; cfg: ImpairmentConfig | null }
  | { t: 'head.tune'; minCutoff?: number; beta?: number; gain?: number; deadzone?: number };

// ---------- Voice (P3) ----------
export interface TargetQuery {
  raw: string; text?: string;
  role?: 'button'|'link'|'input'|'image'|'checkbox'|'any';
  nth?: number; last?: boolean; side?: 'left'|'right'|'top'|'bottom'|'middle'; color?: string;
}
export type Verb = 'click'|'double_click'|'right_click'|'open'|'focus'|'search';
export type GlobalName = 'scroll_down'|'scroll_up'|'scroll_top'|'scroll_bottom'|'back'|'forward'|'reload'|'home'
  |'new_tab'|'close_tab'|'next_tab'|'prev_tab'|'tab_n'|'go_to';
export type ControlName = 'pause'|'resume'|'undo'|'cancel'|'yes'|'no'|'select'|'hop_mode'|'voice_mode'
  |'show_numbers'|'hide_numbers'|'zoom'|'zoom_back'|'click_here'|'dictate_start'|'dictate_stop'|'recenter'|'help';
export type Intent =
  | { k: 'global'; name: GlobalName; n?: number; url?: string }
  | { k: 'control'; name: ControlName }
  | { k: 'number'; n: number }
  | { k: 'target'; verb: Verb; query: TargetQuery; searchText?: string }
  | { k: 'type'; text: string; field?: string }
  | { k: 'dictation'; text: string; final: boolean };
export type SpeechEvent =
  | { t: 'speech.onset' }                                       // first audio/interim of an utterance -> lock quadrant
  | { t: 'speech.result'; text: string; final: boolean; confidence: number }
  | { t: 'speech.level'; noiseFloor: number; level: number };

// ---------- Engine (orchestrator <-> content script, P2) ----------
export type Scope = { k: 'quadrant'; q: Quadrant } | { k: 'page' } | { k: 'rect'; rect: Rect };
export interface Important { reason: 'close_tab'|'form_submit'|'purchase'|'delete'|'send'|'sign_out'|'other'; description: string }
export interface MatchMeta { id: string; label: string; role: string; rect: Rect; number?: number; important?: Important }
export type EngineRequest =
  | { t: 'engine.resolve'; id: string; verb: Verb; query: TargetQuery; scope: Scope }
  | { t: 'engine.activate'; id: string; matchId: string; verb: Verb; confirmed?: boolean }
  | { t: 'engine.hop'; dir: Dir }                               // move focus among current matches
  | { t: 'engine.showNumbers'; scope: Scope }
  | { t: 'engine.zoom'; op: { k: 'start'; scope: Scope } | { k: 'pick'; n: number } | { k: 'back' } | { k: 'click' } }
  | { t: 'engine.global'; name: 'scroll_down'|'scroll_up'|'scroll_top'|'scroll_bottom'; scope?: Scope }
  | { t: 'engine.type'; text: string; field?: string; mode: 'fill' | 'insert' }
  | { t: 'engine.key'; key: 'Enter'|'Tab'|'Backspace'|'SelectAll'|'DeleteWord'|'DeleteSentence' }
  | { t: 'engine.undo' }
  | { t: 'engine.confirm'; actionId: string; accept: boolean }
  | { t: 'engine.clear' };
export type EngineEvent =
  | { t: 'engine.result'; id: string; status: 'one'|'many'|'none'; matches: MatchMeta[]; widened?: boolean; done?: boolean }
  | { t: 'engine.focus'; matchId: string }
  | { t: 'engine.zoomState'; rect: Rect; cells: { n: number; rect: Rect }[]; depth: number; outcome?: 'clicked'|'many'|'center' }
  | { t: 'engine.confirmNeeded'; actionId: string; info: Important }
  | { t: 'engine.done'; ok: boolean; what: string }
  | { t: 'engine.ready'; url: string };

// ---------- Overlay (orchestrator -> P4) ----------
export interface OverlayState {
  phase: Phase; gear: Gear; gearReason?: string; paused: boolean; listening: boolean;
  quadrant: Quadrant | null; quadrantLocked: boolean; headDot?: { x: number; y: number };
  matches: { id: string; rect: Rect; number?: number; focused?: boolean }[];
  showNumbers: boolean;
  zoom?: { rect: Rect; cells: { n: number; rect: Rect }[]; depth: number };
  banner?: { kind: 'confirm'|'info'|'error'; text: string; timeoutMs?: number };
  transcript?: string;
}

// ---------- Telemetry (any -> P4 benchmark) ----------
export interface Telemetry {
  session: string; system: 'mouse'|'naive'|'handsfree'; task: string; level: 0|1|2; trial: number;
  event: string; ts: number; target?: string; correct?: boolean; extra?: Record<string, unknown>;
}
