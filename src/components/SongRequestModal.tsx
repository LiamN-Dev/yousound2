import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage } from '../services/storage';
import { FeedbackItem } from '../types';
import { markAllSeen, refreshFeedback, getFeedbackState, subscribeFeedback } from '../services/feedbackNotifications';
import {
  X,
  Music,
  Send,
  Sparkles,
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  XCircle,
  ListPlus,
  Image as ImageIcon,
  ShieldCheck,
  Headphones,
  ExternalLink,
  Radio,
  Lightbulb,
  Bug,
  ListChecks,
} from 'lucide-react';

interface SongRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which section to show when the popup opens */
  initialMode?: 'song' | 'feature' | 'bug' | 'mine';
}

const PRESET_COVERS = [
  {
    name: 'Lo-fi Study',
    url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=500&auto=format&fit=crop&q=80',
  },
  {
    name: 'Synthwave Sunset',
    url: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80',
  },
  {
    name: 'Vinyl Mood',
    url: 'https://images.unsplash.com/photo-1539185441755-769473a23570?w=500&auto=format&fit=crop&q=80',
  },
  {
    name: 'Neon Cyber',
    url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
  },
  {
    name: 'Coffee Chill',
    url: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&auto=format&fit=crop&q=80',
  },
];

const STAGE_LABELS = ['Submitted', 'In progress', 'Finished'];

