// Scene video controller — fetches scene-specific background videos with polling and caching.

const DEFAULT_VIDEO_URL = "/hero-bg.webm";
const INITIAL_POLL_DELAY_MS = 15_000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 30_000;
const MAX_POLLS = 40;
const RETRY_INTERVAL_MS = 10000;
const MAX_RETRIES = 3;

// --- State ---
let currentScene: string | null = null;
let currentVideoUrl: string = DEFAULT_VIDEO_URL;

// Per-scene blob URL cache (permanent for session)
const sceneBlobUrls = new Map<string, string>();
const fetchingScenes = new Set<string>();

// Polling/retry state
const pollCounts = new Map<string, number>();
const retryCounts = new Map<string, number>();

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function getCurrentVideoUrl(): string {
  return currentVideoUrl;
}

export function getCurrentScene(): string | null {
  return currentScene;
}

function getPollDelay(pollCount: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, pollCount), BACKOFF_CAP_MS);
}

async function fetchSceneVideo(scene: string): Promise<string | null> {
  if (sceneBlobUrls.has(scene)) return sceneBlobUrls.get(scene)!;
  if (fetchingScenes.has(scene)) return null;

  fetchingScenes.add(scene);
  const polls = pollCounts.get(scene) ?? 0;
  const retries = retryCounts.get(scene) ?? 0;

  try {
    const res = await fetch(`/api/scene-video?scene=${scene}`);

    if (res.status === 202) {
      pollCounts.set(scene, polls + 1);
      if (polls + 1 > MAX_POLLS) {
        console.warn(`[scene-video] max polls for ${scene} — giving up`);
        fetchingScenes.delete(scene);
        return null;
      }

      const delay = polls === 0 ? INITIAL_POLL_DELAY_MS : getPollDelay(polls);

      return new Promise((resolve) => {
        setTimeout(async () => {
          fetchingScenes.delete(scene);
          resolve(await fetchSceneVideo(scene));
        }, delay);
      });
    }

    if (!res.ok) {
      retryCounts.set(scene, retries + 1);
      if (retries + 1 <= MAX_RETRIES) {
        console.warn(`[scene-video] ${scene} error: ${res.status}, retry ${retries + 1}/${MAX_RETRIES}`);
        return new Promise((resolve) => {
          setTimeout(async () => {
            fetchingScenes.delete(scene);
            resolve(await fetchSceneVideo(scene));
          }, RETRY_INTERVAL_MS);
        });
      }
      console.warn(`[scene-video] ${scene} max retries reached`);
      fetchingScenes.delete(scene);
      return null;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    sceneBlobUrls.set(scene, url);
    pollCounts.delete(scene);
    retryCounts.delete(scene);
    fetchingScenes.delete(scene);
    return url;
  } catch (err) {
    console.warn(`[scene-video] fetch ${scene} failed:`, err);
    fetchingScenes.delete(scene);
    return null;
  }
}

export async function changeScene(scene: string | undefined) {
  if (!scene) return;
  if (scene === currentScene) return;

  console.log(`[scene-video] changing scene: ${currentScene} -> ${scene}`);

  // If we already have the blob URL, swap immediately
  const cached = sceneBlobUrls.get(scene);
  if (cached) {
    currentScene = scene;
    currentVideoUrl = cached;
    notify();
    return;
  }

  // Fetch in background, keep current video until ready
  const url = await fetchSceneVideo(scene);
  if (url) {
    currentScene = scene;
    currentVideoUrl = url;
    notify();
  }
}

export function resetScenes() {
  currentScene = null;
  currentVideoUrl = DEFAULT_VIDEO_URL;
  fetchingScenes.clear();
  pollCounts.clear();
  retryCounts.clear();
  notify();
}
