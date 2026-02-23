import { Server } from "socket.io";
import { Server as HTTPServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types.js";
import { registerRoomHandlers, handleReconnection } from "./roomHandlers.js";
import { registerChatHandlers } from "./chatHandlers.js";
import { registerTurnHandlers } from "./turnHandlers.js";
import { redisClient, isRedisAvailable } from "../services/redis.js";
import { ALLOWED_ORIGINS } from "../middleware/security.js";
import { getJwtSecret } from "../middleware/auth.js";

export type { ClientToServerEvents, ServerToClientEvents, SocketData };

// Module-level io instance — set once during server init, used by route handlers
let io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

// ─── H2: Per-socket O(1) fixed-window rate limiter ───────────────────────────
interface RateCounter {
  count: number;
  windowStart: number;
}
const socketRateMap = new Map<string, RateCounter>();
const SOCKET_RATE_LIMIT = 30; // max events per window
const SOCKET_RATE_WINDOW_MS = 10_000; // 10 seconds

function checkSocketRate(socketId: string): boolean {
  const now = Date.now();
  let counter = socketRateMap.get(socketId);
  if (!counter || now - counter.windowStart >= SOCKET_RATE_WINDOW_MS) {
    counter = { count: 0, windowStart: now };
    socketRateMap.set(socketId, counter);
  }
  counter.count++;
  return counter.count <= SOCKET_RATE_LIMIT;
}

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
        // Reuse Express ALLOWED_ORIGINS so Socket.IO and REST API use the same allowlist.
        // Dev default: ["http://localhost:5173"] — set ALLOWED_ORIGINS env var for production.
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
      },
      connectionStateRecovery: {
        // Allow up to 2 minutes of disconnection before session is discarded.
        // NOTE: Works for single-instance only — Redis Pub/Sub adapter does not support
        // cross-instance recovery. Use @socket.io/redis-streams-adapter for that.
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: false, // Auth middleware must re-run on reconnection (H-2)
      },
      // M2: Limit incoming packet size to prevent abuse (16KB)
      maxHttpBufferSize: 16 * 1024,
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

  // H1: Socket.IO JWT auth middleware (optional auth — matches HTTP optionalAuth pattern)
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      // Allow unauthenticated connections in dev (matches optionalAuth pattern)
      return next();
    }
    try {
      const payload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as { userId: string; username: string };
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    // H2: Per-socket rate limiting middleware — intercepts all events before handlers fire
    socket.use((_packet, next) => {
      if (!checkSocketRate(socket.id)) {
        console.warn(`[socket.io] Rate limit exceeded for socket ${socket.id}, disconnecting`);
        socket.disconnect(true);
        return;
      }
      next();
    });

    // Clean up rate tracking on disconnect
    socket.on("disconnect", () => {
      socketRateMap.delete(socket.id);
    });

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
