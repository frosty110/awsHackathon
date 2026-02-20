import { useState, useCallback, useRef } from 'react';
import type { Message } from '../types/chat';

export function useSSEChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const conversationId = useRef<string | null>(null);

  // Internal: fetch /api/chat and stream DM response into a new message bubble.
  // Pass message=null to trigger the opening monologue without a visible player message.
  const fetchDMResponse = useCallback(async (message: string, isSystemTrigger = false) => {
    setIsLoading(true);
    const dmId = crypto.randomUUID();

    // Append an empty streaming DM bubble immediately
    setMessages(prev => [
      ...prev,
      { id: dmId, role: 'dm', content: '', isStreaming: true },
    ]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationId.current,
          message,
          isSystemTrigger,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const payload = part.slice(6).trim();
          if (payload === '[DONE]') break;

          const data = JSON.parse(payload) as {
            conversationId?: string;
            text?: string;
            error?: string;
          };

          if (data.conversationId) {
            conversationId.current = data.conversationId;
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
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === dmId
            ? { ...m, content: 'The Dungeon Master was lost to the void. Please try again.' }
            : m
        )
      );
    } finally {
      // Mark streaming complete
      setMessages(prev =>
        prev.map(m => (m.id === dmId ? { ...m, isStreaming: false } : m))
      );
      setIsLoading(false);
    }
  }, []);

  // Called when "Start Adventure" is clicked — gets opening monologue with no player message shown
  const startAdventure = useCallback(async () => {
    await fetchDMResponse(
      'Begin the adventure. The player has just pushed open the door of the Shattered Crown Tavern. Set the opening scene — describe the tavern atmosphere, mention Gorm behind the bar, and hint that something feels wrong in this town. End with "What do you do?"',
      true
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
    setMessages([]);
    setIsLoading(false);
    conversationId.current = null;
  }, []);

  return { messages, isLoading, sendMessage, startAdventure, reset };
}
