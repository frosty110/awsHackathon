import { useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '../services/socket';
import { playAudio, stopAudio as stopGlobalAudio } from '../services/audioController';
import type {
  RoomPhase,
  MultiplayerPlayer,
  ChatMessage,
  CharacterClassId,
  RoomState,
} from '../types/multiplayer';

function stripTTSTags(text: string): string {
  return text
    .replace(/^\{\{mood:\w+\}\}\s*/, "")
    .replace(/\{\{voice:\w+\}\}/g, "")
    .replace(/\{\{\/voice\}\}/g, "")
    .replace(/\[(excited|whisper|angry|fearful|sad|shouting)\]\s*/g, "")
    .trim();
}

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
      setCurrentStreamText(stripTTSTags(streamTextRef.current));
    }

    function onDmStreamEnd() {
      const msgId = streamMessageIdRef.current ?? `dm-${Date.now()}`;
      const completedText = stripTTSTags(streamTextRef.current);
      setDmMessages(prev => [
        ...prev,
        { id: msgId, role: 'dm', content: completedText, isStreaming: false },
      ]);
      setCurrentStreamText('');
      streamTextRef.current = '';
      streamMessageIdRef.current = null;
      setPhase('playing');
    }

    function onDmTtsReady(payload: { audio: string }) {
      try {
        const binaryString = atob(payload.audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.addEventListener('ended', () => URL.revokeObjectURL(url));
        playAudio(audio);
      } catch (err) {
        console.error('[useMultiplayerRoom] failed to play TTS audio', err);
      }
    }

    function onDmError(payload: { message: string }) {
      setError(payload.message ?? 'DM encountered an error');
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
    socket.on('dm:stream-end', onDmStreamEnd);
    socket.on('dm:tts-ready', onDmTtsReady);
    socket.on('dm:error', onDmError);
    socket.on('chat:message', onChatMessage);
    socket.on('chat:reaction', onChatReaction);
    socket.on('dice:rolled', onDiceRolled);

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
      socket.off('dm:stream-end', onDmStreamEnd);
      socket.off('dm:tts-ready', onDmTtsReady);
      socket.off('dm:error', onDmError);
      socket.off('chat:message', onChatMessage);
      socket.off('chat:reaction', onChatReaction);
      socket.off('dice:rolled', onDiceRolled);
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
