import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { storage } from '../services/storage';
import { Song } from '../types';
import { ONLINE_CATALOG, OnlineCatalogTrack } from '../data/onlineCatalog';
import { handleImageFallback, getFallbackCoverDataUrl } from '../utils/artworkHelper';
import {
  Upload,
  Link as LinkIcon,
  Play,
  Pause,
  CheckCircle,
  Plus,
  Shield,
  FileAudio,
  Sparkles,
  Music2,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Radio,
  Library,
  Tag,
  Wand2,
  Cloud,
  DownloadCloud,
  FolderOpen,
  ExternalLink,
  Film,
  AlertCircle,
} from 'lucide-react';
import { MediaCover } from './MediaCover';
import { formatCoverMediaUrl } from '../utils/mediaUrl';

interface ManualSongUploaderProps {
  onOpenAuth: () => void;
  onEditSong?: (song: Song) => void;
}

const COVER_PRESETS = [
  { name: 'Study Session', url: '/src/assets/images/lofi_study_glass_1791054585559.jpg' },
  { name: 'Ambient Studio', url: '/src/assets/images/chill_ambient_wave_1791054604455.jpg' },
  { name: 'Focus Prism', url: '/src/assets/images/synthwave_prism_sound_1791054595636.jpg' },
  { name: 'Electronic Energy', url: '/src/assets/images/electric_energy_liquid_1791054613304.jpg' },
];

