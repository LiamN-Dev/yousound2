import { createHash } from 'node:crypto';

export type YouCraftItem = {
  id: string;
  name: string;
  emoji: string;
  category: string;
  description: string;
  attack: number;
  defense: number;
  energyCost: number;
  abilityName: string;
  abilityDescription: string;
};

export type YouCraftPlayer = {
  uid: string;
  username: string;
  hp: number;
  energy: number;
  guard: number;
  items: YouCraftItem[];
};

export type YouCraftBattleState = {
  players: YouCraftPlayer[];
  currentTurnUid: string;
  turnNumber: number;
  usedItemIds: Record<string, string[]>;
  log: Array<{ id: string; text: string; at: string }>;
  winnerUid: string | null;
};

export type YouCraftAction = 'strike' | 'guard' | 'charge';

export const YOUCRAFT_STARTER_ITEMS: YouCraftItem[] = [
  { id: 'starter-water', name: 'Water', emoji: '💧', category: 'Element', description: 'A calm current that can become something much greater.', attack: 2, defense: 5, energyCost: 1, abilityName: 'Flow', abilityDescription: 'A steady, balanced starting element.' },
  { id: 'starter-fire', name: 'Fire', emoji: '🔥', category: 'Element', description: 'A spark with the potential to change everything.', attack: 6, defense: 2, energyCost: 2, abilityName: 'Ignite', abilityDescription: 'Hits hard, but leaves little protection.' },
  { id: 'starter-earth', name: 'Earth', emoji: '🌎', category: 'Element', description: 'The foundation beneath every growing thing.', attack: 3, defense: 7, energyCost: 1, abilityName: 'Fortify', abilityDescription: 'Built to hold its ground.' },
  { id: 'starter-air', name: 'Air', emoji: '💨', category: 'Element', description: 'Invisible motion that reaches everywhere.', attack: 4, defense: 3, energyCost: 1, abilityName: 'Gust', abilityDescription: 'Quick and flexible.' },
];

export function canonicalYouCraftRecipe(first: string, second: string) {
  const normalize = (value: string) => value.trim().normalize('NFKC').toLowerCase().replace(/\\s+/g, ' ');
  const pair = [normalize(first), normalize(second)].sort();
  const key = createHash('sha256').update(pair.join(' + ')).digest('hex');
  return { inputA: pair[0], inputB: pair[1], key };
}

