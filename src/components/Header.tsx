import React, { useState, useSyncExternalStore } from 'react';
import {
  Activity, Gamepad2, Heart, Headphones, ListMusic, LogIn, LogOut,
  MessageSquare, Moon, Music2, Plus, Search, Shield, Sun, X
} from 'lucide-react';
import { getFeedbackState, subscribeFeedback } from '../services/feedbackNotifications';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { useTheme } from '../context/ThemeContext';

type TabId = 'library' | 'radio' | 'playlists' | 'favorites' | 'chat' | 'status' | 'games' | 'admin';
interface HeaderProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedGenre: string;
  setSelectedGenre: (genre: string) => void;
  onOpenAuth: () => void;
  onOpenAccount: () => void;
  onOpenSongRequest: () => void;
  onSearchSubmit: () => void;
}

const bannerTheme = (themeId?: string) => {
  switch (themeId) {
    case 'emerald-cyber': return 'from-emerald-600 via-teal-600 to-cyan-600';
    case 'amber-rose': return 'from-amber-600 via-orange-600 to-rose-600';
    case 'sapphire-ice': return 'from-blue-600 via-sky-600 to-cyan-500';
    case 'ruby-glow': return 'from-rose-600 via-red-600 to-pink-600';
    case 'midnight-mono': return 'from-slate-900 via-slate-800 to-indigo-950';
    default: return 'from-cyan-600 via-indigo-600 to-violet-600';
  }
};

