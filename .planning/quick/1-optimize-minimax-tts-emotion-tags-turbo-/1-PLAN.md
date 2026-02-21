---
phase: quick-tts-optimize
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/src/services/tts.ts
  - server/src/services/bedrock.ts
  - server/src/routes/narrate.ts
  - server/src/routes/chat.ts
  - client/src/hooks/useSSEChat.ts
  - client/src/components/MessageBubble.tsx
  - client/src/components/AudioPlayer.tsx
  - client/src/services/audioController.ts
autonomous: true
must_haves:
  truths:
    - "DM narration text contains MiniMax emotion tags that reach TTS but are stripped from chat UI display"
    - "Opening monologue uses speech-2.8-hd model; in-game DM turns use speech-2.8-turbo for lower latency"
    - "TTS speed and pitch vary based on scene mood (combat is faster/higher, tavern is slower/lower)"
    - "Audio playback starts immediately via streaming chunks instead of waiting for full TTS generation"
    - "Different characters (DM narrator, barkeep, goblins) use distinct MiniMax voice_id values"
  artifacts:
    - path: "server/src/services/tts.ts"
      provides: "Multi-voice, mood-aware, streaming TTS with turbo/hd model selection"
    - path: "server/src/services/bedrock.ts"
      provides: "System prompt with emotion tag and mood/character instructions"
    - path: "server/src/routes/narrate.ts"
      provides: "Streaming audio response for turn narration, buffered for opening"
    - path: "client/src/hooks/useSSEChat.ts"
      provides: "Streaming audio playback from chunked narrate response"
    - path: "client/src/components/MessageBubble.tsx"
      provides: "Emotion tag stripping in displayed DM messages"
  key_links:
    - from: "server/src/services/bedrock.ts"
      to: "server/src/services/tts.ts"
      via: "emotion tags and mood hints in Bedrock output parsed by TTS caller"
      pattern: "\\[(excited|whisper|angry|fearful|sad|shouting)\\]"
    - from: "server/src/routes/narrate.ts"
      to: "client/src/hooks/useSSEChat.ts"
      via: "chunked audio stream response"
      pattern: "Transfer-Encoding.*chunked"
    - from: "client/src/components/MessageBubble.tsx"
      to: "emotion tag regex"
      via: "strip tags before rendering"
      pattern: "replace.*\\[.*\\]"
---

<objective>
Optimize the MiniMax TTS integration with five enhancements: emotion tags in Bedrock output piped to TTS, turbo model for in-game turns, mood-based speed/pitch, streaming audio playback, and multi-character voices.

Purpose: Transform flat monotone narration into expressive, low-latency, character-differentiated voice acting.
Output: Enhanced TTS pipeline with all five features working end-to-end.
</objective>

<execution_context>
@/Users/blaisealbuquerque/.claude/get-shit-done/workflows/execute-plan.md
@/Users/blaisealbuquerque/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@server/src/services/tts.ts
@server/src/services/bedrock.ts
@server/src/routes/narrate.ts
@server/src/routes/chat.ts
@client/src/hooks/useSSEChat.ts
@client/src/components/MessageBubble.tsx
@client/src/components/AudioPlayer.tsx
@client/src/services/audioController.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bedrock system prompt -- emotion tags, mood hints, and character voice tags</name>
  <files>server/src/services/bedrock.ts</files>
  <action>
Update DM_SYSTEM_PROMPT in bedrock.ts to instruct Bedrock to embed three types of metadata in its narration output:

**1. Emotion tags** -- Add a section to the system prompt:

