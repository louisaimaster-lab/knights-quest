export interface Vector2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Entity extends Rect {
  id: string;
  vx: number;
  vy: number;
  health: number;
  maxHealth: number;
  facingRight: boolean;
  isGrounded: boolean;
  invulnerableTimer: number;
  onLadder: boolean;
}

export type WeaponType = 'sword' | 'bow' | 'colossal_sword' | 'dual_daggers' | 'mace' | 'battle_axe' | 'torch';
export type SuperAbilityType = 'malevolence' | 'impenetrable' | 'supersonic';

export interface Player extends Entity {
  attackTimer: number;
  attackCooldown: number;
  comboResetTimer: number;
  slashFlipped: boolean;
  isAttacking: boolean;
  isAirAttacking: boolean;
  airAttackCooldown: number;
  hasDiamond: boolean;
  wallJumpsLeft: number;
  wallSliding: boolean;
  wallSlideDir: number;
  coins: number;
  damageMulti: number;
  speedMulti: number;
  jumpMulti: number;
  playerColor?: string;
  weapon?: WeaponType;
  weaponEquipped: boolean;
  superAbility?: SuperAbilityType;
  superAbilityCooldown: number;
  superAbilityActive: boolean;
  superAbilityTimer: number;
  clawsActive?: boolean;
  shieldActive?: boolean;
  shieldTimer?: number;
  timeSlowActive?: boolean;
  poisonTimer: number;
  baseDamageMulti: number;
  baseSpeedMulti: number;
  baseJumpMulti: number;
  baseMaxHealth: number;
  hotbar: (WeaponType | null)[];
  activeSlot: number;
  maceChargeTimer: number;
  maceChargeRatio: number;
  axeSpinCooldown: number;
  axeSpinTimer: number;
  hasMalevolence: boolean;
  malevolenceCooldown: number;
  malevolenceActive: boolean;
  malevolenceTimer: number;
  hasImpenetrable: boolean;
  impenetrableCooldown: number;
  impenetrableActive: boolean;
  impenetrableTimer: number;
  hasSupersonic: boolean;
  supersonicCooldown: number;
  supersonicActive: boolean;
  supersonicTimer: number;
}

export interface UpgradeChoice {
  id: string;
  title: string;
  desc: string;
  cost: number;
  isSuper?: boolean;
  abilityId?: SuperAbilityType;
  effect: (p: Player) => void;
}

export type EnemyType = 'bat' | 'slime' | 'boss' | 'frost_slime' | 'yeti' | 'moss_slime' | 'flytrap';

export interface Enemy extends Entity {
  type: EnemyType;
  stateTimer: number;
  aiState: string;
  trackTimer?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type?: string;
  target?: {x: number, y: number};
}

export interface InteractionText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
}

export interface FallingIcicle {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  state: 'hanging' | 'falling' | 'broken';
  damage: number;
}

export interface Chest extends Rect {
  id: string;
  isOpen: boolean;
  weapon: WeaponType;
}

export interface Projectile extends Rect {
  id: string;
  vx: number;
  vy: number;
  type: 'arrow';
  damage: number;
  facingRight: boolean;
}

export interface DroppedWeapon extends Rect {
  id: string;
  type: WeaponType;
}

export interface GameState {
  floor: number;
  maxFloor: number;
  biome: 'neutral' | 'ice' | 'moss';
  bgMap: number[][];  // holds background details like wood walls (9), etc.
  map: number[][];    // 0 = empty, 1 = wall, 2 = exit/hole, 3 = diamond
  width: number;
  height: number;
  endPos: { x: number, y: number };
  player: Player;
  enemies: Enemy[];
  particles: Particle[];
  texts: InteractionText[];
  fallingIcicles: FallingIcicle[];
  chests: Chest[];
  projectiles: Projectile[];
  droppedWeapons: DroppedWeapon[];
  camera: { x: number; y: number; zoom: number };
  keys: { [key: string]: boolean };
  prevKeys: { [key: string]: boolean };
  mouse: { x: number; y: number; down: boolean, worldX: number, worldY: number, clicked: boolean };
  shakeTimer: number;
  isGameOver: boolean;
  isWin: boolean;
  isPaused: boolean;
  isFloorComplete: boolean;
  transitionRadius: number;
  transitionState: 'in' | 'out' | 'none' | 'out_to_cards' | 'out_to_cards_delay' | 'cards';
  floorTitleState: 'in' | 'show' | 'out' | 'none';
  floorTitleTimer: number;
  upgrades: UpgradeChoice[];
  frostTimer: number;
  frameCounter: number;
  exitPos: { x: number, y: number } | null;
  gateEntered?: boolean;
  gateTimer?: number;
  transitionDelayTimer?: number;
  structureOverlayAlpha: number;
  timeScale: number;
  timeAccumulator?: number;
}
