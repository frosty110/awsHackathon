# Phase 7: Voice + Demo Polish - Research

**Researched:** 2026-02-20
**Domain:** MiniMax TTS API, Web Audio API autoplay policy, Claude system prompt tuning for scripted demo reliability
**Confidence:** HIGH (TTS API verified against official docs; autoplay policy verified against MDN/Chrome docs; system prompt guidance from best practices)

---

## Summary

Phase 7 has three distinct sub-problems: (1) implementing the MiniMax T2A v2 TTS service on the server, (2) wiring the "Start Adventure" button to fetch and play audio on the client while handling browser autoplay restrictions, and (3) hardening the scripted 3-turn demo scenario so it runs reliably without off-script DM responses.

The MiniMax T2A v2 API is a straightforward `POST /v1/t2a_v2` call with a `GroupId` query parameter. Non-streaming mode returns the audio as a hex-encoded string in `response.data.audio`. Decoding is a one-liner: `Buffer.from(hex, 'hex')`. The server sends the resulting buffer as `audio/mpeg` (if requesting mp3) or `audio/wav`. The client fetches this binary response and plays it via `new Audio(objectUrl)` where `objectUrl` comes from `URL.createObjectURL(new Blob([arrayBuffer], { type: 'audio/mpeg' }))`.

The critical constraint for Phase 7 is the Web Audio API autoplay policy: Chrome and all modern browsers block programmatic audio unless it is initiated within a user gesture handler. Since "Start Adventure" is a button click, playing audio in the `onClick` handler is the correct and browser-safe approach. The `Audio` element can be created and `.play()` called synchronously from the click handler — as long as the fetch has already completed, this works. The recommended pattern is: button click triggers a loading state ("The Dungeon Master is speaking..."), performs the `POST /narrate` fetch, converts the response to a Blob URL, then calls `audio.play()` — all inside the same React event handler or its continuation via a useCallback/async function.

Demo reliability (DEMO-01) is fundamentally a system prompt engineering problem. The scripted 3-turn demo is: tavern arrival → barkeep quest acceptance → goblin combat with dice roll. The system prompt must constrain Claude to stay in this location and scenario. The player's three pre-written inputs must be designed to work with the lore graph (Phase 5) and produce deterministic enough DM responses without leaking off-script. Pre-populating the Datadog dashboard with real traces from a rehearsal run is a pre-demo operational step, not a code task.

**Primary recommendation:** Server: raw `fetch` POST to MiniMax with non-streaming mode, hex decode, return `audio/mpeg`. Client: `AudioPlayer` component with loading state; on click, fetch `/narrate`, create Blob URL, call `audio.play()` inside the event chain. Demo: lock system prompt to tavern scenario with explicit constraints against improvising setting or characters.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node built-in `fetch` | Node 18+ | Call MiniMax API from server | Already in Node 18 global scope; no extra dependency |
| `express` | Already installed | `POST /narrate` route | Already in server stack |
| `Buffer` | Node built-in | Hex decode TTS audio | `Buffer.from(hex, 'hex')` — no library needed |
| `Web Audio API / HTML Audio` | Browser built-in | Play audio on client | No React audio library needed for single-shot play |
| `URL.createObjectURL` | Browser built-in | Turn binary response into playable URL | Avoids base64 round-trip; immediate playback |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `express-rate-limit` | May already be planned | Rate limit `/narrate` | CLAUDE.md requires rate limiting; add if not already on route |

### No Additional Libraries Needed

The following are NOT needed:
- No `howler.js` or `tone.js` — overkill for single-shot audio playback
- No `node-wav` or `wavefile` — MiniMax supports `mp3` format natively; WAV PCM conversion is unnecessary
- No `audiobuffer-to-wav` — same reason
- No streaming TTS — REQUIREMENTS.md explicitly defers this to v2 (`EXTV-01`)

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `audio/mpeg` (mp3) output | `audio/wav` (wav, PCM decode) | WAV requires building a 44-byte RIFF header from raw PCM; mp3 is directly playable; use mp3 |
| `URL.createObjectURL` + `new Audio()` | `<audio src={...}>` React element | Both work; objectURL approach avoids React re-render during play and is simpler for one-shot |
| Non-streaming MiniMax call | Streaming TTS (SSE chunks) | Streaming requires assembling hex chunks and complex client buffering; non-streaming is simpler for a single monologue |

