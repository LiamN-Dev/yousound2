import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { storage } from '../services/storage';
import { generateToneWavUrl } from '../utils/audioGenerator';
import { Song, User, PopupType, BannerColorTheme, SongRequest, SongBadgeType } from '../types';
import { handleImageFallback } from '../utils/artworkHelper';
import { EditSongModal } from './EditSongModal';
import { AdminSongManager } from './AdminSongManager';
import { AdminAutoTagRules } from './AdminAutoTagRules';
import { AdminPipelineManager } from './AdminPipelineManager';
import { AdminFeedbackManager } from './AdminFeedbackManager';
import { AdminDatabaseWarning } from './AdminDatabaseWarning';
import { ManualSongUploader } from './ManualSongUploader';
import { AdminDatabaseManager } from './AdminDatabaseManager';
import {
  Shield,
  Music,
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  AlertCircle,
  Megaphone,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  Sparkles,
  Link as LinkIcon,
  Upload,
  Cpu,
  KeyRound,
  Send,
  Play,
  Clock,
  ListPlus,
  ExternalLink,
  Tag,
  Palette,
  FileAudio,
  Cloud,
  DownloadCloud,
  Wand2,
  FolderOpen,
  Ban,
  MessageSquare,
  Headphones,
  Pin,
  Flame,
  ShieldAlert,
  Zap,
  Database,
} from 'lucide-react';

const COVER_PRESETS = [
  { name: 'Turquoise Ripples', url: '/src/assets/images/chill_ambient_wave_1791054604455.jpg' },
  { name: 'Study Desk Glass', url: '/src/assets/images/lofi_study_glass_1791054585559.jpg' },
  { name: 'Synthwave Prism', url: '/src/assets/images/synthwave_prism_sound_1791054595636.jpg' },
  { name: 'Electric Pulse', url: '/src/assets/images/electric_energy_liquid_1791054613304.jpg' },
];

