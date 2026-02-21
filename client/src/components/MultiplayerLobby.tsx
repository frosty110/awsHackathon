import { useState, useEffect } from 'react';
import { socket } from '../services/socket';
import {
  CHARACTER_CLASSES,
  getClassColor,
  getClassIcon,
  type CharacterClassId,
  type RoomState,
  type MultiplayerPlayer,
} from '../types/multiplayer';

type LobbyStep = 'choose' | 'create' | 'join' | 'lobby';

interface MultiplayerLobbyProps {
  onGameStart: (roomState: RoomState) => void;
  onBack: () => void;
}

export function MultiplayerLobby({ onGameStart, onBack }: MultiplayerLobbyProps) {
  const [step, setStep] = useState<LobbyStep>('choose');
  const [displayName, setDisplayName] = useState('');
  const [characterClass, setCharacterClass] = useState<CharacterClassId | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Register Socket.IO event listeners — cleaned up on unmount
  useEffect(() => {
    function onRoomCreated(state: RoomState) {
      setRoomState(state);
      setError(null);
      setStep('lobby');
    }

    function onRoomState(state: RoomState) {
      setRoomState(state);
    }

    function onPlayerJoined(player: MultiplayerPlayer) {
      setRoomState(prev => {
        if (!prev) return prev;
        // Replace if exists (reconnect case) or append
        const existing = prev.players.findIndex(p => p.socketId === player.socketId);
        const players =
          existing >= 0
            ? prev.players.map((p, i) => (i === existing ? player : p))
            : [...prev.players, player];
        return { ...prev, players };
      });
    }

    function onPlayerDisconnected({ socketId }: { socketId: string }) {
      setRoomState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p =>
            p.socketId === socketId ? { ...p, connected: false } : p
          ),
        };
      });
    }

    function onPlayerReconnected({ socketId }: { socketId: string }) {
      setRoomState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p =>
            p.socketId === socketId ? { ...p, connected: true } : p
          ),
        };
      });
    }

    function onRoomStarted() {
      // Use functional form of setRoomState to read latest value without stale closure
      setRoomState(prev => {
        if (prev) onGameStart(prev);
        return prev;
      });
    }

    function onRoomError({ message }: { message: string }) {
      setError(message);
    }

    socket.on('room:created', onRoomCreated);
    socket.on('room:state', onRoomState);
    socket.on('room:player-joined', onPlayerJoined);
    socket.on('room:player-disconnected', onPlayerDisconnected);
    socket.on('room:player-reconnected', onPlayerReconnected);
    socket.on('room:started', onRoomStarted);
    socket.on('room:error', onRoomError);

    return () => {
      socket.off('room:created', onRoomCreated);
      socket.off('room:state', onRoomState);
      socket.off('room:player-joined', onPlayerJoined);
      socket.off('room:player-disconnected', onPlayerDisconnected);
      socket.off('room:player-reconnected', onPlayerReconnected);
      socket.off('room:started', onRoomStarted);
      socket.off('room:error', onRoomError);
    };
  }, [onGameStart]);

  function handleSubmit() {
    if (!displayName.trim() || !characterClass) return;
    setError(null);

    if (!socket.connected) {
      socket.connect();
    }

    if (step === 'create') {
      socket.emit('room:create', {
        displayName: displayName.trim(),
        characterClass,
      });
    } else if (step === 'join') {
      if (joinCode.length !== 6) {
        setError('Room code must be 6 characters.');
        return;
      }
      socket.emit('room:join', {
        code: joinCode,
        displayName: displayName.trim(),
        characterClass,
      });
    }
  }

  function handleReady() {
    socket.emit('room:ready');
    setIsReady(true);
  }

  // ----- Render: Choose step -----
  if (step === 'choose') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
        <h2
          className="font-cinzel font-bold text-2xl tracking-widest"
          style={{ color: 'var(--color-dm-gold)', textShadow: '0 0 12px oklch(0.75 0.15 55 / 0.6)' }}
        >
          Multiplayer Party
        </h2>
        <p className="font-fell text-parchment/60 text-sm">Gather your companions</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-sm">
          <button
            onClick={() => setStep('create')}
            className="font-cinzel text-parchment px-6 py-4 border border-blood bg-blood/20 hover:bg-blood/40 tracking-wide transition-colors rounded"
          >
            Create Room
          </button>
          <button
            onClick={() => setStep('join')}
            className="font-cinzel text-parchment px-6 py-4 border border-blood bg-blood/20 hover:bg-blood/40 tracking-wide transition-colors rounded"
          >
            Join Room
          </button>
        </div>

        <button
          onClick={onBack}
          className="font-cinzel text-sm text-parchment/50 hover:text-parchment transition-colors"
        >
          &larr; Back
        </button>
      </div>
    );
  }

  // ----- Render: Create / Join form step -----
  if (step === 'create' || step === 'join') {
    const isValid =
      displayName.trim().length > 0 &&
      characterClass !== null &&
      (step === 'create' || joinCode.length === 6);

    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6 overflow-y-auto">
        <h2
          className="font-cinzel font-bold text-2xl tracking-widest"
          style={{ color: 'var(--color-dm-gold)', textShadow: '0 0 12px oklch(0.75 0.15 55 / 0.6)' }}
        >
          {step === 'create' ? 'Create a Room' : 'Join a Room'}
        </h2>

        {error && (
          <p className="font-fell text-red-400 text-sm border border-red-400/30 bg-red-400/10 px-4 py-2 rounded w-full max-w-md text-center">
            {error}
          </p>
        )}

        <div className="w-full max-w-md flex flex-col gap-5">
          {/* Display name */}
          <div>
            <label className="font-cinzel text-xs text-parchment/60 tracking-widest uppercase block mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value.slice(0, 20))}
              placeholder="Enter your name..."
              maxLength={20}
              className="
                w-full bg-surface border border-blood/30 rounded px-3 py-2
                font-fell text-parchment placeholder:text-parchment/30
                focus:outline-none focus:border-dm-gold/50
              "
            />
          </div>

          {/* Room code (join only) */}
          {step === 'join' && (
            <div>
              <label className="font-cinzel text-xs text-parchment/60 tracking-widest uppercase block mb-1">
                Room Code
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="XXXXXX"
                maxLength={6}
                className="
                  w-full bg-surface border border-blood/30 rounded px-3 py-2
                  font-cinzel text-dm-gold tracking-widest placeholder:text-parchment/30
                  focus:outline-none focus:border-dm-gold/50 uppercase
                "
              />
            </div>
          )}

          {/* Character class picker */}
          <div>
            <label className="font-cinzel text-xs text-parchment/60 tracking-widest uppercase block mb-2">
              Choose Your Class
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CHARACTER_CLASSES.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => setCharacterClass(cls.id)}
                  className={`
                    flex flex-col items-center gap-1 p-3 border rounded
                    transition-all duration-150 cursor-pointer
                    ${characterClass === cls.id
                      ? `border-current bg-current/10 ${cls.color}`
                      : 'border-blood/30 bg-surface text-parchment hover:border-blood-light'
                    }
                  `}
                >
                  <span className="text-2xl">{cls.icon}</span>
                  <span
                    className={`font-cinzel text-xs tracking-wide ${
                      characterClass === cls.id ? cls.color : 'text-parchment'
                    }`}
                  >
                    {cls.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!isValid}
          className="font-cinzel text-lg text-parchment px-8 py-3 border border-blood bg-blood/20 hover:bg-blood/40 tracking-widest disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded"
        >
          Enter the Fray
        </button>

        <button
          onClick={() => { setError(null); setStep('choose'); }}
          className="font-cinzel text-sm text-parchment/50 hover:text-parchment transition-colors"
        >
          &larr; Back
        </button>
      </div>
    );
  }

  // ----- Render: Lobby step -----
  if (step === 'lobby' && roomState) {
    const connectedPlayers = roomState.players.filter(p => p.connected);
    const readyCount = roomState.players.filter(p => p.ready).length;

    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6 overflow-y-auto">
        <h2
          className="font-cinzel font-bold text-xl tracking-widest"
          style={{ color: 'var(--color-dm-gold)', textShadow: '0 0 12px oklch(0.75 0.15 55 / 0.6)' }}
        >
          The Gathering Hall
        </h2>

        {/* Room code display */}
        <div className="border border-dm-gold/30 bg-dm-gold/5 rounded px-8 py-4 text-center"
          style={{ boxShadow: '0 0 16px oklch(0.75 0.15 55 / 0.2)' }}
        >
          <p className="font-fell text-parchment/60 text-xs mb-1 tracking-widest uppercase">
            Room Code
          </p>
          <p
            className="font-cinzel font-bold text-4xl tracking-[0.4em] text-dm-gold"
          >
            {roomState.code}
          </p>
          <p className="font-fell text-parchment/40 text-xs mt-1">
            Share this code with your party
          </p>
        </div>

        {/* Player count */}
        <p className="font-fell text-parchment/60 text-sm">
          {connectedPlayers.length}/4 adventurers gathered &bull; {readyCount} ready
        </p>

        {/* Player list */}
        <div className="w-full max-w-md flex flex-col gap-2">
          {roomState.players.map(player => (
            <div
              key={player.socketId}
              className="flex items-center justify-between border border-blood/20 bg-surface rounded px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {/* Connection indicator */}
                <span
                  className={`w-2 h-2 rounded-full inline-block ${
                    player.connected ? 'bg-green-400' : 'bg-parchment/20'
                  }`}
                  title={player.connected ? 'Connected' : 'Disconnected'}
                />
                {/* Class icon + name */}
                <span className="text-lg" aria-hidden="true">
                  {getClassIcon(player.characterClass)}
                </span>
                <div>
                  <p className="font-cinzel text-sm text-parchment font-semibold">
                    {player.displayName}
                  </p>
                  <p className={`font-fell text-xs ${getClassColor(player.characterClass)}`}>
                    {CHARACTER_CLASSES.find(c => c.id === player.characterClass)?.name ?? player.characterClass}
                  </p>
                </div>
              </div>

              {/* Ready status */}
              {player.ready ? (
                <span className="font-cinzel text-xs text-green-400 tracking-wide">
                  Ready ✓
                </span>
              ) : (
                <span className="font-cinzel text-xs text-parchment/30 tracking-wide">
                  Waiting...
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Ready button */}
        {!isReady && (
          <button
            onClick={handleReady}
            className="font-cinzel text-lg text-parchment px-8 py-3 border border-dm-gold/50 bg-dm-gold/10 hover:bg-dm-gold/20 tracking-widest transition-colors rounded"
          >
            Ready
          </button>
        )}
        {isReady && (
          <p className="font-fell text-green-400 text-sm">
            You are ready! Waiting for others...
          </p>
        )}

        {error && (
          <p className="font-fell text-red-400 text-sm">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Fallback (should not be reached)
  return null;
}
