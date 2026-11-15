export type CrossyDirection = 'up' | 'down' | 'left' | 'right';
export type CrossyLaneKind = 'grass' | 'road' | 'river' | 'railRoad';
export type CrossyObjectKind = 'vehicle' | 'log' | 'lilyPad' | 'train';
export type CrossyLaneObject = { id: string; x: number; length: number; kind?: CrossyObjectKind };

export function getCrossyDestination(
  x: number,
  row: number,
  direction: CrossyDirection,
  columns = 9,
): { x: number; row: number } {
  switch (direction) {
    case 'up': return { x, row: row + 1 };
    case 'down': return { x, row: Math.max(0, row - 1) };
    case 'left': return { x: Math.max(0, x - 1), row };
    case 'right': return { x: Math.min(columns - 1, x + 1), row };
  }
}

/** Prevent a stale or malformed lane state from ever drawing/spawning the wrong object class. */
export function sanitizeCrossyLaneObjects<T extends { kind?: string }>(
  laneKind: CrossyLaneKind,
  objects: T[],
): T[] {
  switch (laneKind) {
    case 'grass':
      return [];
    case 'road':
      return objects.filter((object) => object.kind === 'vehicle');
    case 'railRoad':
      return objects.filter((object) => object.kind === 'train');
    case 'river':
      return objects.filter((object) => object.kind === 'log' || object.kind === 'lilyPad');
  }
}
