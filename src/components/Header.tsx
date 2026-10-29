import React, { useState, useSyncExternalStore } from 'react';
import { getFeedbackState, subscribeFeedback } from '../services/feedbackNotifications';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { useTheme } from '../context/ThemeContext';
import {
  Music2,
  Shield,
  Search,
  Heart,
  ListMusic,
  Radio,
  ListPlus,
  LogIn,
  LogOut,
  Sun,
  Moon,
  MessageSquare,
  Lock,
  X,
  Volume2,
  Activity,
} from 'lucide-react';

const STATUS_PAGE_URL = 'https://yousound.betteruptime.com/';

interface HeaderProps {
  activeTab: 'library' | 'playlists' | 'favorites' | 'chat' | 'admin';
  setActiveTab: (tab: 'library' | 'playlists' | 'favorites' | 'chat' | 'admin') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedGenre: string;
  setSelectedGenre: (genre: string) => void;
  onOpenAuth: () => void;
  onOpenAccount: () => void;
  onOpenSongRequest: () => void;
}

const getBannerThemeClasses = (themeId?: string) => {
  switch (themeId) {
    case 'emerald-cyber':
      return 'from-emerald-600 via-teal-600 to-cyan-600';
    case 'amber-rose':
      return 'from-amber-600 via-orange-600 to-rose-600';
    case 'sapphire-ice':
      return 'from-blue-600 via-sky-600 to-cyan-500';
    case 'ruby-glow':
      return 'from-rose-600 via-red-600 to-pink-600';
    case 'midnight-mono':
      return 'from-slate-900 via-slate-800 to-indigo-950';
    case 'cyan-violet':
    default:
      return 'from-cyan-600 via-indigo-600 to-violet-600';
  }
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  onOpenAuth,
  onOpenAccount,
  onOpenSongRequest,
}) => {
  const feedbackUnread = useSyncExternalStore(subscribeFeedback, getFeedbackState).unreadCount;
  const { currentUser, isAdmin, bannerConfig, logout, unreadChatCount, markChatsRead } = useAuth();
  const { userFavorites, userPlaylists } = useAudio();
  const { theme, toggleTheme } = useTheme();
  const [showChatBlockedModal, setShowChatBlockedModal] = useState(false);
  const [isRibbonDismissed, setIsRibbonDismissed] = useState(false);

  const handleChatTabClick = () => {
    if (currentUser?.chatBlocked && !isAdmin) {
      setShowChatBlockedModal(true);
      return;
    }
    markChatsRead();
    setActiveTab('chat');
  };

  return (
    <>
      {/* 1. Top Branding Ribbon (if enabled by Admin) */}
      {bannerConfig.enabled && (
        <div
          className={`w-full py-2 px-4 sm:px-8 text-white ${
            bannerConfig.customGradientFrom && bannerConfig.customGradientTo
              ? ''
              : `bg-gradient-to-r ${getBannerThemeClasses(bannerConfig.colorTheme)}`
          } shadow-xs relative overflow-hidden transition-all duration-300 border-b border-white/15`}
          style={
            bannerConfig.customGradientFrom && bannerConfig.customGradientTo
              ? {
                  background: `linear-gradient(to right, ${bannerConfig.customGradientFrom}, ${bannerConfig.customGradientTo})`,
                }
              : undefined
          }
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-md text-white font-extrabold text-[10px] uppercase tracking-wider border border-white/30 shadow-xs">
                {bannerConfig.versionName || 'YouSong'}
              </span>
              <span className="font-bold text-white drop-shadow-xs hidden sm:inline text-xs">
                {bannerConfig.sloganText || 'School Audio Stream Hub'}
              </span>
            </div>

            {currentUser && (
              <span className="text-[11px] font-semibold text-white/90 px-2.5 py-0.5 rounded-md bg-black/20 backdrop-blur-md border border-white/15 shadow-xs shrink-0 hidden md:inline">
                Signed in as <strong className="text-white">@{currentUser.username}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 2. Isolated Announcement Bar (Does NOT distort or displace menu navigation) */}
      {bannerConfig.ribbonEnabled && bannerConfig.ribbonNotice && !isRibbonDismissed && (
        <div className="w-full bg-amber-500/15 dark:bg-amber-950/40 border-b border-amber-500/30 px-3 sm:px-6 py-2 transition-all">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600 dark:bg-amber-400" />
              </span>
              <span className="font-extrabold text-amber-900 dark:text-amber-300 uppercase tracking-wider text-[10px] shrink-0 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                Announcement
              </span>
              <span className="font-medium text-amber-950 dark:text-amber-100 truncate text-xs">
                {bannerConfig.ribbonNotice}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onOpenSongRequest()}
                className="text-[11px] font-bold text-amber-900 dark:text-amber-200 hover:underline shrink-0 hidden sm:inline"
              >
                Request Song →
              </button>
              <button
                onClick={() => setIsRibbonDismissed(true)}
                className="p-1 rounded-md hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 transition-colors"
                title="Dismiss announcement for this session"
                aria-label="Dismiss announcement"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Sticky Header Navigation */}
      <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-[#090d16]/95 border-b border-slate-200 dark:border-white/[0.08] backdrop-blur-xl transition-colors shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Zone 1: Logo & App Brand (Compact & shrink-0) */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setActiveTab('library')}
                className="flex items-center gap-2.5 text-left group"
              >
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600/10 dark:bg-blue-600/20 border border-blue-500/30 flex items-center justify-center transition-all group-hover:scale-105 shadow-xs shrink-0">
                  <Music2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white font-display">
                      YouSong
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20 hidden sm:inline">
                      Hub
                    </span>
                  </div>
                </div>
              </button>
            </div>

            {/* Zone 2: Redesigned Resilient Segmented Tabs (Desktop & Tablet) */}
            <nav className="hidden md:flex items-center justify-center flex-1 min-w-0 px-2">
              <div
                className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-white/10 shadow-inner max-w-full overflow-x-auto"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {/* 1. Library */}
                <button
                  type="button"
                  onClick={() => setActiveTab('library')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-semibold transition-all shrink-0 ${
                    activeTab === 'library'
                      ? 'bg-white dark:bg-blue-600 text-blue-700 dark:text-white shadow-sm border border-slate-200 dark:border-blue-500/50'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5 shrink-0" />
                  <span>Library</span>
                </button>

                {/* 2. Playlists */}
                <button
                  type="button"
                  onClick={() => setActiveTab('playlists')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-semibold transition-all shrink-0 ${
                    activeTab === 'playlists'
                      ? 'bg-white dark:bg-blue-600 text-blue-700 dark:text-white shadow-sm border border-slate-200 dark:border-blue-500/50'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <ListMusic className="w-3.5 h-3.5 shrink-0" />
                  <span>Playlists</span>
                  {userPlaylists.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-white/10 font-bold">
                      {userPlaylists.length}
                    </span>
                  )}
                </button>

                {/* 3. Favorites */}
                <button
                  type="button"
                  onClick={() => setActiveTab('favorites')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-semibold transition-all shrink-0 ${
                    activeTab === 'favorites'
                      ? 'bg-white dark:bg-rose-600 text-rose-600 dark:text-white shadow-sm border border-slate-200 dark:border-rose-500/50'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <Heart className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>Favorites</span>
                  {userFavorites.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold">
                      {userFavorites.length}
                    </span>
                  )}
                </button>

                {/* 4. Chat */}
                <button
                  type="button"
                  onClick={handleChatTabClick}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-semibold transition-all shrink-0 relative ${
                    activeTab === 'chat'
                      ? 'bg-white dark:bg-blue-600 text-blue-700 dark:text-white shadow-sm border border-slate-200 dark:border-blue-500/50'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="relative flex items-center">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    {unreadChatCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                      </span>
                    )}
                  </div>
                  <span>Chat</span>
                </button>

                {/* 5. Request Song Button */}
                <button
                  type="button"
                  onClick={onOpenSongRequest}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-semibold text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-white hover:bg-blue-50 dark:hover:bg-blue-600/15 transition-all shrink-0"
                  title="Request to add a song or feature"
                >
                  <ListPlus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Request</span>
                  {feedbackUnread > 0 && (
                    <span className="min-w-[16px] h-4 px-1 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                      {feedbackUnread}
                    </span>
                  )}
                </button>

                {/* Site status (uptime monitor) */}
                <a
                  href={STATUS_PAGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-semibold text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-white hover:bg-emerald-50 dark:hover:bg-emerald-600/15 transition-all shrink-0"
                  title="Check whether YouSong is up (opens in a new tab)"
                >
                  <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Status</span>
                </a>

                {/* 6. Admin Panel (if admin) */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('admin')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl font-bold transition-all shrink-0 ${
                      activeTab === 'admin'
                        ? 'bg-amber-500 text-slate-950 shadow-sm border border-amber-400'
                        : 'text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-500/10'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 shrink-0" />
                    <span>Admin</span>
                  </button>
                )}
              </div>
            </nav>

            {/* Zone 3: Search, Theme Toggle & User Controls (ALWAYS pinned & shrink-0) */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search tracks, artists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-24 sm:w-36 lg:w-44 pl-8 pr-2.5 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:w-36 sm:focus:w-52 transition-all"
                />
              </div>

              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 shadow-xs transition-colors shrink-0"
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* User Account Chip & Logout */}
              {currentUser ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onOpenAccount}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 transition-all shrink-0"
                    title="Account Settings"
                  >
                    <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                      {currentUser.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="max-w-[70px] sm:max-w-[100px] truncate font-semibold text-xs">
                      {currentUser.username}
                    </span>
                    {isAdmin && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-400/20 font-bold hidden sm:inline shrink-0">
                        Admin
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={logout}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 transition-colors shrink-0"
                    title="Sign Out"
                    aria-label="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all shrink-0"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile Sub-Navigation Bar (Scrollable segmented tabs for mobile screens) */}
          <div className="flex md:hidden items-center justify-start py-2 border-t border-slate-200 dark:border-white/5 gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('library')}
              className={`px-3 py-1.5 text-xs rounded-xl whitespace-nowrap font-semibold shrink-0 transition-colors ${
                activeTab === 'library'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              Library
            </button>
            <button
              onClick={() => setActiveTab('playlists')}
              className={`px-3 py-1.5 text-xs rounded-xl whitespace-nowrap font-semibold shrink-0 transition-colors ${
                activeTab === 'playlists'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              Playlists ({userPlaylists.length})
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`px-3 py-1.5 text-xs rounded-xl whitespace-nowrap font-semibold shrink-0 transition-colors ${
                activeTab === 'favorites'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              Favorites ({userFavorites.length})
            </button>
            <button
              onClick={handleChatTabClick}
              className={`px-3 py-1.5 text-xs rounded-xl whitespace-nowrap font-semibold shrink-0 transition-colors flex items-center gap-1.5 ${
                activeTab === 'chat'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span>Chat</span>
              {unreadChatCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={onOpenSongRequest}
              className="px-3 py-1.5 text-xs rounded-xl whitespace-nowrap font-semibold shrink-0 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-500/30"
            >
              Request Song
              {feedbackUnread > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-bold">
                  {feedbackUnread}
                </span>
              )}
            </button>
            <a
              href={STATUS_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs rounded-xl whitespace-nowrap font-semibold shrink-0 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-600/20 border border-emerald-200 dark:border-emerald-500/30"
            >
              Status
            </a>
            {isAdmin && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-3 py-1.5 text-xs rounded-xl whitespace-nowrap font-bold shrink-0 transition-colors ${
                  activeTab === 'admin'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300'
                }`}
              >
                Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Chat Restriction / Lockout Modal */}
      {showChatBlockedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-rose-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mx-auto shadow-inner">
              <Lock className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Chat Disabled
              </h3>
              <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 p-2.5 rounded-xl">
                Your chat messaging has been disabled by administrator.
              </p>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              An administrator has temporarily or permanently locked your chat privileges across YouSong. If you believe this is in error, please consult an administrator.
            </p>
            <div className="pt-2">
              <button
                onClick={() => setShowChatBlockedModal(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition-all active:scale-95 shadow-md"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