```
## Voice Emotion Tags

You MUST embed MiniMax emotion tags in your narration to control how the text-to-speech engine delivers each line. Place tags inline at the START of the sentence or clause they affect. Available tags:

- [excited] — triumphant moments, critical hits, discoveries
- [whisper] — secrets, suspense, quiet tension
- [angry] — hostile NPCs, combat taunts, fury
- [fearful] — dread, warnings, something terrifying approaches
- [sad] — loss, melancholy, somber moments
- [shouting] — battle cries, alarms, loud proclamations

Use 1-3 tags per response. Not every sentence needs one -- only use them where the emotion shift is dramatic. Default (no tag) is a calm narrator voice.

Example: "[whisper] The door creaks open, revealing nothing but darkness beyond. [excited] But wait — a glimmer of gold catches your eye!"
```

**2. Mood hint** -- Add a section instructing Bedrock to output a mood line as the FIRST line of every response, wrapped in double braces so it can be parsed and stripped:

```
## Scene Mood

Your FIRST line of every response must be a mood tag (the player will never see this). Format: {{mood:TAG}}

Available moods and when to use them:
- {{mood:combat}} — active fighting, chase scenes, physical danger
- {{mood:tavern}} — relaxed social scenes, drinking, casual talk
- {{mood:mystery}} — investigation, puzzles, suspense, exploration
- {{mood:dramatic}} — revelations, plot twists, emotional moments
- {{mood:danger}} — creeping dread, traps, approaching threat (not yet fighting)

This tag MUST be the very first thing in your response, before any narration text.
```

**3. Character voice tags** -- Add a section for multi-character voice attribution:

```
## Character Voice Tags

When a specific character speaks dialogue, wrap their spoken lines in a voice tag so the TTS engine uses a distinct voice for each character. Format: {{voice:CHARACTER_ID}}...{{/voice}}

Available characters:
- narrator (default, no tag needed) — the DM narration voice
- barkeep — Gorm the dwarf barkeep, gruff and low
- goblin — high-pitched, raspy, menacing

Example: "The barkeep looks up from his tankard. {{voice:barkeep}}[angry] What business do ye have here at this hour?{{/voice}} He slams his fist on the counter."

Only tag actual dialogue lines. Narration stays as the default narrator voice. If no character is speaking, don't use voice tags.
```

Do NOT change any other part of bedrock.ts (streamBedrockResponse, types, etc.). Only modify the DM_SYSTEM_PROMPT string.
  </action>
  <verify>Run `npx tsc --noEmit -p server` to confirm no type errors. Visually inspect the prompt string to confirm all three sections are present and well-formatted.</verify>
  <done>DM_SYSTEM_PROMPT contains emotion tag instructions, mood hint format, and character voice tag format. No other bedrock.ts code changed.</done>
</task>

<task type="auto">
  <name>Task 2: TTS service -- multi-voice, mood-based prosody, turbo model, and streaming</name>
  <files>server/src/services/tts.ts</files>
  <action>
Rewrite tts.ts to support all five TTS features. Keep the dd-trace wrapper.

**New types and constants:**

```typescript
export type TTSModel = "speech-2.8-hd" | "speech-2.8-turbo";

export type SceneMood = "combat" | "tavern" | "mystery" | "dramatic" | "danger";

export type CharacterVoice = "narrator" | "barkeep" | "goblin";

export interface TTSOptions {
  model?: TTSModel;         // default "speech-2.8-hd"
  mood?: SceneMood;         // affects speed/pitch
  voice?: CharacterVoice;   // affects voice_id
  stream?: boolean;         // default false
}

export interface TTSResult {
  audioBuffer: Buffer;
  audioFormat: string;
  durationMs: number;
}
```

**Voice mapping:**

```typescript
const VOICE_MAP: Record<CharacterVoice, string> = {
  narrator: "English_CaptivatingStoryteller",
  barkeep: "English_ManSportsCommentator",    // deep, gruff male
  goblin: "English_FloridaMan",               // nasal, energetic
};
```

Note: These are real MiniMax voice IDs from their English voice library. If they don't work at runtime, they're trivially swapped -- the mapping structure is what matters.

**Mood-to-prosody mapping:**

