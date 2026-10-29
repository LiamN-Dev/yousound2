import React, { useState, useMemo, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AudioProvider, useAudio } from './context/AudioContext';
import { Header } from './components/Header';
import { PersonalizedBar } from './components/PersonalizedBar';
import { SongCard } from './components/SongCard';
import { PlayerBar } from './components/PlayerBar';
import { VisualizerModal } from './components/VisualizerModal';
import { PlaylistModal } from './components/PlaylistModal';
import { AuthModal } from './components/AuthModal';
import { AccountSettingsModal } from './components/AccountSettingsModal';
import { SongRequestModal } from './components/SongRequestModal';
import { ManualSongUploader } from './components/ManualSongUploader';
import { EditSongModal } from './components/EditSongModal';
import { AdminPanel } from './components/AdminPanel';
import { PlaylistsView } from './components/PlaylistsView';
import { FavoritesView } from './components/FavoritesView';
import { PopupDisplay } from './components/PopupDisplay';
import { MaintenanceScreen } from './components/MaintenanceScreen';
import { LoginGate } from './components/LoginGate';
import { PendingApprovalScreen } from './components/PendingApprovalScreen';
import { SuspendedScreen } from './components/SuspendedScreen';
import { ChatHub } from './components/ChatHub';
import { ChatSideNotification } from './components/ChatSideNotification';
import { FeedbackNotifier } from './components/FeedbackNotifier';
import { TemporaryPasswordModal } from './components/TemporaryPasswordModal';
import { Song } from './types';
import { Music, ListPlus, KeyRound } from 'lucide-react';
import { SpotlightShowcase } from './components/SpotlightShowcase';

