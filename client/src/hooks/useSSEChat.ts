import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message } from '../types/chat';
import type { NarrateResult } from '../components/AudioPlayer';
import type { CharacterClass } from '../components/ClassSelect';
import { playAudio, stopAudio as stopGlobalAudio } from '../services/audioController';
import { changeMood } from '../services/backgroundMusic';
import { changeScene, resetScenes } from '../services/sceneVideo';
import { pushError } from '../services/errorStore';
import { authHeaders, refreshAccessToken } from '../services/auth';
import { MINIMAX_TTS_PER_CHAR, stripTTSTags, expandPhrasesForDisplay } from '@ai-dm/shared-types';

export interface UsageBreakdown {
  bedrockInputTokens: number;
  bedrockOutputTokens: number;
  bedrockCost: number;
  ttsCharacters: number;
  ttsCost: number;
}

const EMPTY_BREAKDOWN: UsageBreakdown = {
  bedrockInputTokens: 0,
  bedrockOutputTokens: 0,
  bedrockCost: 0,
  ttsCharacters: 0,
  ttsCost: 0,
};

function buildUserVisibleError(message: string, requestId?: string) {
  return requestId
    ? `${message} (request: ${requestId})`
    : message;
}

export function useSSEChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const [isLoading, setIsLoading] = useState(false);
  const [usageBreakdown, setUsageBreakdown] = useState<UsageBreakdown>({ ...EMPTY_BREAKDOWN });
  const conversationId = useRef<string | null>(null);
  const characterClassRef = useRef<CharacterClass | null>(null);
  const pronounsRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const audioUrlsRef = useRef<string[]>([]);

  const stopAudio = useCallback(() => {
    stopGlobalAudio();
  }, []);

  const replayMessageAudio = useCallback((messageId: string) => {
    const msg = messagesRef.current.find(m => m.id === messageId);
    if (!msg?.audioUrl) return;
    stopGlobalAudio();
    const audio = new Audio(msg.audioUrl);
    playAudio(audio, messageId);
  }, []);

  const skip = useCallback(() => {
    abortRef.current?.abort();
    stopGlobalAudio();
  }, []);

  // Internal: fetch /api/chat, buffer full text, then reveal text + play audio together.
  const fetchDMResponse = useCallback(async (message: string, diceResult?: number) => {
    abortRef.current?.abort();
    stopGlobalAudio();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;

    setIsLoading(true);
    const dmId = crypto.randomUUID();
    let fullContent = '';
    let ttsText = '';
    let mood: string | undefined;
    let scene: string | undefined;
    let wasAborted = false;
    let streamError: string | undefined;

    // --- 1. Stream Bedrock response, accumulate silently ---
    try {
      const chatBody = JSON.stringify({
        conversationId: conversationId.current,
        message,
        ...(diceResult != null ? { diceResult } : {}),
        ...(characterClassRef.current ? { characterClass: characterClassRef.current.name } : {}),
        ...(pronounsRef.current ? { pronouns: pronounsRef.current } : {}),
      });

      let res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: chatBody,
        signal: controller.signal,
      });

      // If 401, attempt token refresh and retry once
      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: chatBody,
            signal: controller.signal,
          });
        }
      }

      if (!res.ok) {
        let requestId: string | undefined;
        let errorMessage: string;
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          errorMessage = 'The server is temporarily unavailable. Please try again in a moment.';
        } else {
          errorMessage = `HTTP ${res.status}`;
        }
        try {
          const errorBody = await res.json() as { error?: string; requestId?: string };
          requestId = errorBody.requestId;
          if (errorBody.error) errorMessage = errorBody.error;
        } catch { /* best effort */ }
        throw new Error(buildUserVisibleError(errorMessage, requestId));
      }

      if (!res.body) throw new Error('No response body returned from /api/chat');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      readLoop:
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const payload = part.slice(6).trim();
          if (payload === '[DONE]') {
            break readLoop;
          }

          let data: {
            conversationId?: string;
            text?: string;
            ttsText?: string;
            mood?: string;
            moodChange?: string;
            scene?: string;
            error?: string;
            requestId?: string;
            usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
          };
          try {
            data = JSON.parse(payload) as typeof data;
          } catch (error) {
            console.error('[useSSEChat] failed to parse SSE payload', { payload, error });
            continue;
          }

          if (data.conversationId) conversationId.current = data.conversationId;

          if (data.error) {
            console.error('[useSSEChat] server stream error', data);
            streamError = buildUserVisibleError(data.error, data.requestId);
            break readLoop;
          }

          if (data.usage) {
            const u = data.usage;
            setUsageBreakdown(prev => ({
              ...prev,
              bedrockInputTokens: prev.bedrockInputTokens + (u.inputTokens ?? 0),
              bedrockOutputTokens: prev.bedrockOutputTokens + (u.outputTokens ?? 0),
              bedrockCost: prev.bedrockCost + (u.costUsd ?? 0),
            }));
          }

          if (data.moodChange) void changeMood(data.moodChange);

          if (data.ttsText) ttsText = data.ttsText;
          if (data.mood) mood = data.mood;
          if (data.scene) scene = data.scene;

          if (data.text) fullContent += data.text;
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        wasAborted = true;
      } else {
        console.error('[useSSEChat] chat request failed', err);
        // TypeError is thrown by fetch when the server is unreachable (ECONNREFUSED, socket hang up)
        const content = err instanceof TypeError
          ? 'Unable to reach the server. Please check your connection and try again.'
          : err instanceof Error
            ? err.message
            : 'The Dungeon Master was lost to the void. Please try again.';
        setMessages(prev => [
          ...prev,
          { id: dmId, role: 'dm', content },
        ]);
        if (generation === generationRef.current) setIsLoading(false);
        return;
      }
    }

    // Aborted mid-stream: show whatever arrived (if anything), no TTS
    if (wasAborted) {
      if (fullContent) setMessages(prev => [...prev, { id: dmId, role: 'dm', content: stripTTSTags(expandPhrasesForDisplay(fullContent)) }]);
      if (generation === generationRef.current) setIsLoading(false);
      return;
    }

    if (streamError) {
      setMessages(prev => [
        ...prev,
        { id: dmId, role: 'dm', content: streamError },
      ]);
      if (generation === generationRef.current) setIsLoading(false);
      return;
    }

    if (!fullContent || generation !== generationRef.current) {
      if (generation === generationRef.current) setIsLoading(false);
      return;
    }

    // --- 2. Crossfade music to new mood + scene video (starts during TTS generation) ---
    if (mood) void changeMood(mood);
    if (scene) void changeScene(scene);

    // --- 3. Fetch TTS, then reveal text + play audio at the same moment ---
    const ttsPayload = ttsText || fullContent;
    try {
      const ttsRes = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ text: ttsPayload, conversationId: conversationId.current }),
      });

      if (ttsRes.ok && generation === generationRef.current) {
        const ttsChars = ttsPayload.length;
        setUsageBreakdown(prev => ({
          ...prev,
          ttsCharacters: prev.ttsCharacters + ttsChars,
          ttsCost: prev.ttsCost + ttsChars * MINIMAX_TTS_PER_CHAR,
        }));
        const arrayBuffer = await ttsRes.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(blob);
        audioUrlsRef.current.push(audioUrl);
        setMessages(prev => [...prev, { id: dmId, role: 'dm', content: stripTTSTags(expandPhrasesForDisplay(fullContent)), audioUrl }]);
        if (generation === generationRef.current) setIsLoading(false);
        const audio = new Audio(audioUrl);
        playAudio(audio, dmId);
        return;
      } else if (!ttsRes.ok) {
        pushError("Voice", `Narration failed (HTTP ${ttsRes.status})`);
      }
    } catch {
      pushError("Voice", "Network error during narration");
    }

    // TTS unavailable: reveal text without audio
    setMessages(prev => [...prev, { id: dmId, role: 'dm', content: stripTTSTags(expandPhrasesForDisplay(fullContent)) }]);
    if (generation === generationRef.current) setIsLoading(false);
  }, []);

  // Called when "Start Adventure" is clicked.
  // If narration is provided (from /api/narrate Bedrock call), use it directly.
  // Otherwise fall back to a separate /api/chat call.
  const startAdventure = useCallback(async (narration?: NarrateResult & { usage?: { bedrockInputTokens?: number; bedrockOutputTokens?: number; bedrockCostUsd?: number; ttsCharacters?: number; ttsCostUsd?: number; totalCostUsd?: number } }, characterClass?: CharacterClass, pronouns?: string) => {
    if (characterClass) {
      characterClassRef.current = characterClass;
    }
    pronounsRef.current = pronouns ?? null;
    if (narration) {
      conversationId.current = narration.conversationId;
      if (narration.usage) {
        const u = narration.usage;
        setUsageBreakdown(prev => ({
          ...prev,
          bedrockInputTokens: prev.bedrockInputTokens + (u.bedrockInputTokens ?? 0),
          bedrockOutputTokens: prev.bedrockOutputTokens + (u.bedrockOutputTokens ?? 0),
          bedrockCost: prev.bedrockCost + (u.bedrockCostUsd ?? 0),
          ttsCharacters: prev.ttsCharacters + (u.ttsCharacters ?? 0),
          ttsCost: prev.ttsCost + (u.ttsCostUsd ?? 0),
        }));
      }
      if (narration.audioUrl) audioUrlsRef.current.push(narration.audioUrl);
      setMessages([{
        id: crypto.randomUUID(),
        role: 'dm',
        content: narration.text,
        audioUrl: narration.audioUrl,
      }]);
      return;
    }
    // Fallback: generate opening via chat endpoint
    await fetchDMResponse(
      'Begin the adventure. The player has just pushed open the door of the Shattered Crown Tavern. Set the opening scene — describe the tavern atmosphere, mention Gorm behind the bar, and hint that something feels wrong in this town. End with "What do you do?"'
    );
  }, [fetchDMResponse]);

  const sendMessage = useCallback((content: string, diceResult?: number) => {
    const role = content.startsWith('\u{1F3B2}') ? 'dice' : 'player';
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role, content },
    ]);
    void fetchDMResponse(content, diceResult);
  }, [fetchDMResponse]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    stopGlobalAudio();
    resetScenes();
    audioUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    audioUrlsRef.current = [];
    setMessages([]);
    setIsLoading(false);
    setUsageBreakdown({ ...EMPTY_BREAKDOWN });
    conversationId.current = null;
    characterClassRef.current = null;
    pronounsRef.current = null;
  }, []);

  const sessionCost = usageBreakdown.bedrockCost + usageBreakdown.ttsCost;

  return { messages, isLoading, sendMessage, startAdventure, reset, skip, stopAudio, replayMessageAudio, sessionCost, usageBreakdown };
}
