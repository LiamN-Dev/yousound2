import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage } from '../services/storage';
import { SongRequest } from '../types';
import {
  AlertCircle, CheckCircle, Cloud, Loader2, Music2, RefreshCw, Send, Trash2, Upload, XCircle,
} from 'lucide-react';

type RequestDraft = {
  songTitle: string;
  artist: string;
  genre: string;
  adminNote: string;
};
type QueueFilter = 'all' | 'pending' | 'approved' | 'staging' | 'published' | 'declined';

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
    adminNote: request.adminNote || '',
  };
}

export const AdminPipelineManager: React.FC = () => {
  const {
    songRequests, updateSongRequestStatus, deleteSongRequest, adminUpdateRequest,
    adminPublishRequest, refreshState,
  } = useAuth();

  const [filter, setFilter] = useState<QueueFilter>('all');
  const [drafts, setDrafts] = useState<Record<string, RequestDraft>>({});
  const [driveConnected, setDriveConnected] = useState(false);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [etaDrafts, setEtaDrafts] = useState<Record<string, string>>({});
  const [requestAudioFiles, setRequestAudioFiles] = useState<Record<string, File | null>>({});
  const [requestCoverFiles, setRequestCoverFiles] = useState<Record<string, File | null>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const songOnlyRequests = useMemo(
    () => songRequests.filter((request) => request.requestType !== 'feature'),
    [songRequests],
  );

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      for (const request of songOnlyRequests) if (!next[request.id]) next[request.id] = getDraft(request);
      for (const id of Object.keys(next)) if (!songOnlyRequests.some((request) => request.id === id)) delete next[id];
      return next;
    });
    setEtaDrafts((current) => {
      const next = { ...current };
      for (const request of songOnlyRequests) {
        if (!(request.id in next)) next[request.id] = toDateTimeLocal(request.estimatedUploadAt);
      }
      for (const id of Object.keys(next)) if (!songOnlyRequests.some((request) => request.id === id)) delete next[id];
      return next;
    });
  }, [songOnlyRequests]);

  const orderedRequests = useMemo(() => [...songOnlyRequests].sort((a, b) => {
    const priority = (status: string) => status === 'pending' ? 0 : status === 'approved' ? 1 : status === 'staging' ? 2 : status === 'published' ? 3 : 4;
    return priority(a.status) - priority(b.status) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [songOnlyRequests]);

  const visibleRequests = orderedRequests.filter((request) => filter === 'all' || request.status === filter);
  const inputClass = 'w-full rounded-xl bg-slate-950/70 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400';
  const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';

  const patchDraft = (id: string, updates: Partial<RequestDraft>) => {
    const original = songOnlyRequests.find((request) => request.id === id);
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

  useEffect(() => {
    void refreshDriveStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get('driveConnected') === '1') {
      setFeedback({ type: 'success', message: 'The site-wide Google Drive account is connected. Its access token is stored server-side.' });
      params.delete('driveConnected');
      const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
      void refreshDriveStatus();
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

  const saveRequestDraft = async (request: SongRequest) => {
    const draft = drafts[request.id] || getDraft(request);
    setWorkingId(request.id);
    setFeedback(null);
    try {
      const updated = await adminUpdateRequest(request.id, {
        songTitle: draft.songTitle.trim(),
        artist: draft.artist.trim() || 'Unknown Artist',
        genre: draft.genre.trim() || 'Vibe / Chill',
        adminNote: draft.adminNote,
      });
      if (!updated) throw new Error('The server did not save this request. Refresh and try again.');
      setFeedback({ type: 'success', message: `Saved request details for “${draft.songTitle.trim()}”.` });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Could not save request details.' });
    } finally {
      setWorkingId(null);
    }
  };

  const approveRequest = async (request: SongRequest) => {
    const draft = drafts[request.id] || getDraft(request);
    if (!draft.songTitle.trim()) {
      setFeedback({ type: 'error', message: 'Song title is required.' });
      return;
    }
    const localEta = etaDrafts[request.id] || '';
    const estimatedUploadAt = localEta
      ? new Date(localEta).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setWorkingId(request.id);
    try {
      const updated = await adminUpdateRequest(request.id, {
        songTitle: draft.songTitle.trim(),
        artist: draft.artist.trim() || 'Unknown Artist',
        genre: draft.genre.trim() || 'Vibe / Chill',
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
      setFeedback({ type: 'success', message: 'Upload estimate saved.' });
      refreshState();
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Could not save upload estimate.' });
    } finally {
      setWorkingId(null);
    }
  };

  const uploadRequestMedia = async (request: SongRequest) => {
    const audio = requestAudioFiles[request.id];
    const cover = requestCoverFiles[request.id];
    if (!driveConnected) {
      setFeedback({ type: 'error', message: 'Connect the site-wide Google Drive account before uploading.' });
      return;
    }
    if (!audio || !cover) {
      setFeedback({ type: 'error', message: 'Choose both an MP3 audio file and a cover image.' });
      return;
    }
    if (!/\.mp3$/i.test(audio.name) || (audio.type && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(audio.type.toLowerCase()))) {
      setFeedback({ type: 'error', message: 'Audio upload accepts MP3 files only. No conversion is performed.' });
      return;
    }
    if (audio.size > 150 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'The MP3 is larger than the 150 MB limit.' });
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(cover.type.toLowerCase()) || cover.size > 25 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'Cover images must be JPG, PNG, WEBP, or GIF and no larger than 25 MB.' });
      return;
    }

    setWorkingId(request.id);
    setFeedback({ type: 'info', message: `Uploading “${request.songTitle}” and its cover directly to Google Drive…` });
    try {
      const form = new FormData();
      form.append('audio', audio);
      form.append('cover', cover);
      const response = await fetch(`/api/admin/requests/${encodeURIComponent(request.id)}/upload-media`, {
        method: 'POST', credentials: 'same-origin', body: form,
      });
      const responseText = await response.text();
      let data: any = {};
      try { data = responseText ? JSON.parse(responseText) : {}; } catch { /* A reverse proxy can return HTML for HTTP 413. */ }
      if (!response.ok || !data.success) {
        const statusMessage = response.status === 413
          ? 'The hosting layer rejected this upload before the app could process it. The app limit is 150 MB; check the deployed service/proxy body-size limit.'
          : 'Drive upload failed (' + response.status + ').';
        throw new Error(data.error || statusMessage);
      }
      setRequestAudioFiles((current) => ({ ...current, [request.id]: null }));
      setRequestCoverFiles((current) => ({ ...current, [request.id]: null }));
      await storage.syncWithServer();
      refreshState();
      setFeedback({ type: 'success', message: `“${request.songTitle}” and its artwork are in Drive. Preview it, then publish.` });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Could not upload media to Google Drive.' });
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
      await storage.syncWithServer();
      refreshState();
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
      await storage.syncWithServer();
      refreshState();
      setFeedback({ type: 'success', message: 'Request removed.' });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Could not remove request.' });
    } finally {
      setWorkingId(null);
    }
  };

  const countFor = (value: QueueFilter) => value === 'all'
    ? songOnlyRequests.length
    : songOnlyRequests.filter((request) => request.status === value).length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-bold text-white"><Cloud className="h-4 w-4 text-cyan-300" /> Google Drive media library</div>
            <p className="mt-1 text-xs leading-5 text-slate-300">Approve a song, choose its MP3 and thumbnail here, and upload both files to the site's Google Drive. The files are not saved in Supabase. Preview the Drive-hosted media and publish when ready.</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">MP3: up to 150 MB. Artwork: JPG, PNG, WEBP, or GIF, up to 25 MB. The database stores metadata and Drive references only.</p>
          </div>
          <button type="button" onClick={requestGoogleToken} disabled={connectingDrive} className={`${buttonClass} shrink-0 ${driveConnected ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-cyan-400/30 bg-cyan-500/15 text-cyan-100'}`}>
            {connectingDrive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
            {driveConnected ? 'Site Drive connected' : 'Connect site Drive'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">The site-wide Drive authorization is stored server-side, so the connection is shared by administrators and does not depend on the browser session.</p>
      </div>

      {feedback && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${feedback.type === 'error' ? 'border-rose-400/25 bg-rose-500/10 text-rose-200' : feedback.type === 'success' ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'}`}>
          {feedback.type === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : feedback.type === 'success' ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'approved', 'staging', 'published', 'declined'] as QueueFilter[]).map((value) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition ${filter === value ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'}`}>
            {value === 'all' ? 'All songs' : value[0].toUpperCase() + value.slice(1)} <span className="ml-1 opacity-70">{countFor(value)}</span>
          </button>
        ))}
      </div>

      {visibleRequests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-xs text-slate-500">No song requests in this view.</div>
      ) : (
        <div className="space-y-4">
          {visibleRequests.map((request) => {
            const draft = drafts[request.id] || getDraft(request);
            const busy = workingId === request.id;
            const stagedUrl = request.stagingAudioUrl || request.audioUrl || '';
            return (
              <article key={request.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:p-5">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${request.status === 'published' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : request.status === 'staging' ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200' : request.status === 'declined' ? 'border-rose-400/30 bg-rose-500/10 text-rose-200' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}>{request.status}</span>
                      <span className="text-[10px] text-slate-500">Requested by {request.requestedByUsername} · {new Date(request.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Song title</label><input className={inputClass} value={draft.songTitle} onChange={(event) => patchDraft(request.id, { songTitle: event.target.value })} disabled={busy} /></div>
                      <div><label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Artist</label><input className={inputClass} value={draft.artist} onChange={(event) => patchDraft(request.id, { artist: event.target.value })} disabled={busy} /></div>
                      <div><label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Genre / Mood</label><input className={inputClass} value={draft.genre} onChange={(event) => patchDraft(request.id, { genre: event.target.value })} disabled={busy} /></div>
                    </div>
                    <div className="mt-3"><label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Admin note</label><textarea className={`${inputClass} min-h-16 resize-y`} value={draft.adminNote} onChange={(event) => patchDraft(request.id, { adminNote: event.target.value })} disabled={busy} placeholder="Internal review note or decline reason" /></div>
                    {request.processingProgress && <p className="mt-2 text-[11px] text-slate-400">{request.processingProgress}</p>}
                    {request.processingError && <p className="mt-1 text-[11px] text-rose-300">{request.processingError}</p>}
                  </div>

                  <div className="flex flex-row flex-wrap xl:max-w-64 xl:justify-end gap-2">
                    <button type="button" onClick={() => saveRequestDraft(request)} disabled={busy} className={`${buttonClass} border-white/10 bg-white/[0.04] text-slate-200`}><RefreshCw className="h-3 w-3" /> Save details</button>
                    {['pending', 'processing'].includes(request.status) && <button type="button" onClick={() => approveRequest(request)} disabled={busy} className={`${buttonClass} border-emerald-400/30 bg-emerald-500/15 text-emerald-100`}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />} Approve song for upload</button>}
                    {['pending', 'processing'].includes(request.status) && <button type="button" onClick={() => declineRequest(request)} disabled={busy} className={`${buttonClass} border-rose-400/25 bg-rose-500/10 text-rose-200`}><XCircle className="h-3.5 w-3.5" /> Decline</button>}
                    {request.status === 'staging' && <button type="button" onClick={() => publishRequest(request, true)} disabled={busy || !request.driveFileId || !request.coverUrl} className={`${buttonClass} border-emerald-400/30 bg-emerald-500/15 text-emerald-100`}><Send className="h-3.5 w-3.5" /> Publish</button>}
                    {request.status === 'published' && <button type="button" onClick={() => publishRequest(request, false)} disabled={busy} className={`${buttonClass} border-amber-400/30 bg-amber-500/10 text-amber-100`}>Unpublish</button>}
                    <button type="button" onClick={() => removeRequest(request)} disabled={busy} className={`${buttonClass} border-rose-400/20 bg-rose-500/[0.06] text-rose-300`} title="Remove request"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                {request.status === 'approved' && (
                  <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold text-emerald-100">Approved — waiting for media upload</div>
                      <div className="text-[10px] text-slate-400">Requester can see this status</div>
                    </div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Estimated upload time</label>
                    <input type="datetime-local" className={inputClass} value={etaDrafts[request.id] || ''} onChange={(event) => setEtaDrafts((current) => ({ ...current, [request.id]: event.target.value }))} disabled={busy} />
                    <button type="button" onClick={() => saveUploadEstimate(request)} disabled={busy} className={`${buttonClass} mt-2 border-white/10 bg-white/[0.04] text-slate-200`}>Save estimate</button>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">MP3 audio file (max 150 MB)</label>
                        <input type="file" accept=".mp3,audio/mpeg" onChange={(event) => setRequestAudioFiles((current) => ({ ...current, [request.id]: event.target.files?.[0] || null }))} disabled={busy} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400/15 file:px-2 file:py-1 file:text-cyan-100`} />
                        {requestAudioFiles[request.id] && <div className="mt-1 text-[10px] text-slate-400">{requestAudioFiles[request.id]?.name}</div>}
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cover image (max 25 MB)</label>
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setRequestCoverFiles((current) => ({ ...current, [request.id]: event.target.files?.[0] || null }))} disabled={busy} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400/15 file:px-2 file:py-1 file:text-cyan-100`} />
                        {requestCoverFiles[request.id] && <div className="mt-1 text-[10px] text-slate-400">{requestCoverFiles[request.id]?.name}</div>}
                      </div>
                    </div>
                    <button type="button" onClick={() => uploadRequestMedia(request)} disabled={busy || !driveConnected || !requestAudioFiles[request.id] || !requestCoverFiles[request.id]} className={`${buttonClass} mt-3 border-cyan-400/30 bg-cyan-500/15 text-cyan-100`}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload MP3 + cover to Drive
                    </button>
                  </div>
                )}

                {request.status === 'staging' && request.driveFileId && stagedUrl && (
                  <div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-500/[0.04] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-cyan-100"><Music2 className="h-3.5 w-3.5" /> Drive-hosted media preview</div>
                    <div className="flex items-center gap-3 mb-3">
                      {request.coverUrl && <img src={request.coverUrl} alt="" className="h-16 w-16 rounded-lg border border-white/10 object-cover" />}
                      <audio controls preload="none" src={stagedUrl} className="min-w-0 flex-1" />
                    </div>
                    <span className="text-[10px] text-emerald-200">Audio and artwork are stored in Google Drive; only their references are stored in the database.</span>
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
