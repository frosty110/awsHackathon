// Global error notification store — external store pattern (same as backgroundMusic.ts).

export interface AppError {
  id: string;
  source: string;
  message: string;
  timestamp: number;
  read: boolean;
}

const MAX_ERRORS = 20;

// --- State ---
let errors: AppError[] = [];

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// --- Snapshot helpers (stable reference for useSyncExternalStore) ---
let cachedErrors = errors;
let cachedUnread = 0;

export function getErrors(): AppError[] {
  return cachedErrors;
}

export function getUnreadCount(): number {
  return cachedUnread;
}

function updateCache() {
  cachedErrors = [...errors];
  cachedUnread = errors.filter((e) => !e.read).length;
}

// --- Mutations ---

export function pushError(source: string, message: string) {
  errors = [
    { id: crypto.randomUUID(), source, message, timestamp: Date.now(), read: false },
    ...errors,
  ].slice(0, MAX_ERRORS);
  updateCache();
  notify();
}

export function markAllRead() {
  errors = errors.map((e) => (e.read ? e : { ...e, read: true }));
  updateCache();
  notify();
}

export function dismissError(id: string) {
  errors = errors.filter((e) => e.id !== id);
  updateCache();
  notify();
}

export function clearAll() {
  errors = [];
  updateCache();
  notify();
}
