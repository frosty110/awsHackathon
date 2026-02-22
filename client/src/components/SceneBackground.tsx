import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { subscribe, getCurrentVideoUrl } from '../services/sceneVideo';

const CROSSFADE_MS = 600;

/**
 * Ping-pong loop: plays the video forward natively, then on `ended`
 * reverses via requestAnimationFrame seeking at 1× speed.
 * When currentTime reaches 0 it calls play() again — seamless infinite loop.
 */
function usePingPong(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  dep: unknown,
) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId = 0;
    let lastTs = 0;

    const stepBackward = (ts: number) => {
      const v = videoRef.current;
      if (!v) return;

      if (lastTs > 0) {
        const dt = (ts - lastTs) / 1000;
        const next = v.currentTime - dt;
        if (next <= 0) {
          v.currentTime = 0;
          void v.play();
          return;
        }
        v.currentTime = next;
      }

      lastTs = ts;
      rafId = requestAnimationFrame(stepBackward);
    };

    const onEnded = () => {
      lastTs = 0;
      rafId = requestAnimationFrame(stepBackward);
    };

    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('ended', onEnded);
      cancelAnimationFrame(rafId);
    };
  }, [videoRef, dep]);
}

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

  // Ping-pong loop for both active and incoming videos
  usePingPong(activeRef, activeUrl);
  usePingPong(incomingRef, incomingUrl);

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
