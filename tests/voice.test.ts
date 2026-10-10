import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseIntent, normalize, processDictationText, isSafeInterimGlobal } from '../src/sidepanel/voice/parser';
import { parseNumberWord, parseOrdinal } from '../src/sidepanel/voice/numbers';
import { SpeechModule } from '../src/sidepanel/voice/speech';
import { memoryTransport } from '../src/shared/bus';
import type { Intent, SpeechEvent } from '../src/shared/contract';

describe('Voice Parser Utterances Suite (>= 80 utterances)', () => {
  // 1. Numbers and Ordinals (15 tests)
  describe('Numbers and Ordinals', () => {
    it('parses digit numbers', () => {
      expect(parseIntent('1')).toEqual({ k: 'number', n: 1 });
      expect(parseIntent('7')).toEqual({ k: 'number', n: 7 });
      expect(parseIntent('42')).toEqual({ k: 'number', n: 42 });
    });

    it('parses number words zero through nineteen', () => {
      expect(parseIntent('zero')).toEqual({ k: 'number', n: 0 });
      expect(parseIntent('one')).toEqual({ k: 'number', n: 1 });
      expect(parseIntent('two')).toEqual({ k: 'number', n: 2 });
      expect(parseIntent('three')).toEqual({ k: 'number', n: 3 });
      expect(parseIntent('four')).toEqual({ k: 'number', n: 4 });
      expect(parseIntent('five')).toEqual({ k: 'number', n: 5 });
      expect(parseIntent('six')).toEqual({ k: 'number', n: 6 });
      expect(parseIntent('seven')).toEqual({ k: 'number', n: 7 });
      expect(parseIntent('eight')).toEqual({ k: 'number', n: 8 });
      expect(parseIntent('nine')).toEqual({ k: 'number', n: 9 });
      expect(parseIntent('ten')).toEqual({ k: 'number', n: 10 });
      expect(parseIntent('twelve')).toEqual({ k: 'number', n: 12 });
      expect(parseIntent('fifteen')).toEqual({ k: 'number', n: 15 });
    });

    it('parses compound numbers', () => {
      expect(parseNumberWord('twenty five')).toBe(25);
      expect(parseNumberWord('thirty-two')).toBe(32);
      expect(parseNumberWord('ninety nine')).toBe(99);
    });

    it('parses number prefixes (badge, item, option)', () => {
      expect(parseIntent('badge three')).toEqual({ k: 'number', n: 3 });
      expect(parseIntent('number 5')).toEqual({ k: 'number', n: 5 });
      expect(parseIntent('item 8')).toEqual({ k: 'number', n: 8 });
      expect(parseIntent('option two')).toEqual({ k: 'number', n: 2 });
    });

    it('parses ordinals', () => {
      expect(parseOrdinal('first')).toBe(1);
      expect(parseOrdinal('second')).toBe(2);
      expect(parseOrdinal('3rd')).toBe(3);
      expect(parseOrdinal('4th')).toBe(4);
      expect(parseOrdinal('fifth')).toBe(5);
      expect(parseOrdinal('tenth')).toBe(10);
    });
  });

  // 2. Global Commands (18 tests)
  describe('Global Commands', () => {
    it('parses scrolling commands', () => {
      expect(parseIntent('scroll down')).toEqual({ k: 'global', name: 'scroll_down' });
      expect(parseIntent('scroll up')).toEqual({ k: 'global', name: 'scroll_up' });
      expect(parseIntent('scroll top')).toEqual({ k: 'global', name: 'scroll_top' });
      expect(parseIntent('scroll to top')).toEqual({ k: 'global', name: 'scroll_top' });
      expect(parseIntent('top of page')).toEqual({ k: 'global', name: 'scroll_top' });
      expect(parseIntent('scroll bottom')).toEqual({ k: 'global', name: 'scroll_bottom' });
      expect(parseIntent('scroll to bottom')).toEqual({ k: 'global', name: 'scroll_bottom' });
    });

    it('parses navigation and history commands', () => {
      expect(parseIntent('back')).toEqual({ k: 'global', name: 'back' });
      expect(parseIntent('go back')).toEqual({ k: 'global', name: 'back' });
      expect(parseIntent('previous page')).toEqual({ k: 'global', name: 'back' });
      expect(parseIntent('forward')).toEqual({ k: 'global', name: 'forward' });
      expect(parseIntent('go forward')).toEqual({ k: 'global', name: 'forward' });
      expect(parseIntent('next page')).toEqual({ k: 'global', name: 'forward' });
      expect(parseIntent('reload')).toEqual({ k: 'global', name: 'reload' });
      expect(parseIntent('refresh')).toEqual({ k: 'global', name: 'reload' });
      expect(parseIntent('home')).toEqual({ k: 'global', name: 'home' });
      expect(parseIntent('go home')).toEqual({ k: 'global', name: 'home' });
    });

    it('parses tab management and navigation', () => {
      expect(parseIntent('new tab')).toEqual({ k: 'global', name: 'new_tab' });
      expect(parseIntent('open new tab')).toEqual({ k: 'global', name: 'new_tab' });
      expect(parseIntent('close tab')).toEqual({ k: 'global', name: 'close_tab' });
      expect(parseIntent('next tab')).toEqual({ k: 'global', name: 'next_tab' });
      expect(parseIntent('previous tab')).toEqual({ k: 'global', name: 'prev_tab' });
      expect(parseIntent('prev tab')).toEqual({ k: 'global', name: 'prev_tab' });
      expect(parseIntent('tab 3')).toEqual({ k: 'global', name: 'tab_n', n: 3 });
      expect(parseIntent('tab four')).toEqual({ k: 'global', name: 'tab_n', n: 4 });
      expect(parseIntent('switch to tab 2')).toEqual({ k: 'global', name: 'tab_n', n: 2 });
    });

    it('parses URL navigation', () => {
      expect(parseIntent('go to google.com')).toEqual({ k: 'global', name: 'go_to', url: 'google.com' });
      expect(parseIntent('open github.com')).toEqual({ k: 'global', name: 'go_to', url: 'github.com' });
      expect(parseIntent('navigate to wikipedia.org')).toEqual({ k: 'global', name: 'go_to', url: 'wikipedia.org' });
    });
  });

  // 3. Control Commands (22 tests)
  describe('Control Commands', () => {
    it('parses tracking pause/resume and undo', () => {
      expect(parseIntent('pause')).toEqual({ k: 'control', name: 'pause' });
      expect(parseIntent('pause tracking')).toEqual({ k: 'control', name: 'pause' });
      expect(parseIntent('resume')).toEqual({ k: 'control', name: 'resume' });
      expect(parseIntent('resume tracking')).toEqual({ k: 'control', name: 'resume' });
      expect(parseIntent('undo')).toEqual({ k: 'control', name: 'undo' });
      expect(parseIntent('cancel')).toEqual({ k: 'control', name: 'cancel' });
    });

    it('parses confirmation dialog controls', () => {
      expect(parseIntent('yes')).toEqual({ k: 'control', name: 'yes' });
      expect(parseIntent('confirm')).toEqual({ k: 'control', name: 'yes' });
      expect(parseIntent('yep')).toEqual({ k: 'control', name: 'yes' });
      expect(parseIntent('no')).toEqual({ k: 'control', name: 'no' });
      expect(parseIntent('nope')).toEqual({ k: 'control', name: 'no' });
      expect(parseIntent('select')).toEqual({ k: 'control', name: 'select' });
      expect(parseIntent('choose')).toEqual({ k: 'control', name: 'select' });
    });

    it('parses gears, numbers toggle, zoom and helpers', () => {
      expect(parseIntent('hop mode')).toEqual({ k: 'control', name: 'hop_mode' });
      expect(parseIntent('switch to hop')).toEqual({ k: 'control', name: 'hop_mode' });
      expect(parseIntent('voice mode')).toEqual({ k: 'control', name: 'voice_mode' });
      expect(parseIntent('switch to voice')).toEqual({ k: 'control', name: 'voice_mode' });
      expect(parseIntent('show numbers')).toEqual({ k: 'control', name: 'show_numbers' });
      expect(parseIntent('hide numbers')).toEqual({ k: 'control', name: 'hide_numbers' });
      expect(parseIntent('zoom')).toEqual({ k: 'control', name: 'zoom' });
      expect(parseIntent('zoom in')).toEqual({ k: 'control', name: 'zoom' });
      expect(parseIntent('zoom back')).toEqual({ k: 'control', name: 'zoom_back' });
      expect(parseIntent('click here')).toEqual({ k: 'control', name: 'click_here' });
      expect(parseIntent('start dictation')).toEqual({ k: 'control', name: 'dictate_start' });
      expect(parseIntent('dictate')).toEqual({ k: 'control', name: 'dictate_start' });
      expect(parseIntent('stop dictation')).toEqual({ k: 'control', name: 'dictate_stop' });
      expect(parseIntent('recenter')).toEqual({ k: 'control', name: 'recenter' });
      expect(parseIntent('help')).toEqual({ k: 'control', name: 'help' });
    });
  });

  // 4. Target Query & Action Verbs (20 tests)
  describe('Target Queries', () => {
    it('parses clicks with roles and labels', () => {
      expect(parseIntent('click button')).toEqual({
        k: 'target',
        verb: 'click',
        query: { raw: 'button', role: 'button' },
      });
      expect(parseIntent('click the submit button')).toEqual({
        k: 'target',
        verb: 'click',
        query: { raw: 'submit button', text: 'submit', role: 'button' },
      });
      expect(parseIntent('open the pricing link')).toEqual({
        k: 'target',
        verb: 'open',
        query: { raw: 'pricing link', text: 'pricing', role: 'link' },
      });
    });

    it('parses targets with colors, ordinals, and positions', () => {
      expect(parseIntent('click the second blue button')).toEqual({
        k: 'target',
        verb: 'click',
        query: { raw: 'second blue button', nth: 2, color: 'blue', role: 'button' },
      });
      expect(parseIntent('click the first link on the left')).toEqual({
        k: 'target',
        verb: 'click',
        query: { raw: 'first link on left', nth: 1, side: 'left', role: 'link' },
      });
      expect(parseIntent('click the last red button')).toEqual({
        k: 'target',
        verb: 'click',
        query: { raw: 'last red button', last: true, color: 'red', role: 'button' },
      });
      expect(parseIntent('focus the middle input')).toEqual({
        k: 'target',
        verb: 'focus',
        query: { raw: 'middle input', side: 'middle', role: 'input' },
      });
    });

    it('parses double click and right click', () => {
      expect(parseIntent('double click the file')).toEqual({
        k: 'target',
        verb: 'double_click',
        query: { raw: 'file', text: 'file' },
      });
      expect(parseIntent('right click the image')).toEqual({
        k: 'target',
        verb: 'right_click',
        query: { raw: 'image', role: 'image' },
      });
    });

    it('parses search commands', () => {
      expect(parseIntent('search for running shoes')).toEqual({
        k: 'target',
        verb: 'search',
        searchText: 'running shoes',
        query: { raw: 'running shoes', text: 'running shoes', role: 'input' },
      });
      expect(parseIntent('search laptop')).toEqual({
        k: 'target',
        verb: 'search',
        searchText: 'laptop',
        query: { raw: 'laptop', text: 'laptop', role: 'input' },
      });
      expect(parseIntent('search')).toEqual({
        k: 'target',
        verb: 'search',
        query: { raw: 'search', role: 'input' },
      });
    });

    it('parses focus commands on fields', () => {
      expect(parseIntent('focus the email field')).toEqual({
        k: 'target',
        verb: 'focus',
        query: { raw: 'email field', text: 'email', role: 'input' },
      });
      expect(parseIntent('focus password box')).toEqual({
        k: 'target',
        verb: 'focus',
        query: { raw: 'password box', text: 'password', role: 'input' },
      });
    });
  });

  // 5. Typing by Field (8 tests)
  describe('Typing Commands', () => {
    it('parses typing in field', () => {
      expect(parseIntent('type hello in the search box')).toEqual({
        k: 'type',
        text: 'hello',
        field: 'search box',
      });
      expect(parseIntent('type john@example.com in email')).toEqual({
        k: 'type',
        text: 'john@example.com',
        field: 'email',
      });
      expect(parseIntent('type secret123 into password field')).toEqual({
        k: 'type',
        text: 'secret123',
        field: 'password field',
      });
      expect(parseIntent('type hello world')).toEqual({
        k: 'type',
        text: 'hello world',
      });
    });
  });

  // 6. Normalization and Filler Words (10 tests)
  describe('Normalization and Fillers', () => {
    it('strips polite and conversational fillers', () => {
      expect(normalize('please scroll down')).toBe('scroll down');
      expect(normalize('could you please click the button')).toBe('click button');
      expect(normalize('um like search for shoes')).toBe('search for shoes');
      expect(normalize('just go back')).toBe('go back');
      expect(parseIntent('just go back')).toEqual({ k: 'global', name: 'back' });
      expect(parseIntent('please pause')).toEqual({ k: 'control', name: 'pause' });
      expect(parseIntent('can you scroll down please')).toEqual({ k: 'global', name: 'scroll_down' });
    });
  });

  // 7. Fuzzy Fallback matching for near-misses (10 tests)
  describe('Fuzzy Matching Fallback', () => {
    it('matches near-misses with typo or speech slurs', () => {
      // slight typos or slight phonetics
      expect(parseIntent('scrol down')).toEqual({ k: 'global', name: 'scroll_down' });
      expect(parseIntent('scroll dwon')).toEqual({ k: 'global', name: 'scroll_down' });
      expect(parseIntent('scrol up')).toEqual({ k: 'global', name: 'scroll_up' });
      expect(parseIntent('zooom')).toEqual({ k: 'control', name: 'zoom' });
      expect(parseIntent('cancle')).toEqual({ k: 'control', name: 'cancel' });
      expect(parseIntent('sho numbers')).toEqual({ k: 'control', name: 'show_numbers' });
    });
  });

  // 8. Dictation Mode & Spoken Punctuation (10 tests)
  describe('Dictation Mode', () => {
    it('converts spoken punctuation and line breaks', () => {
      const res1 = processDictationText('hello world period');
      expect(res1.text).toBe('hello world.');

      const res2 = processDictationText('how are you question mark');
      expect(res2.text).toBe('how are you?');

      const res3 = processDictationText('first comma second');
      expect(res3.text).toBe('first, second');

      const res4 = processDictationText('hello new line world');
      expect(res4.text).toBe('hello\nworld');
    });

    it('handles delete that in dictation', () => {
      const parsed = parseIntent('delete that', { mode: 'dictation' });
      expect(parsed).toEqual({ k: 'control', name: 'undo' });
    });

    it('handles stop dictation command in dictation mode', () => {
      const parsed = parseIntent('stop dictation', { mode: 'dictation' });
      expect(parsed).toEqual({ k: 'control', name: 'dictate_stop' });
    });

    it('parses regular spoken text in dictation mode as dictation intent', () => {
      const parsed = parseIntent('this is an email test', { mode: 'dictation' });
      expect(parsed).toEqual({
        k: 'dictation',
        text: 'this is an email test',
        final: true,
      });
    });
  });

  // 9. Safe Interim Globals (6 tests)
  describe('Safe Interim Globals', () => {
    it('detects safe quick globals', () => {
      expect(isSafeInterimGlobal('scroll down')).toBe(true);
      expect(isSafeInterimGlobal('scroll up')).toBe(true);
      expect(isSafeInterimGlobal('pause')).toBe(true);
      expect(isSafeInterimGlobal('resume')).toBe(true);
      expect(isSafeInterimGlobal('click the blue button')).toBe(false);
      expect(isSafeInterimGlobal('type hello')).toBe(false);
    });
  });
});

