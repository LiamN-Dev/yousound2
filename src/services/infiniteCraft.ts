export type InfiniteCraftRecipe = { inputA: string; inputB: string; result: string; emoji: string; key: string };

// Curated, named combinations. Unknown pairs deliberately return no result instead of
// inventing a meaningless adjective + ingredient label.
const RAW_RECIPES: Array<[string, string, string, string]> = [
        ['Earth', 'Water', 'Plant', '🌱'], ['Fire', 'Water', 'Steam', '💨'], ['Earth', 'Fire', 'Lava', '🌋'],
        ['Water', 'Wind', 'Wave', '🌊'], ['Earth', 'Wind', 'Dust', '🌫️'], ['Fire', 'Wind', 'Smoke', '💨'],
        ['Water', 'Water', 'Lake', '🏞️'], ['Fire', 'Fire', 'Inferno', '🔥'], ['Earth', 'Earth', 'Mountain', '⛰️'],
        ['Wind', 'Wind', 'Tornado', '🌪️'], ['Lake', 'Water', 'Ocean', '🌊'], ['Ocean', 'Wind', 'Hurricane', '🌀'],
        ['Lava', 'Water', 'Obsidian', '🪨'], ['Lava', 'Wind', 'Stone', '🪨'], ['Fire', 'Stone', 'Metal', '⚙️'],
        ['Dust', 'Fire', 'Ash', '⚱️'], ['Plant', 'Water', 'Swamp', '🐊'], ['Swamp', 'Fire', 'Dragon', '🐉'],
        ['Plant', 'Wind', 'Dandelion', '🌼'], ['Plant', 'Plant', 'Tree', '🌳'], ['Tree', 'Tree', 'Forest', '🌲'],
        ['Forest', 'Fire', 'Charcoal', '⬛'], ['Sand', 'Fire', 'Glass', '🪟'], ['Dust', 'Earth', 'Planet', '🪐'],
        ['Dust', 'Water', 'Mud', '🟤'], ['Mud', 'Fire', 'Brick', '🧱'], ['Brick', 'Brick', 'Wall', '🧱'],
        ['Wall', 'Wall', 'House', '🏠'], ['House', 'House', 'Village', '🏘️'], ['Village', 'Village', 'City', '🏙️'],
        ['City', 'City', 'Metropolis', '🌆'], ['Stone', 'Wind', 'Sand', '🏖️'], ['Fire', 'Planet', 'Sun', '☀️'],
        ['Planet', 'Sun', 'Solar System', '🌌'], ['Solar System', 'Solar System', 'Galaxy', '🌌'],
        ['Galaxy', 'Galaxy', 'Universe', '✨'], ['Steam', 'Wind', 'Cloud', '☁️'], ['Cloud', 'Water', 'Rain', '🌧️'],
        ['Rain', 'Sun', 'Rainbow', '🌈'], ['Cloud', 'Fire', 'Lightning', '⚡'], ['Lightning', 'Metal', 'Electricity', '⚡'],
        ['Electricity', 'Glass', 'Computer', '💻'], ['Computer', 'Computer', 'Internet', '🌐'],
        ['Internet', 'Robot', 'AI', '🤖'], ['Swamp', 'Lightning', 'Life', '🧬'], ['Life', 'Earth', 'Human', '🧑'],
        ['Human', 'Metal', 'Tool', '🛠️'], ['Metal', 'Electricity', 'Robot', '🤖'], ['Human', 'Computer', 'Programmer', '👨‍💻'],
        ['Human', 'Ocean', 'Sailor', '⛵'], ['Human', 'Sky', 'Astronaut', '👨‍🚀'], ['Cloud', 'Cloud', 'Sky', '🌤️'],
        ['Sky', 'Fire', 'Star', '⭐'], ['Star', 'Star', 'Constellation', '✨'], ['Metal', 'Wind', 'Airplane', '✈️'],
        ['Airplane', 'Star', 'Spaceship', '🚀'], ['Astronaut', 'Spaceship', 'Moon Landing', '🌕'],
        ['Life', 'Water', 'Fish', '🐟'], ['Fish', 'Earth', 'Frog', '🐸'], ['Life', 'Wind', 'Bird', '🐦'],
        ['Bird', 'Fire', 'Phoenix', '🔥'], ['Human', 'Fire', 'Chef', '👨‍🍳'], ['Plant', 'Sun', 'Flower', '🌸'],
        ['Plant', 'Earth', 'Wheat', '🌾'], ['Wheat', 'Fire', 'Bread', '🍞'], ['Bread', 'Cheese', 'Pizza', '🍕'],
        ['Water', 'Cold', 'Ice', '🧊'], ['Wind', 'Rain', 'Cold', '❄️'], ['Ice', 'Fire', 'Water', '💧'],
        ['Time', 'Sand', 'Hourglass', '⏳'], ['Computer', 'Clock', 'Time Machine', '⏰'], ['Clock', 'Clock', 'Time', '⏱️'],
        ['Glass', 'Time', 'Clock', '🕰️'], ['Human', 'Robot', 'Cyborg', '🦾'], ['Dragon', 'Fire', 'Volcano', '🌋'],
        ['Mountain', 'Fire', 'Volcano', '🌋'], ['Metal', 'Fire', 'Sword', '⚔️'], ['Human', 'Sword', 'Knight', '🛡️'],
        ['Knight', 'Dragon', 'Hero', '🦸'], ['Electricity', 'Water', 'Hydrogen', '⚛️'], ['Star', 'Time', 'Black Hole', '🕳️'],
        ['Water', 'Milk', 'Cheese', '🧀'], ['Life', 'Grass', 'Cow', '🐄'], ['Cow', 'Human', 'Milk', '🥛'],
        ['Earth', 'Plant', 'Grass', '🌿'], ['Ocean', 'Fish', 'Whale', '🐋'], ['Stone', 'Time', 'Fossil', '🦴'],
        ['Fossil', 'Fire', 'Oil', '🛢️'], ['Oil', 'Metal', 'Car', '🚗'], ['Car', 'Car', 'Traffic', '🚦'],
        ['City', 'Car', 'Highway', '🛣️'], ['Programmer', 'Pizza', 'Hackathon', '💻']
['Lake', 'Tornado', 'Island', '🏝️'], ['Island', 'Island', 'Continent', '🌎'], ['Continent', 'Lake', 'America', '🇺🇸'],
['Water', 'Smoke', 'Fog', '🌫️'], ['Earth', 'Dust', 'Planet', '🪐'], ['Planet', 'Fog', 'Venus', '♀️'], ['Venus', 'Mud', 'Adam', '🧑'], ['Earth', 'Adam', 'Man', '👨'],
['America', 'Sun', 'USA', '🇺🇸'], ['USA', 'Man', 'Uncle Sam', '🎩'], ['Lake', 'Water', 'Ocean', '🌊'], ['Ocean', 'Water', 'Fish', '🐟'], ['Fish', 'Fish', 'Shark', '🦈'],
['Uncle Sam', 'Shark', 'Donald Trump', '👔'], ['America', 'Tornado', 'Trump', '🧡'], ['Human', 'America', 'President', '🏛️'], ['President', 'Life', 'Barack Obama', '🇺🇸'], ['President', 'Internet', 'Donald Trump', '👔'],
['Donald Trump', 'Fire', 'Trump', '🧡'], ['Donald Trump', 'Duck', 'Donald Duck', '🦆'], ['Trump', 'Parrot', 'Trumpet', '🎺'], ['Donald Trump', 'Engine', 'Trump Train', '🚂'], ['Donald Trump', 'Florida', 'Mar-a-Lago', '🏝️'], ['Donald Trump', 'Mars', 'Trump Tower', '🏙️'],
['America', 'Rainbow', 'Freedom', '🗽'], ['City', 'Planet', 'Country', '🌐'],
['Human', 'Music', 'Musician', '🎸'], ['Musician', 'Country', 'Taylor Swift', '🎤'], ['Human', 'Internet', 'YouTuber', '📹'], ['YouTuber', 'Beast', 'MrBeast', '💵'],
['Human', 'Video Game', 'Gamer', '🎮'], ['Gamer', 'Block', 'Minecraft', '⛏️'], ['Minecraft', 'Human', 'Steve', '🧱'], ['Video Game', 'Building', 'Roblox', '🟥'], ['Plumber', 'Video Game', 'Mario', '🍄'],
['Barack Obama', 'Hope', 'Change', '✊'], ['Change', 'Life', 'Evolution', '🧬'],
['Human', 'Movie', 'Actor', '🎬'], ['Actor', 'Comedy', 'Comedian', '🎭'], ['Comedian', 'TV', 'Sitcom', '📺'], ['Human', 'Football', 'Football Player', '🏈'], ['Football Player', 'Argentina', 'Lionel Messi', '⚽'],
['Earth', 'Ocean', 'Planet Earth', '🌎'], ['Ice', 'Mountain', 'Glacier', '🧊'], ['Fire', 'Mountain', 'Volcano', '🌋'], ['Human', 'City', 'Civilization', '🏛️']
];

