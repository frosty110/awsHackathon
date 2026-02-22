import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  subscribe,
  getErrors,
  getUnreadCount,
  markAllRead,
  dismissError,
  clearAll,
  type AppError,
} from '../services/errorStore';

// --- Stable snapshots for useSyncExternalStore ---
let cachedSnap: { errors: AppError[]; unread: number } = { errors: getErrors(), unread: getUnreadCount() };
let cachedKey = '';

function getSnapshotStable() {
  const errors = getErrors();
  const unread = getUnreadCount();
  const key = `${errors.length}:${unread}:${errors[0]?.id ?? ''}`;
  if (key !== cachedKey) {
    cachedSnap = { errors, unread };
    cachedKey = key;
  }
  return cachedSnap;
}

function relativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function ErrorNotification() {
  const { errors, unread } = useSyncExternalStore(subscribe, getSnapshotStable);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Click-outside closes panel
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Self-hide when no errors
  if (errors.length === 0) return null;

  function handleToggle() {
    if (!open) markAllRead();
    setOpen((prev) => !prev);
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Warning icon + badge */}
      <button
        onClick={handleToggle}
        className="relative w-7 h-7 flex items-center justify-center rounded text-parchment/60 hover:text-parchment transition-colors"
        title="Background errors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-blood text-[10px] font-bold text-parchment px-1">
            {unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 w-80 bg-surface border border-blood/30 rounded-lg shadow-xl overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-blood/30">
            <span className="font-cinzel text-xs text-parchment/80 tracking-wide">Errors</span>
            <button
              onClick={() => { clearAll(); setOpen(false); }}
              className="text-[10px] text-parchment/50 hover:text-parchment transition-colors"
            >
              Clear All
            </button>
          </div>

          {/* Error list */}
          <div className="max-h-64 overflow-y-auto">
            {errors.map((err) => (
              <div key={err.id} className="flex items-start gap-2 px-3 py-2 border-b border-blood/10 last:border-b-0">
                {/* Source badge */}
                <span className="shrink-0 mt-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-blood/20 text-blood-light px-1.5 py-0.5 rounded">
                  {err.source}
                </span>

                {/* Message + time */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-parchment/80 leading-snug break-words">{err.message}</p>
                  <p className="text-[10px] text-parchment/40 mt-0.5">{relativeTime(err.timestamp)}</p>
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => dismissError(err.id)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center text-parchment/30 hover:text-parchment transition-colors"
                  title="Dismiss"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
