import React, { useRef, useMemo } from 'react';
import { Song } from '../types';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { handleImageFallback } from '../utils/artworkHelper';
import { MediaCover } from './MediaCover';
import { Sparkles, Play, Pause, Heart, ChevronLeft, ChevronRight } from 'lucide-react';

interface PersonalizedBarProps {
  onOpenPlaylistModal?: (song: Song) => void;
}

export const PersonalizedBar: React.FC<PersonalizedBarProps> = () => {
  const { allSongs, currentSong, isPlaying, playSong, togglePlay, userFavorites, toggleFavorite } = useAudio();
  const { currentUser } = useAuth();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Compute rotational recommendations based on listening history & habits
  const recommendedSongs = useMemo(() => {
    // Only recommend songs that are available to play (exclude dropping soon)
    const playableSongs = allSongs.filter((s) => !s.isDroppingSoon);
    if (playableSongs.length === 0) return [];

    const favSongs = playableSongs.filter((s) => userFavorites.includes(s.id));
    const favGenres = favSongs.map((s) => s.genre.toLowerCase());
    const favArtists = favSongs.map((s) => s.artist.toLowerCase());

    // Incorporate last listened song genre and artist
    let lastListenedGenre = '';
    let lastListenedArtist = '';
    if (currentUser?.lastSongListened) {
      const lastClean = currentUser.lastSongListened.toLowerCase();
      const lastSong = playableSongs.find(
        (s) => lastClean.includes(s.title.toLowerCase()) || s.id === currentUser.lastSongListened
      );
      if (lastSong) {
        lastListenedGenre = lastSong.genre.toLowerCase();
        lastListenedArtist = lastSong.artist.toLowerCase();
      }
    }

    // Rotational factor based on date/hour so recommendations rotate smoothly
    const now = new Date();
    const rotationHour = now.getHours();
    const daySeed = now.getDate() * 24 + rotationHour;

    const scored = playableSongs.map((song, index) => {
      let score = song.plays || 0;
      const songGenre = song.genre.toLowerCase();
      const songArtist = song.artist.toLowerCase();

      // Major boost if user favorited this exact track
      if (userFavorites.includes(song.id)) {
        score += 50;
      }

      // Strong boost if song matches genres user listens to or favorites
      const genreMatches = favGenres.filter((g) => g === songGenre).length;
      if (genreMatches > 0) {
        score += Math.min(60, genreMatches * 20);
      }

      // Boost for matching favorite artists
      if (favArtists.includes(songArtist)) {
        score += 35;
      }

      // Boost if matches user's most recent listening session
      if (lastListenedGenre && songGenre === lastListenedGenre) {
        score += 40;
      }
      if (lastListenedArtist && songArtist === lastListenedArtist) {
        score += 45;
      }

      // Gentle deterministic rotational shuffle based on hour/day
      const rotationOffset = ((index * 31 + daySeed) % 25);
      score += rotationOffset;

      return { song, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((item) => item.song).slice(0, 10);
  }, [allSongs, userFavorites, currentUser]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const offset = direction === 'left' ? -320 : 320;
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  if (recommendedSongs.length === 0) return null;

  const displayName = currentUser?.username ? `Welcome back, ${currentUser.username}!` : 'Welcome back!';

  return (
    <section className="relative w-full mb-8 pt-2">
      <div className="relative liquid-glass-surface rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-white/[0.08] shadow-sm">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 dark:bg-blue-600/20 border border-blue-500/20 dark:border-blue-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight font-display flex flex-wrap items-center gap-2">
                <span>For You</span>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 hidden sm:inline">
                  · Curated from your listening taste & favorites
                </span>
              </h2>
            </div>
          </div>

          {/* Carousel navigation buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => scroll('left')}
              className="p-1.5 rounded-lg bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all active:scale-95 shadow-xs"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="p-1.5 rounded-lg bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all active:scale-95 shadow-xs"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Horizontal scroll cards */}
        <div
          ref={scrollRef}
          className="flex items-center gap-3.5 overflow-x-auto pb-2 scroll-smooth no-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {recommendedSongs.map((song, index) => {
            const isCurrent = currentSong?.id === song.id;
            const isCurrentPlaying = isCurrent && isPlaying;
            const isFav = userFavorites.includes(song.id);

            const recommendationReason =
              index === 0
                ? '⭐ Top Pick'
                : song.genre === 'Lo-Fi'
                ? '🎧 Study Session'
                : song.genre === 'Synthwave'
                ? '⚡ Focus Flow'
                : song.genre === 'Ambient'
                ? '🌙 Deep Work'
                : '✨ Recommended';

            return (
              <div
                key={`rec-${song.id}`}
                className="group relative flex-none w-64 sm:w-72 liquid-glass-card rounded-xl p-3 border border-slate-200 dark:border-white/[0.08] hover:border-blue-500/40 transition-all cursor-pointer"
                onClick={() => {
                  if (isCurrent) {
                    togglePlay();
                  } else {
                    const idx = recommendedSongs.findIndex((s) => s.id === song.id);
                    const queueAfter = idx >= 0 ? recommendedSongs.slice(idx + 1) : [];
                    playSong(song, queueAfter);
                  }
                }}
              >
                <div className="flex gap-3 items-center">
                  {/* Artwork with play overlay */}
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08]">
                    <MediaCover
                      src={song.coverUrl}
                      alt={song.title}
                      fallbackTitle={song.title}
                      fallbackGenre={song.genre}
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                    />
                    <div
                      className={`absolute inset-0 bg-slate-950/40 flex items-center justify-center transition-opacity ${
                        isCurrentPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md transform group-hover:scale-105 transition-transform">
                        {isCurrentPlaying ? (
                          <Pause className="w-4 h-4 fill-white" />
                        ) : (
                          <Play className="w-4 h-4 fill-white ml-0.5" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Song Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mb-0.5 truncate">
                      {recommendationReason}
                    </div>
                    <h3 className={`text-sm font-bold truncate ${isCurrent ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                      {song.title}
                    </h3>
                    <p className="text-xs text-slate-700 dark:text-slate-200 font-semibold truncate mt-0.5">{song.artist}</p>

                    <div className="flex items-center gap-1.5 mt-2 text-[10px] font-bold">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                        {song.genre}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 font-mono">
                        {Math.floor(song.duration / 60)}:
                        {String(Math.floor(song.duration % 60)).padStart(2, '0')}
                      </span>
                    </div>
                  </div>

                  {/* Heart / Action */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(song.id);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart className={`w-4 h-4 ${isFav ? 'text-rose-500 fill-rose-500' : ''}`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