function stageIndex(status: string): number {
  if (status === 'new') return 0;
  if (status === 'in_progress') return 1;
  return 2; // done or declined
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diff / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function hoursLeft(item: FeedbackItem): number {
  const closedAt = new Date(item.statusChangedAt || item.updatedAt || item.createdAt).getTime();
  return Math.max(0, Math.ceil((closedAt + 24 * 3600_000 - Date.now()) / 3600_000));
}

/** The person's own feature ideas and bug reports, with the stage each one is at */
const MyFeedbackList: React.FC = () => {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await storage.getMyFeedback();
      if (cancelled) return;
      setItems(list);
      // Opening this list counts as having seen every update
      await markAllSeen();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) return <p className="text-xs text-slate-400">Loading your reports...</p>;

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-slate-400 leading-relaxed">
        <p className="font-semibold text-slate-300 mb-1">Nothing here yet</p>
        <p>Feature ideas and bug reports you send will show up here so you can follow their progress.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        You will get a notification when an admin updates one of these. Finished and declined items are removed 24 hours
        after they are closed.
      </p>
      {items.map((item) => {
        const stage = stageIndex(item.status);
        const declined = item.status === 'declined';
        return (
          <div key={item.id} className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-bold text-slate-400">
                  {item.type === 'bug' ? <Bug className="w-3 h-3 text-rose-300" /> : <Lightbulb className="w-3 h-3 text-amber-300" />}
                  <span>{item.type === 'bug' ? 'Bug report' : 'Feature idea'}</span>
                  {item.unread && <span className="px-1.5 py-0.5 rounded-full bg-cyan-500 text-slate-950">Updated</span>}
                </div>
                <p className="text-xs font-bold text-white mt-1 break-words">{item.title}</p>
              </div>
              <span className="text-[10px] text-slate-500 shrink-0">{timeAgo(item.updatedAt)}</span>
            </div>

            {/* Progress tracker */}
            <div className="flex items-center">
              {STAGE_LABELS.map((label, i) => {
                const reached = i <= stage;
                const isLast = i === STAGE_LABELS.length - 1;
                const text = isLast && declined ? 'Declined' : isLast && item.status === 'done' ? 'Done' : label;
                const color = reached
                  ? isLast && declined
                    ? 'bg-slate-500 border-slate-400'
                    : isLast
                      ? 'bg-emerald-500 border-emerald-300'
                      : 'bg-cyan-500 border-cyan-300'
                  : 'bg-slate-900 border-slate-700';
                return (
                  <React.Fragment key={label}>
                    <div className="flex flex-col items-center gap-1 min-w-[64px]">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 ${color}`} />
                      <span className={`text-[10px] font-semibold ${reached ? 'text-slate-200' : 'text-slate-500'}`}>{text}</span>
                    </div>
                    {!isLast && <div className={`flex-1 h-0.5 -mt-4 ${i < stage ? 'bg-cyan-500' : 'bg-slate-800'}`} />}
                  </React.Fragment>
                );
              })}
            </div>

            {item.adminNote && (
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-100 break-words">
                <span className="font-bold">Message from the admins:</span> {item.adminNote}
              </div>
            )}

            {(item.status === 'done' || item.status === 'declined') && (
              <p className="text-[10px] text-slate-500">
                This will be removed from your list in about {hoursLeft(item)} hour{hoursLeft(item) === 1 ? '' : 's'}.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

const BUG_AREAS = ['Library', 'Playlists', 'Favorites', 'Chat', 'Music player / video', 'Requests', 'Login / account', 'Admin panel', 'Other'];

const FeedbackForm: React.FC<{ kind: 'feature' | 'bug' }> = ({ kind }) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [area, setArea] = useState(BUG_AREAS[0]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const isBug = kind === 'bug';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !details.trim()) {
      setNotice({ ok: false, text: 'Please fill in both the title and the details.' });
      return;
    }
    setSending(true);
    setNotice(null);
    const res = await storage.submitFeedback({
      type: kind,
      title: title.trim(),
      details: details.trim(),
      area: isBug ? area : undefined,
      userId: currentUser?.id,
      username: currentUser?.username,
    });
    setSending(false);
    if (res.success) {
      refreshFeedback().catch(() => {});
      setTitle('');
      setDetails('');
      setNotice({
        ok: true,
        text: isBug
          ? 'Thanks! Your bug report was sent to the admins. You can follow its progress under "My Reports".'
          : 'Thanks! Your feature idea was sent to the admins. You can follow its progress under "My Reports".',
      });
    } else {
      setNotice({ ok: false, text: res.error || 'Something went wrong. Please try again.' });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-cyan-500/20 text-xs text-slate-300">
        {isBug
          ? 'Something broken or acting weird? Tell us what happened and where. The more detail, the faster it can be fixed.'
          : 'Have an idea that would make YouSong better? Describe it and an admin will take a look.'}
      </div>

      {notice && (
        <div
          className={`p-3 rounded-2xl border text-xs ${
            notice.ok
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      {isBug && (
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Where did it happen?</label>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
          >
            {BUG_AREAS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          {isBug ? 'Short summary *' : 'Feature name *'}
        </label>
        <input
          type="text"
          maxLength={140}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isBug ? 'e.g. Chat messages will not send' : 'e.g. Add a sleep timer'}
          className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          {isBug ? 'What happened? What did you expect? *' : 'Describe the idea *'}
        </label>
        <textarea
          rows={5}
          maxLength={4000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={
            isBug
              ? 'Steps: 1) I opened Chat  2) I typed a message  3) I pressed send. It said...'
              : 'What should it do, and how would you use it?'
          }
          className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-y"
          required
        />
      </div>

      <button
        type="submit"
        disabled={sending}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-xs hover:from-cyan-400 hover:to-blue-500 disabled:opacity-60 transition-all"
      >
        <Send className="w-3.5 h-3.5" />
        {sending ? 'Sending...' : isBug ? 'Send Bug Report' : 'Send Feature Idea'}
      </button>
    </form>
  );
};

export const SongRequestModal: React.FC<SongRequestModalProps> = ({ isOpen, onClose, initialMode = 'song' }) => {
  const { currentUser, songRequests, submitSongRequest } = useAuth();
  const [mode, setMode] = useState<'song' | 'feature' | 'bug' | 'mine'>(initialMode);
  const feedbackState = useSyncExternalStore(subscribeFeedback, getFeedbackState);

  // Each time the popup opens, start on the requested section
  useEffect(() => {
    if (isOpen) setMode(initialMode);
  }, [isOpen, initialMode]);
  const [activeTab, setActiveTab] = useState<'submit' | 'my-requests'>('submit');

  // Form fields as requested:
  // YouTube link, cover art image address, initial guess for title, initial guess for artist
  const [webLink, setWebLink] = useState('');
  const [coverUrl, setCoverUrl] = useState(PRESET_COVERS[0].url);
  const [songTitle, setSongTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('Vibe / Chill');
  const [notes, setNotes] = useState('');

  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live check of the pasted link, so people know right away if it will work
  const [linkCheck, setLinkCheck] = useState<{
    state: 'idle' | 'checking' | 'ok' | 'bad';
    text?: string;
    title?: string;
    thumbnail?: string;
  }>({ state: 'idle' });

  useEffect(() => {
    const text = webLink.trim();
    if (!text) {
      setLinkCheck({ state: 'idle' });
      return;
    }
    setLinkCheck({ state: 'checking' });
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await storage.previewYouTube(text);
      if (cancelled) return;
      if (r.valid) {
        setLinkCheck({ state: 'ok', title: r.title, thumbnail: r.thumbnail });
        // Pre-fill the guesses when they are still empty
        if (r.title) setSongTitle((prev) => prev || r.title || '');
        if (r.author) setArtist((prev) => prev || r.author || '');
      } else {
        setLinkCheck({ state: 'bad', text: r.reason });
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [webLink]);

  if (!isOpen) return null;

  const userRequests = songRequests.filter((r) =>
    currentUser ? r.requestedByUserId === currentUser.id : r.requestedByUsername === 'Guest User'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (linkCheck.state === 'checking') {
      setFeedback('Hold on, the link is still being checked.');
      return;
    }
    if (linkCheck.state !== 'ok') {
      setFeedback(linkCheck.text || 'Please paste a link to one YouTube video.');
      return;
    }
    if (!songTitle.trim()) {
      setFeedback('Please provide your initial guess for the song title.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitSongRequest({
        songTitle: songTitle.trim(),
        artist: artist.trim() || 'Unknown Artist',
        webLink: webLink.trim(),
        coverUrl: coverUrl.trim() || PRESET_COVERS[0].url,
        genre: genre.trim(),
        notes: notes.trim() || undefined,
        requestType: 'song',
      });

      setWebLink('');
      setSongTitle('');
      setArtist('');
      setNotes('');
      setFeedback('Your song request was successfully placed into the Holding Queue. An admin will review and approve it before audio processing begins.');
      setActiveTab('my-requests');
    } catch (err: any) {
      setFeedback(err.message || 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white font-display">
                  YouSong Requests
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Moderated
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Request a song, suggest a site feature, or report a bug.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* What do you want to send? */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5 text-xs">
          {([
            { id: 'song', label: 'Song', Icon: Music },
            { id: 'feature', label: 'Site Feature', Icon: Lightbulb },
            { id: 'bug', label: 'Report a Bug', Icon: Bug },
            { id: 'mine', label: 'My Reports', Icon: ListChecks },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold border transition-all ${
                mode === id
                  ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              {id === 'mine' && feedbackState.unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-bold">
                  {feedbackState.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {mode === 'mine' ? (
          <MyFeedbackList />
        ) : mode !== 'song' ? (
          <FeedbackForm key={mode} kind={mode} />
        ) : (
          <>
        {/* Tab Switcher */}
        <div className="flex p-1 rounded-2xl bg-slate-950 border border-slate-800 mb-5 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('submit')}
            className={`flex-1 py-2 rounded-xl font-semibold transition-all ${
              activeTab === 'submit'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Submit Song Request
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('my-requests')}
            className={`flex-1 py-2 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'my-requests'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>My Submissions</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-white">
              {userRequests.length}
            </span>
          </button>
        </div>

        {feedback && (
          <div className="mb-4 p-3 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-xs flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>{feedback}</span>
          </div>
        )}

        {activeTab === 'submit' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Holding Queue Security Notice */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-cyan-500/20 text-xs text-slate-300 space-y-1">
              <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-[11px]">
                <ShieldCheck className="w-4 h-4" />
                <span>Human Moderation & Holding Queue</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Your request enters a private holding queue. It stays hidden from other users until an administrator reviews it and publishes it.
              </p>
            </div>

            {/* 1. YouTube Link */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-rose-400" />
                <span>YouTube Link *</span>
              </label>
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                value={webLink}
                onChange={(e) => setWebLink(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                required
              />

              {linkCheck.state === 'checking' && (
                <span className="text-[11px] text-slate-400 mt-1.5 block">Checking the link...</span>
              )}
              {linkCheck.state === 'bad' && (
                <div className="mt-1.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-200">
                  {linkCheck.text}
                </div>
              )}
              {linkCheck.state === 'ok' && (
                <div className="mt-1.5 flex items-center gap-2.5 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  {linkCheck.thumbnail && (
                    <img src={linkCheck.thumbnail} alt="" className="w-14 h-8 rounded-md object-cover shrink-0" />
                  )}
                  <div className="min-w-0 text-[11px]">
                    <p className="text-emerald-300 font-semibold">This link works</p>
                    {linkCheck.title && <p className="text-slate-300 truncate">{linkCheck.title}</p>}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                <p>
                  <span className="text-slate-400 font-semibold">Works:</span> a link to one YouTube video (youtube.com/watch,
                  youtu.be, Shorts, or YouTube Music), including the google.com/goto?url=... links Chromebooks create when
                  you share.
                </p>
                <p>
                  <span className="text-slate-400 font-semibold">Does not work:</span> playlists, channels, Spotify, SoundCloud,
                  Apple Music, or videos where the owner blocks other sites.
                </p>
              </div>
            </div>

            {/* 2. Initial Guess for Title & Artist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Initial Guess: Song Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Midnight City"
                  value={songTitle}
                  onChange={(e) => setSongTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Initial Guess: Artist / Channel
                </label>
                <input
                  type="text"
                  placeholder="e.g. M83"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            {/* 3. Cover Art Image Address */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Cover Art Image Address *</span>
                </label>
                <span className="text-[10px] text-slate-500">Preset or direct image URL</span>
              </div>

              <div className="flex gap-3 items-center mb-2.5">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-950 border border-white/10 shrink-0 shadow-inner">
                  <img
                    src={coverUrl || PRESET_COVERS[0].url}
                    alt="Cover Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = PRESET_COVERS[0].url;
                    }}
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="url"
                    placeholder="https://example.com/artwork.jpg"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Quick Preset Selector */}
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COVERS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setCoverUrl(preset.url)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                      coverUrl === preset.url
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Genre & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Genre / Mood
                </label>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  <option value="Vibe / Chill">Vibe / Chill</option>
                  <option value="Lo-Fi & Study">Lo-Fi & Study</option>
                  <option value="Synthwave & Retro">Synthwave & Retro</option>
                  <option value="Acoustic & Coffee">Acoustic & Coffee</option>
                  <option value="Ambient & Deep">Ambient & Deep</option>
                  <option value="Anime & Soundtracks">Anime & Soundtracks</option>
                  <option value="Instrumental">Instrumental</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Listener Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Timestamp 0:30, high quality version"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            {/* Submit Footer */}
            <div className="pt-3 flex items-center justify-between border-t border-slate-800">
              <span className="text-[11px] text-slate-400">
                Submitting as: <strong className="text-cyan-400">{currentUser ? currentUser.username : 'Guest User'}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Submitting to Queue...' : 'Submit to Holding Queue'}</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {userRequests.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <ListPlus className="w-10 h-10 opacity-30 mx-auto" />
                <p className="text-xs">You have not submitted any track requests yet.</p>
              </div>
            ) : (
              userRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3.5 rounded-2xl border border-slate-800 bg-slate-950/70 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <img
                      src={req.coverUrl || PRESET_COVERS[0].url}
                      alt={req.songTitle}
                      className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/10"
                    />
                    <div className="space-y-1 min-w-0">
                      <div className="font-bold text-white truncate text-sm">
                        {req.songTitle}
                      </div>
                      {req.artist && (
                        <p className="text-[11px] text-slate-400">
                          {req.artist}
                        </p>
                      )}
                      {req.webLink && (
                        <a
                          href={req.webLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>YouTube Source</span>
                        </a>
                      )}
                      {req.adminNote && (
                        <div className="mt-1 p-2 rounded-lg bg-blue-950/60 border border-blue-800/40 text-[11px] text-blue-300">
                          <strong>Admin Feedback:</strong> {req.adminNote}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {req.status === 'pending' && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-800/50">
                        <Clock className="w-3 h-3" />
                        Holding Queue (Review Gate)
                      </span>
                    )}
                    {req.status === 'processing' && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-cyan-300 bg-cyan-950/40 px-2.5 py-1 rounded-full border border-cyan-800/50 animate-pulse">
                        <Radio className="w-3 h-3" />
                        Being Checked
                      </span>
                    )}
                    {req.status === 'staging' && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-purple-300 bg-purple-950/40 px-2.5 py-1 rounded-full border border-purple-800/50">
                        <Headphones className="w-3 h-3" />
                        In Staging (Testing)
                      </span>
                    )}
                    {req.status === 'published' && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-800/50">
                        <CheckCircle2 className="w-3 h-3" />
                        Live in YouSong Library
                      </span>
                    )}
                    {req.status === 'declined' && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-400 bg-rose-950/40 px-2.5 py-1 rounded-full border border-rose-800/50">
                        <XCircle className="w-3 h-3" />
                        Declined
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
};
