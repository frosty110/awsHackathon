import { Server } from "socket.io";
import { Server as HTTPServer } from "node:http";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types.js";

export type { ClientToServerEvents, ServerToClientEvents, SocketData };

// Module-level io instance — set once during server init, used by route handlers
let io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Attach Socket.IO to an existing http.Server without disrupting Express routes.
 * Call this once in server/src/index.ts after createServer(app).
 */
export function initSocketIO(
  httpServer: HTTPServer
): Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> {
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
        // Allow up to 2 minutes of disconnection before session is discarded
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
      },
    }
  );

  return io;
}

export { io };
