import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Crown, Pause, Play, RotateCcw, Shield, Sparkles, Trophy, Zap } from 'lucide-react';

type Mode = 'menu' | 'franchise' | 'game';
type PlayType = 'run' | 'pass' | 'screen';
type Player = { x: number; y: number; speed: number; number: number; color: string; route: number; };
type Defender = { x: number; y: number; speed: number; number: number; };
type BallState = { x: number; y: number; targetX: number; targetY: number; progress: number; receiver: number; };

const FIELD_W = 960;
const FIELD_H = 540;
const YARD_START = 80;
const YARD_END = 880;
const PX_PER_YARD = (YARD_END - YARD_START) / 100;
const SAVE_KEY = 'yousong-gridiron-franchise-v1';

function loadFranchise() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { team: 'MIAMI WAVES', wins: 0, losses: 0, week: 1, coins: 120, offense: 2, defense: 2, stars: 3, touchdowns: 0 };
}

export const RetroBowlGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const gameRef = useRef<any>(null);
  const [mode, setMode] = useState<Mode>('menu');
  const [franchise, setFranchise] = useState<any>(loadFranchise);
  const [playType, setPlayType] = useState<PlayType>('run');
  const [down, setDown] = useState(1);
  const [yardsToGo, setYardsToGo] = useState(10);
  const [lineYards, setLineYards] = useState(25);
  const [score, setScore] = useState({ us: 0, them: 0 });
  const [quarter, setQuarter] = useState(1);
  const [clock, setClock] = useState(150);
  const [message, setMessage] = useState('Choose a play to start the drive');
  const [lastGain, setLastGain] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [targetReceiver, setTargetReceiver] = useState(1);
  const [playNumber, setPlayNumber] = useState(0);
  const [renderTick, setRenderTick] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const setSavedFranchise = useCallback((next: any) => {
    setFranchise(next);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const createPlay = useCallback((type: PlayType) => {
    const receivers: Player[] = [
      { x: 300, y: 145, speed: 2.6, number: 8, color: '#f1c75b', route: -1 },
      { x: 310, y: 270, speed: 2.9, number: 11, color: '#f1c75b', route: 0 },
      { x: 295, y: 390, speed: 2.5, number: 18, color: '#f1c75b', route: 1 },
    ];
    const defenders: Defender[] = Array.from({ length: 6 }, (_, i) => ({
      x: 390 + (i % 3) * 95 + Math.floor(i / 3) * 25,
      y: 100 + i * 58,
      speed: 1.05 + Math.random() * 0.5 + franchise.defense * 0.04,
      number: 20 + i,
    }));
    gameRef.current = {
      phase: 'live', type, startX: 185 + (lineYards - 25) * PX_PER_YARD,
      startY: 270, carrier: { x: 185 + (lineYards - 25) * PX_PER_YARD, y: 270, vx: 0, vy: 0 },
      qb: { x: 160 + (lineYards - 25) * PX_PER_YARD, y: 270 },
      receivers, defenders, ball: null, target: targetReceiver - 1,
      endX: 870, startTime: performance.now(), passThrown: false, tackled: false,
    };
    setPlayType(type);
    setMessage(type === 'run' ? 'RUN PLAY · Find daylight. Arrow keys or WASD to move.' : type === 'pass' ? 'PASS PLAY · Press 1, 2, or 3 to choose a receiver, then SPACE to throw.' : 'SCREEN PLAY · Let the rush come, then throw with SPACE.');
    setLastGain(null);
    setPlayNumber((n) => n + 1);
  }, [franchise.defense, lineYards, targetReceiver]);

  const finish = useCallback((gain: number, result: string, touchdown = false, turnover = false) => {
    const current = gameRef.current;
    if (!current || current.phase !== 'live') return;
    current.phase = 'result';
    setLastGain(gain);
    setMessage(result);
    if (touchdown) {
      setScore(s => ({ ...s, us: s.us + 7 }));
      setSavedFranchise((f: any) => ({ ...f, touchdowns: f.touchdowns + 1, coins: f.coins + 25 }));
      setDown(1); setYardsToGo(10); setLineYards(25);
    } else if (turnover || down >= 4 && gain < yardsToGo) {
      setDown(1); setYardsToGo(10); setLineYards(25);
      setMessage(turnover ? 'INTERCEPTION! Turnover on downs.' : 'TURNOVER ON DOWNS · Defense takes possession.');
    } else if (gain >= yardsToGo) {
      setDown(1); setYardsToGo(10); setLineYards(v => Math.min(90, v + gain));
      setMessage(result + ' · FIRST DOWN!');
    } else {
      setDown(d => d + 1);
      setYardsToGo(v => Math.max(1, v - gain));
      setLineYards(v => Math.min(90, v + gain));
    }
    if (playNumber >= 8) setGameOver(true);
    window.setTimeout(() => {
      if (!gameRef.current) return;
      if (gameRef.current.phase === 'result') {
        gameRef.current.phase = 'ready';
        setRenderTick((n) => n + 1);
      }
    }, 1050);
  }, [down, yardsToGo, playNumber, setSavedFranchise]);

  const throwBall = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.phase !== 'live' || g.type === 'run' || g.passThrown) return;
    const receiver = g.receivers[g.target];
    const targetX = Math.min(760, receiver.x + 95);
    const targetY = receiver.y;
    g.ball = { x: g.qb.x + 22, y: g.qb.y - 12, targetX, targetY, progress: 0, receiver: g.target } as BallState;
    g.passThrown = true;
    setMessage('BALL IN THE AIR · Track the receiver!');
  }, []);

  useEffect(() => {
    const downKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) e.preventDefault();
      keysRef.current[key] = true;
      const g = gameRef.current;
      if (g?.phase === 'live' && !isPaused && !gameOver) {
        if (key === '1' || key === '2' || key === '3') {
          g.target = Number(key) - 1; setTargetReceiver(Number(key));
        }
        if (key === ' ' || key === 'enter') throwBall();
      }
    };
    const upKey = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', downKey);
    window.addEventListener('keyup', upKey);
    return () => { window.removeEventListener('keydown', downKey); window.removeEventListener('keyup', upKey); };
  }, [throwBall]);

  useEffect(() => {
    if (mode !== 'game') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let alive = true;
    const drawPlayer = (x: number, y: number, color: string, number: number, highlight = false) => {
      ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse(x, y + 15, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(x - 11, y - 10, 22, 23);
      ctx.fillStyle = '#f4d6b0'; ctx.fillRect(x - 7, y - 19, 14, 10);
      ctx.fillStyle = highlight ? '#fff5bf' : '#dbe5ef'; ctx.fillRect(x - 9, y - 13, 18, 4);
      ctx.fillStyle = '#102033'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText(String(number), x, y + 5);
      if (highlight) { ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 2; ctx.strokeRect(x - 15, y - 23, 30, 43); }
    };
    const drawField = () => {
      ctx.clearRect(0, 0, FIELD_W, FIELD_H);
      const gradient = ctx.createLinearGradient(0, 0, 0, FIELD_H); gradient.addColorStop(0, '#164b37'); gradient.addColorStop(1, '#0d382a');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      ctx.fillStyle = '#d7b46a'; ctx.fillRect(0, 0, FIELD_W, 49); ctx.fillRect(0, FIELD_H - 49, FIELD_W, 49);
      ctx.fillStyle = '#b88a46'; ctx.fillRect(0, 49, 47, FIELD_H - 98); ctx.fillRect(FIELD_W - 47, 49, 47, FIELD_H - 98);
      ctx.fillStyle = 'rgba(255,255,255,.035)';
      for (let i = 0; i < 10; i++) ctx.fillRect(47 + i * 87, 49, 43, FIELD_H - 98);
      ctx.strokeStyle = 'rgba(244,248,226,.50)'; ctx.lineWidth = 2;
      for (let i = 0; i <= 10; i++) {
        const x = 47 + i * 86.6;
        ctx.beginPath(); ctx.moveTo(x, 49); ctx.lineTo(x, FIELD_H - 49); ctx.stroke();
        for (let y = 65; y < FIELD_H - 60; y += 26) {
          ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.stroke();
        }
        if (i > 0 && i < 10) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText(String(i * 10), x, 72); ctx.fillText(String(i * 10), x, FIELD_H - 58); }
      }
      ctx.fillStyle = '#f7d98b'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'; ctx.fillText('YOUSONG', 23, FIELD_H / 2); ctx.fillText('ARCADE', FIELD_W - 23, FIELD_H / 2);
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.setLineDash([7, 8]); ctx.beginPath(); ctx.moveTo(185 + (lineYards - 25) * PX_PER_YARD, 50); ctx.lineTo(185 + (lineYards - 25) * PX_PER_YARD, FIELD_H - 50); ctx.stroke(); ctx.setLineDash([]);
    };
    let last = performance.now();
    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.035, (now - last) / 1000); last = now;
      drawField();
      const g = gameRef.current;
      if (g?.phase === 'live') {
        if (g.type === 'run') {
          const c = g.carrier;
          const accel = 320 * dt;
          if (keysRef.current.arrowleft || keysRef.current.a) c.vx -= accel;
          if (keysRef.current.arrowright || keysRef.current.d) c.vx += accel;
          if (keysRef.current.arrowup || keysRef.current.w) c.vy -= accel;
          if (keysRef.current.arrowdown || keysRef.current.s) c.vy += accel;
          c.vx *= Math.pow(0.84, dt * 60); c.vy *= Math.pow(0.84, dt * 60);
          c.vx = Math.max(-155, Math.min(220, c.vx)); c.vy = Math.max(-165, Math.min(165, c.vy));
          c.x = Math.max(70, Math.min(880, c.x + c.vx * dt)); c.y = Math.max(82, Math.min(458, c.y + c.vy * dt));
          const nearest = g.defenders.reduce((best: any, d: Defender) => Math.hypot(d.x - c.x, d.y - c.y) < Math.hypot(best.x - c.x, best.y - c.y) ? d : best, g.defenders[0]);
          g.defenders.forEach((d: Defender) => {
            const dx = c.x - d.x, dy = c.y - d.y, len = Math.max(1, Math.hypot(dx, dy));
            d.x += dx / len * d.speed * 75 * dt; d.y += dy / len * d.speed * 75 * dt;
          });
          if (nearest && Math.hypot(nearest.x - c.x, nearest.y - c.y) < 22) {
            const gain = Math.max(-2, Math.round((c.x - g.startX) / PX_PER_YARD));
            finish(gain, 'TACKLED · ' + Math.max(0, gain) + ' yards on the carry.');
          } else if (c.x >= 830) {
            finish(Math.max(1, Math.round((830 - g.startX) / PX_PER_YARD)), 'TOUCHDOWN! Six points, plus the kick.', true);
          }
          drawPlayer(c.x, c.y, '#e9b94f', 22, true);
        } else {
          g.receivers.forEach((r: Player, i: number) => {
            r.x += (r.speed + (g.type === 'screen' ? 0.25 : 0)) * 43 * dt;
            r.y += Math.sin(now / 330 + i * 1.7) * 0.9;
            drawPlayer(r.x, r.y, '#e9b94f', r.number, i === g.target && !g.passThrown);
          });
          drawPlayer(g.qb.x, g.qb.y, '#f4c85d', 12, !g.passThrown);
          g.defenders.forEach((d: Defender, i: number) => {
            const target = g.passThrown ? g.receivers[g.target] : g.qb;
            const dx = target.x - d.x, dy = target.y - d.y, len = Math.max(1, Math.hypot(dx, dy));
            d.x += dx / len * d.speed * 43 * dt; d.y += dy / len * d.speed * 43 * dt;
            drawPlayer(d.x, d.y, '#d95e5e', d.number);
          });
          if (!g.passThrown && g.type === 'screen') {
            const closest = g.defenders.some((d: Defender) => Math.hypot(d.x - g.qb.x, d.y - g.qb.y) < 45);
            if (closest) setMessage('PRESS SPACE · Release the screen pass!');
          }
          if (g.ball) {
            const b = g.ball as BallState; b.progress = Math.min(1, b.progress + dt * 1.8);
            const arc = Math.sin(b.progress * Math.PI) * 70;
            b.x = g.qb.x + (b.targetX - g.qb.x) * b.progress;
            b.y = g.qb.y + (b.targetY - g.qb.y) * b.progress - arc;
            ctx.fillStyle = '#8b4f26'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 10, 5, -0.4, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fbe4bd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(b.x - 5, b.y); ctx.lineTo(b.x + 5, b.y); ctx.stroke();
            if (b.progress >= 1) {
              const receiver = g.receivers[b.receiver];
              const nearby = g.defenders.some((d: Defender) => Math.hypot(d.x - receiver.x, d.y - receiver.y) < 30);
              if (nearby && Math.random() < 0.55) finish(0, 'PICKED OFF · The defense read the route.', false, true);
              else {
                const gain = Math.max(0, Math.round((receiver.x - g.startX) / PX_PER_YARD));
                if (receiver.x >= 830) finish(gain, 'TOUCHDOWN! Perfectly placed pass.', true);
                else finish(gain, 'COMPLETE · ' + gain + ' yards through the air.');
              }
            }
          }
        }
      } else if (g?.phase === 'ready' || g?.phase === 'result') {
        if (g.type === 'run') {
          drawPlayer(g.carrier.x, g.carrier.y, '#e9b94f', 22, true);
          g.defenders.forEach((d: Defender) => drawPlayer(d.x, d.y, '#d95e5e', d.number));
        } else {
          g.receivers.forEach((r: Player, i: number) => drawPlayer(r.x, r.y, '#e9b94f', r.number, i === g.target));
          drawPlayer(g.qb.x, g.qb.y, '#f4c85d', 12, true);
          g.defenders.forEach((d: Defender) => drawPlayer(d.x, d.y, '#d95e5e', d.number));
        }
      }
      ctx.fillStyle = 'rgba(4,20,16,.78)'; ctx.fillRect(0, 0, FIELD_W, 42);
      ctx.fillStyle = '#f7e8bf'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'left';
      ctx.fillText(franchise.team + '  ·  OFFENSE', 18, 27);
      ctx.textAlign = 'right'; ctx.fillText('DOWN ' + down + '  ·  ' + yardsToGo + ' TO GO  ·  BALL ON ' + lineYards, FIELD_W - 18, 27);
      if (g?.phase === 'live' && g.type !== 'run' && !g.passThrown) {
        ctx.fillStyle = 'rgba(255,236,184,.85)'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText('TARGET ' + (g.target + 1) + '  ·  PRESS SPACE TO THROW', FIELD_W / 2, FIELD_H - 18);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => { alive = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [mode, lineYards, down, yardsToGo, franchise.team, finish, isPaused, gameOver]);

  useEffect(() => {
    if (mode !== 'game' || isPaused || gameOver) return;
    const timer = window.setInterval(() => {
      setClock((value) => {
        if (value > 1) return value - 1;
        if (quarter >= 4) {
          setGameOver(true);
          setMessage('FINAL WHISTLE · The game clock has expired.');
          return 0;
        }
        setQuarter((q) => q + 1);
        return 150;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode, isPaused, gameOver, quarter]);

  const startMatch = () => {
    setScore({ us: 0, them: Math.max(0, Math.round(7 - franchise.defense)) });
    setQuarter(1); setClock(150); setDown(1); setYardsToGo(10); setLineYards(25);
    setGameOver(false); setIsPaused(false); setMode('game');
    gameRef.current = { phase: 'ready', type: 'run', carrier: { x: 185, y: 270 }, qb: { x: 160, y: 270 }, receivers: [], defenders: [] };
    setMessage('First and ten. Pick your opening play.');
  };

  const choosePlay = (type: PlayType) => {
    if (gameOver || isPaused) return;
    if (gameRef.current?.phase === 'live') return;
    if (gameRef.current?.phase === 'result') return;
    createPlay(type);
  };

  const endMatch = (won: boolean) => {
    setGameOver(true);
    setSavedFranchise((f: any) => ({ ...f, week: f.week + 1, wins: f.wins + (won ? 1 : 0), losses: f.losses + (won ? 0 : 1), coins: f.coins + (won ? 40 : 12), stars: Math.min(5, f.stars + (won ? 0.15 : 0)) }));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-24 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-slate-950 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-slate-900"><ArrowLeft className="h-4 w-4" /> Arcade</button>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200"><Crown className="h-3.5 w-3.5" /> Gridiron Dynasty · Pixel Football</div>
      </div>
      {mode === 'menu' && (
        <div className="relative overflow-hidden rounded-[28px] border border-amber-300/25 bg-[#101b2b] p-6 shadow-2xl sm:p-9">
          <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
            <div><p className="text-[10px] font-black uppercase tracking-[.25em] text-amber-300">YouSong Sports Network</p><h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">GRIDIRON<br/><span className="text-amber-300">DYNASTY.</span></h1><p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">Build a franchise. Call the plays. Find the open receiver. Take your team from a rebuilding project to championship night.</p><button onClick={() => setMode('franchise')} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-yellow-500 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-amber-900/30 transition hover:-translate-y-0.5"><Play className="h-4 w-4" /> Enter Franchise</button></div>
            <div className="rounded-3xl border border-white/10 bg-black/25 p-5"><div className="grid grid-cols-3 gap-2 text-center">{[['WINS',franchise.wins],['LOSSES',franchise.losses],['WEEK',franchise.week]].map(([label,val]: any) => <div key={label} className="rounded-xl bg-white/5 p-3"><div className="text-[9px] font-bold tracking-wider text-slate-400">{label}</div><div className="mt-1 text-2xl font-black text-white">{val}</div></div>)}</div><div className="mt-4 flex items-center justify-between text-xs"><span className="text-slate-400">Franchise</span><span className="font-black text-amber-200">{franchise.team}</span></div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-slate-400">Coach credits</span><span className="font-bold text-amber-200">{franchise.coins} ✦</span></div><div className="mt-4 flex items-center gap-1 text-amber-300">{Array.from({length:5},(_,i)=><span key={i} className={i<Math.round(franchise.stars)?'opacity-100':'opacity-20'}>★</span>)}</div></div>
          </div>
        </div>
      )}
      {mode === 'franchise' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="rounded-3xl border border-amber-300/20 bg-[#111c2c] p-5 sm:p-7"><p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Front Office · Week {franchise.week}</p><h1 className="mt-2 text-3xl font-black text-white">Welcome back, Coach.</h1><p className="mt-2 text-sm text-slate-400">Set the team identity and invest in the next game.</p><label className="mt-5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Team name</label><input value={franchise.team} onChange={e=>setSavedFranchise((f:any)=>({...f,team:e.target.value.toUpperCase().slice(0,18)}))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-lg font-black tracking-wider text-amber-100 outline-none focus:border-amber-300/60"/><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2 text-xs font-bold text-white"><Zap className="h-4 w-4 text-amber-300"/> Offense rating</div><div className="mt-3 flex items-center justify-between"><span className="text-2xl font-black text-amber-200">{franchise.offense}/5</span><button disabled={franchise.coins<30||franchise.offense>=5} onClick={()=>setSavedFranchise((f:any)=>({...f,coins:f.coins-30,offense:f.offense+1}))} className="rounded-lg bg-amber-300 px-3 py-2 text-[10px] font-black text-slate-950 disabled:opacity-30">UPGRADE · 30 ✦</button></div></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2 text-xs font-bold text-white"><Shield className="h-4 w-4 text-slate-300"/> Defense rating</div><div className="mt-3 flex items-center justify-between"><span className="text-2xl font-black text-slate-200">{franchise.defense}/5</span><button disabled={franchise.coins<30||franchise.defense>=5} onClick={()=>setSavedFranchise((f:any)=>({...f,coins:f.coins-30,defense:f.defense+1}))} className="rounded-lg border border-slate-300/30 bg-slate-200 px-3 py-2 text-[10px] font-black text-slate-900 disabled:opacity-30">UPGRADE · 30 ✦</button></div></div></div><button onClick={startMatch} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-yellow-500 px-4 py-3.5 text-sm font-black text-slate-950 shadow-lg"><Play className="h-4 w-4"/> Play Week {franchise.week}</button></section>
          <aside className="rounded-3xl border border-white/10 bg-[#0d1725] p-5"><div className="text-[10px] font-black uppercase tracking-[.2em] text-slate-400">Season board</div><div className="mt-4 space-y-3">{[['Record',franchise.wins+'-'+franchise.losses],['Touchdowns',franchise.touchdowns],['Offense',franchise.offense+'/5'],['Defense',franchise.defense+'/5']].map(([k,v])=><div key={k} className="flex justify-between border-b border-white/5 pb-2 text-xs"><span className="text-slate-400">{k}</span><span className="font-bold text-white">{v}</span></div>)}</div><p className="mt-5 text-[10px] leading-5 text-slate-500">Upgrade your roster ratings to improve play speed and defensive pressure. Franchise data saves on this device.</p></aside>
        </div>
      )}
      {mode === 'game' && (
        <section className="overflow-hidden rounded-3xl border border-amber-300/20 bg-[#0d1725] shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3"><div><div className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">{franchise.team} vs. Bay City · Week {franchise.week}</div><div className="mt-1 text-xl font-black text-white">{score.us} <span className="text-slate-500">—</span> {score.them}</div></div><div className="text-right"><div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Quarter {quarter}</div><div className="text-lg font-black tabular-nums text-white">{Math.floor(clock/60)}:{String(clock%60).padStart(2,'0')}</div></div></div>
          <div className="p-2 sm:p-4"><canvas ref={canvasRef} width={FIELD_W} height={FIELD_H} className="block w-full rounded-2xl border border-white/10 bg-emerald-950" style={{ aspectRatio: '16 / 9', imageRendering:'pixelated' }}/></div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2"><p className="min-h-8 text-xs font-bold text-amber-100">{message}</p><button onClick={()=>setIsPaused(v=>!v)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-bold text-slate-300"><Pause className="h-3 w-3"/>{isPaused?'Resume':'Pause'}</button></div>
          {!gameOver ? <div className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-[1fr_auto]"><div className="flex flex-wrap gap-2"><button onClick={()=>choosePlay('run')} disabled={!!gameRef.current&&['live','result'].includes(gameRef.current.phase)} className="rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-30">RUN · POWER</button><button onClick={()=>choosePlay('pass')} disabled={!!gameRef.current&&['live','result'].includes(gameRef.current.phase)} className="rounded-xl border border-amber-200/30 bg-amber-200/10 px-4 py-2.5 text-xs font-black text-amber-100 disabled:opacity-30">PASS · AIR RAID</button><button onClick={()=>choosePlay('screen')} disabled={!!gameRef.current&&['live','result'].includes(gameRef.current.phase)} className="rounded-xl border border-slate-200/20 bg-slate-200/10 px-4 py-2.5 text-xs font-black text-slate-100 disabled:opacity-30">SCREEN · QUICK</button></div><div className="flex items-center gap-3"><div className="grid grid-cols-3 gap-1"><span/><button onClick={()=>{keysRef.current.arrowup=true;window.setTimeout(()=>keysRef.current.arrowup=false,140);}} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200">▲</button><span/><button onClick={()=>{keysRef.current.arrowleft=true;window.setTimeout(()=>keysRef.current.arrowleft=false,140);}} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200">◀</button><button onClick={()=>{keysRef.current.arrowdown=true;window.setTimeout(()=>keysRef.current.arrowdown=false,140);}} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200">▼</button><button onClick={()=>{keysRef.current.arrowright=true;window.setTimeout(()=>keysRef.current.arrowright=false,140);}} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200">▶</button></div><div className="text-[10px] leading-5 text-slate-400">MOVE: WASD / ARROWS<br/>PASS: 1–3 TO TARGET, SPACE TO THROW</div></div></div> : <div className="p-5 text-center"><Trophy className="mx-auto h-8 w-8 text-amber-300"/><div className="mt-2 text-2xl font-black text-white">Final Whistle</div><p className="mt-1 text-xs text-slate-400">Your franchise record has been updated.</p><button onClick={()=>{endMatch(score.us>=score.them);setMode('franchise');}} className="mt-4 rounded-xl bg-amber-300 px-5 py-3 text-xs font-black text-slate-950">Return to Front Office</button></div>}
        </section>
      )}
    </div>
  );
};