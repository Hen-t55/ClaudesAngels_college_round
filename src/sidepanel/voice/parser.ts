import Fuse from 'fuse.js';
import type { Intent, Verb, TargetQuery } from '../../shared/contract';
import { parseNumberWord, parseOrdinal } from './numbers';

// Words to strip before grammar parsing
const FILLER_WORDS = new Set([
  'please', 'um', 'uh', 'ah', 'like', 'could', 'you', 'can', 'would', 'just', 'okay', 'ok',
  'the', 'a', 'an',
]);

const COLOR_WORDS = new Set([
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'black', 'white', 'gray', 'grey', 'pink', 'brown', 'cyan',
]);

const SIDE_WORDS: Record<string, 'left' | 'right' | 'top' | 'bottom' | 'middle'> = {
  left: 'left',
  right: 'right',
  top: 'top',
  bottom: 'bottom',
  middle: 'middle',
  center: 'middle',
};

const ROLE_WORDS: Record<string, TargetQuery['role']> = {
  button: 'button',
  buttons: 'button',
  btn: 'button',
  link: 'link',
  links: 'link',
  input: 'input',
  textbox: 'input',
  text: 'input',
  box: 'input',
  field: 'input',
  image: 'image',
  img: 'image',
  picture: 'image',
  photo: 'image',
  checkbox: 'checkbox',
  radio: 'checkbox',
};

// Spoken punctuation map for dictation mode
export const SPOKEN_PUNCTUATION: Record<string, string> = {
  'period': '.',
  'full stop': '.',
  'comma': ',',
  'question mark': '?',
  'exclamation mark': '!',
  'exclamation point': '!',
  'colon': ':',
  'semicolon': ';',
  'dash': '-',
  'hyphen': '-',
  'quote': '"',
  'unquote': '"',
  'open quote': '"',
  'close quote': '"',
  'apostrophe': "'",
  'open paren': '(',
  'close paren': ')',
  'open parenthesis': '(',
  'close parenthesis': ')',
  'new line': '\n',
  'newline': '\n',
  'next line': '\n',
  'new paragraph': '\n\n',
};

// Canonical commands dictionary for fuzzy matching
interface CommandDef {
  phrase: string;
  intent: Intent;
}

const CANONICAL_COMMANDS: CommandDef[] = [
  // Globals
  { phrase: 'scroll down', intent: { k: 'global', name: 'scroll_down' } },
  { phrase: 'scroll up', intent: { k: 'global', name: 'scroll_up' } },
  { phrase: 'scroll to top', intent: { k: 'global', name: 'scroll_top' } },
  { phrase: 'scroll top', intent: { k: 'global', name: 'scroll_top' } },
  { phrase: 'scroll to bottom', intent: { k: 'global', name: 'scroll_bottom' } },
  { phrase: 'scroll bottom', intent: { k: 'global', name: 'scroll_bottom' } },
  { phrase: 'back', intent: { k: 'global', name: 'back' } },
  { phrase: 'go back', intent: { k: 'global', name: 'back' } },
  { phrase: 'previous page', intent: { k: 'global', name: 'back' } },
  { phrase: 'forward', intent: { k: 'global', name: 'forward' } },
  { phrase: 'go forward', intent: { k: 'global', name: 'forward' } },
  { phrase: 'next page', intent: { k: 'global', name: 'forward' } },
  { phrase: 'reload', intent: { k: 'global', name: 'reload' } },
  { phrase: 'refresh', intent: { k: 'global', name: 'reload' } },
  { phrase: 'reload page', intent: { k: 'global', name: 'reload' } },
  { phrase: 'home', intent: { k: 'global', name: 'home' } },
  { phrase: 'go home', intent: { k: 'global', name: 'home' } },
  { phrase: 'new tab', intent: { k: 'global', name: 'new_tab' } },
  { phrase: 'open new tab', intent: { k: 'global', name: 'new_tab' } },
  { phrase: 'close tab', intent: { k: 'global', name: 'close_tab' } },
  { phrase: 'next tab', intent: { k: 'global', name: 'next_tab' } },
  { phrase: 'previous tab', intent: { k: 'global', name: 'prev_tab' } },
  { phrase: 'prev tab', intent: { k: 'global', name: 'prev_tab' } },

  // Controls
  { phrase: 'pause', intent: { k: 'control', name: 'pause' } },
  { phrase: 'pause tracking', intent: { k: 'control', name: 'pause' } },
  { phrase: 'resume', intent: { k: 'control', name: 'resume' } },
  { phrase: 'resume tracking', intent: { k: 'control', name: 'resume' } },
  { phrase: 'undo', intent: { k: 'control', name: 'undo' } },
  { phrase: 'cancel', intent: { k: 'control', name: 'cancel' } },
  { phrase: 'yes', intent: { k: 'control', name: 'yes' } },
  { phrase: 'confirm', intent: { k: 'control', name: 'yes' } },
  { phrase: 'no', intent: { k: 'control', name: 'no' } },
  { phrase: 'select', intent: { k: 'control', name: 'select' } },
  { phrase: 'hop mode', intent: { k: 'control', name: 'hop_mode' } },
  { phrase: 'voice mode', intent: { k: 'control', name: 'voice_mode' } },
  { phrase: 'show numbers', intent: { k: 'control', name: 'show_numbers' } },
  { phrase: 'numbers', intent: { k: 'control', name: 'show_numbers' } },
  { phrase: 'hide numbers', intent: { k: 'control', name: 'hide_numbers' } },
  { phrase: 'zoom', intent: { k: 'control', name: 'zoom' } },
  { phrase: 'zoom in', intent: { k: 'control', name: 'zoom' } },
  { phrase: 'zoom back', intent: { k: 'control', name: 'zoom_back' } },
  { phrase: 'click here', intent: { k: 'control', name: 'click_here' } },
  { phrase: 'start dictation', intent: { k: 'control', name: 'dictate_start' } },
  { phrase: 'dictate', intent: { k: 'control', name: 'dictate_start' } },
  { phrase: 'stop dictation', intent: { k: 'control', name: 'dictate_stop' } },
  { phrase: 'recenter', intent: { k: 'control', name: 'recenter' } },
  { phrase: 'help', intent: { k: 'control', name: 'help' } },
];

