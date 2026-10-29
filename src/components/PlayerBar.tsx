import React, { useState } from 'react';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { handleImageFallback } from '../utils/artworkHelper';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Repeat1,
  Shuffle,
  Heart,
  Maximize2,
  List,
  Music2,
  ChevronDown,
  ChevronUp,
  Gauge,
} from 'lucide-react';
import { MediaCover } from './MediaCover';

export const PlayerBar: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    repeatMode,
    isShuffled,
    queue,
    togglePlay,
    seek,
    setVolumeLevel,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    playNext,
    playPrevious,
    toggleFavorite,
    userFavorites,
    setIsExpandedVisualizer,
    removeFromQueue,
    clearQueue,
    playSong,
    playbackError,
    clearPlaybackError,
    playbackSpeed,
    setPlaybackSpeed,
  } = useAudio();
  const { currentUser } = useAuth();
  const [showQueue, setShowQueue] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  if (!currentSong) return null;

  const isFav = userFavorites.includes(currentSong.id);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* Playback Error Toast Notice */}
      {playbackError && (
        <div className="fixed bottom-24 left-3 right-3 sm:left-6 sm:right-6 z-50 flex justify-center pointer-events-none">
          <div className="pointer-events-auto max-w-lg w-full p-3 bg-rose-600/95 dark:bg-rose-700/95 text-white text-xs rounded-xl shadow-2xl flex items-center justify-between gap-3 border border-rose-400/40 backdrop-blur-md animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wider text-[10px] bg-rose-800/80 px-2 py-0.5 rounded">Audio Notice</span>
              <span>{playbackError}</span>
            </div>
            <button
              onClick={clearPlaybackError}
              className="px-2 py-1 hover:bg-white/20 rounded-md transition-colors text-white font-bold text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Minimized Floating Pill or Full Floating Studio Player Bar */}
      {isMinimized ? (
        <div className="fixed bottom-4 right-4 z-40 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3 p-2.5 pr-4 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl">
            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 shadow-xs">
              <MediaCover
                src={currentSong.coverUrl}
                alt={currentSong.title}
                fallbackTitle={currentSong.title}
                fallbackGenre={currentSong.genre}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 max-w-[130px] sm:max-w-[180px]">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {currentSong.title}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {currentSong.artist}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pl-1">
              <button
                onClick={togglePlay}
                className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
              </button>
              <button
                onClick={() => setIsMinimized(false)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                title="Expand Music Player Bar"
                aria-label="Expand player"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-3 left-3 right-3 sm:left-6 sm:right-6 z-40">
          <div className="max-w-6xl mx-auto bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3 sm:py-3.5 sm:px-5 shadow-xl dark:shadow-2xl backdrop-blur-xl transition-colors">
            {/* Top Scrubber Bar */}
          <div className="relative w-full flex items-center gap-2 mb-2 group">
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 w-8 text-right shrink-0">
              {formatTime(currentTime)}
            </span>

            <div className="relative flex-1 flex items-center h-4 cursor-pointer">
              {/* Progress Background */}
              <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative group-hover:h-2 transition-all">
                {/* Precision Progress Bar */}
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full relative"
                  style={{ width: `${progressPercent}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-liquid-shimmer" />
                </div>
              </div>

              {/* Range Input for Seek */}
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime || 0}
                onChange={(e) => seek(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Seek track position"
              />
            </div>

            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 w-8 shrink-0">
              {formatTime(duration)}
            </span>
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between gap-3">
            {/* Left: Track Information & Artwork */}
            <div className="flex items-center gap-3 min-w-0 max-w-[200px] sm:max-w-xs">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-xs">
                <MediaCover
                  src={currentSong.coverUrl}
                  alt={currentSong.title}
                  fallbackTitle={currentSong.title}
                  fallbackGenre={currentSong.genre}
                  className={`w-full h-full object-cover ${isPlaying ? 'scale-102' : ''} transition-transform duration-300`}
                />
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate font-display">
                  {currentSong.title}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{currentSong.artist}</p>
              </div>

              {currentUser && (
                <button
                  onClick={() => toggleFavorite(currentSong.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                  title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'text-rose-500 fill-rose-500' : ''}`} />
                </button>
              )}
            </div>

            {/* Center: Playback Buttons */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Shuffle */}
              <button
                onClick={toggleShuffle}
                className={`p-2 rounded-xl text-xs transition-colors hidden sm:block ${
                  isShuffled
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>

              {/* Prev */}
              <button
                onClick={playPrevious}
                className="p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95"
                title="Previous track"
              >
                <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              </button>

              {/* Play / Pause button */}
              <button
                onClick={togglePlay}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-white" />
                ) : (
                  <Play className="w-5 h-5 fill-white ml-0.5" />
                )}
              </button>

              {/* Next */}
              <button
                onClick={playNext}
                className="p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95"
                title="Next track"
              >
                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              </button>

              {/* Repeat */}
              <button
                onClick={toggleRepeat}
                className={`p-2 rounded-xl text-xs transition-colors hidden sm:block ${
                  repeatMode !== 'off'
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              </button>
            </div>

            {/* Right: Soundwaves, Volume & Expand */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Mini Soundwaves Equalizer */}
              <div className="hidden lg:flex items-center gap-1 h-5 px-2">
                {[0.4, 0.9, 0.6, 0.3, 0.8, 0.5, 1.0].map((h, i) => (
                  <span
                    key={i}
                    className={`w-0.5 rounded-full bg-blue-600 dark:bg-blue-500 transition-all ${
                      isPlaying ? 'animate-pulse' : 'h-1.5 opacity-30'
                    }`}
                    style={{
                      height: isPlaying ? `${Math.max(4, h * 18)}px` : '4px',
                      animationDelay: `${i * 120}ms`,
                      animationDuration: '600ms',
                    }}
                  />
                ))}
              </div>

              {/* Volume Slider */}
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-500" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolumeLevel(Number(e.target.value))}
                  className="w-16 sm:w-20 h-1 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  aria-label="Volume slider"
                />
              </div>

              {/* 1x to 3x Playback Speed Control Widget */}
              <div className="relative flex items-center">
                <button
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className={`px-2 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border ${
                    playbackSpeed !== 1.0
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Playback Speed (1x to 3x)"
                  aria-label="Playback speed"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>{playbackSpeed % 1 === 0 ? `${playbackSpeed}x` : `${playbackSpeed.toFixed(2)}x`}</span>
                </button>

                {showSpeedMenu && (
                  <div className="absolute bottom-12 right-0 z-50 w-56 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                      <span>Playback Speed</span>
                      <span className="text-blue-600 dark:text-blue-400 font-mono text-xs">{playbackSpeed.toFixed(2)}x</span>
                    </div>

                    {/* Slider from 1.0x to 3.0x */}
                    <div className="space-y-1">
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.05"
                        value={playbackSpeed}
                        onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        <span>1.0x</span>
                        <span>2.0x</span>
                        <span>3.0x</span>
                      </div>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="grid grid-cols-4 gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                      {[1.0, 1.25, 1.5, 2.0].map((spd) => (
                        <button
                          key={spd}
                          onClick={() => setPlaybackSpeed(spd)}
                          className={`py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                            Math.abs(playbackSpeed - spd) < 0.01
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Queue Button */}
              <button
                onClick={() => setShowQueue(!showQueue)}
                className={`p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative ${
                  showQueue ? 'bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-300' : ''
                }`}
                title="Play Queue"
              >
                <List className="w-4 h-4" />
                {queue.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                    {queue.length}
                  </span>
                )}
              </button>

              {/* Fullscreen Visualizer Modal Button */}
              <button
                onClick={() => setIsExpandedVisualizer(true)}
                className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Full Visualizer Mode"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              {/* Minimize Player Bar Button */}
              <button
                onClick={() => setIsMinimized(true)}
                className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Minimize music controls"
                aria-label="Minimize music player"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Floating Queue Drawer */}
      {showQueue && (
        <div className="fixed bottom-24 right-4 sm:right-8 z-40 w-80 max-w-[90vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xl dark:shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200 dark:border-slate-800">
            <h5 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
              Playing Queue ({queue.length})
            </h5>
            {queue.length > 0 && (
              <button
                onClick={clearQueue}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-rose-500 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {queue.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              Queue is empty. Click songs to add them to your queue!
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {queue.map((song, i) => (
                <div
                  key={`queue-${song.id}-${i}`}
                  className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group cursor-pointer"
                  onClick={() => playSong(song)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
                      <MediaCover
                        src={song.coverUrl}
                        alt={song.title}
                        fallbackTitle={song.title}
                        fallbackGenre={song.genre}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 dark:text-white truncate">{song.title}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{song.artist}</div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromQueue(song.id);
                    }}
                    className="text-slate-400 hover:text-rose-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove from queue"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};
