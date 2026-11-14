import React, { useEffect, useRef } from 'react';

export type TrackedYouTubeVideo = {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
};

type WatchEventName = 'open' | 'play' | 'progress' | 'pause' | 'ended';
type YouTubePlayer = { destroy: () => void };
type YouTubeApi = {
  Player: new (element: HTMLElement, options: { events: { onStateChange: (event: { data: number }) => void } }) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube player API did not initialize.'));
    };
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('YouTube player API timed out.'));
    }, 10000);

    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousCallback === 'function') previousCallback();
      finish();
    };

    let script = document.querySelector<HTMLScriptElement>('script[data-youtube-iframe-api="true"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeIframeApi = 'true';
      script.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(new Error('YouTube player API could not be loaded.'));
      };
      document.head.appendChild(script);
    }
  }).catch(error => {
    youtubeApiPromise = null;
    throw error;
  });

  return youtubeApiPromise;
}

export const YouTubeTrackedPlayer: React.FC<{
  video: TrackedYouTubeVideo;
  className?: string;
}> = ({ video, className = 'h-full w-full' }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const videoRef = useRef(video);
  const openedRef = useRef(false);
  const playingRef = useRef(false);
  const lastTickRef = useRef(0);
  const progressTimerRef = useRef<number | null>(null);

  videoRef.current = video;

  useEffect(() => {
    let cancelled = false;
    openedRef.current = false;
    playingRef.current = false;
    lastTickRef.current = 0;

    const send = (event: WatchEventName, watchedSeconds = 0, keepalive = false) => {
      const current = videoRef.current;
      void fetch('/api/youtube-mode/watch-event', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          watchedSeconds: Math.min(60, Math.max(0, Math.floor(watchedSeconds))),
          video: {
            videoId: current.videoId,
            title: current.title,
            channelId: current.channelId,
            channelTitle: current.channelTitle,
            description: current.description || '',
            categoryId: current.categoryId || '',
            tags: Array.isArray(current.tags) ? current.tags.slice(0, 20) : [],
          },
        }),
      }).catch(() => undefined);
    };

    const flush = (event: 'progress' | 'pause' | 'ended', keepalive = false) => {
      if (!playingRef.current) return;
      const now = Date.now();
      const seconds = lastTickRef.current ? Math.floor((now - lastTickRef.current) / 1000) : 0;
      lastTickRef.current = now;
      if (seconds > 0) send(event, seconds, keepalive);
      if (event !== 'progress') playingRef.current = false;
    };

    const onFrameLoaded = () => {
      if (openedRef.current) return;
      openedRef.current = true;
      send('open', 0);
    };
    iframeRef.current?.addEventListener('load', onFrameLoaded);

    loadYouTubeIframeApi().then(api => {
      if (cancelled || !iframeRef.current) return;
      playerRef.current = new api.Player(iframeRef.current, {
        events: {
          onStateChange: event => {
            if (event.data === api.PlayerState.PLAYING) {
              if (!playingRef.current) {
                playingRef.current = true;
                lastTickRef.current = Date.now();
                send('play', 0);
                if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current);
                progressTimerRef.current = window.setInterval(() => flush('progress'), 15000);
              }
              return;
            }

            if (event.data === api.PlayerState.PAUSED || event.data === api.PlayerState.ENDED || event.data === api.PlayerState.BUFFERING) {
              if (progressTimerRef.current !== null) {
                window.clearInterval(progressTimerRef.current);
                progressTimerRef.current = null;
              }
              if (event.data === api.PlayerState.ENDED) flush('ended', true);
              else flush('pause', true);
            }
          },
        },
      });
    }).catch(() => {
      // The iframe still plays normally if the monitoring API is blocked by a browser or network filter.
      // The 'open' event is still recorded by the iframe load handler.
    });

    return () => {
      cancelled = true;
      iframeRef.current?.removeEventListener('load', onFrameLoaded);
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      flush('pause', true);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [video.videoId]);

  const playerUrl = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(video.videoId) +
    '?autoplay=1&controls=1&rel=0&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(window.location.origin);

  return (
    <iframe
      ref={iframeRef}
      title={video.title}
      src={playerUrl}
      className={className}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
};
