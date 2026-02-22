// Single source of truth for the currently playing audio element.
// Only one DM voice can play at a time — any new audio replaces the previous.

import { duckForTTS, restoreFromTTS } from './backgroundMusic';

let current: HTMLAudioElement | null = null;
let currentMessageId: string | null = null;
let currentUrl: string | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function getPlayingMessageId(): string | null {
  return currentMessageId;
}

export function playAudio(audio: HTMLAudioElement, messageId?: string) {
  if (current) {
    current.pause();
    current = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  current = audio;
  currentMessageId = messageId ?? null;
  duckForTTS();
  notify();
  audio.play().catch(() => {});
  audio.addEventListener('ended', () => {
    if (current === audio) {
      current = null;
      currentMessageId = null;
      notify();
    }
    restoreFromTTS();
  });
  audio.addEventListener('error', () => {
    if (current === audio) {
      current = null;
      currentMessageId = null;
      notify();
    }
    restoreFromTTS();
  });
}

export function stopAudio() {
  if (current) {
    current.pause();
    current = null;
    currentMessageId = null;
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
    restoreFromTTS();
    notify();
  }
}

/** Play audio from a fetch Response (audio/mpeg). Consolidates Blob logic. */
export async function playFromResponse(response: Response, messageId?: string): Promise<void> {
  const arrayBuffer = await response.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  playAudio(audio, messageId);
  currentUrl = url;
}
