import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Copy, ExternalLink, Hash, Loader2,
  RefreshCw, Search, Shuffle, Sparkles, Music2, Image as ImageIcon,
} from 'lucide-react';
import { Song } from '../types';
import { useAudio } from '../context/AudioContext';
import { storage } from '../services/storage';

type MediaIdStatus = 'assigned' | 'reserved' | 'retired';
interface MediaIdRecord {
  code: string;
  status: MediaIdStatus;
  songId?: string | null;
  requestId?: string | null;
  title?: string | null;
  artist?: string | null;
  audioFileId?: string | null;
  artworkFileId?: string | null;
}
interface BackfillResult {
  songId: string;
  title: string;
  mediaCode?: string;
  status: 'updated' | 'unchanged' | 'error';
  detail: string;
}
interface Props {
  songs: Song[];
  onEditSong: (song: Song) => void;
}

export const AdminMediaIdManager: React.FC<Props> = ({ songs, onEditSong }) => {
  const { refreshSongLibrary } = useAudio();
  const [registry, setRegistry] = useState<MediaIdRecord[]>([]);
  const [availableCount, setAvailableCount] = useState(1000);
  const [missingSongIds, setMissingSongIds] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | MediaIdStatus>('all');
  const [generateCount, setGenerateCount] = useState('5');
  const [generated, setGenerated] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [error, setError] = useState('');
  const [backfillResults, setBackfillResults] = useState<BackfillResult[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/media-ids', { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not load the Media ID Bank.');
      setRegistry(Array.isArray(data.registry) ? data.registry : []);
      setAvailableCount(Number(data.availableCount) || 0);
      setMissingSongIds(Number(data.missingSongIds) || 0);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load Media IDs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const songById = useMemo(() => new Map<string, Song>(songs.map((song) => [song.id, song])), [songs]);
  const records = useMemo(() => {
    const registered = new Set(registry.map((item) => item.code));
    const untracked = songs
      .filter((song) => /^[0-9]{3}$/.test(String(song.mediaCode || '')) && !registered.has(String(song.mediaCode)))
      .map((song): MediaIdRecord => ({
        code: String(song.mediaCode), status: 'assigned', songId: song.id,
        title: song.title, artist: song.artist,
      }));
    return [...registry, ...untracked].sort((a, b) => a.code.localeCompare(b.code));
  }, [registry, songs]);

  const assignedCount = records.filter((item) => item.status === 'assigned').length;
  const reservedCount = records.filter((item) => item.status === 'reserved').length;
  const retiredCount = records.filter((item) => item.status === 'retired').length;
  const visibleRecords = useMemo(() => records.filter((item) => {
    if (filter !== 'all' && item.status !== filter) return false;
    const song = item.songId ? songById.get(item.songId) : undefined;
    const haystack = [item.code, item.title, item.artist, song?.title, song?.artist].join(' ').toLowerCase();
    return !search.trim() || haystack.includes(search.trim().toLowerCase());
  }), [records, filter, search, songById]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const response = await fetch('/api/admin/media-ids/generate', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: Number(generateCount) || 1 }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not generate IDs.');
      setGenerated(Array.isArray(data.generated) ? data.generated : []);
      await load();
    } catch (generateError: any) {
      setError(generateError?.message || 'Could not generate IDs.');
    } finally {
      setGenerating(false);
    }
  };

  const handleBackfill = async () => {
    const confirmed = window.confirm(
      'Assign Media IDs to the existing song library? YouSong will inspect Drive metadata, preserve a valid unused ID where possible, rename accessible audio and artwork files, and report songs that need attention. It will not download complete media files.'
    );
    if (!confirmed) return;
    setBackfilling(true);
    setError('');
    setBackfillResults(null);
    try {
      const response = await fetch('/api/admin/media-ids/backfill', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'The Media ID backfill did not complete.');
      setBackfillResults(Array.isArray(data.results) ? data.results : []);
      await storage.syncWithServer();
      refreshSongLibrary();
      await load();
      if (Number(data.errorCount) > 0) {
        setError(String(data.updatedCount || 0) + ' updated, ' + String(data.unchangedCount || 0) + ' already correct, ' + String(data.errorCount) + ' need attention. Review the results below.');
      }
    } catch (backfillError: any) {
      setError(backfillError?.message || 'Could not assign IDs to the existing library.');
    } finally {
      setBackfilling(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const field = document.createElement('textarea');
      field.value = code;
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
  };

  const openDriveFile = (fileId?: string | null) => {
    if (!fileId) return;
    window.open('https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/view', '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="media-id-manager space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300 text-xs font-bold uppercase tracking-[0.16em]">
            <Hash className="w-4 h-4" /> Library organization
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white mt-2">Media ID Bank</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            One private identifier connects each song to its audio file, artwork, and Google Drive records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void load()} disabled={loading || backfilling} className="media-id-secondary-button">
            <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Refresh
          </button>
          <button onClick={() => void handleBackfill()} disabled={backfilling || loading || songs.length === 0} className="media-id-primary-button">
            {backfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {backfilling ? 'Scanning library…' : 'Assign IDs to existing songs' + (missingSongIds ? ' (' + missingSongIds + ')' : '')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'Assigned', value: assignedCount, tone: 'blue' },
          { label: 'Reserved', value: reservedCount, tone: 'violet' },
          { label: 'Available', value: availableCount, tone: 'emerald' },
          { label: 'Retired', value: retiredCount, tone: 'slate' },
        ].map((metric) => (
          <div key={metric.label} className="media-id-stat-card">
            <span className="text-xs text-slate-500 dark:text-slate-400">{metric.label}</span>
            <strong className="text-2xl sm:text-3xl text-slate-950 dark:text-white tabular-nums mt-1">{metric.value.toLocaleString()}</strong>
            <span className={'media-id-stat-dot ' + metric.tone} />
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.78fr)] gap-4">
        <div className="media-id-panel p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-blue-600 dark:text-blue-300" />
            <h3 className="font-bold text-slate-950 dark:text-white">ID generator</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Generate available numbers in advance and reserve them for upcoming songs.</p>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <select value={generateCount} onChange={(event) => setGenerateCount(event.target.value)} className="media-id-input sm:max-w-32">
              <option value="1">1 ID</option>
              <option value="5">5 IDs</option>
              <option value="10">10 IDs</option>
              <option value="20">20 IDs</option>
            </select>
            <button onClick={() => void handleGenerate()} disabled={generating || loading || availableCount < Number(generateCount)} className="media-id-primary-button flex-1">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
              Generate and reserve
            </button>
          </div>
          {generated.length > 0 && (
            <div className="mt-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-3">
              <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mb-2">Reserved IDs — click to copy</div>
              <div className="flex flex-wrap gap-2">
                {generated.map((code) => (
                  <button key={code} onClick={() => void copyCode(code)} className="font-mono tabular-nums text-sm px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-100 inline-flex items-center gap-1.5">
                    {code} <Copy className="w-3 h-3" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="media-id-panel p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-slate-950 dark:text-white">Capacity and rules</h3>
          </div>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 mt-2">
            Three digits provide 1,000 IDs (000–999). Assigned, reserved, and retired numbers are not silently reused.
          </p>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 mt-2">
            The library scan reads Drive metadata, repairs matching filenames, and looks for artwork using the exact three-digit suffix. It does not download entire media files.
          </p>
        </div>
      </div>

      {error && <div className="media-id-alert"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}

      {backfillResults && (
        <div className="media-id-panel p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-bold text-slate-950 dark:text-white">Library scan results</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {backfillResults.filter((item) => item.status !== 'error').length} / {backfillResults.length} processed
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-white/10">
            {backfillResults.filter((item) => item.status === 'error').map((item) => (
              <div key={item.songId} className="py-2.5 flex items-start gap-2 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div><strong className="text-slate-900 dark:text-white">{item.title}</strong><p className="text-slate-500 dark:text-slate-400 mt-0.5">{item.detail}</p></div>
              </div>
            ))}
            {!backfillResults.some((item) => item.status === 'error') && (
              <div className="py-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" /> All existing songs were processed without errors.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="media-id-panel overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-950 dark:text-white">Identifier directory</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Select an assigned number to open that song's editor.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, song, artist…" className="media-id-input pl-9 w-full sm:w-64" />
            </div>
            <select value={filter} onChange={(event) => setFilter(event.target.value as any)} className="media-id-input sm:w-36">
              <option value="all">All statuses</option>
              <option value="assigned">Assigned</option>
              <option value="reserved">Reserved</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="p-10 flex justify-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : visibleRecords.length === 0 ? (
          <div className="p-10 text-center">
            <Hash className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-3">No matching identifiers</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Generate a reserved ID or run the library scan to populate the bank.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {visibleRecords.map((record) => {
              const song = record.songId ? songById.get(record.songId) : songs.find((item) => item.mediaCode === record.code);
              return (
                <div key={record.code} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.025] transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button onClick={() => song ? onEditSong(song) : void copyCode(record.code)} title={song ? "Open song" : "Copy Media ID"} className="w-16 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 py-2 text-center font-mono font-bold text-lg tabular-nums text-slate-950 dark:text-white hover:border-blue-400 transition-colors">
                      {record.code}
                    </button>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">{record.title || song?.title || (record.status === 'retired' ? 'Retired identifier' : 'Reserved for later')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{record.artist || song?.artist || (record.requestId ? 'Reserved by a song request' : 'Not assigned to a song')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <span className={'media-id-status ' + record.status}>{record.status === 'assigned' ? 'Assigned' : record.status === 'reserved' ? 'Reserved' : 'Retired'}</span>
                    {record.audioFileId && <button onClick={() => openDriveFile(record.audioFileId)} title="Open audio in Drive" className="media-id-icon-button"><Music2 className="w-4 h-4" /></button>}
                    {record.artworkFileId && <button onClick={() => openDriveFile(record.artworkFileId)} title="Open artwork in Drive" className="media-id-icon-button"><ImageIcon className="w-4 h-4" /></button>}
                    {song && <button onClick={() => onEditSong(song)} className="media-id-open-button">Open song <ExternalLink className="w-3 h-3" /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