const MainAppContent: React.FC = () => {
  const { currentUser, maintenanceState, isAdmin, bannerConfig } = useAuth();
  const { allSongs, adminAllSongs, spotlightConfig } = useAudio();

  const [activeTab, setActiveTab] = useState<'library' | 'playlists' | 'favorites' | 'chat' | 'admin'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSongRequestOpen, setIsSongRequestOpen] = useState(false);
  const [requestInitialMode, setRequestInitialMode] = useState<'song' | 'feature' | 'bug' | 'mine'>('song');
  const [uploaderEditSong, setUploaderEditSong] = useState<Song | null>(null);
  const [playlistSongTarget, setPlaylistSongTarget] = useState<Song | null>(null);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);

  // Dynamic Genres: only genres that are currently assigned to songs in the library
  const dynamicGenres = useMemo(() => {
    const genreSet = new Set<string>();
    allSongs.forEach((song) => {
      if (song.genre && song.genre.trim()) {
        genreSet.add(song.genre.trim());
      }
    });
    const sorted = Array.from(genreSet).sort();
    return ['All', ...sorted];
  }, [allSongs]);

  // Spotlight Songs: specific songs chosen by admin with premium presentation
  const spotlightSongs = useMemo(() => {
    const pool = isAdmin ? adminAllSongs : allSongs;
    return pool
      .filter((s) => s.isSpotlight)
      .sort((a, b) => (a.spotlightOrder ?? 0) - (b.spotlightOrder ?? 0));
  }, [allSongs, adminAllSongs, isAdmin]);

  // The update pop-up can ask the app to open the request window on "My Reports"
  useEffect(() => {
    const open = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode || 'mine';
      setRequestInitialMode(mode);
      setIsSongRequestOpen(true);
    };
    window.addEventListener('yousong:open-requests', open);
    return () => window.removeEventListener('yousong:open-requests', open);
  }, []);

  // If the currently selected genre no longer exists in any song, reset to 'All'
  useEffect(() => {
    if (selectedGenre !== 'All' && !dynamicGenres.includes(selectedGenre)) {
      setSelectedGenre('All');
    }
  }, [dynamicGenres, selectedGenre]);

  // 1. MANDATORY LOGIN GATE: Nobody can view or see the site until they log in!
  if (!currentUser) {
    return <LoginGate />;
  }

  // 1.5. SUSPENSION GATE: If account is suspended and user is not admin, show appeal screen
  if (currentUser.isSuspended && !isAdmin) {
    return <SuspendedScreen />;
  }

  // 2. APPROVAL GATE: Account must be approved before access
  if (!currentUser.isApproved) {
    return <PendingApprovalScreen />;
  }

  // 3. MAINTENANCE MODE: If active AND user is not admin, show maintenance screen
  if (maintenanceState.enabled && !isAdmin) {
    return (
      <>
        <MaintenanceScreen onOpenAdminAuth={() => setIsAuthOpen(true)} />
        <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      </>
    );
  }

  // Filter songs by title, artist, genre, or tags (pinned songs stick to top!)
  const filteredSongs = useMemo(() => {
    return allSongs
      .filter((song) => {
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          song.title.toLowerCase().includes(q) ||
          song.artist.toLowerCase().includes(q) ||
          song.genre.toLowerCase().includes(q) ||
          (song.tags && song.tags.some((t) => t.toLowerCase().includes(q))) ||
          (song.typeMood && song.typeMood.toLowerCase().includes(q));

        const matchesGenre =
          selectedGenre === 'All' || song.genre.toLowerCase() === selectedGenre.toLowerCase();

        return matchesSearch && matchesGenre;
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0;
      });
  }, [allSongs, searchQuery, selectedGenre]);

  const handleOpenPlaylistModal = (song: Song | null) => {
    setPlaylistSongTarget(song);
    setIsPlaylistModalOpen(true);
  };

  return (
    <div className="min-h-screen relative bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 selection:bg-blue-600/30 selection:text-blue-900 dark:selection:text-blue-200 transition-colors">
      {/* Subtle Studio Ambient Lighting in Dark Mode */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 hidden dark:block">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-blue-600/[0.06] rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-20 w-[500px] h-[500px] bg-indigo-600/[0.04] rounded-full blur-[150px]" />
      </div>

      {/* Top Bar with Navigation & Theme Toggle */}
      <div className="relative z-30">
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedGenre={selectedGenre}
          setSelectedGenre={setSelectedGenre}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenAccount={() => setIsAccountOpen(true)}
          onOpenSongRequest={() => setIsSongRequestOpen(true)}
        />
      </div>

      {/* Main View Area */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'library' && (
          <div className="space-y-6 pb-28">
            {spotlightConfig.enabled ? (
              /* When Spotlight is active, ONLY spotlight songs appear and all other bars/things are hidden */
              <SpotlightShowcase
                spotlightSongs={spotlightSongs}
                spotlightConfig={spotlightConfig}
                onOpenPlaylistModal={handleOpenPlaylistModal}
                onOpenAdminSpotlightSettings={() => setActiveTab('admin')}
              />
            ) : (
              <>
                {/* Manual Song Upload Studio */}
                <ManualSongUploader
                  onOpenAuth={() => setIsAuthOpen(true)}
                  onEditSong={(song) => setUploaderEditSong(song)}
                />

                {/* Personalized Bar: "Songs You Might Like" */}
                <PersonalizedBar onOpenPlaylistModal={handleOpenPlaylistModal} />

                {/* Genre Filter Bar & Counter */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 w-fit overflow-x-auto max-w-full">
                    {dynamicGenres.map((g) => (
                      <button
                        key={g}
                        onClick={() => setSelectedGenre(g)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                          selectedGenre.toLowerCase() === g.toLowerCase()
                            ? 'bg-white dark:bg-blue-600/20 text-blue-600 dark:text-blue-300 border border-slate-200 dark:border-blue-500/30 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/[0.03]'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
                    <span>
                      Showing <span className="text-slate-900 dark:text-white font-semibold">{filteredSongs.length}</span> {filteredSongs.length === 1 ? 'track' : 'tracks'}
                    </span>
                    <button
                      onClick={() => setIsSongRequestOpen(true)}
                      className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <ListPlus className="w-3 h-3" />
                      <span>Request a song</span>
                    </button>
                  </div>
                </div>

                {/* Songs Grid */}
                {filteredSongs.length === 0 ? (
                  <div className="py-16 text-center liquid-glass-surface rounded-3xl border border-slate-200 dark:border-white/10 p-8 space-y-3">
                    <Music className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto" />
                    {allSongs.length === 0 ? (
                      <>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                          Your Music Library is Empty
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                          All songs were cleared for your manual uploads. Use the Manual Song Upload Studio above to upload your MP3 files or add audio stream URLs!
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">No Songs Matched Your Search</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                          Try searching with different terms, or request to add this track!
                        </p>
                      </>
                    )}
                    <div className="pt-2">
                      <button
                        onClick={() => setIsSongRequestOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-md"
                      >
                        <ListPlus className="w-4 h-4" />
                        <span>Submit Song Request</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {filteredSongs.map((song) => (
                      <SongCard
                        key={song.id}
                        song={song}
                        onOpenPlaylistModal={handleOpenPlaylistModal}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 2: Playlists */}
        {activeTab === 'playlists' && (
          <PlaylistsView onOpenPlaylistModal={handleOpenPlaylistModal} />
        )}

        {/* Tab 3: Favorites */}
        {activeTab === 'favorites' && (
          <FavoritesView onOpenPlaylistModal={handleOpenPlaylistModal} />
        )}

        {/* Tab 4: Chat & School Messaging */}
        {activeTab === 'chat' && <ChatHub />}

        {/* Tab 5: Admin Panel */}
        {activeTab === 'admin' && isAdmin && <AdminPanel />}
      </main>

      {/* Floating Bottom Player */}
      <PlayerBar />

      {/* 5-Second Side Popup Notification for incoming chats */}
      <ChatSideNotification
        isChatActive={activeTab === 'chat'}
        onOpenChat={() => setActiveTab('chat')}
      />

      {/* Full Screen Visualizer Modal */}
      <VisualizerModal />

      {/* Add To Playlist Modal */}
      <PlaylistModal
        isOpen={isPlaylistModalOpen}
        onClose={() => setIsPlaylistModalOpen(false)}
        songToAdd={playlistSongTarget}
      />

      {/* Auth / Account Request Modal */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />

      {/* Account Settings & Password Modal */}
      <AccountSettingsModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
      />

      {/* User Song Request Modal */}
      <SongRequestModal
        isOpen={isSongRequestOpen}
        initialMode={requestInitialMode}
        onClose={() => {
          setIsSongRequestOpen(false);
          setRequestInitialMode('song');
        }}
      />

      {/* Pop-up when an admin updates one of the person's feature requests / bug reports */}
      <FeedbackNotifier />

      {/* Edit Song Modal from Uploader */}
      {uploaderEditSong && (
        <EditSongModal
          song={uploaderEditSong}
          isOpen={!!uploaderEditSong}
          onClose={() => setUploaderEditSong(null)}
          availableGenres={dynamicGenres}
        />
      )}

      {/* Mandatory Temporary Password Modal with Working Change Form */}
      {currentUser.temporaryPasswordAssigned && (
        <TemporaryPasswordModal />
      )}

      {/* Broadcast Popups Display */}
      <PopupDisplay />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AudioProvider>
          <MainAppContent />
        </AudioProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
