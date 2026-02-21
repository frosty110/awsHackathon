import { useState } from 'react';
import { useSSEChat } from './hooks/useSSEChat';
import { startBackgroundMusic } from './services/backgroundMusic';
import { AudioControls } from './components/AudioControls';
import { AudioPlayer, type NarrateResult } from './components/AudioPlayer';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { DiceRoller } from './components/DiceRoller';
import type { AppState } from './types/chat';

export default function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const { messages, isLoading, sendMessage, startAdventure, reset, skip, stopAudio, sessionCost } = useSSEChat();

  function handleStart(narration?: NarrateResult) {
    setAppState('adventure');
    void startAdventure(narration);
    startBackgroundMusic();
  }

  function handleReset() {
    reset();
    setAppState('idle');
  }

  function handleRollDice(value: number) {
    sendMessage(`🎲 ${value}`);
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      {/* Looping video background — persists across all states */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/hero-bg.webm" type="video/webm" />
      </video>

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/60" />

      {/* App container */}
      <div className="relative w-full max-w-3xl h-screen flex flex-col bg-surface border-x border-blood/30">

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-blood/30">
          <span
            className="font-cinzel font-bold text-2xl tracking-widest"
            style={{
              color: 'var(--color-dm-gold)',
              textShadow: '0 0 12px oklch(0.75 0.15 55 / 0.6)',
            }}
          >
            AI Dungeon Master
          </span>
          <div className="flex items-center gap-4">
            <AudioControls />
            {appState === 'adventure' && sessionCost > 0 && (
              <span className="font-mono text-xs text-dm-gold/70">
                ${sessionCost.toFixed(4)}
              </span>
            )}
            <span className="font-sans text-xs text-parchment/50">
              Powered by AWS Bedrock
            </span>
            {appState === 'adventure' && (
              <button
                onClick={handleReset}
                className="font-cinzel text-xs text-blood-light hover:text-parchment"
              >
                Reset
              </button>
            )}
          </div>
        </header>

        {/* Main area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {appState === 'idle' ? (
            <div className="flex-1 flex items-center justify-center">
              <AudioPlayer onAdventureStart={handleStart} />
            </div>
          ) : (
            <>
              <ChatWindow messages={messages} isLoading={isLoading} onStopAudio={stopAudio} />
              <div className="border-t border-blood/30">
                {isLoading && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={skip}
                      className="font-cinzel text-xs text-parchment/50 hover:text-parchment border border-parchment/20 hover:border-parchment/50 px-4 py-1 rounded transition-colors"
                    >
                      Skip ▶▶
                    </button>
                  </div>
                )}
                <MessageInput onSend={sendMessage} disabled={false} />
                <DiceRoller
                  onRoll={handleRollDice}
                  disabled={isLoading}
                />
              </div>
            </>
          )}
        </main>

      </div>
    </div>
  );
}
