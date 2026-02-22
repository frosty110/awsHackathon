// Background music player — mood-aware with crossfade and TTS ducking.

type SceneMood = "combat" | "tavern" | "mystery" | "dramatic" | "danger";

const DEFAULT_VOLUME = 0.12;
const DUCK_VOLUME = 0.03;
const CROSSFADE_MS = 800;
const DUCK_DOWN_MS = 200;
const DUCK_UP_MS = 500;
const POLL_INTERVAL_MS = 4000;
const RETRY_INTERVAL_MS = 10000;
const MAX_RETRIES = 5;
const MAX_POLLS = 30;

// --- State ---
let currentTrack: HTMLAudioElement | null = null;
let currentMood: SceneMood | null = null;
let userVolume = DEFAULT_VOLUME;
let isDucked = false;
let paused = false;

// Per-mood blob URL cache
const moodBlobUrls = new Map<SceneMood, string>();
const fetchingMoods = new Set<SceneMood>();

// Crossfade state
let crossfadeRaf: number | null = null;
let crossfadeOldTrack: HTMLAudioElement | null = null;

// Ducking animation
let duckRaf: number | null = null;

// Polling state per mood
const pollCounts = new Map<SceneMood, number>();
const retryCounts = new Map<SceneMood, number>();
let initialPollTimer: ReturnType<typeof setTimeout> | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

// --- Volume animation helper ---
function animateVolume(
  track: HTMLAudioElement,
  from: number,
  to: number,
  durationMs: number,
  onDone?: () => void,
): number {
  const start = performance.now();
  function step(now: number) {
    const elapsed = now - start;
    const t = Math.min(elapsed / durationMs, 1);
    // Ease-in-out for smooth transitions
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    track.volume = from + (to - from) * ease;
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      track.volume = to;
      onDone?.();
    }
  }
  return requestAnimationFrame(step);
}