const fuse = new Fuse(CANONICAL_COMMANDS, {
  keys: ['phrase'],
  includeScore: true,
  threshold: 0.45,
  minMatchCharLength: 3,
});

/**
 * Normalizes input: lowercases, trims, and cleans filler words
 */
export function normalize(raw: string): string {
  let text = raw.toLowerCase().trim();
  text = text.replace(/[.,?!]+$/, '');

  const tokens = text.split(/\s+/).filter(Boolean);
  const filtered = tokens.filter((tok) => !FILLER_WORDS.has(tok));
  return filtered.join(' ');
}

/**
 * Transforms spoken dictation with punctuation handling & commands
 */
export function processDictationText(raw: string): { text: string; isDelete: boolean } {
  const norm = raw.trim().toLowerCase();
  if (norm === 'delete that' || norm === 'delete' || norm === 'backspace') {
    return { text: '', isDelete: true };
  }

  let text = raw;
  // Replace spoken line breaks first
  text = text.replace(/\b(?:new line|newline|next line)\b/gi, '\n');
  text = text.replace(/\b(?:new paragraph)\b/gi, '\n\n');

  // Replace punctuation phrases
  for (const [spoken, punct] of Object.entries(SPOKEN_PUNCTUATION)) {
    if (punct.includes('\n')) continue;
    const re = new RegExp(`\\b${spoken}\\b`, 'gi');
    text = text.replace(re, punct);
  }

  // Clean up space before punctuation marks and clean whitespace around newlines
  text = text.replace(/\s+([.,?!:;])/g, '$1');
  text = text.replace(/[ \t]*\n[ \t]*/g, '\n');
  return { text: text.trim(), isDelete: false };
}

/**
 * Checks if a partial/interim transcript is a stable, safe global command
 */
export function isSafeInterimGlobal(text: string): boolean {
  const clean = normalize(text);
  const safe = [
    'scroll down', 'scroll up', 'scroll top', 'scroll bottom',
    'pause', 'resume', 'stop', 'cancel',
  ];
  return safe.includes(clean);
}

/**
 * Parses normalized text into an Intent
 */
