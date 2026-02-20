# Phase 2: Chat UI - Research

**Researched:** 2026-02-20
**Domain:** React 19 + Tailwind v4 dark fantasy chat UI with SSE stub hook
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Chat visual style
- DM messages left-aligned, player messages right-aligned
- DM narration in IM Fell English (serif), player messages in a clean sans-serif — strong visual contrast between narrator and player
- Text only in bubbles — no timestamps, labels, or metadata
- Full-screen dark fantasy background image (royalty-free tavern/forest scene) with dark overlay (`rgba(0,0,0,0.6)`) for readability

#### Dice roll experience
- Roll Dice button sends `"I roll the dice!"` as a regular chat message — no frontend dice generation, no animated d20 reveal
- The AI generates the d20 result and narrates the outcome (simplifies ROADMAP's "animated d20 reveal" — deliberate decision for simplicity)
- Brief shake/glow animation on the dice button when clicked — small theatrical moment before message sends
- Button always visible, but glows/pulses when the DM's last message suggests a roll is needed
- Dice roll messages styled differently from regular player messages (dice emoji prefix, distinct visual treatment) to stand out as a game action
- Button positioned below the input row (text input + Send on first row, Roll Dice on second row)

#### Page layout & composition
- Single screen, no routing
- Centered container (max-width ~700-800px) with dark borders/background on sides — focused, app-like
- Header: "AI Dungeon Master" in Cinzel font + subtle branding ("Powered by AWS Bedrock" or team name) for hackathon judging context
- Desktop-only — optimized for laptop/monitor display, no mobile responsiveness needed
- Simple reset button in header corner — clears chat and returns to Start Adventure state

#### Interaction & states
- Initial state: "Start Adventure" button (Phase 7 will hook TTS to this) — no chat input visible until adventure starts
- Loading indicator: "The Dungeon Master is thinking..." in IM Fell English with subtle glow/pulse — stays in theme
- Text input disabled while DM is responding — prevents stacking messages, cleaner for demo
- Chat auto-scrolls to latest message

### Claude's Discretion
- Bubble color treatment (semi-transparent panels, specific color values)
- Background image extent (full page vs chat area only)
- Exact spacing, padding, and typography sizing
- Auto-scroll behavior details
- Error state handling

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This phase builds a complete dark fantasy chat UI in React 19 + TypeScript using Tailwind CSS v4. The project already has a Vite 7 + React 19 monorepo scaffold (`client/`) with no CSS framework installed yet — Tailwind v4 must be added. Tailwind v4 is a major break from v3: configuration moves entirely into CSS using `@theme` blocks, the Vite plugin replaces PostCSS, and there is no `tailwind.config.js`. The planner must account for this v4-first approach throughout.

The chat UI is frontend-only in this phase. The `useSSEChat` hook should stub responses (mock messages) so the UI is fully interactive without a backend. Phase 4 will wire it to the real `/chat` endpoint. All state lives in React (`useState`) — no external state management needed at this scale.

The dice mechanic is intentionally simple: the Roll Dice button calls `sendMessage("I roll the dice!")` with a shake/glow animation on the button itself. No random number generation on the frontend. The ROADMAP mentioned "animated d20 reveal" but CONTEXT.md explicitly overrides this — the dice button is a theatrical UI shortcut for a preset message, nothing more.

**Primary recommendation:** Install `tailwindcss` + `@tailwindcss/vite` into the `client/` workspace, configure via CSS-only `@theme` block, load Google Fonts via `@import` at the top of the CSS file, and implement 4 components (`ChatWindow`, `MessageBubble`, `MessageInput`, `DiceRoller`) plus 2 hooks (`useSSEChat`, `useChatScroll`).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tailwindcss | ^4.0 | Utility CSS framework | Installed in project via v4 Vite plugin; CSS-first config |
| @tailwindcss/vite | ^4.0 | Vite plugin for Tailwind v4 | Replaces PostCSS; required for v4 with Vite |
| react | ^19.0 (already installed) | UI rendering | Already in scaffold |
| typescript | ^5.0 (already installed) | Type safety | Already in scaffold |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Google Fonts (Cinzel + IM Fell English) | CDN | Typography | Load via `@import url()` at top of CSS; no npm package |

### No Additional Libraries Needed

The following are NOT needed for this phase:
- No routing library (single screen)
- No state management (useState is sufficient)
- No animation library (CSS keyframes in @theme block)
- No component library (custom components per design spec)

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tailwind v4 CSS @theme | tailwind.config.js (v3 style) | v3 config still works in v4 but is legacy — use @theme |
| CSS keyframes in @theme | Framer Motion / Motion | Overkill for shake+glow; CSS is sufficient and faster |
| Fetch + ReadableStream SSE | EventSource API | EventSource doesn't support POST bodies — fetch is required |

**Installation (run inside `client/` or as workspace):**

```bash
npm install tailwindcss @tailwindcss/vite --save-dev -w client
```

---

## Architecture Patterns

### Recommended Project Structure

```
client/src/
├── components/
│   ├── ChatWindow.tsx       # scrollable message list container
│   ├── MessageBubble.tsx    # single message (DM or player variant)
│   ├── MessageInput.tsx     # text input + Send button row
│   └── DiceRoller.tsx       # Roll Dice button with shake/glow
├── hooks/
│   ├── useSSEChat.ts        # send message, manage messages[], loading state
│   └── useChatScroll.ts     # auto-scroll to bottom sentinel ref
├── types/
│   └── chat.ts              # Message interface, AppState type
├── App.tsx                  # top-level: adventure/chat state switch
├── index.css                # @import Google Fonts, @import tailwindcss, @theme block
└── main.tsx                 # already exists, no changes needed
```

### Pattern 1: Tailwind v4 CSS-First Config

**What:** All theming lives in `index.css` — no `tailwind.config.js` required. The `@theme` block defines design tokens that auto-generate utility classes.

**When to use:** Always for this project. v4 is installed, so use v4 patterns exclusively.

**Example:**

```css
/* Source: https://tailwindcss.com/docs/font-family + https://tailwindcss.com/docs/theme */

/* 1. Google Fonts MUST come before @import "tailwindcss" */
@import url("https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=IM+Fell+English:ital@0;1&display=swap");

/* 2. Tailwind base */
@import "tailwindcss";

/* 3. Custom design tokens */
@theme {
  /* Colors */
  --color-parchment: #e0d0b0;
  --color-blood: #8b1a1a;
  --color-blood-light: #c0392b;
  --color-dm-bubble: oklch(0.18 0.02 270 / 0.85);
  --color-player-bubble: oklch(0.22 0.04 30 / 0.85);
  --color-surface: oklch(0.10 0.01 270 / 0.92);

  /* Fonts */
  --font-cinzel: "Cinzel", serif;
  --font-fell: "IM Fell English", serif;
  --font-sans: ui-sans-serif, system-ui, sans-serif;

  /* Animations */
  --animate-pulse-glow: pulse-glow 2s ease-in-out infinite;
  --animate-dice-shake: dice-shake 0.4s ease-in-out;

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 8px oklch(0.55 0.18 30 / 0.6); }
    50% { box-shadow: 0 0 20px oklch(0.55 0.18 30 / 1.0), 0 0 40px oklch(0.55 0.18 30 / 0.4); }
  }

  @keyframes dice-shake {
    0%, 100% { transform: translate3d(0, 0, 0); }
    20% { transform: translate3d(-4px, 0, 0) rotate(-2deg); }
    40% { transform: translate3d(4px, 0, 0) rotate(2deg); }
    60% { transform: translate3d(-4px, 0, 0) rotate(-1deg); }
    80% { transform: translate3d(4px, 0, 0) rotate(1deg); }
  }
}
```

Usage in JSX: `className="font-cinzel"`, `className="text-parchment"`, `className="animate-pulse-glow"`.

### Pattern 2: Message Type Interface

**What:** A typed `Message` union drives component rendering and styling.

```typescript
// Source: project convention, TypeScript standard pattern
// client/src/types/chat.ts

export type MessageRole = 'dm' | 'player' | 'dice';

export interface Message {
  id: string;           // crypto.randomUUID() — available in modern browsers
  role: MessageRole;
  content: string;
  isStreaming?: boolean; // true while token chunks still arriving
}

export type AppState = 'idle' | 'adventure';
```

### Pattern 3: useSSEChat Stub Hook

**What:** Manages message array and loading state. In Phase 2 it returns a mock DM response; Phase 4 replaces the internals with real SSE fetch.

**When to use:** Phase 2 stub — must keep the same external interface so Phase 4 is a drop-in replacement.

```typescript
// Source: pattern from https://upstash.com/blog/sse-streaming-llm-responses + project convention
// client/src/hooks/useSSEChat.ts

import { useState, useCallback } from 'react';
import { Message } from '../types/chat';

const MOCK_RESPONSES = [
  "The door to the Shattered Crown tavern groans as you push it open...",
  "Gorm the barkeep eyes you from behind the bar. \"Looking for work, stranger?\"",
  "The goblins charge from the shadows!",
];

export function useSSEChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: content.startsWith('🎲') ? 'dice' : 'player',
      content,
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    // Phase 2 stub — Phase 4 replaces this block with real SSE fetch
    await new Promise(res => setTimeout(res, 1200));
    const dmMsg: Message = {
      id: crypto.randomUUID(),
      role: 'dm',
      content: MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)],
    };
    setMessages(prev => [...prev, dmMsg]);
    setIsLoading(false);
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setIsLoading(false);
  }, []);

  return { messages, isLoading, sendMessage, reset };
}
```

### Pattern 4: useChatScroll Hook

**What:** Auto-scrolls to the bottom sentinel element whenever messages change.

```typescript
// Source: https://davelage.com/posts/chat-scroll-react/ + official React useRef docs
// client/src/hooks/useChatScroll.ts

import { useRef, useEffect } from 'react';
import { Message } from '../types/chat';

export function useChatScroll(messages: Message[]) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return bottomRef;
}
```

Usage: place `<div ref={bottomRef} />` as last child of the scrollable container.

### Pattern 5: Vite Config for Tailwind v4

**What:** Add `@tailwindcss/vite` plugin alongside the existing React plugin.

```typescript
// Source: https://tailwindcss.com/docs (official Vite install guide)
// client/vite.config.ts

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
```

### Pattern 6: MessageBubble Component

**What:** Renders one message with role-based styles.

```typescript
// client/src/components/MessageBubble.tsx

import { Message } from '../types/chat';

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const isDM = message.role === 'dm';
  const isDice = message.role === 'dice';

  return (
    <div className={`flex ${isDM ? 'justify-start' : 'justify-end'} mb-3`}>
      <div
        className={[
          'max-w-[75%] px-4 py-3 rounded-lg text-parchment',
          isDM
            ? 'bg-dm-bubble font-fell text-base italic leading-relaxed'
            : isDice
            ? 'bg-blood/70 font-sans text-sm font-semibold tracking-wide border border-blood-light'
            : 'bg-player-bubble font-sans text-sm',
        ].join(' ')}
      >
        {message.content}
      </div>
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Importing Tailwind via PostCSS config**: In v4 with the Vite plugin, PostCSS is not used. No `postcss.config.js` or `autoprefixer` needed.
- **Using `tailwind.config.js` for theme**: Tailwind v4 still accepts a config file for backwards compatibility, but the CSS-first `@theme` block is the correct approach for new projects.
- **Placing Google Fonts `@import` after `@import "tailwindcss"`**: Browsers require `@import` statements to come before other rules. Google Fonts import MUST be first.
- **Using `EventSource` API for chat**: EventSource doesn't support POST bodies. Use `fetch` + `ReadableStream` for the Phase 4 SSE integration.
- **Generating dice rolls on the frontend**: CONTEXT.md is explicit — no `Math.random()` d20 rolls. The button sends a preset message string. The AI narrates the result.
- **Calling `scrollIntoView` on every render**: Tie it to `useEffect` with `messages` as dependency, not `useLayoutEffect` or unguarded render.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS utility classes | Custom stylesheet from scratch | Tailwind v4 | Tailwind handles responsive, dark states, spacing system |
| Font loading | Manual `@font-face` declarations | Google Fonts `@import url()` | Google Fonts CDN handles font variants, subsetting, caching |
| Shake/glow animation | Inline style JS animation | CSS `@keyframes` in `@theme` block | Pure CSS, GPU-accelerated, no JS overhead |
| Auto-scroll | `window.scrollY` math | `scrollIntoView()` on sentinel `<div>` | One-liner, cross-browser, works with smooth behavior |
| Message IDs | Counter or index | `crypto.randomUUID()` | Built into modern browsers, guaranteed unique |

**Key insight:** Everything in this phase is achievable with standard React hooks + CSS. Adding animation or state management libraries creates Phase 4 migration risk and bundle bloat.

---

## Common Pitfalls

### Pitfall 1: Tailwind v4 @theme vs v3 config.js

**What goes wrong:** Developer writes `tailwind.config.js` with `theme.extend.colors` and wonders why classes don't generate.
**Why it happens:** Tailwind v4 with the Vite plugin uses CSS-first configuration. A `tailwind.config.js` can coexist but is not the primary pattern.
**How to avoid:** Define ALL theme tokens (`--color-*`, `--font-*`, `--animate-*`) inside `@theme {}` in `index.css`.
**Warning signs:** Tailwind utility classes like `text-parchment` don't apply even though they're in the source.

### Pitfall 2: Google Fonts @import order

**What goes wrong:** Styles don't load; browser console shows "CSS @import rules must precede all other valid at-rules."
**Why it happens:** CSS spec requires `@import` statements before any other CSS rules, including `@import "tailwindcss"`.
**How to avoid:** Always put Google Fonts `@import url(...)` as the FIRST line in `index.css`.
**Warning signs:** Fonts fall back to system serif/sans-serif in the rendered UI.

### Pitfall 3: Tailwind v4 in npm workspace — class detection

**What goes wrong:** Tailwind doesn't purge correctly or misses classes in some source files.
**Why it happens:** The `@tailwindcss/vite` plugin auto-detects files from the Vite config root (the `client/` directory). Since all UI code lives in `client/src/`, this works by default with no `@source` directives needed.
**How to avoid:** Confirm Vite root is `client/`. No `@source` directives needed for this single-app monorepo setup (no shared packages with Tailwind classes).
**Warning signs:** A class used in JSX disappears from the compiled CSS in production build.

### Pitfall 4: useSSEChat hook interface lock

**What goes wrong:** Phase 4 requires a different hook signature than what Phase 2 built, requiring a full component refactor.
**Why it happens:** Phase 2 builds a stub; Phase 4 replaces internals. If the interface drifts, consuming components break.
**How to avoid:** The stub must expose exactly `{ messages, isLoading, sendMessage, reset }` — the same interface Phase 4 will provide. Document this contract explicitly.
**Warning signs:** Phase 4 planner changes the return signature of `useSSEChat`.

### Pitfall 5: Dice button "glows when roll needed" detection

**What goes wrong:** Over-engineering a regex or NLP check to detect if DM's last message suggests a roll.
**Why it happens:** CONTEXT.md says the button "glows/pulses when the DM's last message suggests a roll is needed" — this sounds like it requires understanding.
**How to avoid:** Use a simple keyword check on the last DM message: `const needsRoll = /roll|dice|check|save|attack/i.test(lastDMMessage)`. One line. Do not call an LLM for this.
**Warning signs:** The detection logic becomes more than 5 lines.

### Pitfall 6: CSS specificity with semi-transparent bubbles

**What goes wrong:** The dark overlay on the background image bleeds through chat bubbles, making text hard to read.
**Why it happens:** `rgba(0,0,0,0.6)` overlay on background + semi-transparent bubbles can compound.
**How to avoid:** Give chat bubbles a high-enough opacity (0.80–0.90) so they read clearly. Test against the actual background image, not a solid color.
**Warning signs:** Text contrast fails WCAG AA in the dev environment (though this is a demo, legibility still matters for judges).

---

## Code Examples

Verified patterns from official and authoritative sources:

### Tailwind v4 Full index.css Setup

```css
/* Source: https://tailwindcss.com/docs/font-family — @import order requirement */
/* Source: https://tailwindcss.com/docs/theme — @theme block syntax */
/* Source: https://tailwindcss.com/docs/animation — @keyframes inside @theme */

@import url("https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=IM+Fell+English:ital@0;1&display=swap");

@import "tailwindcss";

@theme {
  /* Brand colors */
  --color-parchment: #e0d0b0;
  --color-blood: #8b1a1a;
  --color-blood-light: #c0392b;

  /* Bubble backgrounds — semi-transparent so background bleeds through */
  --color-dm-bubble: oklch(0.15 0.02 260 / 0.88);
  --color-player-bubble: oklch(0.20 0.06 28 / 0.88);

  /* Page surface overlay (sides of centered container) */
  --color-surface: oklch(0.08 0.01 260 / 0.95);

  /* Typography */
  --font-cinzel: "Cinzel", serif;
  --font-fell: "IM Fell English", serif;

  /* Animations */
  --animate-pulse-glow: pulse-glow 2s ease-in-out infinite;
  --animate-dice-shake: dice-shake 0.4s ease-in-out;

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 8px oklch(0.5 0.18 30 / 0.5); }
    50% { box-shadow: 0 0 22px oklch(0.5 0.18 30 / 0.95), 0 0 44px oklch(0.5 0.18 30 / 0.35); }
  }

  @keyframes dice-shake {
    0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
    20%      { transform: translate3d(-5px, 0, 0) rotate(-3deg); }
    40%      { transform: translate3d(5px, 0, 0) rotate(3deg); }
    60%      { transform: translate3d(-4px, 0, 0) rotate(-2deg); }
    80%      { transform: translate3d(4px, 0, 0) rotate(1deg); }
  }
}

