import { Server } from "socket.io";
import { Server as HTTPServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types.js";
import { registerRoomHandlers, handleReconnection } from "./roomHandlers.js";
import { registerChatHandlers } from "./chatHandlers.js";
import { registerTurnHandlers } from "./turnHandlers.js";
import { redisClient, isRedisAvailable } from "../services/redis.js";

export type { ClientToServerEvents, ServerToClientEvents, SocketData };

// Module-level io instance — set once during server init, used by route handlers
let io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Attach Socket.IO to an existing http.Server without disrupting Express routes.
 * Call this once in server/src/index.ts after createServer(app).
 *
 * When Redis is available, wires the Redis Pub/Sub adapter for multi-instance support.
 *
 * LIMITATION: The standard Redis Pub/Sub adapter does NOT support connectionStateRecovery
 * in multi-instance mode (confirmed by Socket.IO docs). connectionStateRecovery below
 * works correctly for single-instance deployments (current scope). For multi-instance
 * recovery, switch to @socket.io/redis-streams-adapter.
 */
export async function initSocketIO(
  httpServer: HTTPServer
): Promise<Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>> {
  io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    {
      cors: {
        // Dev: Vite proxy forwards /socket.io traffic, so client origin is the Vite dev server.
        // Production: client is served from same origin, no CORS needed (but allow as fallback).
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
      },
      connectionStateRecovery: {
        // Allow up to 2 minutes of disconnection before session is discarded.
        // NOTE: Works for single-instance only — Redis Pub/Sub adapter does not support
        // cross-instance recovery. Use @socket.io/redis-streams-adapter for that.
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
      },
    }
  );

  // Wire Redis adapter for future multi-instance support when Redis is available
  if (isRedisAvailable()) {
    // Redis Pub/Sub requires a dedicated subscriber connection — duplicate() creates one
    // without sharing the pub client's connection state (see research pitfall #6)
    const subClient = redisClient.duplicate();
    await subClient.connect();
    io.adapter(createAdapter(redisClient, subClient));
    console.log("[socket.io] Redis adapter attached");
  }

  io.on("connection", (socket) => {
    // Handle reconnection first — if session was recovered, restore room state
    if (socket.recovered) {
      handleReconnection(io, socket);
    }

    // Register all event handler groups for this socket
    registerRoomHandlers(io, socket);
    registerTurnHandlers(io, socket);
    registerChatHandlers(io, socket);
  });

  return io;
}

export { io };
