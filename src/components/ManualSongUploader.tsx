import React, { useEffect, useMemo, useState } from 'react';
import { useAudio } from '../context/AudioContext';
import { storage } from '../services/storage';
import { CheckCircle, Cloud, Loader2, Music2, Upload, XCircle } from 'lucide-react';

type Feedback = { type: 'success' | 'error' | 'info'; message: string } | null;

export const ManualSongUploader: React.FC = () => {
  const { addNewSong } = useAudio();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('Lo-Fi');
  const [mood, setMood] = useState('');
  const [album, setAlbum] = useState('Single');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [driveConnected, setDriveConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const coverPreview = useMemo(() => coverFile ? URL.createObjectURL(coverFile) : '', [coverFile]);

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

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
    if (!audioFile || !coverFile) return setFeedback({ type: 'error', message: 'Choose both an MP3 and a cover image.' });
    if (!/\.mp3$/i.test(audioFile.name) || (audioFile.type && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(audioFile.type.toLowerCase()))) {
      return setFeedback({ type: 'error', message: 'Only MP3 audio files are accepted. This uploader does not convert audio.' });
    }
    if (audioFile.size > 100 * 1024 * 1024) return setFeedback({ type: 'error', message: 'The MP3 must be 100 MB or smaller.' });
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(coverFile.type.toLowerCase()) || coverFile.size > 25 * 1024 * 1024) {
      return setFeedback({ type: 'error', message: 'Use a JPG, PNG, WEBP, or GIF cover no larger than 25 MB.' });
    }
    if (!driveConnected) return setFeedback({ type: 'error', message: 'Connect the site Google Drive account before uploading.' });

    setUploading(true);
    setFeedback({ type: 'info', message: 'Uploading the MP3 and artwork directly to Google Drive…' });
    try {
      const form = new FormData();
      form.append('title', title.trim());
      form.append('artist', artist.trim());
      form.append('audio', audioFile);
      form.append('cover', coverFile);
      const response = await fetch('/api/admin/library/upload-media', {
        method: 'POST', credentials: 'same-origin', body: form,
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.audioUrl || !data.coverUrl) {
        throw new Error(data.error || 'Google Drive did not return both media files.');
      }

      await addNewSong({
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim() || 'Single',
        genre: genre.trim() || 'Other',
        tags: Array.from(new Set(tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))),
        typeMood: mood.trim() || undefined,
        duration: Number(data.duration) || 180,
        audioUrl: data.audioUrl,
        coverUrl: data.coverUrl,
        featured: false,
        description: description.trim(),
      });
      await storage.syncWithServer();

      setTitle('');
      setArtist('');
      setGenre('Lo-Fi');
      setMood('');
      setAlbum('Single');
      setDescription('');
      setTags('');
      setAudioFile(null);
      setCoverFile(null);
      setFeedback({ type: 'success', message: 'Song published to the library. Its MP3 and cover are stored in Google Drive.' });
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
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Song title *</label><input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Song title" maxLength={150} /></div>
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Artist *</label><input className={fieldClass} value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Artist name" maxLength={150} /></div>
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Genre</label><input className={fieldClass} value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Genre" maxLength={80} /></div>
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Mood</label><input className={fieldClass} value={mood} onChange={(event) => setMood(event.target.value)} placeholder="Mood / vibe" maxLength={80} /></div>
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Album</label><input className={fieldClass} value={album} onChange={(event) => setAlbum(event.target.value)} placeholder="Single" maxLength={150} /></div>
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Tags (comma separated)</label><input className={fieldClass} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="study, focus, relaxing" /></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
            <label className="mb-2 block text-[11px] font-semibold text-slate-300">MP3 audio file * <span className="font-normal text-slate-500">(max 100 MB)</span></label>
            <input type="file" accept=".mp3,audio/mpeg" className={fileClass} onChange={(event) => setAudioFile(event.target.files?.[0] || null)} />
            {audioFile && <p className="mt-2 text-[10px] text-slate-400">{audioFile.name} · {(audioFile.size / (1024 * 1024)).toFixed(1)} MB</p>}
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
            <label className="mb-2 block text-[11px] font-semibold text-slate-300">Thumbnail / cover * <span className="font-normal text-slate-500">(max 25 MB)</span></label>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className={fileClass} onChange={(event) => setCoverFile(event.target.files?.[0] || null)} />
            {coverPreview && <img src={coverPreview} alt="Cover preview" className="mt-2 h-20 w-20 rounded-xl border border-white/10 object-cover" />}
            {coverFile && <p className="mt-2 text-[10px] text-slate-400">{coverFile.name}</p>}
          </div>
        </div>
        <div><label className="mb-1 block text-[11px] font-semibold text-slate-300">Description (optional)</label><textarea className={`${fieldClass} min-h-20 resize-y`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short song description..." maxLength={1000} /></div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/10 pt-4">
          <span className="text-[10px] text-slate-500 flex items-center gap-1.5"><Music2 className="h-3.5 w-3.5" /> Both files go to Drive; no share links to paste.</span>
          <button type="submit" disabled={uploading || !driveConnected} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-md transition hover:brightness-110 disabled:opacity-40">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading media to Drive…' : 'Upload and publish song'}
          </button>
        </div>
      </form>
    </section>
  );
};
