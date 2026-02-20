import type { Message } from '../types/chat';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content } = message;

  if (role === 'dm') {
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[75%] px-4 py-3 rounded-lg bg-dm-bubble text-parchment font-fell italic leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  if (role === 'dice') {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[75%] px-4 py-3 rounded-lg bg-blood/70 text-parchment font-sans font-semibold border border-blood-light">
          {content}
        </div>
      </div>
    );
  }

  // role === 'player'
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[75%] px-4 py-3 rounded-lg bg-player-bubble text-parchment font-sans text-sm">
        {content}
      </div>
    </div>
  );
}
