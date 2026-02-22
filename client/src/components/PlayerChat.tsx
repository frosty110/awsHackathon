import { useState, useEffect, useRef } from 'react';
import type { ChatMessage, MultiplayerPlayer } from '../types/multiplayer';
import { getClassColor, getClassBorderColor, getClassBgColor, getClassIcon, getGenderIcon } from '../types/multiplayer';

// Emoji reactions palette (6 options matching chatHandlers emoji IDs)
const REACTION_EMOJIS = [
  { id: 'thumbsup', emoji: '👍' },
  { id: 'skull',    emoji: '💀' },
  { id: 'fire',     emoji: '🔥' },
  { id: 'swords',   emoji: '⚔️' },
  { id: 'sparkles', emoji: '✨' },
  { id: 'laugh',    emoji: '😂' },
];

interface PlayerChatProps {
  chatMessages: ChatMessage[];
  chatReactions: Map<string, Array<{ emoji: string; fromName: string }>>;
  onSend: (text: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  localSocketId: string;
  localPlayer?: MultiplayerPlayer;
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function PlayerChat({
  chatMessages,
  chatReactions,
  onSend,
  onReact,
  localSocketId,
  localPlayer,
}: PlayerChatProps) {
  const [text, setText] = useState('');
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSend();
  }

  function handleReact(messageId: string, emoji: string) {
    onReact(messageId, emoji);
    setSelectedMsgId(null);
  }

  const lastMessageId = chatMessages.length > 0
    ? chatMessages[chatMessages.length - 1].id
    : null;

  return (
    <div className="flex flex-col w-72 border-l border-blood/30 bg-surface h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-blood/30">
        <h3 className="font-cinzel text-sm text-dm-gold tracking-wide">Party Chat</h3>
        <p className="text-parchment/60 text-xs font-fell italic">Private — DM cannot see this</p>
      </div>

      {/* Quick emoji reactions for last message */}
      {lastMessageId && (
        <div className="flex justify-center gap-1 px-3 py-1 border-b border-blood/20 flex-wrap">
          {REACTION_EMOJIS.map(({ id, emoji }) => (
            <button
              key={id}
              onClick={() => handleReact(lastMessageId, emoji)}
              title={`React with ${emoji}`}
              className="text-sm hover:scale-125 transition-transform px-1 py-0.5 rounded hover:bg-blood/20"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {chatMessages.length === 0 && (
          <p className="text-parchment/50 text-xs text-center font-fell italic mt-4">
            No messages yet. Your party awaits...
          </p>
        )}

        {chatMessages.map(msg => {
          const isLocal = msg.fromSocketId === localSocketId;
          const effectiveClass = isLocal && localPlayer
            ? localPlayer.characterClass
            : msg.fromClass;
          const colorClass = getClassColor(effectiveClass);
          const borderClass = getClassBorderColor(effectiveClass);
          const bgClass = getClassBgColor(effectiveClass);
          const reactions = chatReactions.get(msg.id) ?? [];
          const isPickerOpen = selectedMsgId === msg.id;

          // Group reactions by emoji
          const groupedReactions = reactions.reduce<Record<string, number>>(
            (acc, r) => {
              acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
              return acc;
            },
            {}
          );

          // Action messages: centered, italic, no bubble
          if (msg.type === 'action') {
            const icon = getClassIcon(effectiveClass);
            return (
              <div key={msg.id} className="w-full text-center py-0.5">
                <span className={`text-xs font-fell italic ${colorClass} opacity-70`}>
                  {icon} {msg.fromName}: {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isLocal ? 'items-end' : 'items-start'}`}
            >
              {/* Sender name */}
              {!isLocal && (
                <span className={`text-xs font-cinzel ${colorClass} mb-0.5`}>
                  {msg.fromName} {msg.fromGender ? getGenderIcon(msg.fromGender) : ''}
                </span>
              )}

              {/* Message bubble + reaction picker trigger */}
              <button
                className={`max-w-[200px] px-3 py-2 rounded text-sm text-left leading-snug font-fell border ${borderClass} ${bgClass} text-parchment`}
                onClick={() =>
                  setSelectedMsgId(isPickerOpen ? null : msg.id)
                }
                title="Click to react"
              >
                {msg.text}
              </button>

              {/* Timestamp */}
              <span className="text-parchment/50 text-xs mt-0.5">
                {formatTime(msg.timestamp)}
              </span>

              {/* Inline reaction picker */}
              {isPickerOpen && (
                <div className="flex gap-1 mt-1 p-1 rounded bg-surface border border-blood/30">
                  {REACTION_EMOJIS.map(({ id, emoji }) => (
                    <button
                      key={id}
                      onClick={() => handleReact(msg.id, emoji)}
                      className="text-sm hover:scale-125 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Reaction counts */}
              {Object.keys(groupedReactions).length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {Object.entries(groupedReactions).map(([emoji, count]) => (
                    <span
                      key={emoji}
                      className="text-xs px-1.5 py-0.5 rounded-full bg-blood/20 text-parchment/70 border border-blood/20"
                    >
                      {emoji} {count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-2 px-3 py-2 border-t border-blood/30">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={500}
          placeholder="Whisper to party..."
          className="flex-1 px-2 py-1.5 rounded bg-surface text-parchment font-fell text-sm border border-blood/30 placeholder:text-parchment/50 focus:border-blood/60"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="px-3 py-1.5 font-cinzel text-xs text-parchment bg-blood/30 hover:bg-blood/50 border border-blood rounded disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}
