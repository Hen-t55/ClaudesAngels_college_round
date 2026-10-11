import React, { useState } from 'react';

export interface CommandDoc {
  category: string;
  command: string;
  example: string;
  description: string;
  badge?: string;
}

export const COMMAND_LIST: CommandDoc[] = [
  // Navigation & Scrolling
  {
    category: 'Navigation & Scroll',
    command: 'scroll down / scroll up',
    example: '"scroll down"',
    description: 'Scrolls the page or the focused quadrant vertically by one viewport page.',
  },
  {
    category: 'Navigation & Scroll',
    command: 'scroll top / scroll bottom',
    example: '"scroll top"',
    description: 'Jumps instantly to the very top or bottom of the active page.',
  },
  {
    category: 'Navigation & Scroll',
    command: 'back / forward / reload / home',
    example: '"back"',
    description: 'Standard browser history navigation without mouse.',
  },
  {
    category: 'Navigation & Scroll',
    command: 'new tab / close tab / next tab / prev tab',
    example: '"next tab"',
    description: 'Manage browser tabs (close tab asks for confirmation).',
    badge: 'Important',
  },

  // Target Actions & Clicks
  {
    category: 'Target & Clicks',
    command: 'click <target text / role>',
    example: '"click add to cart"',
    description: 'Finds matching element in quadrant, locks quadrant, and activates.',
  },
  {
    category: 'Target & Clicks',
    command: 'double click / right click / open',
    example: '"right click image"',
    description: 'Dispatches contextual click gestures on the resolved element.',
  },
  {
    category: 'Target & Clicks',
    command: 'focus <input name>',
    example: '"focus search input"',
    description: 'Focuses a form control or search input ready for typing.',
  },

  // 2-Gear Disambiguation & Badges
  {
    category: 'Shifter & Disambiguation',
    command: 'hop mode / voice mode',
    example: '"hop mode"',
    description: 'Switches between head flick navigation and numbered badge selection.',
    badge: 'Shifter',
  },
  {
    category: 'Shifter & Disambiguation',
    command: 'select / [nod head]',
    example: '"select" or nod',
    description: 'Activates the currently focused hop-highlighted target.',
  },
  {
    category: 'Shifter & Disambiguation',
    command: '<number> (e.g. 1, 2, 3)',
    example: '"2"',
    description: 'Selects the badge labeled with that number in Voice gear or Show Numbers.',
  },
  {
    category: 'Shifter & Disambiguation',
    command: 'show numbers / hide numbers',
    example: '"show numbers"',
    description: 'Places numbered badges on all clickable elements in scope.',
  },

  // Zoom Grid & Fallbacks
  {
    category: 'Zoom & Precision',
    command: 'zoom / zoom back / click here',
    example: '"zoom"',
    description: 'Recursively divides area into 3x3 numbered tiles to pinpoint tiny links.',
    badge: 'Fallback',
  },

  // Typing & Dictation
  {
    category: 'Typing & Dictation',
    command: 'type <text> in <field>',
    example: '"type running shoes in search"',
    description: 'Automatically targets input field and types formatted string.',
  },
  {
    category: 'Typing & Dictation',
    command: 'dictate start / dictate stop',
    example: '"dictate start"',
    description: 'Streams continuous speech directly into the currently focused text field.',
  },

  // Control & Safety
  {
    category: 'Control & Safety',
    command: 'yes / [nod] | no / [shake] / cancel',
    example: '"yes" or nod',
    description: 'Answers confirmation prompts for important actions (checkout, purchase, delete).',
    badge: 'Safety',
  },
  {
    category: 'Control & Safety',
    command: 'pause / resume',
    example: '"pause"',
    description: 'Temporarily suspends or re-arms head tracking and speech triggers.',
  },
  {
    category: 'Control & Safety',
    command: 'recenter',
    example: '"recenter"',
    description: 'Resets the head tracking zero-point to your current neutral resting posture.',
  },
  {
    category: 'Control & Safety',
    command: 'undo',
    example: '"undo"',
    description: 'Reverses the last text mutation or non-destructive DOM operation.',
  },
];

export function CheatSheet() {
  const [filter, setFilter] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', ...Array.from(new Set(COMMAND_LIST.map(c => c.category)))];

  const filteredCommands = COMMAND_LIST.filter(item => {
    const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch =
      item.command.toLowerCase().includes(filter.toLowerCase()) ||
      item.example.toLowerCase().includes(filter.toLowerCase()) ||
      item.description.toLowerCase().includes(filter.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full space-y-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-slate-100">
      {/* Header & Search */}
      <div className="space-y-2 border-b border-slate-800 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <span className="font-extrabold text-sm text-white">Commands Cheat Sheet</span>
          </div>
          <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">
            {filteredCommands.length} commands
          </span>
        </div>

        {/* Search input */}
        <input
          type="text"
          placeholder="Search commands or examples (e.g. click, scroll, zoom)..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
        />

        {/* Category Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-sky-500 text-white shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Command List Cards */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filteredCommands.map((item, idx) => (
          <div
            key={idx}
            className="bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 rounded-lg p-2.5 space-y-1 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-sky-300">{item.command}</span>
              {item.badge && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                    item.badge === 'Important'
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : item.badge === 'Safety'
                      ? 'bg-rose-950 text-rose-400 border border-rose-800'
                      : 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </div>
            <div className="text-[11px] text-emerald-400 font-mono">
              <span className="text-slate-500">Say: </span>
              {item.example}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">{item.description}</p>
          </div>
        ))}

        {filteredCommands.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-xs">
            No commands matching "{filter}"
          </div>
        )}
      </div>
    </div>
  );
}
