import type { Message } from '../types/chat';
import { useChatScroll } from '../hooks/useChatScroll';
import { MessageBubble } from './MessageBubble';

interface ChatWindowProps {
  messages: Message[];
  isLoading: boolean;
  onStopAudio: () => void;
}

export function ChatWindow({ messages, isLoading, onStopAudio }: ChatWindowProps) {
  const bottomRef = useChatScroll(messages);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map(message => (
        <MessageBubble key={message.id} message={message} onStopAudio={onStopAudio} />
      ))}

      {isLoading && (
        <div className="flex justify-start mb-3">
          <div className="max-w-[75%] px-4 py-3 rounded-lg bg-dm-bubble text-parchment font-fell italic leading-relaxed animate-pulse-glow">
            The Dungeon Master is thinking...
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
