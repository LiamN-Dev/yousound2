import React, { useState, useEffect } from 'react';
import { Song, SongBadgeType } from '../types';
import { useAudio } from '../context/AudioContext';
import { storage } from '../services/storage';
import {
  X,
  Image as ImageIcon,
  Check,
  Upload,
  Link,
  Sparkles,
  Music2,
  Save,
  Tag,
  Play,
  Pause,
  Pin,
  Clock,
  Flame,
  Eye,
  Film,
  RotateCcw,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { MediaCover } from './MediaCover';
import { formatCoverMediaUrl } from '../utils/mediaUrl';

interface EditSongModalProps {
  song: Song | null;
  isOpen: boolean;
  onClose: () => void;
  availableGenres?: string[];
}

const GALLERY_PRESETS = [
  {
    name: 'Lo-Fi Study Desk',
    url: '/src/assets/images/lofi_study_glass_1791054585559.jpg',
    tag: 'Lo-Fi',
  },
  {
    name: 'Synthwave Prism',
    url: '/src/assets/images/synthwave_prism_sound_1791054595636.jpg',
    tag: 'Synthwave',
  },
  {
    name: 'Chill Turquoise Wave',
    url: '/src/assets/images/chill_ambient_wave_1791054604455.jpg',
    tag: 'Ambient / Classical',
  },
  {
    name: 'Electric Sonic Burst',
    url: '/src/assets/images/electric_energy_liquid_1791054613304.jpg',
    tag: 'Electronic',
  },
];

export const EditSongModal: React.FC<EditSongModalProps> = ({
  song,
  isOpen,
  onClose,
  availableGenres = ['Classical', 'Lo-Fi', 'Synthwave', 'Ambient', 'Electronic', 'Acoustic', 'Jazz'],
}) => {
  const { updateSong } = useAudio();

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [typeMood, setTypeMood] = useState('');
  const [album, setAlbum] = useState('');
  const [duration, setDuration] = useState(180);
  const [audioUrl, setAudioUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [featured, setFeatured] = useState(false);
  const [description, setDescription] = useState('');

  const [isLimitedEdition, setIsLimitedEdition] = useState(false);
  const [limitedUntil, setLimitedUntil] = useState('');
  const [autoRemoveOnExpire, setAutoRemoveOnExpire] = useState(false);
  const [badgeType, setBadgeType] = useState<SongBadgeType>('none');
  const [badgeMessage, setBadgeMessage] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [isDroppingSoon, setIsDroppingSoon] = useState(false);
  const [dropDate, setDropDate] = useState('');
  const [autoReleaseOnDrop, setAutoReleaseOnDrop] = useState(false);

  // Plays, Listen reset & Scheduled for deletion state
  const [plays, setPlays] = useState<number>(0);
  const [weeklyPlays, setWeeklyPlays] = useState<number>(0);
  const [isScheduledForDeletion, setIsScheduledForDeletion] = useState(false);
  const [isPullingDriveCover, setIsPullingDriveCover] = useState(false);
  const [isDetectingDuration, setIsDetectingDuration] = useState(false);

  // Spotlight & Visibility state
  const [isSpotlight, setIsSpotlight] = useState(false);
  const [spotlightOrder, setSpotlightOrder] = useState<number>(0);
  const [spotlightNote, setSpotlightNote] = useState('');
  const [visibilityMode, setVisibilityMode] = useState<'everyone' | 'hidden_all' | 'specific'>('everyone');
  const [hiddenUsersInput, setHiddenUsersInput] = useState('');

  const [coverMode, setCoverMode] = useState<'gallery' | 'url' | 'upload'>('gallery');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Quick audio preview player
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (song) {
      setTitle(song.title);
      setArtist(song.artist);
      setGenre(song.genre);
      setTagsInput(song.tags ? song.tags.join(', ') : '');
      setTypeMood(song.typeMood || '');
      setAlbum(song.album || 'Single');
      setDuration(song.duration);
      setAudioUrl(song.audioUrl);
      setCoverUrl(song.coverUrl);
      setCustomUrlInput(song.coverUrl);
      setFeatured(!!song.featured);
      setDescription(song.description || '');

      setPlays(song.plays || 0);
      setWeeklyPlays(song.weeklyPlays || 0);
      setIsScheduledForDeletion(!!song.isScheduledForDeletion);

      setIsLimitedEdition(!!song.isLimitedEdition);
      setLimitedUntil(song.limitedUntil ? new Date(song.limitedUntil).toISOString().slice(0, 16) : '');
      setAutoRemoveOnExpire(!!song.autoRemoveOnExpire);
      setBadgeType(song.badgeType || 'none');
      setBadgeMessage(song.badgeMessage || song.badgeCustomText || '');
      setIsPinned(!!song.isPinned);
      setIsDroppingSoon(!!song.isDroppingSoon);
      setDropDate(song.dropDate ? new Date(song.dropDate).toISOString().slice(0, 16) : '');
      setAutoReleaseOnDrop(!!song.autoReleaseOnDrop);

      setIsSpotlight(!!song.isSpotlight);
      setSpotlightOrder(song.spotlightOrder ?? 0);
      setSpotlightNote(song.spotlightNote || '');

      const hf = song.hiddenFrom || [];
      if (hf.includes('all')) {
        setVisibilityMode('hidden_all');
        setHiddenUsersInput('');
      } else if (hf.length > 0) {
        setVisibilityMode('specific');
        setHiddenUsersInput(hf.join(', '));
      } else {
        setVisibilityMode('everyone');
        setHiddenUsersInput('');
      }
    }
    return () => {
      if (previewAudio) {
        previewAudio.pause();
      }
    };
  }, [song]);

  if (!isOpen || !song) return null;

  const togglePreview = () => {
    if (!audioUrl) return;

    if (isPreviewPlaying && previewAudio) {
      previewAudio.pause();
      setIsPreviewPlaying(false);
    } else {
      if (previewAudio) {
        previewAudio.pause();
      }
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPreviewPlaying(false);
      audio.onerror = () => {
        setIsPreviewPlaying(false);
        setFeedback('Could not play audio stream. Check audio URL.');
      };
      audio.play().then(() => setIsPreviewPlaying(true)).catch(() => setIsPreviewPlaying(false));
      setPreviewAudio(audio);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFeedback(`Uploading cover media "${file.name}"...`);
    const uploadRes = await storage.uploadCoverFile(file);
    if (uploadRes.success && uploadRes.coverUrl) {
      setCoverUrl(uploadRes.coverUrl);
      setFeedback('✓ Cover artwork/video uploaded successfully!');
      setTimeout(() => setFeedback(null), 2500);
    } else {
      setFeedback(`Cover upload failed: ${uploadRes.error || 'Server error'}`);
    }
  };

  const handleApplyCustomUrl = () => {
    if (customUrlInput.trim()) {
      const formatted = formatCoverMediaUrl(customUrlInput.trim());
      setCoverUrl(formatted);
      setFeedback('✓ Cover link formatted & applied!');
      setTimeout(() => setFeedback(null), 2500);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !artist.trim()) {
      setFeedback('Title and Artist cannot be empty.');
      return;
    }

    if (previewAudio) {
      previewAudio.pause();
    }

    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    let computedHiddenFrom: string[] | undefined = undefined;
    if (visibilityMode === 'hidden_all') {
      computedHiddenFrom = ['all'];
    } else if (visibilityMode === 'specific') {
      computedHiddenFrom = hiddenUsersInput
        .split(',')
        .map((u) => u.trim().replace(/^@/, ''))
        .filter((u) => u.length > 0);
    } else {
      computedHiddenFrom = [];
    }

    updateSong(song.id, {
      title: title.trim(),
      artist: artist.trim(),
      genre: genre.trim() || 'General',
      tags: parsedTags.length > 0 ? parsedTags : [genre.trim().toLowerCase()],
      typeMood: typeMood.trim() || undefined,
      album: album.trim() || 'Single',
      duration: Number(duration) || 180,
      audioUrl: audioUrl.trim(),
      coverUrl: coverUrl.trim(),
      plays: Math.max(0, Number(plays) || 0),
      weeklyPlays: Math.max(0, Number(weeklyPlays) || 0),
      isScheduledForDeletion,
      scheduledDeletionAt: isScheduledForDeletion
        ? song.scheduledDeletionAt || new Date().toISOString()
        : undefined,
      featured,
      description: description.trim() || undefined,
      isLimitedEdition,
      limitedUntil: isLimitedEdition && limitedUntil ? new Date(limitedUntil).toISOString() : undefined,
      autoRemoveOnExpire: isLimitedEdition && autoRemoveOnExpire,
      badgeType,
      badgeMessage: badgeMessage.trim() || undefined,
      badgeCustomText: badgeMessage.trim() || undefined,
      isPinned,
      isDroppingSoon,
      dropDate: isDroppingSoon && dropDate ? new Date(dropDate).toISOString() : undefined,
      autoReleaseOnDrop: isDroppingSoon && autoReleaseOnDrop,
      hiddenFrom: isScheduledForDeletion ? ['all'] : computedHiddenFrom,
      isSpotlight,
      spotlightOrder: Number(spotlightOrder) || 0,
      spotlightNote: spotlightNote.trim() || undefined,
    });

    setFeedback('Song updated successfully! Selection tabs refreshed.');
    setTimeout(() => {
      setFeedback(null);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 dark:bg-blue-600/20 border border-blue-500/20 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-display">
                Edit Song & Genre Metadata
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Modify title, artist, genre, tags, type, or cover image.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (previewAudio) previewAudio.pause();
              onClose();
            }}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedback && (
          <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-600/15 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-200 text-xs flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Top Preview Card */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            {/* Live Cover Preview */}
            <div className="relative w-28 h-28 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0 shadow-sm">
              <MediaCover
                src={coverUrl}
                alt="Cover Preview"
                fallbackTitle={title || 'Cover'}
                fallbackGenre={genre || 'Music'}
                className="w-full h-full object-cover"
                showBadge
              />
            </div>

            {/* Song Live Info */}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-blue-600 dark:text-blue-400 font-mono">
                  Live Preview
                </span>
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white truncate mt-0.5">
                {title || 'Untitled Song'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{artist || 'Unknown Artist'}</p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-200 border border-blue-200 dark:border-blue-400/20 font-medium">
                  {genre || 'Genre'}
                </span>
                {typeMood && (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-400/20">
                    {typeMood}
                  </span>
                )}
                <span>·</span>
                <span className="font-mono tabular-nums">
                  {Math.floor(duration / 60)}:
                  {String(Math.floor(duration % 60)).padStart(2, '0')}
                </span>
              </div>

              {/* Quick Audio Test Button */}
              {audioUrl && (
                <div className="mt-3 flex items-center justify-center sm:justify-start gap-2">
                  <button
                    type="button"
                    onClick={togglePreview}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-600/20 hover:bg-blue-100 dark:hover:bg-blue-600/30 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-semibold transition-all"
                  >
                    {isPreviewPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPreviewPlaying ? 'Pause Test' : 'Test Audio Playback'}</span>
                  </button>
                  <span className="text-[10px] text-slate-400">Verify audio stream works</span>
                </div>
              )}
            </div>
          </div>

          {/* Cover Image Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-display">
                Customize Cover Image
              </label>
              <div className="flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setCoverMode('gallery')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    coverMode === 'gallery'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Gallery Presets
                </button>
                <button
                  type="button"
                  onClick={() => setCoverMode('url')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    coverMode === 'url'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Image URL
                </button>
                <button
                  type="button"
                  onClick={() => setCoverMode('upload')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    coverMode === 'upload'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Upload File
                </button>
              </div>
            </div>

            {/* Mode 1: Gallery */}
            {coverMode === 'gallery' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {GALLERY_PRESETS.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setCoverUrl(item.url)}
                    className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all ${
                      coverUrl === item.url
                        ? 'border-blue-600 ring-2 ring-blue-500/40'
                        : 'border-slate-200 dark:border-slate-800 hover:border-blue-400'
                    }`}
                  >
                    <img src={item.url} alt={item.name} className="w-full h-20 object-cover" />
                    <div className="p-1.5 bg-slate-900/90 text-white backdrop-blur-sm">
                      <div className="text-[10px] font-semibold truncate">{item.name}</div>
                      <div className="text-[9px] text-blue-300">{item.tag}</div>
                    </div>
                    {coverUrl === item.url && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Mode 2: Custom URL or Google Drive Link */}
            {coverMode === 'url' && (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Link className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="url"
                      placeholder="Paste Google Drive link, GIF URL, video link (.mp4/.webm), or image link"
                      value={customUrlInput}
                      onChange={(e) => {
                        setCustomUrlInput(e.target.value);
                        const formatted = formatCoverMediaUrl(e.target.value);
                        if (formatted) setCoverUrl(formatted);
                      }}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isPullingDriveCover}
                      onClick={async () => {
                        if (!customUrlInput.trim()) return;
                        setIsPullingDriveCover(true);
                        setFeedback('Importing artwork directly from Google Drive...');
                        const res = await storage.importCloudCover(customUrlInput.trim());
                        setIsPullingDriveCover(false);
                        if (res.success && res.coverUrl) {
                          setCoverUrl(res.coverUrl);
                          setFeedback('✓ Image/GIF pulled directly from Google Drive and saved permanently!');
                        } else {
                          const formatted = formatCoverMediaUrl(customUrlInput.trim());
                          setCoverUrl(formatted);
                          setFeedback(`Connected Drive link: ${res.error || 'Using live cloud stream'}`);
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                      title="Pull artwork from Google Drive and save permanently"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>{isPullingDriveCover ? 'Pulling...' : 'Pull Drive Artwork'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCustomUrl}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shrink-0"
                    >
                      Apply
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Google Drive links for images, GIFs, or short loop videos will automatically be formatted or downloaded for high-performance streaming.
                </p>
              </div>
            )}

            {/* Mode 3: Local File Upload */}
            {coverMode === 'upload' && (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
                <Film className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                <label className="cursor-pointer px-4 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-600/20 hover:bg-blue-100 dark:hover:bg-blue-600/30 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-semibold inline-block transition-colors">
                  Select Artwork, GIF or Video File
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/webm,image/gif"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-[10px] text-slate-400 mt-1">PNG, JPG, WebP, GIF, and short MP4/WebM video loops supported</p>
              </div>
            )}
          </div>

          {/* Text Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Song Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Clair de Lune"
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Artist / Composer *</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="e.g. Claude Debussy"
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Genre *</label>
              <input
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="e.g. Classical, Piano, Lo-Fi"
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
              {/* Quick Genre Suggestions */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {availableGenres.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGenre(g)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      genre.toLowerCase() === g.toLowerCase()
                        ? 'bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-400/40 font-semibold'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Type / Mood / Vibe</label>
              <input
                type="text"
                value={typeMood}
                onChange={(e) => setTypeMood(e.target.value)}
                placeholder="e.g. Gentle Solo Piano, Chill Study"
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Tags (comma separated, for search & mood matching)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. piano, classical, debussy, study, calm, quiet"
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Quick Tags:</span>
                {['leaving soon', 'top hit', 'new', 'hot', 'study-vibe', 'lo-fi', 'extended', 'chill', 'staff-pick'].map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => {
                      const existing = tagsInput.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
                      if (!existing.includes(pt)) {
                        setTagsInput(existing.length > 0 ? `${tagsInput.trim()}, ${pt}` : pt);
                      }
                    }}
                    className="px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-600/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20 text-[10px] font-semibold hover:bg-blue-100 dark:hover:bg-blue-600/20 transition-colors"
                  >
                    +{pt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Album</label>
              <input
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder="Single or Album Name"
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Duration (Seconds)
                </label>
                <button
                  type="button"
                  disabled={isDetectingDuration}
                  onClick={async () => {
                    if (!audioUrl) return;
                    setIsDetectingDuration(true);
                    setFeedback('Measuring exact duration from audio stream...');
                    const res = await storage.detectDuration(audioUrl);
                    setIsDetectingDuration(false);
                    if (res.success && res.duration) {
                      setDuration(res.duration);
                      setFeedback(`✓ Exact duration detected: ${Math.floor(res.duration / 60)}:${String(res.duration % 60).padStart(2, '0')}`);
                    } else {
                      setFeedback('Could not auto-detect duration from link. You can type it manually.');
                    }
                  }}
                  className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold hover:underline flex items-center gap-1 disabled:opacity-50"
                >
                  <Clock className="w-3 h-3" />
                  <span>{isDetectingDuration ? 'Detecting...' : 'Auto-Detect'}</span>
                </button>
              </div>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            {/* Listens & Top Hits Reset */}
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-rose-500" />
                    <span>Song Play Counters & Top Hits</span>
                  </span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Admin listens are strictly excluded. Reset counts to refresh Top Hits ranking.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPlays(0);
                    setWeeklyPlays(0);
                    setFeedback('✓ Play count reset to 0 (saves when you click Save Changes)');
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold transition-colors shadow-xs"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Listens to 0</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                    All-Time Plays
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={plays}
                    onChange={(e) => setPlays(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                    This Week Plays (Weekly Top Hit Basis)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={weeklyPlays}
                    onChange={(e) => setWeeklyPlays(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Audio Stream MP3 or Google Drive / Cloud URL
              </label>
              <input
                type="text"
                value={audioUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  const parsed = storage.parseCloudAudioUrl(val);
                  setAudioUrl(parsed.streamUrl);
                }}
                placeholder="https://drive.google.com/file/d/... or direct audio link"
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-mono text-[11px]"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Supports Google Drive links (set to &quot;Anyone with the link&quot;), Dropbox, OneDrive, and direct audio stream URLs.
              </p>
            </div>

            {/* YouTube songs: control whether listeners see the video box */}
            {/^youtube:[A-Za-z0-9_-]{11}(:hidden)?$/.test(audioUrl.trim()) && (
              <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={audioUrl.trim().endsWith(':hidden')}
                    onChange={(e) => {
                      const base = audioUrl.trim().replace(/:hidden$/, '');
                      setAudioUrl(e.target.checked ? `${base}:hidden` : base);
                    }}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="font-semibold text-slate-900 dark:text-white">Hide the video from listeners</span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      This is a YouTube song. When checked, listeners hear it without the video box. Admins can still
                      show it with the player&apos;s Show / Hide buttons. Click Save to apply.
                    </span>
                  </span>
                </label>
              </div>
            )}


            {/* Admin Highlight & Pin Section */}
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Song Highlighting & Badges
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-blue-600 focus:ring-0"
                  />
                  <Pin className="w-3 h-3 text-blue-500" />
                  <span className="font-semibold text-slate-900 dark:text-white">Pin to Top</span>
                </label>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Card Badge Highlight
                </label>
                <select
                  value={badgeType}
                  onChange={(e) => setBadgeType(e.target.value as SongBadgeType)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="none" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">None (Standard)</option>
                  <option value="hot" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🔥 HOT Track (Fire)</option>
                  <option value="new" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">⚡ NEW Track</option>
                  <option value="top" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🏆 TOP Hit</option>
                  <option value="admin-pick" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">⭐ ADMIN PICK</option>
                  <option value="limited" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">⏳ LIMITED EDITION</option>
                  <option value="custom" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">💬 Custom Text Badge</option>
                </select>
              </div>

              {/* Custom Badge Message or Subtitle Note */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Custom Badge Message / Note <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">(e.g. "Dropping Friday", "Fan Favorite", "Hot Summer Hit")</span>
                </label>
                <input
                  type="text"
                  value={badgeMessage}
                  onChange={(e) => setBadgeMessage(e.target.value)}
                  placeholder="Enter a custom label or banner message for this track"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Limited Edition & Leaving Timer */}
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={isLimitedEdition}
                  onChange={(e) => setIsLimitedEdition(e.target.checked)}
                  className="rounded border-rose-300 bg-white dark:bg-slate-900 text-rose-600 focus:ring-0"
                />
                <span className="font-bold text-rose-600 dark:text-rose-400">Mark as Limited Edition / Leaving Soon</span>
              </label>

              {isLimitedEdition && (
                <div className="space-y-2 pt-2 border-t border-rose-500/10">
                  <div>
                    <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                      Leaving Date & Time (Countdown until leaving)
                    </label>
                    <input
                      type="datetime-local"
                      value={limitedUntil}
                      onChange={(e) => setLimitedUntil(e.target.value)}
                      className="w-full sm:w-auto px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={autoRemoveOnExpire}
                      onChange={(e) => setAutoRemoveOnExpire(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-rose-600 focus:ring-0"
                    />
                    <span>Auto-schedule for deletion when countdown timer expires (hides from students & queues at top of Admin list)</span>
                  </label>
                </div>
              )}
            </div>

            {/* Scheduled for Deletion Status (Special Queue) */}
            <div className={`sm:col-span-2 p-3.5 rounded-xl border transition-all ${
              isScheduledForDeletion
                ? 'bg-rose-950/30 border-rose-500/50 shadow-sm'
                : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <AlertTriangle className={`w-3.5 h-3.5 ${isScheduledForDeletion ? 'text-rose-400' : 'text-slate-400'}`} />
                    <span>Scheduled for Deletion Status</span>
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    When active, this track is completely invisible to all students and regular listeners. It is highlighted and pinned at the top of the Admin Song Manager for manual deletion.
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs shrink-0 pt-0.5">
                  <input
                    type="checkbox"
                    checked={isScheduledForDeletion}
                    onChange={(e) => setIsScheduledForDeletion(e.target.checked)}
                    className="rounded border-rose-300 bg-white dark:bg-slate-900 text-rose-600 focus:ring-0"
                  />
                  <span className={`font-bold ${isScheduledForDeletion ? 'text-rose-400' : 'text-slate-400'}`}>
                    {isScheduledForDeletion ? 'Scheduled for Deletion' : 'Keep Active'}
                  </span>
                </label>
              </div>
            </div>

            {/* Dropping Soon & Release Timer */}
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={isDroppingSoon}
                  onChange={(e) => setIsDroppingSoon(e.target.checked)}
                  className="rounded border-amber-300 bg-white dark:bg-slate-900 text-amber-600 focus:ring-0"
                />
                <span className="font-bold text-amber-600 dark:text-amber-400">New Song Dropping Soon (Unplayable preview teaser)</span>
              </label>

              {isDroppingSoon && (
                <div className="space-y-2 pt-2 border-t border-amber-500/10">
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Listeners will see the title, picture, and countdown drop timer, but cannot play it until released!
                  </p>
                  <div>
                    <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                      Official Drop Release Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={dropDate}
                      onChange={(e) => setDropDate(e.target.value)}
                      className="w-full sm:w-auto px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={autoReleaseOnDrop}
                      onChange={(e) => setAutoReleaseOnDrop(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-amber-600 focus:ring-0"
                    />
                    <span>Auto-release and make playable as soon as countdown timer reaches zero</span>
                  </label>
                </div>
              )}
            </div>

            {/* Admin Spotlight VIP Track */}
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={isSpotlight}
                  onChange={(e) => setIsSpotlight(e.target.checked)}
                  className="rounded border-amber-400 bg-white dark:bg-slate-900 text-amber-500 focus:ring-0"
                />
                <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Spotlight Showcase VIP Track
                </span>
              </label>

              {isSpotlight && (
                <div className="space-y-3 pt-2 border-t border-amber-500/20 text-xs">
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    When Spotlight Mode is activated by admins, this track is prominently featured in the VIP Showcase while other songs and panels are hidden.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1 font-medium">
                        Display Order Priority
                      </label>
                      <input
                        type="number"
                        value={spotlightOrder}
                        onChange={(e) => setSpotlightOrder(Number(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1 font-medium">
                        Spotlight Ribbon Note / Subtitle
                      </label>
                      <input
                        type="text"
                        value={spotlightNote}
                        onChange={(e) => setSpotlightNote(e.target.value)}
                        placeholder="e.g. Featured Producer of the Month"
                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Visibility & Access Control: Hide from Everyone or Specific Users */}
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-indigo-500" />
                  Audience Visibility & Hiding Control
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                  Control whether this song is public, hidden from everyone, or hidden from specific listener accounts.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setVisibilityMode('everyone')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                    visibilityMode === 'everyone'
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-400/50 shadow-xs'
                      : 'bg-white/[0.04] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Visible to All
                </button>
                <button
                  type="button"
                  onClick={() => setVisibilityMode('hidden_all')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                    visibilityMode === 'hidden_all'
                      ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-400/50 shadow-xs'
                      : 'bg-white/[0.04] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Hidden: Everyone
                </button>
                <button
                  type="button"
                  onClick={() => setVisibilityMode('specific')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                    visibilityMode === 'specific'
                      ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-400/50 shadow-xs'
                      : 'bg-white/[0.04] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Hidden: Specific Users
                </button>
              </div>

              {visibilityMode === 'specific' && (
                <div className="pt-2 border-t border-indigo-500/20 space-y-1.5 animate-in fade-in">
                  <label className="block text-[11px] text-indigo-800 dark:text-indigo-200 font-medium">
                    Usernames or User IDs to hide this song from (comma separated):
                  </label>
                  <input
                    type="text"
                    value={hiddenUsersInput}
                    onChange={(e) => setHiddenUsersInput(e.target.value)}
                    placeholder="e.g. student_alex, guest_listener, user-123"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-indigo-500/40 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400 font-mono text-[11px]"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    The song will remain visible to all other users and administrators.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sticky Action Row - Never scrolls off screen */}
          <div className="sticky bottom-0 -mx-6 sm:-mx-8 -mb-6 sm:-mb-8 p-4 px-6 sm:px-8 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 z-20 shadow-lg rounded-b-3xl mt-6">
            <button
              type="button"
              onClick={() => {
                if (previewAudio) previewAudio.pause();
                onClose();
              }}
              className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
