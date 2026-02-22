import { useState, useEffect, useRef, useCallback } from 'react';
import Markdown from 'react-markdown';
import { socket } from '../services/socket';
import { useMultiplayerRoom } from '../hooks/useMultiplayerRoom';
import { PlayerStatusBar } from './PlayerStatusBar';
import { PlayerChat } from './PlayerChat';

interface MultiplayerGameProps {
  roomCode: string;
  onLeave: () => void;
}

export function MultiplayerGame({ roomCode, onLeave }: MultiplayerGameProps) {
  const {
    phase,
    players,
    dmMessages,
    currentStreamText,
    timerEndsAt,
    hasSubmitted,
    chatMessages,
    chatReactions,
    diceRolls,
    error,
    localPlayer,
    submitAction,
    sendChat,
    sendReaction,
    addLocalActionMessage,
  } = useMultiplayerRoom();

  const [actionText, setActionText] = useState('');
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const dmScrollRef = useRef<HTMLDivElement>(null);
  const dmBottomRef = useRef<HTMLDivElement>(null);

  // Timer countdown
  useEffect(() => {
    if (timerEndsAt === null) {
      setTimeLeft(0);
      return;
    }

    function tick() {
      const remaining = Math.max(0, Math.ceil((timerEndsAt! - Date.now()) / 1000));
      setTimeLeft(remaining);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerEndsAt]);

  // Auto-scroll DM chat on new messages or streaming chunks
  useEffect(() => {
    dmBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmMessages, currentStreamText]);

  const handleSubmitAction = useCallback(() => {
    const trimmed = actionText.trim();
    if (!trimmed || hasSubmitted || phase !== 'collecting-actions') return;
    submitAction(trimmed);
    addLocalActionMessage(trimmed);
    setActionText('');
  }, [actionText, hasSubmitted, phase, submitAction, addLocalActionMessage]);

  function handleActionKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSubmitAction();
  }

  const isCollecting = phase === 'collecting-actions';
  const isDmResponding = phase === 'dm-responding';
  const actionDisabled = !isCollecting || hasSubmitted;
  const isTimerLow = isCollecting && timerEndsAt !== null && timeLeft <= 10 && timeLeft > 0;

  const localSocketId = socket.id ?? '';

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Player status bar */}
      <PlayerStatusBar players={players} localSocketId={localSocketId} />

      {/* Timer display */}
      {isCollecting && timerEndsAt !== null && (
        <div
          className={[
            'flex justify-center items-center py-1 text-sm font-cinzel tracking-wide',
            isTimerLow
              ? 'text-red-400 animate-pulse'
              : 'text-dm-gold',
          ].join(' ')}
        >
          {timeLeft > 0
            ? `Time remaining: ${timeLeft}s`
            : 'Time is up — submitting actions...'}
        </div>
      )}

      {/* DM responding notice */}
      {isDmResponding && (
        <div className="flex justify-center items-center py-1 text-sm font-cinzel text-parchment/60 italic">
          The DM weaves your fates...
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-900/60 border-b border-red-700 text-red-300 text-sm font-sans">
          {error}
        </div>
      )}

      {/* Main game area: DM chat (left) + Player chat (right) */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: DM narrative + action input */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* DM message scroll area */}
          <div ref={dmScrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {dmMessages.length === 0 && !currentStreamText && (
              <div className="text-parchment/60 text-center font-fell italic mt-8">
                The adventure is about to begin...
              </div>
            )}

            {/* Completed DM messages */}
            {dmMessages.map(msg => (
              <div key={msg.id} className="flex justify-start">
                <div className="dm-prose text-lg max-w-[90%] px-4 py-3 rounded-lg bg-dm-bubble font-fell leading-[1.8] text-[color:var(--color-dm-message)] text-[1.05rem]">
                  <Markdown>{msg.content}</Markdown>
                </div>
              </div>
            ))}

            {/* Streaming DM message */}
            {currentStreamText && (
              <div className="flex justify-start">
                <div className="dm-prose text-lg max-w-[90%] px-4 py-3 rounded-lg bg-dm-bubble font-fell leading-[1.8] text-[color:var(--color-dm-message)] text-[1.05rem]">
                  <Markdown>{currentStreamText}</Markdown>
                  <span className="inline-block w-2 h-4 bg-dm-gold animate-pulse ml-1 align-middle" />
                </div>
              </div>
            )}

            {/* Recent dice rolls */}
            {diceRolls.slice(-5).map((roll, i) => (
              <div
                key={`dice-${i}`}
                className="flex justify-center text-xs text-parchment/60 font-cinzel"
              >
                <span className="px-3 py-1 rounded-full bg-blood/10 border border-blood/20">
                  {roll.displayName} rolled a {roll.result}!
                </span>
              </div>
            ))}

            <div ref={dmBottomRef} />
          </div>

          {/* Action input area */}
          <div className="border-t border-blood/30 px-4 py-3 bg-surface/60">
            {hasSubmitted ? (
              <div className="text-center text-green-400 text-sm font-cinzel py-2">
                ✓ Your action has been sent to the DM
              </div>
            ) : isDmResponding ? (
              <div className="text-center text-parchment/60 text-sm font-fell italic py-2">
                Await the DM's response...
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={actionText}
                  onChange={e => setActionText(e.target.value)}
                  onKeyDown={handleActionKeyDown}
                  disabled={actionDisabled}
                  placeholder={
                    isCollecting
                      ? 'Describe your action...'
                      : 'Waiting for next turn...'
                  }
                  className="flex-1 px-3 py-2 rounded bg-surface text-parchment font-sans text-base border border-blood/30 placeholder:text-parchment/50 focus:border-blood/60 disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleSubmitAction}
                  disabled={actionDisabled || !actionText.trim()}
                  className="px-4 py-2 font-cinzel text-sm text-parchment bg-blood/30 hover:bg-blood/50 border border-blood rounded disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Submit Action
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Player chat side panel */}
        <PlayerChat
          chatMessages={chatMessages}
          chatReactions={chatReactions}
          onSend={sendChat}
          onReact={sendReaction}
          localSocketId={localSocketId}
          localPlayer={localPlayer}
        />
      </div>

      {/* Footer: room code + leave button */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-blood/20 bg-surface/40">
        <span className="text-parchment/50 text-xs font-mono">
          Room: {roomCode}
        </span>
        <button
          onClick={onLeave}
          className="text-parchment/60 text-xs font-cinzel hover:text-parchment transition-colors"
        >
          Leave Room
        </button>
      </div>
    </div>
  );
}
