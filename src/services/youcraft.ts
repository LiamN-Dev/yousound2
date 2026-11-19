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
  const normalize = (value: string) => value.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
  const pair = [normalize(first), normalize(second)].sort();
  const key = createHash('sha256').update(pair.join(' + ')).digest('hex');
  return { inputA: pair[0], inputB: pair[1], key };
}

function cleanText(value: unknown, fallback: string, max: number): string {
  const result = typeof value === 'string'
    ? value.replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim()
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

type LocalRecipe = {
  name: string;
  emoji: string;
  category: string;
  description: string;
  abilityName: string;
  abilityDescription: string;
};

const LOCAL_CRAFT_RECIPES: Record<string, LocalRecipe> = {
  "fire + water": { name: "Steam", emoji: "♨️", category: "Vapor", description: "Water heated by fire becomes rising steam.", abilityName: "Vaporize", abilityDescription: "Turns heat into motion." },
  "earth + water": { name: "Plant", emoji: "🌱", category: "Nature", description: "Earth and water give life a place to grow.", abilityName: "Regrow", abilityDescription: "Finds a way to grow in tough conditions." },
  "earth + fire": { name: "Lava", emoji: "🌋", category: "Nature", description: "Molten rock flows from the heat beneath the earth.", abilityName: "Eruption", abilityDescription: "A powerful burst of heat." },
  "air + fire": { name: "Smoke", emoji: "💨", category: "Vapor", description: "Fire sends smoke drifting through the air.", abilityName: "Smokescreen", abilityDescription: "Uses the air to hide what comes next." },
  "air + water": { name: "Wave", emoji: "🌊", category: "Water", description: "Moving air pushes water into waves.", abilityName: "Surge", abilityDescription: "Builds momentum with every movement." },
  "air + earth": { name: "Dust", emoji: "🌫️", category: "Earth", description: "Wind lifts tiny particles of earth into the air.", abilityName: "Dust Cloud", abilityDescription: "A cloud of fine particles obscures the field." },
  "air + air": { name: "Windstorm", emoji: "🌪️", category: "Weather", description: "Two currents of air gather into a windstorm.", abilityName: "Gale", abilityDescription: "A fast-moving burst of force." },
  "water + water": { name: "Lake", emoji: "🏞️", category: "Water", description: "Two bodies of water gather into a lake.", abilityName: "Stillwater", abilityDescription: "A deep reserve of calm energy." },
  "dust + water": { name: "Mud", emoji: "🟤", category: "Earth", description: "Dust and water make thick mud.", abilityName: "Mire", abilityDescription: "Slows anything that crosses it." },
  "fire + plant": { name: "Ash", emoji: "🌋", category: "Earth", description: "A plant left in a flame becomes ash.", abilityName: "Afterglow", abilityDescription: "Something useful remains after the fire." },
  "air + steam": { name: "Cloud", emoji: "☁️", category: "Weather", description: "Steam cools and gathers into a cloud.", abilityName: "Cloudburst", abilityDescription: "Gathers moisture for a later move." },
  "cloud + water": { name: "Rain", emoji: "🌧️", category: "Weather", description: "A water-filled cloud releases rain.", abilityName: "Downpour", abilityDescription: "Restores strength over time." },
  "earth + lava": { name: "Stone", emoji: "🪨", category: "Earth", description: "Cooling lava hardens into stone.", abilityName: "Solidify", abilityDescription: "A durable defensive form." },
  "fire + mud": { name: "Brick", emoji: "🧱", category: "Material", description: "Heat hardens mud into a brick.", abilityName: "Reinforce", abilityDescription: "Builds a sturdy defense." },
  "fire + sand": { name: "Glass", emoji: "🪟", category: "Material", description: "Extreme heat melts sand into glass.", abilityName: "Reflect", abilityDescription: "Turns incoming force aside." },
  "plant + water": { name: "Swamp", emoji: "🐸", category: "Nature", description: "Water and plants combine into a swamp.", abilityName: "Bog", abilityDescription: "Makes the ground difficult to cross." },
  "plant + plant": { name: "Forest", emoji: "🌳", category: "Nature", description: "Many plants grow together into a forest.", abilityName: "Canopy", abilityDescription: "The forest offers strong cover." },
  "sand + water": { name: "Beach", emoji: "🏖️", category: "Land", description: "Water meets sand to create a beach.", abilityName: "Shoreline", abilityDescription: "A flexible boundary between land and water." },
  "stone + air": { name: "Sand", emoji: "🏜️", category: "Earth", description: "Wind wears stone down into sand.", abilityName: "Erosion", abilityDescription: "Slowly reshapes the battlefield." },
  "tree + water": { name: "Paper", emoji: "📄", category: "Material", description: "Wood fibers and water can become paper.", abilityName: "Blueprint", abilityDescription: "Turns an idea into a plan." },
  "wood + fire": { name: "Charcoal", emoji: "⬛", category: "Material", description: "Wood heated by fire becomes charcoal.", abilityName: "Ember", abilityDescription: "Keeps a useful spark alive." },
  "earth + earth": { name: "Mountain", emoji: "⛰️", category: "Land", description: "Layers of earth rise into a mountain.", abilityName: "High Ground", abilityDescription: "The elevated ground gives extra protection." },
  "fire + fire": { name: "Energy", emoji: "⚡", category: "Power", description: "Two flames release a stronger source of energy.", abilityName: "Overcharge", abilityDescription: "Stores a burst of raw power." },
  "lake + water": { name: "Ocean", emoji: "🌊", category: "Water", description: "A lake joins the wider ocean.", abilityName: "Deep Current", abilityDescription: "Draws strength from deep water." },
  "earth + plant": { name: "Grass", emoji: "🌿", category: "Nature", description: "Plants spread into a carpet of grass.", abilityName: "Groundcover", abilityDescription: "Turns open ground into a living field." },
  "tree + tree": { name: "Forest", emoji: "🌲", category: "Nature", description: "Trees growing together form a forest.", abilityName: "Woodland", abilityDescription: "A dense natural stronghold." },
  "earth + life": { name: "Human", emoji: "🧑", category: "Life", description: "Life takes human form.", abilityName: "Adapt", abilityDescription: "Learns and adapts to new situations." },
  "life + water": { name: "Fish", emoji: "🐟", category: "Life", description: "Aquatic life becomes a fish.", abilityName: "Current", abilityDescription: "Moves easily through water." },
  "fish + fish": { name: "Shark", emoji: "🦈", category: "Animal", description: "A powerful ocean predator.", abilityName: "Predator", abilityDescription: "A focused attack." },
  "fish + ocean": { name: "Whale", emoji: "🐋", category: "Animal", description: "A giant marine mammal.", abilityName: "Deep Dive", abilityDescription: "Uses the strength of the deep." },
  "america + human": { name: "Uncle Sam", emoji: "🎩", category: "Person", description: "A famous personification of the United States.", abilityName: "Patriot", abilityDescription: "A symbol recognized around the world." },
  "shark + uncle sam": { name: "Donald Trump", emoji: "👔", category: "Person", description: "A real-world public figure discovered through an unexpected combination.", abilityName: "Headline", abilityDescription: "A discovery that makes the news." },
  "donald trump + internet": { name: "Truth Social", emoji: "📱", category: "Technology", description: "A social media platform associated with Donald Trump.", abilityName: "Broadcast", abilityDescription: "Sends a message to a wide audience." },
  "donald trump + duck": { name: "Donald Duck", emoji: "🦆", category: "Character", description: "The famous Disney cartoon duck.", abilityName: "Quack", abilityDescription: "A loud and unmistakable call." },
  "human + internet": { name: "YouTuber", emoji: "📹", category: "Creator", description: "A person who creates videos for YouTube.", abilityName: "Upload", abilityDescription: "Shares a creation with an audience." },
  "beast + youtuber": { name: "MrBeast", emoji: "💵", category: "Creator", description: "The online creator known for large-scale challenges and philanthropy.", abilityName: "Big Challenge", abilityDescription: "Turns an idea into a huge event." },
  "human + music": { name: "Musician", emoji: "🎸", category: "Artist", description: "A person who creates or performs music.", abilityName: "Encore", abilityDescription: "Brings a performance back to life." },
  "country + musician": { name: "Taylor Swift", emoji: "🎤", category: "Person", description: "A globally known singer-songwriter.", abilityName: "Songwriting", abilityDescription: "Turns stories into songs." },
  "argentina + football player": { name: "Lionel Messi", emoji: "⚽", category: "Person", description: "An Argentine football player.", abilityName: "Playmaker", abilityDescription: "Creates opportunities for the whole team." },
  "human + video game": { name: "Gamer", emoji: "🎮", category: "Person", description: "A person who plays video games.", abilityName: "High Score", abilityDescription: "Improves through practice." },
  "block + gamer": { name: "Minecraft", emoji: "⛏️", category: "Game", description: "A sandbox game built around blocks and creativity.", abilityName: "Build", abilityDescription: "Creates structures from simple materials." },
  "human + movie": { name: "Actor", emoji: "🎬", category: "Person", description: "A performer who portrays characters on screen.", abilityName: "Transform", abilityDescription: "Becomes a character." },
  "actor + comedy": { name: "Comedian", emoji: "🎭", category: "Person", description: "A performer who makes people laugh.", abilityName: "Punchline", abilityDescription: "Turns timing into impact." },
  "america + lake": { name: "Great Lakes", emoji: "🌊", category: "Place", description: "The connected freshwater lakes of North America.", abilityName: "Freshwater", abilityDescription: "A vast reserve of fresh water." },
  "continent + lake": { name: "America", emoji: "🇺🇸", category: "Place", description: "A country discovered through a chain of geography recipes.", abilityName: "Landmark", abilityDescription: "A place with a recognizable identity." },
  "cloud + fire": { name: "Lightning", emoji: "⚡", category: "Weather", description: "An electrical discharge in a storm cloud.", abilityName: "Thunderbolt", abilityDescription: "A sudden burst of energy." },
  "lightning + swamp": { name: "Life", emoji: "🧬", category: "Life", description: "A spark of energy brings a living ecosystem to life.", abilityName: "Awaken", abilityDescription: "Turns a spark into living energy." },
  "lake + windstorm": { name: "Island", emoji: "🏝️", category: "Place", description: "Land surrounded by water.", abilityName: "Castaway", abilityDescription: "A remote place to regroup." },
  "island + island": { name: "Continent", emoji: "🌎", category: "Place", description: "A vast connected landmass.", abilityName: "Continental Reach", abilityDescription: "Connects distant regions." },
  "grass + grass": { name: "Tree", emoji: "🌳", category: "Nature", description: "A young tree grows from the living land.", abilityName: "Canopy", abilityDescription: "Offers cover and protection." },
  "air + metal": { name: "Airplane", emoji: "✈️", category: "Vehicle", description: "A powered aircraft that travels through the air.", abilityName: "Takeoff", abilityDescription: "Gets airborne quickly." },
  "airplane + fire": { name: "Rocket", emoji: "🚀", category: "Vehicle", description: "A rocket uses powerful combustion to reach space.", abilityName: "Launch", abilityDescription: "A burst of upward power." },
  "entrepreneur + rocket": { name: "Elon Musk", emoji: "🚀", category: "Person", description: "A technology entrepreneur associated with electric cars and spaceflight.", abilityName: "Disrupt", abilityDescription: "Pushes ambitious technology projects." },
  "metal + sun": { name: "Gold", emoji: "🥇", category: "Material", description: "A precious metal.", abilityName: "Midas Touch", abilityDescription: "Turns an ordinary find into treasure." },
  "gold + paper": { name: "Money", emoji: "💵", category: "Object", description: "Currency used to exchange value.", abilityName: "Trade", abilityDescription: "Makes exchanges possible." },
  "windstorm + metal": { name: "Sound", emoji: "🔊", category: "Science", description: "Vibrations travel through the air as sound.", abilityName: "Resonate", abilityDescription: "Creates a wave that carries." },
  "human + sound": { name: "Music", emoji: "🎵", category: "Art", description: "Organized sound created by people.", abilityName: "Compose", abilityDescription: "Turns sound into a melody." },
  "continent + city": { name: "Country", emoji: "🌐", category: "Place", description: "A nation with cities and territory.", abilityName: "Nationhood", abilityDescription: "Unites places under one identity." },
  "human + ball": { name: "Football Player", emoji: "🏈", category: "Person", description: "An athlete who plays football.", abilityName: "Touchdown", abilityDescription: "Turns a play into points." },
  "life + forest": { name: "Animal", emoji: "🐾", category: "Life", description: "A living creature in an ecosystem.", abilityName: "Instinct", abilityDescription: "Acts on natural instincts." },
  "dragon + human": { name: "Monster", emoji: "👹", category: "Creature", description: "A legendary creature from fantasy stories.", abilityName: "Roar", abilityDescription: "A powerful display of strength." },
  "animal + monster": { name: "Beast", emoji: "🐲", category: "Creature", description: "A powerful or mythical animal.", abilityName: "Wild Force", abilityDescription: "Unleashes untamed power." },
  "leather + air": { name: "Ball", emoji: "⚽", category: "Object", description: "A ball made from leather and filled with air.", abilityName: "Bounce", abilityDescription: "Returns after impact." },
  "animal + knife": { name: "Leather", emoji: "👜", category: "Material", description: "A durable material made from animal hide.", abilityName: "Craft", abilityDescription: "Can be shaped into useful gear." },
  "forest + water": { name: "Wood", emoji: "🪵", category: "Material", description: "Timber from trees.", abilityName: "Build", abilityDescription: "A useful building material." },
  "fire + stone": { name: "Metal", emoji: "⚙️", category: "Material", description: "Metal extracted and shaped using heat.", abilityName: "Forge", abilityDescription: "Shapes raw material into tools." },
  "metal + glass": { name: "Camera", emoji: "📷", category: "Technology", description: "A device that captures photographs.", abilityName: "Capture", abilityDescription: "Records a moment." },
  "camera + computer": { name: "Video", emoji: "📹", category: "Media", description: "Moving images recorded by a camera.", abilityName: "Record", abilityDescription: "Captures a sequence of moments." },
  "video + internet": { name: "YouTube", emoji: "▶️", category: "Platform", description: "A video-sharing platform.", abilityName: "Publish", abilityDescription: "Shares videos with an audience." },
  "taylor swift + football player": { name: "Travis Kelce", emoji: "🏈", category: "Person", description: "An American football player.", abilityName: "End Zone", abilityDescription: "Makes a decisive play." },
};


export function createInstantYouCraftDiscovery(first: YouCraftItem, second: YouCraftItem, recipeKey: string): YouCraftItem {
  const key = [first.name, second.name].map((name) => name.trim().toLowerCase()).sort().join(" + ");
  const known = LOCAL_CRAFT_RECIPES[key];
  const hash = Number.parseInt(recipeKey.slice(0, 8), 16) || 0;
  const attack = 3 + (hash % 6);
  const defense = 12 - attack;
  if (!known) {
    throw new Error("No real-world discovery is mapped for " + first.name + " + " + second.name + " yet. Try another combination.");
  }
  const recipe = known;
  return normalizeYouCraftItem({
    ...recipe,
    attack,
    defense,
    energyCost: 1 + ((hash >>> 8) % 3),
  }, recipeKey);
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
