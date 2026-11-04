import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Award, Crown, Pause, Play, Shield, Target, Trophy, Zap } from 'lucide-react';

type View = 'frontoffice' | 'match';
type PlayType = 'run' | 'pass' | 'deep' | 'screen';
type MatchPhase = 'ready' | 'live' | 'ball' | 'catch' | 'result';
type Defender = { x:number; y:number; speed:number; number:number; blocked:number; };
type Blocker = { x:number; y:number; number:number; target:number; };
type Receiver = { x:number; y:number; number:number; route:number; speed:number; };
type Carrier = { x:number; y:number; vx:number; vy:number; number:number; };
type BallFlight = { x:number; y:number; fromX:number; fromY:number; toX:number; toY:number; progress:number; receiver:number; };
type LivePlay = {
  phase:MatchPhase; type:PlayType; startX:number; startY:number; qb:{x:number;y:number}; carrier:Carrier;
  receivers:Receiver[]; defenders:Defender[]; blockers:Blocker[]; ball:BallFlight|null;
  target:number; ballThrown:boolean; turnover:boolean; message:string; elapsed:number;
};

const W=1000,H=540, FIELD_TOP=292, FIELD_BOTTOM=482, PLAYER_GROUND=FIELD_BOTTOM-49, GOAL_LEFT=80, GOAL_RIGHT=920, YARD_PX=(GOAL_RIGHT-GOAL_LEFT)/100;
const SAVE_KEY='ys-gridiron-dynasty-v3';
const FIELD_GREEN=['#397b4c','#347447'];
const PLAYER_BLUE='#3185da';
const DEFENSE_RED='#e35d5d';
const TEAM_NAMES=['MIAMI WAVES','NAPLES HURRICANES','GULF COAST STORM','ORLANDO COMETS'];
const DEFAULT_ROSTER = [
  { id:'qb', name:'Alex Rivers', position:'QB', rating:4, number:12 },
  { id:'rb', name:'Jay Carter', position:'RB', rating:3, number:22 },
  { id:'wr1', name:'Malik Stone', position:'WR', rating:4, number:8 },
  { id:'wr2', name:'Devin Parks', position:'WR', rating:3, number:18 },
  { id:'te', name:'Noah Brooks', position:'TE', rating:3, number:81 },
  { id:'ol', name:'Leo Grant', position:'OL', rating:3, number:66 },
  { id:'db', name:'Evan Reed', position:'DB', rating:3, number:24 },
  { id:'lb', name:'Marcus Fox', position:'LB', rating:3, number:55 },
  { id:'cb', name:'Rico Turner', position:'CB', rating:3, number:29 },
  { id:'k', name:'Owen Wells', position:'K', rating:3, number:5 },
];
function normalizeRoster(roster: any) {
  return DEFAULT_ROSTER.map(base => {
    const existing = Array.isArray(roster) ? roster.find((player:any) => player.id === base.id) : null;
    return existing ? { ...base, ...existing, rating: clamp(Number(existing.rating) || base.rating, 1, 5) } : { ...base };
  });
}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const yardX=(yard:number)=>GOAL_LEFT+yard*YARD_PX;
function loadFranchise(){
  try {
    const saved=localStorage.getItem(SAVE_KEY);
    if(saved){const parsed=JSON.parse(saved);return {...parsed,week:Math.max(1,Number(parsed.week)||1),coins:Math.max(0,Number(parsed.coins)||120),offense:clamp(Number(parsed.offense)||2,1,5),defense:clamp(Number(parsed.defense)||2,1,5),speed:clamp(Number(parsed.speed)||2,1,5),roster:normalizeRoster(parsed.roster)};}
  } catch {}
  return {team:'MIAMI WAVES',wins:0,losses:0,week:1,coins:120,offense:2,defense:2,speed:2,touchdowns:0,fieldGoals:0,roster:normalizeRoster([])};
}
function seededRandom(seed:number){let state=seed>>>0;return()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};}
function roundedRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  const radius=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+radius,y);ctx.arcTo(x+w,y,x+w,y+h,radius);ctx.arcTo(x+w,y+h,x,y+h,radius);ctx.arcTo(x,y+h,x,y,radius);ctx.arcTo(x,y,x+w,y,radius);ctx.closePath();
}
function drawPlayer(ctx:CanvasRenderingContext2D,x:number,y:number,color:string,number:number,role='player',selected=false){
  // Compact pixel-athlete sprite: helmet/facemask, shoulder pads, jersey, pants, legs and gloves.
  ctx.fillStyle='rgba(0,0,0,.32)';ctx.beginPath();ctx.ellipse(x+2,y+18,19,8,0,0,Math.PI*2);ctx.fill();
  const light=role==='defender'?'#f4b8b8':role==='receiver'?'#b9e9ff':'#d9e7f2';
  const pants=role==='defender'?'#f1e1e1':'#e8edf1';
  // Cleats and lower legs.
  ctx.fillStyle='#17212b';ctx.fillRect(x-10,y+10,8,12);ctx.fillRect(x+3,y+10,8,12);
  ctx.fillStyle=pants;ctx.fillRect(x-10,y+5,8,12);ctx.fillRect(x+3,y+5,8,12);
  ctx.fillStyle='#aab8c3';ctx.fillRect(x-10,y+14,8,3);ctx.fillRect(x+3,y+14,8,3);
  // Shoulder pads, jersey and arm sleeves.
  ctx.fillStyle='#101c27';ctx.fillRect(x-17,y-14,34,28);
  ctx.fillStyle=color;ctx.fillRect(x-15,y-13,30,23);ctx.fillRect(x-19,y-11,7,17);ctx.fillRect(x+12,y-11,7,17);
  ctx.fillStyle='rgba(255,255,255,.30)';ctx.fillRect(x-12,y-10,24,3);ctx.fillRect(x-16,y-8,4,9);ctx.fillRect(x+12,y-8,4,9);
  ctx.fillStyle=light;ctx.fillRect(x-20,y+3,7,6);ctx.fillRect(x+13,y+3,7,6);
  // Waist, jersey stripe and number.
  ctx.fillStyle='#f4f0e6';ctx.fillRect(x-13,y+7,26,3);
  ctx.fillStyle='#172331';ctx.font='900 10px monospace';ctx.textAlign='center';ctx.fillText(String(number),x,y+3);
  ctx.fillStyle='rgba(255,255,255,.72)';ctx.fillRect(x-12,y+10,5,2);ctx.fillRect(x+7,y+10,5,2);
  // Helmet shell and face opening.
  ctx.fillStyle='#111b26';ctx.fillRect(x-13,y-31,26,18);ctx.fillRect(x-16,y-25,7,10);ctx.fillRect(x+9,y-24,7,9);
  ctx.fillStyle=role==='defender'?'#f1d7d7':'#f5e4c4';ctx.fillRect(x-10,y-28,20,12);
  ctx.fillStyle=color;ctx.fillRect(x-13,y-32,26,9);ctx.fillRect(x-8,y-35,17,4);
  ctx.fillStyle='#0c1721';ctx.fillRect(x+4,y-25,7,4);ctx.fillRect(x+8,y-21,3,8);ctx.fillRect(x+1,y-17,11,2);
  ctx.fillStyle='#fff';ctx.fillRect(x-6,y-22,3,3);
  // Small team stripe on the helmet.
  ctx.fillStyle='rgba(255,255,255,.78)';ctx.fillRect(x-2,y-33,3,8);
  if(selected){ctx.strokeStyle='#ffe07a';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-5,23,39,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ffe07a';ctx.beginPath();ctx.moveTo(x,y-50);ctx.lineTo(x-5,y-58);ctx.lineTo(x+5,y-58);ctx.closePath();ctx.fill();}
  ctx.textAlign='left';
}

function drawBall(ctx:CanvasRenderingContext2D,x:number,y:number){
  ctx.fillStyle='#8b4c25';ctx.beginPath();ctx.ellipse(x,y,10,5,-.28,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#f6e7cd';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x-4,y);ctx.lineTo(x+4,y);ctx.stroke();
}
function drawField(ctx:CanvasRenderingContext2D,camera:number,ballYard:number,yardsToGo:number,direction:1|-1=1){
  ctx.clearRect(0,0,W,H);
  const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#17263e');bg.addColorStop(.48,'#23364b');bg.addColorStop(1,'#0d3025');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  // Stadium bowl, crowd blocks, fascia and sideline light show.
  ctx.fillStyle='#101a2d';ctx.fillRect(0,58,W,FIELD_TOP-58);
  for(let row=0;row<6;row++){
    const seatY=77+row*31;ctx.fillStyle=row%2?'#27384b':'#1e3044';ctx.fillRect(0,seatY,W,25);
    for(let seat=0;seat<104;seat++){
      const seatX=seat*10+((row%2)*4);const colors=['#d6d9d9','#e0a65f','#8dc7d5','#a8a4d7','#c87572','#88b88b'];
      ctx.fillStyle=colors[(seat*7+row*11)%colors.length];ctx.fillRect(seatX,seatY+5+(seat%3),4,8);ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(seatX,seatY+4+(seat%3),4,2);
    }
  }
  const ribbon=ctx.createLinearGradient(0,0,W,0);ribbon.addColorStop(0,'#1c4b72');ribbon.addColorStop(.5,'#9b7331');ribbon.addColorStop(1,'#64384a');ctx.fillStyle=ribbon;ctx.fillRect(0,257,W,17);
  ctx.fillStyle='rgba(255,255,255,.85)';ctx.font='900 10px monospace';ctx.textAlign='center';ctx.fillText('YOUSONG FOOTBALL LEAGUE  ·  FRIDAY NIGHT LIGHTS',W/2,269);ctx.textAlign='left';
  // Sidelines and end zones.
  ctx.fillStyle='#b58a52';ctx.fillRect(GOAL_LEFT-camera,FIELD_TOP-22,GOAL_RIGHT-GOAL_LEFT,FIELD_BOTTOM-FIELD_TOP+44);
  ctx.fillStyle='#173e7b';ctx.fillRect(GOAL_LEFT-camera-80,FIELD_TOP-22,80,FIELD_BOTTOM-FIELD_TOP+44);
  ctx.fillStyle='#8a313b';ctx.fillRect(GOAL_RIGHT-camera,FIELD_TOP-22,80,FIELD_BOTTOM-FIELD_TOP+44);
  ctx.save();ctx.translate(GOAL_LEFT-camera-40,(FIELD_TOP+FIELD_BOTTOM)/2);ctx.rotate(-Math.PI/2);ctx.fillStyle='rgba(255,255,255,.8)';ctx.font='900 20px system-ui';ctx.textAlign='center';ctx.fillText('YOUSONG',0,6);ctx.restore();
  ctx.save();ctx.translate(GOAL_RIGHT-camera+40,(FIELD_TOP+FIELD_BOTTOM)/2);ctx.rotate(Math.PI/2);ctx.fillStyle='rgba(255,255,255,.8)';ctx.font='900 18px system-ui';ctx.textAlign='center';ctx.fillText('GRIDIRON',0,6);ctx.restore();
  ctx.fillStyle='#2f7846';ctx.fillRect(GOAL_LEFT-camera,FIELD_TOP,GOAL_RIGHT-GOAL_LEFT,FIELD_BOTTOM-FIELD_TOP);
  ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(GOAL_LEFT-camera,FIELD_BOTTOM-18,GOAL_RIGHT-GOAL_LEFT,3);
  // Goal uprights at both end zones.
  ctx.fillStyle='#f0cf62';ctx.fillRect(GOAL_LEFT-camera-8,FIELD_TOP-76,5,78);ctx.fillRect(GOAL_LEFT-camera-8,FIELD_TOP-76,47,5);ctx.fillRect(GOAL_LEFT-camera+34,FIELD_TOP-76,5,78);
  ctx.fillRect(GOAL_RIGHT-camera+3,FIELD_TOP-76,5,78);ctx.fillRect(GOAL_RIGHT-camera+3,FIELD_TOP-76,47,5);ctx.fillRect(GOAL_RIGHT-camera+45,FIELD_TOP-76,5,78);
  for(let i=0;i<10;i++){ctx.fillStyle=i%2?'rgba(255,255,255,.035)':'rgba(0,0,0,.035)';ctx.fillRect(GOAL_LEFT-camera+i*84,FIELD_TOP,84,FIELD_BOTTOM-FIELD_TOP);}
  ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=2;
  for(let y=0;y<=100;y+=5){
    const x=yardX(y)-camera;ctx.beginPath();ctx.moveTo(x,FIELD_TOP);ctx.lineTo(x,FIELD_BOTTOM);ctx.stroke();
    for(let yy=FIELD_TOP+18;yy<FIELD_BOTTOM-10;yy+=22){ctx.beginPath();ctx.moveTo(x-4,yy);ctx.lineTo(x+4,yy);ctx.stroke();}
    if(y%10===0&&y>0&&y<100){ctx.fillStyle='rgba(255,255,255,.68)';ctx.font='bold 15px monospace';ctx.textAlign='center';ctx.fillText(String(Math.min(y,100-y)),x+((y>50)?1:0),FIELD_TOP+28);ctx.fillText(String(Math.min(y,100-y)),x+((y>50)?1:0),FIELD_BOTTOM-14);}
  }
  const lineX=yardX(ballYard)-camera, firstX=yardX(clamp(ballYard+direction*yardsToGo,0,100))-camera;
  ctx.strokeStyle='#47c2ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(lineX,FIELD_TOP);ctx.lineTo(lineX,FIELD_BOTTOM);ctx.stroke();
  ctx.strokeStyle='#ffe16c';ctx.lineWidth=3;ctx.setLineDash([8,7]);ctx.beginPath();ctx.moveTo(firstX,FIELD_TOP);ctx.lineTo(firstX,FIELD_BOTTOM);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#ffe16c';ctx.font='bold 11px monospace';ctx.fillText('1ST DOWN',firstX-31,FIELD_TOP-7);
  // Sideline coach marks.
  ctx.fillStyle='rgba(255,255,255,.65)';for(let i=0;i<20;i++){const x=GOAL_LEFT-camera+i*42;ctx.fillRect(x,FIELD_TOP-8,12,3);ctx.fillRect(x,FIELD_BOTTOM+5,12,3);}
  ctx.fillStyle='rgba(255,255,255,.9)';ctx.font='bold 10px monospace';ctx.fillText('HOME',GOAL_LEFT-camera+10,FIELD_BOTTOM+21);ctx.fillText('VISITOR',GOAL_RIGHT-camera-70,FIELD_BOTTOM+21);
}
export const RetroBowlGame:React.FC<{onBack:()=>void}>=({onBack})=>{
  const canvasRef=useRef<HTMLCanvasElement|null>(null),rafRef=useRef<number|null>(null),keysRef=useRef<Record<string,boolean>>({}),playRef=useRef<LivePlay|null>(null),phaseRef=useRef<MatchPhase>('ready');
  const [view,setView]=useState<View>('frontoffice');
  const [franchise,setFranchise]=useState<any>(loadFranchise);
  const [teamName,setTeamName]=useState(franchise.team);
  const [quarter,setQuarter]=useState(1);
  const [clock,setClock]=useState(60);
  const [homeScore,setHomeScore]=useState(0);
  const [awayScore,setAwayScore]=useState(0);
  const [ballYard,setBallYard]=useState(25);
  const [yardsToGo,setYardsToGo]=useState(10);
  const [down,setDown]=useState(1);
  const [possession,setPossession]=useState<'home'|'away'>('home');
  const [cpuYard,setCpuYard]=useState(25);
  const [cpuDown,setCpuDown]=useState(1);
  const [cpuToGo,setCpuToGo]=useState(10);
  const [playPhase,setPlayPhaseState]=useState<MatchPhase>('ready');
  const [message,setMessage]=useState('First and ten. Choose your play.');
  const [lastPlay,setLastPlay]=useState('');
  const [targetReceiver,setTargetReceiver]=useState(1);
  const [gameOver,setGameOver]=useState(false);
  const [paused,setPaused]=useState(false);
  const [selectedDefense,setSelectedDefense]=useState<'blitz'|'zone'|'man'>('zone');
  const [lastCpuGain,setLastCpuGain]=useState(0);
  const [finalResult,setFinalResult]=useState('');
  const [playStats,setPlayStats]=useState({passing:0,rushing:0,completions:0,interceptions:0});
  const [showPlaybook,setShowPlaybook]=useState(true);
  const [kickMeter,setKickMeter]=useState(0);
  const [kickDirection,setKickDirection]=useState(1);
  const [kickReady,setKickReady]=useState(false);
  const [touchControls,setTouchControls]=useState(false);
  const [seasonRecord,setSeasonRecord]=useState('');
  const [hudPulse,setHudPulse]=useState(0);

  const setPhase=(phase:MatchPhase)=>{phaseRef.current=phase;setPlayPhaseState(phase);};
  const saveFranchise=(next:any)=>{setFranchise(next);try{localStorage.setItem(SAVE_KEY,JSON.stringify(next));}catch{}};
  const updateFranchise=(updates:any)=>saveFranchise({...franchise,...updates});
  const consumeClock=useCallback((seconds:number)=>{
    setClock(current=>{
      const left=current-seconds;
      if(left>0)return left;
      if(quarter>=4){setGameOver(true);setFinalResult(homeScore===awayScore?'TIE GAME':'FINAL');setMessage('FINAL WHISTLE');return 0;}
      setQuarter(q=>q+1);setMessage('END OF QUARTER · Change ends and keep playing.');return Math.max(1,60+left);
    });
  },[quarter,homeScore,awayScore]);

  const finishPlay=useCallback((gain:number,result:string,turnover=false,touchdown=false)=>{
    const play=playRef.current;if(!play||play.phase==='result')return;
    play.phase='result';setPhase('result');setLastPlay(result);setMessage(result);
    if(!turnover){
      if(play.type==='run'||play.type==='screen'&&!play.ballThrown)setPlayStats(s=>({...s,rushing:s.rushing+Math.max(0,gain)}));
      else if(play.ballThrown)setPlayStats(s=>({...s,passing:s.passing+Math.max(0,gain)}));
    }
    consumeClock(Math.max(5,Math.round(6+play.elapsed)));
    if(touchdown){
      setHomeScore(value=>value+7);saveFranchise({...franchise,touchdowns:(franchise.touchdowns||0)+1,coins:franchise.coins+25});
      setPossession('away');setCpuYard(25);setCpuDown(1);setCpuToGo(10);setMessage('TOUCHDOWN! Seven points. Now get a defensive stop.');
      setBallYard(25);setDown(1);setYardsToGo(10);
      return;
    }
    if(turnover){
      setPossession('away');setCpuYard(clamp(100-ballYard-gain,5,95));setCpuDown(1);setCpuToGo(10);setDown(1);setYardsToGo(10);
      setMessage(result+' · VISITOR BALL.');
      return;
    }
    const nextYard=clamp(ballYard+gain,1,99);
    if(nextYard>=100){setHomeScore(value=>value+7);setPossession('away');setCpuYard(25);setCpuDown(1);setCpuToGo(10);setBallYard(25);setDown(1);setYardsToGo(10);return;}
    if(gain>=yardsToGo){setBallYard(nextYard);setDown(1);setYardsToGo(10);setMessage(result+' · FIRST DOWN!');}
    else if(down>=4){setPossession('away');setCpuYard(clamp(100-nextYard,5,95));setCpuDown(1);setCpuToGo(10);setDown(1);setYardsToGo(10);setBallYard(25);setMessage('TURNOVER ON DOWNS · VISITOR BALL.');}
    else{setBallYard(nextYard);setDown(d=>d+1);setYardsToGo(Math.max(1,yardsToGo-gain));}
  },[ballYard,down,yardsToGo,franchise,saveFranchise,consumeClock]);

  const beginPlay=useCallback((type:PlayType)=>{
    if(possession!=='home'||gameOver||paused)return;
    if(playRef.current&&['live','ball','catch'].includes(playRef.current.phase))return;
    const startX=yardX(ballYard);
    const rand=seededRandom(franchise.week*991+Math.round(ballYard*7)+down*13+homeScore);
    const roster=normalizeRoster(franchise.roster);
    const wr1Rating=roster.find(player=>player.id==='wr1')?.rating||3;
    const wr2Rating=roster.find(player=>player.id==='wr2')?.rating||3;
    const rbRating=roster.find(player=>player.id==='rb')?.rating||3;
    const receivers:Receiver[]=[
      {x:startX+(type==='screen'?-88:-12),y:type==='screen'?270:145,number:8,route:type==='screen'?0:-1,speed:(type==='screen'?112:type==='deep'?180:132)+(type==='screen'?rbRating:wr1Rating)*5},
      {x:startX-8,y:270,number:11,route:0,speed:(type==='deep'?172:138)+wr2Rating*5},
      {x:startX-12,y:395,number:18,route:1,speed:128+(roster.find(player=>player.id==='te')?.rating||3)*5},
    ];
    const defenders:Defender[]=Array.from({length:7},(_,i)=>({x:startX+46+(i%3)*68+Math.floor(i/3)*28,y:clamp(100+Math.floor(i*1.25)*48+rand()*12,FIELD_TOP+28,FIELD_BOTTOM-28),speed:80+rand()*34+franchise.defense*5+(roster.find(player=>player.id==='lb')?.rating||3)*2,number:20+i,blocked:0}));
    const blockers:Blocker[]=Array.from({length:5},(_,i)=>({x:startX-2+(i%2)*6,y:174+i*47,number:60+i,target:i%defenders.length}));
    const carrier:Carrier={x:type==='run'?startX-20:startX-43,y:type==='run'?270:270,vx:0,vy:0,number:type==='screen'?24:22};
    const play:LivePlay={phase:'live',type,startX,startY:270,qb:{x:startX-48,y:270},carrier,receivers,defenders,blockers,ball:null,target:targetReceiver-1,ballThrown:false,turnover:false,message:type==='run'?'RUN · Follow your blockers and find the gap.':type==='screen'?'SCREEN · Hit the running back behind the line, then turn upfield.':'PASS · Select a receiver (1–3), then throw with SPACE.',elapsed:0};
    playRef.current=play;setPhase('live');setPlayPhaseState('live');setMessage(play.message);setLastPlay('');setShowPlaybook(false);
  },[possession,gameOver,paused,ballYard,franchise,down,homeScore,targetReceiver]);

  const throwPass=useCallback(()=>{
    const play=playRef.current;if(!play||play.phase!=='live'||play.type==='run'||play.ballThrown)return;
    const receiver=play.receivers[play.target];
    play.ball={x:play.qb.x,y:play.qb.y-15,fromX:play.qb.x,fromY:play.qb.y-15,toX:receiver.x+55,toY:receiver.y,progress:0,receiver:play.target};
    play.ballThrown=true;play.phase='ball';setPhase('ball');setMessage('IN THE AIR · Watch the receiver and the safety!');
  },[]);

  const kickFieldGoal=()=>{
    if(possession!=='home'||gameOver||paused||phaseRef.current==='live'||ballYard<57)return;
    setKickReady(true);setKickMeter(0);setKickDirection(1);
  };
  useEffect(()=>{
    if(!kickReady)return;
    let value=0,direction=1;
    const timer=window.setInterval(()=>{value+=direction*3.2;if(value>=100){value=100;direction=-1;}if(value<=0){value=0;direction=1;}setKickMeter(value);setKickDirection(direction);},26);
    return()=>window.clearInterval(timer);
  },[kickReady]);
  const takeKick=()=>{
    if(!kickReady)return;
    setKickReady(false);
    const distance=100-ballYard+17;
    const timing=1-Math.abs(kickMeter-73)/100;
    const accuracy=clamp(.76-(distance-20)*.009+(franchise.offense-2)*.035+(getRating('k')-3)*.055+timing*.19,.15,.97);
    consumeClock(5);
    if(Math.random()<accuracy){setHomeScore(value=>value+3);saveFranchise({...franchise,fieldGoals:(franchise.fieldGoals||0)+1,coins:franchise.coins+10});setLastPlay('FIELD GOAL GOOD · '+distance+' YARDS');setMessage('THREE POINTS! The kick is through.');}
    else{setLastPlay('FIELD GOAL MISSED · '+distance+' YARDS');setMessage('NO GOOD · The visitors take over.');}
    setPossession('away');setCpuYard(clamp(100-ballYard,5,95));setCpuDown(1);setCpuToGo(10);setDown(1);setYardsToGo(10);setBallYard(25);setShowPlaybook(true);
  };
  const punt=()=>{
    if(possession!=='home'||gameOver||paused||phaseRef.current==='live')return;
    const puntDistance=36+franchise.offense*2+Math.floor(Math.random()*10);
    consumeClock(7);setLastPlay('PUNT · '+puntDistance+' YARDS');setMessage('PUNT AWAY · Set up the defense.');
    setPossession('away');setCpuYard(clamp(100-ballYard-puntDistance,5,90));setCpuDown(1);setCpuToGo(10);setBallYard(25);setDown(1);setYardsToGo(10);setShowPlaybook(true);
  };

  const callDefense=(call:'blitz'|'zone'|'man')=>{
    if(possession!=='away'||gameOver||paused)return;
    setSelectedDefense(call);
    const rand=seededRandom(Date.now()+cpuYard*15+cpuDown*9+awayScore);
    const base=5.8+rand()*8.5-franchise.defense*1.5-getRating('db')*.3-getRating('cb')*.3-getRating('lb')*.35;
    const modifier=call==='blitz'?1.7:call==='zone'?-1.1:0;
    const sackChance=call==='blitz'?.24:call==='man'?.12:.07;
    const turnoverChance=(call==='blitz'?.11:call==='zone'?.14:.08)+getRating('db')*.008+getRating('cb')*.008+getRating('lb')*.006;
    const sack=rand()<sackChance;
    const turnover=!sack&&rand()<turnoverChance;
    const gain=sack?-Math.floor(2+rand()*5):turnover?0:Math.max(0,Math.round(base+modifier));
    const elapsed=6+Math.floor(rand()*7);
    consumeClock(elapsed);setLastCpuGain(gain);
    if(turnover){
      setMessage(call.toUpperCase()+' · INTERCEPTION / FUMBLE! YOU FORCE A TURNOVER.');
      setPossession('home');setBallYard(clamp(100-cpuYard,12,94));setDown(1);setYardsToGo(10);setCpuYard(25);setCpuDown(1);setCpuToGo(10);setShowPlaybook(true);return;
    }
    const nextYard=clamp(cpuYard+gain,1,99);
    if(nextYard>=100){
      setAwayScore(value=>value+7);setMessage('VISITOR TOUCHDOWN · Answer back on offense.');
      setPossession('home');setBallYard(25);setDown(1);setYardsToGo(10);setCpuYard(25);setCpuDown(1);setCpuToGo(10);setShowPlaybook(true);return;
    }
    if(gain>=cpuToGo){
      setCpuYard(nextYard);setCpuDown(1);setCpuToGo(10);setMessage('DEFENSE · They moved the chains. Choose your next call.');
    }else if(cpuDown>=4){
      setPossession('home');setBallYard(clamp(100-nextYard,8,95));setDown(1);setYardsToGo(10);setCpuYard(25);setCpuDown(1);setCpuToGo(10);setMessage('STOPPED ON FOURTH DOWN · YOUR OFFENSE IS BACK.');setShowPlaybook(true);
    }else{
      setCpuYard(nextYard);setCpuDown(value=>value+1);setCpuToGo(value=>Math.max(1,value-gain));setMessage(sack?'SACK · Their offense goes backward.':call.toUpperCase()+' · DEFENSIVE STOP, BUT THEY KEEP THE BALL.');
    }
  };

  useEffect(()=>{
    const down=(event:KeyboardEvent)=>{
      const key=event.key.toLowerCase();
      if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))event.preventDefault();
      keysRef.current[key]=true;
      if(key===' '||key==='enter')throwPass();
      if(key==='1'||key==='2'||key==='3'){setTargetReceiver(Number(key));if(playRef.current)playRef.current.target=Number(key)-1;}
      if(key==='p'&&view==='match')setPaused(v=>!v);
      if(key==='escape'&&view==='match'&&phaseRef.current!=='live'&&phaseRef.current!=='ball'&&phaseRef.current!=='catch')setView('frontoffice');
    };
    const up=(event:KeyboardEvent)=>{keysRef.current[event.key.toLowerCase()]=false;};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);};
  },[throwPass,view]);

  const completeMatch=()=>{
    const won=homeScore>awayScore;
    const tied=homeScore===awayScore;
    setSeasonRecord(won?'WIN':tied?'TIE':'LOSS');
    saveFranchise({...franchise,team:teamName,wins:franchise.wins+(won?1:0),losses:franchise.losses+(!won&&!tied?1:0),ties:(franchise.ties||0)+(tied?1:0),week:franchise.week+1,coins:franchise.coins+(won?45:20)});
    setView('frontoffice');setGameOver(false);setPaused(false);
  };
  useEffect(()=>{
    if(!gameOver)return;
    setFinalResult(homeScore>awayScore?'VICTORY':homeScore<awayScore?'DEFEAT':'TIE GAME');
  },[gameOver,homeScore,awayScore]);

  const startMatch=()=>{
    setHomeScore(0);setAwayScore(0);setQuarter(1);setClock(60);setBallYard(25);setYardsToGo(10);setDown(1);
    setPossession('home');setCpuYard(25);setCpuDown(1);setCpuToGo(10);setGameOver(false);setPaused(false);
    setMessage('KICKOFF · Your offense takes the field.');setLastPlay('');setShowPlaybook(true);setPlayStats({passing:0,rushing:0,completions:0,interceptions:0});
    playRef.current=null;setPhase('ready');setView('match');
  };

  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
    let alive=true,last=performance.now();
    const frame=(now:number)=>{
      if(!alive)return;
      const dt=Math.min(.035,(now-last)/1000);last=now;
      const play=playRef.current;
      const active=!paused&&!gameOver&&view==='match';
      const startX=yardX(ballYard);
      let runnerX=startX-16;
      if(play&&active&&['live','ball','catch'].includes(play.phase)){
        play.elapsed+=dt;
        const runPhase=play.phase==='live'&&play.type==='run'||play.phase==='catch';
        if(runPhase){
          const carrier=play.carrier;
          const accel=720*dt;
          if(keysRef.current.arrowleft||keysRef.current.a)carrier.vx-=accel;
          if(keysRef.current.arrowright||keysRef.current.d)carrier.vx+=accel;
          if(keysRef.current.arrowup||keysRef.current.w)carrier.vy-=accel;
          if(keysRef.current.arrowdown||keysRef.current.s)carrier.vy+=accel;
          const sprint=!!keysRef.current.shift;
          const max=sprint?320+franchise.speed*18+getRating('rb')*12:220+franchise.speed*14+getRating('rb')*8;
          carrier.vx=clamp(carrier.vx,-95,max);carrier.vy=clamp(carrier.vy,-160,160);
          carrier.vx*=Math.pow(.86,dt*60);carrier.vy*=Math.pow(.84,dt*60);
          carrier.x=clamp(carrier.x+carrier.vx*dt,GOAL_LEFT+12,GOAL_RIGHT-8);
          carrier.y=clamp(carrier.y+carrier.vy*dt,FIELD_TOP+30,FIELD_BOTTOM-25);
        }
        if((play.phase==='live'||play.phase==='ball')&&play.type!=='run'){
          play.receivers.forEach((receiver,index)=>{
            receiver.x+=receiver.speed*dt;
            const direction=receiver.route===0?Math.sin(play.elapsed*2.7)*55:receiver.route*Math.min(135,play.elapsed*44);
            receiver.y=clamp((index===0?145:index===1?270:395)+direction,FIELD_TOP+35,FIELD_BOTTOM-35);
          });
        }
        const target=play.phase==='ball'||play.phase==='live'&&play.type!=='run'?play.qb:play.carrier;
        play.defenders.forEach((defender,index)=>{
          if(defender.blocked>0){defender.blocked=Math.max(0,defender.blocked-dt);return;}
          const mark=play.phase==='ball'?play.receivers[play.target]:target;
          const dx=mark.x-defender.x,dy=mark.y-defender.y,len=Math.max(1,Math.hypot(dx,dy));
          defender.x+=dx/len*defender.speed*dt;defender.y+=dy/len*defender.speed*dt;
          if(runPhase&&Math.hypot(defender.x-play.carrier.x,defender.y-play.carrier.y)<23){
            const gain=Math.round((play.carrier.x-play.startX)/YARD_PX);
            const fumble=Math.random()<clamp(.035+(franchise.defense-franchise.speed)*.009,.015,.09);
            finishPlay(gain,fumble?'FUMBLE · THE DEFENSE KNOCKED IT LOOSE':'TACKLED · '+gain+' YARDS',fumble);
          }
          if(play.phase==='live'&&play.type!=='run'&&Math.hypot(defender.x-play.qb.x,defender.y-play.qb.y)<27){
            const gain=Math.round((play.qb.x-play.startX)/YARD_PX)-4;
            finishPlay(gain,'SACK · THE DEFENSE GOT HOME');
          }
        });
        play.blockers.forEach((blocker,index)=>{
          const defender=play.defenders[blocker.target];
          if(!defender)return;
          const dx=defender.x-blocker.x,dy=defender.y-blocker.y,len=Math.max(1,Math.hypot(dx,dy));
          blocker.x+=dx/len*(58+franchise.offense*4+getRating('ol')*5)*dt;blocker.y+=dy/len*(58+franchise.offense*4+getRating('ol')*5)*dt;
          if(Math.hypot(dx,dy)<35)defender.blocked=Math.max(defender.blocked,.22);
        });
        if(play.phase==='ball'&&play.ball){
          play.ball.progress=Math.min(1,play.ball.progress+dt/(play.type==='deep'?1.05:.72));
          const ball=play.ball,receiver=play.receivers[ball.receiver];
          const targetX=receiver.x+8,targetY=receiver.y-5;
          ball.x=play.qb.x+(targetX-play.qb.x)*ball.progress;
          ball.y=play.qb.y-12+(targetY-play.qb.y+12)*ball.progress-Math.sin(ball.progress*Math.PI)*92;
          if(ball.progress>=1){
            const closest=play.defenders.reduce((best,d)=>Math.hypot(d.x-receiver.x,d.y-receiver.y)<Math.hypot(best.x-receiver.x,best.y-receiver.y)?d:best,play.defenders[0]);
            const pressure=closest?Math.hypot(closest.x-receiver.x,closest.y-receiver.y):200;
            const interception=pressure<27&&Math.random()<(.52+(3-franchise.offense)*.04);
            const targetId=play.type==='screen'?'rb':play.target===0?'wr1':play.target===1?'wr2':'te';
            const catchChance=clamp(.58+franchise.offense*.025+getRating('qb')*.035+(getRating(targetId)-3)*.065-(play.type==='deep'?.15:0),.45,.97);
            if(interception){
              setPlayStats(s=>({...s,interceptions:s.interceptions+1}));finishPlay(0,'INTERCEPTION · THE DEFENSE READ THE ROUTE',true);
            }else if(Math.random()>catchChance){
              finishPlay(0,'INCOMPLETE · THE PASS FELL INCOMPLETE.');
            }else{
              play.carrier={x:receiver.x,y:receiver.y,vx:0,vy:0,number:receiver.number};play.phase='catch';setPhase('catch');setMessage('CATCH! NOW TURN UPFIELD · WASD / ARROWS TO RUN.');
              setPlayStats(s=>({...s,completions:s.completions+1}));
            }
          }
        }
        if(runPhase){
          const gain=Math.round((play.carrier.x-play.startX)/YARD_PX);
          if(play.carrier.x>=GOAL_RIGHT-8)finishPlay(gain,'TOUCHDOWN! '+Math.max(1,gain)+' YARDS.',false,true);
          if(play.elapsed>8.5)finishPlay(gain,'WHISTLE · '+gain+' YARDS');
        }
        if(play.phase==='live'&&play.type!=='run'&&play.elapsed>5.5)finishPlay(-4,'SACK · THE QUARTERBACK HELD THE BALL TOO LONG.');
        runnerX=play.carrier.x;
      }
      if(play&&active&&play.phase==='result')runnerX=play.carrier.x;
      const visitorBallYard=100-cpuYard;
      const fieldRunnerX=possession==='home'?runnerX:yardX(visitorBallYard)+42;
      const camera=clamp(fieldRunnerX-460,0,260);
      drawField(ctx,camera,possession==='home'?ballYard:visitorBallYard,possession==='home'?yardsToGo:cpuToGo,possession==='home'?1:-1);
      if(possession==='away'){
        const line=yardX(visitorBallYard), qx=line+44, mid=270;
        // Visitor offense lines up facing left; our defenders line up across from them.
        for(let i=0;i<5;i++)drawPlayer(ctx,line+15-camera,174+i*52,DEFENSE_RED,60+i,'blocker');
        drawPlayer(ctx,qx-camera,mid,DEFENSE_RED,12,'quarterback');
        drawPlayer(ctx,qx+25-camera,mid+65,DEFENSE_RED,24,'carrier');
        for(let i=0;i<3;i++)drawPlayer(ctx,qx+20-camera,135+i*132,DEFENSE_RED,8+i*3,'receiver');
        for(let i=0;i<7;i++)drawPlayer(ctx,line-65-(i%3)*55-camera,112+Math.floor(i*1.3)*48,PLAYER_BLUE,20+i,'defender');
        drawBall(ctx,qx-camera,mid-16);
        ctx.fillStyle='rgba(255,255,255,.82)';ctx.font='bold 11px monospace';ctx.fillText('VISITOR OFFENSE · '+selectedDefense.toUpperCase(),24,84);
      }else if(play){
        // Route art appears before the ball is thrown.
        if(play.type!=='run'&&play.phase==='live'){
          ctx.setLineDash([7,6]);ctx.lineWidth=2;
          play.receivers.forEach((r,i)=>{ctx.strokeStyle=['#f4df8a','#a5e1ff','#f1a6dc'][i];ctx.beginPath();ctx.moveTo(r.x-camera,r.y);ctx.lineTo(r.x+130-camera,r.y+(r.route*65));ctx.stroke();});
          ctx.setLineDash([]);
        }
        play.blockers.forEach(blocker=>drawPlayer(ctx,blocker.x-camera,blocker.y,PLAYER_BLUE,blocker.number,'blocker'));
        play.defenders.forEach(defender=>drawPlayer(ctx,defender.x-camera,defender.y,DEFENSE_RED,defender.number,'defender'));
        if(play.phase==='live'&&play.type!=='run'){
          play.receivers.forEach((r,i)=>drawPlayer(ctx,r.x-camera,r.y,PLAYER_BLUE,r.number,'receiver',i===play.target));
          drawPlayer(ctx,play.qb.x-camera,play.qb.y,PLAYER_BLUE,12,'quarterback');
        }else{
          drawPlayer(ctx,play.carrier.x-camera,play.carrier.y,PLAYER_BLUE,play.carrier.number,'carrier',true);
        }
        if(play.ball)drawBall(ctx,play.ball.x-camera,play.ball.y);
      }else{
        drawPlayer(ctx,startX-52-camera,270,PLAYER_BLUE,12,'quarterback');
        drawPlayer(ctx,startX-14-camera,270,PLAYER_BLUE,22,'carrier',true);
        for(let i=0;i<5;i++)drawPlayer(ctx,startX+5-camera,174+i*54,PLAYER_BLUE,60+i,'blocker');
        for(let i=0;i<7;i++)drawPlayer(ctx,startX+85+(i%3)*53-camera,115+Math.floor(i*1.35)*48,DEFENSE_RED,20+i,'defender');
      }
      // Match scoreboard embedded on the field.
      ctx.fillStyle='rgba(6,18,28,.82)';roundedRect(ctx,16,14,968,42,10);ctx.fill();
      ctx.fillStyle='#f6d77f';ctx.font='900 12px system-ui';ctx.fillText(franchise.team,31,31);
      ctx.fillStyle='#fff';ctx.font='900 20px monospace';ctx.textAlign='center';ctx.fillText(homeScore+'  —  '+awayScore,W/2,43);
      ctx.fillStyle='#f4b7b7';ctx.font='900 12px system-ui';ctx.textAlign='right';ctx.fillText('BAY CITY',968,31);ctx.textAlign='left';
      ctx.fillStyle='rgba(6,18,28,.82)';roundedRect(ctx,16,H-47,310,33,8);ctx.fill();
      ctx.fillStyle='#fff';ctx.font='bold 12px monospace';ctx.fillText((possession==='home'?'OFFENSE':'DEFENSE')+' · Q'+quarter+' · '+Math.floor(clock/60)+':'+String(clock%60).padStart(2,'0'),28,H-26);
      ctx.textAlign='right';ctx.fillStyle='#ffe16c';ctx.fillText(possession==='home'?down+' & '+yardsToGo:'VISITOR '+cpuDown+' & '+cpuToGo,W-22,H-26);ctx.textAlign='left';
      rafRef.current=requestAnimationFrame(frame);
    };
    rafRef.current=requestAnimationFrame(frame);
    return()=>{alive=false;if(rafRef.current!==null)cancelAnimationFrame(rafRef.current);};
  },[view,ballYard,yardsToGo,down,possession,cpuYard,cpuDown,cpuToGo,clock,quarter,homeScore,awayScore,franchise.team,paused,gameOver,finishPlay,franchise.offense]);

  const tapMove=(dx:number,dy:number)=>{
    const play=playRef.current;if(!play||!['live','catch'].includes(play.phase))return;
    const carrier=play.carrier;carrier.vx+=dx*90;carrier.vy+=dy*90;
  };
  const defensivePanel=possession==='away';
  const canPickPlay=!gameOver&&!paused&&!defensivePanel&&(!playRef.current||!['live','ball','catch'].includes(playRef.current.phase));
  const record=franchise.wins+'-'+franchise.losses;
  const getRating=(id:string)=>normalizeRoster(franchise.roster).find(player=>player.id===id)?.rating||2;
  const upgradePlayer=(id:string)=>{
    const roster=normalizeRoster(franchise.roster);
    const player=roster.find(item=>item.id===id);
    if(!player||player.rating>=5||franchise.coins<25)return;
    saveFranchise({...franchise,coins:franchise.coins-25,roster:roster.map(item=>item.id===id?{...item,rating:item.rating+1}:item)});
  };
  const upgrade=(kind:'offense'|'defense'|'speed')=>{
    const current=franchise[kind]||1;if(current>=5||franchise.coins<35)return;
    saveFranchise({...franchise,[kind]:current+1,coins:franchise.coins-35});
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-24 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-slate-950 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-slate-900"><ArrowLeft className="h-4 w-4"/> VIP Arcade</button>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200"><Crown className="h-3.5 w-3.5"/> Gridiron Dynasty · Franchise Football</div>
      </div>
      {view==='frontoffice'&&(
        <div className="space-y-4">
          <section className="relative overflow-hidden rounded-[28px] border border-amber-300/25 bg-[#0d1727] p-6 shadow-2xl sm:p-9">
            <div className="pointer-events-none absolute -right-10 -top-20 h-80 w-80 rounded-full bg-amber-300/15 blur-3xl"/>
            <div className="relative grid gap-8 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
              <div><div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-1 text-[9px] font-black uppercase tracking-[.22em] text-amber-200"><Crown className="h-3 w-3"/> Front Office · Season {Math.ceil(franchise.week/4)}</div><h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-6xl">BUILD A<br/><span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-slate-200 bg-clip-text text-transparent">DYNASTY.</span></h1><p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">Manage the franchise, invest in your team, call the offense, and make every drive count. Your season record and upgrades persist on this device.</p><label className="mt-5 block text-[9px] font-black uppercase tracking-[.2em] text-slate-400">Franchise name</label><input value={teamName} onChange={e=>{const value=e.target.value.toUpperCase().slice(0,20);setTeamName(value);saveFranchise({...franchise,team:value});}} className="mt-2 w-full max-w-sm rounded-xl border border-amber-200/20 bg-black/25 px-4 py-3 text-lg font-black tracking-wider text-amber-100 outline-none focus:border-amber-300/60"/><button onClick={startMatch} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-yellow-500 px-6 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-amber-900/30 transition hover:-translate-y-0.5"><Play className="h-4 w-4"/> Kick Off Week {franchise.week}</button></div>
              <div className="rounded-3xl border border-white/10 bg-black/25 p-5"><div className="text-[9px] font-black uppercase tracking-[.2em] text-slate-400">Season snapshot</div><div className="mt-4 grid grid-cols-3 gap-2 text-center">{[['WINS',franchise.wins],['LOSSES',franchise.losses],['WEEK',franchise.week]].map(([key,value]:any)=><div key={key} className="rounded-xl bg-white/[.06] p-3"><div className="text-[8px] font-bold text-slate-500">{key}</div><div className="mt-1 text-2xl font-black text-white">{value}</div></div>)}</div><div className="mt-4 flex items-center justify-between text-xs"><span className="text-slate-400">Coach credits</span><span className="font-black text-amber-200">{franchise.coins} ✦</span></div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-slate-400">Franchise form</span><span className="font-black text-emerald-200">{franchise.wins>franchise.losses?'PLAYOFF CONTENDER':'BUILDING MOMENTUM'}</span></div>{seasonRecord&&<div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-100/10 p-3 text-xs font-black text-amber-100">LAST WEEK: {seasonRecord}</div>}</div>
            </div>
          </section>
          <section className="grid gap-3 md:grid-cols-3">
            {([{key:'offense',label:'OFFENSE',sub:'Passing accuracy and blocking strength',icon:<Target className="h-5 w-5"/>,tone:'amber'},{key:'defense',label:'DEFENSE',sub:'Pressure, coverage and forced turnovers',icon:<Shield className="h-5 w-5"/>,tone:'rose'},{key:'speed',label:'SPEED',sub:'Ball-carrier acceleration and sprint speed',icon:<Zap className="h-5 w-5"/>,tone:'cyan'}] as const).map(item=><div key={item.key} className="rounded-2xl border border-white/10 bg-[#111d2d] p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-black text-white">{item.icon}{item.label}</div><span className="text-xl font-black text-amber-200">{franchise[item.key]}/5</span></div><p className="mt-2 min-h-8 text-[10px] leading-4 text-slate-400">{item.sub}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-yellow-100" style={{width:franchise[item.key]*20+'%'}}/></div><button disabled={franchise[item.key]>=5||franchise.coins<35} onClick={()=>upgrade(item.key)} className="mt-3 w-full rounded-lg border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-[10px] font-black text-amber-100 disabled:opacity-30">UPGRADE · 35 ✦</button></div>)}
          </section>
          <section className="rounded-3xl border border-amber-200/15 bg-[#111b2a] p-5 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="text-[9px] font-black uppercase tracking-[.22em] text-amber-200">Player development</div><h2 className="mt-1 text-xl font-black text-white">THE STARTING ROSTER</h2><p className="mt-1 text-[10px] text-slate-400">Improve individual players. Their ratings affect routes, catches, blocking, speed and defense.</p></div>
              <span className="rounded-lg border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-[10px] font-black text-amber-100">{normalizeRoster(franchise.roster).length} STARTERS · 25 ✦ PER UPGRADE</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {normalizeRoster(franchise.roster).map(player=><div key={player.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2"><span className="rounded-md bg-white/10 px-2 py-1 text-[8px] font-black tracking-wider text-slate-200">{player.position}</span><span className="font-mono text-[9px] text-slate-500">#{player.number}</span></div>
                <div className="mt-2 truncate text-xs font-black text-white">{player.name}</div>
                <div className="mt-2 flex items-center gap-1">{Array.from({length:5},(_,i)=><span key={i} className={'text-sm '+(i<player.rating?'text-amber-300':'text-slate-700')}>★</span>)}</div>
                <button disabled={player.rating>=5||franchise.coins<25} onClick={()=>upgradePlayer(player.id)} className="mt-3 w-full rounded-lg border border-amber-200/20 bg-amber-200/10 px-2 py-2 text-[9px] font-black text-amber-100 disabled:opacity-30">{player.rating>=5?'MAX RATING':'TRAIN · 25 ✦'}</button>
              </div>)}
            </div>
          </section>
          <div className="rounded-2xl border border-white/10 bg-[#101a29] p-4 text-[10px] leading-5 text-slate-400">MATCH CONTROLS: WASD / ARROWS to move after the snap. Select a receiver with 1, 2, or 3, then SPACE to throw. SHIFT to sprint. Use defensive calls when the visitors have the ball.</div>
        </div>
      )}
      {view==='match'&&(
        <section className="overflow-hidden rounded-[28px] border border-amber-300/20 bg-[#0c1726] shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
            <div><div className="text-[9px] font-black uppercase tracking-[.2em] text-amber-200">{teamName} · WEEK {franchise.week}</div><div className="mt-1 flex items-center gap-3 text-2xl font-black text-white"><span>{homeScore}</span><span className="text-slate-500">—</span><span>{awayScore}</span></div></div>
            <div className="flex items-center gap-5"><div className="text-center"><div className="text-[8px] font-black text-slate-500">QUARTER</div><div className="text-xl font-black text-white">Q{quarter}</div></div><div className="text-center"><div className="text-[8px] font-black text-slate-500">GAME CLOCK</div><div className="text-xl font-black tabular-nums text-amber-100">{Math.floor(clock/60)}:{String(clock%60).padStart(2,'0')}</div></div><button onClick={()=>setPaused(v=>!v)} disabled={gameOver} className="rounded-xl border border-white/10 p-2 text-slate-300 disabled:opacity-30"><Pause className="h-4 w-4"/></button></div>
          </div>
          <div className="relative bg-[#1b5837] p-2 sm:p-3"><canvas ref={canvasRef} width={W} height={H} className="block w-full rounded-2xl border border-white/10" style={{aspectRatio:'25 / 13',imageRendering:'pixelated'}}/>
            {paused&&<div className="absolute inset-2 sm:inset-3 flex items-center justify-center rounded-2xl bg-slate-950/65 backdrop-blur-sm"><div className="text-center"><div className="text-3xl font-black text-white">PAUSED</div><button onClick={()=>setPaused(false)} className="mt-4 rounded-xl bg-amber-300 px-5 py-3 text-xs font-black text-slate-950">Resume Game</button></div></div>}
            {gameOver&&<div className="absolute inset-2 sm:inset-3 flex items-center justify-center rounded-2xl bg-slate-950/80 backdrop-blur-sm"><div className="max-w-sm text-center"><Trophy className="mx-auto h-9 w-9 text-amber-200"/><div className="mt-2 text-3xl font-black text-white">{finalResult}</div><div className="mt-2 text-sm font-black text-amber-100">{homeScore} — {awayScore}</div><p className="mt-2 text-xs text-slate-300">The final whistle. Your season record is waiting in the front office.</p><button onClick={completeMatch} className="mt-5 rounded-xl bg-gradient-to-r from-amber-300 to-yellow-400 px-5 py-3 text-xs font-black text-slate-950">Complete Week</button></div></div>}
          </div>
          <div className="border-t border-white/10 bg-black/20 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex-1"><div className="text-xs font-black text-amber-100">{message}</div>{lastPlay&&<div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">LAST PLAY · {lastPlay}</div>}</div><div className="flex gap-2 text-[9px] font-black"><span className="rounded-lg bg-white/5 px-2 py-1.5 text-slate-300">PASS {playStats.passing} YDS</span><span className="rounded-lg bg-white/5 px-2 py-1.5 text-slate-300">RUSH {playStats.rushing} YDS</span><span className="rounded-lg bg-white/5 px-2 py-1.5 text-slate-300">INT {playStats.interceptions}</span></div></div>
            {possession==='home'&&!gameOver&&(
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
                <div><div className="mb-2 flex items-center justify-between"><div className="text-[9px] font-black uppercase tracking-[.2em] text-amber-200">Offensive playbook</div><span className="text-[9px] font-bold text-slate-500">DOWN {down} · {yardsToGo} TO GO · BALL ON {ballYard}</span></div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><button disabled={!canPickPlay} onClick={()=>beginPlay('run')} className="rounded-xl border border-amber-200/25 bg-amber-300/15 p-3 text-left disabled:opacity-30"><div className="text-[10px] font-black text-amber-100">POWER RUN</div><p className="mt-1 text-[9px] leading-4 text-slate-400">Follow blocks. Cut through a gap.</p></button><button disabled={!canPickPlay} onClick={()=>beginPlay('pass')} className="rounded-xl border border-cyan-200/25 bg-cyan-300/10 p-3 text-left disabled:opacity-30"><div className="text-[10px] font-black text-cyan-100">SHORT PASS</div><p className="mt-1 text-[9px] leading-4 text-slate-400">Quick routes. Catch and run.</p></button><button disabled={!canPickPlay} onClick={()=>beginPlay('deep')} className="rounded-xl border border-fuchsia-200/25 bg-fuchsia-300/10 p-3 text-left disabled:opacity-30"><div className="text-[10px] font-black text-fuchsia-100">DEEP PASS</div><p className="mt-1 text-[9px] leading-4 text-slate-400">Long throw. Higher risk, more yards.</p></button><button disabled={!canPickPlay} onClick={()=>beginPlay('screen')} className="rounded-xl border border-emerald-200/25 bg-emerald-300/10 p-3 text-left disabled:opacity-30"><div className="text-[10px] font-black text-emerald-100">SCREEN</div><p className="mt-1 text-[9px] leading-4 text-slate-400">Quick toss to the running back.</p></button></div>
                  <div className="mt-3 flex flex-wrap gap-2">{[1,2,3].map(n=><button key={n} onClick={()=>{setTargetReceiver(n);if(playRef.current)playRef.current.target=n-1;}} className={'rounded-lg border px-3 py-2 text-[10px] font-black '+(targetReceiver===n?'border-amber-200/50 bg-amber-200/15 text-amber-100':'border-white/10 bg-white/5 text-slate-400')}>TARGET {n}</button>)}<button disabled={phaseRef.current!=='live'||playRef.current?.type==='run'} onClick={throwPass} className="rounded-lg bg-cyan-300 px-4 py-2 text-[10px] font-black text-slate-950 disabled:opacity-30">THROW · SPACE</button><button disabled={ballYard<57||!canPickPlay} onClick={kickFieldGoal} className="rounded-lg border border-amber-200/25 px-3 py-2 text-[10px] font-black text-amber-100 disabled:opacity-30">FIELD GOAL</button><button disabled={!canPickPlay} onClick={punt} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black text-slate-300 disabled:opacity-30">PUNT</button></div>
                </div>
                <aside className="rounded-2xl border border-white/10 bg-[#101b2a] p-3"><div className="text-[9px] font-black uppercase tracking-[.2em] text-slate-400">Ball carrier controls</div><div className="mt-3 grid grid-cols-3 gap-1"><span/><button onClick={()=>tapMove(0,-1)} className="rounded-lg border border-white/10 bg-white/5 p-2 text-white"><ArrowUp className="mx-auto h-4 w-4"/></button><span/><button onClick={()=>tapMove(-1,0)} className="rounded-lg border border-white/10 bg-white/5 p-2 text-white"><ArrowLeft className="mx-auto h-4 w-4"/></button><button onClick={()=>tapMove(0,1)} className="rounded-lg border border-white/10 bg-white/5 p-2 text-white"><ArrowDown className="mx-auto h-4 w-4"/></button><button onClick={()=>tapMove(1,0)} className="rounded-lg border border-white/10 bg-white/5 p-2 text-white"><ArrowRight className="mx-auto h-4 w-4"/></button></div><p className="mt-3 text-[9px] leading-4 text-slate-500">WASD / arrows move the runner. Hold SHIFT to sprint. Pick a receiver, then throw before the rush gets home.</p></aside>
              </div>
            )}
            {possession==='away'&&!gameOver&&(
              <div className="mt-4 rounded-2xl border border-rose-200/15 bg-[#171c2a] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[.2em] text-rose-200">Defensive coordinator</div><div className="mt-1 text-sm font-black text-white">Bay City has the ball</div><p className="mt-1 text-[10px] text-slate-400">Visitor ball · {cpuDown} & {cpuToGo} · Their field position {cpuYard}. Choose your defensive call.</p></div><span className="rounded-lg bg-rose-300/10 px-3 py-2 text-[10px] font-black text-rose-100">OUR DEFENSE {franchise.defense}/5</span></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><button onClick={()=>callDefense('blitz')} className="rounded-xl border border-rose-200/25 bg-rose-400/10 p-3 text-left"><div className="text-[10px] font-black text-rose-100">BLITZ</div><p className="mt-1 text-[9px] text-slate-400">High sack pressure. Can give up a big play.</p></button><button onClick={()=>callDefense('zone')} className="rounded-xl border border-cyan-200/25 bg-cyan-300/10 p-3 text-left"><div className="text-[10px] font-black text-cyan-100">ZONE COVERAGE</div><p className="mt-1 text-[9px] text-slate-400">Protect space. Best against long gains.</p></button><button onClick={()=>callDefense('man')} className="rounded-xl border border-amber-200/25 bg-amber-200/10 p-3 text-left"><div className="text-[10px] font-black text-amber-100">MAN COVERAGE</div><p className="mt-1 text-[9px] text-slate-400">Balanced pressure and coverage.</p></button></div></div>
            )}
            {kickReady&&<div className="mt-4 rounded-2xl border border-amber-200/25 bg-amber-200/5 p-4"><div className="flex items-center justify-between"><div className="text-xs font-black text-amber-100">KICK METER · STOP IN THE GOLD ZONE</div><span className="text-[10px] text-slate-400">{Math.round(kickMeter)}%</span></div><div className="relative mt-3 h-4 rounded-full bg-white/10"><div className="absolute left-[64%] top-0 h-full w-[18%] rounded-full bg-emerald-400/50"/><div className="absolute top-[-4px] h-6 w-2 rounded bg-white shadow" style={{left:kickMeter+'%'}}/></div><button onClick={takeKick} className="mt-3 rounded-xl bg-amber-300 px-5 py-2.5 text-xs font-black text-slate-950">KICK NOW</button></div>}
            {phaseRef.current==='result'&&playPhase==='result'&&possession==='home'&&!gameOver&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.04] p-3"><div className="text-xs font-bold text-white">Play complete. Call the next play.</div><button onClick={()=>{setPhase('ready');playRef.current=null;setShowPlaybook(true);}} className="rounded-lg bg-white px-4 py-2 text-[10px] font-black text-slate-950">NEXT PLAY</button></div>}
          </div>
        </section>
      )}
    </div>
  );
};