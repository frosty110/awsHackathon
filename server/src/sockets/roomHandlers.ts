import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types.js";
import {
  createRoom,
  getRoom,
  addPlayer,
  markPlayerDisconnected,
  markPlayerReconnected,
  deleteRoom,
  markPlayerReady,
  getRoomStatePayload,
  getConnectedPlayerCount,
  getAllReadyCount,
  submitAction,
  allActionsSubmitted,
  generateUniqueRoomCode,
  getActiveRoomCodes,
} from "../services/roomStore.js";
import { getOrCreate } from "../services/conversationStore.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Register all room lifecycle socket event handlers: create, join, ready, disconnect.
 * Call once per connected socket in the io.on("connection") callback.
 */
export function registerRoomHandlers(io: IO, socket: TypedSocket): void {
  // ─── room:create ──────────────────────────────────────────────────────────
  socket.on("room:create", ({ displayName, characterClass }) => {
    const code = generateUniqueRoomCode();
    // Create a conversation for this room so the DM has persistent history
    const convo = getOrCreate();
    createRoom(code, convo.id);

    const player = {
      socketId: socket.id,
      displayName,
      characterClass,
      connected: true,
      ready: false,
      submittedAction: null as string | null,
    };

    addPlayer(code, player);

    socket.data.roomCode = code;
    socket.data.displayName = displayName;
    socket.data.characterClass = characterClass;

    void socket.join(code);

    console.log(`[room:create] code="${code}" socket=${socket.id}`);
    socket.emit("room:created", { code });

    const statePayload = getRoomStatePayload(code);
    if (statePayload) {
      socket.emit("room:state", statePayload);
    }
  });

  // ─── room:join ────────────────────────────────────────────────────────────
  socket.on("room:join", ({ code, displayName, characterClass }) => {
    const normalizedCode = code.toUpperCase();
    const room = getRoom(normalizedCode);
    console.log(`[room:join] code="${normalizedCode}" socket=${socket.id} found=${!!room}`);

    if (!room) {
      const active = getActiveRoomCodes(5);
      console.log(`[room:join] FAILED — no room "${normalizedCode}". Active rooms (${active.length}): [${active.join(", ")}]`);
      socket.emit("room:error", { message: "Room not found" });
      return;
    }

    if (room.players.size >= 4) {
      socket.emit("room:error", { message: "Room is full" });
      return;
    }

    const player = {
      socketId: socket.id,
      displayName,
      characterClass,
      connected: true,
      ready: false,
      submittedAction: null as string | null,
    };

    addPlayer(normalizedCode, player);

    socket.data.roomCode = normalizedCode;
    socket.data.displayName = displayName;
    socket.data.characterClass = characterClass;

    void socket.join(normalizedCode);

    // Tell all existing room members about the new joiner
    const playerPayload = {
      socketId: socket.id,
      displayName,
      characterClass,
      connected: true,
      ready: false,
      submittedAction: false,
    };
    io.to(normalizedCode).emit("room:player-joined", playerPayload);

    // Send full room state to the joining socket
    const statePayload = getRoomStatePayload(normalizedCode);
    if (statePayload) {
      socket.emit("room:state", statePayload);
    }

    // If mid-game, send the latest DM text so the late joiner is caught up
    if (room.phase !== "lobby" && room.currentDmText) {
      socket.emit("dm:stream-end", { fullText: room.currentDmText });
    }
  });

  // ─── room:ready ───────────────────────────────────────────────────────────
  socket.on("room:ready", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    markPlayerReady(roomCode, socket.id);

    const statePayload = getRoomStatePayload(roomCode);
    if (statePayload) {
      io.to(roomCode).emit("room:state", statePayload);
    }

    const connectedCount = getConnectedPlayerCount(roomCode);
    const readyCount = getAllReadyCount(roomCode);

    if (connectedCount >= 2 && readyCount === connectedCount) {
      const room = getRoom(roomCode);
      if (room) {
        room.phase = "playing";
      }
      io.to(roomCode).emit("room:started");

      // Trigger the DM opening monologue — imported lazily to avoid circular deps
      // We use dynamic import to break the circular dependency:
      // roomHandlers -> turnHandlers -> roomHandlers (disconnect handler)
      import("./turnHandlers.js")
        .then(({ triggerDMOpening }) => {
          triggerDMOpening(io, roomCode);
        })
        .catch((err: unknown) => {
          console.error("[roomHandlers] Failed to trigger DM opening:", err);
        });
    }
  });

  // ─── disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    markPlayerDisconnected(roomCode, socket.id);

    io.to(roomCode).emit("room:player-disconnected", {
      socketId: socket.id,
      displayName: socket.data.displayName ?? "Unknown",
    });

    // If the game is collecting actions and this player hadn't submitted, auto-fill their action
    const room = getRoom(roomCode);
    if (room && room.phase === "collecting-actions") {
      const player = room.players.get(socket.id);
      if (player && player.submittedAction === null) {
        const timerNotStarted = room.timerStartedAt === null;
        const displayName = socket.data.displayName ?? "The player";
        submitAction(roomCode, socket.id, `${displayName} hesitates, unsure of what to do.`);

        if (allActionsSubmitted(roomCode)) {
          if (room.timerHandle !== null) {
            clearTimeout(room.timerHandle);
            room.timerHandle = null;
          }
          // Trigger DM response
          import("./turnHandlers.js")
            .then(({ triggerDMResponse }) => {
              triggerDMResponse(io, roomCode);
            })
            .catch((err: unknown) => {
              console.error("[roomHandlers] Failed to trigger DM response after disconnect:", err);
            });
        } else if (timerNotStarted) {
          // Auto-fill was the first submission — start countdown for remaining players
          import("./turnHandlers.js")
            .then(({ startCountdownTimer }) => {
              startCountdownTimer(io, roomCode);
            })
            .catch((err: unknown) => {
              console.error("[roomHandlers] Failed to start countdown after disconnect:", err);
            });
        }
      }
    }

    // Clean up completely abandoned rooms
    if (getConnectedPlayerCount(roomCode) === 0) {
      deleteRoom(roomCode);
    }
  });
}

/**
 * Handle reconnection for a socket whose session was recovered by Socket.IO.
 * Call this in the io.on("connection") callback when socket.recovered === true.
 */
export function handleReconnection(io: IO, socket: TypedSocket): void {
  const roomCode = socket.data.roomCode;
  if (!roomCode) return;

  markPlayerReconnected(roomCode, socket.id);

  io.to(roomCode).emit("room:player-reconnected", { socketId: socket.id });

  const statePayload = getRoomStatePayload(roomCode);
  if (statePayload) {
    socket.emit("room:state", statePayload);
  }

  // If there's a DM narration in progress or a prior DM text, catch the reconnected player up
  const room = getRoom(roomCode);
  if (room && room.currentDmText) {
    socket.emit("dm:stream-end", { fullText: room.currentDmText });
  }
}
