import helmet from "helmet";
import cors from "cors";

/**
 * ALLOWED_ORIGINS — sourced from env, defaults to local Vite dev server.
 * Exported so Socket.IO can reuse the same allowlist.
 */
export const ALLOWED_ORIGINS: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173"];

/**
 * helmetMiddleware — sets standard HTTP security headers.
 *
 * CSP notes:
 * - connect-src: "self" allows SSE (EventSource) connections to /api/chat from the same origin.
 * - Vite dev proxy forwards /api requests, so in dev the origin is always the Vite dev server.
 * - script-src: "self" prevents XSS via inline script injection.
 * - img-src: data: permits inline base64 images used by client UI.
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],  // Allow WebSocket connections
      imgSrc: ["'self'", "data:"],
      mediaSrc: ["'self'", "blob:"],           // Allow blob: URLs for audio/video
      workerSrc: ["'self'", "blob:"],          // Allow blob: for web workers if any
    },
  },
  hsts: {
    maxAge: 31536000,  // 1 year
    includeSubDomains: true,
  },
});

/**
 * corsMiddleware — restricts cross-origin requests to ALLOWED_ORIGINS.
 * credentials: false because this API uses Authorization header (Bearer token), not cookies.
 */
export const corsMiddleware = cors({
  origin: ALLOWED_ORIGINS,
  methods: ["GET", "POST", "OPTIONS"],
  credentials: false,
});
