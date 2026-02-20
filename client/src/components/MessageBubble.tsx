import type { Message } from '../types/chat';

interface MessageBubbleProps {
  message: Message;
}

function getOutcomeBracket(value: number) {
  if (value === 1) return { label: 'Critical Failure!', bg: 'bg-red-900/80', border: 'border-red-500', text: 'text-red-400' };
  if (value <= 5) return { label: 'Failure', bg: 'bg-red-900/60', border: 'border-red-700', text: 'text-red-400' };
  if (value <= 15) return { label: 'Partial Success', bg: 'bg-amber-900/60', border: 'border-amber-600', text: 'text-amber-400' };
  if (value <= 19) return { label: 'Great Success!', bg: 'bg-emerald-900/60', border: 'border-emerald-500', text: 'text-emerald-400' };
  return { label: 'Natural 20!', bg: 'bg-yellow-700/70', border: 'border-yellow-400', text: 'text-yellow-300' };
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content } = message;

  if (role === 'dm') {
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[75%] px-4 py-3 rounded-lg bg-dm-bubble font-fell italic leading-[1.75] text-[color:var(--color-dm-message)] text-base">
          {content}
        </div>
      </div>
    );
  }

  if (role === 'dice') {
    const value = parseInt(content.replace('🎲', '').trim(), 10) || 0;
    const bracket = getOutcomeBracket(value);

    return (
      <div className="flex justify-center mb-4">
        <div className="flex flex-col items-center gap-2 animate-dice-reveal">
          {/* Diamond-shaped d20 display */}
          <div
            className={[
              'w-20 h-20 rotate-45 flex items-center justify-center',
              'border-2 rounded-sm shadow-lg',
              bracket.bg,
              bracket.border,
            ].join(' ')}
          >
            <span className={[
              '-rotate-45 font-cinzel font-bold text-parchment',
              value >= 10 ? 'text-3xl' : 'text-4xl',
            ].join(' ')}>
              {value}
            </span>
          </div>
          {/* Outcome label */}
          <span className={`font-cinzel text-sm tracking-wider ${bracket.text}`}>
            {bracket.label}
          </span>
          <span className="text-parchment/40 text-xs font-sans">d20</span>
        </div>
      </div>
    );
  }

  // role === 'player'
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[75%] px-4 py-3 rounded-lg bg-player-bubble font-cinzel font-semibold text-[0.9rem] text-[color:var(--color-player-message)] opacity-90">
        {content}
      </div>
    </div>
  );
}
