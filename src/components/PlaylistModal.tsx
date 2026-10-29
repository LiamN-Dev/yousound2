import React, { useState } from 'react';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { Playlist, Song } from '../types';
import { X, Plus, Music, Check, ListMusic } from 'lucide-react';

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  songToAdd?: Song | null;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({ isOpen, onClose, songToAdd }) => {
  const { userPlaylists, createPlaylist, addSongToPlaylist, removeSongFromPlaylist } = useAudio();
  const { currentUser } = useAuth();
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const pl = await createPlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
    if (songToAdd) {
      addSongToPlaylist(pl.id, songToAdd.id);
    }
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setIsCreating(false);
  };

  const toggleSongInPlaylist = (playlist: Playlist) => {
    if (!songToAdd) return;
    if (playlist.songIds.includes(songToAdd.id)) {
      removeSongFromPlaylist(playlist.id, songToAdd.id);
    } else {
      addSongToPlaylist(playlist.id, songToAdd.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-blue-600/20 border border-blue-500/20 dark:border-blue-500/30 flex items-center justify-center">
              <ListMusic className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                {songToAdd ? 'Add to Playlist' : 'Your Playlists'}
              </h3>
              {songToAdd && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                  Adding "{songToAdd.title}"
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Existing Playlists List */}
        <div className="my-4 max-h-56 overflow-y-auto space-y-2 pr-1">
          {userPlaylists.length === 0 && !isCreating ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              You haven't created any playlists yet. Click below to create your first study playlist!
            </div>
          ) : (
            userPlaylists.map((pl) => {
              const containsSong = songToAdd ? pl.songIds.includes(songToAdd.id) : false;
              return (
                <div
                  key={pl.id}
                  onClick={() => songToAdd && toggleSongInPlaylist(pl)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    songToAdd ? 'cursor-pointer' : ''
                  } ${
                    containsSong
                      ? 'bg-blue-50 dark:bg-blue-600/15 border-blue-200 dark:border-blue-500/40 text-blue-900 dark:text-blue-200'
                      : 'bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                      {pl.coverUrl ? (
                        <img src={pl.coverUrl} alt={pl.name} className="w-full h-full object-cover" />
                      ) : (
                        <Music className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate text-slate-900 dark:text-white">{pl.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {pl.songIds.length} {pl.songIds.length === 1 ? 'song' : 'songs'}
                        {pl.description ? ` · ${pl.description}` : ''}
                      </div>
                    </div>
                  </div>

                  {songToAdd && (
                    <div
                      className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        containsSong
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'border-slate-300 dark:border-slate-600 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Create New Playlist Section */}
        {isCreating ? (
          <form onSubmit={handleCreate} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider font-display">
              New Playlist Details
            </h4>
            <input
              type="text"
              placeholder="Playlist Name (e.g. AP Chem Study Jam)"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newPlaylistDesc}
              onChange={(e) => setNewPlaylistDesc(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md transition-colors"
              >
                Create Playlist
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-blue-600 dark:text-blue-300 flex items-center justify-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            Create New Playlist
          </button>
        )}
      </div>
    </div>
  );
};
