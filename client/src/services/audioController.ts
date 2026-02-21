// Single source of truth for the currently playing audio element.
// Only one DM voice can play at a time — any new audio replaces the previous.

let current: HTMLAudioElement | null = null;

export function playAudio(audio: HTMLAudioElement) {
  if (current) {
    current.pause();
    current = null;
  }
  current = audio;
  audio.play().catch(() => {});
  audio.addEventListener('ended', () => {
    if (current === audio) current = null;
  });
}

export function stopAudio() {
  if (current) {
    current.pause();
    current = null;
  }
}
