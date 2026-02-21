import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types.js";
import {
  getRoom,
  submitAction,
  allActionsSubmitted,
  resetActions,
} from "../services/roomStore.js";
import {
  getOrCreate,
  appendMessage,
  getWindowedHistory,
} from "../services/conversationStore.js";
import {
  streamBedrockResponse,
  buildMultiplayerSystemPrompt,
} from "../services/bedrock.js";

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

    submitAction(roomCode, socket.id, action);

    // Notify all players that this player has submitted (action text hidden)
    io.to(roomCode).emit("turn:player-submitted", { socketId: socket.id });

    if (allActionsSubmitted(roomCode)) {
      // All players submitted early — clear the timer and go to DM immediately
      if (room.timerHandle !== null) {
        clearTimeout(room.timerHandle);
        room.timerHandle = null;
      }
      triggerDMResponse(io, roomCode);
    }
  });
}

/**
 * Start the 60-second turn timer for the given room.
 * Auto-fills any missing actions when the timer expires, then triggers the DM.
 */
export function startTurnTimer(io: IO, roomCode: string, durationMs = 60_000): void {
  const room = getRoom(roomCode);
  if (!room) return;

  room.phase = "collecting-actions";
  room.timerStartedAt = Date.now();

  // Reset all submitted actions at the start of a new turn
  resetActions(roomCode);

  io.to(roomCode).emit("turn:timer-start", {
    durationMs,
    endsAt: room.timerStartedAt + durationMs,
  });

  room.timerHandle = setTimeout(() => {
    room.timerHandle = null;

    // Auto-fill missing actions for all still-connected players
    for (const player of room.players.values()) {
      if (player.connected && player.submittedAction === null) {
        submitAction(
          roomCode,
          player.socketId,
          `${player.displayName} follows the group cautiously.`
        );
      }
    }

    triggerDMResponse(io, roomCode);
  }, durationMs);
}

/**
 * Trigger the DM opening monologue after all players are ready.
 * Introduces the party and sets the opening scene, then starts the first turn timer.
 */
export async function triggerDMOpening(io: IO, roomCode: string): Promise<void> {
  const room = getRoom(roomCode);
  if (!room) return;

  room.phase = "dm-responding";

  const players = [...room.players.values()];
  const multiplayerPrompt = buildMultiplayerSystemPrompt(players);

  // Ensure the conversation exists
  getOrCreate(room.conversationId);

  // Build the opening trigger message as a user turn (isSystemTrigger — not stored in visible history
  // but we do store it so the DM has context for subsequent turns)
  const openingMessage = {
    role: "user" as const,
    content:
      "The party has gathered. Begin the adventure at the Shattered Crown Tavern. Introduce the scene and each character by name and class.",
  };
  appendMessage(room.conversationId, openingMessage);

  io.to(roomCode).emit("dm:stream-start");

  let dmText = "";

  try {
    const result = await streamBedrockResponse(
      getWindowedHistory(room.conversationId),
      (text: string) => {
        dmText += text;
        room.currentDmText = dmText;
        io.to(roomCode).emit("dm:chunk", { text });
      },
      { multiplayerPrompt }
    );

    appendMessage(room.conversationId, {
      role: "assistant",
      content: result.text,
    });

    io.to(roomCode).emit("dm:stream-end", { fullText: result.text });
    room.currentDmText = "";
    room.phase = "playing";

    // 3-second pause after DM narration before the first turn timer starts
    setTimeout(() => {
      startTurnTimer(io, roomCode);
    }, 3_000);
  } catch (err) {
    console.error("[turnHandlers] DM opening failed:", err);
    io.to(roomCode).emit("dm:error", {
      message: "The Dungeon Master was lost to the void.",
    });
    room.phase = "playing";
    // Still start the timer so the game keeps moving
    setTimeout(() => {
      startTurnTimer(io, roomCode);
    }, 3_000);
  }
}

/**
 * Collect all submitted player actions, build the combined DM prompt,
 * stream the DM response to all room members, then start the next turn timer.
 */
export async function triggerDMResponse(io: IO, roomCode: string): Promise<void> {
  const room = getRoom(roomCode);
  if (!room) return;

  room.phase = "dm-responding";

  const players = [...room.players.values()];
  const multiplayerPrompt = buildMultiplayerSystemPrompt(players);

  // Build the combined player action message
  const actionLines = players
    .filter((p) => p.submittedAction !== null)
    .map((p) => `[${p.displayName} the ${p.characterClass}]: ${p.submittedAction}`)
    .join("\n");

  const combinedMessage =
    `The players act simultaneously:\n${actionLines}\n\n` +
    `Weave all of these into one dramatic narrative. You have full creative authority — ` +
    `actions may succeed, fail, or cancel each other out.`;

  appendMessage(room.conversationId, {
    role: "user",
    content: combinedMessage,
  });

  io.to(roomCode).emit("dm:stream-start");

  let dmText = "";

  try {
    const result = await streamBedrockResponse(
      getWindowedHistory(room.conversationId),
      (text: string) => {
        dmText += text;
        room.currentDmText = dmText;
        io.to(roomCode).emit("dm:chunk", { text });
      },
      { multiplayerPrompt }
    );

    appendMessage(room.conversationId, {
      role: "assistant",
      content: result.text,
    });

    io.to(roomCode).emit("dm:stream-end", { fullText: result.text });
    room.currentDmText = "";

    resetActions(roomCode);
    room.phase = "playing";

    // 3-second pause after DM narration before the next turn timer
    setTimeout(() => {
      startTurnTimer(io, roomCode);
    }, 3_000);
  } catch (err) {
    console.error("[turnHandlers] DM response failed:", err);
    io.to(roomCode).emit("dm:error", {
      message: "The Dungeon Master was lost to the void.",
    });
    resetActions(roomCode);
    room.phase = "playing";
    // Keep the game moving even on error
    setTimeout(() => {
      startTurnTimer(io, roomCode);
    }, 3_000);
  }
}