export const AdminPanel: React.FC = () => {
  const {
    currentUser,
    logout,
    allUsers,
    approveAccount,
    rejectAccount,
    adminUpdateUser,
    adminDeleteUser,
    maintenanceState,
    setMaintenance,
    bannerConfig,
    updateBannerConfig,
    songRequests,
    updateSongRequestStatus,
    deleteSongRequest,
    allPopups,
    createBroadcastPopup,
    deletePopup,
  } = useAuth();

  const { allSongs, adminAllSongs, addNewSong, deleteSong, updateSong, playSong, clearAllSongs, autoTagRules } = useAudio();

  const [adminTab, setAdminTab] = useState<
    'songs' | 'autotags' | 'requests' | 'feedback' | 'banner' | 'approvals' | 'users' | 'maintenance' | 'popups' | 'database'
  >('songs');

  // Song Studio State
  const [uploadMode, setUploadMode] = useState<'gdrive' | 'upload' | 'url' | 'synth'>('gdrive');
  const [adminGdriveUrl, setAdminGdriveUrl] = useState('');
  const [isAdminPullingDrive, setIsAdminPullingDrive] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newGenre, setNewGenre] = useState('Lo-Fi');
  const [newTags, setNewTags] = useState('study, focus');
  const [newAlbum, setNewAlbum] = useState('Single');
  const [newAudioUrl, setNewAudioUrl] = useState('');
  const [newCoverUrl, setNewCoverUrl] = useState(COVER_PRESETS[0].url);
  const [customCoverUrl, setCustomCoverUrl] = useState('');
  const [coverMode, setCoverMode] = useState<'preset' | 'url' | 'file'>('preset');
  const [newDuration, setNewDuration] = useState(0);
  const [songFeedback, setSongFeedback] = useState<string | null>(null);

  // Edit Song Modal State
  const [editingSong, setEditingSong] = useState<Song | null>(null);

  // Edit User State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editTempPassword, setEditTempPassword] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editDailyListenLimit, setEditDailyListenLimit] = useState('');
  const [editChatBlocked, setEditChatBlocked] = useState(false);
  const [editIsSuspended, setEditIsSuspended] = useState(false);
  const [editSuspendedReason, setEditSuspendedReason] = useState('');
  const [userEditFeedback, setUserEditFeedback] = useState<string | null>(null);

  // Maintenance State with Countdown
  const [maintEnabled, setMaintEnabled] = useState(maintenanceState.enabled);
  const [maintMessage, setMaintMessage] = useState(maintenanceState.message);
  const [maintHasCountdown, setMaintHasCountdown] = useState(!!maintenanceState.hasCountdown);
  const [maintFinishTime, setMaintFinishTime] = useState(
    maintenanceState.estimatedFinishTime
      ? new Date(maintenanceState.estimatedFinishTime).toISOString().slice(0, 16)
      : ''
  );
  const [maintAutoDisable, setMaintAutoDisable] = useState(!!maintenanceState.autoDisableOnCountdown);
  const [maintFeedback, setMaintFeedback] = useState<string | null>(null);

  // Banner & Branding State
  const [bannerEnabled, setBannerEnabledRaw] = useState(bannerConfig.enabled);
  const [bannerVersion, setBannerVersionRaw] = useState(bannerConfig.versionName);
  const [bannerSlogan, setBannerSloganRaw] = useState(bannerConfig.sloganText);
  const [bannerTheme, setBannerThemeRaw] = useState<BannerColorTheme>(bannerConfig.colorTheme);
  const [customGradientFrom, setCustomGradientFromRaw] = useState(bannerConfig.customGradientFrom || '#06b6d4');
  const [customGradientTo, setCustomGradientToRaw] = useState(bannerConfig.customGradientTo || '#6366f1');
  const [useCustomColors, setUseCustomColorsRaw] = useState(!!(bannerConfig.customGradientFrom && bannerConfig.customGradientTo));
  const [bannerRibbonEnabled, setBannerRibbonEnabledRaw] = useState(bannerConfig.ribbonEnabled);
  const [bannerRibbonNotice, setBannerRibbonNoticeRaw] = useState(bannerConfig.ribbonNotice);
  const [bannerFeedback, setBannerFeedback] = useState<string | null>(null);
  // Typing in the form marks it as being edited, so the background refresh cannot overwrite it
  const bannerDirty = useRef(false);
  const setBannerEnabled = (v: any) => {
    bannerDirty.current = true;
    setBannerEnabledRaw(v);
  };
  const setBannerVersion = (v: any) => {
    bannerDirty.current = true;
    setBannerVersionRaw(v);
  };
  const setBannerSlogan = (v: any) => {
    bannerDirty.current = true;
    setBannerSloganRaw(v);
  };
  const setBannerTheme = (v: any) => {
    bannerDirty.current = true;
    setBannerThemeRaw(v);
  };
  const setCustomGradientFrom = (v: any) => {
    bannerDirty.current = true;
    setCustomGradientFromRaw(v);
  };
  const setCustomGradientTo = (v: any) => {
    bannerDirty.current = true;
    setCustomGradientToRaw(v);
  };
  const setUseCustomColors = (v: any) => {
    bannerDirty.current = true;
    setUseCustomColorsRaw(v);
  };
  const setBannerRibbonEnabled = (v: any) => {
    bannerDirty.current = true;
    setBannerRibbonEnabledRaw(v);
  };
  const setBannerRibbonNotice = (v: any) => {
    bannerDirty.current = true;
    setBannerRibbonNoticeRaw(v);
  };

  // Load the saved banner into the form. This only happens when the saved banner really changed,
  // and never while you are in the middle of editing (it used to reset your text every few seconds).
  const bannerSignature = JSON.stringify(bannerConfig);
  useEffect(() => {
    if (bannerDirty.current) return;
    setBannerEnabledRaw(bannerConfig.enabled);
    setBannerVersionRaw(bannerConfig.versionName);
    setBannerSloganRaw(bannerConfig.sloganText);
    setBannerThemeRaw(bannerConfig.colorTheme);
    setCustomGradientFromRaw(bannerConfig.customGradientFrom || '#06b6d4');
    setCustomGradientToRaw(bannerConfig.customGradientTo || '#6366f1');
    setUseCustomColorsRaw(!!(bannerConfig.customGradientFrom && bannerConfig.customGradientTo));
    setBannerRibbonEnabledRaw(bannerConfig.ribbonEnabled);
    setBannerRibbonNoticeRaw(bannerConfig.ribbonNotice);
  }, [bannerSignature]);

  // Popups State
  const [popupTarget, setPopupTarget] = useState<'all' | string>('all');
  const [popupTitle, setPopupTitle] = useState('');
  const [popupMessage, setPopupMessage] = useState('');
  const [popupType, setPopupType] = useState<PopupType>('announcement');
  const [popupDuration, setPopupDuration] = useState<number>(15); // default 15 minutes
  const [popupIsDismissible, setPopupIsDismissible] = useState<boolean>(true);
  const [popupFeedback, setPopupFeedback] = useState<string | null>(null);

  // Denial Feedback Modals State
  const [decliningSongReq, setDecliningSongReq] = useState<SongRequest | null>(null);
  const [songDeclineReason, setSongDeclineReason] = useState('');
  const [decliningUserReq, setDecliningUserReq] = useState<User | null>(null);
  const [userDeclineReason, setUserDeclineReason] = useState('');

  // User Suspension & Deletion Modals State
  const [suspendingUser, setSuspendingUser] = useState<User | null>(null);
  const [suspendReasonInput, setSuspendReasonInput] = useState('Terms of service violation');
  const [unsuspendingUser, setUnsuspendingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [requestTabFilter, setRequestTabFilter] = useState<'all' | 'song' | 'feature'>('all');

  const pendingUsers = allUsers.filter((u) => !u.isApproved);
  const approvedUsers = allUsers.filter((u) => u.isApproved);
  const pendingRequests = songRequests.filter((r) => r.status === 'pending');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic Genres calculation
  const activeGenres = Array.from(new Set(allSongs.map((s) => s.genre).filter(Boolean))).sort();

  // Process MP3 / Audio file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    setNewTitle(cleanTitle);
    if (!newArtist) setNewArtist('Admin Upload');

    // Auto-detect duration locally
    const tempUrl = URL.createObjectURL(file);
    const audioObj = new Audio(tempUrl);
    audioObj.onloadedmetadata = () => {
      if (audioObj.duration && isFinite(audioObj.duration)) {
        setNewDuration(Math.round(audioObj.duration));
      }
      URL.revokeObjectURL(tempUrl);
    };

    setSongFeedback(`Uploading audio file "${file.name}" to server and saving permanently to database...`);
    try {
      const uploadRes = await storage.uploadAudioFile(file);
      if (uploadRes.success && uploadRes.audioUrl) {
        setNewAudioUrl(uploadRes.audioUrl);
        setSongFeedback(`✓ Uploaded & saved permanently: "${file.name}"! Fill details below and click Publish.`);
      } else {
        setSongFeedback(`❌ Audio upload issue: ${uploadRes.error || 'Server error'}. Please try again or paste a stream URL.`);
      }
    } catch (err: any) {
      setSongFeedback(`❌ Network error uploading audio: ${err.message}. Please try again.`);
    }
  };

  // Custom cover upload
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSongFeedback(`Uploading cover image "${file.name}"...`);
    const uploadRes = await storage.uploadCoverFile(file);
    if (uploadRes.success && uploadRes.coverUrl) {
      setNewCoverUrl(uploadRes.coverUrl);
      setSongFeedback('✓ Custom cover image uploaded and ready!');
    } else {
      setSongFeedback(`Cover upload failed: ${uploadRes.error || 'Server error'}`);
    }
  };

  // Manual Publish Handler
  const handleManualPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newArtist.trim() || !newAudioUrl.trim()) {
      setSongFeedback('Please provide a Song Title, Artist, and load an audio file or URL.');
      return;
    }

    const parsedTags = newTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const published = await addNewSong({
      title: newTitle.trim(),
      artist: newArtist.trim(),
      album: newAlbum.trim() || 'Single',
      genre: newGenre.trim() || 'General',
      tags: parsedTags.length > 0 ? parsedTags : [newGenre.trim().toLowerCase()],
      duration: Number(newDuration) || 180,
      audioUrl: newAudioUrl.trim(),
      coverUrl: newCoverUrl.trim() || COVER_PRESETS[0].url,
      featured: true,
    });

    setSongFeedback(`Successfully published "${published.title}" by ${published.artist} (${published.genre})!`);
    setNewTitle('');
    setNewArtist('');
    setNewAudioUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setSongFeedback(null), 3500);
  };

  // Web Audio Tone Synthesizer
  const handleGenerateSynthTone = (type: 'lofi' | 'synthwave' | 'ambient' | 'chill') => {
    const toneDataUri = generateToneWavUrl(440, 24, type);
    const titleMap = {
      lofi: 'Procedural Rain Study Chords',
      synthwave: 'Liquid Neon Cyber Pulse',
      ambient: 'Crystal Waters Relaxation',
      chill: 'Golden Afternoon Chimes',
    };
    const coverMap = {
      lofi: COVER_PRESETS[1].url,
      synthwave: COVER_PRESETS[2].url,
      ambient: COVER_PRESETS[0].url,
      chill: COVER_PRESETS[3].url,
    };
    const genreMap = {
      lofi: 'Lo-Fi',
      synthwave: 'Synthwave',
      ambient: 'Ambient',
      chill: 'Acoustic',
    };

    addNewSong({
      title: titleMap[type],
      artist: 'YouSong Tone Synthesizer',
      album: 'Procedural Series',
      genre: genreMap[type],
      tags: ['synthesized', genreMap[type].toLowerCase(), 'study'],
      duration: 24,
      audioUrl: toneDataUri,
      coverUrl: coverMap[type],
      featured: true,
    });

    setSongFeedback(`Synthesized and added "${titleMap[type]}" to library!`);
    setTimeout(() => setSongFeedback(null), 3000);
  };

  // Save User Edit
  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setUserEditFeedback(null);

    const res = await adminUpdateUser(editingUser.id, {
      newUsername: editUsername.trim() || undefined,
      newPassword: editTempPassword.trim() || undefined,
      role: editRole,
      dailyListenLimit: editDailyListenLimit.trim() === '' ? null : Number(editDailyListenLimit),
      chatBlocked: editChatBlocked,
      isSuspended: editIsSuspended,
      suspendedReason: editIsSuspended ? (editSuspendedReason.trim() || 'Suspended by Administrator') : '',
    });
    if (res.success) {
      setUserEditFeedback('User updated successfully!');
      setTimeout(() => {
        setEditingUser(null);
        setEditUsername('');
        setEditTempPassword('');
        setEditSuspendedReason('');
        setUserEditFeedback(null);
      }, 1500);
    } else {
      setUserEditFeedback(res.error || 'Failed to update user.');
    }
  };

  const handleToggleUserChat = async (u: User) => {
    await adminUpdateUser(u.id, {
      chatBlocked: !u.chatBlocked,
    });
  };

  const handleOpenSuspendModal = (u: User) => {
    if (!u.isSuspended) {
      setSuspendingUser(u);
      setSuspendReasonInput(u.suspendedReason || 'Terms of service violation');
    } else {
      setUnsuspendingUser(u);
    }
  };

  const handleConfirmSuspend = async () => {
    if (!suspendingUser) return;
    const res = await adminUpdateUser(suspendingUser.id, {
      isSuspended: true,
      suspendedReason: suspendReasonInput.trim() || 'Suspended by Administrator',
    });
    if (res.success) {
      setUserEditFeedback(`Account @${suspendingUser.username} has been suspended.`);
      setTimeout(() => setUserEditFeedback(null), 3000);
    }
    setSuspendingUser(null);
  };

  const handleConfirmUnsuspend = async () => {
    if (!unsuspendingUser) return;
    const res = await adminUpdateUser(unsuspendingUser.id, {
      isSuspended: false,
      suspendedReason: '',
    });
    if (res.success) {
      setUserEditFeedback(`Account @${unsuspendingUser.username} has been unsuspended.`);
      setTimeout(() => setUserEditFeedback(null), 3000);
    }
    setUnsuspendingUser(null);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deletingUser) return;
    const isSelf = deletingUser.id === currentUser?.id;
    await adminDeleteUser(deletingUser.id);
    setDeletingUser(null);
    if (isSelf) {
      logout();
    }
  };

  // Save Maintenance with Countdown & Auto-Trigger
  const handleSaveMaintenance = () => {
    const isoFinishTime =
      maintHasCountdown && maintFinishTime ? new Date(maintFinishTime).toISOString() : null;

    setMaintenance(maintEnabled, maintMessage, maintHasCountdown, isoFinishTime, maintAutoDisable);
    setMaintFeedback('Maintenance settings, countdown timer & auto-trigger saved!');
    setTimeout(() => setMaintFeedback(null), 3000);
  };

  const setQuickMinutes = (mins: number) => {
    const target = new Date(Date.now() + mins * 60 * 1000);
    setMaintHasCountdown(true);
    setMaintFinishTime(target.toISOString().slice(0, 16));
  };

  // Save Banner & Branding
  const handleSaveBanner = (e: React.FormEvent) => {
    e.preventDefault();
    updateBannerConfig({
      enabled: bannerEnabled,
      versionName: bannerVersion,
      sloganText: bannerSlogan,
      colorTheme: bannerTheme,
      customGradientFrom: useCustomColors ? customGradientFrom : (null as any),
      customGradientTo: useCustomColors ? customGradientTo : (null as any),
      ribbonEnabled: bannerRibbonEnabled,
      ribbonNotice: bannerRibbonNotice,
    });
    bannerDirty.current = false;
    setBannerFeedback('Branding and top banner settings updated across the site!');
    setTimeout(() => setBannerFeedback(null), 3000);
  };

  // Broadcast Popup Transmit
  const handleSendPopup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!popupTitle.trim() || !popupMessage.trim()) {
      setPopupFeedback('Please enter both title and message.');
      return;
    }

    createBroadcastPopup(
      popupTarget,
      popupTitle,
      popupMessage,
      popupType,
      popupDuration > 0 ? popupDuration : undefined,
      popupIsDismissible
    );
    setPopupFeedback('Popup broadcast sent successfully!');
    setPopupTitle('');
    setPopupMessage('');
    setTimeout(() => setPopupFeedback(null), 3000);
  };

  // Denial with Explanation Feedback
  const handleConfirmSongDecline = () => {
    if (!decliningSongReq) return;
    updateSongRequestStatus(
      decliningSongReq.id,
      'declined',
      songDeclineReason.trim() || 'Declined by Administrator'
    );
    setDecliningSongReq(null);
    setSongDeclineReason('');
  };

  const handleConfirmUserDecline = () => {
    if (!decliningUserReq) return;
    rejectAccount(decliningUserReq.id);
    setDecliningUserReq(null);
    setUserDeclineReason('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in">
      {/* Admin Top Header Banner */}
      <div className="relative liquid-glass-surface rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-amber-400/30 shadow-sm mb-8 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-display">
                  YouSong Administrator Studio
                </h1>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-400/20 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-400/30">
                  Admin Studio
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Upload your MP3s, configure streaming URLs, manage user accounts, configure maintenance mode, and manage music requests.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.04] p-3 rounded-2xl border border-slate-200 dark:border-white/10">
              <div>
                <span className="text-slate-900 dark:text-white font-bold">{allSongs.length}</span> Songs
              </div>
              <span className="text-slate-400 dark:text-slate-600">·</span>
              <div>
                <span className="text-amber-600 dark:text-amber-400 font-bold">{pendingRequests.length}</span> Requests
              </div>
              <span className="text-slate-400 dark:text-slate-600">·</span>
              <div>
                <span className="text-blue-600 dark:text-blue-400 font-bold">{pendingUsers.length}</span> Pending Approvals
              </div>
            </div>

          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 mt-6 pt-4 border-t border-slate-200 dark:border-white/10 overflow-x-auto">
          <button
            onClick={() => setAdminTab('songs')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
              adminTab === 'songs'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            Song Studio & Catalog ({adminAllSongs.length})
          </button>

          <button
            onClick={() => setAdminTab('autotags')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
              adminTab === 'autotags'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            Auto-Tag Rules ({autoTagRules.length})
          </button>

          <button
            onClick={() => setAdminTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all relative ${
              adminTab === 'requests'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}
          >
            <ListPlus className="w-3.5 h-3.5" />
            Song Requests
            {pendingRequests.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setAdminTab('feedback')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
              adminTab === 'feedback'
                ? 'bg-pink-500 text-white font-bold shadow-md shadow-pink-500/20'
                : 'text-pink-300 hover:text-white hover:bg-pink-500/10'
            }`}
          >
            <span>Feature Requests & Bugs</span>
          </button>
          <button
            onClick={() => setAdminTab('banner')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
              adminTab === 'banner'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            Banner & Branding
          </button>

          <button
            onClick={() => setAdminTab('approvals')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all relative ${
              adminTab === 'approvals'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Account Approvals
            {pendingUsers.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                {pendingUsers.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setAdminTab('users')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
              adminTab === 'users'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Users ({approvedUsers.length})
          </button>

          <button
            onClick={() => setAdminTab('maintenance')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
              adminTab === 'maintenance'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Maintenance & Countdown {maintenanceState.enabled ? '(ACTIVE)' : ''}
          </button>

          <button
            onClick={() => setAdminTab('popups')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
              adminTab === 'popups'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            Broadcast Pop-ups
          </button>
          <button
            onClick={() => setAdminTab('database')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
              adminTab === 'database'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                : 'text-emerald-400 hover:text-white hover:bg-emerald-500/10'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Database Hosting (Supabase)</span>
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {songFeedback && (
        <div className="mb-6 p-4 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{songFeedback}</span>
          </div>
          <button
            onClick={() => setSongFeedback(null)}
            className="text-cyan-400 hover:text-white text-xs underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      <AdminDatabaseWarning />

      {/* TAB 1: SONG STUDIO & CATALOG */}
      {adminTab === 'songs' && (
        <div className="space-y-8 animate-in fade-in">
          {/* Active Genres Indicator */}
          <div className="liquid-glass-surface rounded-2xl p-4 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-300 font-semibold">Active Selection Tab Genres:</span>
              <div className="flex flex-wrap gap-1.5 ml-1">
                {activeGenres.length === 0 ? (
                  <span className="text-slate-500 italic">None yet (Upload your first song)</span>
                ) : (
                  activeGenres.map((g) => {
                    const count = allSongs.filter((s) => s.genre === g).length;
                    return (
                      <span
                        key={g}
                        className="px-2 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-200 border border-cyan-400/20 font-medium text-[11px]"
                      >
                        {g} ({count})
                      </span>
                    );
                  })
                )}
              </div>
            </div>
            <span className="text-[11px] text-slate-400">
              * Any non-existing genre or modified genre is automatically removed from library tabs.
            </span>
          </div>

          {/* Song Studio (YouTube links and verified audio links) */}
          <ManualSongUploader onOpenAuth={() => {}} onEditSong={(song) => setEditingSong(song)} />

          {/* Enhanced Admin Song Management Studio: Search, Bulk Tags, Mass Editing, Visibility & Spotlight */}
          <AdminSongManager
            allSongs={adminAllSongs}
            allUsers={allUsers}
            onPlaySong={playSong}
          />
        </div>
      )}

      {/* TAB: AUTO-TAG RULES ENGINE */}
      {adminTab === 'autotags' && (
        <div className="space-y-6 animate-in fade-in">
          <AdminAutoTagRules songs={adminAllSongs} />
        </div>
      )}

      {/* TAB 2: REQUESTS INBOX (SONGS & APP FEATURES) */}
      {adminTab === 'requests' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-white font-display mb-1 flex items-center gap-2">
                  <ListPlus className="w-5 h-5 text-cyan-400" />
                  <span>YouSong Moderation & Conversion Pipeline</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Review a request, convert permitted audio to MP3 once, upload it to Google Drive, preview the staged file, then publish. Playback streams from Drive instead of through this app host.
                </p>
              </div>
            </div>

            <AdminPipelineManager />
          </div>
        </div>
      )}

      {adminTab === 'feedback' && <AdminFeedbackManager />}

      {/* TAB 3: BANNER & BRANDING */}
      {adminTab === 'banner' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="liquid-glass-surface rounded-3xl p-6 sm:p-8 border border-white/10">
            <h2 className="text-lg font-bold text-white font-display mb-2 flex items-center gap-2">
              <Palette className="w-5 h-5 text-cyan-400" />
              Top Banner, Versioning & Visual Theme
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Customize version string, custom slogan, banner colors, or toggle the top banner on/off.
            </p>

            {bannerFeedback && (
              <div className="mb-6 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{bannerFeedback}</span>
              </div>
            )}

            <form onSubmit={handleSaveBanner} className="space-y-6">
              {/* Toggle Banner On/Off */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                <div>
                  <h4 className="text-xs font-bold text-white">Top Banner Visibility</h4>
                  <p className="text-[11px] text-slate-400">
                    Show or hide the version badge and slogan at the top of the app.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bannerEnabled}
                    onChange={(e) => setBannerEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              {/* Version & Slogan Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Version Name Tag
                  </label>
                  <input
                    type="text"
                    value={bannerVersion}
                    onChange={(e) => setBannerVersion(e.target.value)}
                    placeholder="Version tag"
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Slogan / Subtitle
                  </label>
                  <input
                    type="text"
                    value={bannerSlogan}
                    onChange={(e) => setBannerSlogan(e.target.value)}
                    placeholder="Tagline or subtitle"
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* Color Themes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Banner Color Theme
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'cyan-violet' as const, name: 'Cyan & Violet (Default)', colors: 'from-cyan-500 to-indigo-600' },
                    { id: 'emerald-cyber' as const, name: 'Emerald Matrix', colors: 'from-emerald-400 to-teal-600' },
                    { id: 'amber-rose' as const, name: 'Electric Amber & Rose', colors: 'from-amber-400 to-rose-500' },
                    { id: 'sapphire-ice' as const, name: 'Deep Sapphire & Ice', colors: 'from-blue-500 to-cyan-400' },
                    { id: 'ruby-glow' as const, name: 'Ruby Glow Glass', colors: 'from-rose-500 to-red-600' },
                    { id: 'midnight-mono' as const, name: 'Obsidian Monochrome', colors: 'from-slate-700 to-slate-900' },
                  ].map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => {
                        setBannerTheme(theme.id);
                        setUseCustomColors(false);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        bannerTheme === theme.id
                          ? 'border-cyan-400 ring-2 ring-cyan-400/30 bg-white/[0.08]'
                          : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                      }`}
                    >
                      <div className={`h-4 rounded-md bg-gradient-to-r ${theme.colors} mb-2`} />
                      <div className="text-xs font-bold text-white">{theme.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Branding Hex Color Pickers */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <Palette className="w-4 h-4 text-cyan-400" />
                      Custom Branding Gradient Color Pickers
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Pick custom starting and ending hex colors for full branding freedom.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomColors}
                      onChange={(e) => setUseCustomColors(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>

                {useCustomColors && (
                  <div className="space-y-4 pt-2 border-t border-white/5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Start Color */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Start Gradient Color
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={customGradientFrom}
                            onChange={(e) => setCustomGradientFrom(e.target.value)}
                            className="w-10 h-10 rounded-xl bg-transparent border-0 cursor-pointer p-0 shrink-0"
                          />
                          <input
                            type="text"
                            value={customGradientFrom}
                            onChange={(e) => setCustomGradientFrom(e.target.value)}
                            placeholder="#06b6d4"
                            className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white font-mono"
                          />
                        </div>
                      </div>

                      {/* End Color */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          End Gradient Color
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={customGradientTo}
                            onChange={(e) => setCustomGradientTo(e.target.value)}
                            className="w-10 h-10 rounded-xl bg-transparent border-0 cursor-pointer p-0 shrink-0"
                          />
                          <input
                            type="text"
                            value={customGradientTo}
                            onChange={(e) => setCustomGradientTo(e.target.value)}
                            placeholder="#6366f1"
                            className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Live Preview */}
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 font-medium">
                        Live Top Banner Preview:
                      </label>
                      <div
                        className="w-full h-12 rounded-xl flex items-center justify-between px-4 text-white text-xs font-bold shadow-md border border-white/20 transition-all"
                        style={{ background: `linear-gradient(to right, ${customGradientFrom}, ${customGradientTo})` }}
                      >
                        <span className="px-2.5 py-1 rounded-lg bg-white/20 backdrop-blur-md text-[11px] font-extrabold uppercase">
                          {bannerVersion || 'YouSong Pro'}
                        </span>
                        <span className="truncate">{bannerSlogan || 'School Audio Stream Hub'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Ribbon Notice */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">Top School Ribbon Notice</h4>
                    <p className="text-[11px] text-slate-400">
                      Announcement ribbon at the top of the music library.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={bannerRibbonEnabled}
                    onChange={(e) => setBannerRibbonEnabled(e.target.checked)}
                    className="rounded border-white/20 bg-slate-900 text-cyan-400"
                  />
                </div>
                {bannerRibbonEnabled && (
                  <input
                    type="text"
                    value={bannerRibbonNotice}
                    onChange={(e) => setBannerRibbonNotice(e.target.value)}
                    placeholder="Notice text..."
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                  />
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
                >
                  Save Branding Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: ACCOUNT APPROVALS */}
      {adminTab === 'approvals' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-white/10">
            <h2 className="text-lg font-bold text-white font-display mb-2 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-400" />
              Pending Account Requests ({pendingUsers.length})
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Users who requested an account via the login board. You can review their notes and approve or reject them.
            </p>

            {pendingUsers.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle className="w-10 h-10 text-emerald-400/60 mx-auto mb-2" />
                <p className="text-xs text-slate-400">All account requests have been reviewed!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map((user) => (
                  <div
                    key={user.id}
                    className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{user.username}</span>
                        <span className="px-2 py-0.2 rounded bg-amber-400/20 text-amber-300 text-[10px] font-bold border border-amber-400/30">
                          Pending Approval
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        <strong>Reason:</strong> "{user.note || 'No note provided'}"
                      </p>
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Requested {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => approveAccount(user.id)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 text-xs font-bold transition-all active:scale-95"
                      >
                        Approve Account
                      </button>
                      <button
                        onClick={() => {
                          setDecliningUserReq(user);
                          setUserDeclineReason('');
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 text-xs font-semibold transition-all active:scale-95"
                      >
                        Reject with Reason
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove account request for "${user.username}" from queue?`)) {
                            adminDeleteUser(user.id);
                          }
                        }}
                        className="p-2 rounded-xl hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors"
                        title="Delete request from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: USERS & PASSWORDS */}
      {adminTab === 'users' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-white/10">
            <h2 className="text-lg font-bold text-white font-display mb-2 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              User Accounts & Passwords ({approvedUsers.length})
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              You can change usernames or assign temporary passwords. Passwords are securely encrypted and masked.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 uppercase text-[10px] tracking-wider">
                    <th className="pb-3 pl-2">Username</th>
                    <th className="pb-3">Role</th>
                    <th className="pb-3">Last Logged In</th>
                    <th className="pb-3">Last Song Listened</th>
                    <th className="pb-3">Listens Today / Limit</th>
                    <th className="pb-3">Chat Access</th>
                    <th className="pb-3 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {approvedUsers.map((u) => {
                    const isCurrentAdmin = u.id === currentUser?.id;
                    return (
                    <tr
                      key={u.id}
                      className={`transition-colors ${
                        isCurrentAdmin
                          ? 'bg-cyan-500/[0.08] ring-1 ring-cyan-400/40'
                          : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="py-3 pl-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-white">{u.username}</span>
                          {isCurrentAdmin && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 font-bold shadow-xs">
                              You (Current Admin)
                            </span>
                          )}
                          {u.temporaryPasswordAssigned && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                              Temp Password Active
                            </span>
                          )}
                          {u.isSuspended && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                              Suspended
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.role === 'admin'
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                              : 'bg-white/[0.05] text-slate-300'
                          }`}
                        >
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 text-slate-400 text-[11px]">
                        {u.lastLoginAt ? (
                          <span>{new Date(u.lastLoginAt).toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-500 italic">Never logged in</span>
                        )}
                      </td>
                      <td className="py-3 text-slate-400 text-[11px] max-w-[180px] truncate">
                        {u.lastSongListened ? (
                          <span className="flex items-center gap-1 text-cyan-300 truncate" title={u.lastSongListened}>
                            <Headphones className="w-3 h-3 shrink-0 text-cyan-400" />
                            <span className="truncate">{u.lastSongListened}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">No plays yet</span>
                        )}
                      </td>
                      <td className="py-3 text-slate-300 text-[11px] whitespace-nowrap">
                        <span className={u.dailyListenLimit != null && (u.dailyListensToday || 0) >= u.dailyListenLimit ? 'text-rose-300 font-bold' : ''}>
                          {u.dailyListensToday || 0} / {u.dailyListenLimit == null ? 'Unlimited' : u.dailyListenLimit}
                        </span>
                      </td>
                      <td className="py-3">
                        {u.chatBlocked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <Ban className="w-2.5 h-2.5" />
                            Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle className="w-2.5 h-2.5" />
                            Enabled
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditingUser(u);
                              setEditUsername(u.username);
                              setEditTempPassword('');
                              setEditRole(u.role);
                              setEditDailyListenLimit(u.dailyListenLimit == null ? '' : String(u.dailyListenLimit));
                              setEditChatBlocked(!!u.chatBlocked);
                              setEditIsSuspended(!!u.isSuspended);
                              setEditSuspendedReason(u.suspendedReason || '');
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium border border-white/10 transition-all"
                            title="Edit username, role, suspension, or password"
                          >
                            <KeyRound className="w-3 h-3 text-amber-400" />
                            <span>Edit</span>
                          </button>

                          <button
                            onClick={() => handleToggleUserChat(u)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              u.chatBlocked
                                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30'
                                : 'bg-rose-500/20 border-rose-500/30 text-rose-300 hover:bg-rose-500/30'
                            }`}
                            title={u.chatBlocked ? 'Enable user chat' : 'Block user from chat'}
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>

                          {u.role !== 'admin' && (
                            <button
                              onClick={() => handleOpenSuspendModal(u)}
                              className={`p-1.5 rounded-lg border transition-colors ${
                                u.isSuspended
                                  ? 'bg-amber-500/20 border-amber-500/30 text-amber-300 hover:bg-amber-500/30'
                                  : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-amber-300 hover:bg-white/[0.08]'
                              }`}
                              title={u.isSuspended ? 'Account Suspended: Click to Unsuspend' : 'Suspend Account (Directs user to appeal chat)'}
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {(u.role !== 'admin' || isCurrentAdmin) && (
                            <button
                              onClick={() => setDeletingUser(u)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isCurrentAdmin
                                  ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40'
                                  : 'hover:bg-rose-500/20 text-slate-500 hover:text-rose-300'
                              }`}
                              title={isCurrentAdmin ? 'Delete your own admin account' : 'Delete account'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Edit User Modal */}
          {editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <div className="w-full max-w-md liquid-glass-surface rounded-3xl p-6 border border-white/20 shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <h3 className="text-base font-bold text-white">
                    Edit Account: {editingUser.username}
                  </h3>
                  <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                {userEditFeedback && (
                  <div className="mb-4 p-2.5 rounded-xl bg-cyan-500/20 text-cyan-200 text-xs">
                    {userEditFeedback}
                  </div>
                )}

                <form onSubmit={handleSaveUserEdit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Set New Password
                    </label>
                    <input
                      type="text"
                      placeholder="Leave blank to keep unchanged"
                      value={editTempPassword}
                      onChange={(e) => setEditTempPassword(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Daily Song Listen Limit
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1000000}
                      step={1}
                      inputMode="numeric"
                      placeholder="Blank = unlimited"
                      value={editDailyListenLimit}
                      onChange={(e) => setEditDailyListenLimit(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                    />
                    <p className="mt-1 text-[10px] text-slate-500">Use 0 to block listening. The counter resets at midnight UTC.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Account Role
                      </label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as 'admin' | 'user')}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400 [&>option]:bg-slate-900 [&>option]:text-slate-100"
                      >
                        <option value="user" className="bg-slate-900 text-slate-100">Member (User)</option>
                        <option value="admin" className="bg-slate-900 text-slate-100">Administrator</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Chat Permission
                      </label>
                      <button
                        type="button"
                        onClick={() => setEditChatBlocked(!editChatBlocked)}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                          editChatBlocked
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {editChatBlocked ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        <span>{editChatBlocked ? 'Blocked' : 'Enabled'}</span>
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Account Suspension
                      </label>
                      <button
                        type="button"
                        onClick={() => setEditIsSuspended(!editIsSuspended)}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                          editIsSuspended
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-white/[0.05] text-slate-300 border border-white/10'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>{editIsSuspended ? 'Suspended' : 'Active'}</span>
                      </button>
                    </div>
                  </div>

                  {editIsSuspended && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-1.5 animate-in fade-in">
                      <label className="block text-xs font-semibold text-rose-300">
                        Suspension Reason (Visible to user on appeal screen)
                      </label>
                      <input
                        type="text"
                        placeholder="Reason for suspension"
                        value={editSuspendedReason}
                        onChange={(e) => setEditSuspendedReason(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-rose-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-rose-400"
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 font-bold text-xs"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: MAINTENANCE MODE */}
      {adminTab === 'maintenance' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="liquid-glass-surface rounded-3xl p-6 sm:p-8 border border-white/10">
            <h2 className="text-lg font-bold text-white font-display mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Maintenance Mode & Countdown Timer
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              When enabled, regular listeners will see a maintenance screen with your custom message and optional live return countdown.
            </p>

            {maintFeedback && (
              <div className="mb-6 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{maintFeedback}</span>
              </div>
            )}

            <div className="space-y-6">
              {/* Toggle switch */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                <div>
                  <h4 className="text-sm font-bold text-white">Enable Maintenance Lock Screen</h4>
                  <p className="text-xs text-slate-400">
                    Only administrators can log in and view the app while this is active.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={maintEnabled}
                    onChange={(e) => setMaintEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-400"></div>
                </label>
              </div>

              {/* Maintenance Message */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Message for Listeners
                </label>
                <textarea
                  rows={3}
                  value={maintMessage}
                  onChange={(e) => setMaintMessage(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Countdown Setting */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <div>
                      <h4 className="text-xs font-bold text-white">Estimated Finish Countdown Timer</h4>
                      <p className="text-[11px] text-slate-400">
                        Shows a live animated countdown clock on the maintenance page.
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={maintHasCountdown}
                    onChange={(e) => setMaintHasCountdown(e.target.checked)}
                    className="rounded border-white/20 bg-slate-900 text-cyan-400 focus:ring-0"
                  />
                </div>

                {maintHasCountdown && (
                  <div className="space-y-3 pt-2 border-t border-white/5">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        Estimated Completion Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        value={maintFinishTime}
                        onChange={(e) => setMaintFinishTime(e.target.value)}
                        className="w-full sm:w-auto px-3 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-400 text-[11px]">Quick Buttons:</span>
                      <button
                        type="button"
                        onClick={() => setQuickMinutes(15)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-500/30 text-[11px]"
                      >
                        +15 Minutes
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickMinutes(30)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-500/30 text-[11px]"
                      >
                        +30 Minutes
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickMinutes(60)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-500/30 text-[11px]"
                      >
                        +1 Hour
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickMinutes(120)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-500/30 text-[11px]"
                      >
                        +2 Hours
                      </button>
                    </div>

                    {/* Auto-disable maintenance mode on timer expiry */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 mt-3">
                      <div>
                        <h5 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          Auto-Trigger: Auto-Disable Maintenance on Timer Expiry
                        </h5>
                        <p className="text-[11px] text-slate-300">
                          Automatically turn off maintenance mode and allow users back in the moment countdown reaches 0:00.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={maintAutoDisable}
                        onChange={(e) => setMaintAutoDisable(e.target.checked)}
                        className="rounded border-amber-500/40 bg-slate-900 text-amber-400 w-4 h-4 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveMaintenance}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
                >
                  Save Maintenance Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: BROADCAST POP-UPS */}
      {adminTab === 'popups' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="liquid-glass-surface rounded-3xl p-6 sm:p-8 border border-white/10">
            <h2 className="text-lg font-bold text-white font-display mb-2 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-amber-400" />
              Transmit Broadcast Pop-up Message
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Send instant pop-ups to all listeners or individual users.
            </p>

            {popupFeedback && (
              <div className="mb-6 p-3.5 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>{popupFeedback}</span>
              </div>
            )}

            <form onSubmit={handleSendPopup} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Target Recipient
                  </label>
                  <select
                    value={popupTarget}
                    onChange={(e) => setPopupTarget(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400 [&>option]:bg-slate-900 [&>option]:text-slate-100"
                  >
                    <option value="all" className="bg-slate-900 text-slate-100">Broadcast to All Users</option>
                    {approvedUsers.map((u) => (
                      <option key={u.id} value={u.id} className="bg-slate-900 text-slate-100">
                        {u.username} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Notification Type
                  </label>
                  <select
                    value={popupType}
                    onChange={(e) => setPopupType(e.target.value as PopupType)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400 [&>option]:bg-slate-900 [&>option]:text-slate-100"
                  >
                    <option value="announcement" className="bg-slate-900 text-slate-100">Announcement</option>
                    <option value="alert" className="bg-slate-900 text-slate-100">Important Alert</option>
                    <option value="music" className="bg-slate-900 text-slate-100">Music Drop</option>
                    <option value="message" className="bg-slate-900 text-slate-100">Direct Note</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    Auto-Delete Duration Timer
                  </label>
                  <select
                    value={popupDuration}
                    onChange={(e) => setPopupDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400 [&>option]:bg-slate-900 [&>option]:text-slate-100"
                  >
                    <option value={15} className="bg-slate-900 text-slate-100">15 Minutes (Auto-deletes)</option>
                    <option value={30} className="bg-slate-900 text-slate-100">30 Minutes</option>
                    <option value={60} className="bg-slate-900 text-slate-100">1 Hour</option>
                    <option value={360} className="bg-slate-900 text-slate-100">6 Hours</option>
                    <option value={1440} className="bg-slate-900 text-slate-100">24 Hours (1 Day)</option>
                    <option value={0} className="bg-slate-900 text-slate-100">Permanent (Manual delete only)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  <div>
                    <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                      Allow Dismissal
                    </h5>
                    <p className="text-[10px] text-slate-400">
                      User can check "I acknowledge" to suppress future pop-ups.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={popupIsDismissible}
                    onChange={(e) => setPopupIsDismissible(e.target.checked)}
                    className="rounded border-white/20 bg-slate-900 text-cyan-400 w-4 h-4 cursor-pointer"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Message Title *
                  </label>
                  <input
                    type="text"
                    value={popupTitle}
                    onChange={(e) => setPopupTitle(e.target.value)}
                    placeholder="Broadcast title"
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Message Body *
                  </label>
                  <textarea
                    rows={3}
                    value={popupMessage}
                    onChange={(e) => setPopupMessage(e.target.value)}
                    placeholder="Enter your announcement..."
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  Transmit Broadcast
                </button>
              </div>
            </form>
          </div>

          {/* Active Broadcasts History */}
          <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-white/10">
            <h3 className="text-base font-bold text-white font-display mb-4">
              Active Broadcasts History ({allPopups.length})
            </h3>
            {allPopups.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No broadcasts sent yet.</p>
            ) : (
              <div className="space-y-3">
                {allPopups.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-white">{p.title}</h4>
                        <span className="text-[10px] px-2 py-0.2 rounded bg-white/[0.05] text-cyan-300 border border-white/10 uppercase font-mono">
                          {p.type}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Target: {p.targetUserId === 'all' ? 'All Users' : p.targetUserId}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">"{p.message}"</p>
                      <div className="flex items-center gap-2.5 mt-1.5 text-[10px]">
                        <span
                          className={`px-2 py-0.2 rounded font-bold ${
                            p.isDismissible
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {p.isDismissible ? 'Dismissible (Acknowledgeable)' : 'Mandatory on refresh'}
                        </span>
                        {p.expiresAt ? (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-cyan-400" />
                            Auto-deletes: {new Date(p.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">No expiration timer</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => deletePopup(p.id)}
                      className="p-2 rounded-xl hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-transparent hover:border-rose-500/30 transition-colors shrink-0"
                      title="Delete Broadcast Immediately"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: DATABASE HOSTING & SUPABASE TRANSFER */}
      {adminTab === 'database' && (
        <div className="space-y-6 animate-in fade-in">
          <AdminDatabaseManager />
        </div>
      )}

      {/* Denial Feedback Modal for Song Requests */}
      {decliningSongReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md liquid-glass-surface rounded-3xl p-6 border border-rose-500/30 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-500" />
                Attach Denial Feedback
              </h3>
              <button onClick={() => setDecliningSongReq(null)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-300 mb-1">
                Denying request for <strong className="text-cyan-300">"{decliningSongReq.songTitle}"</strong> requested by <strong className="text-white">{decliningSongReq.requestedByUsername}</strong>.
              </p>
              <label className="block text-xs font-semibold text-slate-300 my-2">
                Explanatory Note for Listener *
              </label>
              <textarea
                rows={3}
                value={songDeclineReason}
                onChange={(e) => setSongDeclineReason(e.target.value)}
                placeholder="Explain reason for declining..."
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setDecliningSongReq(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSongDecline}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all active:scale-95 shadow-md"
              >
                Confirm Denial with Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Denial Feedback Modal for User Account Requests */}
      {decliningUserReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md liquid-glass-surface rounded-3xl p-6 border border-rose-500/30 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-500" />
                Reject Account Request
              </h3>
              <button onClick={() => setDecliningUserReq(null)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-300 mb-2">
                Rejecting account request for <strong className="text-white">{decliningUserReq.username}</strong>.
              </p>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Reason / Note (Optional)
              </label>
              <textarea
                rows={2}
                value={userDeclineReason}
                onChange={(e) => setUserDeclineReason(e.target.value)}
                placeholder="Reason for declining account request..."
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setDecliningUserReq(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUserDecline}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all active:scale-95 shadow-md"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend User Modal */}
      {suspendingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md liquid-glass-surface rounded-3xl p-6 border border-amber-500/30 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                Suspend Account: @{suspendingUser.username}
              </h3>
              <button onClick={() => setSuspendingUser(null)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-300 mb-2">
                This user will be redirected to the suspension appeal dispatch and blocked from playing audio.
              </p>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Reason for Suspension (Visible to User) *
              </label>
              <input
                type="text"
                value={suspendReasonInput}
                onChange={(e) => setSuspendReasonInput(e.target.value)}
                placeholder="Reason for suspension"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setSuspendingUser(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSuspend}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all active:scale-95 shadow-md"
              >
                Confirm Suspension
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsuspend User Modal */}
      {unsuspendingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md liquid-glass-surface rounded-3xl p-6 border border-emerald-500/30 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                Restore Account Access
              </h3>
              <button onClick={() => setUnsuspendingUser(null)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Are you sure you want to unsuspend <strong className="text-white">@{unsuspendingUser.username}</strong> and restore their access to YouSong? Any appeal thread will be resolved.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setUnsuspendingUser(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnsuspend}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all active:scale-95 shadow-md"
              >
                Restore Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md liquid-glass-surface rounded-3xl p-6 border border-rose-500/30 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-500" />
                Delete Account
              </h3>
              <button onClick={() => setDeletingUser(null)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {deletingUser.id === currentUser?.id ? (
              <div className="p-3.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-rose-200">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>CRITICAL: Deleting Your Own Admin Account</span>
                </div>
                <p>
                  You are about to delete your own account (<strong className="text-white">@{deletingUser.username}</strong>).
                  You will be immediately logged out, your session destroyed, and all administrative privileges permanently removed.
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-300">
                Permanently delete user account <strong className="text-white">@{deletingUser.username}</strong>? This action cannot be undone.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all active:scale-95 shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingUser.id === currentUser?.id ? 'Permanently Delete My Account & Sign Out' : 'Delete Account'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Song Modal */}
      {editingSong && (
        <EditSongModal
          song={editingSong}
          isOpen={!!editingSong}
          onClose={() => setEditingSong(null)}
          availableGenres={activeGenres}
        />
      )}
    </div>
  );
};
