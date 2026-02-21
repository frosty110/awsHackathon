// Typed Socket.IO event interfaces for multiplayer D&D

export type RoomPhase = "lobby" | "playing" | "collecting-actions" | "dm-responding";

export type PlayerPayload = {
  socketId: string;
  displayName: string;
  characterClass: string;
  connected: boolean;
  ready: boolean;
  submittedAction: boolean; // hidden — only indicates whether submitted, not the text
};

export type RoomStatePayload = {
  code: string;
  phase: RoomPhase;
  players: PlayerPayload[];
};

export type ChatMessagePayload = {
  id: string;
  fromSocketId: string;
  fromName: string;
  fromClass: string;
  text: string;
  timestamp: number;
};

// Events the server emits to the client
export interface ServerToClientEvents {
  "room:created": (data: { code: string }) => void;
  "room:state": (state: RoomStatePayload) => void;
  "room:player-joined": (player: PlayerPayload) => void;
  "room:player-disconnected": (data: { socketId: string; displayName: string }) => void;
  "room:player-reconnected": (data: { socketId: string }) => void;
  "room:started": () => void;
  "room:error": (data: { message: string }) => void;
  "turn:collecting-start": () => void;
  "turn:timer-start": (data: { durationMs: number; endsAt: number }) => void;
  "turn:player-submitted": (data: { socketId: string }) => void;
  "turn:player-unsubmitted": (data: { socketId: string }) => void;
  "dm:stream-start": () => void;
  "dm:chunk": (data: { text: string }) => void;
  "dm:stream-end": (data: { fullText: string }) => void;
  "dm:tts-ready": (data: { audio: string }) => void;
  "dm:error": (data: { message: string }) => void;
  "chat:message": (data: ChatMessagePayload) => void;
  "chat:reaction": (data: {
    messageId: string;
    emoji: string;
    fromSocketId: string;
    fromName: string;
  }) => void;
  "dice:rolled": (data: {
    socketId: string;
    displayName: string;
    result: number;
  }) => void;
}

// Events the client emits to the server
export interface ClientToServerEvents {
  "room:create": (data: { displayName: string; characterClass: string }) => void;
  "room:join": (data: { code: string; displayName: string; characterClass: string }) => void;
  "room:ready": () => void;
  "turn:submit-action": (data: { action: string }) => void;
  "turn:unsubmit-action": () => void;
  "chat:send": (data: { text: string }) => void;
  "chat:react": (data: { messageId: string; emoji: string }) => void;
  "dice:roll": (data: { result: number }) => void;
}

// Per-socket session data stored on the socket itself
export interface SocketData {
  roomCode: string;
  displayName: string;
  characterClass: string;
}
