import { useState, useEffect, lazy, Suspense } from 'react';
import { useSSEChat } from './hooks/useSSEChat';
import { startBackgroundMusic, startRandomMusic, stopBackgroundMusic } from './services/backgroundMusic';
import { SceneBackground } from './components/SceneBackground';
import { AudioControls } from './components/AudioControls';
import { AudioPlayer, type NarrateResult } from './components/AudioPlayer';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { DiceRoller } from './components/DiceRoller';
import { ClassSelect, type CharacterClass } from './components/ClassSelect';
import { CostTooltip } from './components/CostTooltip';
import { ErrorNotification } from './components/ErrorNotification';
import { ModeSelect } from './components/ModeSelect';
import { LoginForm } from './components/LoginForm';

// Code-split multiplayer components — only loaded when user enters multiplayer mode
const MultiplayerLobby = lazy(() => import('./components/MultiplayerLobby'));
const MultiplayerGame = lazy(() => import('./components/MultiplayerGame'));
import { socket } from './services/socket';
import { restoreAuth, clearAuth, getUsername } from './services/auth';
import type { RoomState } from './types/multiplayer';
import type { AppState } from './types/chat';

export default function App() {
  const [appState, setAppState] = useState<AppState>('login');
  const [multiplayerRoomCode, setMultiplayerRoomCode] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<CharacterClass | null>(null);
  const [selectedPronouns, setSelectedPronouns] = useState<string>('They/Them');
  const { messages, isLoading, sendMessage, startAdventure, reset, skip, stopAudio, replayMessageAudio, sessionCost, usageBreakdown } = useSSEChat();

  // On mount, attempt to restore auth from localStorage.
  // If successful, skip login and go to mode select. Otherwise, show login form.
  useEffect(() => {
    if (restoreAuth()) {
      setAppState('modeSelect');
    } else {
      setAppState('login');
    }
  }, []);

  // ----- Single-player handlers -----

  function handleSinglePlayer() {
    setAppState('idle');
  }

  function handleClassSelected(cls: CharacterClass, pronouns: string) {
    setSelectedClass(cls);
    setSelectedPronouns(pronouns);
    setAppState('classSelect');
  }

  function handleStart(narration?: NarrateResult) {
    setAppState('adventure');
    void startAdventure(narration, selectedClass ?? undefined, selectedPronouns);
    startBackgroundMusic("tavern");
  }

  function handleReset() {
    reset();
    stopBackgroundMusic();
    setSelectedClass(null);
    setSelectedPronouns('They/Them');
    setMultiplayerRoomCode(null);
    setAppState('modeSelect');
  }

  function handleLogout() {
    reset();
    stopBackgroundMusic();
    socket.disconnect();
    clearAuth();
    setSelectedClass(null);
    setSelectedPronouns('They/Them');
    setMultiplayerRoomCode(null);
    setAppState('login');
  }

  function handleRollDice(result: number) {
    sendMessage(`\u{1F3B2} I roll the dice... ${result}!`, result);
  }

  // ----- Multiplayer handlers -----

  function handleMultiplayer() {
    setAppState('multiplayerLobby');
  }

  function handleMultiplayerGameStart(roomState: RoomState) {
    setMultiplayerRoomCode(roomState.code);
    setAppState('multiplayerGame');
    startBackgroundMusic("tavern");
  }

  function handleMultiplayerBack() {
    socket.disconnect();
    setAppState('modeSelect');
  }

  function handleMultiplayerLeave() {
    socket.disconnect();
    stopBackgroundMusic();
    setMultiplayerRoomCode(null);
    setAppState('modeSelect');
  }

  // Show Reset button for single-player adventure and multiplayer game
  const showReset = appState === 'adventure' || appState === 'multiplayerGame';
  const onResetClick = appState === 'multiplayerGame' ? handleMultiplayerLeave : handleReset;

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      {/* Dynamic scene video background — crossfades on scene changes */}
      <SceneBackground />

      {/* Subtle overlay for text readability */}
      <div className="absolute inset-0 bg-black/20" />

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
            <ErrorNotification />
            {appState === 'adventure' && sessionCost > 0 && (
              <CostTooltip breakdown={usageBreakdown} />
            )}
            <span className="font-sans text-sm text-parchment/60">
              Powered by AWS Bedrock
            </span>
            {appState !== 'login' && getUsername() && (
              <span className="font-cinzel text-xs text-parchment/50 tracking-wider">
                {getUsername()}
              </span>
            )}
            {showReset && (
              <button
                onClick={onResetClick}
                className="font-cinzel text-sm text-blood-light hover:text-parchment"
              >
                {appState === 'multiplayerGame' ? 'Leave Room' : 'Reset'}
              </button>
            )}
            {appState !== 'login' && (
              <button
                onClick={handleLogout}
                className="font-cinzel text-xs text-parchment/50 hover:text-blood-light"
              >
                Logout
              </button>
            )}
          </div>
        </header>

        {/* Main area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {appState === 'login' ? (
            <LoginForm onSuccess={() => setAppState('modeSelect')} />
          ) : appState === 'modeSelect' ? (
            <ModeSelect onSinglePlayer={handleSinglePlayer} onMultiplayer={handleMultiplayer} onFirstInteraction={startRandomMusic} />
          ) : appState === 'idle' ? (
            <ClassSelect onSelect={handleClassSelected} />
          ) : appState === 'classSelect' ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <p className="font-fell text-parchment/60 text-xl">
                Playing as <span className="text-dm-gold font-cinzel font-semibold">{selectedClass?.icon} {selectedClass?.name}</span>
                <span className="text-parchment/60"> ({selectedPronouns})</span>
              </p>
              <AudioPlayer onAdventureStart={handleStart} characterClass={selectedClass?.name} pronouns={selectedPronouns} />
            </div>
          ) : appState === 'adventure' ? (
            <>
              <ChatWindow messages={messages} isLoading={isLoading} onStopAudio={stopAudio} onReplayAudio={replayMessageAudio} />
              <div className="border-t border-blood/30">
                {isLoading && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={skip}
                      className="font-cinzel text-xs text-parchment/60 hover:text-parchment border border-parchment/30 hover:border-parchment/60 px-4 py-1 rounded transition-colors"
                    >
                      Skip ▶▶
                    </button>
                  </div>
                )}
                <MessageInput onSend={sendMessage} disabled={isLoading} />
                <DiceRoller
                  onRoll={handleRollDice}
                  disabled={isLoading}
                />
              </div>
            </>
          ) : appState === 'multiplayerLobby' ? (
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-parchment/60 font-fell">Loading multiplayer...</div>}>
              <MultiplayerLobby
                onGameStart={handleMultiplayerGameStart}
                onBack={handleMultiplayerBack}
              />
            </Suspense>
          ) : appState === 'multiplayerGame' && multiplayerRoomCode ? (
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-parchment/60 font-fell">Loading game...</div>}>
              <MultiplayerGame
                roomCode={multiplayerRoomCode}
                onLeave={handleMultiplayerLeave}
              />
            </Suspense>
          ) : null}
        </main>

      </div>
    </div>
  );
}
