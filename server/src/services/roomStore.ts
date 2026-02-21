import { customAlphabet } from "nanoid";
import type { RoomPhase, RoomStatePayload, PlayerPayload } from "../sockets/types.js";

export type { RoomPhase };

export type Player = {
  socketId: string;
  displayName: string;
  characterClass: string;
  connected: boolean;
  ready: boolean;
  submittedAction: string | null;
};

export type Room = {
  code: string;
  conversationId: string;
  phase: RoomPhase;
  players: Map<string, Player>;
  timerStartedAt: number | null;
  timerHandle: ReturnType<typeof setTimeout> | null;
  // Accumulates the DM stream text — used to catch up late-joiners
  currentDmText: string;
};

// Alphabet excludes I and O to avoid visual confusion with 1 and 0
const genCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ", 6);

// Module-level in-memory store
const rooms = new Map<string, Room>();

/**
 * Generate a unique 6-character room code that doesn't already exist in the store.
 */
export function generateUniqueRoomCode(): string {
  let code: string;
  do {
    code = genCode();
  } while (rooms.has(code));
  return code;
}

/**
 * Create a new room and add it to the store.
 */
export function createRoom(code: string, conversationId: string): Room {
  const room: Room = {
    code,
    conversationId,
    phase: "lobby",
    players: new Map(),
    timerStartedAt: null,
    timerHandle: null,
    currentDmText: "",
  };
  rooms.set(code, room);
  return room;
}

/**
 * Retrieve a room by its code.
 */
export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

/**
 * Delete a room, clearing any pending timers first.
 */
export function deleteRoom(code: string): void {
  const room = rooms.get(code);
  if (room?.timerHandle !== null && room?.timerHandle !== undefined) {
    clearTimeout(room.timerHandle);
  }
  rooms.delete(code);
}

/**
 * Add a player to a room. Returns false if the room doesn't exist or is full (4 players max).
 */
export function addPlayer(code: string, player: Player): boolean {
  const room = rooms.get(code);
  if (!room || room.players.size >= 4) {
    return false;
  }
  room.players.set(player.socketId, player);
  return true;
}

/**
 * Remove a player from a room's player map entirely.
 */
export function removePlayer(code: string, socketId: string): void {
  const room = rooms.get(code);
  room?.players.delete(socketId);
}

/**
 * Mark a player as disconnected (connected = false) rather than removing them.
 */
export function markPlayerDisconnected(code: string, socketId: string): void {
  const room = rooms.get(code);
  const player = room?.players.get(socketId);
  if (player) {
    player.connected = false;
  }
}

/**
 * Mark a player as reconnected (connected = true).
 */
export function markPlayerReconnected(code: string, socketId: string): void {
  const room = rooms.get(code);
  const player = room?.players.get(socketId);
  if (player) {
    player.connected = true;
  }
}

/**
 * Mark a player as ready in the lobby.
 */
export function markPlayerReady(code: string, socketId: string): void {
  const room = rooms.get(code);
  const player = room?.players.get(socketId);
  if (player) {
    player.ready = true;
  }
}

/**
 * Record a player's submitted turn action. Returns true if successful.
 */
export function submitAction(code: string, socketId: string, action: string): boolean {
  const room = rooms.get(code);
  const player = room?.players.get(socketId);
  if (!player) {
    return false;
  }
  player.submittedAction = action;
  return true;
}

/**
 * Returns true if every currently-connected player has submitted an action.
 */
export function allActionsSubmitted(code: string): boolean {
  const room = rooms.get(code);
  if (!room) return false;
  for (const player of room.players.values()) {
    if (player.connected && player.submittedAction === null) {
      return false;
    }
  }
  return true;
}

/**
 * Reset all players' submitted actions to null (start of new turn).
 */
export function resetActions(code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  for (const player of room.players.values()) {
    player.submittedAction = null;
  }
}

/**
 * Convert the room to a serializable payload. Action text is hidden — only the boolean flag is sent.
 * Returns null if the room does not exist.
 */
export function getRoomStatePayload(code: string): RoomStatePayload | null {
  const room = rooms.get(code);
  if (!room) return null;

  const players: PlayerPayload[] = Array.from(room.players.values()).map((p) => ({
    socketId: p.socketId,
    displayName: p.displayName,
    characterClass: p.characterClass,
    connected: p.connected,
    ready: p.ready,
    submittedAction: p.submittedAction !== null, // hide action text
  }));

  return {
    code: room.code,
    phase: room.phase,
    players,
  };
}

/**
 * Returns how many players are currently connected to the room.
 */
export function getConnectedPlayerCount(code: string): number {
  const room = rooms.get(code);
  if (!room) return 0;
  let count = 0;
  for (const player of room.players.values()) {
    if (player.connected) count++;
  }
  return count;
}

/**
 * Returns how many players have set ready = true.
 */
export function getAllReadyCount(code: string): number {
  const room = rooms.get(code);
  if (!room) return 0;
  let count = 0;
  for (const player of room.players.values()) {
    if (player.ready) count++;
  }
  return count;
}
