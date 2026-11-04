import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw, Trophy } from 'lucide-react';

type LaneKind = 'grass' | 'road' | 'river' | 'rail';
type VehicleKind = 'car' | 'taxi' | 'van' | 'truck' | 'bus';
type MovingObject = { x: number; width: number; kind: VehicleKind | 'log'; color: string; };
type Lane = {
  row: number; kind: LaneKind; speed: number; direction: number; objects: MovingObject[];
  nextTrainAt: number; trainWarningAt: number; trainX: number; trainActive: boolean;
};
type HopperWorld = { x: number; visualX: number; row: number; visualRow: number; lanes: Map<number, Lane>; moveLock: number; bestRow: number; collected: Set<number>; };

const COLS = 11;
const TILE_W = 74;
const TILE_H = 68;
const BOARD_W = COLS * TILE_W;
const BOARD_X = 73;
const CANVAS_W = 960;
const CANVAS_H = 620;
const BEST_KEY = 'ys-lane-hopper-best-v3';
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const VEHICLE_COLORS = ['#e65b57', '#e8b94f', '#3d91c9', '#e7e9ec', '#51a77d', '#a27ad1'];
const LOG_COLORS = ['#9a613b', '#b97843', '#8a5233'];

function random01(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
function makeLane(row: number, now: number): Lane {
  const kindRoll = random01(row + 30);
  const kind: LaneKind = row <= 0 ? 'grass' : kindRoll < .23 ? 'grass' : kindRoll < .69 ? 'road' : kindRoll < .91 ? 'river' : 'rail';
  const direction = random01(row + 71) > .5 ? 1 : -1;
  const progression = clamp(Math.max(0, row) / 90, 0, 1);
  const speed = kind === 'road' ? (95 + random01(row + 8) * 115) * (1 + progression * .7) : kind === 'river' ? (42 + random01(row + 11) * 38) * (1 + progression * .42) : 0;
  const objects: MovingObject[] = [];
  if (kind === 'road' || kind === 'river') {
    const count = kind === 'road' ? (random01(row + 4) > .5 ? 3 : 4) : (random01(row + 6) > .5 ? 2 : 3);
    for (let i = 0; i < count; i++) {
      if (kind === 'road') {
        const typeRoll = random01(row * 9 + i + 50);
        const vehicleKind: VehicleKind = typeRoll < .34 ? 'car' : typeRoll < .52 ? 'taxi' : typeRoll < .7 ? 'van' : typeRoll < .87 ? 'truck' : 'bus';
        const widths: Record<VehicleKind, number> = { car: 1.12, taxi: 1.12, van: 1.48, truck: 1.9, bus: 2.25 };
        objects.push({ x: i * (BOARD_W / count) + random01(row * 3 + i) * 45, width: widths[vehicleKind] * TILE_W, kind: vehicleKind, color: VEHICLE_COLORS[Math.floor(random01(row + i * 5) * VEHICLE_COLORS.length)] });
      } else {
        objects.push({ x: i * (BOARD_W / count) + random01(row * 2 + i) * 50, width: (2.15 + random01(row + i * 7) * .75) * TILE_W, kind: 'log', color: LOG_COLORS[Math.floor(random01(row + i * 3) * LOG_COLORS.length)] });
      }
    }
  }
  return {
    row, kind, direction, speed, objects,
    nextTrainAt: now + 4200 + random01(row + 8) * 4200 - progression * 1250,
    trainWarningAt: 0, trainX: direction > 0 ? -370 : BOARD_W + 370, trainActive: false,
  };
}
function loadBest() {
  try { return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0); } catch { return 0; }
}
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + w, y, x + w, y + h, radius); ctx.arcTo(x + w, y + h, x, y + h, radius); ctx.arcTo(x, y + h, x, y, radius); ctx.arcTo(x, y, x + w, y, radius); ctx.closePath();
}
function drawCar(ctx: CanvasRenderingContext2D, obj: MovingObject, x: number, y: number) {
  const w = obj.width, h = 37, body = obj.color;
  ctx.fillStyle = 'rgba(0,0,0,.32)'; roundedRect(ctx, x + 4, y + 20, w - 8, h + 5, 9); ctx.fill();
  ctx.fillStyle = '#17202b'; roundedRect(ctx, x + 5, y + 3, w - 10, h + 5, 8); ctx.fill();
  ctx.fillStyle = body; roundedRect(ctx, x, y + 5, w, h, 9); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; roundedRect(ctx, x + 7, y + 8, w - 14, 6, 3); ctx.fill();
  const long = w > TILE_W * 1.65;
  const cabX = long ? x + w * .57 : x + w * .25;
  const cabW = long ? w * .31 : w * .5;
  ctx.fillStyle = '#193448'; roundedRect(ctx, cabX, y + 10, cabW, 24, 5); ctx.fill();
  ctx.fillStyle = '#81b8cb'; roundedRect(ctx, cabX + 4, y + 12, cabW - 8, 8, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(cabX + 3, y + 12, Math.max(3, cabW * .22), 18);
  ctx.fillStyle = '#fff3bd'; ctx.fillRect(x + 2, y + 12, 5, 7); ctx.fillRect(x + w - 7, y + 12, 5, 7);
  ctx.fillStyle = '#d63b37'; ctx.fillRect(x + 2, y + 29, 5, 6); ctx.fillRect(x + w - 7, y + 29, 5, 6);
  ctx.fillStyle = '#111820'; ctx.fillRect(x + w * .22, y + 1, 13, 6); ctx.fillRect(x + w * .72, y + 1, 13, 6); ctx.fillRect(x + w * .22, y + 39, 13, 5); ctx.fillRect(x + w * .72, y + 39, 13, 5);
  if (obj.kind === 'taxi') { ctx.fillStyle = '#f5f0d9'; roundedRect(ctx, x + w * .42, y + 1, w * .2, 9, 3); ctx.fill(); }
  if (obj.kind === 'truck') { ctx.fillStyle = '#d1d8df'; ctx.fillRect(x + w * .55, y + 8, w * .36, 30); ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x + w * .58, y + 11, w * .3, 3); }
  if (obj.kind === 'bus') { ctx.fillStyle = '#173448'; for (let i = 0; i < 4; i++) { roundedRect(ctx, x + 8 + i * (w - 18) / 4, y + 11, (w - 36) / 4, 12, 2); ctx.fill(); } }
}
function drawLog(ctx: CanvasRenderingContext2D, obj: MovingObject, x: number, y: number) {
  const w = obj.width;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; roundedRect(ctx, x + 5, y + 23, w - 10, 23, 10); ctx.fill();
  ctx.fillStyle = obj.color; roundedRect(ctx, x, y + 12, w, 29, 13); ctx.fill();
  ctx.fillStyle = 'rgba(255,218,157,.35)'; roundedRect(ctx, x + 8, y + 15, w - 16, 5, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(58,33,20,.55)'; ctx.lineWidth = 2;
  for (let i = 1; i < Math.floor(w / 32); i++) { ctx.beginPath(); ctx.moveTo(x + i * 32, y + 16); ctx.lineTo(x + i * 32, y + 38); ctx.stroke(); }
  ctx.fillStyle = '#d8a16a'; ctx.beginPath(); ctx.ellipse(x + 9, y + 26, 6, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + w - 9, y + 26, 6, 12, 0, 0, Math.PI * 2); ctx.fill();
}
function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.fillStyle = 'rgba(0,0,0,.19)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 49 * scale, 25 * scale, 9 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#795235'; ctx.fillRect(x - 6 * scale, y + 22 * scale, 13 * scale, 30 * scale);
  ctx.fillStyle = '#2a6743'; ctx.fillRect(x - 19 * scale, y + 9 * scale, 39 * scale, 32 * scale);
  ctx.fillStyle = '#41985c'; ctx.fillRect(x - 15 * scale, y + 3 * scale, 31 * scale, 25 * scale);
  ctx.fillStyle = '#67b86c'; ctx.fillRect(x - 8 * scale, y + 4 * scale, 13 * scale, 9 * scale);
}
function drawChicken(ctx: CanvasRenderingContext2D, x: number, y: number, bob: number) {
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y + 26, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#de9856'; ctx.fillRect(x - 10, y + 12 + bob, 7, 14); ctx.fillRect(x + 3, y + 12 + bob, 7, 14);
  ctx.fillStyle = '#efbd55'; roundedRect(ctx, x - 17, y - 12 + bob, 34, 35, 10); ctx.fill();
  ctx.fillStyle = '#fff0c8'; roundedRect(ctx, x - 14, y - 20 + bob, 28, 25, 9); ctx.fill();
  ctx.fillStyle = '#d95649'; ctx.fillRect(x - 7, y - 27 + bob, 14, 8); ctx.fillRect(x - 3, y - 31 + bob, 7, 7);
  ctx.fillStyle = '#f18a48'; ctx.beginPath(); ctx.moveTo(x + 12, y - 13 + bob); ctx.lineTo(x + 25, y - 8 + bob); ctx.lineTo(x + 12, y - 3 + bob); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#17202b'; ctx.fillRect(x + 4, y - 14 + bob, 3, 4); ctx.fillRect(x - 8, y - 14 + bob, 3, 4);
}
function drawGrass(ctx: CanvasRenderingContext2D, x: number, y: number, row: number) {
  ctx.fillStyle = '#7dbd63'; ctx.fillRect(x, y, TILE_W, TILE_H);
  ctx.fillStyle = '#8ccc6d'; ctx.fillRect(x, y, TILE_W, 5);
  ctx.fillStyle = 'rgba(36,90,54,.16)';
  for (let i = 0; i < 5; i++) { const px = x + (random01(row * 23 + i) * 60) + 5; const py = y + random01(row * 41 + i + 7) * 52 + 7; ctx.fillRect(px, py, 3, 3); }
  if (random01(row + 22) > .32) drawTree(ctx, x + (random01(row + 9) > .5 ? 17 : 55), y + 1, .76);
  else if (row % 3 === 0) { ctx.fillStyle = '#d8e0db'; ctx.fillRect(x + 19, y + 45, 13, 9); ctx.fillStyle = '#eef0e8'; ctx.fillRect(x + 19, y + 43, 13, 3); }
}
function drawWorld(ctx: CanvasRenderingContext2D, world: HopperWorld, now: number) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H); bg.addColorStop(0, '#b8e7df'); bg.addColorStop(1, '#79bcb0'); ctx.fillStyle = bg; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = 'rgba(255,255,255,.22)'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(i * 160 + 60, 60 + (i % 3) * 14, 55, 13, 0, 0, Math.PI * 2); ctx.fill(); }
  const cameraY = Math.max(-4, world.visualRow - 4.25);
  for (let screenRow = 0; screenRow < 10; screenRow++) {
    const row = Math.floor(cameraY) + screenRow;
    let lane = world.lanes.get(row);
    if (!lane) { lane = makeLane(row, now); world.lanes.set(row, lane); }
    const y = (row - cameraY) * TILE_H;
    if (lane.kind === 'grass') {
      for (let col = 0; col < COLS; col++) drawGrass(ctx, BOARD_X + col * TILE_W, y, row * 31 + col);
      if (row > 0 && row % 6 === 2 && !world.collected.has(row * COLS + Math.floor(random01(row + 99) * COLS))) {
        const coinX = BOARD_X + ((Math.floor(random01(row + 99) * COLS)) * TILE_W) + TILE_W / 2;
        const pulse = 1 + Math.sin(now / 150) * .08;
        ctx.save(); ctx.translate(coinX, y + TILE_H / 2); ctx.scale(pulse, 1);
        ctx.fillStyle = 'rgba(255,211,73,.22)'; ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f7c943'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff4b2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 7, -.8, 1.7); ctx.stroke(); ctx.restore();
      }
    } else if (lane.kind === 'road') {
      ctx.fillStyle = '#454d59'; ctx.fillRect(BOARD_X, y, BOARD_W, TILE_H);
      ctx.fillStyle = '#343b46'; ctx.fillRect(BOARD_X, y + 3, BOARD_W, 4); ctx.fillRect(BOARD_X, y + TILE_H - 7, BOARD_W, 4);
      ctx.strokeStyle = 'rgba(245,245,235,.58)'; ctx.lineWidth = 2; ctx.setLineDash([22, 18]); ctx.beginPath(); ctx.moveTo(BOARD_X, y + TILE_H / 2); ctx.lineTo(BOARD_X + BOARD_W, y + TILE_H / 2); ctx.stroke(); ctx.setLineDash([]);
      for (const obj of lane.objects) drawCar(ctx, obj, BOARD_X + obj.x, y + 10);
    } else if (lane.kind === 'river') {
      ctx.fillStyle = '#258fbb'; ctx.fillRect(BOARD_X, y, BOARD_W, TILE_H);
      for (let i = 0; i < 9; i++) {
        const rippleX = BOARD_X + ((i * 103 + now * .045 * lane.direction) % BOARD_W + BOARD_W) % BOARD_W;
        ctx.strokeStyle = 'rgba(218,250,255,.24)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rippleX, y + 12 + (i % 3) * 17); ctx.lineTo(rippleX + 28, y + 12 + (i % 3) * 17); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,.11)'; ctx.fillRect(BOARD_X, y + 4, BOARD_W, 3);
      for (const obj of lane.objects) drawLog(ctx, obj, BOARD_X + obj.x, y + 7);
    } else {
      ctx.fillStyle = '#69727c'; ctx.fillRect(BOARD_X, y, BOARD_W, TILE_H);
      ctx.fillStyle = '#d1d7db'; ctx.fillRect(BOARD_X, y + 12, BOARD_W, 4); ctx.fillRect(BOARD_X, y + 51, BOARD_W, 4);
      ctx.fillStyle = '#8d979f'; for (let x = BOARD_X + 5; x < BOARD_X + BOARD_W; x += 25) ctx.fillRect(x, y + 8, 5, 51);
      ctx.fillStyle = '#404a55'; ctx.fillRect(BOARD_X, y + 6, BOARD_W, 3); ctx.fillRect(BOARD_X, y + 58, BOARD_W, 3);
      if (lane.trainWarningAt && now < lane.trainWarningAt) {
        ctx.fillStyle = Math.sin(now / 95) > 0 ? '#ed453e' : '#fff0a7'; ctx.beginPath(); ctx.arc(BOARD_X + 25, y + 32, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff0a7'; ctx.font = 'bold 10px monospace'; ctx.fillText('TRAIN APPROACHING', BOARD_X + 42, y + 36);
      }
      if (lane.trainActive) {
        const trainX = BOARD_X + lane.trainX;
        ctx.fillStyle = 'rgba(0,0,0,.28)'; roundedRect(ctx, trainX + 8, y + 15, 390, 42, 7); ctx.fill();
        for (let car = 0; car < 4; car++) {
          const cx = trainX + car * 93;
          ctx.fillStyle = car === 0 ? '#d34a45' : '#e0e4e8'; roundedRect(ctx, cx, y + 8, 88, 47, 7); ctx.fill();
          ctx.fillStyle = '#33495b'; for (let win = 0; win < 3; win++) { roundedRect(ctx, cx + 8 + win * 24, y + 15, 17, 13, 3); ctx.fill(); }
          ctx.fillStyle = '#222a31'; ctx.fillRect(cx + 9, y + 49, 13, 6); ctx.fillRect(cx + 65, y + 49, 13, 6);
        }
        if ((lane.direction > 0 && lane.trainX > BOARD_W + 410) || (lane.direction < 0 && lane.trainX < -410)) {
          lane.trainActive = false; lane.trainWarningAt = 0; lane.nextTrainAt = now + 7000 + random01(row + now) * 5000;
        }
      }
    }
  }
  const px = BOARD_X + world.visualX * TILE_W + TILE_W / 2;
  const py = (world.visualRow - cameraY) * TILE_H + TILE_H / 2 + Math.sin(now / 70) * (world.moveLock > 0 ? 3 : 0);
  drawChicken(ctx, px, py, 0);
  ctx.fillStyle = 'rgba(12,32,41,.78)'; roundedRect(ctx, BOARD_X + 12, 12, 190, 44, 12); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px monospace'; ctx.fillText('LANE HOPPER', BOARD_X + 25, 29);
  ctx.fillStyle = '#ffe08a'; ctx.font = 'bold 16px monospace'; ctx.fillText('ROW ' + Math.max(0, world.row), BOARD_X + 25, 47);
}
export const LaneHopperGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const worldRef = useRef<HopperWorld | null>(null);
  const phaseRef = useRef<'menu' | 'playing' | 'paused' | 'over'>('menu');
  const [phaseState, setPhaseState] = useState<'menu' | 'playing' | 'paused' | 'over'>('menu');
  const phase = phaseState;
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(loadBest);
  const [coins, setCoins] = useState(0);
  const [worldName, setWorldName] = useState('PINE VALLEY');
  const [soundOn, setSoundOn] = useState(true);
  const moveLockRef = useRef(false);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const soundCtx = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const setPhase = (phase: 'menu' | 'playing' | 'paused' | 'over') => { phaseRef.current = phase; setPhaseState(phase); };
  const playTone = (frequency: number, duration = .08) => {
    if (!soundOnRef.current) return;
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!soundCtx.current) soundCtx.current = new AudioContextCtor();
      const ctx = soundCtx.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.045, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + duration);
    } catch {}
  };

  const startGame = useCallback(() => {
    const now = performance.now();
    const lanes = new Map<number, Lane>();
    for (let row = -8; row < 55; row++) lanes.set(row, makeLane(row, now));
    const world: HopperWorld = { x: 5, visualX: 5, row: 0, visualRow: 0, lanes, moveLock: 0, bestRow: 0, collected: new Set() };
    worldRef.current = world; setScore(0); setCoins(0); setWorldName('PINE VALLEY'); setPhase('playing');
  }, []);

  const endGame = useCallback(() => {
    const world = worldRef.current;
    if (!world || phaseRef.current !== 'playing') return;
    setPhase('over');
    const nextBest = Math.max(best, world.bestRow);
    setBest(nextBest);
    try { localStorage.setItem(BEST_KEY, String(nextBest)); } catch {}
    playTone(125, .25);
  }, [best]);

  const collectCoin = (world: HopperWorld) => {
    const lane = world.lanes.get(world.row);
    if (lane?.kind === 'grass' && world.row > 0 && world.row % 6 === 2) {
      const coinCol = Math.floor(random01(world.row + 99) * COLS);
      const id = world.row * COLS + coinCol;
      if (!world.collected.has(id) && Math.abs(world.x - coinCol) < .48) {
        world.collected.add(id); setCoins(value => value + 1); playTone(920, .09);
      }
    }
  };

  const move = useCallback((dx: number, dy: number) => {
    const world = worldRef.current;
    if (!world || phaseRef.current !== 'playing' || world.moveLock > 0) return;
    const nextX = Math.max(0, Math.min(COLS - 1, world.x + dx));
    const nextRow = Math.max(0, world.row + dy);
    if (nextX === world.x && nextRow === world.row) return;
    world.x = nextX; world.row = nextRow; world.moveLock = .115;
    world.bestRow = Math.max(world.bestRow, world.row);
    setScore(world.bestRow);
    if (world.row > 12 && world.row % 12 === 0) setWorldName(world.row < 36 ? 'SUNNY MEADOWS' : world.row < 72 ? 'DOWNTOWN' : 'HIGHLAND PASS');
    collectCoin(world); playTone(dy > 0 ? 540 : 380, .055);
  }, []);

  useEffect(() => {
    const keyMap: Record<string, [number, number]> = {
      arrowup: [0, 1], w: [0, 1], arrowdown: [0, -1], s: [0, -1],
      arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
    };
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (keyMap[key]) { event.preventDefault(); if (!moveLockRef.current) { move(...keyMap[key]); moveLockRef.current = true; } }
      if (key === ' ' && phaseRef.current === 'menu') startGame();
      if (key === 'p') setPhase(phaseRef.current === 'playing' ? 'paused' : phaseRef.current === 'paused' ? 'playing' : phaseRef.current);
    };
    const keyup = (event: KeyboardEvent) => { if (keyMap[event.key.toLowerCase()]) moveLockRef.current = false; };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); };
  }, [move, startGame]);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let alive = true, previous = performance.now();
    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(.04, (now - previous) / 1000); previous = now;
      const world = worldRef.current;
      if (world && phaseRef.current === 'playing') {
        world.moveLock = Math.max(0, world.moveLock - dt);
        world.visualX += (world.x - world.visualX) * Math.min(1, dt * 17);
        world.visualRow += (world.row - world.visualRow) * Math.min(1, dt * 17);
        const cameraY = Math.max(-4, world.visualRow - 4.25);
        // Animate every lane in the camera window, not just the lane the hopper occupies.
        for (let row = Math.floor(cameraY) - 1; row <= Math.floor(cameraY) + 10; row++) {
          const visibleLane = world.lanes.get(row);
          if (!visibleLane) continue;
          if (visibleLane.kind === 'road' || visibleLane.kind === 'river') {
            for (const obj of visibleLane.objects) {
              obj.x += visibleLane.direction * visibleLane.speed * dt;
              if (obj.x > BOARD_W + 230) obj.x = -obj.width - 90;
              if (obj.x < -obj.width - 230) obj.x = BOARD_W + 90;
            }
          } else if (visibleLane.kind === 'rail') {
            if (!visibleLane.trainActive && now >= visibleLane.nextTrainAt && !visibleLane.trainWarningAt) visibleLane.trainWarningAt = now + 1800;
            if (visibleLane.trainWarningAt && now >= visibleLane.trainWarningAt && !visibleLane.trainActive) {
              visibleLane.trainActive = true; visibleLane.trainX = visibleLane.direction > 0 ? -390 : BOARD_W + 390;
            }
            if (visibleLane.trainActive) {
              visibleLane.trainX += visibleLane.direction * 740 * dt;
              if ((visibleLane.direction > 0 && visibleLane.trainX > BOARD_W + 410) || (visibleLane.direction < 0 && visibleLane.trainX < -410)) {
                visibleLane.trainActive = false; visibleLane.trainWarningAt = 0; visibleLane.nextTrainAt = now + 7500;
              }
            }
          }
        }
        const lane = world.lanes.get(world.row);
        const playerX = world.x * TILE_W + TILE_W / 2;
        if (lane?.kind === 'road') {
          for (const obj of lane.objects) if (playerX > obj.x - 14 && playerX < obj.x + obj.width + 14) endGame();
        } else if (lane?.kind === 'river') {
          const support = lane.objects.find(obj => playerX >= obj.x + 3 && playerX <= obj.x + obj.width - 3);
          if (support) {
            world.x += lane.direction * lane.speed * dt / TILE_W;
            if (world.x < -.48 || world.x > COLS - .52) endGame();
          } else endGame();
        } else if (lane?.kind === 'rail' && lane.trainActive) {
          if (playerX >= lane.trainX - 16 && playerX <= lane.trainX + 390) endGame();
        }
      }
      if (world) drawWorld(ctx, world, now);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => { alive = false; if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [endGame]);

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => { event.currentTarget.setPointerCapture(event.pointerId); pointerRef.current = { x: event.clientX, y: event.clientY }; };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const start = pointerRef.current; pointerRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) { move(0, 1); return; }
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0); else move(0, dy < 0 ? 1 : -1);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#13232b] px-3 py-2 text-xs font-bold text-slate-200"><ArrowLeft className="h-4 w-4"/> VIP Arcade</button>
        <span className="rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-lime-200">Lane Hopper · Crossing Survival</span>
      </div>
      <section className="overflow-hidden rounded-[28px] border border-lime-300/20 bg-[#0e1e27] text-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
          <div><div className="text-[10px] font-black uppercase tracking-[.22em] text-lime-300">{worldName}</div><h2 className="mt-1 text-2xl font-black sm:text-3xl">LANE HOPPER</h2><p className="mt-1 text-xs text-slate-400">A living crossing world. Watch the traffic, read the train signals, and ride the logs.</p></div>
          <div className="flex gap-4 text-right"><div><div className="text-[9px] font-bold text-slate-500">BEST</div><div className="text-xl font-black text-amber-200">{best}</div></div><div><div className="text-[9px] font-bold text-slate-500">ROWS</div><div className="text-xl font-black text-white">{score}</div></div><div><div className="text-[9px] font-bold text-slate-500">COINS</div><div className="text-xl font-black text-amber-200">{coins}◆</div></div></div>
        </div>
        <div className="relative bg-[#82c5be] p-2 sm:p-4">
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={()=>{pointerRef.current=null;}} className="mx-auto block w-full max-w-[960px] rounded-2xl border border-white/20 shadow-inner" style={{ aspectRatio: CANVAS_W + ' / ' + CANVAS_H, touchAction: 'none' }}/>
          {phase === 'menu' && <div className="absolute inset-2 sm:inset-4 flex items-center justify-center rounded-2xl bg-slate-950/60 p-5 backdrop-blur-[2px]"><div className="max-w-sm text-center"><div className="text-[10px] font-black uppercase tracking-[.25em] text-lime-200">Crossing challenge</div><div className="mt-2 text-3xl font-black text-white">HOW FAR CAN YOU HOP?</div><p className="mt-2 text-xs leading-5 text-slate-200">Traffic moves. Logs drift. Trains arrive with a warning. Every forward hop is a new row.</p><button onClick={startGame} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-lime-300 px-5 py-3 text-xs font-black text-slate-950"><Play className="h-4 w-4"/> Start crossing</button></div></div>}
          {phase === 'paused' && <div className="absolute inset-2 sm:inset-4 flex items-center justify-center rounded-2xl bg-slate-950/65 backdrop-blur-sm"><div className="text-center"><div className="text-2xl font-black text-white">PAUSED</div><button onClick={()=>setPhase('playing')} className="mt-4 rounded-xl bg-white px-5 py-3 text-xs font-black text-slate-950">Resume</button></div></div>}
          {phase === 'over' && <div className="absolute inset-2 sm:inset-4 flex items-center justify-center rounded-2xl bg-slate-950/65 backdrop-blur-sm"><div className="max-w-sm text-center"><Trophy className="mx-auto h-8 w-8 text-amber-200"/><div className="mt-2 text-3xl font-black text-white">GAME OVER</div><p className="mt-2 text-xs text-slate-300">You crossed {score} rows and collected {coins} coins.</p><button onClick={startGame} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-lime-300 to-emerald-400 px-5 py-3 text-xs font-black text-slate-950"><RotateCcw className="h-4 w-4"/> Play again</button></div></div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-black/20 p-4">
          <div><div className="text-xs font-black text-lime-200">WASD / ARROW KEYS · SWIPE TO HOP</div><p className="mt-1 text-[10px] text-slate-400">Cars, vans, delivery trucks, buses, rivers, logs and warning trains are all live hazards.</p></div>
          <div className="grid grid-cols-3 gap-1"><span/><button onClick={()=>move(0,1)} className="rounded-lg border border-white/10 bg-white/5 p-2 text-white hover:bg-white/10"><ArrowUp className="h-4 w-4"/></button><span/><button onClick={()=>move(-1,0)} className="rounded-lg border border-white/10 bg-white/5 p-2 text-white hover:bg-white/10"><ArrowLeft className="h-4 w-4"/></button><button onClick={()=>move(0,-1)} className="rounded-lg border border-white/10 bg-white/5 p-2 text-white hover:bg-white/10"><ArrowDown className="h-4 w-4"/></button><button onClick={()=>move(1,0)} className="rounded-lg border border-white/10 bg-white/5 p-2 text-white hover:bg-white/10"><ArrowRight className="h-4 w-4"/></button></div>
          <button onClick={()=>setPhase(phase==='playing'?'paused':phase==='paused'?'playing':phase)} disabled={phase==='menu'||phase==='over'} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-30"><Pause className="h-4 w-4"/>{phase==='paused'?'Resume':'Pause'}</button>
        </div>
      </section>
    </div>
  );
};