---

## Architecture Patterns

### Recommended Project Structure

```
server/src/
├── services/
│   └── tts.ts               # MiniMax T2A v2 service: fetch + hex decode
├── routes/
│   └── narrate.ts           # POST /narrate route handler
└── app.ts                   # Mount narrate router here

client/src/
├── components/
│   └── AudioPlayer.tsx      # Loading state + audio playback on Start Adventure
└── App.tsx                  # Wire AudioPlayer into idle state (replaces plain button)
```

### Pattern 1: MiniMax TTS Service (server)

**What:** Thin service function wrapping the MiniMax T2A v2 API. Returns a `Buffer` of decoded mp3 audio.
**When to use:** Called from the `/narrate` route handler.

```typescript
// Source: MiniMax API docs (platform.minimax.io/docs/api-reference/speech-t2a-http)
// server/src/services/tts.ts

import { config } from './config.js';

export interface TTSResult {
  audioBuffer: Buffer;
  audioFormat: string;
  durationMs: number;
}

export async function generateTTS(text: string): Promise<TTSResult> {
  const url = `https://api.minimax.io/v1/t2a_v2?GroupId=${config.MINIMAX_GROUP_ID}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.MINIMAX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'speech-2.8-hd',
      text,
      stream: false,
      output_format: 'hex',
      voice_setting: {
        voice_id: 'English_Persuasive_Man',
        speed: 0.9,
        vol: 1,
        pitch: -2,
      },
      audio_setting: {
        sample_rate: 32000,
        format: 'mp3',
        channel: 1,
      },
    }),
    signal: AbortSignal.timeout(30_000), // 30s timeout for TTS generation
  });

  if (!response.ok) {
    throw new Error(`MiniMax API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as {
    data: { audio: string; status: number };
    base_resp: { status_code: number; status_msg: string };
    extra_info: { audio_length: number; audio_format: string };
  };

  if (json.base_resp.status_code !== 0) {
    throw new Error(`MiniMax error ${json.base_resp.status_code}: ${json.base_resp.status_msg}`);
  }

  const audioBuffer = Buffer.from(json.data.audio, 'hex');

  return {
    audioBuffer,
    audioFormat: json.extra_info.audio_format ?? 'mp3',
    durationMs: json.extra_info.audio_length ?? 0,
  };
}
```

### Pattern 2: POST /narrate Route (server)

**What:** Express route that calls the TTS service and returns the audio buffer.
**When to use:** Client calls this when "Start Adventure" is clicked.

```typescript
// server/src/routes/narrate.ts

import { Router } from 'express';
import { generateTTS } from '../services/tts.js';

const router = Router();

const OPENING_MONOLOGUE = `Welcome, brave soul. The night is dark, the road is long, and the Shattered Crown tavern stands before you — the last warm light before the wilderness swallows everything. Step inside. Your adventure begins now.`;

router.post(['/narrate', '/api/narrate'], async (_req, res) => {
  try {
    const { audioBuffer, audioFormat } = await generateTTS(OPENING_MONOLOGUE);
    const contentType = audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', audioBuffer.length);
    res.send(audioBuffer);
  } catch (error) {
    console.error('[narrate] TTS generation failed:', error);
    res.status(500).json({ error: 'TTS generation failed' });
  }
});

export default router;
```

Mount in `app.ts`:
```typescript
import narrateRouter from './routes/narrate.js';
// ...
app.use(narrateRouter);
```

### Pattern 3: AudioPlayer Component (client)

**What:** Replaces the plain "Start Adventure" button in idle state. Fetches `/narrate`, creates a Blob URL, plays it. Shows a loading state while generating.
**When to use:** The idle state in `App.tsx`.

Key insight: `audio.play()` MUST be called from within the click handler's async chain — not from a `useEffect`. The browser grants the user gesture trust to the entire async continuation of a click event. The fetch → blob → play sequence works because the `onClick` handler initiates it.

```typescript
// client/src/components/AudioPlayer.tsx

import { useState, useRef } from 'react';

interface AudioPlayerProps {
  onAdventureStart: () => void; // signals App.tsx to show chat UI
}

export function AudioPlayer({ onAdventureStart }: AudioPlayerProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function handleStartAdventure() {
    if (status !== 'idle') return;
    setStatus('loading');

    try {
      const response = await fetch('/api/narrate', { method: 'POST' });
      if (!response.ok) throw new Error(`/narrate returned ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const objectUrl = URL.createObjectURL(blob);

      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      setStatus('playing');
      onAdventureStart(); // show chat UI immediately; audio plays concurrently

      audio.play().catch((err: unknown) => {
        console.error('[AudioPlayer] play() failed:', err);
      });

      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(objectUrl);
        audioRef.current = null;
      });
    } catch (error) {
      console.error('[AudioPlayer] narrate fetch failed:', error);
      setStatus('idle');
      // Degrade gracefully: still start adventure even if TTS fails
      onAdventureStart();
    }
  }

  const label =
    status === 'loading'
      ? 'The Dungeon Master is speaking...'
      : 'Start Adventure';

  return (
    <button
      onClick={handleStartAdventure}
      disabled={status === 'loading'}
      className="font-cinzel text-xl text-parchment px-8 py-4 border border-blood bg-blood/20 hover:bg-blood/40 tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}
```

### Pattern 4: Demo Scenario System Prompt Constraints

**What:** The Bedrock system prompt must be written to anchor the DM to the scripted scenario. Three strategies:
1. Set the opening scene explicitly in the system prompt (location, NPCs, current situation).
2. Provide scripted DM hooks as part of the system prompt (e.g., "On the first player input, introduce Gorm the barkeep's quest").
3. Use a restrictive narration style instruction: "Never change the location; the entire adventure takes place in the Shattered Crown tavern and its immediate exterior."

**Pre-written player inputs for the 3-turn demo:**
```
Turn 1: "I push open the heavy wooden door and enter the tavern, scanning the room."
Turn 2: "I approach the barkeep and ask what work is available."
Turn 3: "I draw my weapon and attack the nearest goblin!" [followed by dice roll]
```

**System prompt outline:**
```
You are the Dungeon Master for a dark fantasy D&D 5e adventure.
Setting: The Shattered Crown tavern, a dimly lit establishment at the edge of the wilderness.
Current scene: The player has just arrived. Gorm the barkeep has a quest involving goblins.
Style: Vivid, immersive, 2-4 sentences per response. Never repeat yourself.
Constraints:
- Stay in the Shattered Crown tavern for the entire session.
- Do NOT introduce new locations.
- When combat occurs, ask the player to roll dice and narrate the outcome based on the roll result they provide.
- When the player provides a dice roll number (1-20), narrate the outcome: 1-5 = failure with consequence, 6-10 = partial success, 11-15 = success, 16-20 = great success with flair.
[LORE CONTEXT]: {neo4j_lore_goes_here}
```

### Anti-Patterns to Avoid

- **Creating AudioContext programmatically outside a click handler:** AudioContext starts in `suspended` state if not user-activated. Use `new Audio(url)` with `.play()` instead — it's simpler and browser-trust is inherited from the click chain.
- **Playing audio from a `useEffect`:** `useEffect` is not a user gesture context. Call `audio.play()` from the async continuation of the click handler.
- **Using WAV format instead of MP3:** MiniMax WAV output requires decoding raw PCM into a RIFF header; mp3 is directly playable by `new Audio()`.
- **Blocking the chat UI until audio completes:** Call `onAdventureStart()` immediately after the fetch completes and the audio starts — do not wait for `audio.onended`. The audio plays concurrently.
- **Failing silently on TTS errors:** The catch block must still call `onAdventureStart()` so the demo continues without voice if TTS fails (CLAUDE.md reliability requirement).
- **Hardcoding the opening monologue text in the client:** The text must live server-side only. The client just POSTs to `/narrate`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PCM → WAV conversion | Custom RIFF header writer | Request `format: 'mp3'` from MiniMax | mp3 is browser-native; WAV requires 44-byte header construction |
| Audio state machine | Complex React audio hook | Inline `useState` + `new Audio()` | Single-shot playback; full audio hook is overkill |
| TTS streaming assembly | Chunk buffer accumulation | Non-streaming MiniMax mode | Single call returns complete audio; streaming needed only for multi-turn TTS (out of scope) |
| Autoplay detection | `navigator.getAutoplayPolicy()` check | Click handler trust chain | Trust is inherited by async continuations of user gesture events; detection adds complexity |

**Key insight:** MiniMax T2A v2 non-streaming returns a complete hex-encoded mp3. The entire server-side implementation is: fetch, check `base_resp.status_code`, `Buffer.from(hex, 'hex')`, `res.send()`. It's a thin wrapper.

---

## Common Pitfalls

### Pitfall 1: Autoplay Blocked on `audio.play()`

**What goes wrong:** `audio.play()` returns a rejected Promise with `NotAllowedError: play() failed because the user didn't interact with the document first.`
**Why it happens:** The audio playback was initiated outside the user gesture trust window — e.g., in a `useEffect` or after an artificial delay.
**How to avoid:** Call `audio.play()` in the async continuation of the click handler. Do NOT detach it with `setTimeout`. The fetch → Blob → Audio chain preserves gesture trust in Chrome.
**Warning signs:** `play()` resolves fine in development (localhost may be allowlisted) but fails in production or when the demo machine has strict Chrome policies.
**Mitigation:** Always catch `play()` rejections and degrade gracefully (still call `onAdventureStart()`).

### Pitfall 2: MiniMax GroupId Missing from Query String

**What goes wrong:** API returns `401 Unauthorized` or a JSON error body with `status_code: 1004`.
**Why it happens:** The GroupId must be passed as a query parameter `?GroupId=...`, not as a header. The `MINIMAX_GROUP_ID` env var must be set and non-empty.
**How to avoid:** Validate `MINIMAX_GROUP_ID` in `requireConfigValues` or `warnOnBlankConfig` at startup (already scaffolded in `server/src/index.ts`).
**Warning signs:** TTS service works in one environment but 401s in another where env vars differ.

### Pitfall 3: MiniMax `base_resp.status_code` Non-Zero Without HTTP Error

**What goes wrong:** The API returns HTTP 200 but the `base_resp.status_code` is non-zero (e.g., `1042` for >10% invalid chars, `2013` for bad params). The audio hex field is empty or missing.
**Why it happens:** MiniMax wraps application-level errors inside a 200 response.
**How to avoid:** Always check `json.base_resp.status_code !== 0` after parsing the response JSON. Throw on non-zero.
**Warning signs:** `Buffer.from(json.data.audio, 'hex')` returns an empty buffer because `json.data.audio` is `""`.

### Pitfall 4: TTS Blocks the Chat UI Start

**What goes wrong:** User clicks "Start Adventure," sees a loading spinner for 5-8 seconds, then both the audio AND the chat UI appear at once. Poor UX.
**Why it happens:** `onAdventureStart()` is called after `audio.play()` finishes (or after `audio.onended`).
**How to avoid:** Call `onAdventureStart()` immediately after starting playback — let the audio play concurrently while the chat UI renders. The DM opening monologue plays as background audio while the user sees the first DM message.

### Pitfall 5: Object URL Leak

**What goes wrong:** Blob URLs accumulate in memory if `URL.revokeObjectURL()` is never called.
**Why it happens:** Developers call `URL.createObjectURL()` but forget to revoke after playback.
**How to avoid:** Call `URL.revokeObjectURL(objectUrl)` in the `audio.addEventListener('ended', ...)` handler. For demo purposes (single session), this is low risk but clean practice.

### Pitfall 6: Demo Drift — DM Goes Off Script

**What goes wrong:** During the live demo, the DM responds to turn 1 by talking about a forest quest instead of the tavern barkeep. The scripted flow breaks.
**Why it happens:** The system prompt is too loose — it sets the scene but doesn't constrain location or NPC behavior strongly enough.
**How to avoid:** Add explicit negative constraints to the system prompt: "Do NOT introduce any location outside the Shattered Crown tavern." Pre-test with the exact 3 player inputs at least twice before the demo. If responses drift, tighten the system prompt further.
**Warning signs:** Test runs produce wildly different second or third responses.

### Pitfall 7: `Content-Type: audio/wav` Sent for MP3 Data

**What goes wrong:** Browser fails to decode the audio or throws a media decode error.
**Why it happens:** `audio_setting.format` is `'mp3'` but the route sends `Content-Type: audio/wav`.
**How to avoid:** Map the format from `extra_info.audio_format` to the correct MIME type: `mp3 → audio/mpeg`, `wav → audio/wav`. Or hardcode `audio/mpeg` when hardcoding the mp3 format in the request.

---

## Code Examples

Verified patterns from official sources:

### MiniMax T2A v2 Non-Streaming Request/Response

```typescript
// Source: platform.minimax.io/docs/api-reference/speech-t2a-http (verified 2026-02-20)

// Request POST https://api.minimax.io/v1/t2a_v2?GroupId={group_id}
// Headers: Authorization: Bearer {api_key}, Content-Type: application/json
const requestBody = {
  model: 'speech-2.8-hd',
  text: 'Your text here',
  stream: false,
  output_format: 'hex',   // returns audio as hex string in data.audio
  voice_setting: {
    voice_id: 'English_Persuasive_Man', // dramatic, commanding English male voice
    speed: 0.9,
    vol: 1,
    pitch: -2,
  },
  audio_setting: {
    sample_rate: 32000,
    format: 'mp3',        // mp3 is directly browser-playable; wav requires RIFF header
    channel: 1,
  },
};

// Response shape:
// {
//   data: { audio: "<hex string>", status: 2 },
//   extra_info: { audio_length: 5000, audio_sample_rate: 32000, audio_format: "mp3", ... },
//   base_resp: { status_code: 0, status_msg: "success" },
//   trace_id: "..."
// }

const audioBuffer = Buffer.from(json.data.audio, 'hex');
```

### Express Route Returning Audio Buffer

```typescript
// Standard Express pattern for binary response
res.setHeader('Content-Type', 'audio/mpeg');
res.setHeader('Content-Length', audioBuffer.length);
res.send(audioBuffer);
```

### Client Fetch → Blob → Audio Play

```typescript
// Source: MDN Web Docs + Chrome autoplay policy docs (verified 2026-02-20)
// Must be called inside a user gesture event handler or its async continuation

const response = await fetch('/api/narrate', { method: 'POST' });
const arrayBuffer = await response.arrayBuffer();
const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
const objectUrl = URL.createObjectURL(blob);

const audio = new Audio(objectUrl);
// play() returns a Promise; Chrome allows this because we're in the
// async continuation of a click event handler
audio.play().catch(err => console.error('play() blocked:', err));
audio.addEventListener('ended', () => URL.revokeObjectURL(objectUrl));
```

### AudioContext Suspend/Resume (reference only — NOT needed for this pattern)

```typescript
// Source: developer.chrome.com/blog/autoplay (verified 2026-02-20)
// This pattern is for Web Audio API AudioContext, NOT needed when using new Audio()
// Shown here for awareness; use new Audio() instead

const ctx = new AudioContext(); // may start suspended
document.querySelector('button').addEventListener('click', () => {
  if (ctx.state === 'suspended') {
    ctx.resume(); // must be inside user gesture handler
  }
});
```

### Available English Voice IDs (MiniMax)

From `platform.minimax.io/docs/api-reference/speech-t2a-http`:
- `English_Persuasive_Man` — commanding, engaging (recommended for DM)
- `English_Insightful_Speaker` — analytical, authoritative
- `English_Graceful_Lady` — refined
- `English_radiant_girl` — bright
- `English_Lucky_Robot` — robotic
- `English_expressive_narrator` — explicitly narrator-style (may not be in all API versions)

**Recommendation:** Use `English_Persuasive_Man` at `speed: 0.9, pitch: -2` for a slow, dramatic dungeon master voice.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TTS returns base64 string | TTS returns hex string (`output_format: 'hex'`) | MiniMax T2A v2 (2024) | `Buffer.from(hex, 'hex')` replaces base64 decode |
| MiniMax API uses `api.minimaxi.chat` domain | Primary: `api.minimax.io`, US-West: `api-uw.minimax.io` | 2024–2025 | Use `api.minimax.io` for global; keep as config constant |
| TTS model `speech-01-hd` | `speech-2.8-hd` (current), `speech-2.8-turbo` (fast) | Mid-2024 | Use `speech-2.8-hd` for quality; `speech-2.8-turbo` if latency is a concern |
| Chrome blocked all audio autoplay | User-gesture inherited by async continuations | Chrome 71+ | `fetch().then(play())` works without explicit `AudioContext.resume()` |

**Deprecated/outdated:**
- `T2A v1` / `speech-01` model: Superseded by v2 / speech-2.x models. Do not use.
- `api.minimaxi.chat` as primary endpoint: The `.io` domain is now primary for international.
- Streaming TTS for every DM turn: Explicitly deferred to v2 (`EXTV-01` in REQUIREMENTS.md). Do not implement.

---

## Open Questions

1. **MiniMax GroupId requirement on newer API versions**
   - What we know: Multiple sources confirm GroupId is a required query parameter on `t2a_v2`. The William Chong blog (2025-06-21) shows `?GroupId=${minimaxGroupId}` in the URL. The official docs page `speech-t2a-http` did not explicitly mention GroupId in the response content retrieved.
   - What's unclear: Whether the newest API endpoint (`speech-2.8-*`) still requires GroupId or if it became optional with API key alone.
   - Recommendation: Include GroupId as a query parameter (it's already in `config.MINIMAX_GROUP_ID`). If it's optional, it causes no harm. If required and omitted, you get a fast 401 that's easy to diagnose.

2. **Voice ID availability across MiniMax account tiers**
   - What we know: The docs list `English_Persuasive_Man` and similar IDs. These are built-in system voices.
   - What's unclear: Whether all voice IDs are available on all API plans, or if some require paid tiers.
   - Recommendation: Implement the TTS service with `English_Persuasive_Man` as default. In the standalone test script (plan 07-01), validate the voice ID by making a real API call before the demo. If it fails, fall back to `English_Insightful_Speaker`.

3. **Datadog `minimax.tts` custom span**
   - What we know: REQUIREMENTS.md `DD-02` requires a named custom span for `minimax.tts`. Phase 6 handles Datadog setup.
   - What's unclear: Whether Phase 6 adds the span infrastructure the TTS service can use, or if Phase 7 must add it independently.
   - Recommendation: The TTS service (`tts.ts`) should be where the `minimax.tts` span is created. Check what Phase 6 delivered and add the span wrapping around the MiniMax fetch call.

4. **Demo setup: Datadog dashboard pre-populated with traces**
   - What we know: Plan 07-03 requires the dashboard to be pre-populated with real traces from a rehearsal run.
   - What's unclear: This is a pre-demo operational step, not a code task. Need to confirm this is just "run the demo twice before the live presentation."
   - Recommendation: Plan 07-03 should be an ops checklist, not a code plan. Include: (a) run 3-turn scripted demo twice, (b) confirm traces appear in Datadog dashboard, (c) screenshot the dashboard in a good state, (d) rehearse the exact player inputs.

---

## Sources

### Primary (HIGH confidence)

- `https://platform.minimax.io/docs/api-reference/speech-t2a-http` — MiniMax T2A v2 endpoint, request body schema, response schema, voice IDs, status codes
- `https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay` — Web Audio API autoplay rules, browser policy conditions
- `https://developer.chrome.com/blog/autoplay` — Chrome autoplay policy detail, `AudioContext.resume()` pattern, async continuation trust

### Secondary (MEDIUM confidence)

- `https://blog.williamchong.cloud/code/2025/06/21/handling-minimax-tts-api-basic-and-streaming.html` (published 2025-06-21) — Confirmed `?GroupId=` query parameter, streaming SSE format, hex-encoded audio chunks, `Buffer.from(hexAudioString, 'hex')` pattern
- `https://github.com/MiniMax-AI/MiniMax-MCP-JS` — Official MiniMax MCP JS repo; confirms hex decode pattern and env var naming

### Tertiary (LOW confidence)

- `https://minimaxaudio.org/api-docs.html` — Third-party docs site (not official); some field names differ from official docs (base64 vs hex). Treat with caution; prefer `platform.minimax.io`.
- WebSearch results on "MiniMax T2A v2 non-streaming response shape" — cross-verified against official docs; hex format confirmed.

---

## Metadata

**Confidence breakdown:**
- MiniMax API integration: HIGH — official docs confirmed endpoint, body shape, response, hex decode, voice IDs
- Web Audio autoplay: HIGH — MDN and Chrome official docs confirmed; click handler chain approach is documented
- System prompt tuning: MEDIUM — best practice from general Claude/LLM DM prompting literature; no official "scripted demo" guide exists; validate during rehearsal
- Voice ID availability: MEDIUM — IDs listed in official docs but account tier availability not confirmed; validate with live API call in standalone test

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (MiniMax API is under active development; re-verify model names after 30 days)