function cleanText(value: unknown, fallback: string, max: number): string {
  const result = typeof value === 'string'
    ? value.replace(/[<>\u0000-\u001f]/g, '').replace(/\\s+/g, ' ').trim()
    : '';
  return (result || fallback).slice(0, max);
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

export function normalizeYouCraftItem(raw: any, recipeKey: string): YouCraftItem {
  const name = cleanText(raw?.name, 'Unknown Discovery', 32);
  const category = cleanText(raw?.category, 'Mystery', 18);
  const emoji = cleanText(raw?.emoji, '✨', 4);
  const abilityName = cleanText(raw?.abilityName, 'Unstable Energy', 28);
  return {
    id: 'yc_' + recipeKey.slice(0, 20),
    name,
    emoji,
    category,
    description: cleanText(raw?.description, 'A new discovery made in YouSound.', 150),
    attack: boundedInt(raw?.attack, 4, 1, 9),
    defense: boundedInt(raw?.defense, 4, 1, 9),
    energyCost: boundedInt(raw?.energyCost, 1, 1, 3),
    abilityName,
    abilityDescription: cleanText(raw?.abilityDescription, 'Its power has not been fully understood yet.', 100),
  };
}

export function createInitialYouCraftBattleState(host: { uid: string; username: string }, items: YouCraftItem[]): YouCraftBattleState {
  const player: YouCraftPlayer = {
    uid: host.uid,
    username: host.username,
    hp: 30,
    energy: 3,
    guard: 0,
    items: items.slice(0, 12),
  };
  return {
    players: [player],
    currentTurnUid: host.uid,
    turnNumber: 1,
    usedItemIds: { [host.uid]: [] },
    log: [{ id: 'start', text: host.username + ' opened a new Craft Wars arena.', at: new Date().toISOString() }],
    winnerUid: null,
  };
}

export function joinYouCraftBattleState(state: YouCraftBattleState, guest: { uid: string; username: string }, items: YouCraftItem[]): YouCraftBattleState {
  if (state.players.length !== 1 || state.players[0].uid === guest.uid) throw new Error('This arena cannot be joined.');
  const next: YouCraftBattleState = {
    ...state,
    players: [...state.players, { uid: guest.uid, username: guest.username, hp: 30, energy: 3, guard: 0, items: items.slice(0, 12) }],
    usedItemIds: { ...state.usedItemIds, [guest.uid]: [] },
    log: [...state.log, { id: 'join-' + guest.uid, text: guest.username + ' joined the arena. The battle is ready.', at: new Date().toISOString() }],
  };
  return next;
}

export function applyYouCraftAction(
  state: YouCraftBattleState,
  actorUid: string,
  action: YouCraftAction,
  itemId?: string,
): YouCraftBattleState {
  if (state.winnerUid) throw new Error('This battle has already ended.');
  if (state.players.length !== 2) throw new Error('Waiting for another player to join.');
  if (state.currentTurnUid !== actorUid) throw new Error('It is not your turn.');

  const next: YouCraftBattleState = {
    ...state,
    players: state.players.map((player) => ({ ...player, items: [...player.items] })),
    usedItemIds: Object.fromEntries(Object.entries(state.usedItemIds).map(([uid, ids]) => [uid, [...ids]])),
    log: [...state.log],
  };
  const actor = next.players.find((player) => player.uid === actorUid)!;
  const opponent = next.players.find((player) => player.uid !== actorUid)!;
  const used = next.usedItemIds[actorUid] || [];
  let message = '';

  if (action === 'charge') {
    const before = actor.energy;
    actor.energy = Math.min(5, actor.energy + 2);
    if (actor.energy === before) throw new Error('Your energy is already full. Use an item or wait for your next turn.');
    message = actor.username + ' recharged ' + (actor.energy - before) + ' energy.';
  } else {
    const item = actor.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error('Choose an item from your own collection.');
    if (used.includes(item.id)) throw new Error('You already used that item this round.');

    if (action === 'strike') {
      const cost = item.energyCost;
      if (actor.energy < cost) throw new Error('Not enough energy for that item. Choose Charge or a cheaper item.');
      actor.energy -= cost;
      const rawDamage = Math.max(1, item.attack + Math.floor(item.attack / 3) - Math.floor(opponent.guard / 3));
      const absorbed = Math.min(opponent.guard, rawDamage);
      const damage = rawDamage - absorbed;
      opponent.guard -= absorbed;
      opponent.hp = Math.max(0, opponent.hp - damage);
      message = actor.username + ' used ' + item.name + ' — ' + damage + ' damage dealt' + (absorbed ? ' (' + absorbed + ' blocked).' : '.');
    } else if (action === 'guard') {
      if (actor.energy < 1) throw new Error('Not enough energy to guard. Choose Charge.');
      actor.energy -= 1;
      const gained = Math.min(10 - actor.guard, Math.max(1, item.defense + Math.floor(item.attack / 4)));
      if (gained <= 0) throw new Error('Your guard is already at its limit.');
      actor.guard += gained;
      message = actor.username + ' used ' + item.abilityName + ' to gain ' + gained + ' guard.';
    } else {
      throw new Error('Unknown battle action.');
    }
    next.usedItemIds[actorUid] = [...used, item.id];
  }

  next.turnNumber += 1;
  if (opponent.hp <= 0) {
    next.winnerUid = actorUid;
    message += ' ' + actor.username + ' wins the battle!';
  } else {
    next.currentTurnUid = opponent.uid;
    if (opponent.uid === next.players[0].uid) {
      next.usedItemIds = Object.fromEntries(next.players.map((player) => [player.uid, []]));
    }
  }
  next.log.push({ id: 'turn-' + next.turnNumber, text: message, at: new Date().toISOString() });
  next.log = next.log.slice(-30);
  return next;
}
