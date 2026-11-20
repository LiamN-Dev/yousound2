export type CrossyCosmeticCategory = 'bird' | 'map';

export type CrossyBirdSkin = {
  id: string;
  name: string;
  price: number;
  description: string;
  tint: string;
};

export type CrossyMapTheme = {
  id: string;
  name: string;
  price: number;
  description: string;
  skyColor: string;
  fogColor: string;
  grassTint: string;
  roadTint: string;
  waterTint: string;
  railTint: string;
  grassColor: string;
  roadColor: string;
  waterColor: string;
  railColor: string;
};

export const CROSSY_BIRD_SKINS: readonly CrossyBirdSkin[] = [
  { id: 'classic', name: 'Classic Chicken', price: 0, description: 'The original road-crossing legend.', tint: '#ffffff' },
  { id: 'golden', name: 'Golden Chicken', price: 35, description: 'A shiny gold finish for your next run.', tint: '#ffd34f' },
  { id: 'blue', name: 'Blue Jay', price: 25, description: 'A cool blue bird with a bright finish.', tint: '#73b7ed' },
  { id: 'rose', name: 'Rose', price: 25, description: 'A soft rose-pink look.', tint: '#e99bbd' },
  { id: 'midnight', name: 'Midnight', price: 45, description: 'A dark violet night-run style.', tint: '#8d86c9' },
];

export const CROSSY_MAPS: readonly CrossyMapTheme[] = [
  {
    id: 'classic', name: 'Classic Crossing', price: 0, description: 'The familiar green fields and blue rivers.',
    skyColor: '#cfe9f6', fogColor: '#cfe9f6',
    grassTint: '#ffffff', roadTint: '#ffffff', waterTint: '#ffffff', railTint: '#ffffff',
    grassColor: '#6da74b', roadColor: '#303b3e', waterColor: '#438eae', railColor: '#66564a',
  },
  {
    id: 'sunset', name: 'Sunset Coast', price: 75, description: 'Warm sunset tones across the crossing.',
    skyColor: '#f5c49e', fogColor: '#f5c49e',
    grassTint: '#e9bd83', roadTint: '#d9a18b', waterTint: '#83bdc9', railTint: '#c69b79',
    grassColor: '#b98b54', roadColor: '#50404a', waterColor: '#4f91a5', railColor: '#78604c',
  },
  {
    id: 'midnight', name: 'Midnight City', price: 100, description: 'A deep-blue night atmosphere.',
    skyColor: '#19283f', fogColor: '#19283f',
    grassTint: '#8da49a', roadTint: '#8490ae', waterTint: '#6e9bb6', railTint: '#aaa0b4',
    grassColor: '#354e4d', roadColor: '#222d42', waterColor: '#244b68', railColor: '#394354',
  },
  {
    id: 'winter', name: 'Frostbound', price: 90, description: 'Cool snow-and-ice colors.',
    skyColor: '#e1f3f7', fogColor: '#e1f3f7',
    grassTint: '#c7e4df', roadTint: '#d5e0e6', waterTint: '#8ebdce', railTint: '#c4d5dc',
    grassColor: '#a8c9c3', roadColor: '#697c88', waterColor: '#4d91ac', railColor: '#879ca7',
  },
];

export function getCrossyCosmetic(category: CrossyCosmeticCategory, itemId: string): CrossyBirdSkin | CrossyMapTheme | null {
  const items = category === 'bird' ? CROSSY_BIRD_SKINS : CROSSY_MAPS;
  return items.find((item) => item.id === itemId) || null;
}