export function normalizeCraftName(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[<>\\u0000-\\u001f]/g, '').replace(/\\s+/g, ' ').trim().slice(0, 60)
    : '';
}

export function infiniteCraftRecipeKey(a: string, b: string): string {
  return [a.trim().normalize('NFKC').toLocaleLowerCase(), b.trim().normalize('NFKC').toLocaleLowerCase()].sort().join(' + ');
}

const recipeMap = new Map<string, InfiniteCraftRecipe>();
for (const [a, b, result, emoji] of RAW_RECIPES) {
  const inputA = normalizeCraftName(a);
  const inputB = normalizeCraftName(b);
  const name = normalizeCraftName(result);
  if (!inputA || !inputB || !name || !emoji) continue;
  const key = infiniteCraftRecipeKey(inputA, inputB);
  recipeMap.set(key, { inputA, inputB, result: name, emoji, key });
}

export function findInfiniteCraftRecipe(a: unknown, b: unknown): InfiniteCraftRecipe | null {
  const first = normalizeCraftName(a);
  const second = normalizeCraftName(b);
  if (!first || !second) return null;
  return recipeMap.get(infiniteCraftRecipeKey(first, second)) || null;
}

export function listInfiniteCraftRecipes(): InfiniteCraftRecipe[] {
  return [...recipeMap.values()];
}
