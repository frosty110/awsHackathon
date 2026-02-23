import type { Response } from "express";

/**
 * Tracks active SSE Response objects so graceful shutdown can notify
 * connected clients before closing the HTTP server.
 *
 * Add a stream after SSE headers are written; remove when the response ends
 * or the client disconnects.
 */
export const activeSSEStreams = new Set<Response>();
