import { useState } from 'react';
import { useSSEChat } from './hooks/useSSEChat';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { DiceRoller } from './components/DiceRoller';
import type { AppState } from './types/chat';

export default function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const { messages, isLoading, sendMessage, reset } = useSSEChat();

  // Derive needsRoll: true when the last DM message suggests a roll
  const lastDM = [...messages].reverse().find(m => m.role === 'dm')?.content ?? '';
  const needsRoll = /roll|dice|check|save|attack/i.test(lastDM);

  function handleStart() {
    setAppState('adventure');
  }

  function handleReset() {
    reset();
    setAppState('idle');
  }

  function handleRollDice() {
    sendMessage('🎲 I roll the dice!');
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      {/* Dark overlay for readability over background image */}
      <div className="absolute inset-0 bg-black/60" />

      {/* App container */}
      <div className="relative w-full max-w-3xl h-screen flex flex-col bg-surface border-x border-blood/30">

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-blood/30">
          <span className="font-cinzel text-2xl text-parchment tracking-widest">
            AI Dungeon Master
          </span>
          <div className="flex items-center gap-4">
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
              <button
                onClick={handleStart}
                className="font-cinzel text-xl text-parchment px-8 py-4 border border-blood bg-blood/20 hover:bg-blood/40 tracking-widest"
              >
                Start Adventure
              </button>
            </div>
          ) : (
            <>
              <ChatWindow messages={messages} isLoading={isLoading} />
              <div className="border-t border-blood/30">
                <MessageInput onSend={sendMessage} disabled={isLoading} />
                <DiceRoller
                  onRoll={handleRollDice}
                  disabled={isLoading}
                  needsRoll={needsRoll}
                />
              </div>
            </>
          )}
        </main>

      </div>
    </div>
  );
}
