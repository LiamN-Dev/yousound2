import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { handleImageFallback } from '../utils/artworkHelper';
import { Play, Pause, Heart, Plus, Music2, Pin, Sparkles, Flame, Clock, Lock, Tag } from 'lucide-react';
import { MediaCover } from './MediaCover';

interface SongCardProps {
  song: Song;
  onOpenPlaylistModal: (song: Song) => void;
  onCustomPlay?: (song: Song) => void;
}

export const SongCard: React.FC<SongCardProps> = ({ song, onOpenPlaylistModal, onCustomPlay }) => {
  const { currentSong, isPlaying, playSong, togglePlay, userFavorites, toggleFavorite, allSongs } = useAudio();
  const { currentUser } = useAuth();
  const [showDropNotice, setShowDropNotice] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  // Real-time 1-second interval ticker for live countdown with seconds
  useEffect(() => {
    if (!song.isLimitedEdition && !song.isDroppingSoon) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [song.isLimitedEdition, song.isDroppingSoon]);

  const isCurrent = currentSong?.id === song.id;
  const isCurrentPlaying = isCurrent && isPlaying;
  const isFav = userFavorites.includes(song.id);

  const handleCardClick = () => {
    if (song.isDroppingSoon) {
      setShowDropNotice(true);
      setTimeout(() => setShowDropNotice(false), 3000);
      return;
    }

    if (isCurrent) {
      togglePlay();
    } else {
      if (onCustomPlay) {
        onCustomPlay(song);
      } else {
        const songIndex = allSongs.findIndex((s) => s.id === song.id);
        const queueAfter = songIndex >= 0 ? allSongs.slice(songIndex + 1) : [];
        playSong(song, queueAfter);
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper to calculate remaining time with days, hours, minutes AND seconds
  const getRemainingTimeString = (dateStr?: string) => {
    if (!dateStr) return null;
    const target = new Date(dateStr).getTime();
    const diff = target - nowMs;
    if (diff <= 0) return '00s (Ending now)';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    const pad = (n: number) => n.toString().padStart(2, '0');

    if (days > 0) return `${days}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s left`;
    if (hours > 0) return `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s left`;
    return `${pad(mins)}m ${pad(secs)}s left`;
  };

  // Helper for drop countdown with days, hours, minutes AND seconds
  const getDropCountdownString = (dateStr?: string) => {
    if (!dateStr) return null;
    const target = new Date(dateStr).getTime();
    const diff = target - nowMs;
    if (diff <= 0) return '00s (Dropping now)';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    const pad = (n: number) => n.toString().padStart(2, '0');

    if (days > 0) return `${days}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
    if (hours > 0) return `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
    return `${pad(mins)}m ${pad(secs)}s`;
  };

  const remainingLeaveTime = song.isLimitedEdition && song.limitedUntil ? getRemainingTimeString(song.limitedUntil) : null;
  const remainingDropTime = song.isDroppingSoon && song.dropDate ? getDropCountdownString(song.dropDate) : null;

  // Keep the artwork overlay readable: at most two status badges plus a compact overflow count.
  const coverBadgeCandidates: Array<{ key: string; label: string; tone: string; icon: React.ReactNode }> = [];
  if (song.isPinned) coverBadgeCandidates.push({ key: 'pinned', label: 'PINNED', tone: 'bg-blue-600 text-white border-blue-300/50', icon: <Pin className="h-3 w-3 fill-white" /> });
  if (song.badgeType === 'hot') coverBadgeCandidates.push({ key: 'hot', label: 'HOT TRACK', tone: 'bg-gradient-to-r from-orange-500 to-rose-600 text-white border-orange-200/50', icon: <Flame className="h-3 w-3 fill-white" /> });
  if (song.badgeType === 'new') coverBadgeCandidates.push({ key: 'new', label: 'NEW RELEASE', tone: 'bg-emerald-600 text-white border-emerald-300/50', icon: <Sparkles className="h-3 w-3" /> });
  if (song.badgeType === 'top') coverBadgeCandidates.push({ key: 'top', label: 'TOP HIT', tone: 'bg-amber-300 text-slate-950 border-amber-100', icon: <Flame className="h-3 w-3 fill-current" /> });
  if (song.badgeType === 'admin-pick') coverBadgeCandidates.push({ key: 'admin-pick', label: 'ADMIN PICK', tone: 'bg-violet-600 text-white border-violet-300/50', icon: <Sparkles className="h-3 w-3" /> });
  if (song.badgeType === 'custom' && song.badgeCustomText) coverBadgeCandidates.push({ key: 'custom', label: song.badgeCustomText.trim().slice(0, 22), tone: 'bg-indigo-600 text-white border-indigo-300/50', icon: <Sparkles className="h-3 w-3" /> });
  if (song.isLimitedEdition) coverBadgeCandidates.push({ key: 'limited', label: 'LEAVING SOON', tone: 'bg-rose-600 text-white border-rose-300/50', icon: <Clock className="h-3 w-3" /> });
  if (song.isDroppingSoon) coverBadgeCandidates.push({ key: 'upcoming', label: 'UPCOMING', tone: 'bg-amber-300 text-slate-950 border-amber-100', icon: <Lock className="h-3 w-3" /> });
  const visibleCoverBadges = coverBadgeCandidates.slice(0, 2);
  const hiddenCoverBadges = coverBadgeCandidates.slice(2);

  return (
    <div
      onClick={handleCardClick}
      className={`ys-song-card group relative liquid-glass-card rounded-2xl p-3.5 border transition-all duration-200 cursor-pointer overflow-hidden ${song.isChristmasEdition ? 'ys-christmas-song ' : ''}${
        isCurrent
          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/25 shadow-md ring-1 ring-blue-500/20'
          : song.isDroppingSoon
          ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
          : 'border-slate-200 dark:border-white/[0.08] hover:border-blue-400 dark:hover:border-slate-700'
      }`}
    >
      {/* Toast notice when user clicks dropping soon song */}
      {showDropNotice && (
        <div className="absolute inset-0 z-30 p-4 bg-slate-950/95 text-white flex flex-col items-center justify-center text-center animate-in fade-in rounded-2xl">
          <Clock className="w-7 h-7 text-amber-400 mb-1.5 animate-pulse" />
          <h4 className="text-xs font-bold font-display uppercase tracking-wider text-amber-300">New Song Dropping Soon!</h4>
          <p className="text-[11px] text-slate-200 font-mono mt-1">
            {song.dropMessage?.trim() || (remainingDropTime ? `Releases in: ${remainingDropTime}` : 'Will be playable once released!')}
          </p>
        </div>
      )}

      {/* Album Artwork Container */}
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] mb-2.5 shadow-xs">
        <MediaCover
          src={song.coverUrl}
          alt={song.title}
          fallbackTitle={song.title}
          fallbackGenre={song.genre}
          className={`w-full h-full object-cover transition-transform duration-300 ${
            song.isDroppingSoon ? 'filter brightness-90' : 'group-hover:scale-102'
          }`}
        />

        {/* Compact status badges: no more than two labels can cover the artwork. */}
        {visibleCoverBadges.length > 0 && (
          <div className="absolute top-2 left-2 right-2 z-10 flex flex-wrap items-start gap-1 pointer-events-none">
            {visibleCoverBadges.map((badge) => (
              <span
                key={badge.key}
                className={`inline-flex max-w-[72%] items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wide shadow-lg ${badge.tone}`}
              >
                {badge.icon}
                <span className="truncate">{badge.label}</span>
              </span>
            ))}
            {hiddenCoverBadges.length > 0 && (
              <span
                title={hiddenCoverBadges.map((badge) => badge.label).join(', ')}
                className="inline-flex items-center rounded-md border border-white/30 bg-slate-950/85 px-2 py-1 text-[9px] font-black text-white shadow-lg"
              >
                +{hiddenCoverBadges.length}
              </span>
            )}
          </div>
        )}

        {/* Play / Playing Overlay OR Dropping Soon Overlay */}
        {song.isDroppingSoon ? (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 text-center">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-300 mb-1.5 shadow-sm">
              <Lock className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-extrabold text-amber-300 uppercase tracking-wider font-display">
              Upcoming Drop
            </span>
            {song.dropMessage?.trim() ? (
              <p className="mt-1 max-w-full rounded-lg border border-amber-300/25 bg-black/25 px-3 py-2 text-[10px] font-semibold leading-relaxed text-amber-50 break-words">
                {song.dropMessage}
              </p>
            ) : (
              <span className="text-[10px] font-mono text-amber-100 font-bold mt-0.5">
                {remainingDropTime || 'Unlocks Soon'}
              </span>
            )}
          </div>
        ) : (
          <div
            className={`absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center transition-all duration-150 ${
              isCurrentPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCardClick();
              }}
              className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg transform hover:scale-105 active:scale-95 transition-all"
              aria-label={isCurrentPlaying ? 'Pause' : 'Play'}
            >
              {isCurrentPlaying ? (
                <Pause className="w-5 h-5 fill-white" />
              ) : (
                <Play className="w-5 h-5 fill-white ml-0.5" />
              )}
            </button>
          </div>
        )}

        {/* Playing Animated Equalizer Badge */}
        {isCurrentPlaying && (
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-slate-950/80 backdrop-blur-md border border-blue-500/40 flex items-center gap-1 z-20">
            <span className="w-1 h-3 bg-blue-400 rounded-full animate-pulse" />
            <span className="w-1 h-4 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>

      {/* High-Visibility Dedicated Status Banners for Leaving / Dropping */}
      {remainingLeaveTime && (
        <div className="mb-2 px-2.5 py-1 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center justify-between gap-1 shadow-xs">
          <span className="flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3 text-rose-500 animate-pulse" />
            <span>Leaves Library:</span>
          </span>
          <span className="font-mono tabular-nums text-right font-black text-rose-700 dark:text-rose-300 truncate">
            {remainingLeaveTime}
          </span>
        </div>
      )}

      {remainingDropTime && !remainingLeaveTime && !song.dropMessage?.trim() && (
        <div className="mb-2 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center justify-between gap-1 shadow-xs">
          <span className="flex items-center gap-1 shrink-0">
            <Lock className="w-3 h-3 text-amber-500" />
            <span>Releases In:</span>
          </span>
          <span className="font-mono tabular-nums text-right font-black text-amber-800 dark:text-amber-200 truncate">
            {remainingDropTime}
          </span>
        </div>
      )}

      {/* Title & Artist info */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm font-bold truncate ${isCurrent ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
            {song.title}
          </h3>
          <p className="text-xs text-slate-700 dark:text-slate-200 font-semibold truncate mt-0.5">{song.artist}</p>
        </div>

        {/* Duration */}
        <span className="text-xs font-mono font-bold tabular-nums text-slate-700 dark:text-slate-300 shrink-0 mt-0.5">
          {formatDuration(song.duration)}
        </span>
      </div>

      {/* Prominent Admin Custom Note / Subtitle Ribbon */}
      {(song.badgeMessage || (song.badgeType === 'custom' && song.badgeCustomText)) && (
        <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600/15 via-indigo-600/20 to-purple-600/15 border-2 border-indigo-500/40 text-indigo-950 dark:text-indigo-100 text-xs font-extrabold flex items-center gap-2 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
          <span className="truncate tracking-wide">{song.badgeMessage || song.badgeCustomText}</span>
        </div>
      )}

      {song.isChristmasEdition && (
        <div className="ys-christmas-edition-pill">🎄 It&apos;s Time — Christmas Edition</div>
      )}

      {/* Tags expand inline so the song card does not clip the open list. */}
      <div className="ys-song-meta">
        <span className="ys-genre-pill">{song.genre}</span>
        {song.tags && song.tags.length > 0 && (
          <div className="ys-tags-details">
            <button type="button" className="ys-tags-summary ys-tags-toggle" aria-expanded={showTags}
              onClick={(event) => { event.stopPropagation(); setShowTags((value) => !value); }}>
              <Tag className="h-3.5 w-3.5" />
              Tags <span className="ys-tag-count">{song.tags.length}</span>
              <span aria-hidden="true">{showTags ? '▴' : '▾'}</span>
            </button>
            {showTags && <div className="ys-tag-list ys-tag-list-expanded">
              {song.tags.map((tag) => (
                <span key={tag} className="ys-tag-chip">
                  <Tag className="h-3 w-3 shrink-0" />
                  <span>#{tag.replace(/^#/, '')}</span>
                </span>
              ))}
            </div>}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end mt-2.5 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
        <div className="flex items-center gap-1">
          {/* Add to Playlist button */}
          {currentUser && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenPlaylistModal(song);
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Add to Playlist"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Favorite button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(song.id);
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={`w-3.5 h-3.5 ${isFav ? 'text-rose-500 fill-rose-500' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
