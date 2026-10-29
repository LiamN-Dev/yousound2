import React, { useEffect, useRef, useState } from 'react';
import { loadYouTubeApi } from '../services/playbackEngine';

interface Props {
  videoId: string;
  /** Called once the real length of the video is known */
  onDuration?: (seconds: number) => void;
}

const ERROR_TEXT: Record<number, string> = {
  2: 'This YouTube link is invalid.',
  5: 'YouTube could not play this video in the embedded player.',
  100: 'This video was removed or is private.',
  101: 'The owner of this video does not allow it to be played on other sites.',
  150: 'The owner of this video does not allow it to be played on other sites.',
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/**
 * Inline YouTube player for the admin "Test Stream" step.
 * It shows the real video (so you can see and hear exactly what listeners get),
 * reports blocked / removed videos, and measures the video length by itself.
 */
export const YouTubeTestPlayer: React.FC<Props> = ({ videoId, onDuration }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [length, setLength] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const reported = useRef(false);

  useEffect(() => {
    let player: any = null;
    let cancelled = false;
    reported.current = false;
    setError(null);
    setLength(null);
    setLoading(true);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mountRef.current) return;
        const target = document.createElement('div');
        mountRef.current.innerHTML = '';
        mountRef.current.appendChild(target);

        const report = () => {
          if (reported.current || !player?.getDuration) return;
          const d = player.getDuration();
          if (d > 0) {
            reported.current = true;
            setLength(d);
            onDuration?.(Math.round(d));
          }
        };

        player = new YT.Player(target, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin },
          events: {
            onReady: () => {
              setLoading(false);
              // A muted start is always allowed, and it makes YouTube reveal the length
              try {
                player.mute();
                player.playVideo();
              } catch (_) {}
            },
            onStateChange: (e: any) => {
              if (e.data === 1) {
                report();
                // We only wanted the length; pause and unmute so the admin can press play themselves
                if (!reported.current) return;
                try {
                  player.pauseVideo();
                  player.unMute();
                } catch (_) {}
              }
            },
            onError: (e: any) => {
              setLoading(false);
              setError(ERROR_TEXT[e.data] || 'The YouTube player could not load this video.');
            },
          },
        });
      })
      .catch(() => {
        setLoading(false);
        setError('The YouTube player could not be loaded. Check your connection.');
      });

    return () => {
      cancelled = true;
      try {
        player?.destroy?.();
      } catch (_) {}
    };
  }, [videoId]);

  return (
    <div className="space-y-2">
      <div
        className="relative w-full max-w-md rounded-xl overflow-hidden bg-black border border-white/10"
        style={{ aspectRatio: '16 / 9', minHeight: 200 }}
      >
        <div ref={mountRef} className="absolute inset-0 [&>iframe]:w-full [&>iframe]:h-full" />
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">Loading video...</div>
        )}
      </div>
      {error ? (
        <p className="text-xs text-rose-300 font-semibold">✗ {error} Do not publish this one.</p>
      ) : length ? (
        <p className="text-xs text-emerald-300 font-semibold">✓ Plays correctly. Length detected: {fmt(length)}</p>
      ) : (
        <p className="text-xs text-slate-400">Checking the video and measuring its length...</p>
      )}
    </div>
  );
};