const navItems = [
  { id: 'library' as const, label: 'Discover', icon: Music2, note: 'YOUR LIBRARY' },
  { id: 'radio' as const, label: 'Live Radio', icon: Headphones, note: 'LIVE SIGNAL' },
  { id: 'playlists' as const, label: 'Playlists', icon: ListMusic, note: 'YOUR MIXES' },
  { id: 'favorites' as const, label: 'Favorites', icon: Heart, note: 'SAVED TRACKS' },
  { id: 'chat' as const, label: 'Chat', icon: MessageSquare, note: 'CHAT' },
  { id: 'status' as const, label: 'System Status', icon: Activity, note: 'NETWORK' },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab, setActiveTab, searchQuery, setSearchQuery,
  onOpenAuth, onOpenAccount, onOpenSongRequest, onSearchSubmit,
}) => {
  const feedbackUnread = useSyncExternalStore(subscribeFeedback, getFeedbackState).unreadCount;
  const { currentUser, isAdmin, maintenanceState, bannerConfig, logout, unreadChatCount, markChatsRead } = useAuth();
  const { userFavorites, userPlaylists, spotlightConfig } = useAudio();
  const { theme, toggleTheme } = useTheme();
  const [showChatBlockedModal, setShowChatBlockedModal] = useState(false);
  const [isRibbonDismissed, setIsRibbonDismissed] = useState(false);

  const spotlightLocked = spotlightConfig.enabled && !isAdmin;

  const handleChatTabClick = () => {
    if (currentUser?.chatBlocked && !isAdmin) {
      setShowChatBlockedModal(true);
      return;
    }
    markChatsRead();
    setActiveTab('chat');
  };

  const visibleItems = [
    ...navItems,
    ...((isAdmin || currentUser?.gamesEnabled)
      ? [{ id: 'games' as const, label: 'Arcade', icon: Gamepad2, note: 'GAME ZONE' }]
      : []),
    ...(isAdmin
      ? [{ id: 'admin' as const, label: 'Control Room', icon: Shield, note: 'ADMIN ACCESS' }]
      : []),
  ];

  const activate = (id: TabId) => {
    if ((id === 'playlists' || id === 'favorites') && spotlightLocked) return;
    if (id === 'chat') {
      handleChatTabClick();
      return;
    }
    setActiveTab(id);
  };

  const unreadLabel = unreadChatCount > 9 ? '9+' : String(unreadChatCount);
  const requestLabel = feedbackUnread > 9 ? '9+' : String(feedbackUnread);

  const navButton = (item: typeof visibleItems[number], mobile = false) => {
    const Icon = item.icon;
    const active = activeTab === item.id;
    const locked = (item.id === 'playlists' || item.id === 'favorites') && spotlightLocked;
    const badge = item.id === 'chat' && unreadChatCount > 0
      ? unreadLabel
      : item.id === 'playlists' && userPlaylists.length > 0
        ? String(userPlaylists.length)
        : item.id === 'favorites' && userFavorites.length > 0
          ? String(userFavorites.length)
          : null;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => activate(item.id)}
        disabled={locked}
        title={locked ? item.label + ' are locked during Spotlight mode' : item.label}
        aria-current={active ? 'page' : undefined}
        data-active={active ? 'true' : 'false'}
        className={mobile ? 'ys-mobile-nav-item' : 'ys-sidebar-item'}
      >
        <span className="ys-nav-icon-wrap">
          <Icon className="ys-nav-icon" />
          {badge && <span className="ys-nav-badge">{badge}</span>}
          {locked && <span className="ys-nav-lock">×</span>}
        </span>
        <span className="ys-nav-label">{item.label}</span>
        {!mobile && <span className="ys-nav-note">{item.note}</span>}
        {!mobile && active && <span className="ys-nav-active-rail" />}
      </button>
    );
  };

  return (
    <div className="ys-navigation-system">
      {bannerConfig.enabled && (
        <div
          className={'ys-brand-ribbon ' + (bannerConfig.customGradientFrom && bannerConfig.customGradientTo ? '' : 'bg-gradient-to-r ' + bannerTheme(bannerConfig.colorTheme))}
          style={bannerConfig.customGradientFrom && bannerConfig.customGradientTo
            ? { background: 'linear-gradient(90deg, ' + bannerConfig.customGradientFrom + ', ' + bannerConfig.customGradientTo + ')' }
            : undefined}
        >
          <div className="ys-brand-ribbon-inner">
            <div className="flex min-w-0 items-center gap-3">
              {bannerConfig.versionName?.trim() && <span className="ys-ribbon-version">{bannerConfig.versionName.trim()}</span>}
              {bannerConfig.sloganText?.trim() && <span className="hidden truncate sm:inline">{bannerConfig.sloganText.trim()}</span>}
            </div>
            {currentUser && <span className="ys-ribbon-user">SIGNED IN · @{currentUser.username}</span>}
          </div>
        </div>
      )}

      {bannerConfig.ribbonEnabled && bannerConfig.ribbonNotice && !isRibbonDismissed && (
        <div className="ys-transmission-banner">
          <div className="ys-transmission-inner">
            <span className="ys-transmission-dot" />
            <span className="ys-transmission-label">TRANSMISSION</span>
            <span className="min-w-0 flex-1 truncate">{bannerConfig.ribbonNotice}</span>
            <button type="button" onClick={() => setIsRibbonDismissed(true)} aria-label="Dismiss announcement"><X size={15} /></button>
          </div>
        </div>
      )}

      <header className="ys-commandbar">
        <div className="ys-commandbar-inner">
          <button type="button" className="ys-brand-lockup" onClick={() => setActiveTab('library')} aria-label="YouSound home">
            <span className="ys-brand-symbol"><Music2 size={22} /></span>
            <span className="ys-brand-words">
              <span className="ys-brand-name">YOUSOUND<span>®</span></span>
              <span className="ys-brand-subtitle">PERSONAL AUDIO NETWORK</span>
            </span>
          </button>

          <div className="ys-global-search">
            <Search size={16} />
            <input
              type="search"
              value={searchQuery}
              onChange={event => { setSearchQuery(event.target.value); if (activeTab !== 'library') setActiveTab('library'); }}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onSearchSubmit(); } }}
              placeholder="Search tracks, artists, genres..."
              aria-label="Search the music library"
            />
            <kbd>⌘ K</kbd>
          </div>

          <div className="ys-command-actions">
            <button type="button" className="ys-command-request" onClick={onOpenSongRequest}>
              <Plus size={15} /><span>Request</span>
              {feedbackUnread > 0 && <span className="ys-command-count">{requestLabel}</span>}
            </button>
            <button type="button" className="ys-command-icon" onClick={toggleTheme} title={'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme'} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {currentUser ? (
              <>
                <button type="button" className="ys-account-button" onClick={onOpenAccount} title="Account settings">
                  <span className="ys-account-avatar">{currentUser.username.charAt(0).toUpperCase()}</span>
                  <span className="ys-account-copy"><span>{currentUser.username}</span><small>{isAdmin ? 'SYSTEM ADMIN' : 'LISTENER ACCOUNT'}</small></span>
                </button>
                <button type="button" className="ys-command-icon ys-logout-button" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
              </>
            ) : (
              <button type="button" className="ys-command-signin" onClick={onOpenAuth}><LogIn size={15} /> Sign in</button>
            )}
          </div>
        </div>
      </header>

      <aside className="ys-cosmic-sidebar" aria-label="Main navigation">
        <div className="ys-sidebar-topline"><span className="ys-sidebar-led" /> NAVIGATION</div>
        <nav className="ys-sidebar-nav">
          {visibleItems.map(item => navButton(item))}
        </nav>
        <div className="ys-sidebar-bottom">
          <span className="ys-sidebar-status"><i /> SYSTEM ONLINE</span>
          <span className="ys-sidebar-version">YS / 02.6</span>
        </div>
      </aside>

      <nav className="ys-mobile-nav" aria-label="Mobile navigation">
        {visibleItems.map(item => navButton(item, true))}
        <button type="button" className="ys-mobile-nav-item" onClick={onOpenSongRequest}>
          <span className="ys-nav-icon-wrap"><Plus className="ys-nav-icon" />{feedbackUnread > 0 && <span className="ys-nav-badge">{requestLabel}</span>}</span>
          <span className="ys-nav-label">Request</span>
        </button>
      </nav>

      {showChatBlockedModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-rose-300/20 bg-[#07171a] p-6 text-center text-white shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-400/10 text-rose-300"><MessageSquare size={25} /></div>
            <h3 className="mt-4 text-lg font-bold">Chat access disabled</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">An administrator has disabled chat messaging for this account. Please contact an administrator if you think this is a mistake.</p>
            <button type="button" onClick={() => setShowChatBlockedModal(false)} className="mt-5 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15">Understood</button>
          </div>
        </div>
      )}
    </div>
  );
};