export function parseIntent(raw: string, options: { mode?: 'command' | 'dictation' } = {}): Intent | null {
  const mode = options.mode || 'command';

  if (mode === 'dictation') {
    const norm = raw.trim().toLowerCase();
    if (norm === 'stop dictation' || norm === 'end dictation' || norm === 'exit dictation') {
      return { k: 'control', name: 'dictate_stop' };
    }
    const processed = processDictationText(raw);
    if (processed.isDelete) {
      return { k: 'control', name: 'undo' };
    }
    return { k: 'dictation', text: processed.text, final: true };
  }

  const text = normalize(raw);
  if (!text) return null;

  // 1. Direct number check (e.g. "three", "4", "badge four", "number 5")
  const numPrefixMatch = text.match(/^(?:number|badge|item|option)\s+(.+)$/);
  const candidateNum = numPrefixMatch ? numPrefixMatch[1] : text;
  const parsedNum = parseNumberWord(candidateNum);
  if (parsedNum !== null) {
    return { k: 'number', n: parsedNum };
  }

  // 2. Control commands
  if (text === 'pause' || text === 'pause tracking') return { k: 'control', name: 'pause' };
  if (text === 'resume' || text === 'resume tracking') return { k: 'control', name: 'resume' };
  if (text === 'undo') return { k: 'control', name: 'undo' };
  if (text === 'cancel') return { k: 'control', name: 'cancel' };
  if (text === 'yes' || text === 'confirm' || text === 'yep' || text === 'yeah' || text === 'ok') return { k: 'control', name: 'yes' };
  if (text === 'no' || text === 'nope' || text === 'reject') return { k: 'control', name: 'no' };
  if (text === 'select' || text === 'choose') return { k: 'control', name: 'select' };
  if (text === 'hop mode' || text === 'hop gear' || text === 'switch to hop') return { k: 'control', name: 'hop_mode' };
  if (text === 'voice mode' || text === 'voice gear' || text === 'switch to voice') return { k: 'control', name: 'voice_mode' };
  if (text === 'show numbers' || text === 'numbers' || text === 'badges') return { k: 'control', name: 'show_numbers' };
  if (text === 'hide numbers' || text === 'clear numbers' || text === 'no numbers') return { k: 'control', name: 'hide_numbers' };
  if (text === 'zoom' || text === 'zoom in' || text === 'grid') return { k: 'control', name: 'zoom' };
  if (text === 'zoom back' || text === 'zoom out' || text === 'unzoom') return { k: 'control', name: 'zoom_back' };
  if (text === 'click here' || text === 'click center' || text === 'center click') return { k: 'control', name: 'click_here' };
  if (text === 'start dictation' || text === 'dictate' || text === 'begin dictation') return { k: 'control', name: 'dictate_start' };
  if (text === 'stop dictation' || text === 'end dictation') return { k: 'control', name: 'dictate_stop' };
  if (text === 'recenter' || text === 'center head') return { k: 'control', name: 'recenter' };
  if (text === 'help' || text === 'show help' || text === 'what can i say') return { k: 'control', name: 'help' };

  // 3. Global navigation commands
  if (text === 'scroll down' || text === 'page down') return { k: 'global', name: 'scroll_down' };
  if (text === 'scroll up' || text === 'page up') return { k: 'global', name: 'scroll_up' };
  if (text === 'scroll top' || text === 'scroll to top' || text === 'top of page') return { k: 'global', name: 'scroll_top' };
  if (text === 'scroll bottom' || text === 'scroll to bottom' || text === 'bottom of page') return { k: 'global', name: 'scroll_bottom' };
  if (text === 'back' || text === 'go back' || text === 'previous page' || text === 'prev page') return { k: 'global', name: 'back' };
  if (text === 'forward' || text === 'go forward' || text === 'next page') return { k: 'global', name: 'forward' };
  if (text === 'reload' || text === 'refresh' || text === 'reload page') return { k: 'global', name: 'reload' };
  if (text === 'home' || text === 'go home') return { k: 'global', name: 'home' };
  if (text === 'new tab' || text === 'open tab' || text === 'open new tab') return { k: 'global', name: 'new_tab' };
  if (text === 'close tab' || text === 'close this tab') return { k: 'global', name: 'close_tab' };
  if (text === 'next tab') return { k: 'global', name: 'next_tab' };
  if (text === 'previous tab' || text === 'prev tab') return { k: 'global', name: 'prev_tab' };

  // Tab N (e.g. "tab 2", "tab two", "switch to tab 3")
  const tabMatch = text.match(/^(?:switch to\s+)?tab\s+(.+)$/);
  if (tabMatch) {
    const n = parseNumberWord(tabMatch[1]);
    if (n !== null) {
      return { k: 'global', name: 'tab_n', n };
    }
  }

  // Go to website / url (e.g. "go to google.com", "open youtube.com")
  const gotoMatch = text.match(/^(?:go to|goto|open|navigate to)\s+([a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?)$/);
  if (gotoMatch) {
    return { k: 'global', name: 'go_to', url: gotoMatch[1] };
  }

  // 4. Typing command: "type <text> in [the] <field>" OR "type <text>"
  const typeInMatch = text.match(/^type\s+(.+?)\s+(?:in|into)(?:\s+the)?\s+(.+)$/);
  if (typeInMatch) {
    return { k: 'type', text: typeInMatch[1].trim(), field: typeInMatch[2].trim() };
  }
  const typeDirectMatch = text.match(/^type\s+(.+)$/);
  if (typeDirectMatch && !typeDirectMatch[1].startsWith('mode')) {
    return { k: 'type', text: typeDirectMatch[1].trim() };
  }

  // 5. Target query verbs: click, double click, right click, open, focus, search
  const verbs: { prefix: string; verb: Verb }[] = [
    { prefix: 'double click', verb: 'double_click' },
    { prefix: 'right click', verb: 'right_click' },
    { prefix: 'click', verb: 'click' },
    { prefix: 'open', verb: 'open' },
    { prefix: 'focus', verb: 'focus' },
    { prefix: 'search for', verb: 'search' },
    { prefix: 'search', verb: 'search' },
  ];

  for (const { prefix, verb } of verbs) {
    if (text.startsWith(prefix)) {
      const rest = text.slice(prefix.length).trim();

      // If search with text
      if (verb === 'search') {
        if (!rest) {
          return { k: 'target', verb: 'search', query: { raw: text, role: 'input' } };
        }
        return {
          k: 'target',
          verb: 'search',
          searchText: rest,
          query: { raw: rest, text: rest, role: 'input' },
        };
      }

      // Parse target details: color, role, nth, side, text
      const targetQuery = parseTargetQuery(rest);
      return {
        k: 'target',
        verb,
        query: { ...targetQuery, raw: targetQuery.raw || rest || prefix },
      };
    }
  }

  // 6. Fuzzy matching fallback with Fuse.js for command near-misses
  const fuzzyResults = fuse.search(text);
  if (fuzzyResults.length > 0 && fuzzyResults[0].score !== undefined && fuzzyResults[0].score <= 0.45) {
    return fuzzyResults[0].item.intent;
  }

  return null;
}

/**
 * Extracts structured properties from target phrase (e.g. "the second blue button on the left")
 */
function parseTargetQuery(phrase: string): TargetQuery {
  let tokens = phrase.split(/\s+/).filter(Boolean);
  // Strip leading 'the', 'a', 'an'
  while (tokens.length > 0 && ['the', 'a', 'an', 'that', 'this', 'on'].includes(tokens[0])) {
    tokens.shift();
  }

  const rawClean = tokens.join(' ');
  let nth: number | undefined;
  let last: boolean | undefined;
  let side: TargetQuery['side'] | undefined;
  let color: string | undefined;
  let role: TargetQuery['role'] | undefined;

  const remainingTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok === 'on' || tok === 'the') {
      continue;
    }

    // Check ordinal
    const ord = parseOrdinal(tok);
    if (ord !== null && nth === undefined) {
      nth = ord;
      continue;
    }

    if (tok === 'last') {
      last = true;
      continue;
    }

    // Check side
    if (SIDE_WORDS[tok] !== undefined && side === undefined) {
      side = SIDE_WORDS[tok];
      continue;
    }

    // Check color
    if (COLOR_WORDS.has(tok) && color === undefined) {
      color = tok;
      continue;
    }

    // Check role
    if (ROLE_WORDS[tok] !== undefined && role === undefined) {
      role = ROLE_WORDS[tok];
      continue;
    }

    remainingTokens.push(tok);
  }

  const text = remainingTokens.join(' ').trim() || undefined;

  const result: TargetQuery = {
    raw: rawClean,
  };
  if (text !== undefined) result.text = text;
  if (role !== undefined) result.role = role;
  if (nth !== undefined) result.nth = nth;
  if (last !== undefined) result.last = last;
  if (side !== undefined) result.side = side;
  if (color !== undefined) result.color = color;

  return result;
}
