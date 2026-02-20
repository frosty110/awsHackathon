import { useState, useRef } from 'react';

interface AudioPlayerProps {
  onAdventureStart: () => void;
}

export function AudioPlayer({ onAdventureStart }: AudioPlayerProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function handleStartAdventure() {
    if (status !== 'idle') return;

    setStatus('loading');

    try {
      const response = await fetch('/api/narrate', { method: 'POST' });

      if (!response.ok) {
        throw new Error(`[AudioPlayer] narrate returned ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);

      audioRef.current = audio;
      setStatus('playing');

      // Call onAdventureStart IMMEDIATELY — chat UI shows concurrently with audio
      onAdventureStart();

      audio.play().catch((err) => {
        console.error('[AudioPlayer] play() failed:', err);
      });

      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(objectUrl);
        audioRef.current = null;
      });
    } catch (error) {
      console.error('[AudioPlayer] narrate fetch failed:', error);
      setStatus('idle');
      // Graceful degradation: start adventure even when TTS fails
      onAdventureStart();
    }
  }

  return (
    <button
      onClick={handleStartAdventure}
      disabled={status === 'loading'}
      className="font-cinzel text-xl text-parchment px-8 py-4 border border-blood bg-blood/20 hover:bg-blood/40 tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {status === 'loading' ? 'The Dungeon Master is speaking...' : 'Start Adventure'}
    </button>
  );
}
