import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Compass, Heart, Loader2, Play, Search, Settings2, ThumbsDown, TrendingUp, UserRound, Users, Youtube, X } from 'lucide-react';

type Video = {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  description: string;
  thumbnailUrl: string;
  publishedAt?: string;
  categoryId?: string;
  duration?: string;
  viewCount?: number;
  likeCount?: number;
  tags?: string[];
};

type Profile = {
  interests: string[];
  likedVideoIds: string[];
  followedChannels: string[];
  updatedAt?: string;
};

type Section = 'for-you' | 'trending' | 'search';

const formatViews = (value = 0) => {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + 'B views';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M views';
  if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K views';
  return value + ' views';
};

const timeAgo = (value?: string) => {
  if (!value) return '';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  const days = Math.max(0, Math.floor((Date.now() - time) / 86400000));
  if (days < 1) return 'Today';
  if (days < 30) return days + 'd ago';
  if (days < 365) return Math.floor(days / 30) + 'mo ago';
  return Math.floor(days / 365) + 'y ago';
};

export const YouTubeMode: React.FC<{onClose:()=>void}> = ({onClose}) => {
  const [section,setSection]=useState<Section>('for-you');
  const [query,setQuery]=useState('');
  const [order,setOrder]=useState('relevance');
  const [videos,setVideos]=useState<Video[]>([]);
  const [selected,setSelected]=useState<Video|null>(null);
  const [profile,setProfile]=useState<Profile>({interests:[],likedVideoIds:[],followedChannels:[]});
  const [interestDraft,setInterestDraft]=useState('');
  const [showPreferences,setShowPreferences]=useState(false);
  const [loading,setLoading]=useState(false);
  const [profileLoading,setProfileLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const requestProfile = useCallback(async () => {
    const response=await fetch('/api/youtube-mode/profile',{credentials:'same-origin'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.success) throw new Error(data.error||'Could not load your recommendations profile.');
    setProfile(data.profile || {interests:[],likedVideoIds:[],followedChannels:[]});
  },[]);

  const loadFeed = useCallback(async (mode:Section, searchTerm?:string, sortOrder?:string) => {
    setLoading(true); setError(''); setNotice('');
    try {
      const url = mode === 'search'
        ? '/api/youtube-mode/search?q='+encodeURIComponent(searchTerm || '')+'&order='+encodeURIComponent(sortOrder || 'relevance')
        : '/api/youtube-mode/feed?mode='+mode+'&regionCode=US';
      const response=await fetch(url,{credentials:'same-origin'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.success) throw new Error(data.error||'YouTube discovery could not be completed.');
      const found=Array.isArray(data.videos)?data.videos as Video[]:[];
      setVideos(found);
      if(!found.length) setNotice(mode === 'for-you' ? 'Your feed is just getting started. Add a few interests or like videos to personalize it.' : 'No videos were returned for this section.');
      setSelected(current => current && !found.some(video=>video.videoId===current.videoId) ? null : current);
    } catch(err:any) {
      setVideos([]);
      setError(err?.message||'YouTube discovery could not be completed.');
    } finally { setLoading(false); }
  },[]);

  useEffect(() => {
    let active=true;
    (async()=>{
      try {
        await requestProfile();
        if(active) await loadFeed('for-you');
      } catch(err:any) {
        if(active) setError(err?.message||'Could not load YouTube Mode.');
      } finally {
        if(active) setProfileLoading(false);
      }
    })();
    return()=>{active=false;};
  },[requestProfile,loadFeed]);

  const switchSection = (next:Section) => {
    setSection(next);
    if(next === 'search') {
      setVideos([]);
      setSelected(null);
      setError('');
      setNotice('Search for a video, artist, topic, or channel.');
    } else {
      void loadFeed(next);
    }
  };

  const saveInteraction = async (action:string, video:Video) => {
    try {
      const response=await fetch('/api/youtube-mode/interaction',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,videoId:video.videoId,channelId:video.channelId,categoryId:video.categoryId})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.success) throw new Error(data.error||'Could not save recommendation feedback.');
      if(action==='like') setProfile(current=>({...current,likedVideoIds:[...current.likedVideoIds.filter(id=>id!==video.videoId),video.videoId]}));
      if(action==='unlike') setProfile(current=>({...current,likedVideoIds:current.likedVideoIds.filter(id=>id!==video.videoId)}));
      if(action==='follow') setProfile(current=>({...current,followedChannels:[...current.followedChannels.filter(id=>id!==video.channelId),video.channelId]}));
      if(action==='unfollow') setProfile(current=>({...current,followedChannels:current.followedChannels.filter(id=>id!==video.channelId)}));
      if(action==='hide') {
        setVideos(current=>current.filter(item=>item.videoId!==video.videoId));
        if(selected?.videoId===video.videoId) setSelected(null);
      }
      if(action==='like') setNotice('Liked. Your For You feed will learn from this.');
      if(action==='hide') setNotice('Hidden. We will show you less like this.');
      if(action==='follow') setNotice('Channel followed in your YouSound profile.');
    } catch(err:any) { setError(err?.message||'Could not save feedback.'); }
  };

  const chooseVideo = (video:Video) => {
    setSelected(video);
    void saveInteraction('play',video);
  };

  const addInterest = async () => {
    const interest=interestDraft.trim().slice(0,40);
    if(!interest) return;
    const next=[...new Set([...profile.interests,interest])].slice(0,12);
    await saveInterests(next);
    setInterestDraft('');
  };

  const removeInterest = async (interest:string) => {
    await saveInterests(profile.interests.filter(item=>item!==interest));
  };

  const saveInterests = async (interests:string[]) => {
    try {
      const response=await fetch('/api/youtube-mode/profile',{
        method:'PUT',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({interests})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.success) throw new Error(data.error||'Could not save interests.');
      setProfile(current=>({...current,interests:data.profile?.interests||interests}));
      setNotice('Your personal interests have been saved.');
    } catch(err:any) { setError(err?.message||'Could not save interests.'); }
  };

  const submitSearch = (event:React.FormEvent) => {
    event.preventDefault();
    if(!query.trim()) return;
    setSection('search');
    void loadFeed('search',query,order);
  };

  const toggleLike = (video:Video) => {
    void saveInteraction(profile.likedVideoIds.includes(video.videoId)?'unlike':'like',video);
  };

  const toggleFollow = (video:Video) => {
    void saveInteraction(profile.followedChannels.includes(video.channelId)?'unfollow':'follow',video);
  };

  return <div className="fixed inset-0 z-[120] flex min-h-screen flex-col overflow-hidden bg-[#080d17] text-white">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0d1421] px-4 py-3 sm:px-7">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white"><Youtube size={22}/></div><div><div className="text-sm font-bold tracking-tight">YouTube</div><div className="text-[10px] text-slate-400">Discovery inside YouSound</div></div></div>
      <button type="button" onClick={onClose} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.05] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"><X size={15}/>Close</button>
    </header>

    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-white/[.07] bg-[#0b1220] px-4 py-3 sm:px-7">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2">
          <button type="button" onClick={()=>switchSection('for-you')} className={'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition '+(section==='for-you'?'bg-white text-slate-950':'bg-white/[.05] text-slate-300 hover:bg-white/10')}><Compass size={14}/>For You</button>
          <button type="button" onClick={()=>switchSection('trending')} className={'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition '+(section==='trending'?'bg-white text-slate-950':'bg-white/[.05] text-slate-300 hover:bg-white/10')}><TrendingUp size={14}/>Trending</button>
          <button type="button" onClick={()=>switchSection('search')} className={'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition '+(section==='search'?'bg-white text-slate-950':'bg-white/[.05] text-slate-300 hover:bg-white/10')}><Search size={14}/>Search</button>
          <div className="flex-1"/>
          <button type="button" onClick={()=>setShowPreferences(value=>!value)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[.08]"><Settings2 size={14}/>Personalize</button>
        </div>
      </div>

      {showPreferences&&<section className="border-b border-cyan-300/10 bg-cyan-950/20 px-4 py-4 sm:px-7">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-semibold text-cyan-100">Your YouSound recommendation profile</div><p className="mt-1 text-[11px] text-slate-400">These preferences belong to your YouSound account, not to other listeners.</p></div><div className="flex items-center gap-1.5 text-[10px] text-slate-500"><UserRound size={13}/>Private to your account</div></div>
          <form onSubmit={event=>{event.preventDefault();void addInterest();}} className="mt-3 flex max-w-xl gap-2">
            <input value={interestDraft} onChange={event=>setInterestDraft(event.target.value)} maxLength={40} placeholder="Add an interest (e.g. jazz, gaming, science)" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/40"/>
            <button type="submit" disabled={!interestDraft.trim()} className="rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">Add</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.interests.map(item=><button key={item} type="button" onClick={()=>void removeInterest(item)} title="Remove interest" className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-[10px] text-cyan-100 hover:bg-rose-500/10 hover:text-rose-100">{item} <span className="ml-1 opacity-60">×</span></button>)}
            {!profile.interests.length&&<span className="text-[10px] text-slate-500">No interests added yet. Likes and viewing activity will also help personalize your feed.</span>}
          </div>
        </div>
      </section>}

      {section==='search'&&<form onSubmit={submitSearch} className="mx-auto flex w-full max-w-[1600px] gap-2 px-4 py-4 sm:px-7">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-white/[.05] px-4 focus-within:border-red-400/60"><Search size={17} className="shrink-0 text-slate-500"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search videos, artists, channels, or topics..." aria-label="Search YouTube" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-500"/></label>
        <select value={order} onChange={event=>setOrder(event.target.value)} className="rounded-xl border border-white/10 bg-[#111a2a] px-2 text-xs text-slate-300"><option value="relevance">Relevant</option><option value="date">Newest</option><option value="viewCount">Most viewed</option><option value="rating">Top rated</option></select>
        <button type="submit" disabled={!query.trim()||loading} className="rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50">Search</button>
      </form>}

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-7">
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.58fr)]">
          <section className="min-w-0">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div><div className="text-[10px] font-bold uppercase tracking-[.2em] text-red-300/75">{section==='for-you'?'Personalized for your account':section==='trending'?'Popular across YouTube':'YouTube search'}</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">{section==='for-you'?'For You':section==='trending'?'Trending':'Search results'}</h1></div>
              {section!=='search'&&<span className="text-[10px] text-slate-500">Personalized independently for each YouSound account</span>}
            </div>

            {error&&<div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-xs leading-5 text-amber-100"><AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-300"/>{error}</div>}
            {notice&&<div className="mb-4 flex items-start gap-2 rounded-2xl border border-cyan-300/15 bg-cyan-400/[.06] p-3 text-[11px] text-cyan-100"><Check size={14} className="shrink-0"/>{notice}</div>}
            {loading||profileLoading?<div className="flex min-h-48 items-center justify-center gap-3 text-xs text-slate-400"><Loader2 size={18} className="animate-spin"/>Loading your YouTube feed…</div>:null}
            {!loading&&!profileLoading&&!videos.length&&!error&&<div className="rounded-2xl border border-white/10 bg-white/[.03] p-7 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[.06] text-slate-400"><Compass size={22}/></div><p className="mt-3 text-sm font-semibold text-slate-200">Your feed is ready to learn your taste</p><p className="mt-1 text-xs leading-5 text-slate-500">Add interests, play videos, like channels, or hide things you do not want to see.</p><button type="button" onClick={()=>setShowPreferences(true)} className="mt-4 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-semibold text-white">Choose interests</button></div>}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {videos.map(video=><article key={video.videoId} className={'overflow-hidden rounded-2xl border transition '+(selected?.videoId===video.videoId?'border-red-400/50 bg-red-500/[.06]':'border-white/10 bg-white/[.025] hover:border-white/20')}>
                <button type="button" onClick={()=>chooseVideo(video)} className="block w-full text-left">
                  <div className="relative aspect-video bg-black"><img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy"/><span className="absolute bottom-2 right-2 rounded-lg bg-black/75 p-2 text-white"><Play size={14} fill="currentColor"/></span></div>
                  <div className="p-3 pb-2"><div className="line-clamp-2 text-xs font-semibold leading-5 text-slate-100">{video.title}</div><div className="mt-1 truncate text-[10px] text-slate-400">{video.channelTitle}</div><div className="mt-1 flex gap-2 text-[9px] text-slate-500"><span>{formatViews(video.viewCount)}</span><span>·</span><span>{timeAgo(video.publishedAt)}</span></div></div>
                </button>
                <div className="flex items-center justify-between gap-1 border-t border-white/[.06] px-2 py-2">
                  <button type="button" onClick={()=>toggleLike(video)} className={'flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] transition '+(profile.likedVideoIds.includes(video.videoId)?'bg-rose-500/15 text-rose-200':'text-slate-400 hover:bg-white/[.07] hover:text-white')}><Heart size={12} fill={profile.likedVideoIds.includes(video.videoId)?'currentColor':'none'}/>{profile.likedVideoIds.includes(video.videoId)?'Liked':'Like'}</button>
                  <button type="button" onClick={()=>toggleFollow(video)} className={'flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] transition '+(profile.followedChannels.includes(video.channelId)?'bg-cyan-500/15 text-cyan-200':'text-slate-400 hover:bg-white/[.07] hover:text-white')}><Users size={12}/>{profile.followedChannels.includes(video.channelId)?'Following':'Follow'}</button>
                  <button type="button" onClick={()=>void saveInteraction('hide',video)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] text-slate-500 transition hover:bg-white/[.07] hover:text-rose-200"><ThumbsDown size={12}/>Not for me</button>
                </div>
              </article>)}
            </div>
          </section>

          <aside className="min-w-0">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#101827] xl:sticky xl:top-0">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="text-xs font-semibold text-slate-200">Now playing</div>{selected&&<span className="rounded-full bg-red-500/15 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-red-200">YouTube</span>}</div>
              {selected?<><div className="aspect-video bg-black"><iframe key={selected.videoId} title={selected.title} src={'https://www.youtube-nocookie.com/embed/'+encodeURIComponent(selected.videoId)+'?autoplay=1&rel=0'} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/></div><div className="p-4"><h2 className="text-sm font-semibold leading-5">{selected.title}</h2><p className="mt-1 text-xs text-slate-400">{selected.channelTitle}</p><p className="mt-3 line-clamp-5 text-xs leading-5 text-slate-500">{selected.description}</p></div></>:<div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 text-red-300"><Youtube size={26}/></div><h2 className="mt-4 text-sm font-semibold text-white">Choose a video</h2><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Choose a recommendation or search result to play it here.</p></div>}
            </div>
          </aside>
        </div>
      </main>
    </div>
  </div>;
};
