# Handsfree: Project Brief (source of truth for the workflow)

Chrome MV3 extension: browse any site with head + voice, no mouse or keyboard after setup. All vision is on-device.

## Team and folders
- P1 Head input: src/sidepanel/vision/, dev/vision/, tests/vision/, public/mediapipe/
- P2 Resolver and action engine: src/content/engine/, dev/engine/, tests/engine/
- P3 Voice, orchestrator, shell, integration lead: src/shared/, src/sidepanel/voice/, src/sidepanel/orchestrator/, src/sidepanel/main.tsx, src/content/index.ts, src/background/, dev/voice/, build, manifest and package config
- P4 Overlay, UI, evaluation, demo: src/content/overlay/, src/sidepanel/ui/, src/benchmark/, dev/overlay/, demo/
Only edit your own folders. Contract changes are requested from P3.

## Module entry points (agreed names)
- createHeadModule(transport) in src/sidepanel/vision/index.ts (P1): accepts HeadCommand, emits HeadEvent.
- startEngine(transport) in src/content/engine/index.ts (P2): accepts EngineRequest, emits EngineEvent.
- mountOverlay(transport) in src/content/overlay/index.ts (P4): renders OverlayState.
- App in src/sidepanel/ui/App.tsx (P4): the side panel UI.
- startOrchestrator(deps) in src/sidepanel/orchestrator/index.ts (P3): the state machine; broadcasts OverlayState.
- Transport and an in-memory transport live in src/shared/bus.ts (P3).
- src/sidepanel/main.tsx (P3) mounts App and starts the head module, speech and the orchestrator. src/content/index.ts (P3) starts the engine and the overlay.

## Workflow
1. Global commands need no quadrant: scroll up/down/top/bottom, previous page (back), forward, reload, home, tab commands, pause/resume, undo.
2. Quadrant by head: the viewport is 2x2 quadrants (TL, TR, BL, BR). Head pose (One Euro filtered, hysteresis plus a short stability dwell) highlights one quadrant; the others are dimmed. A small head dot shows the pointer (optional).
3. Voice command (click, double click, search, type, open, focus...) -> speech-to-text -> parser -> resolver. When speech starts (onset), the quadrant LOCKS: head QUADRANT tracking stops. The camera, flick, nod, shake and look-away stay on.
4. The resolver returns DOM matches in scope: ONE -> act. MANY -> disambiguate with the 2-gear shifter. NONE -> fallback ladder.
5. Shifter (2 gears): HOP = matches highlighted, flick the head up/down/left/right to move focus among matches, nod or the word select activates. VOICE = matches get numbers, say the number. Switch with the commands hop mode / voice mode or a hotkey. Auto-suggest from quality signals (loud noise or low speech confidence -> hop; high head jitter -> voice): shift down after 3 s of bad signal, up after 10 s of good, never mid-action, always show the reason. A manual choice pins the gear.
6. Confirmation: routine actions fire immediately, no prompt. Important actions need confirmation (yes or a nod; no, a shake or 5 s of silence cancels): close tab/window, multi-field form submit (checkout, login, contact), purchase/pay, delete/remove, send/post, sign out. Search-box submissions are routine. Choosing a badge number selects the target only; an important action still asks.
7. After the action completes or is cancelled, quadrant tracking re-arms.

## Fallback ladder (never stuck)
voice description -> numbered badges on matches only -> widen scope to the whole page -> show numbers (all clickables in scope, capped) -> recursive zoom grid (3x3 numbered; a number narrows, back goes up, click acts: one element = click it, several = badges, none = click the exact center via elementFromPoint) -> raw center click.

## Other features
Voice typing by field name (type hello in the search box) and plain dictation into the focused field (command mode and dictation mode are separate; spoken punctuation); look-away auto-pause; nod = yes, shake = no; short undo log; about 20 s setup (neutral pose, four corners for gain, quiet for the noise floor); keyboard simulation of head events (demo fallback); Chaos Lab evaluation (seeded tremor / low light / noise; systems: mouse+keyboard, naive head cursor + dwell, Handsfree; ablations).
Stretch: Scan gear, Hinglish (en-IN), voice macros, read this quadrant (speechSynthesis), AI fallback for fuzzy phrases, offline Whisper.

## States
SETUP -> IDLE <-> AIMING -> LOCKED -> RESOLVING -> (ACT | DISAMBIGUATE[hop|voice] | ZOOM | CONFIRM) -> AIMING. DICTATION and PAUSED can interrupt.

## Budgets
Tracking >= 30 FPS; head -> quadrant highlight < 100 ms; final speech -> action < 700 ms (excluding speech-to-text); setup <= 30 s.

## Rules
TypeScript strict. No remote code (MV3). No secrets in git. Only edit your own folders. Nobody except P3 edits package.json, the manifest or build config.
