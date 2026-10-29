import React, { useState } from 'react';
import { User, Song } from '../types';
import { Eye, EyeOff, Users, Check, X, Shield, Search } from 'lucide-react';

interface HideFromUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetSongs: Song[];
  allUsers: User[];
  onSaveVisibility: (hiddenFrom: string[]) => void;
}

export const HideFromUsersModal: React.FC<HideFromUsersModalProps> = ({
  isOpen,
  onClose,
  targetSongs,
  allUsers,
  onSaveVisibility,
}) => {
  if (!isOpen) return null;

  // Determine initial state from target songs
  const firstSong = targetSongs[0];
  const initialHiddenFrom = firstSong?.hiddenFrom || [];
  const initialIsAll = initialHiddenFrom.includes('all');

  const [hideMode, setHideMode] = useState<'visible' | 'all' | 'specific'>(
    initialIsAll ? 'all' : initialHiddenFrom.length > 0 ? 'specific' : 'visible'
  );

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    initialHiddenFrom.filter((id) => id !== 'all')
  );

  const [searchUser, setSearchUser] = useState('');

  // Exclude primary admin from hide target list
  const nonAdminUsers = allUsers.filter((u) => u.role !== 'admin');
  const filteredUsers = nonAdminUsers.filter((u) =>
    u.username.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.id.toLowerCase().includes(searchUser.toLowerCase())
  );

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleApply = () => {
    if (hideMode === 'visible') {
      onSaveVisibility([]);
    } else if (hideMode === 'all') {
      onSaveVisibility(['all']);
    } else {
      onSaveVisibility(selectedUserIds);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-lg liquid-glass-surface rounded-3xl border border-white/20 p-6 sm:p-7 shadow-2xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30 flex items-center justify-center">
              <EyeOff className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-display">
                Song Visibility & Access Control
              </h3>
              <p className="text-xs text-slate-400">
                {targetSongs.length === 1
                  ? `Configuring: "${targetSongs[0].title}"`
                  : `Configuring ${targetSongs.length} selected songs`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Visibility Mode Selector */}
        <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-white/[0.04] border border-white/10 text-xs">
          <button
            type="button"
            onClick={() => setHideMode('visible')}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl font-semibold transition-all ${
              hideMode === 'visible'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
            }`}
          >
            <Eye className="w-4 h-4 text-emerald-400" />
            <span>Visible to All</span>
          </button>

          <button
            type="button"
            onClick={() => setHideMode('all')}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl font-semibold transition-all ${
              hideMode === 'all'
                ? 'bg-rose-500/20 text-rose-200 border border-rose-400/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
            }`}
          >
            <EyeOff className="w-4 h-4 text-rose-400" />
            <span>Hide Everyone</span>
          </button>

          <button
            type="button"
            onClick={() => setHideMode('specific')}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl font-semibold transition-all ${
              hideMode === 'specific'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
            }`}
          >
            <Users className="w-4 h-4 text-amber-400" />
            <span>Specific Users</span>
          </button>
        </div>

        {/* Mode Descriptions */}
        {hideMode === 'visible' && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-200 text-xs">
            ✓ This song will be discoverable and playable by all listeners and accounts.
          </div>
        )}

        {hideMode === 'all' && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-rose-200 text-xs">
            🚫 <strong>Hidden from Everyone:</strong> Non-admin users cannot see or search this track in their library. Admins can still view and play it in the Studio.
          </div>
        )}

        {hideMode === 'specific' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/20 text-amber-200 text-xs">
              Select specific listener accounts who should <strong>NOT</strong> see or be able to play this track.
            </div>

            {/* Search filter for users */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search listener accounts..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* User Checklist */}
            <div className="max-h-52 overflow-y-auto divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02] p-1">
              {filteredUsers.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No listener accounts found matching &quot;{searchUser}&quot;.
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const isChecked = selectedUserIds.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      onClick={() => toggleUser(user.id)}
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${isChecked ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">{user.username}</h4>
                          <span className="text-[10px] text-slate-400">{user.id}</span>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isChecked ? 'bg-amber-400 border-amber-400 text-slate-950' : 'border-white/20'}`}>
                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>{selectedUserIds.length} user(s) selected to hide from</span>
              {selectedUserIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedUserIds([])}
                  className="text-amber-400 hover:underline"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-slate-300 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-slate-950 text-xs font-bold shadow-lg transition-all active:scale-95"
          >
            Apply Visibility Settings
          </button>
        </div>
      </div>
    </div>
  );
};
