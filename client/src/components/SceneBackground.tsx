import { useState, useRef, useCallback, useSyncExternalStore } from 'react';
import { subscribe, getCurrentVideoUrl } from '../services/sceneVideo';

const CROSSFADE_MS = 600;

export function SceneBackground() {
  const videoUrl = useSyncExternalStore(subscribe, getCurrentVideoUrl);
  const [activeUrl, setActiveUrl] = useState(videoUrl);
  const [incomingUrl, setIncomingUrl] = useState<string | null>(null);
  const [incomingReady, setIncomingReady] = useState(false);
  const activeRef = useRef<HTMLVideoElement>(null);
  const incomingRef = useRef<HTMLVideoElement>(null);
  const prevUrlRef = useRef(videoUrl);

  // Detect when videoUrl changes from the store
  if (videoUrl !== prevUrlRef.current) {
    prevUrlRef.current = videoUrl;
    if (videoUrl !== activeUrl) {
      setIncomingUrl(videoUrl);
      setIncomingReady(false);
    }
  }

  const handleIncomingCanPlay = useCallback(() => {
    setIncomingReady(true);
    // After crossfade duration, promote incoming to active
    setTimeout(() => {
      setActiveUrl(incomingUrl!);
      setIncomingUrl(null);
      setIncomingReady(false);
    }, CROSSFADE_MS);
  }, [incomingUrl]);

  return (
    <>
      {/* Active video — purely decorative background, hidden from assistive tech */}
      <video
        ref={activeRef}
        key={activeUrl}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover transition-opacity"
        style={{
          opacity: incomingReady ? 0 : 1,
          transitionDuration: `${CROSSFADE_MS}ms`,
        }}
      >
        <source src={activeUrl} type={activeUrl.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
      </video>

      {/* Incoming video (crossfade layer) — purely decorative */}
      {incomingUrl && (
        <video
          ref={incomingRef}
          key={incomingUrl}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          onCanPlay={handleIncomingCanPlay}
          className="absolute inset-0 w-full h-full object-cover transition-opacity"
          style={{
            opacity: incomingReady ? 1 : 0,
            transitionDuration: `${CROSSFADE_MS}ms`,
          }}
        >
          <source src={incomingUrl} type={incomingUrl.startsWith('blob:') ? 'video/mp4' : 'video/webm'} />
        </video>
      )}
    </>
  );
}