/* Full-screen dark background applied to body */
body {
  background-color: oklch(0.07 0.01 260);
  background-image: url('/tavern-bg.jpg');
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
  min-height: 100vh;
}
```

### Auto-scroll Sentinel Pattern

```typescript
// Source: https://davelage.com/posts/chat-scroll-react/
// Attach bottomRef to an empty <div> at the bottom of the message list.

import { useRef, useEffect } from 'react';

export function useChatScroll(dep: unknown) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dep]);
  return bottomRef;
}
```

### SSE Fetch ReadableStream Pattern (Phase 4 reference)

```typescript
// Source: https://upstash.com/blog/sse-streaming-llm-responses
// This is the Phase 4 SSE pattern — useSSEChat stub in Phase 2 must match this interface.

const reader = response.body!
  .pipeThrough(new TextDecoderStream())
  .getReader();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  // value is a chunk of SSE text; parse and append to streaming message
}
```

### DiceRoller with Shake Animation

```typescript
// client/src/components/DiceRoller.tsx

import { useState, useCallback } from 'react';

interface Props {
  onRoll: () => void;
  disabled: boolean;
  needsRoll: boolean;
}

export function DiceRoller({ onRoll, disabled, needsRoll }: Props) {
  const [shaking, setShaking] = useState(false);

  const handleClick = useCallback(() => {
    if (disabled || shaking) return;
    setShaking(true);
    setTimeout(() => {
      setShaking(false);
      onRoll();
    }, 400); // matches dice-shake duration
  }, [disabled, shaking, onRoll]);

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={[
        'w-full py-2 rounded border font-cinzel text-parchment tracking-wider transition-colors',
        'border-blood bg-blood/30 hover:bg-blood/50',
        needsRoll && !disabled ? 'animate-pulse-glow' : '',
        shaking ? 'animate-dice-shake' : '',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      🎲 Roll the Dice
    </button>
  );
}
```

### App-Level State Machine

```typescript
// client/src/App.tsx — top-level adventure state

import { useState } from 'react';
import { useSSEChat } from './hooks/useSSEChat';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { DiceRoller } from './components/DiceRoller';

export default function App() {
  const [appState, setAppState] = useState<'idle' | 'adventure'>('idle');
  const { messages, isLoading, sendMessage, reset } = useSSEChat();

  const lastDMMessage = [...messages].reverse().find(m => m.role === 'dm')?.content ?? '';
  const needsRoll = /roll|dice|check|save|attack/i.test(lastDMMessage);

  const handleStart = () => setAppState('adventure');
  const handleReset = () => { reset(); setAppState('idle'); };

  return (
    <div className="min-h-screen flex items-center justify-center">
      {/* Centered container — 700-800px max width */}
      <div className="w-full max-w-3xl h-screen flex flex-col bg-surface border-x border-blood/30">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-blood/30">
          <h1 className="font-cinzel text-2xl text-parchment tracking-widest">AI Dungeon Master</h1>
          <div className="flex items-center gap-4">
            <span className="font-sans text-xs text-parchment/50">Powered by AWS Bedrock</span>
            {appState === 'adventure' && (
              <button onClick={handleReset} className="font-cinzel text-xs text-blood-light hover:text-parchment transition-colors">
                Reset
              </button>
            )}
          </div>
        </header>

        {/* Chat area */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {appState === 'idle' ? (
            <div className="flex-1 flex items-center justify-center">
              <button
                onClick={handleStart}
                className="font-cinzel text-xl text-parchment px-8 py-4 border border-blood bg-blood/20 hover:bg-blood/40 transition-colors tracking-widest"
              >
                Start Adventure
              </button>
            </div>
          ) : (
            <>
              <ChatWindow messages={messages} isLoading={isLoading} />
              <div className="p-4 border-t border-blood/30 space-y-2">
                <MessageInput onSend={sendMessage} disabled={isLoading} />
                <DiceRoller
                  onRoll={() => sendMessage('🎲 I roll the dice!')}
                  disabled={isLoading}
                  needsRoll={needsRoll}
                />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` with JS theme | `@theme {}` block in CSS file | Tailwind v4.0 (Jan 2025) | No config file needed; CSS-only |
| PostCSS plugin (`tailwindcss` + `autoprefixer`) | `@tailwindcss/vite` Vite plugin | Tailwind v4.0 (Jan 2025) | Vite plugin replaces entire PostCSS setup |
| `purge: ['./src/**/*.tsx']` content paths | Auto-detection via Vite plugin | Tailwind v4.0 (Jan 2025) | No content paths config; scanned automatically |
| `classnames` / `clsx` library | Array `.join(' ')` or `clsx` | Ongoing | For this scope, array join is sufficient; clsx is optional |
| `EventSource` API for SSE | `fetch` + `ReadableStream` | Standard since 2020 | EventSource can't POST; fetch handles streaming POST |

**Deprecated/outdated:**
- `tailwind.config.js` with `theme.extend.colors`: Still works in v4 for compatibility but is not the recommended pattern for new v4 projects.
- `postcss.config.js` with `tailwindcss` plugin: Replaced by `@tailwindcss/vite`. Do not create `postcss.config.js`.

---

## Open Questions

1. **Background image source**
   - What we know: CONTEXT.md requires a royalty-free dark fantasy tavern/forest scene
   - What's unclear: No specific image URL or file is committed to the repo yet
   - Recommendation: The planner should include a task step to source and commit a background image to `client/public/tavern-bg.jpg` (Unsplash free license is sufficient for hackathon). The CSS references `/tavern-bg.jpg` via the public directory.

2. **index.css existence**
   - What we know: `client/src/` currently has only `App.tsx`, `main.tsx`, `vite-env.d.ts` — no CSS file exists
   - What's unclear: Nothing; this is a known gap
   - Recommendation: Create `client/src/index.css` and import it in `main.tsx` as `import './index.css'`.

3. **`crypto.randomUUID()` browser compatibility**
   - What we know: Available in all modern browsers (Chrome 92+, Firefox 95+, Safari 15.4+)
   - What's unclear: Vite dev server target configuration
   - Recommendation: Safe to use given desktop-only requirement and hackathon audience. No polyfill needed.

---

## Sources

### Primary (HIGH confidence)

- https://tailwindcss.com/docs — Vite installation steps, @theme syntax, @keyframes in @theme, font-family registration, @import ordering requirement
- https://tailwindcss.com/docs/theme — @theme block, --color-*, --font-*, --animate-* variable naming conventions
- https://tailwindcss.com/docs/animation — Custom @keyframes inside @theme block, --animate-* usage
- https://tailwindcss.com/docs/font-family — Google Fonts @import URL before @import "tailwindcss"; --font-* registration
- https://davelage.com/posts/chat-scroll-react/ — useChatScroll sentinel pattern, scrollIntoView(false) vs options

### Secondary (MEDIUM confidence)

- https://nx.dev/blog/setup-tailwind-4-npm-workspace — @source directives for monorepos; confirmed this project does NOT need them (all code in client/src)
- https://upstash.com/blog/sse-streaming-llm-responses — fetch + ReadableStream + TextDecoderStream pattern for SSE

### Tertiary (LOW confidence)

- WebSearch results on "Tailwind v4 @keyframes syntax 2025" — cross-verified with official docs; confirmed `@keyframes` inside `@theme` block is correct

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Tailwind v4 official docs confirmed; React 19 already in scaffold; versions pinned
- Architecture: HIGH — Component decomposition follows standard React chat patterns; hook interfaces designed for Phase 4 drop-in
- Pitfalls: HIGH — v4 migration pitfalls confirmed via official docs; Google Fonts ordering confirmed; SSE fetch pattern confirmed
- Background image: LOW — No image selected yet; noted as open question

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 days; Tailwind v4 is stable release)
