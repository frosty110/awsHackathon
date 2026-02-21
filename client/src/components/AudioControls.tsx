import { useEffect, useSyncExternalStore } from 'react';
import {
  subscribe,
  getVolume,
  isPaused,
  isReady,
  setVolume,
  togglePause,
} from '../services/backgroundMusic';

function getSnapshot() {
  return { volume: getVolume(), paused: isPaused(), ready: isReady() };
}

// Serialize so useSyncExternalStore can compare
let cachedSnap = getSnapshot();
let cachedKey = JSON.stringify(cachedSnap);

function getSnapshotStable() {
  const next = getSnapshot();
  const key = JSON.stringify(next);
  if (key !== cachedKey) {
    cachedSnap = next;
    cachedKey = key;
  }
  return cachedSnap;
}

export function AudioControls() {
  const { volume, paused, ready } = useSyncExternalStore(subscribe, getSnapshotStable);

  // Don't render until music has loaded
  if (!ready) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={togglePause}
        title={paused ? 'Play music' : 'Pause music'}
        className="w-7 h-7 flex items-center justify-center rounded text-parchment/60 hover:text-parchment transition-colors"
      >
        {paused ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        )}
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="volume-slider w-20 h-1 appearance-none bg-parchment/20 rounded cursor-pointer accent-dm-gold"
        title={`Volume: ${Math.round(volume * 100)}%`}
      />
    </div>
  );
}
