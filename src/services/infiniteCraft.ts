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
        ['City', 'Car', 'Highway', '🛣️'], ['Programmer', 'Pizza', 'Hackathon', '💻'],
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
['Earth', 'Ocean', 'Planet Earth', '🌎'], ['Ice', 'Mountain', 'Glacier', '🧊'], ['Fire', 'Mountain', 'Volcano', '🌋'], ['Human', 'City', 'Civilization', '🏛️'],
// More real, recognizable discoveries and the ingredient chains that lead to them.
['Human', 'Money', 'Entrepreneur', '💼'], ['Entrepreneur', 'Rocket', 'Elon Musk', '🚀'], ['Billionaire', 'Rocket', 'Elon Musk', '🚀'],
['Elon Musk', 'Electric Car', 'Tesla', '🚘'], ['Elon Musk', 'Rocket', 'SpaceX', '🚀'], ['Elon Musk', 'Internet', 'X', '❎'],
['Electricity', 'Car', 'Electric Car', '🔋'], ['Battery', 'Car', 'Electric Car', '🚗'], ['Metal', 'Wheel', 'Car', '🚙'],
['Computer', 'Network', 'Internet', '🌐'], ['Internet', 'Video', 'YouTube', '▶️'], ['YouTube', 'Human', 'YouTuber', '📹'],
['YouTuber', 'Beast', 'MrBeast', '💵'], ['MrBeast', 'Money', 'Philanthropy', '❤️'], ['Internet', 'Dance', 'TikTok', '📱'],
['TikTok', 'Music', 'Viral Song', '🎵'], ['Internet', 'Social Media', 'Instagram', '📸'], ['Internet', 'Bird', 'Twitter', '🐦'],
['Twitter', 'Elon Musk', 'X', '❎'], ['Internet', 'Game', 'Online Game', '🎮'], ['Online Game', 'Block', 'Minecraft', '⛏️'],
['Minecraft', 'Creeper', 'Explosion', '💥'], ['Minecraft', 'Diamond', 'Diamond Pickaxe', '⛏️'], ['Minecraft', 'Water', 'Obsidian', '🟪'],
['Video Game', 'Plumber', 'Mario', '🍄'], ['Mario', 'Princess', 'Princess Peach', '👑'], ['Mario', 'Dinosaur', 'Yoshi', '🦖'],
['Human', 'Basketball', 'Basketball Player', '🏀'], ['Basketball Player', 'Los Angeles', 'LeBron James', '🏀'],
['Human', 'Soccer', 'Football Player', '⚽'], ['Football Player', 'Portugal', 'Cristiano Ronaldo', '🐐'],
['Football Player', 'Argentina', 'Lionel Messi', '⚽'], ['Soccer', 'World Cup', 'FIFA World Cup', '🏆'],
['Human', 'Pop Music', 'Pop Star', '🎤'], ['Pop Star', 'Pennsylvania', 'Taylor Swift', '🎤'],
['Taylor Swift', 'Football Player', 'Travis Kelce', '🏈'], ['Taylor Swift', 'Guitar', 'Songwriter', '🎸'],
['Music', 'Internet', 'Streaming', '🎧'], ['Streaming', 'Music', 'Spotify', '🟢'], ['Music', 'Vinyl', 'Record Player', '💿'],
['Human', 'Comedy', 'Comedian', '🎭'], ['Comedian', 'Movie', 'Actor', '🎬'], ['Actor', 'Hollywood', 'Movie Star', '⭐'],
['Movie', 'Space', 'Star Wars', '🌌'], ['Star Wars', 'Robot', 'R2-D2', '🤖'], ['Star Wars', 'Desert', 'Tatooine', '🏜️'],
['Human', 'Science', 'Scientist', '🧪'], ['Scientist', 'Apple', 'Isaac Newton', '🍎'], ['Scientist', 'Relativity', 'Albert Einstein', '🧠'],
['Scientist', 'Electricity', 'Nikola Tesla', '⚡'], ['Nikola Tesla', 'Car', 'Tesla', '🚘'], ['Human', 'Painting', 'Artist', '🎨'],
['Artist', 'France', 'Claude Monet', '🖼️'], ['Artist', 'Italy', 'Leonardo da Vinci', '🎨'],
['America', 'President', 'White House', '🏛️'], ['President', 'White House', 'President of the United States', '🇺🇸'],
['President of the United States', 'Shark', 'Donald Trump', '👔'], ['USA', 'Election', 'President', '🗳️'],
['Election', 'Vote', 'Democracy', '🗳️'], ['Donald Trump', 'America', 'MAGA', '🇺🇸'], ['MAGA', 'Hat', 'MAGA Hat', '🧢'],
['Donald Trump', 'Social Media', 'Truth Social', '📱'], ['Donald Trump', 'Golf', 'Golf Course', '⛳'],
['America', 'Senator', 'Congress', '🏛️'], ['Congress', 'Capitol', 'United States Congress', '🏛️'],
['America', 'New York', 'New York City', '🗽'], ['New York City', 'Statue', 'Statue of Liberty', '🗽'],
['America', 'California', 'United States', '🇺🇸'], ['Canada', 'America', 'North America', '🌎'],
['Earth', 'Country', 'World', '🌍'], ['World', 'War', 'World War', '⚔️'], ['World', 'Peace', 'Peace on Earth', '🕊️'],
['Water', 'Desert', 'Oasis', '🏝️'], ['Sand', 'Wind', 'Desert', '🏜️'], ['Desert', 'Cactus', 'Cactus', '🌵'],
['Animal', 'Water', 'Fish', '🐟'], ['Fish', 'Fish', 'Shark', '🦈'], ['Shark', 'Ocean', 'Great White Shark', '🦈'],
['Bird', 'Egg', 'Chicken', '🐔'], ['Chicken', 'Water', 'Duck', '🦆'], ['Duck', 'America', 'Donald Duck', '🦆'],
['Dog', 'Snow', 'Sled Dog', '🐕'], ['Cat', 'Internet', 'Meme', '😹'], ['Meme', 'Internet', 'Viral Meme', '😂'],
['Human', 'Book', 'Writer', '✍️'], ['Writer', 'Fantasy', 'J. R. R. Tolkien', '📚'], ['Fantasy', 'Ring', 'The Lord of the Rings', '💍'],
['Human', 'Magic', 'Wizard', '🧙'], ['Wizard', 'School', 'Harry Potter', '⚡'], ['Harry Potter', 'Snake', 'Voldemort', '🐍'],
['Human', 'Newspaper', 'Journalist', '📰'], ['Journalist', 'Camera', 'Photographer', '📷'], ['Human', 'Law', 'Lawyer', '⚖️'],
['Lawyer', 'Court', 'Judge', '⚖️'], ['Human', 'Hospital', 'Doctor', '🩺'], ['Doctor', 'Medicine', 'Surgeon', '🩻'],
['Plant', 'Coffee', 'Coffee Bean', '☕'], ['Coffee Bean', 'Water', 'Coffee', '☕'], ['Wheat', 'Milk', 'Cereal', '🥣'],
['Bread', 'Tomato', 'Sandwich', '🥪'], ['Cheese', 'Tomato', 'Pizza', '🍕'], ['Potato', 'Oil', 'French Fries', '🍟'],
['Fire', 'Meat', 'Barbecue', '🍖'], ['Human', 'Kitchen', 'Chef', '👨‍🍳'], ['Chef', 'Restaurant', 'Cook', '🍳'],
['Metal', 'Wheel', 'Bicycle', '🚲'], ['Bicycle', 'Motor', 'Motorcycle', '🏍️'], ['Car', 'Road', 'Traffic', '🚦'],
['Airplane', 'Airport', 'Flight', '✈️'], ['Ship', 'Ocean', 'Boat', '⛵'], ['Boat', 'Pirate', 'Pirate Ship', '🏴‍☠️'],
['Planet', 'Life', 'Alien', '👽'], ['Alien', 'Spaceship', 'UFO', '🛸'], ['UFO', 'Area 51', 'Conspiracy Theory', '🛸'],
['Time', 'Human', 'History', '📜'], ['History', 'Computer', 'Wikipedia', '📚'], ['Book', 'Internet', 'Wikipedia', '📚'],
['Human', 'Robot', 'AI', '🤖'], ['AI', 'Art', 'AI Art', '🖼️'], ['AI', 'Music', 'AI Music', '🎶'],
['Fire', 'Ice', 'Steam', '♨️'], ['Water', 'Earth', 'Life', '🧬'], ['Life', 'Ocean', 'Sea Monster', '🐙'],
['Storm', 'Ocean', 'Hurricane', '🌀'], ['Cloud', 'Electricity', 'Lightning', '⚡'], ['Lightning', 'Tree', 'Fire', '🔥'],
['Metal', 'Sun', 'Gold', '🥇'], ['Gold', 'Paper', 'Money', '💵'], ['Money', 'Human', 'Entrepreneur', '💼'],
['Airplane', 'Fire', 'Rocket', '🚀'], ['Spaceship', 'Fire', 'Rocket', '🚀'], ['Animal', 'Monster', 'Beast', '🐲'],
['Video', 'Internet', 'YouTube', '▶️'], ['Camera', 'Computer', 'Video', '📹'], ['Human', 'Sound', 'Music', '🎵'],
['Tree', 'Water', 'Paper', '📄'], ['Paper', 'Pencil', 'Writing', '✍️'], ['Metal', 'Gold', 'Coin', '🪙'],
['Gold', 'Coin', 'Money', '💰'], ['Money', 'Paper', 'Banknote', '💵'], ['Rocket', 'Human', 'Astronaut', '👨‍🚀'],
['Human', 'Animal', 'Farmer', '👩‍🌾'], ['Farmer', 'Wheat', 'Bread', '🍞'], ['Human', 'Ocean', 'Sailor', '⛵'],
['Human', 'Computer', 'Programmer', '👨‍💻'], ['Programmer', 'Internet', 'Website', '🌐'], ['Website', 'Video', 'YouTube', '▶️'], ['Air', 'Metal', 'Sound', '🔊'],
['Life', 'Forest', 'Animal', '🐾'], ['Dragon', 'Human', 'Monster', '👹'],
['Metal', 'Glass', 'Camera', '📷'], ['Camera', 'Computer', 'Video', '📹'],
['Animal', 'Knife', 'Leather', '👜'], ['Leather', 'Air', 'Ball', '⚽'],
['Human', 'Ball', 'Football Player', '🏈'], ['Taylor Swift', 'Football Player', 'Travis Kelce', '🏈'],
['Metal', 'Stone', 'Knife', '🔪'], ['Wood', 'Metal', 'Tool', '🛠️']
];

export function normalizeCraftName(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
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
