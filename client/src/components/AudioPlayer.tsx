import { useState, useRef } from 'react';

export interface NarrateResult {
  text: string;
  conversationId: string;
}

interface AudioPlayerProps {
  onAdventureStart: (narration?: NarrateResult) => void;
}

export function AudioPlayer({ onAdventureStart }: AudioPlayerProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function handleStartAdventure() {
    if (status !== 'idle') return;

    setStatus('loading');

    try {
      const response = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`[AudioPlayer] narrate returned ${response.status}`);
      }

      const data = await response.json() as {
        audio: string;
        text: string;
        conversationId: string;
      };

      // Decode base64 audio
      const binaryStr = atob(data.audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);

      audioRef.current = audio;
      setStatus('playing');

      // Pass Bedrock-generated text + conversationId to chat
      onAdventureStart({ text: data.text, conversationId: data.conversationId });

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
      // Graceful degradation: start adventure without narration
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