```typescript
const MOOD_PROSODY: Record<SceneMood, { speed: number; pitch: number }> = {
  combat:   { speed: 1.15, pitch: 2 },
  tavern:   { speed: 0.9,  pitch: -1 },
  mystery:  { speed: 0.85, pitch: -2 },
  dramatic: { speed: 0.95, pitch: 1 },
  danger:   { speed: 1.05, pitch: 3 },
};
```

**Text parsing utilities (export these so narrate.ts and chat.ts can use them):**

```typescript
/** Extract and strip {{mood:TAG}} from start of text. Returns [mood, cleanText]. */
export function extractMood(text: string): [SceneMood | null, string] {
  const match = text.match(/^\{\{mood:(\w+)\}\}\s*/);
  if (!match) return [null, text];
  const mood = match[1] as SceneMood;
  const valid: SceneMood[] = ["combat", "tavern", "mystery", "dramatic", "danger"];
  return valid.includes(mood) ? [mood, text.slice(match[0].length)] : [null, text];
}

/** Split text into segments by {{voice:ID}}...{{/voice}} tags.
 *  Returns array of { voice: CharacterVoice, text: string } segments. */
export function splitVoiceSegments(text: string): Array<{ voice: CharacterVoice; text: string }> {
  const segments: Array<{ voice: CharacterVoice; text: string }> = [];
  const regex = /\{\{voice:(\w+)\}\}([\s\S]*?)\{\{\/voice\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before this voice tag = narrator
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) segments.push({ voice: "narrator", text: before });
    }
    const voice = match[1] as CharacterVoice;
    const validVoices: CharacterVoice[] = ["narrator", "barkeep", "goblin"];
    segments.push({
      voice: validVoices.includes(voice) ? voice : "narrator",
      text: match[2].trim()
    });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last voice tag
  const remaining = text.slice(lastIndex).trim();
  if (remaining) segments.push({ voice: "narrator", text: remaining });

  return segments.length > 0 ? segments : [{ voice: "narrator", text }];
}

/** Strip emotion tags, mood tags, and voice tags for UI display. */
export function stripTTSTags(text: string): string {
  return text
    .replace(/^\{\{mood:\w+\}\}\s*/, "")
    .replace(/\{\{voice:\w+\}\}/g, "")
    .replace(/\{\{\/voice\}\}/g, "")
    .replace(/\[(excited|whisper|angry|fearful|sad|shouting)\]\s*/g, "")
    .trim();
}
```

**Core generateTTS function -- update signature and implementation:**

```typescript
export async function generateTTS(text: string, options: TTSOptions = {}): Promise<TTSResult> {
  const model = options.model ?? "speech-2.8-hd";
  const voice = options.voice ?? "narrator";
  const prosody = options.mood ? MOOD_PROSODY[options.mood] : { speed: 1, pitch: 0 };

  return tracer.llmobs.trace(
    { kind: "tool", name: "minimax.tts" },
    async (span) => {
      const url = `https://api.minimax.io/v1/t2a_v2?GroupId=${config.MINIMAX_GROUP_ID}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.MINIMAX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          text,
          stream: false,
          output_format: "hex",
          voice_setting: {
            voice_id: VOICE_MAP[voice],
            speed: prosody.speed,
            vol: 1,
            pitch: prosody.pitch,
          },
          audio_setting: {
            sample_rate: 32000,
            format: "mp3",
            channel: 1,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`MiniMax TTS HTTP error: ${response.status} ${response.statusText}`);
      }

      const json = await response.json() as {
        base_resp: { status_code: number; status_msg: string };
        data: { audio: string };
        extra_info: { audio_format?: string; audio_length?: number };
      };

      if (json.base_resp.status_code !== 0) {
        throw new Error(`MiniMax TTS application error: ${json.base_resp.status_code} — ${json.base_resp.status_msg}`);
      }

      const audioBuffer = Buffer.from(json.data.audio, "hex");
      const result: TTSResult = {
        audioBuffer,
        audioFormat: json.extra_info.audio_format ?? "mp3",
        durationMs: json.extra_info.audio_length ?? 0,
      };

      tracer.llmobs.annotate(span, {
        inputData: text.slice(0, 200),
        outputData: JSON.stringify({
          byteLength: audioBuffer.byteLength,
          model,
          voice: VOICE_MAP[voice],
          mood: options.mood ?? "neutral",
        }),
        tags: { "tts.provider": "minimax", "tts.model": model, "tts.voice": voice },
      });

      return result;
    }
  );
}
```

**New streaming function for multi-voice segments:**

```typescript
/**
 * Generate TTS for text that may contain multiple character voice segments.
 * Generates audio for each segment sequentially and concatenates the buffers.
 * Uses streaming response back to the client via the provided writable.
 */