// --- Fetch mood audio ---
async function fetchMoodAudio(mood: SceneMood): Promise<string | null> {
  if (moodBlobUrls.has(mood)) return moodBlobUrls.get(mood)!;
  if (fetchingMoods.has(mood)) return null; // already fetching

  fetchingMoods.add(mood);
  const polls = pollCounts.get(mood) ?? 0;
  const retries = retryCounts.get(mood) ?? 0;

  try {
    const res = await fetch(`/api/music?mood=${mood}`);

    if (res.status === 202) {
      pollCounts.set(mood, polls + 1);
      if (polls + 1 > MAX_POLLS) {
        console.warn(`[music] max polls for ${mood} — giving up`);
        fetchingMoods.delete(mood);
        return null;
      }
      // Poll again after delay
      return new Promise((resolve) => {
        setTimeout(async () => {
          fetchingMoods.delete(mood);
          resolve(await fetchMoodAudio(mood));
        }, POLL_INTERVAL_MS);
      });
    }

    if (!res.ok) {
      retryCounts.set(mood, retries + 1);
      if (retries + 1 <= MAX_RETRIES) {
        console.warn(`[music] ${mood} error: ${res.status}, retry ${retries + 1}/${MAX_RETRIES}`);
        return new Promise((resolve) => {
          setTimeout(async () => {
            fetchingMoods.delete(mood);
            resolve(await fetchMoodAudio(mood));
          }, RETRY_INTERVAL_MS);
        });
      }
      console.warn(`[music] ${mood} max retries reached`);
      fetchingMoods.delete(mood);
      return null;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    moodBlobUrls.set(mood, url);
    pollCounts.delete(mood);
    retryCounts.delete(mood);
    fetchingMoods.delete(mood);
    return url;
  } catch (err) {
    console.warn(`[music] fetch ${mood} failed:`, err);
    fetchingMoods.delete(mood);
    return null;
  }
}

// --- Crossfade ---
function crossfadeTo(blobUrl: string, mood: SceneMood) {
  // Cancel any in-progress crossfade
  if (crossfadeRaf !== null) {
    cancelAnimationFrame(crossfadeRaf);
    crossfadeRaf = null;
  }
  if (crossfadeOldTrack) {
    crossfadeOldTrack.pause();
    crossfadeOldTrack = null;
  }

  const oldTrack = currentTrack;
  const targetVolume = isDucked ? DUCK_VOLUME : userVolume;

  const newTrack = new Audio(blobUrl);
  newTrack.loop = true;
  newTrack.volume = 0;
  newTrack.preload = 'auto';

  currentTrack = newTrack;
  currentMood = mood;

  if (paused) {
    // Don't play if paused, just swap the reference
    if (oldTrack) {
      oldTrack.pause();
    }
    newTrack.volume = targetVolume;
    notify();
    return;
  }

  const playPromise = newTrack.play();
  playPromise?.catch((err) => console.warn('[music] play() failed:', err));

  if (oldTrack) {
    crossfadeOldTrack = oldTrack;
    // Ramp old down, new up over CROSSFADE_MS
    const startVol = oldTrack.volume;
    const start = performance.now();

    function step(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / CROSSFADE_MS, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      if (crossfadeOldTrack === oldTrack) {
        oldTrack.volume = startVol * (1 - ease);
      }
      newTrack.volume = targetVolume * ease;

      if (t < 1) {
        crossfadeRaf = requestAnimationFrame(step);
      } else {
        // Done
        if (crossfadeOldTrack === oldTrack) {
          oldTrack.pause();
          crossfadeOldTrack = null;
        }
        newTrack.volume = targetVolume;
        crossfadeRaf = null;
        notify();
      }
    }

    crossfadeRaf = requestAnimationFrame(step);
  } else {
    // No old track — just fade in
    animateVolume(newTrack, 0, targetVolume, CROSSFADE_MS, () => notify());
  }

  notify();
}

// --- Public API ---

export async function changeMood(mood: string | undefined) {
  if (!mood) return;
  const validMoods: SceneMood[] = ["combat", "tavern", "mystery", "dramatic", "danger"];
  if (!validMoods.includes(mood as SceneMood)) return;
  const sceneMood = mood as SceneMood;

  if (sceneMood === currentMood) return;

  console.log(`[music] changing mood: ${currentMood} -> ${sceneMood}`);

  // If we already have the blob URL, crossfade immediately
  const cached = moodBlobUrls.get(sceneMood);
  if (cached) {
    crossfadeTo(cached, sceneMood);
    return;
  }

  // Fetch in background, keep current track playing until ready
  const url = await fetchMoodAudio(sceneMood);
  if (url) {
    crossfadeTo(url, sceneMood);
  }
}

export function duckForTTS() {
  isDucked = true;
  if (duckRaf !== null) cancelAnimationFrame(duckRaf);
  if (currentTrack && !paused) {
    duckRaf = animateVolume(currentTrack, currentTrack.volume, DUCK_VOLUME, DUCK_DOWN_MS, () => {
      duckRaf = null;
    });
  }
}

export function restoreFromTTS() {
  isDucked = false;
  if (duckRaf !== null) cancelAnimationFrame(duckRaf);
  if (currentTrack && !paused) {
    duckRaf = animateVolume(currentTrack, currentTrack.volume, userVolume, DUCK_UP_MS, () => {
      duckRaf = null;
    });
  }
}

export function startBackgroundMusic(initialMood?: string) {
  if (currentTrack) return; // already started

  const mood: SceneMood = (initialMood as SceneMood) || "tavern";
  console.log(`[music] starting with mood: ${mood}`);

  // Kick off fetch for the initial mood
  void (async () => {
    const url = await fetchMoodAudio(mood);
    if (url && !currentTrack) {
      crossfadeTo(url, mood);
    }
  })();
}

export function stopBackgroundMusic() {
  if (initialPollTimer) {
    clearTimeout(initialPollTimer);
    initialPollTimer = null;
  }
  if (crossfadeRaf !== null) {
    cancelAnimationFrame(crossfadeRaf);
    crossfadeRaf = null;
  }
  if (crossfadeOldTrack) {
    crossfadeOldTrack.pause();
    crossfadeOldTrack = null;
  }
  if (duckRaf !== null) {
    cancelAnimationFrame(duckRaf);
    duckRaf = null;
  }
  if (currentTrack) {
    currentTrack.pause();
    currentTrack = null;
  }
  currentMood = null;
  paused = false;
  isDucked = false;
  fetchingMoods.clear();
  pollCounts.clear();
  retryCounts.clear();
  notify();
}

export function setVolume(v: number) {
  userVolume = Math.max(0, Math.min(1, v));
  // Only update the audio element if not ducked
  if (!isDucked && currentTrack) {
    currentTrack.volume = userVolume;
  }
  notify();
}

export function getVolume() {
  return userVolume;
}

export function togglePause() {
  if (!currentTrack) return;
  if (paused) {
    currentTrack.play().catch(() => {});
    paused = false;
  } else {
    currentTrack.pause();
    paused = true;
  }
  notify();
}

export function isPaused() {
  return paused;
}

export function isReady() {
  return currentTrack !== null;
}
