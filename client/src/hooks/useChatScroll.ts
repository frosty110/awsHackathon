import { useRef, useEffect } from 'react';
import type { Message } from '../types/chat';

// Returns refs for both the bottom sentinel and the scrollable container.
// Only auto-scrolls when the user is within 150px of the bottom, preventing
// jarring jumps when the user has scrolled up to read history.
export function useChatScroll(messages: Message[]) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      // Fallback: always scroll if no container ref attached
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const threshold = 150; // px from bottom
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return { bottomRef, containerRef };
}
