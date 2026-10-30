import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage } from '../services/storage';
import { SongRequest } from '../types';
import {
  AlertCircle,
  CheckCircle,
  Cloud,
  ExternalLink,
  Loader2,
  Music2,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';

type RequestDraft = {
  songTitle: string;
  artist: string;
  genre: string;
  coverUrl: string;
  adminNote: string;
};

type QueueFilter = 'all' | 'pending' | 'approved' | 'staging' | 'published' | 'declined' | 'feature';
type MigrationCandidate = { id: string; title: string; artist: string; duration: number };



function toDateTimeLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function getDraft(request: SongRequest): RequestDraft {
  return {
    songTitle: request.songTitle || '',
    artist: request.artist || '',
    genre: request.genre || 'Vibe / Chill',
    coverUrl: request.coverUrl || '',
    adminNote: request.adminNote || '',
  };
}


export const AdminPipelineManager: React.FC = () => {
  const {
    songRequests,
    updateSongRequestStatus,
    deleteSongRequest,
    adminUpdateRequest,
    adminPublishRequest,
    refreshState,
  } = useAuth();

  const [filter, setFilter] = useState<QueueFilter>('all');
  const [drafts, setDrafts] = useState<Record<string, RequestDraft>>({});
  const [driveConnected, setDriveConnected] = useState(false);
  const [migratingSongs, setMigratingSongs] = useState(false);
  const [failedMigrationIds, setFailedMigrationIds] = useState<string[]>([]);
  const [migrationCandidates, setMigrationCandidates] = useState<MigrationCandidate[]>([]);
  const [selectedMigrationSongId, setSelectedMigrationSongId] = useState('');
  const [migrationAudioFile, setMigrationAudioFile] = useState<File | null>(null);
  const [audioInputKey, setAudioInputKey] = useState(0);
  const [uploadingFallback, setUploadingFallback] = useState(false);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [etaDrafts, setEtaDrafts] = useState<Record<string, string>>({});
  const [requestAudioFiles, setRequestAudioFiles] = useState<Record<string, File | null>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  useEffect(() => {
    // Keep edits in this component stable when a background refresh updates requests.
    setDrafts((current) => {
      const next = { ...current };
      for (const request of songRequests) {
        if (!next[request.id]) next[request.id] = getDraft(request);
      }
      for (const id of Object.keys(next)) {
        if (!songRequests.some((request) => request.id === id)) delete next[id];
      }
      return next;
    });
  }, [songRequests]);

  useEffect(() => {
    setEtaDrafts((current) => {
      const next = { ...current };
      for (const request of songRequests) {
        if (!(request.id in next) || (request.status === 'approved' && !next[request.id] && request.estimatedUploadAt)) next[request.id] = toDateTimeLocal(request.estimatedUploadAt);
      }
      for (const id of Object.keys(next)) if (!songRequests.some((request) => request.id === id)) delete next[id];
      return next;
    });
  }, [songRequests]);

  const orderedRequests = useMemo(() => [...songRequests].sort((a, b) => {
    const priority = (status: string) => status === 'pending' ? 0 : status === 'approved' ? 1 : status === 'staging' ? 2 : status === 'published' ? 3 : 4;
    return priority(a.status) - priority(b.status) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [songRequests]);

  const visibleRequests = orderedRequests.filter((request) => {
    if (filter === 'all') return true;
    if (filter === 'feature') return request.requestType === 'feature';
    return request.status === filter;
  });

  const patchDraft = (id: string, updates: Partial<RequestDraft>) => {
    const original = songRequests.find((request) => request.id === id);
    if (!original) return;
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || getDraft(original)), ...updates } }));
  };

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

  const refreshMigrationCandidates = async () => {
    try {
      const response = await fetch('/api/admin/google-drive/migration-candidates', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not load migration candidates.');
      const candidates: MigrationCandidate[] = Array.isArray(data.candidates) ? data.candidates : [];
      setMigrationCandidates(candidates);
      setSelectedMigrationSongId((current) => candidates.some((song) => song.id === current) ? current : (candidates[0]?.id || ''));
    } catch (error) {
      console.warn('[YouSong] Could not refresh migration candidates:', error);
    }
  };

  useEffect(() => {
    void refreshDriveStatus();
    void refreshMigrationCandidates();
    const params = new URLSearchParams(window.location.search);
    if (params.get('driveConnected') === '1') {
      setFeedback({ type: 'success', message: 'The site-wide Google Drive account is connected. Render will refresh its access token automatically.' });
      params.delete('driveConnected');
      const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
      void refreshDriveStatus();
      void refreshMigrationCandidates();
    }
  }, []);

  const requestGoogleToken = async () => {
    setConnectingDrive(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/admin/google-drive/auth-url', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Could not start Google Drive authorization. Check Render environment variables.');
      window.location.assign(data.url);
    } catch (error: any) {
      setConnectingDrive(false);
      setFeedback({ type: 'error', message: error?.message || 'Unable to connect Google Drive.' });
    }
  };

  const migrateExistingSongs = async () => {
    if (!driveConnected) {
      setFeedback({ type: 'error', message: 'Connect the site-wide Google Drive account first.' });
      return;
    }
    if (!rightsConfirmed) {
      setFeedback({ type: 'error', message: 'Confirm you have the rights to re-host the existing tracks before migrating them.' });
      return;
    }
    if (!window.confirm('Migrate up to 3 existing non-Drive songs to the site Google Drive account? Only continue for audio you own or are licensed to re-host. Original song URLs are replaced only after upload succeeds.')) return;
    setMigratingSongs(true);
    setFeedback({ type: 'info', message: 'Migrating a small batch of existing songs to Google Drive…' });
    try {
      const response = await fetch('/api/admin/google-drive/migrate-songs', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rightsConfirmed: true, limit: 3, excludeIds: failedMigrationIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Migration failed.');
      const migrated = (data.results || []).filter((item: any) => item.status === 'migrated').length;
      const failedItems = (data.results || []).filter((item: any) => item.status === 'failed');
      const failed = failedItems.length;
      setFailedMigrationIds((current) => Array.from(new Set([...current, ...failedItems.map((item: any) => String(item.id))])));
      setFeedback({ type: failed ? 'error' : 'success', message: `Batch complete: ${migrated} migrated, ${failed} failed. ${data.remainingNonDriveSongs} non-Drive songs remain. ${data.results?.filter((item: any) => item.status === 'failed').map((item: any) => `${item.title}: ${item.error}`).join(' | ') || ''}` });
      await storage.syncWithServer();
      refreshState();
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Song migration failed.' });
    } finally {
      setMigratingSongs(false);
      void refreshDriveStatus();
      void refreshMigrationCandidates();
    }
  };

  const uploadFallbackAudio = async () => {
    if (!driveConnected) {
      setFeedback({ type: 'error', message: 'Connect the site-wide Google Drive account first.' });
      return;
    }
    if (!rightsConfirmed) {
      setFeedback({ type: 'error', message: 'Confirm you have the rights to re-host this audio file.' });
      return;
    }
    if (!selectedMigrationSongId) {
      setFeedback({ type: 'error', message: 'Select the library song that matches this audio file.' });
      return;
    }
    if (!migrationAudioFile) {
      setFeedback({ type: 'error', message: 'Choose an audio file first.' });
      return;
    }
    if (migrationAudioFile.size > 100 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'The upload is larger than 100 MB. Choose a smaller audio file.' });
      return;
    }

    const selected = migrationCandidates.find((song) => song.id === selectedMigrationSongId);
    if (!window.confirm(`Upload audio for “${selected?.title || 'this song'}” to the site Google Drive and replace its current playback URL only after the upload succeeds?`)) return;

    setUploadingFallback(true);
    setFeedback({ type: 'info', message: 'Converting the uploaded audio to MP3 and uploading it to Google Drive…' });
    try {
      const form = new FormData();
      form.append('songId', selectedMigrationSongId);
      form.append('rightsConfirmed', 'true');
      form.append('audio', migrationAudioFile);
      const response = await fetch('/api/admin/google-drive/migrate-uploaded-audio', {
        method: 'POST', credentials: 'same-origin', body: form,
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not upload the audio file to Google Drive.');
      setFeedback({ type: 'success', message: `“${data.title || selected?.title || 'Song'}” is now stored in the site Google Drive and playback has been updated.` });
      setMigrationAudioFile(null);
      await storage.syncWithServer();
      refreshState();
      setAudioInputKey((current) => current + 1);
      void refreshMigrationCandidates();
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Manual audio upload failed.' });
    } finally {
      setUploadingFallback(false);
      void refreshDriveStatus();
    }
  };

  const saveRequestDraft = async (request: SongRequest) => {
    const draft = drafts[request.id] || getDraft(request);
    setWorkingId(request.id);
    setFeedback(null);
    try {
      const updated = await adminUpdateRequest(request.id, {
        songTitle: draft.songTitle.trim(),
        artist: draft.artist.trim(),
        genre: draft.genre.trim() || 'Vibe / Chill',
        coverUrl: draft.coverUrl.trim(),
        adminNote: draft.adminNote,
      });
      if (!updated) throw new Error('The server did not save this request. Refresh and try again.');
      setFeedback({ type: 'success', message: `Saved request metadata for “${draft.songTitle.trim()}”.` });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Could not save request metadata.' });
    } finally {
      setWorkingId(null);
    }
  };

  const approveRequest = async (request: SongRequest) => {
    const draft = drafts[request.id] || getDraft(request);
    if (request.requestType === 'feature') return;
    if (!draft.songTitle.trim() || !draft.artist.trim()) {
      setFeedback({ type: 'error', message: 'Song title and artist are required.' });
      return;
    }
    const localEta = etaDrafts[request.id] || '';
    const estimatedUploadAt = localEta ? new Date(localEta).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setWorkingId(request.id);
    try {
      const updated = await adminUpdateRequest(request.id, {
        songTitle: draft.songTitle.trim(),
        artist: draft.artist.trim(),
        genre: draft.genre.trim() || 'Vibe / Chill',
        coverUrl: draft.coverUrl.trim(),
        adminNote: draft.adminNote,
        status: 'approved',
        estimatedUploadAt,
      });
      if (!updated || updated.status !== 'approved') throw new Error('The server did not save approval. Refresh and try again.');
      setFeedback({ type: 'success', message: `“${updated.songTitle}” approved and placed in the upload waiting room.` });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Could not approve request.' });
    } finally {
      setWorkingId(null);
    }
  };

  const saveUploadEstimate = async (request: SongRequest) => {
    setWorkingId(request.id);
    try {
      const updated = await adminUpdateRequest(request.id, {
        estimatedUploadAt: etaDrafts[request.id] ? new Date(etaDrafts[request.id]).toISOString() : null,
      });
      if (!updated) throw new Error('The upload estimate was not saved.');
      refreshState();
      setFeedback({ type: 'success', message: 'Upload estimate saved.' });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Could not save upload estimate.' });
    } finally {
      setWorkingId(null);
    }
  };

  const uploadRequestAudio = async (request: SongRequest) => {
    const file = requestAudioFiles[request.id];
    if (!driveConnected) {
      setFeedback({ type: 'error', message: 'Connect the site-wide Google Drive account before uploading.' });
      return;
    }
    if (!file) {
      setFeedback({ type: 'error', message: 'Choose an MP3 file first.' });
      return;
    }
    if (!/\.mp3$/i.test(file.name) || (file.type && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(file.type.toLowerCase()))) {
      setFeedback({ type: 'error', message: 'This upload accepts MP3 files only. No conversion will be performed.' });
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'The MP3 is larger than the 100 MB upload limit.' });
      return;
    }
    setWorkingId(request.id);
    setFeedback({ type: 'info', message: `Uploading “${request.songTitle}” directly to Google Drive…` });
    try {
      const form = new FormData();
      form.append('audio', file);
      const response = await fetch(`/api/admin/requests/${encodeURIComponent(request.id)}/upload-audio`, {
        method: 'POST', credentials: 'same-origin', body: form,
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'MP3 upload failed.');
      setRequestAudioFiles((current) => ({ ...current, [request.id]: null }));
      await storage.syncWithServer();
      refreshState();
      setFeedback({ type: 'success', message: `“${request.songTitle}” is uploaded to Drive and waiting for you to publish it.` });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Could not upload MP3.' });
    } finally {
      setWorkingId(null);
    }
  };

  const publishRequest = async (request: SongRequest, publish: boolean) => {
    setWorkingId(request.id);
    setFeedback(null);
    try {
      const result = await adminPublishRequest(request.id, publish, false);
      if (!result.success) throw new Error(result.error || (publish ? 'Publish failed.' : 'Unpublish failed.'));
      setFeedback({ type: 'success', message: publish ? `“${request.songTitle}” is published in the song library.` : `“${request.songTitle}” is unpublished and returned to staging.` });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Unable to update publishing status.' });
    } finally {
      setWorkingId(null);
    }
  };

  const declineRequest = async (request: SongRequest) => {
    const draft = drafts[request.id] || getDraft(request);
    const note = draft.adminNote.trim() || 'Declined by administrator';
    setWorkingId(request.id);
    try {
      await updateSongRequestStatus(request.id, 'declined', note);
      setFeedback({ type: 'success', message: `Declined “${request.songTitle}”.` });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Could not decline request.' });
    } finally {
      setWorkingId(null);
    }
  };

  const removeRequest = async (request: SongRequest) => {
    const keepPublishedSong = request.status === 'published';
    const prompt = keepPublishedSong
      ? `Remove “${request.songTitle}” from the request queue but keep its published song in the library?`
      : `Permanently delete the request for “${request.songTitle}”?`;
    if (!window.confirm(prompt)) return;
    setWorkingId(request.id);
    try {
      await deleteSongRequest(request.id, keepPublishedSong);
      setFeedback({ type: 'success', message: 'Request removed.' });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Could not remove request.' });
    } finally {
      setWorkingId(null);
    }
  };

  const countFor = (value: QueueFilter) => {
    if (value === 'all') return songRequests.length;
    if (value === 'feature') return songRequests.filter((request) => request.requestType === 'feature').length;
    return songRequests.filter((request) => request.status === value).length;
  };

  const inputClass = 'w-full rounded-xl bg-slate-950/70 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400';
  const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-bold text-white"><Cloud className="h-4 w-4 text-cyan-300" /> Google Drive MP3 archive</div>
            <p className="mt-1 text-xs leading-5 text-slate-300">Approve a song to move it into the upload waiting room. Upload an MP3 directly to the site Google Drive, then publish it when ready. No downloading or audio conversion is performed.</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">Request uploads accept MP3 files up to 100 MB. Playback streams from Drive rather than through the app server.</p>
          </div>
          <button type="button" onClick={requestGoogleToken} disabled={connectingDrive} className={`${buttonClass} shrink-0 ${driveConnected ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-cyan-400/30 bg-cyan-500/15 text-cyan-100'}`}>
            {connectingDrive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
            {driveConnected ? 'Site Drive connected' : 'Connect site Drive'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">The Drive account is stored server-side for the whole site. Admins do not need to reconnect each browser session.</p>
        <button type="button" onClick={migrateExistingSongs} disabled={!driveConnected || migratingSongs} className={`${buttonClass} mt-3 border-amber-400/30 bg-amber-500/10 text-amber-100`}>
          {migratingSongs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {migratingSongs ? 'Migrating existing songs…' : 'Migrate existing songs to Drive (3 per batch)'}
        </button>
        <label className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-300">
          <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-1 accent-cyan-400" />
          For existing-library migration only: I confirm I have permission to re-host those audio files. This does not apply to the manual MP3 request upload.
        </label>
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-white"><Upload className="h-4 w-4 text-cyan-300" /> YouTube blocked? Upload an audio file instead</div>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">If YouTube rate-limits the server, choose an audio file you already have permission to use. The server converts it to MP3 and uploads it straight to Drive. The song’s playback URL changes only after the upload succeeds. Maximum file size: 100 MB.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
            <select value={selectedMigrationSongId} onChange={(event) => setSelectedMigrationSongId(event.target.value)} disabled={!migrationCandidates.length || uploadingFallback} className={inputClass}>
              <option value="">{migrationCandidates.length ? 'Choose a song to migrate…' : 'No songs currently need migration'}</option>
              {migrationCandidates.map((song) => <option key={song.id} value={song.id}>{song.title} — {song.artist}</option>)}
            </select>
            <input key={audioInputKey} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.aif,.aiff" onChange={(event) => setMigrationAudioFile(event.target.files?.[0] || null)} disabled={uploadingFallback} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400/15 file:px-2 file:py-1 file:text-cyan-100`} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={uploadFallbackAudio} disabled={!driveConnected || !rightsConfirmed || !selectedMigrationSongId || !migrationAudioFile || uploadingFallback} className={`${buttonClass} border-cyan-400/30 bg-cyan-500/10 text-cyan-100`}>
              {uploadingFallback ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploadingFallback ? 'Uploading to Drive…' : 'Convert & upload selected audio'}
            </button>
            <button type="button" onClick={() => void refreshMigrationCandidates()} disabled={uploadingFallback} className={`${buttonClass} border-white/10 bg-white/[0.03] text-slate-300`}>Refresh song list</button>
            {migrationAudioFile && <span className="text-[11px] text-slate-400">{migrationAudioFile.name} ({(migrationAudioFile.size / (1024 * 1024)).toFixed(1)} MB)</span>}
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${feedback.type === 'error' ? 'border-rose-400/25 bg-rose-500/10 text-rose-200' : feedback.type === 'success' ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'}`}>
          {feedback.type === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : feedback.type === 'success' ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'approved', 'staging', 'published', 'declined', 'feature'] as QueueFilter[]).map((value) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition ${filter === value ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'}`}>
            {value === 'all' ? 'All requests' : value === 'feature' ? 'Feature requests' : value[0].toUpperCase() + value.slice(1)} <span className="ml-1 opacity-70">{countFor(value)}</span>
          </button>
        ))}
      </div>

      {visibleRequests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-xs text-slate-500">No requests in this view.</div>
      ) : (
        <div className="space-y-4">
          {visibleRequests.map((request) => {
            const draft = drafts[request.id] || getDraft(request);
            const busy = workingId === request.id;
            const isFeature = request.requestType === 'feature';
            const stagedUrl = request.stagingAudioUrl || request.audioUrl || '';
            return (
              <article key={request.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:p-5">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${request.status === 'published' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : request.status === 'staging' ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200' : request.status === 'declined' ? 'border-rose-400/30 bg-rose-500/10 text-rose-200' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}>{request.status}</span>
                      <span className="text-[10px] text-slate-500">Requested by {request.requestedByUsername} · {new Date(request.createdAt).toLocaleString()}</span>
                      {isFeature && <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[10px] text-violet-200">Feature request</span>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Song title</label>
                        <input className={inputClass} value={draft.songTitle} onChange={(event) => patchDraft(request.id, { songTitle: event.target.value })} disabled={busy} />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Artist</label>
                        <input className={inputClass} value={draft.artist} onChange={(event) => patchDraft(request.id, { artist: event.target.value })} disabled={busy} />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Genre</label>
                        <input className={inputClass} value={draft.genre} onChange={(event) => patchDraft(request.id, { genre: event.target.value })} disabled={busy} />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cover image URL</label>
                        <input className={inputClass} value={draft.coverUrl} onChange={(event) => patchDraft(request.id, { coverUrl: event.target.value })} disabled={busy} placeholder="Optional image URL" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Admin note</label>
                      <textarea className={`${inputClass} min-h-16 resize-y`} value={draft.adminNote} onChange={(event) => patchDraft(request.id, { adminNote: event.target.value })} disabled={busy} placeholder="Internal review note or decline reason" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
                      {request.webLink && <a href={request.webLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-100"><ExternalLink className="h-3 w-3" /> Open source link</a>}
                      {request.processingProgress && <span className="text-slate-400">{request.processingProgress}</span>}
                      {request.processingError && <span className="text-rose-300">{request.processingError}</span>}
                    </div>
                  </div>

                  <div className="flex flex-row flex-wrap xl:max-w-64 xl:justify-end gap-2">
                    <button type="button" onClick={() => saveRequestDraft(request)} disabled={busy} className={`${buttonClass} border-white/10 bg-white/[0.04] text-slate-200`}><RefreshCw className="h-3 w-3" /> Save details</button>
                    {!isFeature && ['pending', 'processing'].includes(request.status) && (
                      <>
                        <button type="button" onClick={() => approveRequest(request)} disabled={busy} className={`${buttonClass} border-emerald-400/30 bg-emerald-500/15 text-emerald-100`}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />} Approve song for upload
                        </button>
                        <button type="button" onClick={() => declineRequest(request)} disabled={busy} className={`${buttonClass} border-rose-400/25 bg-rose-500/10 text-rose-200`}><XCircle className="h-3.5 w-3.5" /> Decline</button>
                      </>
                    )}
                    {request.status === 'staging' && (
                      <button type="button" onClick={() => publishRequest(request, true)} disabled={busy || !request.driveFileId || !String(request.audioUrl || '').startsWith('https://drive.google.com/uc?export=download&id=')} className={`${buttonClass} border-emerald-400/30 bg-emerald-500/15 text-emerald-100`}><Send className="h-3.5 w-3.5" /> Publish</button>
                    )}
                    {request.status === 'published' && (
                      <button type="button" onClick={() => publishRequest(request, false)} disabled={busy} className={`${buttonClass} border-amber-400/30 bg-amber-500/10 text-amber-100`}>Unpublish</button>
                    )}
                    <button type="button" onClick={() => removeRequest(request)} disabled={busy} className={`${buttonClass} border-rose-400/20 bg-rose-500/[0.06] text-rose-300`} title="Remove request"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                {request.status === 'approved' && (
                  <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold text-emerald-100">Approved — waiting for MP3 upload</div>
                      <div className="text-[10px] text-slate-400">Requester can see this status</div>
                    </div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Estimated upload time</label>
                    <input type="datetime-local" className={inputClass} value={etaDrafts[request.id] || ''} onChange={(event) => setEtaDrafts((current) => ({ ...current, [request.id]: event.target.value }))} disabled={busy} />
                    <button type="button" onClick={() => saveUploadEstimate(request)} disabled={busy} className={`${buttonClass} mt-2 border-white/10 bg-white/[0.04] text-slate-200`}>Save estimate</button>
                    <div className="mt-3">
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Choose MP3 file (max 100 MB)</label>
                      <input type="file" accept=".mp3,audio/mpeg" onChange={(event) => setRequestAudioFiles((current) => ({ ...current, [request.id]: event.target.files?.[0] || null }))} disabled={busy} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400/15 file:px-2 file:py-1 file:text-cyan-100`} />
                      {requestAudioFiles[request.id] && <div className="mt-1 text-[10px] text-slate-400">{requestAudioFiles[request.id]?.name}</div>}
                      <button type="button" onClick={() => uploadRequestAudio(request)} disabled={busy || !driveConnected || !requestAudioFiles[request.id]} className={`${buttonClass} mt-2 border-cyan-400/30 bg-cyan-500/15 text-cyan-100`}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload MP3 to Drive
                      </button>
                    </div>
                  </div>
                )}
                {request.status === 'staging' && request.driveFileId && stagedUrl && (
                  <div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-500/[0.04] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-cyan-100"><Music2 className="h-3.5 w-3.5" /> Staged MP3 preview</div>
                    <audio controls preload="none" src={stagedUrl} className="w-full" />
                    <div className="mt-2 break-all text-[10px] text-slate-500">{stagedUrl}</div>
                  </div>
                )}
                {request.status === 'staging' && !request.driveFileId && (
                  <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.05] p-3 text-[11px] text-amber-100">
                    This request has no Drive MP3 yet. Upload an MP3 directly to continue.
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
