import React, { useState } from 'react';
import { AlertCircle, Loader2, Play, Search, Youtube, X } from 'lucide-react';

type Video = { videoId:string; title:string; channelTitle:string; description:string; thumbnailUrl:string };

export const YouTubeMode: React.FC<{onClose:()=>void}> = ({onClose}) => {
  const [query,setQuery]=useState('');
  const [videos,setVideos]=useState<Video[]>([]);
  const [selected,setSelected]=useState<Video|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  const search = async (event:React.FormEvent) => {
    event.preventDefault();
    const clean=query.trim();
    if(!clean) return;
    setLoading(true); setError(''); setSelected(null);
    try {
      const response=await fetch('/api/youtube-mode/search?q='+encodeURIComponent(clean),{credentials:'same-origin'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.success) throw new Error(data.error||'YouTube search could not be completed.');
      const found=Array.isArray(data.videos)?data.videos as Video[]:[];
      setVideos(found);
      if(!found.length) setError('No videos matched that search.');
    } catch(err:any) {
      setVideos([]);
      setError(err?.message||'YouTube search could not be completed.');
    } finally { setLoading(false); }
  };

  return <div className="fixed inset-0 z-[120] flex min-h-screen flex-col bg-[#090d16] text-white">
    <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#0d1421] px-4 py-3 sm:px-7">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white"><Youtube size={22}/></div><div><div className="text-sm font-bold tracking-tight">YouTube</div><div className="text-[10px] text-slate-400">Embedded video search</div></div></div>
      <button type="button" onClick={onClose} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.05] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"><X size={15}/>Close</button>
    </header>
    <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-5 overflow-y-auto p-4 sm:p-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
      <section className="min-w-0">
        <div className="mb-5"><h1 className="text-2xl font-semibold tracking-tight">Search YouTube</h1><p className="mt-1 text-sm text-slate-400">Find videos and play them here without leaving YouSound.</p></div>
        <form onSubmit={search} className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-white/[.05] px-4 focus-within:border-red-400/60"><Search size={17} className="shrink-0 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search videos..." aria-label="Search YouTube videos" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-500"/></label>
          <button type="submit" disabled={loading||!query.trim()} className="rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">{loading?<Loader2 size={17} className="animate-spin"/>:'Search'}</button>
        </form>
        {error&&<div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-xs leading-5 text-amber-100"><AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-300"/>{error}</div>}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {videos.map(video=><button key={video.videoId} type="button" onClick={()=>setSelected(video)} className={'overflow-hidden rounded-2xl border text-left transition hover:-translate-y-0.5 hover:border-red-400/40 hover:bg-white/[.06] '+(selected?.videoId===video.videoId?'border-red-400/60 bg-red-500/10':'border-white/10 bg-white/[.035]')}>
            <div className="relative aspect-video bg-black"><img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy"/><span className="absolute bottom-2 right-2 rounded-lg bg-black/75 p-2 text-white"><Play size={14} fill="currentColor"/></span></div>
            <div className="p-3"><div className="line-clamp-2 text-xs font-semibold leading-5 text-slate-100">{video.title}</div><div className="mt-1 truncate text-[10px] text-slate-400">{video.channelTitle}</div></div>
          </button>)}
        </div>
      </section>
      <aside className="min-w-0">
        <div className="sticky top-0 overflow-hidden rounded-3xl border border-white/10 bg-[#111a2a]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="text-xs font-semibold text-slate-200">Now playing</div>{selected&&<span className="rounded-full bg-red-500/15 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-red-200">YouTube</span>}</div>
          {selected?<><div className="aspect-video bg-black"><iframe key={selected.videoId} title={selected.title} src={'https://www.youtube-nocookie.com/embed/'+encodeURIComponent(selected.videoId)+'?autoplay=1&rel=0'} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/></div><div className="p-4"><h2 className="text-sm font-semibold leading-5">{selected.title}</h2><p className="mt-1 text-xs text-slate-400">{selected.channelTitle}</p><p className="mt-3 line-clamp-4 text-xs leading-5 text-slate-500">{selected.description}</p></div></>:<div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 text-red-300"><Youtube size={26}/></div><h2 className="mt-4 text-sm font-semibold text-white">Choose a video</h2><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Search for a video, then select a result to play it in the embedded player.</p></div>}
        </div>
      </aside>
    </main>
  </div>;
};