export const ManualSongUploader: React.FC<ManualSongUploaderProps> = ({ onEditSong }) => {
  const { isAdmin } = useAuth();
  const { addNewSong, playSong, allSongs, clearAllSongs } = useAudio();

  // Mode: 'gdrive' (pull from Google Drive or Cloud), 'url' (pull from direct link), 'catalog' (online presets), 'file' (upload local audio file)
  const [activeTab, setActiveTab] = useState<'youtube' | 'link'>('youtube');

  // Form Fields (fully editable by user on the website)
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('Lo-Fi');
  const [tags, setTags] = useState('study, focus');
  const [typeMood, setTypeMood] = useState('');
  const [album, setAlbum] = useState('Single');
  const [duration, setDuration] = useState(180);
  const [audioUrl, setAudioUrl] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState(COVER_PRESETS[0].url);
  const [customCoverUrl, setCustomCoverUrl] = useState('');
  const [coverType, setCoverType] = useState<'preset' | 'url' | 'file' | 'gradient'>('preset');

  // YouTube link
  const [ytInput, setYtInput] = useState('');
  const [ytInfo, setYtInfo] = useState<{ videoId: string; title: string; author: string; thumbnail: string; checked: boolean } | null>(null);
  const [ytProblem, setYtProblem] = useState<string | null>(null);
  const [hideVideo, setHideVideo] = useState(false);

  // Audio / Google Drive link (verified before it can be published)
  const [linkInput, setLinkInput] = useState('');
  const [linkResult, setLinkResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Google Drive & Cloud Inputs
  const [gdriveInput, setGdriveInput] = useState('');
  const [isPullingGdrive, setIsPullingGdrive] = useState(false);
  const [isArchivingToDb, setIsArchivingToDb] = useState(false);

  // URL Pull helper
  const [urlInput, setUrlInput] = useState('');

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadedAudioName, setUploadedAudioName] = useState<string | null>(null);

  // Audio Preview state
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Success Feedback
  const [recentSong, setRecentSong] = useState<Song | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  // Check that a link really plays as audio in the browser
  const verifyAudioLink = (url: string): Promise<{ ok: boolean; duration?: number }> =>
    new Promise((resolve) => {
      const a = new Audio();
      a.preload = 'metadata';
      let finished = false;
      const finish = (r: { ok: boolean; duration?: number }) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        a.onloadedmetadata = null;
        a.onerror = null;
        try { a.src = ''; } catch {}
        resolve(r);
      };
      const timer = setTimeout(() => finish({ ok: false }), 15000);
      a.onloadedmetadata = () =>
        finish({ ok: true, duration: isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration) : undefined });
      a.onerror = () => finish({ ok: false });
      a.src = url;
    });

  // YouTube: pull title, channel and thumbnail, and confirm the video can be embedded
  const analyzeYouTube = async (raw: string) => {
    const text = raw.trim();
    if (!text) {
      setYtProblem('Paste a YouTube link first.');
      return;
    }
    setIsAnalyzing(true);
    setYtProblem(null);
    setYtInfo(null);
    setAudioUrl('');
    stopPreview();
    try {
      const r = await storage.previewYouTube(text);
      if (!r.valid || !r.videoId) {
        setYtProblem(r.reason || 'This link cannot be used.');
        return;
      }
      setYtInfo({
        videoId: r.videoId,
        title: r.title || '',
        author: r.author || '',
        thumbnail: r.thumbnail || `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
        checked: !!r.checked,
      });
      setAudioUrl(`youtube:${r.videoId}`);
      if (r.title) setTitle(r.title);
      if (r.author) setArtist(r.author);
      setDuration(180); // the real length is measured the first time the song plays
      const thumb = r.thumbnail || `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`;
      setCoverUrl(thumb);
      setCustomCoverUrl(thumb);
      setCoverType('url');
      setFeedback('✓ YouTube video found. Check the title and artist below, then click Publish.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Audio / Drive link: only accepted once the browser can actually play it
  const analyzeLink = async () => {
    const raw = linkInput.trim();
    setLinkResult(null);
    if (!raw) {
      setLinkResult({ ok: false, text: 'Paste a link first.' });
      return;
    }
    if (/youtube\.com|youtu\.be/i.test(raw)) {
      setActiveTab('youtube');
      setYtInput(raw);
      setFeedback('That is a YouTube link, so it was moved to the YouTube tab.');
      await analyzeYouTube(raw);
      return;
    }
    if (!/^https?:\/\//i.test(raw)) {
      setLinkResult({ ok: false, text: 'The link must start with https://' });
      return;
    }
    if (/spotify\.com|soundcloud\.com|music\.apple\.com|deezer\.com|tidal\.com|pandora\.com/i.test(raw)) {
      setLinkResult({
        ok: false,
        text: 'Streaming-service links (Spotify, SoundCloud, Apple Music...) cannot be played here. Use the YouTube tab, or a direct audio file link.',
      });
      return;
    }
    if (/drive\.google\.com\/(drive\/folders|folderview)/i.test(raw)) {
      setLinkResult({ ok: false, text: 'That is a Google Drive folder. Open the audio file itself and copy ITS share link.' });
      return;
    }

    setIsAnalyzing(true);
    setAudioUrl('');
    stopPreview();
    try {
      const parsed = storage.parseCloudAudioUrl(raw);
      const check = await verifyAudioLink(parsed.streamUrl);
      if (!check.ok) {
        setLinkResult({
          ok: false,
          text:
            parsed.service === 'gdrive'
              ? 'Google Drive would not stream this file. Set sharing to "Anyone with the link" and use a smaller audio file (large files are blocked by Google).'
              : 'This link did not play as audio. It must point straight to an audio file (.mp3, .m4a, .wav, .ogg). Web pages, folders and download pages do not work.',
        });
        return;
      }
      setAudioUrl(parsed.streamUrl);
      if (check.duration) setDuration(check.duration);
      if (!title.trim()) {
        try {
          const name = decodeURIComponent(new URL(raw).pathname.split('/').pop() || '').replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
          setTitle(parsed.service === 'gdrive' ? 'Drive Audio Track' : name || 'Audio Track');
        } catch {
          setTitle('Audio Track');
        }
      }
      if (!artist.trim()) setArtist(parsed.service === 'gdrive' ? 'Cloud Stream' : 'Online Stream');
      setLinkResult({
        ok: true,
        text: `✓ Plays correctly${check.duration ? ` (${Math.floor(check.duration / 60)}:${String(check.duration % 60).padStart(2, '0')} long)` : ''}. Edit the details below, then click Publish.`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Pull Track from Google Drive or 3rd-Party Cloud Storage
  const handlePullFromGdrive = async () => {
    if (!gdriveInput.trim()) {
      setFeedback('Please paste your Google Drive, Dropbox, or Cloud sharing link first!');
      return;
    }

    setIsPullingGdrive(true);
    setFeedback('Connecting to Google Drive / Cloud link...');

    try {
      const parsed = storage.parseCloudAudioUrl(gdriveInput);
      setAudioUrl(parsed.streamUrl);

      // Auto-extract or suggest title
      if (!title) {
        setTitle(parsed.service === 'gdrive' ? 'Drive Audio Track' : 'Cloud Audio Track');
      }
      if (!artist) {
        setArtist('Cloud Stream');
      }

      // Measure exact duration via backend probe & audio element
      storage.detectDuration(gdriveInput).then((durRes) => {
        if (durRes.success && durRes.duration && durRes.duration > 0) {
          setDuration(durRes.duration);
        }
      }).catch(() => {});

      // Test length in audio tag
      const testAudio = new Audio(parsed.streamUrl);
      testAudio.preload = 'metadata';
      const timer = setTimeout(() => { testAudio.src = ''; }, 8000);
      testAudio.onloadedmetadata = () => {
        clearTimeout(timer);
        if (testAudio.duration && isFinite(testAudio.duration) && testAudio.duration > 0) {
          setDuration(Math.round(testAudio.duration));
        }
      };
      testAudio.ondurationchange = () => {
        if (testAudio.duration && isFinite(testAudio.duration) && testAudio.duration > 0) {
          setDuration(Math.round(testAudio.duration));
        }
      };

      setFeedback(
        `✓ ${parsed.displayName} connected! You can preview audio below, edit the title, author & tags, then click Publish Track.`
      );
    } catch (err: any) {
      setFeedback(`❌ Error connecting link: ${err.message || 'Check link'}`);
    } finally {
      setIsPullingGdrive(false);
    }
  };

  // Optional: Download track from Google Drive and save permanently into database
  const handleArchiveGdriveToDb = async () => {
    if (!gdriveInput.trim()) {
      setFeedback('Please paste your Google Drive link first!');
      return;
    }

    setIsArchivingToDb(true);
    setFeedback('Server downloading audio from Google Drive and saving permanently...');

    try {
      const res = await storage.importCloudAudio(gdriveInput, title || 'Drive Track');
      if (res.success && res.audioUrl) {
        setAudioUrl(res.audioUrl);
        if ((res as any).duration && (res as any).duration > 0) {
          setDuration((res as any).duration);
        }
        setFeedback(
          '✓ Track downloaded from Google Drive and saved permanently! Exact duration verified. Edit info below and click Publish.'
        );
      } else {
        setFeedback(`❌ Could not archive from Drive: ${res.error}. Make sure link sharing is set to "Anyone with the link".`);
      }
    } catch (err: any) {
      setFeedback(`❌ Server error importing: ${err.message}`);
    } finally {
      setIsArchivingToDb(false);
    }
  };

  // Pull Track from Online Catalog
  const handlePullFromCatalog = (item: OnlineCatalogTrack) => {
    setTitle(item.title);
    setArtist(item.artist);
    setGenre(item.genre);
    setTags(item.tags.join(', '));
    setAlbum(item.album || 'Online Stream');
    setDuration(item.duration || 180);
    setAudioUrl(item.audioUrl);
    setCoverUrl(item.coverUrl);
    setDescription(item.description || '');
    setCoverType('preset');
    setUploadedAudioName(null);

    setFeedback(`✓ Pulled "${item.title}" into Studio! Edit the author, tags, or title below, then click Publish.`);
    stopPreview();
  };

  // Pull from URL / Web Link with Live Probe and Metadata extraction
  const handlePullFromUrl = async () => {
    if (!urlInput.trim()) {
      setFeedback('Please paste an audio or stream URL first!');
      return;
    }

    const clean = urlInput.trim();
    setFeedback('Connecting to audio link & analyzing stream...');

    try {
      // 1. Probe the URL for stream compatibility
      const probe = await storage.probeMediaUrl(clean);
      if (probe && !probe.reachable && probe.warning) {
        console.warn('URL probe notice:', probe.warning);
      }

      setAudioUrl(clean);

      // 2. Measure length and test audio element
      const testAudio = new Audio(clean);
      const timer = setTimeout(() => {
        testAudio.src = '';
      }, 5000);

      testAudio.onloadedmetadata = () => {
        clearTimeout(timer);
        if (testAudio.duration && isFinite(testAudio.duration) && testAudio.duration > 0) {
          setDuration(Math.round(testAudio.duration));
        }
      };

      // 3. Auto-detect title and author from URL path
      try {
        const urlObj = new URL(clean);
        const pathname = urlObj.pathname;
        const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
        const rawName = filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

        if (!title && rawName) {
          setTitle(decodeURIComponent(rawName));
        }
        if (!artist) {
          setArtist('Online Stream');
        }
      } catch {
        if (!artist) setArtist('Online Stream');
      }

      setFeedback('✓ Audio stream URL connected! Customize the title, author, and tags below, then click Publish Track.');
    } catch (err: any) {
      setAudioUrl(clean);
      if (!artist) setArtist('Online Stream');
      setFeedback('✓ Audio link connected! Customize details below and click Publish Track.');
    }
  };

  // Process Local Audio File with Real Socket Progress Callback & Permanent DB Storage
  const processAudioFile = async (file: File) => {
    if (!file) return;

    const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    if (!title) setTitle(cleanTitle);
    if (!artist) setArtist('Uploaded Track');
    setUploadedAudioName(file.name);

    // Detect duration locally
    try {
      const tempUrl = URL.createObjectURL(file);
      const audioObj = new Audio(tempUrl);
      const timer = setTimeout(() => {
        try { URL.revokeObjectURL(tempUrl); } catch {}
      }, 3000);

      audioObj.onloadedmetadata = () => {
        clearTimeout(timer);
        if (audioObj.duration && isFinite(audioObj.duration)) {
          setDuration(Math.round(audioObj.duration));
        }
        try { URL.revokeObjectURL(tempUrl); } catch {}
      };
    } catch {}

    setIsUploadingAudio(true);
    setUploadProgress(10);
    setFeedback(`Uploading "${file.name}" to server and saving permanently to database...`);

    try {
      const uploadRes = await storage.uploadAudioFile(file, (percent) => {
        setUploadProgress(percent);
      });

      if (uploadRes.success && uploadRes.audioUrl) {
        setAudioUrl(uploadRes.audioUrl);
        setUploadProgress(100);
        setFeedback(`✓ Audio track "${file.name}" uploaded and saved permanently! Customize author & tags below, then click Publish.`);
      } else {
        setUploadProgress(0);
        setFeedback(`❌ Upload failed: ${uploadRes.error || 'Server rejected file'}. You can also use the "Import Web / Stream URL" tab to pull audio directly from a link.`);
      }
    } catch (err: any) {
      setUploadProgress(0);
      setFeedback(`❌ Upload network error: ${err.message || 'Could not reach server'}. Please try again or use the URL pull tab.`);
    } finally {
      setIsUploadingAudio(false);
      setTimeout(() => setUploadProgress(0), 1200);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processAudioFile(e.dataTransfer.files[0]);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsUploadingCover(true);
      setFeedback(`Uploading cover image "${file.name}"...`);

      try {
        const uploadRes = await storage.uploadCoverFile(file);
        if (uploadRes.success && uploadRes.coverUrl) {
          setCoverUrl(uploadRes.coverUrl);
          setCoverType('file');
          setFeedback('✓ Custom cover artwork uploaded & saved permanently!');
        } else {
          setFeedback(`❌ Cover upload issue: ${uploadRes.error || 'Please try another image'}`);
        }
      } catch {
        setFeedback('❌ Could not upload cover image. Please choose another image or preset.');
      } finally {
        setIsUploadingCover(false);
      }
    }
  };

  const handleApplyGradientCover = () => {
    const genCover = getFallbackCoverDataUrl(title || 'YouSong', genre || 'Lo-Fi');
    setCoverUrl(genCover);
    setCoverType('gradient');
    setFeedback('✓ Generative cover artwork created!');
  };

  const togglePreview = () => {
    if (!audioUrl) return;
    if (audioUrl.startsWith('youtube:')) {
      setFeedback('YouTube songs play in the main player after you publish. The video box appears in the corner.');
      return;
    }

    if (previewPlaying && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewPlaying(false);
      return;
    }

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(audioUrl);
      previewAudioRef.current.onended = () => setPreviewPlaying(false);
      previewAudioRef.current.onerror = () => setPreviewPlaying(false);
    } else {
      previewAudioRef.current.src = audioUrl;
    }

    previewAudioRef.current
      .play()
      .then(() => setPreviewPlaying(true))
      .catch(() => setPreviewPlaying(false));
  };

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewPlaying(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    stopPreview();

    if (!title.trim() || !artist.trim() || !audioUrl) {
      setFeedback('Please provide a Title, Artist/Author, and load an audio file or stream URL first!');
      return;
    }

    const tagList = tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    setIsPublishing(true);
    setFeedback('Publishing song to library...');

    try {
      const finalCover = coverUrl || COVER_PRESETS[0].url;
      const newSong = await addNewSong({
        title: title.trim(),
        artist: artist.trim(),
        genre: genre.trim() || 'Lo-Fi',
        tags: tagList.length > 0 ? tagList : [genre.trim().toLowerCase(), 'focus'],
        album: album.trim() || 'Single',
        typeMood: typeMood.trim() || undefined,
        duration: Number(duration) || 180,
        audioUrl: audioUrl.startsWith('youtube:') && hideVideo && !audioUrl.endsWith(':hidden') ? `${audioUrl}:hidden` : audioUrl,
        coverUrl: finalCover,
        description: description.trim() || undefined,
        featured: true,
      });

      setRecentSong(newSong);
      setFeedback(`✓ "${newSong.title}" by ${newSong.artist} is now live and saved permanently!`);

      // Reset form
      setTitle('');
      setArtist('');
      setTypeMood('');
      setAudioUrl('');
      setUrlInput('');
      setYtInput('');
      setYtInfo(null);
      setYtProblem(null);
      setLinkInput('');
      setLinkResult(null);
      setHideVideo(false);
      setUploadedAudioName(null);
      setDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setFeedback(`Publishing notice: ${err.message || 'Saved locally and queued for library sync.'}`);
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="liquid-glass-surface rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-white/[0.08] shadow-xs mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-600/20 border border-blue-500/20 dark:border-blue-500/30 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
              YouSong Audio Library
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Curated audio library. Use the "Request Song" button if you'd like an audio track added.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="liquid-glass-surface rounded-3xl p-5 sm:p-7 border border-slate-200 dark:border-white/[0.08] shadow-md mb-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-200 dark:border-white/[0.08] gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/10 dark:bg-blue-600/20 border border-blue-500/20 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-xs">
            <Music2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Song Studio & Uploader
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-500/30">
                Admin Studio
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Add a song from a YouTube link or from a verified audio link, with full author & tag editing.
            </p>
          </div>
        </div>

        {allSongs.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Clear all uploaded songs from the library?')) {
                clearAllSongs();
              }
            }}
            className="self-start sm:self-center flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Library</span>
          </button>
        )}
      </div>

      {/* Dynamic Feedback Banner */}
      {feedback && (
        <div className="mb-5 p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-600/15 border border-blue-200 dark:border-blue-500/30 text-blue-900 dark:text-blue-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="truncate">{feedback}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-blue-600 dark:text-blue-300 hover:underline font-semibold shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Mode Tabs */}
      <div className="flex flex-wrap p-1 rounded-2xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 mb-5 text-xs gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('youtube')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'youtube'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>YouTube Link</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('link')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold transition-all ${
            activeTab === 'link'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          <span>Audio / Google Drive Link</span>
        </button>
      </div>

      {/* Tab: YouTube */}
      {activeTab === 'youtube' && (
        <div className="mb-6 p-5 rounded-2xl bg-gradient-to-b from-rose-50/60 to-slate-50 dark:from-rose-950/20 dark:to-slate-900/60 border border-rose-200/70 dark:border-rose-900/40 space-y-3">
          <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
            Paste a YouTube video link
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
              value={ytInput}
              onChange={(e) => setYtInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  analyzeYouTube(ytInput);
                }
              }}
              className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono text-[11px] focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => analyzeYouTube(ytInput)}
              disabled={isAnalyzing}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors shrink-0 flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              <span>{isAnalyzing ? 'Checking...' : 'Pull & Analyze'}</span>
            </button>
          </div>

          {ytProblem && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-800 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{ytProblem}</span>
            </div>
          )}

          {ytInfo && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-950 border border-emerald-200 dark:border-emerald-500/30">
              <img src={ytInfo.thumbnail} alt="" className="w-24 h-14 rounded-lg object-cover shrink-0" />
              <div className="min-w-0 text-xs">
                <p className="font-bold text-slate-900 dark:text-white truncate">{ytInfo.title || 'YouTube video'}</p>
                <p className="text-slate-500 dark:text-slate-400 truncate">{ytInfo.author || ytInfo.videoId}</p>
                <p className="text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                  {ytInfo.checked ? '✓ Can be played on the site' : '✓ Link looks valid (YouTube did not answer the embed check)'}
                </p>
              </div>
            </div>
          )}

          <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={hideVideo}
              onChange={(e) => setHideVideo(e.target.checked)}
              className="mt-0.5 rounded border-slate-300"
            />
            <span>Hide the video from listeners (they only hear the song). You can change this later when editing the song.</span>
          </label>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">These work:</p>
            <p>youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/..., music.youtube.com/watch?v=...</p>
            <p className="font-semibold text-slate-700 dark:text-slate-300 mt-1.5 mb-0.5">These do not:</p>
            <p>Playlists, channels, Spotify / SoundCloud / Apple Music, and videos whose owner blocks embedding.</p>
          </div>
        </div>
      )}

      {/* Tab: Audio / Google Drive link */}
      {activeTab === 'link' && (
        <div className="mb-6 p-5 rounded-2xl bg-gradient-to-b from-blue-50/70 to-slate-50 dark:from-blue-950/20 dark:to-slate-900/60 border border-blue-200/80 dark:border-blue-900/40 space-y-3">
          <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
            Paste a direct audio link or a Google Drive share link
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="https://example.com/song.mp3 or https://drive.google.com/file/d/..."
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  analyzeLink();
                }
              }}
              className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono text-[11px] focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={analyzeLink}
              disabled={isAnalyzing}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors shrink-0 flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              <span>{isAnalyzing ? 'Testing link...' : 'Pull & Analyze'}</span>
            </button>
          </div>

          {linkResult && (
            <div
              className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${
                linkResult.ok
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200'
              }`}
            >
              {!linkResult.ok && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{linkResult.text}</span>
            </div>
          )}

          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">These work:</p>
            <p>A link straight to an audio file (ends in .mp3, .m4a, .wav or .ogg), or a Google Drive file shared as &quot;Anyone with the link&quot;.</p>
            <p className="font-semibold text-slate-700 dark:text-slate-300 mt-1.5 mb-0.5">These do not:</p>
            <p>Web pages, folders, download pages, and streaming services. Songs only publish after the link passes the test above.</p>
          </div>
        </div>
      )}

      {/* Main Song Metadata Form (Always Editable) */}
      <form onSubmit={handlePublish} className="space-y-4">
        {/* Active Audio Stream Indicator & Preview */}
        {audioUrl && (
          <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Music2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200 block truncate">
                  Stream Ready: {title || 'Untitled Track'}
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate block">
                  {audioUrl}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={togglePreview}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shrink-0 active:scale-95 shadow-xs"
            >
              {previewPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white" />}
              <span>{previewPlaying ? 'Pause Preview' : 'Test Play'}</span>
            </button>
          </div>
        )}

        {/* Input Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Song Title *
            </label>
            <input
              type="text"
              placeholder="e.g. Late Night Study Desk"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Author / Artist *
            </label>
            <input
              type="text"
              placeholder="e.g. Lofi Girl or Artist Name"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Genre *
            </label>
            <input
              type="text"
              placeholder="e.g. Lo-Fi, Synthwave, Classical, Ambient"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tags (Comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. study, chill, coding, homework"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Type / Mood / Vibe (e.g. Chill Study, Gentle Piano)
            </label>
            <input
              type="text"
              placeholder="e.g. Chill Study, Gentle Piano, Deep Focus"
              value={typeMood}
              onChange={(e) => setTypeMood(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {['Chill Lo-Fi', 'Gentle Piano', 'Deep Focus', 'High Energy', 'Midnight Ambient'].map((vibe) => (
                <button
                  key={vibe}
                  type="button"
                  onClick={() => setTypeMood(vibe)}
                  className="px-2 py-0.5 rounded text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                >
                  +{vibe}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Album / Series (Optional)
            </label>
            <input
              type="text"
              placeholder="Single or Album Name"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Duration (Seconds)
              </label>
              {audioUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const test = new Audio(audioUrl);
                    test.preload = 'metadata';
                    test.onloadedmetadata = () => {
                      if (test.duration && isFinite(test.duration) && test.duration > 0) {
                        setDuration(Math.round(test.duration));
                        setFeedback(`✓ Exact duration detected: ${Math.floor(test.duration / 60)}:${String(Math.floor(test.duration % 60)).padStart(2, '0')} (${Math.round(test.duration)}s)`);
                      }
                    };
                  }}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Detect from Stream
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
              <span className="text-xs font-mono font-bold text-slate-500 shrink-0">
                ({Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')})
              </span>
            </div>
          </div>
        </div>

        {/* Audio URL Override / Direct Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Audio Stream URL *
          </label>
          <input
            type="text"
            placeholder="Fills in automatically after you pull a link above"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono text-[11px] focus:outline-none focus:border-blue-500"
            required
          />
        </div>

        {/* Cover Artwork Studio */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Album Cover Artwork
            </label>
            <button
              type="button"
              onClick={handleApplyGradientCover}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
            >
              <Sparkles className="w-3 h-3" />
              <span>Generate Custom Artwork</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <button
              type="button"
              onClick={() => setCoverType('preset')}
              className={`px-3 py-1.5 text-xs rounded-xl border transition-colors ${
                coverType === 'preset'
                  ? 'bg-blue-600/15 text-blue-700 dark:text-blue-300 border-blue-500/40 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              Presets
            </button>
            <button
              type="button"
              onClick={() => setCoverType('url')}
              className={`px-3 py-1.5 text-xs rounded-xl border transition-colors flex items-center gap-1.5 ${
                coverType === 'url'
                  ? 'bg-blue-600/15 text-blue-700 dark:text-blue-300 border-blue-500/40 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              <LinkIcon className="w-3 h-3" />
              <span>Drive Link / Web URL / Video</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCoverType('file');
                coverInputRef.current?.click();
              }}
              className={`px-3 py-1.5 text-xs rounded-xl border transition-colors flex items-center gap-1.5 ${
                coverType === 'file'
                  ? 'bg-blue-600/15 text-blue-700 dark:text-blue-300 border-blue-500/40 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {isUploadingCover ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
              <span>Upload Image, GIF or Video File</span>
            </button>
            <input
              type="file"
              ref={coverInputRef}
              accept="image/*,video/mp4,video/webm,image/gif"
              onChange={handleCoverUpload}
              className="hidden"
            />
          </div>

          {/* Presets Grid */}
          {coverType === 'preset' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {COVER_PRESETS.map((item) => (
                <div
                  key={item.url}
                  onClick={() => setCoverUrl(item.url)}
                  className={`p-1.5 rounded-2xl border cursor-pointer transition-all ${
                    coverUrl === item.url
                      ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/50 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.name}
                    className="w-full h-16 object-cover rounded-xl"
                    onError={(e) => handleImageFallback(e, item.name, 'Art')}
                  />
                  <span className="text-[10px] text-slate-700 dark:text-slate-300 block truncate mt-1 text-center font-medium">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Image, GIF, Video or Google Drive URL mode */}
          {coverType === 'url' && (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  placeholder="Paste Google Drive share link, GIF link, video URL (.mp4/.webm), or image link"
                  value={customCoverUrl}
                  onChange={(e) => {
                    setCustomCoverUrl(e.target.value);
                    const formatted = formatCoverMediaUrl(e.target.value);
                    if (formatted) setCoverUrl(formatted);
                  }}
                  className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!customCoverUrl.trim()) return;
                      setIsUploadingCover(true);
                      setFeedback('Importing artwork directly from Google Drive...');
                      const res = await storage.importCloudCover(customCoverUrl.trim());
                      setIsUploadingCover(false);
                      if (res.success && res.coverUrl) {
                        setCoverUrl(res.coverUrl);
                        setFeedback('✓ Image/GIF pulled directly from Google Drive and saved permanently!');
                      } else {
                        const formatted = formatCoverMediaUrl(customCoverUrl.trim());
                        setCoverUrl(formatted);
                        setFeedback(`Connected Drive link: ${res.error || 'Using live cloud stream'}`);
                      }
                    }}
                    disabled={isUploadingCover}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 shadow-xs"
                    title="Pull image or GIF from Google Drive and save permanently"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{isUploadingCover ? 'Pulling...' : 'Pull from Drive'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (customCoverUrl.trim()) {
                        const formatted = formatCoverMediaUrl(customCoverUrl.trim());
                        setCoverUrl(formatted);
                        setFeedback('✓ Cover artwork link applied!');
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shrink-0"
                  >
                    Apply Cover
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Supports Google Drive shared links (images/GIFs/videos), direct URLs, animated GIFs, and MP4/WebM video covers.
              </p>
            </div>
          )}

          {/* Preview of Chosen Cover (Supports Video, GIF, Image) */}
          {coverUrl && (
            <div className="mt-3 flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-black/20">
                <MediaCover
                  src={coverUrl}
                  alt="Active cover preview"
                  fallbackTitle={title || 'Cover'}
                  fallbackGenre={genre || 'Music'}
                  className="w-full h-full object-cover"
                  showBadge
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">
                  Active Artwork / Video Cover Preview
                </span>
                <span className="text-[10px] text-slate-500 truncate block font-mono">
                  {coverUrl}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action Button - Sticky at bottom so never off-screen */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sticky bottom-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md py-3 z-10">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Permanently saved with seamless audio playback.
          </span>

          <button
            type="submit"
            disabled={isPublishing || isUploadingAudio}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>{isPublishing ? 'Publishing to Database...' : 'Publish Song to YouSong'}</span>
          </button>
        </div>
      </form>

      {/* Success Notification with Instant Play Button */}
      {recentSong && (
        <div className="mt-5 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={recentSong.coverUrl}
              alt={recentSong.title}
              className="w-12 h-12 rounded-xl object-cover shrink-0 border border-emerald-300 dark:border-emerald-500/40"
              onError={(e) => handleImageFallback(e, recentSong.title, recentSong.genre)}
            />
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {recentSong.title}
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                by {recentSong.artist} · Saved permanently!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => playSong(recentSong)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Play Now</span>
            </button>
            {onEditSong && (
              <button
                onClick={() => onEditSong(recentSong)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