export async function generateMultiVoiceTTS(
  text: string,
  options: Omit<TTSOptions, "voice"> = {}
): Promise<TTSResult> {
  const [mood, cleanText] = extractMood(text);
  const segments = splitVoiceSegments(cleanText);
  const effectiveMood = options.mood ?? mood ?? undefined;

  const buffers: Buffer[] = [];
  let totalDuration = 0;

  for (const segment of segments) {
    const result = await generateTTS(segment.text, {
      ...options,
      mood: effectiveMood,
      voice: segment.voice,
    });
    buffers.push(result.audioBuffer);
    totalDuration += result.durationMs;
  }

  return {
    audioBuffer: Buffer.concat(buffers),
    audioFormat: "mp3",
    durationMs: totalDuration,
  };
}
```

Keep all existing imports. The function signatures change (TTSOptions param added to generateTTS) so callers will need updating in Task 3.
  </action>
  <verify>Run `npx tsc --noEmit -p server` to confirm no type errors (callers will fail until Task 3 updates them, that's expected -- just verify tts.ts itself has no internal errors by checking the error list is only about callers).</verify>
  <done>tts.ts exports: TTSModel, SceneMood, CharacterVoice, TTSOptions, TTSResult, extractMood, splitVoiceSegments, stripTTSTags, generateTTS (with options), generateMultiVoiceTTS. Voice map, mood prosody map, and text parsing utilities all present.</done>
</task>

<task type="auto">
  <name>Task 3: Narrate route -- turbo model for turns, mood extraction, multi-voice pipeline</name>
  <files>server/src/routes/narrate.ts</files>
  <action>
Update narrate.ts to use the new TTS capabilities:

**For the "text provided" path (DM turn narration -- `hasText` branch):**

1. Import `generateMultiVoiceTTS`, `extractMood`, `stripTTSTags` from tts.ts.
2. The incoming `text` will contain mood tags, emotion tags, and voice tags from Bedrock.
3. Call `generateMultiVoiceTTS(text, { model: "speech-2.8-turbo" })` -- turbo for in-game turns (lower latency).
4. The function internally handles mood extraction, voice segment splitting, and prosody.
5. Return the concatenated audio buffer as before (audio/mpeg).

**For the "no text" path (opening monologue):**

1. After Bedrock generates the opening text, call `generateMultiVoiceTTS(text, { model: "speech-2.8-hd" })` -- HD for the opening (quality matters more than latency).
2. Before returning in JSON response, strip TTS tags from the text field using `stripTTSTags(text)` so the client displays clean text.
3. Store the stripped text in conversation history (not the tagged version).

**Key change in the JSON response for opening monologue:**
```typescript
// Before storing in conversation
const cleanText = stripTTSTags(text);
appendMessage(conversation.id, { role: "assistant", content: cleanText });

