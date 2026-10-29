import React, { useState, useRef } from 'react';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { SongCard } from './SongCard';
import { Song, Playlist } from '../types';
import { handleImageFallback } from '../utils/artworkHelper';
import { storage } from '../services/storage';
import {
  ListMusic,
  Plus,
  Play,
  Trash2,
  Music,
  ChevronRight,
  ArrowLeft,
  Camera,
  Upload,
  Check,
  X,
  Sparkles,
  ListPlus,
  Search,
} from 'lucide-react';

interface PlaylistsViewProps {
  onOpenPlaylistModal: (song: Song | null) => void;
}

const ALBUM_PRESETS = [
  { name: 'Lo-Fi Study', url: '/src/assets/images/lofi_study_glass_1791054585559.jpg' },
  { name: 'Synthwave Prism', url: '/src/assets/images/synthwave_prism_sound_1791054595636.jpg' },
  { name: 'Chill Turquoise', url: '/src/assets/images/chill_ambient_wave_1791054604455.jpg' },
  { name: 'Sonic Burst', url: '/src/assets/images/electric_energy_liquid_1791054613304.jpg' },
];

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({ onOpenPlaylistModal }) => {
  const {
    userPlaylists,
    allSongs,
    playSong,
    deletePlaylist,
    removeSongFromPlaylist,
    addSongToPlaylist,
    updatePlaylist,
  } = useAudio();
  const { currentUser } = useAuth();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  // Edit Album Photo / Details State
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Manage Songs in Album State
  const [isManageSongsModalOpen, setIsManageSongsModalOpen] = useState(false);
  const [manageSongSearch, setManageSongSearch] = useState('');

  if (!currentUser) {
    return (
      <div className="py-20 text-center">
        <ListMusic className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-white font-display">Sign In to Create Playlists</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Create custom study playlists, save your favorite tracks, and organize your music.
        </p>
      </div>
    );
  }

  const selectedPlaylist = userPlaylists.find((p) => p.id === selectedPlaylistId);
  const playlistSongs = selectedPlaylist
    ? selectedPlaylist.songIds
        .map((id) => allSongs.find((s) => s.id === id))
        .filter((s): s is Song => !!s)
    : [];

  const handlePlayEntirePlaylist = () => {
    if (playlistSongs.length > 0) {
      playSong(playlistSongs[0], playlistSongs.slice(1));
    }
  };

  const handleOpenEditModal = (pl: Playlist) => {
    setEditingPlaylist(pl);
    setEditName(pl.name);
    setEditDesc(pl.description || '');
    setEditCoverUrl(pl.coverUrl || '');
  };

  const handleSaveAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlaylist || !editName.trim()) return;

    await updatePlaylist(editingPlaylist.id, {
      name: editName.trim(),
      description: editDesc.trim(),
      coverUrl: editCoverUrl.trim() || undefined,
    });
    setEditingPlaylist(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const res = await storage.uploadCoverFile(file);
      if (res.success && res.coverUrl) {
        setEditCoverUrl(res.coverUrl);
      }
    } catch (err) {
      console.error('Failed to upload album photo:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="animate-in fade-in pb-24">
      {selectedPlaylist ? (
        /* Single Playlist Detail View */
        <div>
          <button
            onClick={() => setSelectedPlaylistId(null)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to All Playlists
          </button>

          {/* Header Banner */}
          <div className="liquid-glass-surface rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-white/[0.08] mb-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 relative">
            {/* Album Cover with Change Photo Action */}
            <div className="relative group w-36 h-36 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0 shadow-lg">
              {selectedPlaylist.coverUrl ? (
                <img
                  src={selectedPlaylist.coverUrl}
                  alt={selectedPlaylist.name}
                  className="w-full h-full object-cover"
                  onError={(e) => handleImageFallback(e, selectedPlaylist.name, 'Playlist')}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-12 h-12 text-blue-500 dark:text-blue-400" />
                </div>
              )}

              {/* Hover overlay to change album artwork */}
              <button
                type="button"
                onClick={() => handleOpenEditModal(selectedPlaylist)}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-semibold gap-1.5 backdrop-blur-[2px]"
                title="Change Album Artwork"
              >
                <Camera className="w-5 h-5" />
                <span className="text-[11px]">Change Photo</span>
              </button>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <span className="text-[10px] uppercase font-bold tracking-widest text-blue-600 dark:text-blue-400 font-mono">
                Curated Album
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-display mt-1 mb-2">
                {selectedPlaylist.name}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mb-4">
                {selectedPlaylist.description || 'Custom curated music collection.'}
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <button
                  onClick={handlePlayEntirePlaylist}
                  disabled={playlistSongs.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Play All ({playlistSongs.length})
                </button>

                <button
                  onClick={() => handleOpenEditModal(selectedPlaylist)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  <Camera className="w-4 h-4 text-blue-500" />
                  <span>Change Photo & Details</span>
                </button>

                <button
                  onClick={() => setIsManageSongsModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  <ListPlus className="w-4 h-4 text-emerald-500" />
                  <span>Add / Edit Songs in Album</span>
                </button>

                <button
                  onClick={() => {
                    deletePlaylist(selectedPlaylist.id);
                    setSelectedPlaylistId(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 transition-colors"
                  title="Delete Album"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Songs in Playlist */}
          {playlistSongs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              No songs added to this album yet. Browse the library and click the "+" icon on any song!
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {playlistSongs.map((song) => (
                <div key={song.id} className="relative group">
                  <SongCard
                    song={song}
                    onOpenPlaylistModal={() => onOpenPlaylistModal(song)}
                    onCustomPlay={(s) => {
                      const songIndex = playlistSongs.findIndex((item) => item.id === s.id);
                      const queueAfter = songIndex >= 0 ? playlistSongs.slice(songIndex + 1) : [];
                      playSong(s, queueAfter);
                    }}
                  />
                  <button
                    onClick={() => removeSongFromPlaylist(selectedPlaylist.id, song.id)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-sm"
                    title="Remove from album"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Playlists Grid View */
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">Your Albums & Playlists</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Organize tracks with custom photos and automated continuous playback.
              </p>
            </div>

            <button
              onClick={() => onOpenPlaylistModal(null)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              New Album
            </button>
          </div>

          {userPlaylists.length === 0 ? (
            <div className="py-16 text-center liquid-glass-surface rounded-3xl border border-slate-200 dark:border-white/[0.08] p-8">
              <ListMusic className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">No Albums Yet</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto mb-5">
                Create a custom album to organize your favorite songs and give it a custom cover photo.
              </p>
              <button
                onClick={() => onOpenPlaylistModal(null)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-colors"
              >
                Create First Album
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {userPlaylists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  className="group liquid-glass-card rounded-2xl p-4 border border-slate-200 dark:border-white/[0.08] hover:border-blue-500/40 cursor-pointer flex flex-col justify-between transition-all"
                >
                  <div className="flex items-center gap-3.5 mb-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0 relative">
                      {pl.coverUrl ? (
                        <img
                          src={pl.coverUrl}
                          alt={pl.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          onError={(e) => handleImageFallback(e, pl.name, 'Playlist')}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-6 h-6 text-blue-500 dark:text-blue-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 truncate transition-colors">
                        {pl.name}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {pl.songIds.length} {pl.songIds.length === 1 ? 'song' : 'songs'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                    <span className="truncate">{pl.description || 'Personal album'}</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Album Photo & Details Modal */}
      {editingPlaylist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  Edit Album Photo & Info
                </h3>
              </div>
              <button
                onClick={() => setEditingPlaylist(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAlbum} className="space-y-4">
              {/* Photo Preview and Upload */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
                  {editCoverUrl ? (
                    <img src={editCoverUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <Music className="w-6 h-6" />
                    </div>
                  )}
                </div>

                <div className="space-y-2 flex-1">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-600/30 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploading ? 'Uploading...' : 'Upload Image File'}</span>
                  </button>
                  <p className="text-[10px] text-slate-400">PNG, JPG, or GIF from your computer</p>
                </div>
              </div>

              {/* Or enter Image URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Image Web URL
                </label>
                <input
                  type="text"
                  value={editCoverUrl}
                  onChange={(e) => setEditCoverUrl(e.target.value)}
                  placeholder="https://example.com/artwork.jpg"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-mono text-[11px]"
                />
              </div>

              {/* Preset Artwork */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Or Pick a Preset Cover
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {ALBUM_PRESETS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => setEditCoverUrl(preset.url)}
                      className={`relative aspect-square rounded-xl overflow-hidden border transition-all ${
                        editCoverUrl === preset.url
                          ? 'border-blue-600 ring-2 ring-blue-500/40'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                      }`}
                    >
                      <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                      {editCoverUrl === preset.url && (
                        <div className="absolute inset-0 bg-blue-600/40 flex items-center justify-center text-white">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Album Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Album Title *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* Album Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Album Description
                </label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Optional notes or mood"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPlaylist(null)}
                  className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
                >
                  Save Album Photo & Info
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Songs in Album Modal */}
      {isManageSongsModalOpen && selectedPlaylist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ListPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    Manage Songs in Album
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    "{selectedPlaylist.name}" · {selectedPlaylist.songIds.length} tracks included
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsManageSongsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search filter for songs */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search music to add or remove..."
                value={manageSongSearch}
                onChange={(e) => setManageSongSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Song list with Add / Remove toggles */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[260px] max-h-[420px]">
              {allSongs
                .filter((s) => {
                  if (!manageSongSearch.trim()) return true;
                  const query = manageSongSearch.toLowerCase();
                  return (
                    s.title.toLowerCase().includes(query) ||
                    s.artist.toLowerCase().includes(query) ||
                    s.genre.toLowerCase().includes(query)
                  );
                })
                .map((s) => {
                  const isInPlaylist = selectedPlaylist.songIds.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/80 gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={s.coverUrl}
                          alt={s.title}
                          className="w-10 h-10 rounded-xl object-cover shrink-0"
                          onError={(e) => handleImageFallback(e, s.title, s.genre)}
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {s.title}
                          </h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {s.artist} · {s.genre}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (isInPlaylist) {
                            removeSongFromPlaylist(selectedPlaylist.id, s.id);
                          } else {
                            addSongToPlaylist(selectedPlaylist.id, s.id);
                          }
                        }}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 shrink-0 ${
                          isInPlaylist
                            ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                        }`}
                      >
                        {isInPlaylist ? (
                          <>
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsManageSongsModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
