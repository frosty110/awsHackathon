import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types.js";
import {
  getRoom,
  submitAction,
  unsubmitAction,
  allActionsSubmitted,
  resetActions,
} from "../services/roomStore.js";
import { sanitizeUserInput } from "../services/inputSanitizer.js";
import { triggerDMResponse, startCountdownTimer } from "./turnOrchestrator.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Register turn-cycle socket event handlers.
 * Call once per connected socket in the io.on("connection") callback.
 */
export function registerTurnHandlers(io: IO, socket: TypedSocket): void {
  // ─── turn:submit-action ───────────────────────────────────────────────────
  socket.on("turn:submit-action", ({ action }) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    const room = getRoom(roomCode);
    if (!room || room.phase !== "collecting-actions") {
      // Not in the right phase — silently ignore
      return;
    }

    // Sanitize and cap action text at 500 chars
    const sanitizedAction = sanitizeUserInput(action, 500);
    if (!sanitizedAction) return; // Empty after sanitization — silently ignore

    // Check if the countdown timer needs to start (first submission this turn)
    const timerNotStarted = room.timerStartedAt === null;

    submitAction(roomCode, socket.id, sanitizedAction);

    // Notify all players that this player has submitted (action text hidden)
    io.to(roomCode).emit("turn:player-submitted", { socketId: socket.id });

    // Start the 30s countdown on the first submission
    if (timerNotStarted) {
      startCountdownTimer(io, roomCode);
    }

    if (allActionsSubmitted(roomCode)) {
      // All players submitted early — clear the timer and go to DM immediately
      if (room.timerHandle !== null) {
        clearTimeout(room.timerHandle);
        room.timerHandle = null;
      }
      triggerDMResponse(io, roomCode);
    }
  });

  // ─── turn:unsubmit-action (edit) ───────────────────────────────────────────
  socket.on("turn:unsubmit-action", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    const room = getRoom(roomCode);
    if (!room || room.phase !== "collecting-actions") return;

    unsubmitAction(roomCode, socket.id);
    io.to(roomCode).emit("turn:player-unsubmitted", { socketId: socket.id });
  });
}

/**
 * Begin the action-collection phase for a new turn.
 * Resets all actions and notifies clients to start typing — but does NOT start
 * the countdown timer. The timer starts when the first player submits.
 */
export function startCollectingActions(io: IO, roomCode: string): void {
  const room = getRoom(roomCode);
  if (!room) return;

  room.phase = "collecting-actions";
  room.timerStartedAt = null;
  room.timerHandle = null;

  // Reset all submitted actions at the start of a new turn
  resetActions(roomCode);

  io.to(roomCode).emit("turn:collecting-start");
}