describe('SpeechModule Simulation & Lifecycle', () => {
  it('emits speech.onset on the first interim result of an utterance', async () => {
    const [t1, t2] = memoryTransport();
    const speechMod = new SpeechModule(t1);

    const emitted: SpeechEvent[] = [];
    t2.on('speech', (ev) => {
      emitted.push(ev);
    });

    speechMod.simulateUtterance('scroll down', { interim: true });
    await new Promise((r) => setTimeout(r, 20));

    // speech.onset must be emitted before/with speech.result
    expect(emitted.length).toBeGreaterThanOrEqual(2);
    expect(emitted[0]).toEqual({ t: 'speech.onset' });
    expect(emitted[1].t).toBe('speech.result');
    expect((emitted[1] as any).final).toBe(false);
  });

  it('safe interim globals fire intent early during simulation', () => {
    const [t1] = memoryTransport();
    const speechMod = new SpeechModule(t1);

    let receivedIntent: Intent | null = null;
    speechMod.onIntent((intent) => {
      receivedIntent = intent;
    });

    const returnedIntent = speechMod.simulateUtterance('scroll down', { interim: true });
    expect(returnedIntent).toEqual({ k: 'global', name: 'scroll_down' });
    expect(receivedIntent).toEqual({ k: 'global', name: 'scroll_down' });
  });

  it('complex target queries do not fire on interim, but fire on final', () => {
    const [t1] = memoryTransport();
    const speechMod = new SpeechModule(t1);

    let receivedIntent: Intent | null = null;
    speechMod.onIntent((intent) => {
      receivedIntent = intent;
    });

    // Interim: should return null and not trigger callback
    const interimRes = speechMod.simulateUtterance('click the second blue button', { interim: true });
    expect(interimRes).toBeNull();
    expect(receivedIntent).toBeNull();

    // Final: triggers callback and returns parsed Intent
    const finalRes = speechMod.simulateUtterance('click the second blue button', { interim: false });
    expect(finalRes).toEqual({
      k: 'target',
      verb: 'click',
      query: { raw: 'second blue button', nth: 2, color: 'blue', role: 'button' },
    });
    expect(receivedIntent).toEqual(finalRes);
  });

  it('supports language configuration and retrieval', () => {
    const [t1] = memoryTransport();
    const speechMod = new SpeechModule(t1, { lang: 'en-IN' });
    expect(speechMod.getLanguage()).toBe('en-IN');
    speechMod.setLanguage('en-US');
    expect(speechMod.getLanguage()).toBe('en-US');
  });

  it('supports mode toggling between command and dictation', () => {
    const [t1] = memoryTransport();
    const speechMod = new SpeechModule(t1);
    expect(speechMod.getMode()).toBe('command');
    speechMod.setMode('dictation');
    expect(speechMod.getMode()).toBe('dictation');

    const dictationIntent = speechMod.simulateUtterance('hello world period');
    expect(dictationIntent).toEqual({
      k: 'dictation',
      text: 'hello world.',
      final: true,
    });
  });

  it('auto-restarts speech recognition after silence (onend event)', () => {
    vi.useFakeTimers();

    let startCount = 0;
    let stopCount = 0;
    let mockInstance: any = null;

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-IN';
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      onresult: ((e: any) => void) | null = null;

      start() {
        startCount++;
        mockInstance = this;
        setTimeout(() => this.onstart?.(), 10);
      }
      stop() {
        stopCount++;
      }
      abort() {}
    }

    (window as any).webkitSpeechRecognition = MockSpeechRecognition;

    const [t1] = memoryTransport();
    const speechMod = new SpeechModule(t1);

    speechMod.start();
    expect(startCount).toBe(1);

    // Simulate Chrome terminating recognition after silence
    mockInstance.onend?.();

    // Advance clock past backoff delay (250ms)
    vi.advanceTimersByTime(300);

    // auto-restart should have triggered another start()
    expect(startCount).toBe(2);

    speechMod.stop();
    delete (window as any).webkitSpeechRecognition;
    vi.useRealTimers();
  });
});

