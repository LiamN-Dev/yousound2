import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage } from '../services/storage';
import { CheckCircle, Cloud, FileAudio, FolderOpen, Image as ImageIcon, Loader2, Music2, Search, Upload, XCircle } from 'lucide-react';

type Feedback = { type: 'success' | 'error' | 'info'; message: string } | null;

function extractDrivePreviewId(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value || value.length > 2048) return null;
  if (/^[a-zA-Z0-9_-]{10,200}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'www.drive.google.com'].includes(url.hostname.toLowerCase())) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    const dIndex = segments.indexOf('d');
    const id = (dIndex >= 0 ? segments[dIndex + 1] : '') || url.searchParams.get('id') || '';
    return /^[a-zA-Z0-9_-]{10,200}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function formatPreviewDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function titleFromAudioFilename(filename: string): string {
  return String(filename || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}

type DriveLibraryFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string | null;
  modifiedTime?: string | null;
};

type DriveLibraryKind = 'audio' | 'image';

function formatDriveFileSize(rawSize?: string | null): string {
  const size = Number(rawSize);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size >= 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.max(1, Math.round(size / 1024)) + ' KB';
}

const DriveLibraryPicker: React.FC<{
  kind: DriveLibraryKind;
  disabled?: boolean;
  onSelect: (file: DriveLibraryFile) => void;
}> = ({ kind, disabled = false, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<DriveLibraryFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError('');
      setNextPageToken('');
      try {
        const params = new URLSearchParams({ kind, q: query });
        const response = await fetch('/api/admin/library/drive-files?' + params.toString(), {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || 'Could not search the Drive folder.');
        setFiles(Array.isArray(data.files) ? data.files : []);
        setNextPageToken(String(data.nextPageToken || ''));
      } catch (loadError: any) {
        if (!controller.signal.aborted) {
          setFiles([]);
          setError(loadError?.message || 'Could not search the Drive folder.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [kind, open, query]);

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const params = new URLSearchParams({ kind, q: query, pageToken: nextPageToken });
      const response = await fetch('/api/admin/library/drive-files?' + params.toString(), { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not load more Drive files.');
      setFiles((current) => [...current, ...(Array.isArray(data.files) ? data.files : [])]);
      setNextPageToken(String(data.nextPageToken || ''));
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load more Drive files.');
    } finally {
      setLoadingMore(false);
    }
  };

  const folderLabel = kind === 'audio' ? 'Audio Tracks' : 'Artwork';
  const selectLabel = kind === 'audio' ? 'Choose from Audio Tracks' : 'Choose from Artwork';

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-500/[0.08] px-3 py-2 text-[10px] font-semibold text-cyan-100 transition hover:bg-cyan-500/15 disabled:opacity-40"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        {open ? 'Close Drive folder' : selectLabel}
      </button>
      {open && (
        <div className="rounded-xl border border-cyan-400/20 bg-slate-950/70 p-3 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-cyan-200">
            {kind === 'audio' ? <FileAudio className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
            Search {folderLabel} by filename
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              className="w-full rounded-lg border border-white/10 bg-white/[0.05] py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-400"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={kind === 'audio' ? 'Search MP3 filename…' : 'Search image filename…'}
            />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1">
            {loading ? (
              <p className="flex items-center gap-2 py-4 text-[10px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching Google Drive…</p>
            ) : error ? (
              <p className="py-3 text-[10px] text-rose-300">{error}</p>
            ) : files.length ? files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => { onSelect(file); setOpen(false); setQuery(''); }}
                className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/[0.025] px-2.5 py-2 text-left transition hover:border-cyan-400/30 hover:bg-cyan-500/[0.08]"
              >
                {kind === 'audio' ? <FileAudio className="h-4 w-4 shrink-0 text-cyan-300" /> : <ImageIcon className="h-4 w-4 shrink-0 text-violet-300" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium text-slate-100">{file.name}</span>
                  <span className="block text-[9px] text-slate-500">{formatDriveFileSize(file.size)}</span>
                </span>
              </button>
            )) : (
              <p className="py-3 text-[10px] text-slate-500">{query ? 'No matching files found.' : 'No supported files found in this folder.'}</p>
            )}
          </div>
          {nextPageToken && !loading && !error && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full rounded-lg border border-white/10 py-2 text-[10px] font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more files'}
            </button>
          )}
          <p className="text-[9px] text-slate-500">Selecting a file reuses it in place. The MP3 or image is not uploaded again.</p>
        </div>
      )}
    </div>
  );
};

export const ManualSongUploader: React.FC = () => {
  const { refreshState } = useAuth();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('Lo-Fi');
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [driveFilenameStatus, setDriveFilenameStatus] = useState<'idle' | 'loading' | 'loaded' | 'unavailable'>('idle');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [audioDriveLink, setAudioDriveLink] = useState('');
  const [coverDriveLink, setCoverDriveLink] = useState('');
  const [audioDriveSelection, setAudioDriveSelection] = useState<DriveLibraryFile | null>(null);
  const [coverDriveSelection, setCoverDriveSelection] = useState<DriveLibraryFile | null>(null);
  const [driveConnected, setDriveConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [previewDuration, setPreviewDuration] = useState<number | null>(null);
  const [audioPreviewError, setAudioPreviewError] = useState('');
  const [coverPreviewError, setCoverPreviewError] = useState('');
  const audioFilePreview = useMemo(() => audioFile ? URL.createObjectURL(audioFile) : '', [audioFile]);
  const coverPreview = useMemo(() => coverFile ? URL.createObjectURL(coverFile) : '', [coverFile]);
  const audioDriveFileId = useMemo(() => audioDriveSelection?.id || extractDrivePreviewId(audioDriveLink), [audioDriveLink, audioDriveSelection]);
  const coverDriveFileId = useMemo(() => coverDriveSelection?.id || extractDrivePreviewId(coverDriveLink), [coverDriveLink, coverDriveSelection]);
  const audioPreviewUrl = audioFilePreview || (audioDriveFileId ? `/api/drive/stream/${encodeURIComponent(audioDriveFileId)}` : '');
  const coverImagePreviewUrl = coverPreview || (coverDriveFileId ? `https://lh3.googleusercontent.com/d/${encodeURIComponent(coverDriveFileId)}` : '');

  useEffect(() => () => {
    if (audioFilePreview) URL.revokeObjectURL(audioFilePreview);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
  }, [audioFilePreview, coverPreview]);

  useEffect(() => {
    setPreviewDuration(null);
    setAudioPreviewError('');
  }, [audioPreviewUrl]);

  useEffect(() => {
    setCoverPreviewError('');
  }, [coverImagePreviewUrl]);

  // Read only the public Drive response headers to find the original MP3 filename.
  useEffect(() => {
    if (!audioDriveFileId) {
      setDriveFilenameStatus('idle');
      return;
    }
    if (titleManuallyEdited) return;
    if (audioDriveSelection) {
      setTitle(titleFromAudioFilename(audioDriveSelection.name));
      setDriveFilenameStatus('loaded');
      return;
    }

    const controller = new AbortController();
    let active = true;
    setDriveFilenameStatus('loading');

    void (async () => {
      try {
        const response = await fetch(`/api/admin/library/drive-file-info/${encodeURIComponent(audioDriveFileId)}`, {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || !data.title) throw new Error(data.error || 'Drive filename unavailable.');
        if (active && !titleManuallyEdited) {
          setTitle(String(data.title).slice(0, 150));
          setDriveFilenameStatus('loaded');
        }
      } catch {
        if (active && !controller.signal.aborted) setDriveFilenameStatus('unavailable');
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [audioDriveFileId, audioDriveSelection, titleManuallyEdited]);

  const refreshDriveStatus = async () => {
    try {
      const response = await fetch('/api/admin/google-drive/status', { credentials: 'same-origin' });
      const data = await response.json();
      setDriveConnected(Boolean(data.connected));
      if (data.error && (!data.configured || data.storageReady === false)) {
        setFeedback({ type: 'error', message: data.error });
      }
    } catch {
      setDriveConnected(false);
    }
  };

  useEffect(() => { void refreshDriveStatus(); }, []);

  const connectDrive = async () => {
    setConnecting(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/admin/google-drive/auth-url', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Could not start Google Drive authorization.');
      window.location.assign(data.url);
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Could not connect Google Drive.' });
      setConnecting(false);
    }
  };

  const uploadSong = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setFeedback({ type: 'error', message: 'Enter a song title.' });
    if (!artist.trim()) return setFeedback({ type: 'error', message: 'Enter an artist.' });
    const useDriveLinks = Boolean(audioDriveFileId && coverDriveFileId && !audioFile && !coverFile);
    if ((!audioDriveFileId && !audioFile) || (!coverDriveFileId && !coverFile)) {
      return setFeedback({ type: 'error', message: 'Choose an MP3 and cover image using a Drive folder selection, a share link, or a direct upload.' });
    }
    if (audioFile && audioDriveFileId) return setFeedback({ type: 'error', message: 'Choose either a Drive MP3 or a local MP3, not both.' });
    if (coverFile && coverDriveFileId) return setFeedback({ type: 'error', message: 'Choose either Drive artwork or a local image, not both.' });
    if (audioFile && (!/\.mp3$/i.test(audioFile.name) || (audioFile.type && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(audioFile.type.toLowerCase())))) {
      return setFeedback({ type: 'error', message: 'Only MP3 audio files are accepted. This uploader does not convert audio.' });
    }
    if (audioFile && audioFile.size > 150 * 1024 * 1024) return setFeedback({ type: 'error', message: 'The MP3 must be 150 MB or smaller.' });
    if (coverFile && (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(coverFile.type.toLowerCase()) || coverFile.size > 25 * 1024 * 1024)) {
      return setFeedback({ type: 'error', message: 'Use a JPG, PNG, WEBP, or GIF cover no larger than 25 MB.' });
    }
    if ((audioFile || coverFile) && !driveConnected) return setFeedback({ type: 'error', message: 'Connect the site Google Drive account before uploading new files.' });

    setUploading(true);
    setFeedback({ type: 'info', message: useDriveLinks ? 'Adding existing Google Drive files to the library…' : 'Uploading the MP3 and artwork directly to Google Drive…' });
    try {
      const form = new FormData();
      form.append('title', title.trim());
      form.append('artist', artist.trim());
      form.append('genre', genre.trim());
      form.append('tags', tags);
      form.append('description', description.trim());
      if (previewDuration && Number.isFinite(previewDuration) && previewDuration > 0) {
        form.append('duration', String(Math.round(previewDuration)));
      }
      if (audioDriveFileId) form.append('audioDriveLink', audioDriveFileId);
      else if (audioFile) form.append('audio', audioFile);
      if (coverDriveFileId) form.append('coverDriveLink', coverDriveFileId);
      else if (coverFile) form.append('cover', coverFile);
      const response = await fetch(useDriveLinks ? '/api/admin/library/import-drive-links' : '/api/admin/library/upload-media', {
        method: 'POST', credentials: 'same-origin', body: form,
      });
      const responseText = await response.text();
      let data: any = {};
      try { data = responseText ? JSON.parse(responseText) : {}; } catch { /* Host/proxy may return HTML for a rejected request. */ }
      if (!response.ok || !data.success) {
        const statusMessage = response.status === 413
          ? 'The hosting layer rejected this upload before the app could process it. The app limit is 150 MB; check the deployed service/proxy body-size limit.'
          : 'Upload request failed (' + response.status + ').';
        throw new Error(data.error || statusMessage);
      }

      // The server's canonical contract returns the created song object. Accept
      // top-level URLs too for compatibility with an older deployed backend.
      const song = data.song;
      const audioUrl = data.audioUrl || song?.audioUrl;
      const coverUrl = data.coverUrl || song?.coverUrl;
      if (!song?.id || !audioUrl || !coverUrl) {
        throw new Error('Drive uploaded the files, but the server did not return a complete saved song. Check the server log before retrying to avoid duplicate files.');
      }
      await storage.syncWithServer();
      refreshState();

      setTitle('');
      setTitleManuallyEdited(false);
      setArtist('');
      setGenre('Lo-Fi');
      setDescription('');
      setTags('');
      setAudioFile(null);
      setCoverFile(null);
      setAudioDriveLink('');
      setCoverDriveLink('');
      setAudioDriveSelection(null);
      setCoverDriveSelection(null);
      setFeedback({ type: 'success', message: useDriveLinks ? 'Existing Google Drive MP3 and artwork added to the library without re-uploading them.' : 'Song published. Any newly selected local media was uploaded to Google Drive; selected Drive files were reused.' });
      await refreshDriveStatus();
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Song upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const fieldClass = 'w-full rounded-xl bg-white/[0.05] border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-400';
  const fileClass = `${fieldClass} file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400/15 file:px-2 file:py-1 file:text-cyan-100`;

  return (
    <section className="liquid-glass-surface rounded-3xl p-5 sm:p-6 border border-white/10 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><Cloud className="h-5 w-5 text-cyan-300" /> Google Drive song uploader</h2>
          <p className="mt-1 text-xs text-slate-400 max-w-2xl">Choose the MP3 and its artwork on this page. YouSong uploads both directly to the connected Google Drive account. Supabase stores song details and Drive references, not the media files.</p>
        </div>
        <button type="button" onClick={connectDrive} disabled={connecting || driveConnected} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${driveConnected ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'} disabled:opacity-60`}>
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
          {driveConnected ? 'Site Drive connected' : 'Connect Google Drive'}
        </button>
      </div>

      {feedback && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${feedback.type === 'error' ? 'border-rose-400/25 bg-rose-500/10 text-rose-200' : feedback.type === 'success' ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'}`}>
          {feedback.type === 'error' ? <XCircle className="h-4 w-4 shrink-0" /> : feedback.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
          {feedback.message}
        </div>
      )}

      <form onSubmit={uploadSong} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Song title *</label><input className={fieldClass} value={title} onChange={(event) => { setTitle(event.target.value); setTitleManuallyEdited(true); }} placeholder="Song title" maxLength={150} /></div>
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Artist *</label><input className={fieldClass} value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Artist name" maxLength={150} /></div>
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Genre</label><input className={fieldClass} value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Genre" maxLength={80} /></div>
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Tags (comma separated)</label><input className={fieldClass} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="study, focus, relaxing" /></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 space-y-2">
            <label className="block text-[11px] font-semibold text-slate-300">MP3 audio *</label>
            <input type="file" accept=".mp3,audio/mpeg" className={fileClass} onChange={(event) => {
              const file = event.target.files?.[0] || null;
              setAudioFile(file);
              setAudioDriveLink('');
              setAudioDriveSelection(null);
              if (file && !titleManuallyEdited) setTitle(titleFromAudioFilename(file.name));
            }} />
            {audioFile && <p className="text-[10px] text-slate-400">{audioFile.name} · {(audioFile.size / (1024 * 1024)).toFixed(1)} MB</p>}
            <DriveLibraryPicker
              kind="audio"
              disabled={!driveConnected || uploading}
              onSelect={(file) => {
                setAudioFile(null);
                setAudioDriveLink('');
                setAudioDriveSelection(file);
                setDriveFilenameStatus('loaded');
                if (!titleManuallyEdited) setTitle(titleFromAudioFilename(file.name));
              }}
            />
            {audioDriveSelection && <p className="text-[10px] text-emerald-300">Using existing MP3: {audioDriveSelection.name}</p>}
            <div className="border-t border-white/10 pt-2">
              <label className="mb-1 block text-[10px] text-slate-400">Or paste an existing Google Drive share link</label>
              <input className={fieldClass} value={audioDriveLink} onChange={(event) => { setAudioDriveLink(event.target.value); setAudioDriveSelection(null); if (event.target.value) setAudioFile(null); }} placeholder="https://drive.google.com/file/d/..." />
              {audioDriveFileId && driveFilenameStatus === 'loading' && <p className="mt-1 text-[10px] text-slate-400">Reading filename from Google Drive…</p>}
              {audioDriveFileId && driveFilenameStatus === 'loaded' && <p className="mt-1 text-[10px] text-emerald-300">Song title filled from the Drive filename.</p>}
              {audioDriveFileId && driveFilenameStatus === 'unavailable' && <p className="mt-1 text-[10px] text-amber-300">Drive did not expose the filename. Enter the title manually.</p>}
            </div>
            {audioPreviewUrl ? (
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Listen before publishing</span>
                  {previewDuration ? <span className="text-[10px] tabular-nums text-slate-300">Detected length: {formatPreviewDuration(previewDuration)}</span> : <span className="text-[10px] text-slate-400">Reading audio details…</span>}
                </div>
                <audio
                  key={audioPreviewUrl}
                  controls
                  preload="metadata"
                  src={audioPreviewUrl}
                  className="w-full"
                  onLoadedMetadata={(event) => {
                    const detected = event.currentTarget.duration;
                    if (Number.isFinite(detected) && detected > 0) setPreviewDuration(detected);
                  }}
                  onError={() => setAudioPreviewError('This audio preview could not load. Check that the Drive MP3 is shared with Anyone with the link, or choose another file.')}
                />
                {audioPreviewError && <p className="text-[10px] text-rose-300">{audioPreviewError}</p>}
              </div>
            ) : (audioFile || audioDriveLink.trim()) ? (
              <p className="text-[10px] text-amber-300">Enter a valid Google Drive file link to preview this track.</p>
            ) : (
              <p className="text-[10px] text-slate-500">Choose an MP3 or paste a Drive link to listen before uploading.</p>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 space-y-2">
            <label className="block text-[11px] font-semibold text-slate-300">Thumbnail / cover *</label>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className={fileClass} onChange={(event) => { setCoverFile(event.target.files?.[0] || null); setCoverDriveLink(''); setCoverDriveSelection(null); }} />
            {coverFile && <p className="text-[10px] text-slate-400">{coverFile.name}</p>}
            <DriveLibraryPicker
              kind="image"
              disabled={!driveConnected || uploading}
              onSelect={(file) => {
                setCoverFile(null);
                setCoverDriveLink('');
                setCoverDriveSelection(file);
              }}
            />
            {coverDriveSelection && <p className="text-[10px] text-emerald-300">Using existing artwork: {coverDriveSelection.name}</p>}
            <div className="border-t border-white/10 pt-2">
              <label className="mb-1 block text-[10px] text-slate-400">Or paste an existing Google Drive image share link</label>
              <input className={fieldClass} value={coverDriveLink} onChange={(event) => { setCoverDriveLink(event.target.value); setCoverDriveSelection(null); if (event.target.value) setCoverFile(null); }} placeholder="https://drive.google.com/file/d/..." />
            </div>
            {coverImagePreviewUrl ? (
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] p-3 space-y-2">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-cyan-200">Artwork preview</span>
                <img
                  key={coverImagePreviewUrl}
                  src={coverImagePreviewUrl}
                  alt="Song artwork preview"
                  onError={() => setCoverPreviewError('The image could not be loaded. Check that the Drive image is shared with Anyone with the link.')}
                  className="h-32 w-32 rounded-xl border border-white/10 bg-slate-900 object-cover"
                />
                {coverPreviewError && <p className="text-[10px] text-rose-300">{coverPreviewError}</p>}
              </div>
            ) : (coverFile || coverDriveLink.trim()) ? (
              <p className="text-[10px] text-amber-300">Enter a valid Google Drive file link to preview the artwork.</p>
            ) : (
              <p className="text-[10px] text-slate-500">Choose an image or paste a Drive link to preview the artwork here.</p>
            )}
          </div>
        </div>
        <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Description (optional)</label><textarea className={`${fieldClass} min-h-20 resize-y`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short song description..." maxLength={1000} /></div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/10 pt-4">
          <span className="text-[10px] text-slate-500 flex items-center gap-1.5"><Music2 className="h-3.5 w-3.5" /> Mix Drive folder picks, share links, and direct uploads.</span>
          <button type="submit" disabled={uploading || ((!audioDriveFileId || !coverDriveFileId) && !driveConnected)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-md transition hover:brightness-110 disabled:opacity-40">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading media to Drive…' : 'Upload and publish song'}
          </button>
        </div>
      </form>
    </section>
  );
};