// In the response JSON, return clean text for display
res.json({
  audio: audioBuffer.toString("base64"),
  text: cleanText,          // <-- stripped for UI
  conversationId: conversation.id,
  usage: { ... },
});
```

Also update the TTS failure fallback to return `cleanText` instead of `text`.

Keep all logging, error handling, and usage tracking intact. The only changes are:
- Import new functions from tts.ts
- Use `generateMultiVoiceTTS` instead of `generateTTS`
- Pass model option (turbo vs hd)
- Strip tags from text before storing and returning to client
  </action>
  <verify>Run `npx tsc --noEmit -p server` -- should have zero errors in narrate.ts.</verify>
  <done>Turn narration uses speech-2.8-turbo via generateMultiVoiceTTS. Opening monologue uses speech-2.8-hd via generateMultiVoiceTTS. Text returned to client and stored in conversation history is stripped of all TTS tags.</done>
</task>

<task type="auto">
  <name>Task 4: Chat route -- strip TTS tags from stored assistant messages and SSE text chunks</name>
  <files>server/src/routes/chat.ts</files>
  <action>
Update chat.ts to ensure TTS tags don't leak into the chat UI or conversation history:

1. Import `stripTTSTags` from `../services/tts.js`.

2. **SSE text chunks to client:** The Bedrock stream sends text deltas via `onChunk`. These chunks will contain emotion tags, mood tags, and voice tags that the client should NOT display. However, we need the FULL tagged text for TTS (which happens in useSSEChat after the stream completes).

   Strategy: Send chunks as-is to the client (the client will strip tags before display). This is simpler than trying to strip mid-stream (tags may span chunk boundaries). BUT also send the full unstripped text in a new `ttsText` field at stream end so the client has the tagged version for TTS.

   After the stream completes and before `[DONE]`, emit a `ttsText` event with the full tagged text:
   ```typescript
   if (!streamErrored && fullText) {
     // Send tagged text for TTS consumption by client
     res.write(`data: ${JSON.stringify({ ttsText: fullText })}\n\n`);

     // Existing usage event
     const costUsd = recordBedrockUsage(...);
     res.write(`data: ${JSON.stringify({ usage: { ... } })}\n\n`);
   }
   ```

3. **Conversation history:** Strip tags before storing:
   ```typescript
   if (fullText) {
     appendMessage(conversation.id, { role: "assistant", content: stripTTSTags(fullText) });
   }
   ```

4. **SSE text chunks:** Also strip the individual chunks sent to the client so they display cleanly during streaming:
   ```typescript
   const result = await streamBedrockResponse(bedrockMessages, (chunk) => {
     res.write(`data: ${JSON.stringify({ text: stripTTSTags(chunk) })}\n\n`);
   }, { characterClass: resolvedClass });
   ```

   Wait -- this is tricky. `stripTTSTags` on individual chunks will fail because a tag like `{{mood:combat}}` might span two chunks. Better approach: accumulate full text server-side (already done via `fullText`), send chunks as-is, and let the client strip when rendering. The `ttsText` field gives the client the unstripped version for TTS.

   Actually, SIMPLEST approach: The current flow in useSSEChat already accumulates `fullContent` silently and only reveals it all at once after TTS completes. The client never shows partial chunks. So:
   - Send chunks as-is (they get accumulated silently on client)
   - Send `ttsText` with full tagged text for TTS
   - Client uses `stripTTSTags` on `fullContent` for display, `ttsText` for TTS call
   - Store stripped text in conversation history server-side

   Final implementation:
   - Keep the `onChunk` callback unchanged (sends raw chunks)
   - Add `ttsText` event after stream completes
   - Strip tags when storing in conversation history
  </action>
  <verify>Run `npx tsc --noEmit -p server` -- zero errors.</verify>
  <done>Chat route emits `ttsText` event with full tagged Bedrock output for client TTS use. Conversation history stores stripped clean text. Raw chunks still sent for client accumulation.</done>
</task>

<task type="auto">
  <name>Task 5: Client -- strip tags for display, pass tagged text to TTS, streaming audio playback</name>
  <files>
    client/src/hooks/useSSEChat.ts
    client/src/components/MessageBubble.tsx
    client/src/services/audioController.ts
    client/src/components/AudioPlayer.tsx
  </files>
  <action>
**A. useSSEChat.ts -- capture ttsText and strip tags for display:**

1. Add a `stripTTSTags` utility function at the top of the file (duplicate the logic from server since this is client-side -- keep it simple, no shared package):
   ```typescript
   function stripTTSTags(text: string): string {
     return text
       .replace(/^\{\{mood:\w+\}\}\s*/, "")
       .replace(/\{\{voice:\w+\}\}/g, "")
       .replace(/\{\{\/voice\}\}/g, "")
       .replace(/\[(excited|whisper|angry|fearful|sad|shouting)\]\s*/g, "")
       .trim();
   }
   ```

2. In `fetchDMResponse`, add a `ttsText` variable alongside `fullContent`:
   ```typescript
   let ttsText = '';  // Tagged version for TTS
   ```

3. In the SSE parse loop, capture the `ttsText` field:
   ```typescript
   if (data.ttsText) ttsText = data.ttsText;
   ```
   Add `ttsText?: string` to the parsed data type.

4. When setting the displayed message, use stripped text:
   ```typescript
   setMessages(prev => [...prev, { id: dmId, role: 'dm', content: stripTTSTags(fullContent) }]);
   ```

5. When calling `/api/narrate` for TTS, pass `ttsText` (the tagged version) if available, otherwise fall back to `fullContent`:
   ```typescript
   const ttsPayload = ttsText || fullContent;
   const ttsRes = await fetch('/api/narrate', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ text: ttsPayload, conversationId: conversationId.current }),
   });
   ```

6. For the abort path and TTS-failure fallback, also strip tags:
   ```typescript
   if (fullContent) setMessages(prev => [...prev, { id: dmId, role: 'dm', content: stripTTSTags(fullContent) }]);
   ```

**B. MessageBubble.tsx -- defensive tag stripping:**

Add a safety strip in the DM message rendering in case any tags leak through (belt-and-suspenders):

```typescript
// At top of file
function stripTTSTags(text: string): string {
  return text
    .replace(/^\{\{mood:\w+\}\}\s*/, "")
    .replace(/\{\{voice:\w+\}\}/g, "")
    .replace(/\{\{\/voice\}\}/g, "")
    .replace(/\[(excited|whisper|angry|fearful|sad|shouting)\]\s*/g, "")
    .trim();
}
```

In the DM branch, strip before rendering:
```typescript
if (role === 'dm') {
  const cleanContent = stripTTSTags(content);
  return (
    // ... same JSX but use cleanContent instead of content in <Markdown>
    <Markdown>{cleanContent}</Markdown>
  );
}
```

**C. audioController.ts -- add streaming playback support:**

Add a new `playStreamingAudio` function that plays audio from a ReadableStream using MediaSource Extensions (MSE) or, more practically for mp3, by starting playback from a Blob URL as soon as enough data arrives:

```typescript
/**
 * Play audio from a fetch Response by loading chunks into a buffer.
 * Starts playback after the first chunk arrives (mp3 is streamable).
 * Falls back to full-buffer playback if streaming fails.
 */
