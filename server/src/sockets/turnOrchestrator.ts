/**
 * turnOrchestrator.ts — DM opening, DM response, and countdown timer logic.
 *
 * Extracted from turnHandlers.ts to break the circular dependency:
 *   roomHandlers → turnHandlers → roomHandlers (disconnect handler)
 *
 * Both roomHandlers.ts and turnHandlers.ts import from here with static imports.
 */
import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types.js";
import {
  getRoom,
  submitAction,
  resetActions,
} from "../services/roomStore.js";
import {
  getOrCreate,
  appendMessage,
  HISTORY_WINDOW_SIZE,
} from "../services/conversationStore.js";
import { buildMultiplayerSystemPrompt } from "../services/promptBuilder.js";
import { generateMultiVoiceTTS } from "../services/tts.js";
import { logEvent } from "../services/logger.js";
import { executeDmTurn } from "../services/dmTurn.js";
import { put as s3Put, buildKey, getPresignedUrl } from "../services/mediaCache.js";
import { startCollectingActions } from "./turnHandlers.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Start the 30-second countdown timer. Called when the first player submits.
 * Auto-fills any missing actions when the timer expires, then triggers the DM.
 */
export function startCountdownTimer(io: IO, roomCode: string, durationMs = 30_000): void {
  const room = getRoom(roomCode);
  if (!room) return;

  room.timerStartedAt = Date.now();

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
  if (!room || room.phase === "dm-responding") return; // idempotency guard
  room.phase = "dm-responding";

  const players = [...room.players.values()];
  const multiplayerPrompt = buildMultiplayerSystemPrompt(players);

  // Ensure the conversation exists and reuse the loaded object
  const convo = await getOrCreate(room.conversationId);

  // Build the opening trigger message as a user turn
  const openingMessage = {
    role: "user" as const,
    content:
      "The party has gathered. Begin the adventure at the Shattered Crown Tavern. Introduce the scene and each character by name and class.",
  };
  await appendMessage(room.conversationId, openingMessage);

  io.to(roomCode).emit("dm:stream-start");

  let dmText = "";

  try {
    // Reuse the already-loaded conversation for windowed history (avoids extra Redis read)
    convo.history.push(openingMessage);
    const history = convo.history.slice(-HISTORY_WINDOW_SIZE);

    const turnResult = await executeDmTurn(
      { id: room.conversationId, history: [] },
      openingMessage.content,
      history,
      {
        onText: (text) => {
          dmText += text;
          room.currentDmText = dmText;
          io.to(roomCode).emit("dm:chunk", { text });
        },
        onMoodChange: (mood) => io.to(roomCode).emit("dm:mood-change", { mood }),
      },
      { multiplayerPrompt, loreQuery: openingMessage.content }
    );

    io.to(roomCode).emit("dm:stream-end", { fullText: turnResult.fullText, mood: turnResult.mood });
    room.currentDmText = "";
    room.phase = "playing";

    // Async TTS — don't block game flow
    generateMultiVoiceTTS(turnResult.fullText, { model: "speech-2.8-hd" })
      .then(async ({ audioBuffer }) => {
        // Upload to S3 and emit a presigned URL (5-minute expiry)
        const ttsKey = buildKey("tts/multiplayer", `${roomCode}-${Date.now()}-opening`, "mp3");
        await s3Put(ttsKey, audioBuffer, "audio/mpeg");
        const audioUrl = await getPresignedUrl(ttsKey, 300);
        if (audioUrl) {
          io.to(roomCode).emit("dm:tts-ready", { audioUrl });
        } else {
          // S3 unconfigured — fall back to base64 (dev mode)
          io.to(roomCode).emit("dm:tts-ready", { audio: audioBuffer.toString("base64") });
        }
      })
      .catch((err) => {
        logEvent("error", "turnOrchestrator.dm_tts_failed", { stage: "opening" }, err);
      });

    // 3-second pause after DM narration before the first turn timer starts
    setTimeout(() => {
      startCollectingActions(io, roomCode);
    }, 3_000);
  } catch (err) {
    logEvent("error", "turnOrchestrator.dm_opening_failed", {}, err);
    io.to(roomCode).emit("dm:error", {
      message: "The Dungeon Master was lost to the void.",
    });
    room.phase = "playing";
    // Still start the timer so the game keeps moving
    setTimeout(() => {
      startCollectingActions(io, roomCode);
    }, 3_000);
  }
}

/**
 * Collect all submitted player actions, build the combined DM prompt,
 * stream the DM response to all room members, then start the next turn timer.
 */
export async function triggerDMResponse(io: IO, roomCode: string): Promise<void> {
  const room = getRoom(roomCode);
  if (!room || room.phase === "dm-responding") return; // idempotency guard
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

  await appendMessage(room.conversationId, {
    role: "user",
    content: combinedMessage,
  });

  io.to(roomCode).emit("dm:stream-start");

  let dmText = "";

  try {
    // Reuse already-loaded conversation for windowed history (avoids extra Redis read)
    const convo = await getOrCreate(room.conversationId);
    const history = convo.history.slice(-HISTORY_WINDOW_SIZE);

    const turnResult = await executeDmTurn(
      { id: room.conversationId, history: [] },
      combinedMessage,
      history,
      {
        onText: (text) => {
          dmText += text;
          room.currentDmText = dmText;
          io.to(roomCode).emit("dm:chunk", { text });
        },
        onMoodChange: (mood) => io.to(roomCode).emit("dm:mood-change", { mood }),
      },
      { multiplayerPrompt, loreQuery: combinedMessage }
    );

    io.to(roomCode).emit("dm:stream-end", { fullText: turnResult.fullText, mood: turnResult.mood });
    room.currentDmText = "";

    // Async TTS — don't block game flow
    generateMultiVoiceTTS(turnResult.fullText, { model: "speech-2.8-turbo" })
      .then(async ({ audioBuffer }) => {
        // Upload to S3 and emit a presigned URL (5-minute expiry)
        const ttsKey = buildKey("tts/multiplayer", `${roomCode}-${Date.now()}-turn`, "mp3");
        await s3Put(ttsKey, audioBuffer, "audio/mpeg");
        const audioUrl = await getPresignedUrl(ttsKey, 300);
        if (audioUrl) {
          io.to(roomCode).emit("dm:tts-ready", { audioUrl });
        } else {
          // S3 unconfigured — fall back to base64 (dev mode)
          io.to(roomCode).emit("dm:tts-ready", { audio: audioBuffer.toString("base64") });
        }
      })
      .catch((err) => {
        logEvent("error", "turnOrchestrator.dm_tts_failed", { stage: "turn" }, err);
      });

    resetActions(roomCode);
    room.phase = "playing";

    // 3-second pause after DM narration before the next turn timer
    setTimeout(() => {
      startCollectingActions(io, roomCode);
    }, 3_000);
  } catch (err) {
    logEvent("error", "turnOrchestrator.dm_response_failed", {}, err);
    io.to(roomCode).emit("dm:error", {
      message: "The Dungeon Master was lost to the void.",
    });
    resetActions(roomCode);
    room.phase = "playing";
    // Keep the game moving even on error
    setTimeout(() => {
      startCollectingActions(io, roomCode);
    }, 3_000);
  }
}
