import React, { useState } from 'react';
import { Song, SpotlightConfig } from '../types';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { handleImageFallback } from '../utils/artworkHelper';
import {
  Sparkles,
  Play,
  Pause,
  Heart,
  Plus,
  Flame,
  Clock,
  Music2,
  Disc3,
  Sliders,
  Eye,
  Settings,
  Star,
  Tag,
  Radio,
  Volume2,
} from 'lucide-react';
import { MediaCover } from './MediaCover';

interface SpotlightShowcaseProps {
  spotlightSongs: Song[];
  spotlightConfig: SpotlightConfig;
  onOpenPlaylistModal: (song: Song) => void;
  onExitPreview?: () => void;
  onOpenAdminSpotlightSettings?: () => void;
}

export const SpotlightShowcase: React.FC<SpotlightShowcaseProps> = ({
  spotlightSongs,
  spotlightConfig,
  onOpenPlaylistModal,
  onOpenAdminSpotlightSettings,
}) => {
  const { currentSong, isPlaying, playSong, togglePlay, userFavorites, toggleFavorite, updateSong } = useAudio();
  const { currentUser, isAdmin } = useAuth();
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);

  const activeSpotlightSong = spotlightSongs[selectedTrackIndex] || spotlightSongs[0];
  const isSelectedCurrent = activeSpotlightSong && currentSong?.id === activeSpotlightSong.id;
  const isSelectedPlaying = isSelectedCurrent && isPlaying;
  const isSelectedFav = activeSpotlightSong && userFavorites.includes(activeSpotlightSong.id);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlaySong = (song: Song) => {
    if (currentSong?.id === song.id) {
      togglePlay();
    } else {
      const idx = spotlightSongs.findIndex((s) => s.id === song.id);
      const queueAfter = idx >= 0 ? spotlightSongs.slice(idx + 1) : [];
      playSong(song, queueAfter);
    }
  };

  // Theme styles
  const themeClasses = {
    gold: {
      glow: 'from-amber-500/20 via-yellow-500/10 to-transparent',
      border: 'border-amber-400/40 shadow-amber-500/15',
      badge: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 border-amber-300',
      accent: 'text-amber-400',
      btn: 'bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950',
      ring: 'ring-amber-400/30',
    },
    'neon-cyan': {
      glow: 'from-cyan-500/20 via-blue-500/10 to-transparent',
      border: 'border-cyan-400/40 shadow-cyan-500/15',
      badge: 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 border-cyan-300',
      accent: 'text-cyan-400',
      btn: 'bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950',
      ring: 'ring-cyan-400/30',
    },
    ruby: {
      glow: 'from-rose-500/20 via-orange-500/10 to-transparent',
      border: 'border-rose-400/40 shadow-rose-500/15',
      badge: 'bg-gradient-to-r from-rose-500 to-red-600 text-white border-rose-300',
      accent: 'text-rose-400',
      btn: 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white',
      ring: 'ring-rose-400/30',
    },
    'cosmic-purple': {
      glow: 'from-violet-500/20 via-fuchsia-500/10 to-transparent',
      border: 'border-violet-400/40 shadow-violet-500/15',
      badge: 'bg-gradient-to-r from-violet-500 to-purple-600 text-white border-violet-300',
      accent: 'text-violet-400',
      btn: 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white',
      ring: 'ring-violet-400/30',
    },
  }[spotlightConfig.theme || 'gold'];

  if (spotlightSongs.length === 0) {
    return (
      <div className="py-20 text-center liquid-glass-surface rounded-3xl border border-amber-400/30 p-8 space-y-4 max-w-2xl mx-auto shadow-2xl">
        <Star className="w-16 h-16 text-amber-400 mx-auto animate-pulse" />
        <h2 className="text-2xl font-black text-white font-display">Spotlight Mode is Active</h2>
        <p className="text-xs text-slate-300 max-w-md mx-auto">
          Spotlight mode is turned on, but no songs are currently marked as spotlight tracks. Admins can select songs to spotlight in the Song Studio.
        </p>
        {isAdmin && onOpenAdminSpotlightSettings && (
          <button
            onClick={onOpenAdminSpotlightSettings}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-lg transition-all"
          >
            <Settings className="w-4 h-4" />
            <span>Open Admin Song Studio</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top Admin Notice if logged in as Admin */}
      {isAdmin && (
        <div className="p-3.5 px-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
            <span>
              <strong>Admin Spotlight Stage Active:</strong> All normal bars and library channels are hidden for listeners. Only the <strong>{spotlightSongs.length} spotlighted tracks</strong> below are visible.
            </span>
          </div>
          {onOpenAdminSpotlightSettings && (
            <button
              onClick={onOpenAdminSpotlightSettings}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-100 font-semibold text-[11px] border border-amber-400/40 whitespace-nowrap transition-colors self-start sm:self-auto"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Configure Spotlight</span>
            </button>
          )}
        </div>
      )}

      {/* Hero Spotlight Stage Banner */}
      <div className={`relative overflow-hidden rounded-3xl p-6 sm:p-10 border ${themeClasses.border} shadow-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/95`}>
        {/* Atmospheric Backlight Rays */}
        <div className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b ${themeClasses.glow} rounded-full blur-[100px] pointer-events-none`} />

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5 ${themeClasses.badge}`}>
                <Star className="w-3.5 h-3.5 fill-current" />
                {spotlightConfig.bannerBadgeText || 'EXCLUSIVE SPOTLIGHT SHOWCASE'}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Premier Soundstage</span>
              </span>
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span>Featuring</span>
              <span className="font-bold text-white px-2 py-0.5 rounded-lg bg-white/10">{spotlightSongs.length} Selected Masterpieces</span>
            </div>
          </div>

          {/* Active Featured Song Grand Stage */}
          {activeSpotlightSong && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Vinyl / Cover Art Master Presentation */}
              <div className="lg:col-span-5 flex justify-center">
                <div className="relative group w-64 h-64 sm:w-80 sm:h-80">
                  {/* Vinyl Record Peeking Behind Cover */}
                  <div className={`absolute top-0 right-0 w-56 h-56 sm:w-72 sm:h-72 rounded-full bg-slate-950 border-4 border-slate-800 shadow-2xl flex items-center justify-center transition-transform duration-700 ${
                    isSelectedPlaying ? 'translate-x-12 sm:translate-x-16 rotate-180 animate-spin' : 'translate-x-4 group-hover:translate-x-10'
                  }`} style={{ animationDuration: '8s' }}>
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-slate-700/60 bg-gradient-to-tr from-slate-900 to-slate-800 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-slate-950 border border-slate-600" />
                    </div>
                  </div>

                  {/* Album Cover Card with Liquid Glow */}
                  <div className={`relative z-10 w-full h-full rounded-3xl overflow-hidden border-2 ${themeClasses.border} shadow-2xl bg-slate-900 group-hover:scale-102 transition-transform duration-300`}>
                    <MediaCover
                      src={activeSpotlightSong.coverUrl}
                      alt={activeSpotlightSong.title}
                      fallbackTitle={activeSpotlightSong.title}
                      fallbackGenre={activeSpotlightSong.genre}
                      className="w-full h-full object-cover"
                    />

                    {/* Gradient Dark Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/30" />

                    {/* Prominent Play Overlay Button */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button
                        onClick={() => handlePlaySong(activeSpotlightSong)}
                        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform group-hover:scale-105 active:scale-95 ${themeClasses.btn}`}
                        aria-label={isSelectedPlaying ? 'Pause' : 'Play'}
                      >
                        {isSelectedPlaying ? (
                          <Pause className="w-8 h-8 fill-current" />
                        ) : (
                          <Play className="w-8 h-8 fill-current ml-1" />
                        )}
                      </button>
                    </div>

                    {/* Playing Equalizer Badge */}
                    {isSelectedPlaying && (
                      <div className="absolute bottom-3 left-3 px-3 py-1 rounded-xl bg-slate-950/90 backdrop-blur-md border border-white/20 flex items-center gap-1.5 z-20">
                        <span className="w-1.5 h-4 bg-emerald-400 rounded-full animate-pulse" />
                        <span className="w-1.5 h-6 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-3 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                        <span className="text-[11px] font-bold text-white ml-1">NOW PLAYING</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Spotlight Details & Action Showcase */}
              <div className="lg:col-span-7 space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-xl bg-white/[0.08] text-white text-xs font-black uppercase tracking-wider border border-white/10">
                      {activeSpotlightSong.genre}
                    </span>
                    {activeSpotlightSong.typeMood && (
                      <span className="px-3 py-1 rounded-xl bg-indigo-500/20 text-indigo-200 text-xs font-bold border border-indigo-500/30">
                        {activeSpotlightSong.typeMood}
                      </span>
                    )}
                    {activeSpotlightSong.isLimitedEdition && (
                      <span className="px-3 py-1 rounded-xl bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center gap-1 border border-rose-500/30">
                        <Clock className="w-3.5 h-3.5" />
                        Leaving Soon
                      </span>
                    )}
                    <span className="text-xs text-slate-400 font-mono">
                      {formatDuration(activeSpotlightSong.duration)}
                    </span>
                  </div>

                  <h1 className="text-2xl sm:text-4xl font-black text-white font-display tracking-tight">
                    {activeSpotlightSong.title}
                  </h1>

                  <p className="text-base sm:text-lg text-slate-300 font-medium">
                    {activeSpotlightSong.artist}
                    {activeSpotlightSong.album && (
                      <span className="text-slate-400 text-sm ml-2">· {activeSpotlightSong.album}</span>
                    )}
                  </p>
                </div>

                {/* Admin Spotlight Custom Note / Highlight Ribbon */}
                {activeSpotlightSong.spotlightNote && (
                  <div className={`p-4 rounded-2xl bg-white/[0.04] border ${themeClasses.border} text-xs font-medium text-slate-200 flex items-start gap-3`}>
                    <Sparkles className={`w-5 h-5 ${themeClasses.accent} shrink-0 mt-0.5`} />
                    <div>
                      <span className="font-bold text-white block mb-0.5">Curator Spotlight Note</span>
                      <span>{activeSpotlightSong.spotlightNote}</span>
                    </div>
                  </div>
                )}

                {/* Tags Row */}
                {activeSpotlightSong.tags && activeSpotlightSong.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {activeSpotlightSong.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/10 text-xs font-bold transition-colors"
                      >
                        <Tag className="w-3 h-3 text-cyan-400" />
                        <span>#{tag.replace(/^#/, '')}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <button
                    onClick={() => handlePlaySong(activeSpotlightSong)}
                    className={`flex items-center gap-2.5 px-7 py-3.5 rounded-2xl font-bold text-sm shadow-xl transition-all active:scale-95 ${themeClasses.btn}`}
                  >
                    {isSelectedPlaying ? (
                      <>
                        <Pause className="w-5 h-5 fill-current" />
                        <span>Pause Spotlight Track</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                        <span>Play Spotlight Track</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => onOpenPlaylistModal(activeSpotlightSong)}
                    className="flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/15 text-xs font-bold transition-all"
                  >
                    <Plus className="w-4 h-4 text-cyan-400" />
                    <span>Add to Playlist</span>
                  </button>

                  <button
                    onClick={() => toggleFavorite(activeSpotlightSong.id)}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      isSelectedFav
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                        : 'bg-white/[0.08] text-slate-300 hover:text-white border-white/15'
                    }`}
                    title={isSelectedFav ? 'Favorited' : 'Add to Favorites'}
                  >
                    <Heart className={`w-5 h-5 ${isSelectedFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => updateSong(activeSpotlightSong.id, { isSpotlight: false })}
                      className="px-3.5 py-3.5 rounded-2xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-white/10 text-xs font-semibold transition-colors"
                      title="Remove from spotlight"
                    >
                      Remove from Spotlight
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Spotlight Showcase Gallery: Carousel of All Spotlighted Tracks */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white font-display flex items-center gap-2">
              <Disc3 className="w-5 h-5 text-amber-400 animate-spin" style={{ animationDuration: '10s' }} />
              All Spotlight Selections ({spotlightSongs.length})
            </h3>
            <p className="text-xs text-slate-400">Click any track to switch the spotlight presentation and listen.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {spotlightSongs.map((song, idx) => {
            const isPlayingThis = currentSong?.id === song.id && isPlaying;
            const isSelected = idx === selectedTrackIndex;
            const isFav = userFavorites.includes(song.id);

            return (
              <div
                key={song.id}
                onClick={() => setSelectedTrackIndex(idx)}
                className={`relative group rounded-2xl p-4 border transition-all duration-300 cursor-pointer overflow-hidden ${
                  isSelected
                    ? `bg-slate-900/90 ${themeClasses.border} ring-2 ${themeClasses.ring} shadow-xl scale-[1.02]`
                    : 'bg-slate-900/50 hover:bg-slate-900/80 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-white/10 shadow-md">
                    <MediaCover
                      src={song.coverUrl}
                      alt={song.title}
                      fallbackTitle={song.title}
                      fallbackGenre={song.genre}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlaySong(song);
                      }}
                      className="absolute inset-0 bg-slate-950/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {isPlayingThis ? (
                        <Pause className="w-6 h-6 text-white fill-white" />
                      ) : (
                        <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                      )}
                    </button>
                    {isPlayingThis && (
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 text-[9px] font-bold">
                        ON
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                      Spotlight #{idx + 1}
                    </span>
                    <h4 className="text-sm font-bold text-white truncate">{song.title}</h4>
                    <p className="text-xs text-slate-400 truncate">{song.artist}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">{song.genre}</span>
                      <span>·</span>
                      <span className="font-mono">{formatDuration(song.duration)}</span>
                    </div>
                  </div>
                </div>

                {song.spotlightNote && (
                  <p className="text-[11px] text-slate-300 mt-3 p-2 rounded-xl bg-white/[0.04] border border-white/5 truncate">
                    ✨ {song.spotlightNote}
                  </p>
                )}

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10 text-xs">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlaySong(song);
                    }}
                    className={`flex items-center gap-1.5 font-bold ${isPlayingThis ? 'text-emerald-400' : themeClasses.accent}`}
                  >
                    {isPlayingThis ? <Volume2 className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>{isPlayingThis ? 'Playing Now' : 'Play Track'}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPlaylistModal(song);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-white"
                      title="Add to Playlist"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(song.id);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-400"
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
