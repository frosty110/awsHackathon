import { useSyncExternalStore } from 'react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { Message } from '../types/chat';
import { getPlayingMessageId, subscribe } from '../services/audioController';
import { stripTTSTags, expandPhrasesForDisplay } from '@ai-dm/shared-types';

interface MessageBubbleProps {
  message: Message;
  onStopAudio: () => void;
  onReplayAudio: (messageId: string) => void;
}

function getOutcomeBracket(value: number) {
  if (value === 1) return { label: 'Critical Failure!', bg: 'bg-red-900/80', border: 'border-red-500', text: 'text-red-400' };
  if (value <= 5) return { label: 'Failure', bg: 'bg-red-900/60', border: 'border-red-700', text: 'text-red-400' };
  if (value <= 15) return { label: 'Partial Success', bg: 'bg-amber-900/60', border: 'border-amber-600', text: 'text-amber-400' };
  if (value <= 19) return { label: 'Great Success!', bg: 'bg-emerald-900/60', border: 'border-emerald-500', text: 'text-emerald-400' };
  return { label: 'Natural 20!', bg: 'bg-yellow-700/70', border: 'border-yellow-400', text: 'text-yellow-300' };
}

export function MessageBubble({ message, onStopAudio, onReplayAudio }: MessageBubbleProps) {
  const { role, content } = message;
  const playingId = useSyncExternalStore(subscribe, getPlayingMessageId);
  const isPlaying = playingId === message.id;

  if (role === 'dm') {
    const cleanContent = stripTTSTags(expandPhrasesForDisplay(content));
    return (
      <div className="flex justify-start mb-3 group">
        <div className="dm-prose text-lg relative max-w-[75%] px-4 py-3 rounded-lg bg-dm-bubble font-fell leading-[1.8] text-[color:var(--color-dm-message)] text-[1.05rem]">
          <Markdown rehypePlugins={[rehypeSanitize]}>{cleanContent}</Markdown>
          {message.audioUrl && (
            <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {isPlaying ? (
                <button
                  onClick={onStopAudio}
                  aria-label="Stop audio"
                  title="Stop audio"
                  className="w-5 h-5 rounded-full bg-blood/80 text-parchment/70 hover:text-parchment hover:bg-blood flex items-center justify-center text-[10px]"
                >
                  ■
                </button>
              ) : (
                <button
                  onClick={() => onReplayAudio(message.id)}
                  aria-label="Play audio"
                  title="Play audio"
                  className="w-5 h-5 rounded-full bg-dm-gold/80 text-surface hover:bg-dm-gold flex items-center justify-center text-[10px]"
                >
                  ▶
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (role === 'dice') {
    const numMatch = content.match(/(\d+)/);
    const value = numMatch ? parseInt(numMatch[1], 10) : 0;
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
          <span className="text-parchment/60 text-xs font-sans">d20</span>
        </div>
      </div>
    );
  }

  // role === 'player'
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[75%] px-4 py-3 rounded-lg bg-player-bubble font-sans text-base leading-relaxed text-[color:var(--color-player-message)]">
        {content}
      </div>
    </div>
  );
}
