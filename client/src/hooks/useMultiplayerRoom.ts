import { useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '../services/socket';
import { playAudio, stopAudio as stopGlobalAudio } from '../services/audioController';
import { changeMood } from '../services/backgroundMusic';
import type {
  RoomPhase,
  MultiplayerPlayer,
  ChatMessage,
  CharacterClassId,
  GenderId,
  RoomState,
} from '../types/multiplayer';
import { stripTTSTags, expandPhrasesForDisplay } from '@ai-dm/shared-types';

export interface DmMessage {
  id: string;
  role: 'dm';
  content: string;
  isStreaming?: boolean;
}

export interface DiceRollEntry {
  socketId: string;
  displayName: string;
  result: number;
}

export interface UseMultiplayerRoomReturn {
  roomCode: string | null;
  phase: RoomPhase;
  players: MultiplayerPlayer[];
  dmMessages: DmMessage[];
  currentStreamText: string;
  timerEndsAt: number | null;
  hasSubmitted: boolean;
  chatMessages: ChatMessage[];
  chatReactions: Map<string, Array<{ emoji: string; fromName: string }>>;
  diceRolls: DiceRollEntry[];
  error: string | null;
  localPlayer: MultiplayerPlayer | undefined;
  submitAction: (action: string) => void;
  unsubmitAction: () => void;
  sendChat: (text: string) => void;
  sendReaction: (messageId: string, emoji: string) => void;
  rollDice: (result: number) => void;
  addLocalActionMessage: (actionText: string) => void;
}

export function useMultiplayerRoom(): UseMultiplayerRoomReturn {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [phase, setPhase] = useState<RoomPhase>('lobby');
  const [players, setPlayers] = useState<MultiplayerPlayer[]>([]);
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([]);
  const [currentStreamText, setCurrentStreamText] = useState<string>('');
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatReactions, setChatReactions] = useState<
    Map<string, Array<{ emoji: string; fromName: string }>>
  >(new Map());
  const [diceRolls, setDiceRolls] = useState<DiceRollEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Track stream message ID across events
  const streamMessageIdRef = useRef<string | null>(null);
  const streamTextRef = useRef<string>('');

  // Track TTS Object URLs for cleanup on unmount to prevent memory leaks
  const objectUrlsRef = useRef<string[]>([]);

  // Track local player info via ref to avoid stale closures in callbacks
  const playersRef = useRef<MultiplayerPlayer[]>([]);

  // Keep playersRef in sync for use in callbacks
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    function onRoomState(payload: RoomState) {
      setRoomCode(payload.code);
      setPhase(payload.phase);
      setPlayers(payload.players);
    }

    function onPlayerJoined(player: MultiplayerPlayer) {
      setPlayers(prev => {
        // Avoid duplicates
        if (prev.some(p => p.socketId === player.socketId)) {
          return prev.map(p => (p.socketId === player.socketId ? player : p));
        }
        return [...prev, player];
      });
    }

    function onPlayerDisconnected(payload: { socketId: string }) {
      setPlayers(prev =>
        prev.map(p =>
          p.socketId === payload.socketId ? { ...p, connected: false } : p
        )
      );
    }

    function onPlayerReconnected(payload: { socketId: string }) {
      setPlayers(prev =>
        prev.map(p =>
          p.socketId === payload.socketId ? { ...p, connected: true } : p
        )
      );
    }

    function onRoomStarted() {
      setPhase('playing');
    }

    function onRoomError(payload: { message: string }) {
      setError(payload.message);
      setTimeout(() => setError(prev => prev === payload.message ? null : prev), 8000);
    }

    function onTurnCollectingStart() {
      setTimerEndsAt(null);
      setHasSubmitted(false);
      setPhase('collecting-actions');
      // Reset all players' submitted status for the new turn
      setPlayers(prev => prev.map(p => ({ ...p, submittedAction: false })));
    }

    function onTurnTimerStart(payload: { endsAt: number }) {
      setTimerEndsAt(payload.endsAt);
      // Don't reset hasSubmitted — the player who submitted first triggered this
    }

    function onTurnPlayerSubmitted(payload: { socketId: string }) {
      setPlayers(prev =>
        prev.map(p =>
          p.socketId === payload.socketId ? { ...p, submittedAction: true } : p
        )
      );
    }

    function onTurnPlayerUnsubmitted(payload: { socketId: string }) {
      setPlayers(prev =>
        prev.map(p =>
          p.socketId === payload.socketId ? { ...p, submittedAction: false } : p
        )
      );
    }

    function onDmStreamStart() {
      const msgId = `dm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      streamMessageIdRef.current = msgId;
      streamTextRef.current = '';
      setCurrentStreamText('');
      setPhase('dm-responding');
    }

    function onDmChunk(payload: { text: string }) {
      streamTextRef.current += payload.text;
      setCurrentStreamText(stripTTSTags(expandPhrasesForDisplay(streamTextRef.current)));
    }

    function onDmMoodChange(payload: { mood: string }) {
      void changeMood(payload.mood);
    }

    function onDmStreamEnd(payload: { fullText: string; mood?: string }) {
      const msgId = streamMessageIdRef.current ?? `dm-${Date.now()}`;
      const completedText = stripTTSTags(expandPhrasesForDisplay(streamTextRef.current));
      setDmMessages(prev => [
        ...prev,
        { id: msgId, role: 'dm', content: completedText, isStreaming: false },
      ]);
      setCurrentStreamText('');
      streamTextRef.current = '';
      streamMessageIdRef.current = null;
      setPhase('playing');
      if (payload.mood) void changeMood(payload.mood);
    }

    function onDmTtsReady(payload: { audio?: string; audioUrl?: string }) {
      try {
        let audio: HTMLAudioElement;
        if ('audioUrl' in payload && payload.audioUrl) {
          // S3 presigned URL — fetch directly (no base64 inflation)
          audio = new Audio(payload.audioUrl);
        } else if ('audio' in payload && payload.audio) {
          // Base64 fallback (dev mode without S3)
          const binaryString = atob(payload.audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          // Track URL for cleanup on unmount
          objectUrlsRef.current.push(url);
          audio = new Audio(url);
          audio.addEventListener('ended', () => {
            URL.revokeObjectURL(url);
            // Remove from tracking list since it was already revoked
            objectUrlsRef.current = objectUrlsRef.current.filter(u => u !== url);
          });
        } else {
          return;
        }
        playAudio(audio);
      } catch (err) {
        console.error('[useMultiplayerRoom] failed to play TTS audio', err);
      }
    }

    function onDmError(payload: { message: string }) {
      const msg = payload.message ?? 'DM encountered an error';
      setError(msg);
      setTimeout(() => setError(prev => prev === msg ? null : prev), 8000);
      setCurrentStreamText('');
      streamTextRef.current = '';
      streamMessageIdRef.current = null;
      setPhase('playing');
    }

    function onChatMessage(msg: ChatMessage) {
      setChatMessages(prev => [...prev, msg]);
    }

    function onChatReaction(payload: {
      messageId: string;
      emoji: string;
      fromName: string;
    }) {
      setChatReactions(prev => {
        const next = new Map(prev);
        const existing = next.get(payload.messageId) ?? [];
        next.set(payload.messageId, [
          ...existing,
          { emoji: payload.emoji, fromName: payload.fromName },
        ]);
        return next;
      });
    }

    function onDiceRolled(payload: {
      socketId: string;
      displayName: string;
      result: number;
    }) {
      setDiceRolls(prev => {
        const next = [...prev, payload];
        // Keep last 20 dice rolls
        return next.length > 20 ? next.slice(next.length - 20) : next;
      });
    }

    function onPlayerIdle(payload: { socketId: string }) {
      setPlayers(prev =>
        prev.map(p =>
          p.socketId === payload.socketId ? { ...p, idle: true } : p
        )
      );
    }

    function onPlayerActive(payload: { socketId: string }) {
      setPlayers(prev =>
        prev.map(p =>
          p.socketId === payload.socketId ? { ...p, idle: false } : p
        )
      );
    }

    socket.on('room:state', onRoomState);
    socket.on('room:player-joined', onPlayerJoined);
    socket.on('room:player-disconnected', onPlayerDisconnected);
    socket.on('room:player-reconnected', onPlayerReconnected);
    socket.on('room:started', onRoomStarted);
    socket.on('room:error', onRoomError);
    socket.on('turn:collecting-start', onTurnCollectingStart);
    socket.on('turn:timer-start', onTurnTimerStart);
    socket.on('turn:player-submitted', onTurnPlayerSubmitted);
    socket.on('turn:player-unsubmitted', onTurnPlayerUnsubmitted);
    socket.on('dm:stream-start', onDmStreamStart);
    socket.on('dm:chunk', onDmChunk);
    socket.on('dm:mood-change', onDmMoodChange);
    socket.on('dm:stream-end', onDmStreamEnd);
    socket.on('dm:tts-ready', onDmTtsReady);
    socket.on('dm:error', onDmError);
    socket.on('chat:message', onChatMessage);
    socket.on('chat:reaction', onChatReaction);
    socket.on('dice:rolled', onDiceRolled);
    socket.on('room:player-idle', onPlayerIdle);
    socket.on('room:player-active', onPlayerActive);

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('room:player-joined', onPlayerJoined);
      socket.off('room:player-disconnected', onPlayerDisconnected);
      socket.off('room:player-reconnected', onPlayerReconnected);
      socket.off('room:started', onRoomStarted);
      socket.off('room:error', onRoomError);
      socket.off('turn:collecting-start', onTurnCollectingStart);
      socket.off('turn:timer-start', onTurnTimerStart);
      socket.off('turn:player-submitted', onTurnPlayerSubmitted);
      socket.off('turn:player-unsubmitted', onTurnPlayerUnsubmitted);
      socket.off('dm:stream-start', onDmStreamStart);
      socket.off('dm:chunk', onDmChunk);
      socket.off('dm:mood-change', onDmMoodChange);
      socket.off('dm:stream-end', onDmStreamEnd);
      socket.off('dm:tts-ready', onDmTtsReady);
      socket.off('dm:error', onDmError);
      socket.off('chat:message', onChatMessage);
      socket.off('chat:reaction', onChatReaction);
      socket.off('dice:rolled', onDiceRolled);
      socket.off('room:player-idle', onPlayerIdle);
      socket.off('room:player-active', onPlayerActive);
    };
  }, []);

  // Idle detection: emit player:idle after 60s of no activity, player:active on resume
  useEffect(() => {
    if (!roomCode) return;

    let idleTimeout: ReturnType<typeof setTimeout> | null = null;
    let isIdle = false;
    let lastActivity = Date.now();

    const IDLE_MS = 60_000;

    function resetIdleTimer() {
      // Throttle: ignore activity within 1s of last call
      const now = Date.now();
      if (now - lastActivity < 1000) return;
      lastActivity = now;

      if (isIdle) {
        isIdle = false;
        socket.emit('player:active' as never);
      }

      if (idleTimeout) clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        isIdle = true;
        socket.emit('player:idle' as never);
      }, IDLE_MS);
    }

    const events: Array<keyof DocumentEventMap> = ['keydown', 'mousemove', 'mousedown', 'touchstart'];
    for (const evt of events) {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    }

    // Start the initial idle timer
    idleTimeout = setTimeout(() => {
      isIdle = true;
      socket.emit('player:idle' as never);
    }, IDLE_MS);

    return () => {
      for (const evt of events) {
        document.removeEventListener(evt, resetIdleTimer);
      }
      if (idleTimeout) clearTimeout(idleTimeout);
    };
  }, [roomCode]);

  // Revoke any remaining TTS Object URLs when the component unmounts
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  const submitAction = useCallback((action: string) => {
    socket.emit('turn:submit-action', { action });
    setHasSubmitted(true);
  }, []);

  const unsubmitAction = useCallback(() => {
    socket.emit('turn:unsubmit-action');
    setHasSubmitted(false);
  }, []);

  const sendChat = useCallback((text: string) => {
    socket.emit('chat:send', { text });
    // Optimistic: add own message locally (server uses socket.to() which excludes sender)
    const me = playersRef.current.find(p => p.socketId === socket.id);
    const localMsg: ChatMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fromSocketId: socket.id ?? 'local',
      fromName: 'You',
      fromClass: (me?.characterClass ?? 'fighter') as CharacterClassId,
      fromGender: (me?.gender ?? 'nonbinary') as GenderId,
      text,
      timestamp: Date.now(),
    };
    setChatMessages(prev => [...prev, localMsg]);
  }, []);

  const sendReaction = useCallback((messageId: string, emoji: string) => {
    socket.emit('chat:react', { messageId, emoji });
  }, []);

  const rollDice = useCallback((result: number) => {
    socket.emit('dice:roll', { result });
  }, []);

  const addLocalActionMessage = useCallback((actionText: string) => {
    const me = playersRef.current.find(p => p.socketId === socket.id);
    const actionMsg: ChatMessage = {
      id: `action-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fromSocketId: socket.id ?? 'local',
      fromName: me?.displayName ?? 'You',
      fromClass: (me?.characterClass ?? 'fighter') as CharacterClassId,
      fromGender: (me?.gender ?? 'nonbinary') as GenderId,
      text: actionText,
      timestamp: Date.now(),
      type: 'action',
    };
    setChatMessages(prev => [...prev, actionMsg]);
  }, []);

  const localPlayer = players.find(p => p.socketId === socket.id);

  return {
    roomCode,
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
    unsubmitAction,
    sendChat,
    sendReaction,
    rollDice,
    addLocalActionMessage,
  };
}
