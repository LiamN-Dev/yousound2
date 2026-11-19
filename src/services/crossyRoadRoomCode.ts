export const CROSSY_ROAD_ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeCrossyRoadRoomCode(value: unknown): string {
  return typeof value === 'string'
    ? value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6)
    : '';
}

export function isValidCrossyRoadRoomCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(value);
}
