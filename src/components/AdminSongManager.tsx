import React, { useState, useMemo } from 'react';
import { Song, User, SpotlightConfig, SpotlightTheme } from '../types';
import { useAudio } from '../context/AudioContext';
import { handleImageFallback } from '../utils/artworkHelper';
import { HideFromUsersModal } from './HideFromUsersModal';
import { EditSongModal } from './EditSongModal';
import { MediaCover } from './MediaCover';
import {
  Search,
  SlidersHorizontal,
  Tag,
  Eye,
  EyeOff,
  Star,
  Trash2,
  Edit2,
  Play,
  Pause,
  CheckSquare,
  Square,
  Clock,
  Sparkles,
  Lock,
  Pin,
  Flame,
  Plus,
  Users,
  Check,
  ChevronDown,
  X,
  Filter,
  ArrowUpDown,
  Settings,
  Calendar,
  AlertTriangle,
  FolderOpen,
  RotateCcw,
  Undo2,
  Sliders,
  ShieldAlert,
  Layers,
  Volume2,
} from 'lucide-react';

interface AdminSongManagerProps {
  allSongs: Song[];
  allUsers: User[];
  onPlaySong?: (song: Song) => void;
}

export const AdminSongManager: React.FC<AdminSongManagerProps> = ({ allSongs, allUsers, onPlaySong }) => {
  const {
    currentSong,
    isPlaying,
    playSong,
    togglePlay,
    updateSong,
    deleteSong,
    bulkUpdateSongs,
    bulkDeleteSongs,
    resetSongPlays,
    bulkResetSongPlays,
    spotlightConfig,
    updateSpotlightConfig,
  } = useAudio();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [selectedTag, setSelectedTag] = useState('All');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'visible' | 'hidden_all' | 'hidden_users' | 'spotlight' | 'dropping' | 'leaving' | 'pinned' | 'scheduled_deletion'
  >('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title' | 'artist' | 'plays' | 'duration'>('newest');

  // Bulk Selection State
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);

  // Modals & Popovers
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [visibilityModalSongs, setVisibilityModalSongs] = useState<Song[] | null>(null);
  const [isSpotlightConfigOpen, setIsSpotlightConfigOpen] = useState(false);

  // Safe Deletion & Bulk Deletion Modals
  const [deletingSong, setDeletingSong] = useState<Song | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  // Comprehensive Mass Edit Modal State
  const [isMassEditModalOpen, setIsMassEditModalOpen] = useState(false);
  const [massAlbum, setMassAlbum] = useState('');
  const [massApplyAlbum, setMassApplyAlbum] = useState(false);
  const [massGenre, setMassGenre] = useState('Lo-Fi');
  const [massApplyGenre, setMassApplyGenre] = useState(false);
  const [massTypeMood, setMassTypeMood] = useState('');
  const [massApplyTypeMood, setMassApplyTypeMood] = useState(false);
  const [massDescription, setMassDescription] = useState('');
  const [massApplyDescription, setMassApplyDescription] = useState(false);
  const [massTags, setMassTags] = useState('');
  const [massTagMode, setMassTagMode] = useState<'add' | 'remove' | 'set'>('add');
  const [massApplyTags, setMassApplyTags] = useState(false);
  const [massBadgeType, setMassBadgeType] = useState<Song['badgeType']>('none');
  const [massBadgeText, setMassBadgeText] = useState('');
  const [massApplyBadge, setMassApplyBadge] = useState(false);
  const [massDropEnabled, setMassDropEnabled] = useState(false);
  const [massDropDate, setMassDropDate] = useState('');
  const [massAutoRelease, setMassAutoRelease] = useState(true);
  const [massApplyDrop, setMassApplyDrop] = useState(false);
  const [massLimitedEnabled, setMassLimitedEnabled] = useState(false);
  const [massLimitedDate, setMassLimitedDate] = useState('');
  const [massAutoRemove, setMassAutoRemove] = useState(false);
  const [massApplyLimited, setMassApplyLimited] = useState(false);
  const [massVisibility, setMassVisibility] = useState<'keep' | 'visible' | 'hidden_all'>('keep');
  const [massResetPlays, setMassResetPlays] = useState(false);
  const [isSubmittingMassEdit, setIsSubmittingMassEdit] = useState(false);

  // Bulk Tag Action Drawer State
  const [isBulkTagModalOpen, setIsBulkTagModalOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'remove' | 'set'>('add');

  // Bulk Genre Modal State
  const [isBulkGenreModalOpen, setIsBulkGenreModalOpen] = useState(false);
  const [bulkGenreInput, setBulkGenreInput] = useState('Lo-Fi');

  // Bulk Drop / Leaving Modal State
  const [isBulkScheduleModalOpen, setIsBulkScheduleModalOpen] = useState(false);
  const [scheduleType, setScheduleType] = useState<'drop' | 'leave' | 'clear'>('drop');
  const [scheduleDate, setScheduleDate] = useState('');

  // Inline Tag Input State per song row
  const [addingTagSongId, setAddingTagSongId] = useState<string | null>(null);
  const [inlineTagValue, setInlineTagValue] = useState('');

  // Inline Spotlight Note Modal
  const [spotlightNoteSong, setSpotlightNoteSong] = useState<Song | null>(null);
  const [spotlightNoteInput, setSpotlightNoteInput] = useState('');

  // Feedback banner
  const [feedback, setFeedback] = useState<string | null>(null);

  // Quick Preset Tags
  const PRESET_TAGS = ['leaving soon', 'top hit', 'new drop', 'study vibes', 'exclusive', 'ambient chill', 'deep focus'];

  // All Unique Tags in Library
  const allUniqueTags = useMemo(() => {
    const set = new Set<string>();
    allSongs.forEach((song) => {
      song.tags?.forEach((t) => set.add(t.trim().toLowerCase()));
    });
    return Array.from(set).sort();
  }, [allSongs]);

  // All Unique Genres
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    allSongs.forEach((s) => {
      if (s.genre) set.add(s.genre.trim());
    });
    return Array.from(set).sort();
  }, [allSongs]);

  // Scheduled for deletion counts
  const scheduledCount = useMemo(() => {
    return allSongs.filter((s) => s.isScheduledForDeletion).length;
  }, [allSongs]);

  const scheduledDeletionSongs = useMemo(() => {
    return allSongs.filter((s) => s.isScheduledForDeletion);
  }, [allSongs]);

  // Filtered & Sorted Songs
  const filteredSongs = useMemo(() => {
    return allSongs
      .filter((song) => {
        // Search Query
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          song.title.toLowerCase().includes(q) ||
          song.artist.toLowerCase().includes(q) ||
          (song.album && song.album.toLowerCase().includes(q)) ||
          song.genre.toLowerCase().includes(q) ||
          (song.tags && song.tags.some((t) => t.toLowerCase().includes(q))) ||
          (song.spotlightNote && song.spotlightNote.toLowerCase().includes(q));

        // Genre Filter
        const matchesGenre = selectedGenre === 'All' || song.genre.toLowerCase() === selectedGenre.toLowerCase();

        // Tag Filter
        const matchesTag =
          selectedTag === 'All' ||
          (song.tags && song.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase()));

        // Status Filter
        let matchesStatus = true;
        if (statusFilter === 'visible') {
          matchesStatus = !song.isScheduledForDeletion && (!song.hiddenFrom || song.hiddenFrom.length === 0);
        } else if (statusFilter === 'hidden_all') {
          matchesStatus = !!song.hiddenFrom && song.hiddenFrom.includes('all');
        } else if (statusFilter === 'hidden_users') {
          matchesStatus = !!song.hiddenFrom && song.hiddenFrom.length > 0 && !song.hiddenFrom.includes('all');
        } else if (statusFilter === 'spotlight') {
          matchesStatus = !!song.isSpotlight;
        } else if (statusFilter === 'dropping') {
          matchesStatus = !!song.isDroppingSoon;
        } else if (statusFilter === 'leaving') {
          matchesStatus = !!song.isLimitedEdition;
        } else if (statusFilter === 'pinned') {
          matchesStatus = !!song.isPinned;
        } else if (statusFilter === 'scheduled_deletion') {
          matchesStatus = !!song.isScheduledForDeletion;
        }

        return matchesSearch && matchesGenre && matchesTag && matchesStatus;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'newest':
            return new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime();
          case 'oldest':
            return new Date(a.addedAt || 0).getTime() - new Date(b.addedAt || 0).getTime();
          case 'title':
            return a.title.localeCompare(b.title);
          case 'artist':
            return a.artist.localeCompare(b.artist);
          case 'plays':
            return (b.plays || 0) - (a.plays || 0);
          case 'duration':
            return (b.duration || 0) - (a.duration || 0);
          default:
            return 0;
        }
      });
  }, [allSongs, searchQuery, selectedGenre, selectedTag, statusFilter, sortBy]);

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedSongIds.length === filteredSongs.length) {
      setSelectedSongIds([]);
    } else {
      setSelectedSongIds(filteredSongs.map((s) => s.id));
    }
  };

  const handleToggleSelectSong = (id: string) => {
    if (selectedSongIds.includes(id)) {
      setSelectedSongIds(selectedSongIds.filter((sid) => sid !== id));
    } else {
      setSelectedSongIds([...selectedSongIds, id]);
    }
  };

  // Bulk Apply Tags
  const handleApplyBulkTags = async () => {
    if (!bulkTagInput.trim()) return;
    const tagList = bulkTagInput
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
      .filter(Boolean);

    if (tagList.length === 0) return;

    await bulkUpdateSongs(selectedSongIds, {}, { action: bulkTagMode, tags: tagList });
    setFeedback(`Updated tags for ${selectedSongIds.length} song(s).`);
    setIsBulkTagModalOpen(false);
    setBulkTagInput('');
    setTimeout(() => setFeedback(null), 3000);
  };

  // Quick preset tag addition to selection
  const handleApplyPresetTagToSelection = async (preset: string) => {
    if (selectedSongIds.length === 0) return;
    await bulkUpdateSongs(selectedSongIds, {}, { action: 'add', tags: [preset] });
    setFeedback(`Applied tag "#${preset}" to ${selectedSongIds.length} song(s)!`);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Bulk Spotlight Toggle
  const handleBulkSpotlight = async (enable: boolean) => {
    await bulkUpdateSongs(selectedSongIds, { isSpotlight: enable });
    setFeedback(`${enable ? 'Added' : 'Removed'} ${selectedSongIds.length} song(s) ${enable ? 'to' : 'from'} Spotlight.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Bulk Hide from Everyone
  const handleBulkHideEveryone = async (hide: boolean) => {
    await bulkUpdateSongs(selectedSongIds, { hiddenFrom: hide ? ['all'] : [] });
    setFeedback(`${hide ? 'Hidden' : 'Revealed'} ${selectedSongIds.length} song(s) for everyone.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Bulk Reset Plays
  const handleBulkResetPlays = async () => {
    if (confirm(`Reset all-time and weekly play counts to 0 for ${selectedSongIds.length} selected song(s)? This will reset their Top Hit designation.`)) {
      await bulkResetSongPlays(selectedSongIds);
      setFeedback(`✓ Reset listen amounts to 0 for ${selectedSongIds.length} song(s). Top Hit metric refreshed.`);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Single Song Reset Plays
  const handleSingleResetPlays = async (song: Song) => {
    if (confirm(`Reset listen counters for "${song.title}" back to 0?`)) {
      await resetSongPlays(song.id);
      setFeedback(`✓ Reset listen counts for "${song.title}" to 0.`);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Restore track from scheduled deletion
  const handleRestoreSong = (song: Song) => {
    updateSong(song.id, {
      isScheduledForDeletion: false,
      scheduledDeletionAt: undefined,
      hiddenFrom: [],
    });
    setFeedback(`✓ Restored "${song.title}" back to active library.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Safe schedule for deletion (hides from listeners, keeps in admin)
  const handleScheduleSongDeletion = (song: Song) => {
    updateSong(song.id, {
      isScheduledForDeletion: true,
      scheduledDeletionAt: new Date().toISOString(),
      hiddenFrom: ['all'],
    });
    setDeletingSong(null);
    setFeedback(`✓ Scheduled "${song.title}" for deletion. Hidden from all listeners and preserved in Admin Panel.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Permanent deletion
  const handlePermanentDeleteSong = (song: Song) => {
    deleteSong(song.id);
    setDeletingSong(null);
    setFeedback(`✓ Permanently deleted "${song.title}" from library.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Bulk safe schedule deletion
  const handleBulkScheduleDeletion = async () => {
    await bulkUpdateSongs(selectedSongIds, {
      isScheduledForDeletion: true,
      scheduledDeletionAt: new Date().toISOString(),
      hiddenFrom: ['all'],
    });
    setIsBulkDeleteModalOpen(false);
    setSelectedSongIds([]);
    setFeedback(`✓ Scheduled ${selectedSongIds.length} song(s) for deletion. Hidden from all listeners.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Bulk permanent deletion
  const handleBulkPermanentDelete = async () => {
    await bulkDeleteSongs(selectedSongIds);
    setIsBulkDeleteModalOpen(false);
    setSelectedSongIds([]);
    setFeedback(`✓ Permanently deleted ${selectedSongIds.length} songs.`);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Handle Mass Studio Edit Application
  const handleApplyMassEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSongIds.length === 0) return;

    setIsSubmittingMassEdit(true);
    const updates: Partial<Song> = {};

    if (massApplyAlbum) {
      updates.album = massAlbum.trim() || 'Single';
    }
    if (massApplyGenre) {
      updates.genre = massGenre.trim() || 'Lo-Fi';
    }
    if (massApplyTypeMood) {
      updates.typeMood = massTypeMood.trim();
    }
    if (massApplyDescription) {
      updates.description = massDescription.trim();
    }
    if (massApplyBadge) {
      updates.badgeType = massBadgeType;
      updates.badgeCustomText = massBadgeText.trim() || undefined;
    }
    if (massApplyDrop) {
      updates.isDroppingSoon = massDropEnabled;
      updates.dropDate = massDropEnabled && massDropDate ? new Date(massDropDate).toISOString() : undefined;
      updates.autoReleaseOnDrop = massAutoRelease;
    }
    if (massApplyLimited) {
      updates.isLimitedEdition = massLimitedEnabled;
      updates.limitedUntil = massLimitedEnabled && massLimitedDate ? new Date(massLimitedDate).toISOString() : undefined;
      updates.autoRemoveOnExpire = massAutoRemove;
    }
    if (massVisibility === 'visible') {
      updates.hiddenFrom = [];
    } else if (massVisibility === 'hidden_all') {
      updates.hiddenFrom = ['all'];
    }

    let tagOperation: { action: 'add' | 'remove' | 'set'; tags: string[] } | undefined = undefined;
    if (massApplyTags && massTags.trim()) {
      const parsedTags = massTags.split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean);
      if (parsedTags.length > 0) {
        tagOperation = { action: massTagMode, tags: parsedTags };
      }
    }

    await bulkUpdateSongs(selectedSongIds, updates, tagOperation);

    if (massResetPlays) {
      await bulkResetSongPlays(selectedSongIds);
    }

    setIsSubmittingMassEdit(false);
    setIsMassEditModalOpen(false);
    setFeedback(`✓ Batch Studio updates applied successfully across ${selectedSongIds.length} track(s)!`);
    setTimeout(() => setFeedback(null), 3500);
  };

  // Bulk Genre Change
  const handleApplyBulkGenre = async () => {
    if (!bulkGenreInput.trim()) return;
    await bulkUpdateSongs(selectedSongIds, { genre: bulkGenreInput.trim() });
    setFeedback(`Genre changed to "${bulkGenreInput.trim()}" for ${selectedSongIds.length} song(s).`);
    setIsBulkGenreModalOpen(false);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Bulk Pin/Unpin
  const handleBulkPin = async (pin: boolean) => {
    await bulkUpdateSongs(selectedSongIds, { isPinned: pin });
    setFeedback(`${pin ? 'Pinned' : 'Unpinned'} ${selectedSongIds.length} song(s).`);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Bulk Schedule Drops/Removals
  const handleApplyBulkSchedule = async () => {
    if (scheduleType === 'clear') {
      await bulkUpdateSongs(selectedSongIds, {
        isDroppingSoon: false,
        dropDate: undefined,
        isLimitedEdition: false,
        limitedUntil: undefined,
      });
      setFeedback(`Cleared drop/removal schedules for ${selectedSongIds.length} song(s).`);
    } else if (scheduleType === 'drop') {
      if (!scheduleDate) return;
      await bulkUpdateSongs(selectedSongIds, {
        isDroppingSoon: true,
        dropDate: new Date(scheduleDate).toISOString(),
        autoReleaseOnDrop: true,
      });
      setFeedback(`Scheduled ${selectedSongIds.length} song(s) for drop on ${new Date(scheduleDate).toLocaleString()}.`);
    } else if (scheduleType === 'leave') {
      if (!scheduleDate) return;
      await bulkUpdateSongs(selectedSongIds, {
        isLimitedEdition: true,
        limitedUntil: new Date(scheduleDate).toISOString(),
        autoRemoveOnExpire: false,
      });
      setFeedback(`Scheduled ${selectedSongIds.length} song(s) to leave library on ${new Date(scheduleDate).toLocaleString()}.`);
    }
    setIsBulkScheduleModalOpen(false);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Inline Tag Add for a single song
  const handleAddInlineTag = (song: Song) => {
    if (!inlineTagValue.trim()) {
      setAddingTagSongId(null);
      return;
    }
    const cleanTag = inlineTagValue.trim().toLowerCase().replace(/^#/, '');
    const currentTags = song.tags ? [...song.tags] : [];
    if (!currentTags.map((t) => t.toLowerCase()).includes(cleanTag)) {
      currentTags.push(cleanTag);
      updateSong(song.id, { tags: currentTags });
    }
    setInlineTagValue('');
    setAddingTagSongId(null);
  };

  const handleRemoveSingleTag = (song: Song, tagToRemove: string) => {
    const currentTags = song.tags ? [...song.tags] : [];
    const updated = currentTags.filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase());
    updateSong(song.id, { tags: updated });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const spotlightCount = allSongs.filter((s) => s.isSpotlight).length;

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* 1. MASTER SPOTLIGHT MODE CONTROL PANEL */}
      <div className={`p-6 rounded-3xl border transition-all ${
        spotlightConfig.enabled
          ? 'bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/15 border-amber-400/40 shadow-xl shadow-amber-500/10'
          : 'liquid-glass-surface border-white/10'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-lg ${
              spotlightConfig.enabled
                ? 'bg-gradient-to-tr from-amber-400 to-yellow-500 text-slate-950 shadow-amber-500/30'
                : 'bg-white/10 text-slate-400'
            }`}>
              <Star className={`w-6 h-6 ${spotlightConfig.enabled ? 'fill-slate-950 animate-pulse' : ''}`} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white font-display">
                  Spotlight Only Mode
                </h3>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                  spotlightConfig.enabled
                    ? 'bg-amber-400/20 text-amber-300 border-amber-400/30'
                    : 'bg-slate-800 text-slate-400 border-white/10'
                }`}>
                  {spotlightConfig.enabled ? 'ACTIVE ON SITE' : 'DISABLED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 max-w-xl">
                When active, spotlighted songs are the <strong>only ones that appear</strong> to listeners. All standard library bars and regular songs are hidden with an ultra-premium soundstage presentation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSpotlightConfigOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/10 text-xs font-semibold transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-amber-400" />
              <span>Customize Stage</span>
            </button>

            {/* Master Toggle */}
            <button
              type="button"
              onClick={() => updateSpotlightConfig({ enabled: !spotlightConfig.enabled })}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs shadow-lg transition-all active:scale-95 ${
                spotlightConfig.enabled
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 hover:from-amber-300 hover:to-yellow-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border border-white/10'
              }`}
            >
              <Star className="w-4 h-4 fill-current" />
              <span>{spotlightConfig.enabled ? 'Turn OFF Spotlight' : 'Activate Spotlight Mode'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-white/10 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Current Spotlight Selection:</span>
            <span className="font-bold text-amber-300 px-2 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/20">
              {spotlightCount} Song(s) Spotlighted
            </span>
          </div>
          <span className="text-slate-600 hidden sm:inline">·</span>
          <span className="text-slate-400 text-[11px]">
            * Click the star icon (⭐) on any track in the list below to add/remove it from Spotlight.
          </span>
        </div>
      </div>

      {/* Scheduled Deletion Alert Banner */}
      {scheduledCount > 0 && statusFilter !== 'scheduled_deletion' && (
        <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>{scheduledCount} song(s)</strong> are currently scheduled for deletion (hidden from listeners, pending admin review/purge).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter('scheduled_deletion')}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors shrink-0 shadow-sm"
          >
            Review Scheduled Deletions ({scheduledCount})
          </button>
        </div>
      )}

      {/* 2. SEARCH & ADVANCED FILTER BAR */}
      <div className="liquid-glass-surface rounded-3xl p-5 sm:p-6 border border-white/10 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Main Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title, artist, album, genre, or #tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Genre Filter Dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="All">All Genres ({allGenres.length})</option>
              {allGenres.map((g) => (
                <option key={g} value={g}>
                  {g} ({allSongs.filter((s) => s.genre === g).length})
                </option>
              ))}
            </select>

            {/* Tag Filter Dropdown */}
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="All">All Tags ({allUniqueTags.length})</option>
              {allUniqueTags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag} ({allSongs.filter((s) => s.tags?.some((t) => t.toLowerCase() === tag)).length})
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All Statuses</option>
              <option value="visible">👁️ Visible to All</option>
              <option value="hidden_all">🚫 Hidden from Everyone</option>
              <option value="hidden_users">👥 Hidden from Specific Users</option>
              <option value="spotlight">⭐ Spotlight Tracks</option>
              <option value="dropping">⏳ Dropping Soon</option>
              <option value="leaving">⏰ Leaving Soon</option>
              <option value="pinned">📌 Pinned Tracks</option>
              <option value="scheduled_deletion">🗑️ Scheduled for Deletion ({scheduledCount})</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="newest">Sort: Newest Added</option>
              <option value="oldest">Sort: Oldest Added</option>
              <option value="plays">Sort: Most Listens</option>
              <option value="title">Sort: Title (A-Z)</option>
              <option value="artist">Sort: Artist (A-Z)</option>
              <option value="duration">Sort: Duration</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Tags / Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5 text-xs text-slate-400">
          <span className="flex items-center gap-1 font-semibold text-slate-300">
            <Tag className="w-3.5 h-3.5 text-cyan-400" />
            <span>Preset Filters:</span>
          </span>
          {PRESET_TAGS.map((tag) => {
            const isSelected = selectedTag.toLowerCase() === tag.toLowerCase();
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(isSelected ? 'All' : tag)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  isSelected
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/10'
                }`}
              >
                #{tag}
              </button>
            );
          })}
          {(selectedGenre !== 'All' || selectedTag !== 'All' || statusFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedGenre('All');
                setSelectedTag('All');
                setStatusFilter('all');
                setSearchQuery('');
              }}
              className="text-cyan-400 hover:underline text-[11px] ml-auto font-medium"
            >
              Reset All Filters
            </button>
          )}
        </div>
      </div>

      {/* 3. BULK ACTIONS TOOLBAR (Appears when 1+ songs selected) */}
      {selectedSongIds.length > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/80 via-blue-950/80 to-indigo-950/80 border border-cyan-400/40 text-xs shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-lg bg-cyan-400 text-slate-950 font-extrabold flex items-center justify-center text-xs">
              {selectedSongIds.length}
            </span>
            <span className="font-bold text-white">
              {selectedSongIds.length} song(s) selected for mass action
            </span>
            <button
              type="button"
              onClick={() => setSelectedSongIds([])}
              className="text-cyan-300 hover:text-white underline text-[11px]"
            >
              Deselect All
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mass Studio Editor Action */}
            <button
              type="button"
              onClick={() => setIsMassEditModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-extrabold hover:from-cyan-300 hover:to-blue-400 shadow-md transition-all active:scale-95"
              title="Open full studio mass editor for all selected songs"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Mass Studio Editor</span>
            </button>

            {/* Bulk Tag Action */}
            <button
              type="button"
              onClick={() => setIsBulkTagModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/15 transition-all"
            >
              <Tag className="w-3.5 h-3.5 text-cyan-400" />
              <span>Apply Tags</span>
            </button>

            {/* Bulk Reset Listens Action */}
            <button
              type="button"
              onClick={handleBulkResetPlays}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/40 font-semibold transition-all"
              title="Reset play and listen counters back to 0 (resets Top Hit calculations)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Listens</span>
            </button>

            {/* Bulk Visibility Action */}
            <button
              type="button"
              onClick={() => {
                const targetSongs = allSongs.filter((s) => selectedSongIds.includes(s.id));
                setVisibilityModalSongs(targetSongs);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/15 transition-all"
            >
              <EyeOff className="w-3.5 h-3.5 text-amber-400" />
              <span>Visibility & Hiding</span>
            </button>

            {/* Bulk Spotlight Toggle */}
            <button
              type="button"
              onClick={() => handleBulkSpotlight(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/40 font-semibold transition-all"
              title="Add selected to Spotlight showcase"
            >
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>Spotlight</span>
            </button>

            {/* Bulk Change Genre */}
            <button
              type="button"
              onClick={() => setIsBulkGenreModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/15 transition-all"
            >
              <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>Genre</span>
            </button>

            {/* Bulk Schedule Drop / Removal */}
            <button
              type="button"
              onClick={() => setIsBulkScheduleModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/15 transition-all"
            >
              <Calendar className="w-3.5 h-3.5 text-rose-400" />
              <span>Drops / Removals</span>
            </button>

            {/* Bulk Pin */}
            <button
              type="button"
              onClick={() => handleBulkPin(true)}
              className="p-1.5 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/15 transition-all"
              title="Pin to top of library"
            >
              <Pin className="w-3.5 h-3.5" />
            </button>

            {/* Bulk Delete */}
            <button
              type="button"
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-400/40 font-semibold transition-all"
              title="Delete or schedule deletion"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete ({selectedSongIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div className="p-3.5 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 text-xs flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-cyan-400 hover:text-white underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* 4. MAIN ENHANCED SONG TABLE LIST VIEW */}
      <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-white/10 space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="flex items-center gap-2 font-semibold text-white hover:text-cyan-400 transition-colors"
            >
              {selectedSongIds.length === filteredSongs.length && filteredSongs.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-cyan-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-500" />
              )}
              <span>Select All Displayed ({filteredSongs.length})</span>
            </button>
          </div>

          <span>
            Displaying <strong className="text-white">{filteredSongs.length}</strong> of {allSongs.length} songs
          </span>
        </div>

        {filteredSongs.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400 space-y-2">
            <Search className="w-8 h-8 text-slate-600 mx-auto" />
            <h4 className="font-bold text-white">No tracks match your current filter</h4>
            <p>Try searching for a different keyword or resetting your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="pb-3 pl-2 w-8">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="pb-3">Track Info</th>
                  <th className="pb-3">Genre</th>
                  <th className="pb-3">Tags & Auto-Tags</th>
                  <th className="pb-3 text-center">Visibility</th>
                  <th className="pb-3 text-center">Spotlight</th>
                  <th className="pb-3 text-center">Listens</th>
                  <th className="pb-3 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredSongs.map((song) => {
                  const isChecked = selectedSongIds.includes(song.id);
                  const isTrackCurrent = currentSong?.id === song.id;
                  const isTrackPlaying = isTrackCurrent && isPlaying;

                  // Visibility status
                  const isHiddenAll = song.hiddenFrom?.includes('all');
                  const hiddenUsersCount = song.hiddenFrom ? song.hiddenFrom.filter((id) => id !== 'all').length : 0;
                  const isHiddenSpecific = hiddenUsersCount > 0;

                  const isScheduled = !!song.isScheduledForDeletion;

                  return (
                    <tr
                      key={song.id}
                      className={`hover:bg-white/[0.03] transition-colors ${
                        isChecked ? 'bg-cyan-500/[0.05]' : ''
                      } ${isScheduled ? 'bg-rose-950/25 border-l-4 border-rose-500' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 pl-2">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectSong(song.id)}
                          className="text-slate-400 hover:text-cyan-400 transition-colors"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-cyan-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* Track Info */}
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-white/10 shadow-sm group">
                            <MediaCover
                              src={song.coverUrl}
                              alt={song.title}
                              fallbackTitle={song.title}
                              fallbackGenre={song.genre}
                              className="w-full h-full object-cover"
                            />
                            <button
                              onClick={() => {
                                if (isTrackCurrent) togglePlay();
                                else playSong(song);
                              }}
                              className="absolute inset-0 bg-slate-950/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {isTrackPlaying ? (
                                <Pause className="w-4 h-4 text-cyan-300 fill-current" />
                              ) : (
                                <Play className="w-4 h-4 text-cyan-300 fill-current ml-0.5" />
                              )}
                            </button>
                          </div>

                          <div className="min-w-0 max-w-[200px] sm:max-w-xs">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {song.isPinned && <Pin className="w-3 h-3 text-cyan-400 shrink-0" />}
                              <h4 className="font-bold text-white truncate text-xs">{song.title}</h4>
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">{song.artist}</p>

                            {/* Dropping / Leaving / Scheduled countdown pills */}
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {song.isScheduledForDeletion && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-rose-300 font-bold px-1.5 py-0.2 rounded bg-rose-500/20 border border-rose-400/40 animate-pulse">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Scheduled for Deletion
                                </span>
                              )}
                              {song.isDroppingSoon && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 font-semibold px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-400/20">
                                  <Lock className="w-2.5 h-2.5" />
                                  Drop: {song.dropDate ? new Date(song.dropDate).toLocaleDateString() : 'Upcoming'}
                                </span>
                              )}
                              {song.isLimitedEdition && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-rose-300 font-semibold px-1.5 py-0.2 rounded bg-rose-500/10 border border-rose-400/20">
                                  <Clock className="w-2.5 h-2.5" />
                                  Leaving: {song.limitedUntil ? new Date(song.limitedUntil).toLocaleDateString() : 'Soon'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Genre */}
                      <td className="py-3">
                        <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-200 border border-cyan-400/20 font-medium text-[11px]">
                          {song.genre}
                        </span>
                      </td>

                      {/* Tags & Auto-Tags (with inline tag editing) */}
                      <td className="py-3 max-w-[260px]">
                        <div className="flex flex-wrap items-center gap-1">
                          {song.tags &&
                            song.tags.map((tag) => {
                              const isAuto = song.appliedAutoTags?.includes(tag);
                              return (
                                <span
                                  key={tag}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${
                                    isAuto
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                                      : 'bg-white/[0.05] text-slate-300 border-white/10'
                                  }`}
                                >
                                  {isAuto && <Sparkles className="w-2.5 h-2.5 text-emerald-400" />}
                                  <span>#{tag}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSingleTag(song, tag)}
                                    className="text-slate-400 hover:text-rose-400 ml-0.5"
                                    title="Remove tag"
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}

                          {/* Quick inline tag adder */}
                          {addingTagSongId === song.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="tag..."
                                value={inlineTagValue}
                                onChange={(e) => setInlineTagValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddInlineTag(song);
                                  if (e.key === 'Escape') setAddingTagSongId(null);
                                }}
                                autoFocus
                                className="w-16 px-1.5 py-0.5 text-[11px] rounded bg-slate-900 border border-cyan-400 text-white focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddInlineTag(song)}
                                className="text-cyan-400 hover:text-white"
                              >
                                ✓
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAddingTagSongId(song.id);
                                setInlineTagValue('');
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.04] hover:bg-white/[0.1] text-slate-400 hover:text-white border border-dashed border-white/20"
                              title="Add tag"
                            >
                              + tag
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Visibility Status Badge */}
                      <td className="py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setVisibilityModalSongs([song])}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer"
                        >
                          {isHiddenAll ? (
                            <span className="flex items-center gap-1 text-rose-300 bg-rose-500/15 border border-rose-400/30 px-2 py-0.5 rounded-lg">
                              <EyeOff className="w-3 h-3 text-rose-400" />
                              <span>Hidden All</span>
                            </span>
                          ) : isHiddenSpecific ? (
                            <span className="flex items-center gap-1 text-amber-300 bg-amber-500/15 border border-amber-400/30 px-2 py-0.5 rounded-lg">
                              <Users className="w-3 h-3 text-amber-400" />
                              <span>Hidden ({hiddenUsersCount})</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 px-2 py-0.5 rounded-lg">
                              <Eye className="w-3 h-3 text-emerald-400" />
                              <span>Visible</span>
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Spotlight Star Button */}
                      <td className="py-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const nextState = !song.isSpotlight;
                            if (nextState) {
                              setSpotlightNoteSong(song);
                              setSpotlightNoteInput(song.spotlightNote || '');
                            } else {
                              updateSong(song.id, { isSpotlight: false });
                            }
                          }}
                          className={`p-2 rounded-xl border transition-all ${
                            song.isSpotlight
                              ? 'bg-amber-400/20 border-amber-400/40 text-amber-300 shadow-md ring-1 ring-amber-400/30'
                              : 'bg-white/[0.04] border-white/10 text-slate-500 hover:text-white hover:border-white/20'
                          }`}
                          title={song.isSpotlight ? 'Spotlighted (Click to remove/edit)' : 'Add to Spotlight'}
                        >
                          <Star className={`w-4 h-4 ${song.isSpotlight ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                      </td>

                      {/* Listens: All-Time, Weekly & Daily */}
                      <td className="py-3 text-center font-mono text-[11px]">
                        <span className="font-bold text-white block" title="All-time listens">{song.plays || 0}</span>
                        <div className="flex items-center justify-center gap-1.5 text-[9px] mt-0.5 font-sans">
                          {song.weeklyPlays ? (
                            <span className="text-purple-300 font-semibold px-1 rounded bg-purple-500/10" title="Plays this week">
                              {song.weeklyPlays}w
                            </span>
                          ) : null}
                          {song.dailyPlays ? (
                            <span className="text-amber-400 font-semibold px-1 rounded bg-amber-500/10" title="Plays today">
                              +{song.dailyPlays}d
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Row Actions */}
                      <td className="py-3 pr-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isScheduled ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleRestoreSong(song)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold shadow-xs transition-all"
                                title="Restore track back to active library"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                                <span>Restore</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingSong(song)}
                                className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors"
                                title="Permanently delete now"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSingleResetPlays(song)}
                                className="p-1.5 rounded-lg hover:bg-purple-500/20 text-slate-400 hover:text-purple-300 transition-colors"
                                title="Reset listen count to 0 (refreshes Top Hit status)"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingSong(song)}
                                className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-white border border-white/10 transition-colors"
                                title="Edit metadata"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingSong(song)}
                                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                                title="Delete or schedule deletion"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. MODALS & DRAWERS */}

      {/* Granular Visibility Modal */}
      {visibilityModalSongs && (
        <HideFromUsersModal
          isOpen={!!visibilityModalSongs}
          onClose={() => setVisibilityModalSongs(null)}
          targetSongs={visibilityModalSongs}
          allUsers={allUsers}
          onSaveVisibility={async (hiddenFrom) => {
            const songIds = visibilityModalSongs.map((s) => s.id);
            await bulkUpdateSongs(songIds, { hiddenFrom });
            setFeedback(`Updated visibility for ${songIds.length} track(s).`);
            setTimeout(() => setFeedback(null), 3000);
          }}
        />
      )}

      {/* Edit Song Modal */}
      {editingSong && (
        <EditSongModal
          song={editingSong}
          isOpen={!!editingSong}
          onClose={() => setEditingSong(null)}
          availableGenres={allGenres}
        />
      )}

      {/* Bulk Apply Tags Modal */}
      {isBulkTagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md liquid-glass-surface rounded-3xl border border-white/20 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <Tag className="w-4 h-4 text-cyan-400" />
                Bulk Tag {selectedSongIds.length} Songs
              </h3>
              <button onClick={() => setIsBulkTagModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tag Operation Mode</label>
                <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/10 text-center font-semibold">
                  <button
                    type="button"
                    onClick={() => setBulkTagMode('add')}
                    className={`py-1.5 rounded-lg transition-all ${
                      bulkTagMode === 'add' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400'
                    }`}
                  >
                    Add Tags
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkTagMode('remove')}
                    className={`py-1.5 rounded-lg transition-all ${
                      bulkTagMode === 'remove' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-400'
                    }`}
                  >
                    Remove Tags
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkTagMode('set')}
                    className={`py-1.5 rounded-lg transition-all ${
                      bulkTagMode === 'set' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400'
                    }`}
                  >
                    Overwrite All
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Tag Names (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. leaving soon, top hit, chill study"
                  value={bulkTagInput}
                  onChange={(e) => setBulkTagInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Preset Quick Buttons */}
              <div>
                <span className="block text-[11px] text-slate-400 mb-1.5">Click to insert preset tags:</span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_TAGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        const existing = bulkTagInput.split(',').map((s) => s.trim()).filter(Boolean);
                        if (!existing.includes(t)) {
                          setBulkTagInput(existing.length > 0 ? `${bulkTagInput}, ${t}` : t);
                        }
                      }}
                      className="px-2 py-0.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-cyan-200 border border-white/10"
                    >
                      +{t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsBulkTagModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/[0.05] text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBulkTags}
                className="px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold shadow-lg"
              >
                Apply to {selectedSongIds.length} Songs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Genre Change Modal */}
      {isBulkGenreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-sm liquid-glass-surface rounded-3xl border border-white/20 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white font-display">Change Genre in Bulk</h3>
              <button onClick={() => setIsBulkGenreModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Set a new genre for all <strong>{selectedSongIds.length}</strong> selected songs:
              </p>
              <input
                type="text"
                value={bulkGenreInput}
                onChange={(e) => setBulkGenreInput(e.target.value)}
                placeholder="Genre name (e.g. Ambient, Lo-Fi, Piano)"
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
              />

              <div className="flex flex-wrap gap-1.5 pt-1">
                {allGenres.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setBulkGenreInput(g)}
                    className="px-2 py-0.5 rounded bg-white/[0.06] text-slate-300 text-[11px]"
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button onClick={() => setIsBulkGenreModalOpen(false)} className="px-4 py-2 rounded-xl text-slate-400">
                Cancel
              </button>
              <button
                onClick={handleApplyBulkGenre}
                className="px-5 py-2 rounded-xl bg-cyan-400 text-slate-950 font-bold"
              >
                Apply Genre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Drops / Leaving Schedule Modal */}
      {isBulkScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md liquid-glass-surface rounded-3xl border border-white/20 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white font-display">Schedule Drops or Removals</h3>
              <button onClick={() => setIsBulkScheduleModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/10 text-center font-semibold">
                <button
                  type="button"
                  onClick={() => setScheduleType('drop')}
                  className={`py-1.5 rounded-lg ${scheduleType === 'drop' ? 'bg-amber-400 text-slate-950' : 'text-slate-400'}`}
                >
                  Dropping Soon
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleType('leave')}
                  className={`py-1.5 rounded-lg ${scheduleType === 'leave' ? 'bg-rose-500 text-white' : 'text-slate-400'}`}
                >
                  Leaving Soon
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleType('clear')}
                  className={`py-1.5 rounded-lg ${scheduleType === 'clear' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                >
                  Clear Timers
                </button>
              </div>

              {scheduleType !== 'clear' && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {scheduleType === 'drop' ? 'Release Date & Time' : 'Expiration Date & Time'}
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button onClick={() => setIsBulkScheduleModalOpen(false)} className="px-4 py-2 rounded-xl text-slate-400">
                Cancel
              </button>
              <button
                onClick={handleApplyBulkSchedule}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 font-bold"
              >
                Apply Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spotlight Note Modal for single track */}
      {spotlightNoteSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md liquid-glass-surface rounded-3xl border border-amber-400/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                Add to Spotlight Showcase
              </h3>
              <button onClick={() => setSpotlightNoteSong(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Add <strong>&quot;{spotlightNoteSong.title}&quot;</strong> to the premium Spotlight soundstage.
              </p>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Spotlight Tagline / Curator Note (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Featured masterwork of the week! Recorded live in studio."
                  value={spotlightNoteInput}
                  onChange={(e) => setSpotlightNoteInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button onClick={() => setSpotlightNoteSong(null)} className="px-4 py-2 rounded-xl text-slate-400">
                Cancel
              </button>
              <button
                onClick={async () => {
                  await updateSong(spotlightNoteSong.id, {
                    isSpotlight: true,
                    spotlightNote: spotlightNoteInput.trim() || undefined,
                  });
                  setFeedback(`Added "${spotlightNoteSong.title}" to Spotlight!`);
                  setSpotlightNoteSong(null);
                  setTimeout(() => setFeedback(null), 3000);
                }}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20"
              >
                Confirm Spotlight
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spotlight Master Configuration Modal */}
      {isSpotlightConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg liquid-glass-surface rounded-3xl border border-amber-400/30 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                Spotlight Mode Presentation Settings
              </h3>
              <button onClick={() => setIsSpotlightConfigOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Spotlight Showcase Title
                </label>
                <input
                  type="text"
                  value={spotlightConfig.title}
                  onChange={(e) => updateSpotlightConfig({ title: e.target.value })}
                  placeholder="e.g. 🌟 Exclusive Spotlight Showcase"
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Spotlight Subtitle / Announcement Message
                </label>
                <textarea
                  rows={2}
                  value={spotlightConfig.subtitle}
                  onChange={(e) => updateSpotlightConfig({ subtitle: e.target.value })}
                  placeholder="Subtitle explaining the curated spotlight..."
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Presentation Color Theme
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'gold' as SpotlightTheme, label: 'Gold Amber', color: 'from-amber-400 to-yellow-500' },
                    { id: 'neon-cyan' as SpotlightTheme, label: 'Neon Cyan', color: 'from-cyan-400 to-blue-500' },
                    { id: 'ruby' as SpotlightTheme, label: 'Ruby Glow', color: 'from-rose-500 to-red-600' },
                    { id: 'cosmic-purple' as SpotlightTheme, label: 'Cosmic Purple', color: 'from-violet-500 to-purple-600' },
                  ].map((th) => (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => updateSpotlightConfig({ theme: th.id })}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        spotlightConfig.theme === th.id
                          ? 'border-white bg-white/10 font-bold'
                          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className={`w-full h-3 rounded-full bg-gradient-to-r ${th.color} mb-1.5`} />
                      <span className="text-[11px]">{th.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsSpotlightConfigOpen(false)}
                className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-md"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. SAFE DELETION MODAL (Single Track) */}
      {deletingSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md liquid-glass-surface rounded-3xl border border-rose-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-500" />
                Remove Song from Library
              </h3>
              <button onClick={() => setDeletingSong(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                How would you like to handle <strong className="text-white">&quot;{deletingSong.title}&quot;</strong>?
              </p>

              {/* Option 1: Safe Deletion (Schedule for Deletion) */}
              <div
                onClick={() => handleScheduleSongDeletion(deletingSong)}
                className="p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-cyan-400/30 cursor-pointer transition-all space-y-1 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-cyan-300">
                    <ShieldAlert className="w-4 h-4 text-cyan-400" />
                    <span>Safe Deletion: Schedule for Deletion (Recommended)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-400/20 text-cyan-200 font-bold">Safe</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Immediately hides the song from all listeners, feeds, search, and queues. Keeps the song safely stored in the Admin Panel under &quot;Scheduled for Deletion&quot; so you can restore it anytime with one click.
                </p>
              </div>

              {/* Option 2: Permanent Purge */}
              <div
                onClick={() => handlePermanentDeleteSong(deletingSong)}
                className="p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 cursor-pointer transition-all space-y-1 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-rose-300">
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>Permanently Delete Immediately</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-200 font-bold">Permanent</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Completely and irreversibly removes the song audio, metadata, and database records from the system.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setDeletingSong(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. BULK DELETION MODAL */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md liquid-glass-surface rounded-3xl border border-rose-500/30 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-500" />
                Remove {selectedSongIds.length} Songs from Library
              </h3>
              <button onClick={() => setIsBulkDeleteModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Choose how to process the removal of <strong className="text-white">{selectedSongIds.length} selected song(s)</strong>:
              </p>

              {/* Option 1: Safe Bulk Schedule */}
              <div
                onClick={handleBulkScheduleDeletion}
                className="p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-cyan-400/30 cursor-pointer transition-all space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-cyan-300">
                    <ShieldAlert className="w-4 h-4 text-cyan-400" />
                    <span>Safe Deletion: Schedule for Deletion (Recommended)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-400/20 text-cyan-200 font-bold">Safe</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Hides all {selectedSongIds.length} tracks from listeners immediately. Preserved in Admin Panel under &quot;Scheduled for Deletion&quot; for easy restore or later purge.
                </p>
              </div>

              {/* Option 2: Permanent Purge */}
              <div
                onClick={handleBulkPermanentDelete}
                className="p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 cursor-pointer transition-all space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-rose-300">
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>Permanently Purge Now</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-200 font-bold">Permanent</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Irreversibly deletes all {selectedSongIds.length} audio files and records from PostgreSQL and storage.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. COMPREHENSIVE MASS STUDIO EDIT MODAL */}
      {isMassEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in overflow-y-auto">
          <div className="relative w-full max-w-2xl liquid-glass-surface rounded-3xl border border-cyan-400/40 p-5 sm:p-7 shadow-2xl space-y-5 max-h-[92vh] flex flex-col my-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-400/20 text-cyan-300 flex items-center justify-center">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-display">
                    Mass Song Studio Editor
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Batch-apply changes to <strong className="text-cyan-300">{selectedSongIds.length}</strong> selected tracks. Only checked fields will be applied.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMassEditModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form id="mass-edit-form" onSubmit={handleApplyMassEdit} className="overflow-y-auto flex-1 space-y-4 pr-1 text-xs">
              {/* SECTION 1: Genre, Album & Mood */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Album, Genre & Mood</span>
                </h4>

                {/* Album */}
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-semibold">
                    <input
                      type="checkbox"
                      checked={massApplyAlbum}
                      onChange={(e) => setMassApplyAlbum(e.target.checked)}
                      className="rounded border-white/20 bg-slate-900 text-cyan-400"
                    />
                    <span>Set Album / Collection Name</span>
                  </label>
                  {massApplyAlbum && (
                    <input
                      type="text"
                      placeholder="e.g. Midnight Beats, Single, Chill Lounge Vol. 1"
                      value={massAlbum}
                      onChange={(e) => setMassAlbum(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400 mt-1"
                    />
                  )}
                </div>

                {/* Genre */}
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-semibold">
                    <input
                      type="checkbox"
                      checked={massApplyGenre}
                      onChange={(e) => setMassApplyGenre(e.target.checked)}
                      className="rounded border-white/20 bg-slate-900 text-cyan-400"
                    />
                    <span>Set Genre</span>
                  </label>
                  {massApplyGenre && (
                    <div className="space-y-1.5 mt-1">
                      <input
                        type="text"
                        placeholder="e.g. Lo-Fi, Ambient, Classical, Synthwave"
                        value={massGenre}
                        onChange={(e) => setMassGenre(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                      />
                      <div className="flex flex-wrap gap-1">
                        {allGenres.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setMassGenre(g)}
                            className="px-2 py-0.5 rounded text-[10px] bg-white/[0.06] text-slate-300 hover:text-white"
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Type / Mood */}
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-semibold">
                    <input
                      type="checkbox"
                      checked={massApplyTypeMood}
                      onChange={(e) => setMassApplyTypeMood(e.target.checked)}
                      className="rounded border-white/20 bg-slate-900 text-cyan-400"
                    />
                    <span>Set Type / Mood / Vibe</span>
                  </label>
                  {massApplyTypeMood && (
                    <input
                      type="text"
                      placeholder="e.g. Study Focus, Late Night Relaxation, Uplifting Beat"
                      value={massTypeMood}
                      onChange={(e) => setMassTypeMood(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400 mt-1"
                    />
                  )}
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-semibold">
                    <input
                      type="checkbox"
                      checked={massApplyDescription}
                      onChange={(e) => setMassApplyDescription(e.target.checked)}
                      className="rounded border-white/20 bg-slate-900 text-cyan-400"
                    />
                    <span>Set Description / Liner Notes</span>
                  </label>
                  {massApplyDescription && (
                    <textarea
                      rows={2}
                      placeholder="Description applied to all selected tracks..."
                      value={massDescription}
                      onChange={(e) => setMassDescription(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400 mt-1"
                    />
                  )}
                </div>
              </div>

              {/* SECTION 2: Badges & Highlighting */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-white text-xs">
                  <input
                    type="checkbox"
                    checked={massApplyBadge}
                    onChange={(e) => setMassApplyBadge(e.target.checked)}
                    className="rounded border-white/20 bg-slate-900 text-cyan-400"
                  />
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Assign Card Badge Highlight</span>
                </label>

                {massApplyBadge && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Badge Type</label>
                      <select
                        value={massBadgeType || 'none'}
                        onChange={(e) => setMassBadgeType(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                      >
                        <option value="none">None (Remove Badge)</option>
                        <option value="hot">🔥 HOT Track</option>
                        <option value="new">⚡ NEW Release</option>
                        <option value="top">🏆 TOP Hit</option>
                        <option value="admin-pick">⭐ ADMIN PICK</option>
                        <option value="limited">⏳ LIMITED EDITION</option>
                        <option value="custom">💬 Custom Text Badge</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Custom Badge Label / Note</label>
                      <input
                        type="text"
                        placeholder="e.g. VIP ONLY, STUDY ESSENTIAL"
                        value={massBadgeText}
                        onChange={(e) => setMassBadgeText(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: Drops & Automation */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-rose-400" />
                  <span>Drop Scheduling & Limited Editions</span>
                </h4>

                {/* Drop Soon Schedule */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-semibold">
                    <input
                      type="checkbox"
                      checked={massApplyDrop}
                      onChange={(e) => setMassApplyDrop(e.target.checked)}
                      className="rounded border-white/20 bg-slate-900 text-cyan-400"
                    />
                    <span>Configure Teaser Drop Schedule</span>
                  </label>

                  {massApplyDrop && (
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10 space-y-2.5">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs">
                        <input
                          type="checkbox"
                          checked={massDropEnabled}
                          onChange={(e) => setMassDropEnabled(e.target.checked)}
                          className="rounded border-white/20 bg-slate-900 text-amber-400"
                        />
                        <span className="font-bold text-amber-300">Mark as Dropping Soon (Locked teaser mode)</span>
                      </label>

                      {massDropEnabled && (
                        <div className="space-y-2">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Scheduled Drop Date & Time</label>
                            <input
                              type="datetime-local"
                              value={massDropDate}
                              onChange={(e) => setMassDropDate(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-[11px]">
                            <input
                              type="checkbox"
                              checked={massAutoRelease}
                              onChange={(e) => setMassAutoRelease(e.target.checked)}
                              className="rounded border-white/20 bg-slate-900 text-cyan-400"
                            />
                            <span>Auto-Release tracks automatically the instant countdown reaches 0:00</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Limited Edition Schedule */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-semibold">
                    <input
                      type="checkbox"
                      checked={massApplyLimited}
                      onChange={(e) => setMassApplyLimited(e.target.checked)}
                      className="rounded border-white/20 bg-slate-900 text-cyan-400"
                    />
                    <span>Configure Limited Edition / Leaving Schedule</span>
                  </label>

                  {massApplyLimited && (
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10 space-y-2.5">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs">
                        <input
                          type="checkbox"
                          checked={massLimitedEnabled}
                          onChange={(e) => setMassLimitedEnabled(e.target.checked)}
                          className="rounded border-white/20 bg-slate-900 text-rose-400"
                        />
                        <span className="font-bold text-rose-300">Mark as Limited Edition (Leaving soon countdown)</span>
                      </label>

                      {massLimitedEnabled && (
                        <div className="space-y-2">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Removal Date & Time</label>
                            <input
                              type="datetime-local"
                              value={massLimitedDate}
                              onChange={(e) => setMassLimitedDate(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-[11px]">
                            <input
                              type="checkbox"
                              checked={massAutoRemove}
                              onChange={(e) => setMassAutoRemove(e.target.checked)}
                              className="rounded border-white/20 bg-slate-900 text-rose-400"
                            />
                            <span>Auto-schedule deletion when countdown expires (safe hide, review in Admin)</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 4: Tags */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-white text-xs">
                  <input
                    type="checkbox"
                    checked={massApplyTags}
                    onChange={(e) => setMassApplyTags(e.target.checked)}
                    className="rounded border-white/20 bg-slate-900 text-cyan-400"
                  />
                  <Tag className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Batch Tag Operations</span>
                </label>

                {massApplyTags && (
                  <div className="space-y-2.5 pt-1">
                    <div className="flex gap-2 text-xs">
                      {[
                        { id: 'add', label: '+ Add Tags' },
                        { id: 'remove', label: '- Remove Tags' },
                        { id: 'set', label: '↻ Replace All Tags' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMassTagMode(m.id as any)}
                          className={`px-3 py-1 rounded-xl font-bold transition-all ${
                            massTagMode === m.id
                              ? 'bg-cyan-400 text-slate-950 shadow-xs'
                              : 'bg-white/[0.05] text-slate-400 hover:text-white'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      placeholder="e.g. chill, focus, ambient, top-choice"
                      value={massTags}
                      onChange={(e) => setMassTags(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                )}
              </div>

              {/* SECTION 5: Visibility & Play Counts */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Visibility & Play Counters</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Catalog Visibility</label>
                    <select
                      value={massVisibility}
                      onChange={(e) => setMassVisibility(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                    >
                      <option value="keep">Keep Current Visibility</option>
                      <option value="visible">👁️ Visible to All Listeners</option>
                      <option value="hidden_all">🚫 Hide from Everyone</option>
                    </select>
                  </div>

                  <div className="flex items-center">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-semibold p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 w-full">
                      <input
                        type="checkbox"
                        checked={massResetPlays}
                        onChange={(e) => setMassResetPlays(e.target.checked)}
                        className="rounded border-purple-400/40 bg-slate-900 text-purple-500"
                      />
                      <RotateCcw className="w-3.5 h-3.5 text-purple-300" />
                      <span className="text-[11px] text-purple-200">Reset Listen Counters & Top Hit basis to 0</span>
                    </label>
                  </div>
                </div>
              </div>
            </form>

            {/* Sticky Action Footer */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10 shrink-0">
              <span className="text-[11px] text-slate-400">
                Updating <strong className="text-white">{selectedSongIds.length}</strong> track(s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMassEditModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="mass-edit-form"
                  disabled={isSubmittingMassEdit}
                  className="px-6 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 hover:from-cyan-300 hover:to-blue-400 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingMassEdit ? 'Applying Batch Edits...' : 'Apply All Batch Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
