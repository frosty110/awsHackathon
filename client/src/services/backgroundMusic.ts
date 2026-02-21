// Background music player — separate from TTS audioController.
// Loops at low volume; won't interfere with voice audio.

const DEFAULT_VOLUME = 0.12;
const POLL_INTERVAL_MS = 4000;
const RETRY_INTERVAL_MS = 10000;
const MAX_RETRIES = 5;
const MAX_POLLS = 30; // stop polling after ~2 minutes of 202s

let audio: HTMLAudioElement | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let currentVolume = DEFAULT_VOLUME;
let paused = false;
let retryCount = 0;
let pollCount = 0;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

function clearPoll() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function tryPlay() {
  clearPoll();
  try {
    console.log('[music] fetching /api/music...');
    const res = await fetch('/api/music');

    if (res.status === 202) {
      console.log('[music] still generating, polling again in', POLL_INTERVAL_MS, 'ms');
      pollTimer = setTimeout(tryPlay, POLL_INTERVAL_MS);
      return;
    }

    if (!res.ok) {
      retryCount++;
      if (retryCount <= MAX_RETRIES) {
        console.warn(`[music] server error: ${res.status}, retry ${retryCount}/${MAX_RETRIES} in ${RETRY_INTERVAL_MS / 1000}s`);
        pollTimer = setTimeout(tryPlay, RETRY_INTERVAL_MS);
      } else {
        console.warn('[music] server error:', res.status, '— max retries reached');
      }
      return;
    }

    const blob = await res.blob();
    console.log('[music] received', (blob.size / 1024).toFixed(0), 'KB — playing');
    const url = URL.createObjectURL(blob);

    audio = new Audio(url);
    audio.loop = true;
    audio.volume = currentVolume;
    const playPromise = audio.play();
    notify(); // controls can now render
    playPromise
      .then(() => console.log('[music] playing ✓'))
      .catch((err) => console.warn('[music] play() failed:', err));
  } catch (err) {
    console.warn('[music] fetch failed:', err);
  }
}

export function startBackgroundMusic() {
  if (audio) return; // already started
  void tryPlay();
}

export function stopBackgroundMusic() {
  clearPoll();
  if (audio) {
    audio.pause();
    audio = null;
  }
  paused = false;
  notify();
}

export function setVolume(v: number) {
  currentVolume = Math.max(0, Math.min(1, v));
  if (audio) audio.volume = currentVolume;
  notify();
}

export function getVolume() {
  return currentVolume;
}

export function togglePause() {
  if (!audio) return;
  if (paused) {
    audio.play().catch(() => {});
    paused = false;
  } else {
    audio.pause();
    paused = true;
  }
  notify();
}

export function isPaused() {
  return paused;
}

export function isReady() {
  return audio !== null;
}
