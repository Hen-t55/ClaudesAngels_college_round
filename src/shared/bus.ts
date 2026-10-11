// Transport abstraction (P3). Chrome messaging + in-memory for tests.
import type {
  HeadEvent, HeadCommand, SpeechEvent,
  EngineRequest, EngineEvent, OverlayState,
  Telemetry, SettingsMessage, TabCommand,
} from './contract';

export interface ChannelMap {
  'head.event':     HeadEvent;
  'head.command':   HeadCommand;
  'speech':         SpeechEvent;
  'engine.request': EngineRequest;
  'engine.event':   EngineEvent;
  'overlay':        OverlayState;
  'telemetry':      Telemetry;
  'settings':       SettingsMessage;
  'tab.command':    TabCommand;
}

export type Channel = keyof ChannelMap;

export interface Transport {
  send<K extends Channel>(ch: K, data: ChannelMap[K]): void;
  on<K extends Channel>(ch: K, handler: (data: ChannelMap[K]) => void): () => void;
}

// ---- Chrome runtime/tabs messaging transport ----

const ENVELOPE_KEY = '__hf';
interface Envelope { [ENVELOPE_KEY]: true; ch: string; data: unknown }
function isEnvelope(x: unknown): x is Envelope {
  return typeof x === 'object' && x !== null && (x as Record<string, unknown>)[ENVELOPE_KEY] === true;
}

export function chromeTransport(role: 'sidepanel' | 'content'): Transport {
  type HandlerSet = Set<(data: never) => void>;
  const listeners = new Map<string, HandlerSet>();

  chrome.runtime.onMessage.addListener((msg: unknown) => {
    if (!isEnvelope(msg)) return;
    const set = listeners.get(msg.ch);
    if (set) for (const fn of set) fn(msg.data as never);
  });

  return {
    send(ch, data) {
      const env = { [ENVELOPE_KEY]: true, ch, data } as unknown as Envelope;

      // 1. Dispatch locally in-process (between vision, voice, orchestrator, App in sidepanel)
      const set = listeners.get(ch);
      if (set) {
        for (const fn of set) {
          try {
            fn(data as never);
          } catch (err) {
            console.error('[bus] local listener error:', err);
          }
        }
      }

      // 2. Dispatch cross-process via Chrome messaging
      if (role === 'sidepanel') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const id = tabs[0]?.id;
          if (id !== undefined) {
            chrome.tabs.sendMessage(id, env).catch(() => {
              // Tab may not have content script injected (e.g. chrome:// pages)
            });
          }
        });
      } else {
        chrome.runtime.sendMessage(env).catch(() => { /* no listener yet */ });
      }
    },
    on(ch, handler) {
      let set = listeners.get(ch);
      if (!set) { set = new Set() as HandlerSet; listeners.set(ch, set); }
      set.add(handler as (data: never) => void);
      return () => { set!.delete(handler as (data: never) => void); };
    },
  };
}

// ---- In-memory transport (tests / dev harnesses) ----

export function memoryTransport(): [Transport, Transport] {
  type HandlerSet = Set<(data: never) => void>;
  const aListeners = new Map<string, HandlerSet>();
  const bListeners = new Map<string, HandlerSet>();

  function makeSide(own: Map<string, HandlerSet>, peer: Map<string, HandlerSet>): Transport {
    return {
      send(ch, data) {
        const peerSet = peer.get(ch);
        if (peerSet) for (const fn of peerSet) queueMicrotask(() => fn(data as never));
        const ownSet = own.get(ch);
        if (ownSet) for (const fn of ownSet) queueMicrotask(() => fn(data as never));
      },
      on(ch, handler) {
        let set = own.get(ch);
        if (!set) { set = new Set() as HandlerSet; own.set(ch, set); }
        set.add(handler as (data: never) => void);
        return () => { set!.delete(handler as (data: never) => void); };
      },
    };
  }
  return [makeSide(aListeners, bListeners), makeSide(bListeners, aListeners)];
}
