import React, { useEffect, useState } from 'react';
import { Gamepad2, Globe2, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react';

type GoogleSiteConfig = { url: string | null; updatedAt?: string | null };

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'The Arcade request failed.');
  return data;
}

export const GamesHub: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadSite = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await readJson(await fetch('/api/games/google-site', {
        credentials: 'same-origin',
        cache: 'no-store',
      })) as GoogleSiteConfig & { success: boolean };
      setSiteUrl(data.url || null);
      setDraftUrl(data.url || '');
    } catch (loadError: any) {
      setError(loadError?.message || 'The Arcade could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadSite(); }, []);

  const saveSite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const data = await readJson(await fetch('/api/admin/games/google-site', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: draftUrl.trim() }),
      })) as GoogleSiteConfig & { success: boolean };
      setSiteUrl(data.url || null);
      setDraftUrl(data.url || '');
      setNotice(data.url ? 'The embedded Arcade site has been saved.' : 'The embedded Arcade site has been removed.');
    } catch (saveError: any) {
      setError(saveError?.message || 'The embedded Arcade site could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const removeSite = async () => {
    if (!isAdmin || saving || !siteUrl) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const data = await readJson(await fetch('/api/admin/games/google-site', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: '' }),
      }));
      setSiteUrl(data.url || null);
      setDraftUrl('');
      setNotice('The embedded Arcade site has been removed.');
    } catch (removeError: any) {
      setError(removeError?.message || 'Could not remove the site.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-24">
      <section className="relative overflow-hidden rounded-[28px] border border-cyan-300/20 bg-slate-950 p-5 text-white shadow-2xl sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-100"><Gamepad2 className="h-5 w-5" /></div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-200">YouSound Arcade</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Play inside YouSound.</h1>
            </div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[.05] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">Embedded only</span>
        </div>
        <p className="relative mt-4 max-w-3xl text-sm leading-6 text-slate-300">
          The Arcade is now a single embedded game site. Games are not launched separately, and YouSound does not show an external link or open the host site in a new tab.
        </p>
      </section>

      {isAdmin && (
        <section className="rounded-3xl border border-cyan-200/20 bg-slate-950/90 p-5 text-white shadow-xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-200">Administrator settings</div>
              <h2 className="mt-1 text-lg font-black">Embedded Google Site</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">Paste the published Google Sites address. This setting controls the page shown to every Arcade visitor.</p>
            </div>
            <button type="button" onClick={() => void loadSite()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/[.08] disabled:opacity-50"><RefreshCw className={'h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} /> Refresh</button>
          </div>
          <form onSubmit={saveSite} className="mt-5 space-y-3">
            <label htmlFor="arcade-google-site-url" className="block text-xs font-semibold text-slate-200">Published Google Sites URL</label>
            <input
              id="arcade-google-site-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              maxLength={700}
              value={draftUrl}
              onChange={event => setDraftUrl(event.target.value)}
              placeholder="https://sites.google.com/view/your-game-site"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-200/50"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save embedded site
              </button>
              <button type="button" disabled={saving || loading || !siteUrl} onClick={() => void removeSite()} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-100 hover:bg-rose-500/15 disabled:opacity-40">
                <Trash2 className="h-4 w-4" /> Remove site
              </button>
              <span className="text-[10px] text-slate-500">{siteUrl ? 'A published site is configured.' : 'No site is configured.'}</span>
            </div>
          </form>
          <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-300/[.06] p-3 text-[11px] leading-5 text-amber-100/90">
            Important: Google Sites must be published and shared with the intended viewers. Google may block its own Sites pages from being framed by another domain. YouSound will keep the page embedded-only; it will not offer a new-tab or external-link fallback.
          </div>
        </section>
      )}

      {error && <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {notice && <div role="status" className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[.06] p-4 text-sm text-emerald-100">{notice}</div>}

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-white sm:px-5">
          <div className="flex items-center gap-2 text-sm font-black"><Globe2 className="h-4 w-4 text-cyan-200" /> Arcade</div>
          <span className="rounded-lg border border-white/10 bg-white/[.04] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">Inside YouSound</span>
        </div>
        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center gap-3 text-sm text-slate-300"><Loader2 className="h-5 w-5 animate-spin" /> Loading the embedded Arcade…</div>
        ) : siteUrl ? (
          <iframe
            title="YouSound embedded Arcade"
            src={siteUrl}
            className="h-[82vh] min-h-[560px] w-full bg-black"
            sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
            allow="fullscreen; autoplay; gamepad"
            allowFullScreen
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-14 text-center">
            <Gamepad2 className="h-10 w-10 text-slate-600" />
            <h2 className="mt-4 text-lg font-black text-white">{isAdmin ? 'Add the Arcade host site' : 'The Arcade is being prepared'}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{isAdmin ? 'Paste a published Google Sites URL in Administrator settings above, then save it to display the games here.' : 'The administrator has not configured the embedded game site yet. Check back later.'}</p>
          </div>
        )}
      </section>
      <p className="px-1 text-[10px] leading-5 text-slate-500">The game page is confined to this embedded frame. The frame does not grant pop-ups or top-level navigation, and YouSound does not provide an external link to the Google Site.</p>
    </div>
  );
};
