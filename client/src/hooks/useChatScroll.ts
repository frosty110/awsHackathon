import { useRef, useEffect } from 'react';
import type { Message } from '../types/chat';

// Returns a ref to place on a sentinel <div> at the bottom of the message list.
// Scrolls to that sentinel whenever messages change.
// Usage: <div ref={bottomRef} /> as last child of the scrollable container.
export function useChatScroll(messages: Message[]) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return bottomRef;
}
