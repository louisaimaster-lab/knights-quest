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

export type WeaponType = 'sword' | 'bow' | 'colossal_sword' | 'dual_daggers' | 'mace' | 'battle_axe' | 'torch' | 'health_potion' | 'speed_potion' | 'bomb' | 'shield' | 'frozen_sword' | 'molten_axe';
export type SuperAbilityType = 'malevolence' | 'impenetrable' | 'supersonic' | 'pulsar' | 'supernova';

export interface Afterimage {
  x: number;
  y: number;
  facingRight: boolean;
  alpha: number;
  bob: number;
  weapon?: WeaponType;
  weaponEquipped: boolean;
}

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
  burnTimer: number;
  burnPulse: number;
  slownessTimer: number;
  redFlashTimer: number;
  oxygen: number;
  maxOxygen: number;
  hasWaterResistance?: boolean;
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
  hasPulsar: boolean;
  pulsarCooldown: number;
  pulsarActive: boolean;
  pulsarTimer: number;
  hasSupernova: boolean;
  supernovaCooldown: number;
  supernovaActive: boolean;
  supernovaTimer: number;
  afterimages?: Afterimage[];
  bowChargeTimer?: number;
  attackAngle?: number;
  speedPotionTimer?: number;
  itemUseCooldown?: number;
}

export interface UpgradeChoice {
  id: string;
  title: string;
  desc: string;
  cost: number;
  isSuper?: boolean;
  isUltimate?: boolean;
  abilityId?: SuperAbilityType;
  effect: (p: Player) => void;
}

export type EnemyType = 'bat' | 'slime' | 'boss' | 'frost_slime' | 'yeti' | 'moss_slime' | 'flytrap' | 'frost_knight' | 'inferno_knight' | 'lava_slime' | 'lava_monster' | 'lava_spider';

export interface Enemy extends Entity {
  type: EnemyType;
  stateTimer: number;
  aiState: string;
  trackTimer?: number;
  turnTimer?: number;
  burnTimer?: number;
  isFrozen?: boolean;
  frozenTimer?: number;
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
  isCastleChest?: boolean;
}

export interface Projectile extends Rect {
  id: string;
  vx: number;
  vy: number;
  type: 'arrow' | 'magma' | 'bomb' | 'lava_wave';
  damage: number;
  facingRight: boolean;
  timer?: number;
  ownerId?: string;
}

export interface DroppedWeapon extends Rect {
  id: string;
  type: WeaponType;
}

export interface SupernovaStar {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  state: 'traveling' | 'windup' | 'exploding';
  timer: number;
}

export interface GameState {
  floor: number;
  maxFloor: number;
  biome: 'neutral' | 'ice' | 'moss' | 'volcanic' | 'ice_fortress';
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
  supernovaStar?: SupernovaStar | null;
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
  transitionState: 'in' | 'out' | 'none' | 'out_to_cards' | 'out_to_cards_delay' | 'cards' | 'cards_enter';
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
  bossCutsceneTriggered?: boolean;
  bossCutsceneTimer?: number;
  bossSpawned?: boolean;
  letterboxHeight?: number;
  selectedUpgradeIndex?: number;
}

export interface SavedRunState {
  floor: number;
  biome: 'neutral' | 'ice' | 'moss' | 'volcanic' | 'ice_fortress';
  player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    health: number;
    maxHealth: number;
    coins: number;
    damageMulti: number;
    speedMulti: number;
    jumpMulti: number;
    hotbar: (WeaponType | null)[];
    activeSlot: number;
    weaponEquipped: boolean;
    hasMalevolence: boolean;
    hasImpenetrable: boolean;
    hasSupersonic: boolean;
    hasPulsar: boolean;
    hasSupernova: boolean;
    hasDiamond: boolean;
    facingRight: boolean;
  };
  hasActiveRun: boolean;
}
