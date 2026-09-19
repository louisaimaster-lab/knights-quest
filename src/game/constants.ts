export const TILE_SIZE = 32;
export const GRAVITY = 0.5;
export const FRICTION = 0.8;
export const PLAYER_SPEED = 4;
export const JUMP_POWER = -10;
export const MAX_FALL_SPEED = 19.8;

export const COLORS = {
  bg: '#0a0502', // Dark background
  wall: '#2d1b0d', // Orangesih for walls
  wallAccent: '#4d2b12', // Lighter accent for rocks
  player: '#ffe0cc', // Match sprite mock from design
  playerHit: '#ff4d00',
  sword: '#ff9d00', // Orange sword
  bat: '#a855f7', // purple-500
  slime: '#a855f7', // purple-500
  boss: '#ff4d00', // Lava stream tone
  diamond: '#ff9900', // Orange diamond now
  blood: '#ff4d00', // lava stream
  text: '#ffffff',
  hudBg: 'rgba(0,0,0,0.6)'
};

export interface WorldGenConfig {
  /** How compact (higher = more compact/solid walls) or vast (lower = more open air) the caves are. Default: 0.52 */
  density: number;
  /** Controls holes and gaps to progress through (higher = more shafts/cross-tunnels, lower = fewer/tighter paths). Default: 1.0 */
  tunneling: number;
  /** Cave size in tiles: width (columns) and length (vertical depth / rows). Default: width 48, length 140 */
  size: {
    width: number;
    length: number;
  };
}

export const DEFAULT_WORLD_GEN: WorldGenConfig = {
  density: 0.52, // compact, cozy cave walls instead of vast empty voids
  tunneling: 1.0, // balanced holes and gaps to progress through
  size: {
    width: 48,
    length: 140,
  },
};

