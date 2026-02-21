// Background music player — separate from TTS audioController.
// Loops at low volume; won't interfere with voice audio.

const VOLUME = 0.12;
const POLL_INTERVAL_MS = 4000;

let audio: HTMLAudioElement | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

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
      console.warn('[music] server error:', res.status);
      return;
    }

    const blob = await res.blob();
    console.log('[music] received', (blob.size / 1024).toFixed(0), 'KB — playing');
    const url = URL.createObjectURL(blob);

    audio = new Audio(url);
    audio.loop = true;
    audio.volume = VOLUME;
    const playPromise = audio.play();
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
}