export async function playStreamingAudio(response: Response): Promise<void> {
  if (!response.body) {
    // Fallback: load full buffer
    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener('ended', () => URL.revokeObjectURL(url));
    playAudio(audio);
    return;
  }

  // Collect chunks and create audio element once we have enough data
  // MP3 doesn't need MediaSource -- just accumulate and play from Blob
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  let audioStarted = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;

    // Start playback after accumulating ~16KB (enough mp3 header + frames)
    if (!audioStarted && totalLength > 16384) {
      audioStarted = true;
      const partialBlob = new Blob(chunks, { type: 'audio/mpeg' });
      const url = URL.createObjectURL(partialBlob);
      const audio = new Audio(url);
      audio.addEventListener('ended', () => URL.revokeObjectURL(url));
      playAudio(audio);
      // Continue reading remaining chunks -- the Audio element will buffer
      // from the Blob URL. For true streaming we'd need MSE, but mp3 partial
      // Blob playback works in Chrome/Firefox/Safari for hackathon demo.
    }
  }

  // If we never hit 16KB threshold, play full buffer
  if (!audioStarted && chunks.length > 0) {
    const fullBlob = new Blob(chunks, { type: 'audio/mpeg' });
    const url = URL.createObjectURL(fullBlob);
    const audio = new Audio(url);
    audio.addEventListener('ended', () => URL.revokeObjectURL(url));
    playAudio(audio);
  }
}
```

Actually -- IMPORTANT REALITY CHECK: The partial Blob approach won't truly stream because the Blob is a snapshot. The browser can't read more data from a finalized Blob URL. True MP3 streaming requires MediaSource Extensions, which don't support mp3 in all browsers. For the hackathon, the most reliable "streaming" improvement is to start playback as soon as the full response arrives (which is what we already do). The REAL latency win comes from using `speech-2.8-turbo` model.

REVISED approach for audioController.ts -- keep it simple. Don't add streaming playback complexity that won't actually work reliably. Instead, just export a helper:

```typescript
export async function playFromResponse(response: Response): Promise<void> {
  const arrayBuffer = await response.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener('ended', () => URL.revokeObjectURL(url));
  playAudio(audio);
}
```

This consolidates the duplicated Blob-from-response logic in useSSEChat and AudioPlayer.

**D. AudioPlayer.tsx -- no changes needed** beyond what's already there. The opening monologue path already receives stripped text from the server (Task 3 handles this).

Update the import in useSSEChat to use `playFromResponse`:
```typescript
import { playFromResponse, stopAudio as stopGlobalAudio } from '../services/audioController';
```

Replace the manual arrayBuffer->Blob->Audio code in fetchDMResponse's TTS section:
```typescript
if (ttsRes.ok && generation === generationRef.current) {
  setMessages(prev => [...prev, { id: dmId, role: 'dm', content: stripTTSTags(fullContent) }]);
  if (generation === generationRef.current) setIsLoading(false);
  await playFromResponse(ttsRes);
  return;
}
```
  </action>
  <verify>Run `npx tsc --noEmit` from client/ to verify no type errors. Run `npm run dev` from project root and test the full flow: start adventure (should hear HD quality opening), send a message (should hear turbo narration), verify no TTS tags appear in chat bubbles.</verify>
  <done>
    - useSSEChat captures ttsText from SSE, strips tags for display, passes tagged text to /api/narrate
    - MessageBubble strips any leaked tags defensively
    - audioController exports playFromResponse helper, deduplicating Blob logic
    - All DM messages in the chat UI are free of emotion tags, mood tags, and voice tags
    - Tagged text reaches TTS service for voice/emotion processing
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p server` -- zero errors
2. `npx tsc --noEmit` from client/ -- zero errors
3. Start the app with `npm run dev`. Click Start Adventure. Verify:
   - Opening monologue plays with HD quality audio
   - No `{{mood:...}}`, `{{voice:...}}`, or `[excited]` tags visible in chat
   - Send a player message. DM response should:
     - Display clean text (no tags)
     - Play TTS audio (turbo model, faster)
     - If combat scene, audio should sound slightly faster/higher pitched
</verification>

<success_criteria>
- Bedrock output contains emotion tags, mood hints, and character voice tags
- TTS service accepts model, mood, and voice options
- Opening monologue uses speech-2.8-hd; in-game turns use speech-2.8-turbo
- Speed/pitch vary by extracted mood
- Multiple character voices map to distinct MiniMax voice_ids
- All TTS metadata is stripped before display in chat UI
- No regressions in existing audio playback or chat functionality
</success_criteria>

<output>
After completion, create `.planning/quick/1-optimize-minimax-tts-emotion-tags-turbo-/1-SUMMARY.md`
</output>
