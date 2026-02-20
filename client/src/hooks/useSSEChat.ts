import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message } from '../types/chat';

// Thematic mock DM responses for Phase 2 stub (tavern arrival, barkeep quest, goblin combat)
const MOCK_RESPONSES: string[] = [
  "The door to the Shattered Crown tavern groans as you push it open. Stale ale and pipe smoke fill your lungs. A dozen pairs of eyes turn your way.",
  'Gorm the barkeep eyes you from behind the weathered bar, wiping a mug with a rag that looks dirtier than the mug. "Looking for work, stranger? Got a job that pays well... if you\'re still breathing after."',
  "From the shadows at the far end of the tavern, a guttural screech splits the air. Goblins — three of them — leap onto the tables, blades glinting in the firelight!",
];

// STUB — Phase 4 replaces the mock delay block with real SSE fetch.
// The external interface { messages, isLoading, sendMessage, reset } MUST remain stable.
export function useSSEChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Track pending mock response timeout to allow cancellation on reset and unmount
  const pendingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount — prevent stale DM messages from firing after component teardown
  useEffect(() => {
    return () => {
      if (pendingTimeout.current !== null) {
        clearTimeout(pendingTimeout.current);
      }
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    // Dice emoji prefix distinguishes dice roll messages from regular player messages
    const role = content.startsWith('\u{1F3B2}') ? 'dice' : 'player';
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role,
      content,
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    // Clear any existing pending timeout before starting a new one
    if (pendingTimeout.current !== null) {
      clearTimeout(pendingTimeout.current);
    }

    // Phase 2 stub — Phase 4 replaces this block with real SSE fetch
    pendingTimeout.current = setTimeout(() => {
      pendingTimeout.current = null;
      const dmMsg: Message = {
        id: crypto.randomUUID(),
        role: 'dm',
        content: MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)],
      };
      setMessages(prev => [...prev, dmMsg]);
      setIsLoading(false);
    }, 1200); // ~Bedrock response time simulation
  }, []);

  const reset = useCallback(() => {
    // Cancel any pending mock response before clearing state
    if (pendingTimeout.current !== null) {
      clearTimeout(pendingTimeout.current);
      pendingTimeout.current = null;
    }
    setMessages([]);
    setIsLoading(false);
  }, []);

  return { messages, isLoading, sendMessage, reset };
}
