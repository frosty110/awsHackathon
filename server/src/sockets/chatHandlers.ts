import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

// Allowed emoji reaction identifiers (D&D-themed set)
const ALLOWED_EMOJIS = new Set(["thumbs_up", "skull", "fire", "swords", "sparkles", "laugh"]);

/**
 * Register player-to-player chat and dice roll socket event handlers.
 * These events are NEVER stored in conversationStore and are invisible to the DM AI.
 * Call once per connected socket in the io.on("connection") callback.
 */
export function registerChatHandlers(io: IO, socket: TypedSocket): void {
  // ─── chat:send ────────────────────────────────────────────────────────────
  socket.on("chat:send", ({ text }) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    const message = {
      id: crypto.randomUUID(),
      fromSocketId: socket.id,
      fromName: socket.data.displayName ?? "Unknown",
      fromClass: socket.data.characterClass ?? "Unknown",
      text,
      timestamp: Date.now(),
    };

    // Relay to all OTHER players in the room — sender already has their own message in the UI
    // IMPORTANT: this message never touches conversationStore or any Bedrock prompt
    socket.to(roomCode).emit("chat:message", message);
  });

  // ─── chat:react ───────────────────────────────────────────────────────────
  socket.on("chat:react", ({ messageId, emoji }) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    if (!ALLOWED_EMOJIS.has(emoji)) {
      // Silently ignore disallowed emoji types
      return;
    }

    io.to(roomCode).emit("chat:reaction", {
      messageId,
      emoji,
      fromSocketId: socket.id,
      fromName: socket.data.displayName ?? "Unknown",
    });
  });

  // ─── dice:roll ────────────────────────────────────────────────────────────
  socket.on("dice:roll", ({ result }) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    // All dice rolls are visible to all players in the room (including sender)
    io.to(roomCode).emit("dice:rolled", {
      socketId: socket.id,
      displayName: socket.data.displayName ?? "Unknown",
      result,
    });
  });
}
