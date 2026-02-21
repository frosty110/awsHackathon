import { useState, useCallback, useRef } from 'react';
import type { Message } from '../types/chat';
import type { NarrateResult } from '../components/AudioPlayer';
import { playAudio, stopAudio as stopGlobalAudio } from '../services/audioController';

function buildUserVisibleError(message: string, requestId?: string) {
  return requestId
    ? `${message} (request: ${requestId})`
    : message;
}

export function useSSEChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const conversationId = useRef<string | null>(null);
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
  const fetchDMResponse = useCallback(async (message: string) => {
    abortRef.current?.abort();
    stopGlobalAudio();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;

    setIsLoading(true);
    const dmId = crypto.randomUUID();
    let fullContent = '';
    let wasAborted = false;

    // --- 1. Stream Bedrock response, accumulate silently ---
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversationId.current, message }),
        signal: controller.signal,
      });

<<<<<<< HEAD
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
=======
      if (!res.ok) {
        let requestId: string | undefined;
        let errorMessage = `HTTP ${res.status}`;

        try {
          const errorBody = await res.json() as { error?: string; requestId?: string };
          requestId = errorBody.requestId;
          if (errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch {
          // no-op: best effort to read server error payload
        }

        throw new Error(buildUserVisibleError(errorMessage, requestId));
      }

      if (!res.body) {
        throw new Error('No response body returned from /api/chat');
      }
>>>>>>> 147404b45c3aa92e634bf1c885fdec2fbed50938

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamError: string | null = null;
      let streamDone = false;

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
            streamDone = true;
            break readLoop;
          }

          let data: {
            conversationId?: string;
            text?: string;
            error?: string;
            requestId?: string;
          };
          try {
            data = JSON.parse(payload) as {
              conversationId?: string;
              text?: string;
              error?: string;
              requestId?: string;
            };
          } catch (error) {
            console.error('[useSSEChat] failed to parse SSE payload', { payload, error });
            continue;
          }

<<<<<<< HEAD
          if (data.conversationId) conversationId.current = data.conversationId;
          if (data.text) fullContent += data.text;
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        wasAborted = true;
      } else {
        setMessages(prev => [
          ...prev,
          { id: dmId, role: 'dm', content: 'The Dungeon Master was lost to the void. Please try again.' },
        ]);
        if (generation === generationRef.current) setIsLoading(false);
        return;
      }
=======
          if (data.conversationId) {
            conversationId.current = data.conversationId;
          }

          if (data.error) {
            streamError = buildUserVisibleError(data.error, data.requestId);
            console.error('[useSSEChat] server stream error', data);
            break readLoop;
          }

          if (data.text) {
            setMessages(prev =>
              prev.map(m =>
                m.id === dmId
                  ? { ...m, content: m.content + data.text }
                  : m
              )
            );
          }
        }
      }
      if (streamError) {
        if (!streamDone) {
          await reader.cancel().catch(() => undefined);
        }
        setMessages(prev =>
          prev.map(m =>
            m.id === dmId
              ? {
                ...m,
                content: m.content
                  ? `${m.content}\n\n[Stream error] ${streamError}`
                  : streamError,
              }
              : m
          )
        );
      }
    } catch (error) {
      console.error('[useSSEChat] chat request failed', error);
      const fallbackMessage = error instanceof Error && error.message
        ? error.message
        : 'The Dungeon Master was lost to the void. Please try again.';
      setMessages(prev =>
        prev.map(m =>
          m.id === dmId
            ? { ...m, content: fallbackMessage }
            : m
        )
      );
    } finally {
      // Mark streaming complete
      setMessages(prev =>
        prev.map(m => (m.id === dmId ? { ...m, isStreaming: false } : m))
      );
      setIsLoading(false);
>>>>>>> 147404b45c3aa92e634bf1c885fdec2fbed50938
    }

    // Aborted mid-stream: show whatever arrived (if anything), no TTS
    if (wasAborted) {
      if (fullContent) setMessages(prev => [...prev, { id: dmId, role: 'dm', content: fullContent }]);
      if (generation === generationRef.current) setIsLoading(false);
      return;
    }

    if (!fullContent || generation !== generationRef.current) {
      if (generation === generationRef.current) setIsLoading(false);
      return;
    }

    // --- 2. Fetch TTS, then reveal text + play audio at the same moment ---
    try {
      const ttsRes = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullContent }),
      });

      if (ttsRes.ok && generation === generationRef.current) {
        const arrayBuffer = await ttsRes.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.addEventListener('ended', () => URL.revokeObjectURL(url));

        setMessages(prev => [...prev, { id: dmId, role: 'dm', content: fullContent }]);
        if (generation === generationRef.current) setIsLoading(false);
        playAudio(audio);
        return;
      }
    } catch {
      // TTS failed — fall through to show text without audio
    }

    // TTS unavailable: reveal text without audio
    setMessages(prev => [...prev, { id: dmId, role: 'dm', content: fullContent }]);
    if (generation === generationRef.current) setIsLoading(false);
  }, []);

  // Called when "Start Adventure" is clicked.
  // If narration is provided (from /api/narrate Bedrock call), use it directly.
  // Otherwise fall back to a separate /api/chat call.
  const startAdventure = useCallback(async (narration?: NarrateResult) => {
    if (narration) {
      conversationId.current = narration.conversationId;
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

  const sendMessage = useCallback((content: string) => {
    const role = content.startsWith('\u{1F3B2}') ? 'dice' : 'player';
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role, content },
    ]);
    void fetchDMResponse(content);
  }, [fetchDMResponse]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    stopGlobalAudio();
    setMessages([]);
    setIsLoading(false);
    conversationId.current = null;
  }, []);

  return { messages, isLoading, sendMessage, startAdventure, reset, skip, stopAudio };
}
