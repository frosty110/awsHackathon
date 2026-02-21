import { useState, useCallback, useRef } from 'react';
import type { Message } from '../types/chat';
import type { NarrateResult } from '../components/AudioPlayer';
import type { CharacterClass } from '../components/ClassSelect';
import { playFromResponse, stopAudio as stopGlobalAudio } from '../services/audioController';

function stripTTSTags(text: string): string {
  return text
    .replace(/^\{\{mood:\w+\}\}\s*/, "")
    .replace(/\{\{voice:\w+\}\}/g, "")
    .replace(/\{\{\/voice\}\}/g, "")
    .replace(/\[(excited|whisper|angry|fearful|sad|shouting)\]\s*/g, "")
    .trim();
}

function buildUserVisibleError(message: string, requestId?: string) {
  return requestId
    ? `${message} (request: ${requestId})`
    : message;
}

export function useSSEChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionCost, setSessionCost] = useState(0);
  const conversationId = useRef<string | null>(null);
  const characterClassRef = useRef<CharacterClass | null>(null);
  const pronounsRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const stopAudio = useCallback(() => {
    stopGlobalAudio();
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
    let wasAborted = false;

    // --- 1. Stream Bedrock response, accumulate silently ---
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationId.current,
          message,
          ...(diceResult != null ? { diceResult } : {}),
          ...(characterClassRef.current ? { characterClass: characterClassRef.current.name } : {}),
          ...(pronounsRef.current ? { pronouns: pronounsRef.current } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let requestId: string | undefined;
        let errorMessage = `HTTP ${res.status}`;
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
            error?: string;
            requestId?: string;
            usage?: { costUsd?: number };
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
            break readLoop;
          }

          if (data.usage?.costUsd) {
            setSessionCost(prev => prev + data.usage!.costUsd!);
          }

          if (data.ttsText) ttsText = data.ttsText;

          if (data.text) fullContent += data.text;
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        wasAborted = true;
      } else {
        console.error('[useSSEChat] chat request failed', err);
        setMessages(prev => [
          ...prev,
          { id: dmId, role: 'dm', content: err instanceof Error ? err.message : 'The Dungeon Master was lost to the void. Please try again.' },
        ]);
        if (generation === generationRef.current) setIsLoading(false);
        return;
      }
    }

    // Aborted mid-stream: show whatever arrived (if anything), no TTS
    if (wasAborted) {
      if (fullContent) setMessages(prev => [...prev, { id: dmId, role: 'dm', content: stripTTSTags(fullContent) }]);
      if (generation === generationRef.current) setIsLoading(false);
      return;
    }

    if (!fullContent || generation !== generationRef.current) {
      if (generation === generationRef.current) setIsLoading(false);
      return;
    }

    // --- 2. Fetch TTS, then reveal text + play audio at the same moment ---
    const ttsPayload = ttsText || fullContent;
    try {
      const ttsRes = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ttsPayload, conversationId: conversationId.current }),
      });

      if (ttsRes.ok && generation === generationRef.current) {
        setMessages(prev => [...prev, { id: dmId, role: 'dm', content: stripTTSTags(fullContent) }]);
        if (generation === generationRef.current) setIsLoading(false);
        await playFromResponse(ttsRes);
        return;
      }
    } catch {
      // TTS failed — fall through to show text without audio
    }

    // TTS unavailable: reveal text without audio
    setMessages(prev => [...prev, { id: dmId, role: 'dm', content: stripTTSTags(fullContent) }]);
    if (generation === generationRef.current) setIsLoading(false);
  }, []);

  // Called when "Start Adventure" is clicked.
  // If narration is provided (from /api/narrate Bedrock call), use it directly.
  // Otherwise fall back to a separate /api/chat call.
  const startAdventure = useCallback(async (narration?: NarrateResult & { usage?: { totalCostUsd?: number } }, characterClass?: CharacterClass, pronouns?: string) => {
    if (characterClass) {
      characterClassRef.current = characterClass;
    }
    pronounsRef.current = pronouns ?? null;
    if (narration) {
      conversationId.current = narration.conversationId;
      if (narration.usage?.totalCostUsd) {
        setSessionCost(prev => prev + narration.usage!.totalCostUsd!);
      }
      setMessages([{
        id: crypto.randomUUID(),
        role: 'dm',
        content: narration.text,
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
    setMessages([]);
    setIsLoading(false);
    setSessionCost(0);
    conversationId.current = null;
    characterClassRef.current = null;
    pronounsRef.current = null;
  }, []);

  return { messages, isLoading, sendMessage, startAdventure, reset, skip, stopAudio, sessionCost };
}
