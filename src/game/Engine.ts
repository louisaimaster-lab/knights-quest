import {
  GameState,
  Enemy,
  Particle,
  InteractionText,
  Rect,
  EnemyType,
  WeaponType,
  UpgradeChoice,
  SavedRunState,
} from "./types";
import { generateCave } from "./mapGen";
import { AABBMapCollision, rectIntersect, checkTilesAt } from "./physics";
import {
  TILE_SIZE,
  GRAVITY,
  FRICTION,
  PLAYER_SPEED,
  JUMP_POWER,
  MAX_FALL_SPEED,
  COLORS,
} from "./constants";

const tileTextures: { [key: string]: HTMLImageElement } = {};
const CACHE_BUST = Date.now();
export function loadTileTexture(name: string, src: string) {
  if (typeof Image === "undefined") return;
  const img = new Image();
  img.src = `${src}?v=${CACHE_BUST}`;
  img.onload = () => {
    tileTextures[name] = img;
  };
}

export function getAutoTileTexture(
  prefix: string,
  top: boolean,
  bottom: boolean,
  left: boolean,
  right: boolean
): HTMLImageElement | undefined {
  const getTex = (name: string) => {
    const t = tileTextures[`${prefix}_${name}`] || tileTextures[`${prefix}${name}`];
    return (t && t.complete && t.naturalWidth > 0) ? t : undefined;
  };

  // 1. Check Stubs / Pillars / Single Ledges (exposed on 3 sides)
  if (!top && !left && !right && bottom) {
    const t = getTex("stub_down") || getTex("stub_top") || getTex("pillar_top");
    if (t) return t;
  }
  if (!bottom && !left && !right && top) {
    const t = getTex("stub_up") || getTex("stub_bottom") || getTex("pillar_bottom");
    if (t) return t;
  }
  if (!top && !bottom && !right && left) {
    const t = getTex("stub_right") || getTex("stub_east") || getTex("bridge_right");
    if (t) return t;
  }
  if (!top && !bottom && !left && right) {
    const t = getTex("stub_left") || getTex("stub_west") || getTex("bridge_left");
    if (t) return t;
  }

  // 2. Check 1-block Thin Slabs & Pillars (exposed on 2 opposite sides)
  if (!top && !bottom && left && right) {
    const t = getTex("slab_horizontal") || getTex("bridge_mid") || getTex("horizontal_bar");
    if (t) return t;
  }
  if (!left && !right && top && bottom) {
    const t = getTex("pillar_vertical") || getTex("pillar_mid") || getTex("vertical_bar");
    if (t) return t;
  }

  // 3. Check outer corners (air on two adjacent sides)
  if (!top && !left) {
    const t = getTex("top_left") || getTex("left_top");
    if (t) return t;
  }
  if (!top && !right) {
    const t = getTex("top_right") || getTex("right_top");
    if (t) return t;
  }
  if (!bottom && !left) {
    const t = getTex("bottom_left") || getTex("left_bottom");
    if (t) return t;
  }
  if (!bottom && !right) {
    const t = getTex("bottom_right") || getTex("right_bottom");
    if (t) return t;
  }

  // 4. Check outer edges (exposed to air on one side)
  if (!top) {
    const t = getTex("top") || getTex("mid_top") || getTex("top_mid");
    if (t) return t;
  }
  if (!bottom) {
    const t = getTex("bottom") || getTex("mid_bottom") || getTex("bottom_mid");
    if (t) return t;
  }
  if (!left) {
    const t = getTex("left") || getTex("left_mid") || getTex("mid_left");
    if (t) return t;
  }
  if (!right) {
    const t = getTex("right") || getTex("right_mid") || getTex("mid_right");
    if (t) return t;
  }

  // 5. Center (solid on all 4 sides)
  return getTex("center") || getTex("mid_mid") || getTex("mid") || tileTextures[prefix];
}

if (typeof window !== "undefined") {
  const suffixes = [
    "", "_top", "_bottom", "_left", "_right",
    "_top_left", "_top_right", "_bottom_left", "_bottom_right",
    "_center", "_mid", "_mid_mid", "_mid_top", "_mid_bottom",
    "_left_mid", "_right_mid", "_left_top", "_right_top",
    "_left_bottom", "_right_bottom", "_top_mid", "_bottom_mid",
    "_stub_down", "_stub_top", "_stub_up", "_stub_bottom",
    "_stub_left", "_stub_right", "_pillar_top", "_pillar_bottom", "_stub",
    "_slab_horizontal", "_pillar_vertical", "_bridge_mid", "_pillar_mid",
    "_horizontal_bar", "_vertical_bar"
  ];
  const blockTypes = ["dirt", "grass", "cobblestone", "bricks", "moss", "snow", "ice", "basalt", "magma"];
  for (const b of blockTypes) {
    for (const s of suffixes) {
      loadTileTexture(`${b}${s}`, `/tiles/${b}${s}.png`);
    }
  }
  loadTileTexture("torch", "/tiles/torch.png");
  loadTileTexture("background", "/tiles/background.png");
}

export function isWeapon(type: WeaponType | null): boolean {
  if (!type) return false;
  return ['sword', 'bow', 'colossal_sword', 'dual_daggers', 'mace', 'battle_axe', 'frozen_sword', 'molten_axe'].includes(type);
}

export class GameEngine {
  state: GameState;
  ctx: CanvasRenderingContext2D | null = null;
  lightCanvas?: HTMLCanvasElement;
  staticLightCanvas?: HTMLCanvasElement;
  staticLightKey = "";
  canvasWidth = 800;
  canvasHeight = 600;
  isMenuBackground = false;

  constructor() {
    this.state = this.getInitialState();
    this.initFloor(1);
  }

  serializeRunState(): SavedRunState {
    const p = this.state.player;
    return {
      floor: this.state.floor,
      biome: this.state.biome,
      player: {
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        health: p.health,
        maxHealth: p.maxHealth,
        coins: p.coins,
        damageMulti: p.damageMulti,
        speedMulti: p.speedMulti,
        jumpMulti: p.jumpMulti,
        hotbar: [...p.hotbar],
        activeSlot: p.activeSlot,
        weaponEquipped: p.weaponEquipped,
        hasMalevolence: p.hasMalevolence,
        hasImpenetrable: p.hasImpenetrable,
        hasSupersonic: p.hasSupersonic,
        hasPulsar: p.hasPulsar,
        hasSupernova: p.hasSupernova,
        hasDiamond: p.hasDiamond,
        facingRight: p.facingRight
      },
      hasActiveRun: true
    };
  }

  restoreRunState(runState: SavedRunState) {
    this.isMenuBackground = false;
    this.state = this.getInitialState();
    this.initFloor(runState.floor);
    const p = this.state.player;
    const rp = runState.player;

    // Restore player stats & inventory, but keep safe spawn position from initFloor
    p.health = rp.health;
    p.maxHealth = rp.maxHealth;
    p.coins = rp.coins;
    p.damageMulti = rp.damageMulti;
    p.speedMulti = rp.speedMulti;
    p.jumpMulti = rp.jumpMulti;
    p.hotbar = [...rp.hotbar];
    p.activeSlot = rp.activeSlot;
    p.weaponEquipped = rp.weaponEquipped;
    p.weapon = p.hotbar[p.activeSlot] || undefined;
    p.hasMalevolence = rp.hasMalevolence;
    p.hasImpenetrable = rp.hasImpenetrable;
    p.hasSupersonic = rp.hasSupersonic;
    p.hasPulsar = rp.hasPulsar;
    p.hasSupernova = rp.hasSupernova;
    p.hasDiamond = rp.hasDiamond;
    p.facingRight = rp.facingRight;

    this.state.camera.x = p.x + p.w / 2;
    this.state.camera.y = p.y + p.h / 2;
    this.state.transitionState = "none";
    this.state.floorTitleState = "none";
    this.state.isPaused = false;
    this.state.isFloorComplete = false;
    this.isMenuBackground = false;
  }

  initMenuBackground() {
    this.isMenuBackground = true;
    this.initCardBackground();
  }

  initCardBackground() {
    this.isMenuBackground = true;
    const gen = generateCave(Math.min(25, this.state.floor + 1), this.state.maxFloor);
    this.state.map = gen.map;
    this.state.bgMap = gen.bgMap;
    this.state.biome = gen.biome;
    this.state.width = gen.width;
    this.state.height = gen.height;
    this.state.camera.x = Math.floor((gen.width * TILE_SIZE) / 2);
    this.state.camera.y = Math.floor((gen.height * TILE_SIZE) / 2);
    this.state.camera.zoom = 1.5; // ponytail: zoomed in more than the legacy 1.0
    this.state.enemies = [];
    this.state.particles = [];
    this.state.projectiles = [];
    this.state.droppedWeapons = [];
    this.state.chests = [];
    this.state.fallingIcicles = [];
  }

  getInitialState(): GameState {
    return {
      floor: 1,
      maxFloor: 25,
      biome: "neutral",
      bgMap: [],
      map: [],
      width: 0,
      height: 0,
      player: {
        id: "player",
        x: 0,
        y: 0,
        w: 24,
        h: 24,
        vx: 0,
        vy: 0,
        health: 100,
        maxHealth: 100,
        facingRight: true,
        isGrounded: false,
        invulnerableTimer: 0,
        attackTimer: 0,
        attackCooldown: 0,
        comboResetTimer: 0,
        slashFlipped: false,
        isAttacking: false,
        isAirAttacking: false,
        airAttackCooldown: 0,
        hasDiamond: false,
        onLadder: false,
        wallJumpsLeft: 2,
        wallSliding: false,
        wallSlideDir: 0,
        coins: 0,
        damageMulti: 1,
        speedMulti: 1,
        jumpMulti: 1,
        weapon: "sword",
        weaponEquipped: true,
        superAbilityCooldown: 0,
        superAbilityActive: false,
        superAbilityTimer: 0,
        poisonTimer: 0,
        burnTimer: 0,
        burnPulse: 0,
        slownessTimer: 0,
        landingSlowTimer: 0,
        fallPeakY: undefined,
        redFlashTimer: 0,
        fireImmunityTimer: 0,
        oxygen: 100,
        maxOxygen: 100,
        hasWaterResistance: false,
        baseDamageMulti: 1,
        baseSpeedMulti: 1,
        baseJumpMulti: 1,
        baseMaxHealth: 100,
        hotbar: ["sword", null, null],
        activeSlot: 0,
        maceChargeTimer: 0,
        maceChargeRatio: 0,
        axeSpinCooldown: 0,
        axeSpinTimer: 0,
        hasMalevolence: false,
        malevolenceCooldown: 0,
        malevolenceActive: false,
        malevolenceTimer: 0,
        hasImpenetrable: false,
        impenetrableCooldown: 0,
        impenetrableActive: false,
        impenetrableTimer: 0,
        hasSupersonic: false,
        supersonicCooldown: 0,
        supersonicActive: false,
        supersonicTimer: 0,
        hasPulsar: false,
        pulsarCooldown: 0,
        pulsarActive: false,
        pulsarTimer: 0,
        hasSupernova: false,
        supernovaCooldown: 0,
        supernovaActive: false,
        supernovaTimer: 0,
      },
      enemies: [],
      particles: [],
      texts: [],
      fallingIcicles: [],
      chests: [],
      projectiles: [],
      droppedWeapons: [],
      camera: { x: 0, y: 0, zoom: 1.5 },
      keys: {},
      prevKeys: {},
      mouse: { x: 0, y: 0, down: false, worldX: 0, worldY: 0, clicked: false },
      shakeTimer: 0,
      isGameOver: false,
      isWin: false,
      isPaused: false,
      isFloorComplete: false,
      transitionRadius: 0,
      transitionState: "in",
      floorTitleState: "none",
      floorTitleTimer: 0,
      upgrades: [],
      frostTimer: 0,
      frameCounter: 0,
      endPos: { x: 0, y: 0 },
      exitPos: null,
      gateEntered: false,
      gateTimer: 0,
      transitionDelayTimer: 0,
      structureOverlayAlpha: 0,
      timeScale: 1,
      timeAccumulator: 0,
      bossCutsceneTriggered: false,
      bossCutsceneTimer: 0,
      letterboxHeight: 0,
      selectedUpgradeIndex: -1,
      selectedPulseTimer: 0,
      introZoomTimer: 0,
      panDirection: 1,
    };
  }

  initFloor(floor: number) {
    this.isMenuBackground = false;
    this.staticLightKey = ""; // force a re-bake of the static light layer for the new map
    const gen = generateCave(floor, this.state.maxFloor);

    // Immediate start
    this.state.transitionState = "none";
    this.state.floorTitleState = "in";
    this.state.floorTitleTimer = 0;

    if (floor > 1) {
      if (this.state.player.health > this.state.player.maxHealth * 0.75) {
        this.state.player.health = this.state.player.maxHealth;
      } else {
        this.state.player.health +=
          (this.state.player.maxHealth - this.state.player.health) * 0.75;
      }
    }

    this.state.floor = floor;
    this.state.biome = gen.biome;
    this.state.map = gen.map;
    this.state.bgMap = gen.bgMap;
    this.state.width = gen.width;
    this.state.height = gen.height;
    this.state.endPos = gen.endPos;
    this.state.exitPos = {
      x: gen.endPos.x * TILE_SIZE + TILE_SIZE / 2,
      y: gen.endPos.y * TILE_SIZE + TILE_SIZE / 2,
    };

    // Fix bug: Spawn player on the ground, not in the air!
    this.state.player.x = gen.startPos.x * TILE_SIZE + (TILE_SIZE - this.state.player.w) / 2;
    this.state.player.y = (gen.startPos.y + 1) * TILE_SIZE - this.state.player.h;
    this.state.player.vx = 0;
    this.state.player.vy = 0;
    this.state.player.isGrounded = true;
    this.state.player.fallPeakY = undefined;
    this.state.player.landingSlowTimer = 0;

// Reset camera zoom and timer states upon descending
    this.state.camera.zoom = 2.2; // ponytail: start zoomed in, ease out to 1.5 for the descend intro
    this.state.camera.x = this.state.player.x + this.state.player.w / 2;
    this.state.camera.y = this.state.player.y + this.state.player.h / 2;
    this.state.gateEntered = false;
    this.state.gateTimer = 0;
    this.state.frostTimer = 0;
    this.state.introZoomTimer = 60;

    this.state.player.fireImmunityTimer = 0;
    this.state.enemies = [];
    this.state.particles = [];
    this.state.projectiles = [];
    this.state.droppedWeapons = [];
    if (this.state.player) {
      this.state.player.afterimages = [];
    }
    this.state.chests = gen.chests ? gen.chests.map((c, idx) => {
      let chestItem: WeaponType;
      if (c.weapon) {
        chestItem = c.weapon as WeaponType;
      } else if (Math.random() < 0.55) {
        const itemPool: WeaponType[] = this.state.biome === "volcanic" 
          ? ['lava_flask', 'magma_orb', 'torch', 'health_potion', 'speed_potion', 'bomb', 'shield']
          : ['torch', 'health_potion', 'speed_potion', 'bomb', 'shield'];
        chestItem = itemPool[Math.floor(Math.random() * itemPool.length)];
      } else {
        const weaponPool: WeaponType[] = this.state.biome === "volcanic"
          ? ['molten_axe', 'sword', 'bow', 'colossal_sword', 'dual_daggers', 'mace', 'battle_axe']
          : (this.state.biome === "ice"
            ? ['frozen_sword', 'sword', 'bow', 'colossal_sword', 'dual_daggers', 'mace', 'battle_axe']
            : ['sword', 'bow', 'colossal_sword', 'dual_daggers', 'mace', 'battle_axe']);
        chestItem = weaponPool[Math.floor(Math.random() * weaponPool.length)];
      }
      return {
        id: `chest_${floor}_${idx}`,
        x: c.x * TILE_SIZE + 4,
        y: c.y * TILE_SIZE + 14,
        w: 24,
        h: 18,
        isOpen: false,
        weapon: chestItem,
        isCastleChest: c.isCastleChest
      };
    }) : [];
    this.state.fallingIcicles = [];

    // Scan for Big Falling Icicles in Ice Biome (1 in 4 chance)
    if (this.state.biome === "ice") {
      for (let y = 0; y < this.state.height; y++) {
        for (let x = 0; x < this.state.width; x++) {
          if (this.state.map[y] && this.state.map[y][x] === 13) {
            if (Math.random() < 0.25) {
              this.state.map[y][x] = 0; // Remove from map so it's handled as dynamic entity
              this.state.fallingIcicles.push({
                id: `big_icicle_${y}_${x}`,
                x: x * TILE_SIZE,
                y: y * TILE_SIZE,
                w: TILE_SIZE,
                h: TILE_SIZE * 2, // 2 blocks long!
                vy: 0,
                state: "hanging",
                damage: 20, // 20 damage
              });
            }
          }
        }
      }
    }

    this.state.camera.x = this.state.player.x + this.state.player.w / 2;
    this.state.camera.y = this.state.player.y + this.state.player.h / 2;

    // (Floating floor number text will be spawned after the title is fully gone)

    // Spawn enemies
    let enemyCount = floor * 5 + Math.floor(Math.random() * 5);
    if (this.state.biome === "ice" || this.state.biome === "ice_fortress") {
      enemyCount = Math.floor(enemyCount * 0.65); // Reduced enemy count in ice pathways
    }
    for (let i = 0; i < enemyCount; i++) {
      const spot =
        gen.openSpaces[Math.floor(Math.random() * gen.openSpaces.length)];
      // Don't spawn too close to start
      if (
        Math.abs(spot.x - gen.startPos.x) < 5 &&
        Math.abs(spot.y - gen.startPos.y) < 5
      )
        continue;

      let type: EnemyType;
      if (this.state.biome === "ice" || this.state.biome === "ice_fortress") {
        type = Math.random() < 0.20 ? "yeti" : "frost_slime";
      } else if (this.state.biome === "moss") {
        type = Math.random() > 0.5 ? "bat" : "moss_slime";
      } else if (this.state.biome === "volcanic") {
        type = "lava_slime"; // replaces all slimes; no bats in volcanic
      } else {
        type = Math.random() > 0.5 ? "bat" : "slime";
      }

      const isFlying = type === "bat";
      const isBig = type === "yeti";
      const isTank = type === "frost_slime";

      this.state.enemies.push({
        id: `enemy_${Math.random()}`,
        type,
        x: spot.x * TILE_SIZE,
        y: spot.y * TILE_SIZE,
        w: isBig ? 32 : 20,
        h: isBig ? 32 : 20,
        vx: 0,
        vy: 0,
        health: isBig ? 100 : isTank ? 45 : isFlying ? 20 : type === "lava_slime" ? 20 : 30,
        maxHealth: isBig ? 100 : isTank ? 45 : isFlying ? 20 : type === "lava_slime" ? 20 : 30,
        facingRight: Math.random() > 0.5,
        isGrounded: false,
        invulnerableTimer: 0,
        stateTimer: 0,
        onLadder: false,
        aiState: "idle",
      });
    }

    // Spawn Rare Structure Guardian
    if (gen.rareStructure) {
      if (gen.rareStructure.type === 'molten_forge') {
        this.state.enemies.push({
          id: `inferno_knight_${Math.random()}`,
          type: "inferno_knight",
          x: (gen.rareStructure.x + 6) * TILE_SIZE,
          y: (gen.rareStructure.y + gen.rareStructure.h - 3) * TILE_SIZE,
          w: 24,
          h: 24,
          vx: 0,
          vy: 0,
          health: 120,
          maxHealth: 120,
          facingRight: false,
          isGrounded: true,
          invulnerableTimer: 0,
          stateTimer: 0,
          onLadder: false,
          aiState: "idle",
        });
      } else if (gen.rareStructure.type === 'ice_citadel') {
        this.state.enemies.push({
          id: `frost_knight_${Math.random()}`,
          type: "frost_knight",
          x: (gen.rareStructure.x + 6) * TILE_SIZE,
          y: (gen.rareStructure.y + gen.rareStructure.h - 3) * TILE_SIZE,
          w: 24,
          h: 24,
          vx: 0,
          vy: 0,
          health: 100,
          maxHealth: 100,
          facingRight: false,
          isGrounded: true,
          invulnerableTimer: 0,
          stateTimer: 0,
          onLadder: false,
          aiState: "idle",
        });
      }
    }

    if (this.state.biome === "moss") {
      for (let y = 1; y < this.state.height; y++) {
        for (let x = 1; x < this.state.width; x++) {
          if (this.state.map[y][x] === 15 && this.state.map[y - 1][x] === 0) {
            if (Math.random() < 0.01) {
              this.state.enemies.push({
                id: `flytrap_${Math.random()}`,
                type: "flytrap",
                x: x * TILE_SIZE + 4,
                y: (y - 1) * TILE_SIZE,
                w: 24,
                h: 32,
                vx: 0,
                vy: 0,
                health: 50,
                maxHealth: 50,
                facingRight: Math.random() > 0.5,
                isGrounded: true,
                invulnerableTimer: 0,
                stateTimer: 0,
                onLadder: false,
                aiState: "idle",
              });
            }
          }
        }
      }
    }

    if (this.state.biome === "volcanic") {
      // 35% chance for a monster per pool (not block) of lava
      const visitedLava = new Set<string>();
      const lavaPools: { x: number; y: number }[][] = [];

      for (let y = 0; y < this.state.height; y++) {
        for (let x = 0; x < this.state.width; x++) {
          if (this.state.map[y] && this.state.map[y][x] === 21 && !visitedLava.has(`${x},${y}`)) {
            const pool: { x: number; y: number }[] = [];
            const queue: [number, number][] = [[x, y]];
            visitedLava.add(`${x},${y}`);

            while (queue.length > 0) {
              const [cx, cy] = queue.shift()!;
              pool.push({ x: cx, y: cy });

              const neighbors: [number, number][] = [
                [cx + 1, cy],
                [cx - 1, cy],
                [cx, cy + 1],
                [cx, cy - 1]
              ];

              for (const [nx, ny] of neighbors) {
                if (
                  nx >= 0 && nx < this.state.width &&
                  ny >= 0 && ny < this.state.height &&
                  this.state.map[ny] && this.state.map[ny][nx] === 21 &&
                  !visitedLava.has(`${nx},${ny}`)
                ) {
                  visitedLava.add(`${nx},${ny}`);
                  queue.push([nx, ny]);
                }
              }
            }

            if (pool.length > 0) {
              lavaPools.push(pool);
            }
          }
        }
      }

      for (const pool of lavaPools) {
        if (Math.random() < 0.35) {
          const surfaceTiles = pool.filter(t => !this.state.map[t.y - 1] || this.state.map[t.y - 1][t.x] === 0);
          const spawnTile = surfaceTiles.length > 0
            ? surfaceTiles[Math.floor(Math.random() * surfaceTiles.length)]
            : pool[Math.floor(Math.random() * pool.length)];

          this.state.enemies.push({
            id: `lava_monster_${Math.random()}`,
            type: "lava_monster",
            x: spawnTile.x * TILE_SIZE + 2,
            y: (spawnTile.y - 1) * TILE_SIZE,
            w: 28,
            h: 20,
            vx: 0,
            vy: 0,
            health: 45,
            maxHealth: 45,
            facingRight: Math.random() > 0.5,
            isGrounded: true,
            invulnerableTimer: 0,
            stateTimer: 0,
            turnTimer: 0,
            onLadder: false,
            aiState: "idle",
          });
        }
      }

      // Exactly ONE spider spawns in each structure
      if (gen.structures) {
        for (const struct of gen.structures) {
          let spawned = false;
          for (let y = struct.y + 1; y < struct.y + struct.h - 1; y++) {
            for (let x = struct.x + 1; x < struct.x + struct.w - 1; x++) {
              const solidAbove = this.state.map[y - 1] && (this.state.map[y - 1][x] === 11 || this.state.map[y - 1][x] === 19 || this.state.map[y - 1][x] === 20 || this.state.map[y - 1][x] === 1);
              const isOpen = this.state.map[y] && this.state.map[y][x] === 0;
              if (solidAbove && isOpen) {
                this.state.enemies.push({
                  id: `lava_spider_${Math.random()}`,
                  type: "lava_spider",
                  x: x * TILE_SIZE + 4,
                  y: (y - 1) * TILE_SIZE + 2,
                  w: 18,
                  h: 14,
                  vx: 0,
                  vy: 0,
                  health: 30,
                  maxHealth: 30,
                  facingRight: Math.random() > 0.5,
                  isGrounded: false,
                  invulnerableTimer: 0,
                  stateTimer: 0,
                  onLadder: false,
                  aiState: "hanging",
                });
                spawned = true;
                break;
              }
            }
            if (spawned) break;
          }
        }
      }
    }
  }

  spawnParticles(
    x: number,
    y: number,
    color: string,
    amount: number,
    opts: Partial<Particle> = {},
  ) {
    const isBlood =
      color === COLORS.blood ||
      color.includes("180, 0, 0") ||
      color.includes("#990000") ||
      color === "#ff0000";
    const isFire =
      color === "#f97316" ||
      color === "#ea580c" ||
      color === "#ef4444" ||
      color === "#fbbf24";
    const isIce =
      color === "#38bdf8" ||
      color === "#bae6fd" ||
      color.includes("180, 220, 255") ||
      color.includes("100, 200, 255");
    const isMagic =
      color === "#a855f7" ||
      color === "#c084fc" ||
      color === "#f472b6" ||
      color === "#ddaaff";

    for (let i = 0; i < amount; i++) {
      const angle =
        opts.angle !== undefined
          ? opts.angle + (Math.random() - 0.5) * 0.8
          : Math.random() * Math.PI * 2;
      const speed =
        opts.vx !== undefined
          ? Math.hypot(opts.vx, opts.vy || 0) * (0.5 + Math.random())
          : Math.random() * 6 + 1.5;
      const vx =
        opts.vx !== undefined
          ? opts.vx + (Math.random() - 0.5) * 2
          : Math.cos(angle) * speed;
      const vy =
        opts.vy !== undefined
          ? opts.vy + (Math.random() - 0.5) * 2
          : Math.sin(angle) * speed;
      const life = opts.life || Math.random() * 15 + 15;

      let shape = opts.shape;
      if (!shape) {
        if (isIce) shape = Math.random() < 0.5 ? "star" : "square";
        else if (isMagic) shape = Math.random() < 0.6 ? "star" : "circle";
        else if (isBlood) shape = "streak";
        else if (isFire) shape = Math.random() < 0.4 ? "circle" : "square";
        else shape = "square";
      }

      this.state.particles.push({
        x: x + (Math.random() - 0.5) * 4,
        y: y + (Math.random() - 0.5) * 4,
        vx,
        vy,
        life,
        maxLife: life,
        color: opts.color || color,
        secondaryColor:
          opts.secondaryColor ||
          (isFire ? "#fef08a" : isIce ? "#ffffff" : undefined),
        size: opts.size !== undefined ? opts.size : Math.random() * 3 + 2,
        type:
          opts.type ||
          (isFire ? "ember" : isIce ? "crystal" : isBlood ? "blood" : "spark"),
        gravity:
          opts.gravity !== undefined
            ? opts.gravity
            : isBlood
              ? 0.22
              : isFire
                ? -0.06
                : 0.08,
        drag: opts.drag !== undefined ? opts.drag : 0.94,
        grow: opts.grow || 0,
        shape,
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 0.2,
      });
    }
  }

  spawnHitImpact(x: number, y: number, color: string = "#fef08a", isCrit: boolean = false) {
    const sparkCount = isCrit ? 14 : 7;
    for (let i = 0; i < sparkCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (Math.random() * 7 + 4) * (isCrit ? 1.4 : 1.0);
      this.state.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: Math.random() * 7 + 6,
        maxLife: 13,
        color: isCrit ? "#fef08a" : color,
        secondaryColor: "#ffffff",
        size: isCrit ? 3.5 : 2.5,
        shape: "streak",
        drag: 0.88,
      });
    }
    // Shockwave expansion ring at impact point
    this.state.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: isCrit ? 10 : 7,
      maxLife: isCrit ? 10 : 7,
      color: isCrit ? "#fbbf24" : color,
      size: isCrit ? 5 : 3,
      shape: "ring",
      grow: isCrit ? 3.2 : 2.0,
    });
  }

  spawnExplosionVFX(x: number, y: number, radius: number = 32, isFire: boolean = true) {
    // Shockwave expansion ring
    this.state.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 14,
      maxLife: 14,
      color: isFire ? "#f97316" : "#38bdf8",
      size: 4,
      shape: "ring",
      grow: radius / 3.5,
    });

    // Inner bright flash
    this.state.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 6,
      maxLife: 6,
      color: "#ffffff",
      size: 8,
      shape: "circle",
      grow: 4,
    });

    // Shrapnel / Fire ember burst
    const count = 22;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const spd = Math.random() * 8 + 3;
      this.state.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: Math.random() * 16 + 10,
        maxLife: 26,
        color: isFire ? (Math.random() < 0.5 ? "#f97316" : "#fbbf24") : "#bae6fd",
        secondaryColor: "#ffffff",
        size: Math.random() * 4 + 3,
        shape: isFire ? "circle" : "star",
        gravity: 0.12,
        drag: 0.92,
      });
    }

    // Billowing smoke puffs
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = Math.random() * 3 + 1;
      this.state.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 1,
        life: Math.random() * 20 + 15,
        maxLife: 35,
        color: "#334155",
        size: Math.random() * 6 + 6,
        shape: "circle",
        grow: 0.4,
        drag: 0.94,
      });
    }
  }

  spawnDustPuff(x: number, y: number, count: number = 5) {
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5) * 4;
      const vy = -Math.random() * 2.0 - 0.4;
      this.state.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y - 2,
        vx,
        vy,
        life: Math.random() * 10 + 8,
        maxLife: 18,
        color: "#94a3b8",
        size: Math.random() * 2.5 + 2,
        shape: "circle",
        grow: 0.2,
        drag: 0.9,
      });
    }
  }

  spawnWaterSplash(x: number, y: number, isLava: boolean = false) {
    const count = isLava ? 12 : 10;
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5) * 6;
      const vy = -Math.random() * 5 - 2;
      this.state.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y,
        vx,
        vy,
        life: Math.random() * 12 + 10,
        maxLife: 22,
        color: isLava ? (Math.random() < 0.5 ? "#f97316" : "#fbbf24") : (Math.random() < 0.5 ? "#38bdf8" : "#bae6fd"),
        secondaryColor: "#ffffff",
        size: Math.random() * 2.5 + 2,
        shape: "streak",
        gravity: 0.28,
        drag: 0.96,
      });
    }
  }

  update() {
    if (this.state.isFloorComplete || this.state.transitionState === "cards") {
      // Update mouse world pos for UI interactions
      this.state.mouse.worldX =
        (this.state.mouse.x - this.canvasWidth / 2) / this.state.camera.zoom +
        this.state.camera.x;
      this.state.mouse.worldY =
        (this.state.mouse.y - this.canvasHeight / 2) / this.state.camera.zoom +
        this.state.camera.y;

      if (this.state.transitionState === "cards") {
        // Handle Upgrade Clicks (320px x 460px)
        if (this.state.mouse.clicked) {
          const cardWidth = 320;
          const cardHeight = 460;
          const gap = 40;
          const totalWidth = 3 * cardWidth + 2 * gap;
          const startX = this.canvasWidth / 2 - totalWidth / 2;
          const startY = this.canvasHeight / 2 - cardHeight / 2 + 30;

          for (let i = 0; i < this.state.upgrades.length; i++) {
            const u = this.state.upgrades[i];
            const cx = startX + i * (cardWidth + gap);
            const cy = startY;

            // SELECT button confirmation area
            const selBtnW = 220;
            const selBtnH = 52;
            const selBtnX = this.canvasWidth / 2 - selBtnW / 2;
            const selBtnY = this.canvasHeight / 2 - cardHeight / 2 + 30 + cardHeight + 18;

            if (
              this.state.mouse.x >= cx &&
              this.state.mouse.x <= cx + cardWidth &&
              this.state.mouse.y >= cy &&
              this.state.mouse.y <= cy + cardHeight
            ) {
              // Clicking a card selects it (does not apply yet)
              if (this.state.player.coins >= u.cost) {
                this.state.selectedUpgradeIndex = i;
              } else {
                this.state.texts.push({
                  x: this.state.player.x + this.state.player.w / 2,
                  y: this.state.player.y - 15,
                  text: "Not enough coins!",
                  life: 60,
                  maxLife: 60
                });
              }
              this.state.mouse.clicked = false;
              return;
            }

            // Selected card + clicking SELECT applies it
            if (
              this.state.selectedUpgradeIndex === i &&
              this.state.mouse.x >= selBtnX &&
              this.state.mouse.x <= selBtnX + selBtnW &&
              this.state.mouse.y >= selBtnY &&
              this.state.mouse.y <= selBtnY + selBtnH
            ) {
              this.state.player.coins -= u.cost;
              u.effect(this.state.player);
              // ponytail: keep the menu drawn until the outro ring fully closes
              this.state.transitionState = "out";
              this.state.transitionRadius = this.canvasWidth + this.canvasHeight;
              this.state.transitionDelayTimer = 0;
              this.state.selectedPulseTimer = 0;
              this.state.mouse.clicked = false;
              return;
            }
          }
        }

        if (this.state.keys["Enter"]) {
          // Enter skips (no card chosen) and descends
          this.state.selectedUpgradeIndex = -1;
          this.state.transitionState = "out";
          this.state.transitionRadius = this.canvasWidth + this.canvasHeight;
          this.state.transitionDelayTimer = 0;
          this.state.selectedPulseTimer = 0;
        }
        this.state.mouse.clicked = false;
        this.state.prevKeys = { ...this.state.keys };
        return;
      }

      // Advance the green pulse while the card is locked in / outro plays
      this.state.selectedPulseTimer = (this.state.selectedPulseTimer || 0) + 1;

      // ponytail: card outro = brief hold on the selected card, then the ring
      // closes over the menu, a beat of black, then the new floor's zoom intro
      if (this.state.transitionState === "out") {
        this.state.transitionDelayTimer = (this.state.transitionDelayTimer || 0) + 1;
        if (this.state.transitionDelayTimer < 45) {
          // hold: cards stay fully visible, green pulse plays on the locked card
        } else if (this.state.transitionRadius > 0) {
          this.state.transitionRadius -= 25;
          if (this.state.transitionRadius <= 0) this.state.transitionRadius = 0;
        } else if (this.state.transitionDelayTimer >= 45 + 60) {
          this.state.isFloorComplete = false;
          this.isMenuBackground = false;
          this.state.selectedUpgradeIndex = -1;
          this.initFloor(this.state.floor + 1);
          this.state.transitionState = "in";
          this.state.transitionRadius = 0;
          this.state.transitionDelayTimer = 0;
        }
      }

      this.state.mouse.clicked = false;
      this.state.prevKeys = { ...this.state.keys };
      return;
    }

    // ponytail: only idle-pan the menu bg when NOT mid-transition, so the
    // transition state machine below keeps running into "cards"
    if (this.isMenuBackground && this.state.transitionState === "none") {
      this.state.frameCounter++;
      this.panMenuCamera(0.6);
      this.updateParticlesAndTexts();
      if (Math.random() < 0.3) {
        this.spawnParticles(
          this.state.camera.x + (Math.random() - 0.5) * 800,
          this.state.camera.y + (Math.random() - 0.5) * 600,
          Math.random() < 0.5 ? "rgba(251, 191, 36, 0.4)" : "rgba(249, 115, 22, 0.4)",
          1
        );
      }
      return;
    }

    // Toggle Pause state on Escape key
    if (this.state.keys["Escape"] && !this.state.prevKeys["Escape"]) {
      this.state.isPaused = !this.state.isPaused;
    }

    if (this.state.isPaused) {
      if (this.state.mouse.clicked) {
        const panelW = 320;
        const panelH = 240;
        const panelY = this.canvasHeight / 2 - panelH / 2;
        const bw = 240;
        const bh = 42;
        const bx = this.canvasWidth / 2 - bw / 2;

        // Button 0: Resume
        const by0 = panelY + 75;
        if (this.state.mouse.x >= bx && this.state.mouse.x <= bx + bw && this.state.mouse.y >= by0 && this.state.mouse.y <= by0 + bh) {
          this.state.isPaused = false;
        }

        // Button 1: Save & Exit
        const by1 = panelY + 75 + 52;
        if (this.state.mouse.x >= bx && this.state.mouse.x <= bx + bw && this.state.mouse.y >= by1 && this.state.mouse.y <= by1 + bh) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("saveAndExit"));
          }
        }

        // Button 2: Main Menu
        const by2 = panelY + 75 + 104;
        if (this.state.mouse.x >= bx && this.state.mouse.x <= bx + bw && this.state.mouse.y >= by2 && this.state.mouse.y <= by2 + bh) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("exitToMenu"));
          }
        }
      }

      this.state.prevKeys = { ...this.state.keys };
      this.state.mouse.clicked = false;
      return;
    }

    if (this.state.gateEntered) {
      this.state.gateTimer = (this.state.gateTimer || 0) + 1;
      this.updateCamera();
      this.updateParticlesAndTexts();
      this.state.frostTimer = 0; // remove any frost overlay immediately when descending
      if (this.state.gateTimer >= 80) {
        this.state.gateEntered = false;
        this.state.gateTimer = 0;
        this.state.transitionState = "out_to_cards";
        this.state.transitionRadius = this.canvasWidth + this.canvasHeight;
      }
      return;
    }

    if (this.state.transitionState === "in") {
      this.state.transitionRadius += 25;
      if (this.state.transitionRadius > this.canvasWidth + this.canvasHeight) {
        this.state.transitionState = "none";
        this.state.floorTitleState = "in";
        this.state.floorTitleTimer = 0;
      }
      return;
    } else if (this.state.transitionState === "out_to_cards") {
      this.state.transitionRadius -= 25;
      if (this.state.transitionRadius <= 0) {
        this.state.transitionRadius = 0;
        this.state.transitionDelayTimer = 0;
        this.state.transitionState = "out_to_cards_delay";
        this.generateUpgrades();
        this.initCardBackground();
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("floorCompleted", {
              detail: { maxFloor: this.state.floor + 1 },
            }),
          );
        }
      }
      return;
    } else if (this.state.transitionState === "out_to_cards_delay") {
      this.state.transitionDelayTimer = (this.state.transitionDelayTimer || 0) + 1;
      if (this.state.transitionDelayTimer >= 60) {
        this.state.transitionState = "cards_enter";
        this.state.transitionRadius = 0;
      }
      return;
    } else if (this.state.transitionState === "cards_enter") {
      this.state.transitionRadius += 25;
      if (this.state.transitionRadius > this.canvasWidth + this.canvasHeight) {
        this.state.transitionState = "cards";
        this.state.isFloorComplete = true;
      }
      return;
    } else if (this.state.transitionState === "out") {
      this.state.transitionRadius -= 25;
      if (this.state.transitionRadius <= 0) {
        this.state.transitionRadius = 0;
        // ponytail: hold 1s of black between the outro and the new-floor intro
        this.state.transitionDelayTimer = (this.state.transitionDelayTimer || 0) + 1;
        if (this.state.transitionDelayTimer >= 60) {
          this.state.isFloorComplete = false;
          this.initFloor(this.state.floor + 1);
          this.state.transitionState = "in";
          this.state.transitionRadius = 0;
          this.state.transitionDelayTimer = 0;
        }
      }
      return; // Pause game while transitioning out
    }

    // Update mouse world pos
    this.state.mouse.worldX =
      (this.state.mouse.x - this.canvasWidth / 2) / this.state.camera.zoom +
      this.state.camera.x;
    this.state.mouse.worldY =
      (this.state.mouse.y - this.canvasHeight / 2) / this.state.camera.zoom +
      this.state.camera.y;

    if (this.state.floorTitleState !== "none") {
      this.state.floorTitleTimer++;
      if (this.state.floorTitleState === "in") {
        if (this.state.floorTitleTimer >= 30) {
          this.state.floorTitleState = "show";
          this.state.floorTitleTimer = 0;
        }
      } else if (this.state.floorTitleState === "show") {
        if (this.state.floorTitleTimer >= 157) {
          this.state.floorTitleState = "out";
          this.state.floorTitleTimer = 0;
        }
      } else if (this.state.floorTitleState === "out") {
        if (this.state.floorTitleTimer >= 30) {
          this.state.floorTitleState = "none";
          this.state.floorTitleTimer = 0;
          
          // Spawn "Floor (number)" floating text right after floor title screen is fully gone
          this.state.texts.push({
            x: this.state.player.x + this.state.player.w / 2,
            y: this.state.player.y - 40,
            text: `Floor ${this.state.floor}`,
            life: 100,
            maxLife: 100,
          });
        }
      }
      return;
    }

    if (this.state.isGameOver) {
      if (this.state.mouse.clicked || this.state.keys["Enter"]) {
        const btnW = 200;
        const btnH = 50;
        const btnX = this.canvasWidth / 2 - btnW / 2;
        const btnY = this.canvasHeight / 2 + 30;
        if (
          this.state.keys["Enter"] ||
          (this.state.mouse.x >= btnX &&
            this.state.mouse.x <= btnX + btnW &&
            this.state.mouse.y >= btnY &&
            this.state.mouse.y <= btnY + btnH)
        ) {
          this.state = this.getInitialState();
          this.initFloor(1);
        }
      }
      this.state.mouse.clicked = false;
      this.state.prevKeys = { ...this.state.keys };
      return;
    }

    if (this.state.isWin) {
      if (this.state.keys["Enter"]) {
        this.state = this.getInitialState();
        this.initFloor(1);
      }
      this.state.mouse.clicked = false;
      this.state.prevKeys = { ...this.state.keys };
      return;
    }

    if (this.state.isFloorComplete) {
      // Update mouse world pos for UI interactions
      this.state.mouse.worldX =
        (this.state.mouse.x - this.canvasWidth / 2) / this.state.camera.zoom +
        this.state.camera.x;
      this.state.mouse.worldY =
        (this.state.mouse.y - this.canvasHeight / 2) / this.state.camera.zoom +
        this.state.camera.y;

      // Handle Upgrade Clicks (320px x 460px)
      if (this.state.mouse.clicked) {
        const cardWidth = 320;
        const cardHeight = 460;
        const gap = 40;
        const totalWidth = 3 * cardWidth + 2 * gap;
        const startX = this.canvasWidth / 2 - totalWidth / 2;
        const startY = this.canvasHeight / 2 - cardHeight / 2 + 30;

        for (let i = 0; i < this.state.upgrades.length; i++) {
          const u = this.state.upgrades[i];
          const cx = startX + i * (cardWidth + gap);
          const cy = startY;

          if (
            this.state.mouse.x >= cx &&
            this.state.mouse.x <= cx + cardWidth &&
            this.state.mouse.y >= cy &&
            this.state.mouse.y <= cy + cardHeight
          ) {
            if (this.state.player.coins >= u.cost) {
              this.state.player.coins -= u.cost;
              u.effect(this.state.player);
              this.state.isFloorComplete = false;
              this.initFloor(this.state.floor + 1);
            } else {
              this.state.texts.push({
                x: this.state.player.x + this.state.player.w / 2,
                y: this.state.player.y - 15,
                text: "Not enough coins!",
                life: 60,
                maxLife: 60
              });
            }
            break;
          }
        }
      }

      if (this.state.keys["Enter"]) {
        this.state.isFloorComplete = false;
        this.initFloor(this.state.floor + 1);
      }
      this.state.mouse.clicked = false;
      this.state.prevKeys = { ...this.state.keys };
      return;
    }

    // Always update player movement & controls at full 100% time scale!
    this.updatePlayer();

    // Time slow accumulator logic (SUPERSONIC Hyper Perception slows everything EXCEPT player!)
    if (this.state.timeScale && this.state.timeScale < 1.0) {
      this.state.timeAccumulator = (this.state.timeAccumulator || 0) + this.state.timeScale;
      if (this.state.timeAccumulator < 1.0) {
        // Render flow update camera and particles, skip enemy AI, projectiles, and hazards!
        this.updateCamera();
        this.updateParticlesAndTexts();
        
        // Still tick down real-world duration and cooldown of player abilities & poison
        const p = this.state.player;
        if (p.malevolenceActive) {
          p.malevolenceTimer--;
          if (p.malevolenceTimer <= 0) {
            p.malevolenceActive = false;
            p.clawsActive = false;
            p.malevolenceCooldown = 6000;
          }
        } else if (p.malevolenceCooldown > 0) {
          p.malevolenceCooldown--;
        }

        if (p.impenetrableActive) {
          p.impenetrableTimer--;
          if (p.impenetrableTimer <= 0) {
            p.impenetrableActive = false;
            p.shieldActive = false;
            p.shieldTimer = 0;
            p.impenetrableCooldown = 6600;
          }
        } else if (p.impenetrableCooldown > 0) {
          p.impenetrableCooldown--;
        }

        if (p.supersonicActive) {
          p.supersonicTimer--;
          if (p.supersonicTimer <= 0) {
            p.supersonicActive = false;
            p.timeSlowActive = false;
            this.state.timeScale = 1.0;
            p.supersonicCooldown = 7500;
          }
        } else if (p.supersonicCooldown > 0) {
          p.supersonicCooldown--;
        }

        if (p.poisonTimer > 0) p.poisonTimer--;
        
        return;
      }
      this.state.timeAccumulator -= 1.0;
    }

    // Gradual structure lighting fade
    {
      const p = this.state.player;
      const txStart = Math.floor((p.x + 1) / TILE_SIZE);
      const txEnd = Math.floor((p.x + p.w - 1) / TILE_SIZE);
      const tyStart = Math.floor((p.y + 1) / TILE_SIZE);
      const tyEnd = Math.floor((p.y + p.h - 1) / TILE_SIZE);

      let inside = true;
      for (let ty = tyStart; ty <= tyEnd; ty++) {
        for (let tx = txStart; tx <= txEnd; tx++) {
          if (!this.state.bgMap[ty] || this.state.bgMap[ty][tx] !== 9) {
            inside = false;
            break;
          }
        }
        if (!inside) break;
      }

      const fadeRate = 1 / (0.125 * 60);
      if (inside) {
        this.state.structureOverlayAlpha = Math.min(1.0, this.state.structureOverlayAlpha + fadeRate);
      } else {
        this.state.structureOverlayAlpha = Math.max(0.0, this.state.structureOverlayAlpha - fadeRate);
      }
    }

    this.updateEnemies();
    this.updateProjectiles();
    this.updateParticlesAndTexts();
    this.updateFallingIcicles();
    this.updateCamera();

    if (this.state.shakeTimer > 0) this.state.shakeTimer--;

    this.state.frameCounter++;
    if (this.state.frameCounter % 300 === 0 && this.state.exitPos) {
      // ponytail: only emit torch embers inside the visible view, not the whole map
      const cx = this.state.camera.x;
      const cy = this.state.camera.y;
      const halfW = this.canvasWidth / 2 / this.state.camera.zoom;
      const halfH = this.canvasHeight / 2 / this.state.camera.zoom;
      const tx0 = Math.max(0, Math.floor((cx - halfW) / TILE_SIZE));
      const tx1 = Math.min(this.state.width - 1, Math.ceil((cx + halfW) / TILE_SIZE));
      const ty0 = Math.max(0, Math.floor((cy - halfH) / TILE_SIZE));
      const ty1 = Math.min(this.state.height - 1, Math.ceil((cy + halfH) / TILE_SIZE));
      for (let y = ty0; y <= ty1; y++) {
        for (let x = tx0; x <= tx1; x++) {
          if (
            this.state.map[y] &&
            (this.state.map[y][x] === 10 || this.state.map[y][x] === 12)
          ) {
            this.state.particles.push({
              x: x * TILE_SIZE + 16,
              y: y * TILE_SIZE + 16,
              vx: (Math.random() - 0.5) * 4,
              vy: (Math.random() - 0.5) * 4 - 2,
              life: 60,
              maxLife: 60,
              color:
                this.state.map[y][x] === 12
                  ? "rgba(216, 180, 254, 0.8)"
                  : "rgba(255, 234, 0, 0.8)",
              size: 3,
              target: this.state.exitPos,
            });
          }
        }
      }
    }

    // Store previous states
    this.state.prevKeys = { ...this.state.keys };
    this.state.mouse.clicked = false;
  }

  updatePlayer() {
    const p = this.state.player;
    const keys = this.state.keys;
    const prevKeys = this.state.prevKeys;
    const justPressedJump =
      (keys["w"] && !prevKeys["w"]) ||
      (keys["ArrowUp"] && !prevKeys["ArrowUp"]) ||
      (keys[" "] && !prevKeys[" "]);

    // input
    let isDropping = false;
    let isClimbing = false;

    // Check if on ladder
    const centerTx = Math.floor((p.x + p.w / 2) / TILE_SIZE);
    const centerTy = Math.floor((p.y + p.h / 2) / TILE_SIZE);
    const bottomTy = Math.floor((p.y + p.h) / TILE_SIZE);

    p.onLadder = false;
    if (this.state.map[centerTy] && this.state.map[centerTy][centerTx] === 4)
      p.onLadder = true;
    if (this.state.map[bottomTy] && this.state.map[bottomTy][centerTx] === 4)
      p.onLadder = true;

    const isStunned =
      this.state.transitionState === "out" ||
      this.state.transitionState === "out_to_cards" ||
      this.state.gateEntered;

    if (isStunned) {
      p.vx = 0;
      p.vy = 0;
      p.isAttacking = false;
      return;
    }

    // Check if player is in water or on ladder
    let inWater = false;
    let inLava = false;
    let hitIcicle = false;
    let icicleX = 0;

    const leftTile = Math.floor(p.x / TILE_SIZE);
    const rightTile = Math.floor((p.x + p.w) / TILE_SIZE);
    const topTile = Math.floor(p.y / TILE_SIZE);
    const bottomTile = Math.floor((p.y + p.h) / TILE_SIZE);

    for (let ty = topTile; ty <= bottomTile; ty++) {
      for (let tx = leftTile; tx <= rightTile; tx++) {
        const t = this.state.map[ty] && this.state.map[ty][tx];
        if (t === 6 || t === 18) inWater = true;
        if (t === 21) inLava = true;
        if (this.state.biome === "ice" && t === 13) {
          hitIcicle = true;
          icicleX = tx * TILE_SIZE + TILE_SIZE / 2;
        }
      }
    }

    // Weapon & Super & Potion stat multipliers
    let weaponSpeedMult = 1;
    let weaponJumpMult = 1;
    if (p.weaponEquipped && !p.clawsActive) {
      if (p.weapon === 'colossal_sword') { weaponSpeedMult = 0.80; weaponJumpMult = 0.90; }
      else if (p.weapon === 'bow') { weaponSpeedMult = 1.00; weaponJumpMult = 1.20; }
      else if (p.weapon === 'dual_daggers') { weaponSpeedMult = 1.10; weaponJumpMult = 1.10; }
      else if (p.weapon === 'battle_axe') { weaponSpeedMult = 0.90; weaponJumpMult = 0.95; }
      else if (p.weapon === 'mace') { weaponSpeedMult = 0.85; weaponJumpMult = 0.90; }
      else if (p.weapon === 'molten_axe') { weaponSpeedMult = 0.92; weaponJumpMult = 0.95; }
      else if (p.weapon === 'frozen_sword') { weaponSpeedMult = 1.05; weaponJumpMult = 1.05; }
    }

    let potionSpeedMult = 1;
    if (p.speedPotionTimer && p.speedPotionTimer > 0) {
      p.speedPotionTimer--;
      potionSpeedMult = 1.10;
      if (p.speedPotionTimer % 6 === 0) {
        this.spawnParticles(p.x + Math.random() * p.w, p.y + p.h, "#38bdf8", 1);
      }
    }

    // SUPERSONIC active boost (+175% speed active during Hyper Perception)
    let superSpeedMult = 1;
    let superJumpMult = 1;
    if (p.supersonicActive) {
      superSpeedMult = 2.75;
      superJumpMult = 1.25;
    }

    if (p.landingSlowTimer && p.landingSlowTimer > 0) {
      p.landingSlowTimer--;
    }
    const landingSlowMult = (p.landingSlowTimer || 0) > 0 ? 0.45 : 1;
    const slowMult = (p.slownessTimer > 0 ? 0.65 : 1) * landingSlowMult;
    const effectiveSpeedMulti = p.speedMulti * weaponSpeedMult * superSpeedMult * potionSpeedMult * slowMult;
    const effectiveJumpMulti = p.jumpMulti * weaponJumpMult * superJumpMult;

    if (this.state.floorTitleState === "none") {
      p.facingRight = this.state.mouse.worldX > p.x + p.w / 2;
    }

    if (!isStunned && this.state.floorTitleState === "none") {
      const isFireImmune = (p.fireImmunityTimer || 0) > 0;
      const accel = (inLava ? (isFireImmune ? 0.8 : 0.45) : inWater ? 0.8 : 1.5) * effectiveSpeedMulti;
      if (keys["a"] || keys["ArrowLeft"]) {
        p.vx -= accel;
      }
      if (keys["d"] || keys["ArrowRight"]) {
        p.vx += accel;
      }

      if (keys["s"] || keys["ArrowDown"]) {
        isDropping = true;
      }

      if (p.onLadder) {
        if (keys["w"] || keys["ArrowUp"]) {
          p.vy = -3;
          isClimbing = true;
        } else if (keys["s"] || keys["ArrowDown"]) {
          p.vy = 3;
          isClimbing = true;
        } else {
          p.vy = 0; // hang on ladder
          isClimbing = true;
        }
      }
    }

    if (hitIcicle && p.invulnerableTimer <= 0) {
      const kbDir = p.x + p.w / 2 > icicleX ? 1 : -1;
      this.damagePlayer(5, kbDir, 15, -7, COLORS.blood);
    }

    if (this.state.biome === "ice" && inWater) {
      this.state.frostTimer = (this.state.frostTimer || 0) + 1;
      if (this.state.frostTimer % 120 === 0) {
        // Every 2 seconds
        this.damagePlayer(15, undefined, 0, 0, "rgba(180, 220, 255, 0.9)", true);
      }
    } else {
      this.state.frostTimer = Math.max(0, (this.state.frostTimer || 0) - 2);
    }

    // Check standing on heated magma block (tile 20)
    let standingOnMagma = false;
    const feetTy = Math.floor((p.y + p.h + 2) / TILE_SIZE);
    for (let tx = leftTile; tx <= rightTile; tx++) {
      if (this.state.map[feetTy] && this.state.map[feetTy][tx] === 20) {
        standingOnMagma = true;
      }
    }

    // Fire Immunity & Lava / Magma hazards
    if (p.fireImmunityTimer && p.fireImmunityTimer > 0) {
      p.fireImmunityTimer--;
      p.burnTimer = 0; // Extinguish fire immediately!
      if (p.fireImmunityTimer % 8 === 0) {
        this.spawnParticles(p.x + Math.random() * p.w, p.y + p.h, "#f97316", 1);
        this.spawnParticles(p.x + Math.random() * p.w, p.y + p.h, "#38bdf8", 1);
      }
    } else {
      if (standingOnMagma && p.isGrounded) {
        if (this.state.frameCounter % 60 === 0) {
          p.health -= 2;
          if (p.health <= 0) { p.health = 0; this.state.isGameOver = true; }
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, "#f97316", 3);
        }
        p.burnTimer = Math.max(p.burnTimer, 20);
      }
      if (inLava) {
        p.burnTimer = Math.max(p.burnTimer, 30);
      }
    }

    // Ambient Biome Atmosphere VFX (Ember sparks, snowflakes, glowing pollen motes)
    if (this.state.biome === "volcanic" && Math.random() < 0.35) {
      this.spawnParticles(
        this.state.camera.x + (Math.random() - 0.5) * this.canvasWidth,
        this.state.camera.y + (Math.random() - 0.5) * this.canvasHeight,
        Math.random() < 0.6 ? "#f97316" : (Math.random() < 0.5 ? "#fbbf24" : "#ea580c"),
        1,
        { type: "ember", shape: "circle", gravity: -0.06, size: Math.random() * 2.5 + 1, life: 60 }
      );
    } else if (this.state.biome === "ice" && Math.random() < 0.35) {
      this.spawnParticles(
        this.state.camera.x + (Math.random() - 0.5) * this.canvasWidth,
        this.state.camera.y - (this.canvasHeight / 2) / this.state.camera.zoom + Math.random() * 30,
        Math.random() < 0.7 ? "#bae6fd" : "#ffffff",
        1,
        { type: "crystal", shape: "star", gravity: 0.04, vx: Math.sin(Date.now() * 0.001) * 0.4, size: Math.random() * 2 + 1, life: 80 }
      );
    } else if (this.state.biome === "moss" && Math.random() < 0.30) {
      this.spawnParticles(
        this.state.camera.x + (Math.random() - 0.5) * this.canvasWidth,
        this.state.camera.y + (Math.random() - 0.5) * this.canvasHeight,
        Math.random() < 0.6 ? "#4ade80" : "#fde047",
        1,
        { type: "glow", shape: "circle", gravity: -0.02, vx: Math.sin(Date.now() * 0.002) * 0.4, size: 2, life: 75 }
      );
    }

    if (!isStunned && (!p.onLadder || (p.onLadder && justPressedJump))) {
      // Jump
      const isJumpHeld = keys["w"] || keys["ArrowUp"] || keys[" "];

      if (justPressedJump) {
        const scaledJump = JUMP_POWER * effectiveJumpMulti;
        if (p.isGrounded || (p.onLadder && p.vy > scaledJump + 2)) {
          p.vy = scaledJump;
          p.isGrounded = false;
          isClimbing = false;
          this.spawnDustPuff(p.x + p.w / 2, p.y + p.h, 7);
        } else if (inWater || inLava) {
          const isFireImmune = (p.fireImmunityTimer || 0) > 0;
          p.vy = scaledJump * (inLava ? (isFireImmune ? 0.75 : 0.55) : 0.8); // heavier swim jump from lava
          isClimbing = false;
          this.spawnWaterSplash(p.x + p.w / 2, p.y + 4, inLava);
        } else if (p.wallSliding && p.wallJumpsLeft > 0) {
          p.wallJumpsLeft--;
          p.vy = scaledJump * 1.225; // +50% height (sqrt(1.5))
          p.vx = p.wallSlideDir * 10; // Fixed x-velocity instead of speed multi
          p.wallSliding = false;
          isClimbing = false;
          p.facingRight = p.wallSlideDir > 0;
          this.spawnParticles(
            p.x + (p.wallSlideDir > 0 ? 0 : p.w),
            p.y + p.h / 2,
            "#cbd5e1",
            8,
            { shape: "streak", gravity: 0.2 },
          );
        }
      }

      if ((inWater || inLava) && isJumpHeld) {
        const scaledJump = JUMP_POWER * effectiveJumpMulti;
        p.vy -= 0.5; // Swim up
        if (p.vy < scaledJump * 0.7) p.vy = scaledJump * 0.7;
        isClimbing = false;
      }
    }

    // Attack
    if (p.attackCooldown > 0) p.attackCooldown--;
    if (p.attackTimer <= 0) {
      if (p.comboResetTimer > 0) p.comboResetTimer--;
      else p.slashFlipped = false;
    }

    if ((p.airAttackCooldown || 0) > 0) p.airAttackCooldown--;

    // Hotbar: Press 1, 2, or 3 to switch slots / hold the item
    if (keys["1"] && !prevKeys["1"]) {
      p.activeSlot = 0;
      p.weaponEquipped = true;
      p.weapon = p.hotbar[0] || undefined;
    } else if (keys["2"] && !prevKeys["2"]) {
      p.activeSlot = 1;
      p.weaponEquipped = true;
      p.weapon = p.hotbar[1] || undefined;
    } else if (keys["3"] && !prevKeys["3"]) {
      p.activeSlot = 2;
      p.weaponEquipped = true;
      p.weapon = p.hotbar[2] || undefined;
    }

    // Consumable & Active Non-weapon items usage
    if (p.itemUseCooldown && p.itemUseCooldown > 0) p.itemUseCooldown--;
    const currentActiveItem = p.hotbar[p.activeSlot];
    if (
      this.state.mouse.clicked &&
      (p.itemUseCooldown || 0) <= 0 &&
      currentActiveItem &&
      !isWeapon(currentActiveItem) &&
      this.state.floorTitleState === "none" &&
      this.state.transitionState === "none"
    ) {
      if (currentActiveItem === 'health_potion') {
        p.hotbar[p.activeSlot] = null;
        const healAmt = 20;
        p.health = Math.min(p.maxHealth, p.health + healAmt);
        p.itemUseCooldown = 20;
        this.state.texts.push({
          x: p.x + p.w / 2,
          y: p.y - 15,
          text: `+${healAmt} HP!`,
          life: 60,
          maxLife: 60
        });
        this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, "#4ade80", 20);
      } else if (currentActiveItem === 'speed_potion') {
        p.hotbar[p.activeSlot] = null;
        p.speedPotionTimer = 450; // 7.5 seconds
        p.itemUseCooldown = 20;
        this.state.texts.push({
          x: p.x + p.w / 2,
          y: p.y - 15,
          text: "SWIFTNESS!",
          life: 60,
          maxLife: 60
        });
        this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, "#38bdf8", 20);
      } else if (currentActiveItem === 'lava_flask') {
        p.hotbar[p.activeSlot] = null;
        p.fireImmunityTimer = 900; // 15 seconds Fire & Lava Immunity
        p.burnTimer = 0;
        p.health = Math.min(p.maxHealth, p.health + 10);
        p.itemUseCooldown = 20;
        this.state.texts.push({
          x: p.x + p.w / 2,
          y: p.y - 15,
          text: "FIRE IMMUNITY (15s)!",
          life: 80,
          maxLife: 80
        });
        this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, "#f97316", 20);
        this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, "#38bdf8", 15);
      } else if (currentActiveItem === 'magma_orb') {
        p.hotbar[p.activeSlot] = null;
        p.itemUseCooldown = 25;
        const angle = Math.atan2(this.state.mouse.worldY - (p.y + p.h / 2), this.state.mouse.worldX - (p.x + p.w / 2));
        const speed = 11;
        this.state.projectiles.push({
          id: `magma_orb_${Date.now()}_${Math.random()}`,
          x: p.x + p.w / 2 - 8,
          y: p.y + p.h / 2 - 8,
          w: 16,
          h: 16,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          type: 'magma',
          damage: 45,
          facingRight: Math.cos(angle) >= 0,
          timer: 120
        });
        this.state.texts.push({
          x: p.x + p.w / 2,
          y: p.y - 15,
          text: "MAGMA ORB!",
          life: 50,
          maxLife: 50
        });
      } else if (currentActiveItem === 'bomb') {
        p.hotbar[p.activeSlot] = null;
        p.itemUseCooldown = 25;
        const angle = Math.atan2(this.state.mouse.worldY - (p.y + p.h / 2), this.state.mouse.worldX - (p.x + p.w / 2));
        const speed = 10;
        this.state.projectiles.push({
          id: `bomb_${Date.now()}_${Math.random()}`,
          x: p.x + p.w / 2 - 6,
          y: p.y + p.h / 2 - 6,
          w: 12,
          h: 12,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          type: 'bomb',
          damage: 50,
          facingRight: Math.cos(angle) >= 0,
          timer: 90
        });
      }
    }

    // Super ability activation: Malevolence (Claws) on Q
    if (p.hasMalevolence && (keys["q"] || keys["Q"]) && !(prevKeys["q"] || prevKeys["Q"])) {
      if (p.malevolenceCooldown <= 0 && !p.malevolenceActive) {
        p.malevolenceActive = true;
        p.malevolenceTimer = 900; // 15s
        p.clawsActive = true;
      }
    }

    // Super ability activation: Impenetrable (Shield) on Z
    if (p.hasImpenetrable && (keys["z"] || keys["Z"]) && !(prevKeys["z"] || prevKeys["Z"])) {
      if (p.impenetrableCooldown <= 0 && !p.impenetrableActive) {
        p.impenetrableActive = true;
        p.impenetrableTimer = 1200; // 20s
        p.shieldActive = true;
        p.shieldTimer = 1200;
      }
    }

    // Super ability activation: Supersonic (Time Slow) on X or E
    if (p.hasSupersonic && (keys["x"] || keys["X"] || keys["e"] || keys["E"]) && !(prevKeys["x"] || prevKeys["X"] || prevKeys["e"] || prevKeys["E"])) {
      if (p.supersonicCooldown <= 0 && !p.supersonicActive) {
        p.supersonicActive = true;
        p.supersonicTimer = 600; // 10s
        p.timeSlowActive = true;
        this.state.timeScale = 0.20; // Slow everything except player to 0.2x speed
      }
    }

    // Super ability activation: Pulsar (Shockwave) on C
    if (p.hasPulsar && (keys["c"] || keys["C"]) && !(prevKeys["c"] || prevKeys["C"])) {
      if (p.pulsarCooldown <= 0 && !p.pulsarActive) {
        p.pulsarActive = true;
        p.pulsarTimer = 30;
        p.pulsarCooldown = 3600; // 60s CD
        this.state.shakeTimer = 25;

        // 7 blocks left & right (224px), 3 blocks up & down (96px)
        const rangeX = 224;
        const rangeY = 96;
        const px = p.x + p.w / 2;
        const py = p.y + p.h / 2;
        const dmg = Math.round(40 * p.damageMulti);

        // Wave FX particles
        for (let i = 0; i < 40; i++) {
          const angle = (i / 40) * Math.PI * 2;
          const speed = 4 + Math.random() * 6;
          this.state.particles.push({
            x: px,
            y: py,
            vx: Math.cos(angle) * speed * 2.0,
            vy: Math.sin(angle) * speed * 0.8,
            life: 25,
            maxLife: 25,
            color: i % 2 === 0 ? "#38bdf8" : "#c084fc",
            size: 4 + Math.random() * 4
          });
        }

        // Damage and knock enemies 7 blocks (224px)
        for (const enemy of this.state.enemies) {
          const ex = enemy.x + enemy.w / 2;
          const ey = enemy.y + enemy.h / 2;
          if (Math.abs(ex - px) <= rangeX && Math.abs(ey - py) <= rangeY) {
            enemy.health -= dmg;
            enemy.invulnerableTimer = 15;
            const dir = ex >= px ? 1 : -1;
            enemy.vx = dir * 14;
            enemy.vy = -6;

            this.state.texts.push({
              x: ex,
              y: ey - 10,
              text: `-${dmg} [PULSAR]`,
              life: 45,
              maxLife: 45
            });
          }
        }
      }
    }

    // Super ability activation: Cosmic Supernova on V
    if (p.hasSupernova && (keys["v"] || keys["V"]) && !(prevKeys["v"] || prevKeys["V"])) {
      if (p.supernovaCooldown <= 0 && !p.supernovaActive && !this.state.supernovaStar) {
        p.supernovaActive = true;
        p.supernovaTimer = 600;
        p.supernovaCooldown = 5400; // 90s CD
        this.state.shakeTimer = 10;

        const targetX = this.state.mouse.worldX;
        const targetY = this.state.mouse.worldY;
        this.state.supernovaStar = {
          x: p.x + p.w / 2,
          y: p.y + p.h / 2,
          targetX,
          targetY,
          state: 'traveling',
          timer: 0
        };
      }
    }

    // Super ability timer ticks
    if (p.malevolenceActive) {
      p.malevolenceTimer--;
      if (p.malevolenceTimer <= 0) {
        p.malevolenceActive = false;
        p.clawsActive = false;
        p.malevolenceCooldown = 6000; // 100s CD
      }
    } else if (p.malevolenceCooldown > 0) {
      p.malevolenceCooldown--;
    }

    if (p.impenetrableActive) {
      p.impenetrableTimer--;
      if (p.impenetrableTimer <= 0) {
        p.impenetrableActive = false;
        p.shieldActive = false;
        p.shieldTimer = 0;
        p.impenetrableCooldown = 6600; // 110s CD
      }
    } else if (p.impenetrableCooldown > 0) {
      p.impenetrableCooldown--;
    }

    if (p.pulsarActive) {
      p.pulsarTimer--;
      if (p.pulsarTimer <= 0) {
        p.pulsarActive = false;
      }
    } else if (p.pulsarCooldown > 0) {
      p.pulsarCooldown--;
    }

    if (p.supernovaActive) {
      p.supernovaTimer--;
      if (p.supernovaTimer <= 0) {
        p.supernovaActive = false;
      }
    } else if (p.supernovaCooldown > 0) {
      p.supernovaCooldown--;
    }

    if (p.supersonicActive) {
      p.supersonicTimer--;
      if (p.supersonicTimer <= 0) {
        p.supersonicActive = false;
        p.timeSlowActive = false;
        this.state.timeScale = 1.0;
        p.supersonicCooldown = 7500; // 125s CD
      }
    } else if (p.supersonicCooldown > 0) {
      p.supersonicCooldown--;
    }

    // Poison tick
    if (p.poisonTimer > 0) {
      p.poisonTimer--;
      if (p.poisonTimer % 30 === 0 && p.poisonTimer > 0) {
        p.health -= 1;
        if (p.health <= 0) {
          p.health = 0;
          this.state.isGameOver = true;
        }
      }
    }

    // Burn tick (3 HP per 0.5s) + burning particles
    if (p.burnTimer > 0) {
      p.burnTimer--;
      p.burnPulse++;
      // Burn particle effect (smoke/fire rising while on fire)
      if (Math.random() < 0.35) {
        this.state.particles.push({
          x: p.x + p.w / 2 + (Math.random() - 0.5) * p.w,
          y: p.y + Math.random() * p.h,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -(0.5 + Math.random() * 1.2),
          life: Math.random() * 40 + 30,
          maxLife: 70,
          color: Math.random() < 0.5 ? "#f97316" : "#fbbf24",
          size: Math.random() * 3 + 1.5,
        });
      }
      if (p.burnPulse % 30 === 0) {
        p.health -= 3;
        if (p.health <= 0) {
          p.health = 0;
          this.state.isGameOver = true;
        }
      }
    } else {
      p.burnPulse = 0;
    }

    if (p.slownessTimer > 0) p.slownessTimer--;
    if (p.redFlashTimer > 0) p.redFlashTimer--;

    // Mace charge tracking
    if (p.weapon === 'mace' && p.weaponEquipped && !p.clawsActive && this.state.floorTitleState === "none" && this.state.transitionState === "none") {
      if (this.state.mouse.down && p.attackTimer <= 0 && p.attackCooldown <= 0) {
        if (p.maceChargeTimer < 180) {
          p.maceChargeTimer++;
        }
        // Slowly slide forward
        p.vx = (p.facingRight ? 0.6 : -0.6) * effectiveSpeedMulti;
      } else if (p.maceChargeTimer > 0 && !this.state.mouse.down) {
        // Release Mace Smash!
        const ratio = Math.max(0.2, p.maceChargeTimer / 180);
        p.maceChargeRatio = ratio;
        p.isAttacking = true;
        p.isAirAttacking = false;
        p.attackTimer = 18; // Mace swing duration
        p.slashFlipped = !p.slashFlipped;
        p.attackAngle = Math.atan2(this.state.mouse.worldY - (p.y + p.h / 2), this.state.mouse.worldX - (p.x + p.w / 2));

        // Lunge and slight hop
        p.vx = (p.facingRight ? 1 : -1) * (4 + ratio * 10);
        p.vy = -2.5;

        this.checkAttackHits();
        p.maceChargeTimer = 0;
        p.attackCooldown = 25; // mace recovery CD
      }
    }

    // Battle Axe spin attack (Shift or R)
    if (p.weapon === 'battle_axe' && p.weaponEquipped && !p.clawsActive && this.state.floorTitleState === "none" && this.state.transitionState === "none") {
      const pressedSpin = (keys["r"] || keys["R"] || keys["Shift"]) && !(prevKeys["r"] || prevKeys["R"] || prevKeys["Shift"]);
      if (pressedSpin && p.axeSpinCooldown <= 0 && p.axeSpinTimer <= 0) {
        p.axeSpinTimer = 25; // 25 frames spin
        p.axeSpinCooldown = 300; // 5s CD

        // Lunge player toward mouse
        const px = p.x + p.w / 2;
        const py = p.y + p.h / 2;
        const dx = this.state.mouse.worldX - px;
        const dy = this.state.mouse.worldY - py;
        const angle = Math.atan2(dy, dx);

        p.vx = Math.cos(angle) * 12;
        p.vy = Math.sin(angle) * 12;
        
        // Spawn spin dust/spark particles
        this.spawnParticles(px, py, "#e2e8f0", 8);
        this.checkAttackHits();
      }
    }

    // Molten Axe Lava Wave ability (Shift or R)
    if (p.weapon === 'molten_axe' && p.weaponEquipped && !p.clawsActive && this.state.floorTitleState === "none" && this.state.transitionState === "none") {
      const pressedSpecial = (keys["r"] || keys["R"] || keys["Shift"]) && !(prevKeys["r"] || prevKeys["R"] || prevKeys["Shift"]);
      if (pressedSpecial && p.axeSpinCooldown <= 0) {
        p.axeSpinCooldown = 180; // 3s cooldown
        const dir = p.facingRight ? 1 : -1;
        this.state.projectiles.push({
          id: `lava_wave_${Date.now()}_${Math.random()}`,
          x: p.x + (p.facingRight ? p.w + 4 : -36),
          y: p.y + p.h - 24,
          w: 32,
          h: 24,
          vx: dir * 8.0,
          vy: 0,
          damage: 50,
          type: 'lava_wave',
          facingRight: p.facingRight,
          timer: 70
        });
        this.state.shakeTimer = Math.max(this.state.shakeTimer, 10);
        this.spawnParticles(p.x + p.w / 2, p.y + p.h, "#f97316", 15);
        this.state.texts.push({
          x: p.x + p.w / 2,
          y: p.y - 15,
          text: "LAVA WAVE!",
          life: 50,
          maxLife: 50
        });
      }
    }

    // Spin attack timer tick
    if (p.axeSpinTimer > 0) {
      p.axeSpinTimer--;
      this.checkAttackHits(); // deal continuous spin damage
    }
    if (p.axeSpinCooldown > 0) {
      p.axeSpinCooldown--;
    }

    // Floor 25 (Boss Floor): Remove screen shake & trigger Golem awakening cutscene near pedestal
    if (this.state.floor === this.state.maxFloor) {
      this.state.shakeTimer = 0; // Remove screen shake on boss floor

      if (!this.state.bossSpawned && p.y > 34 * TILE_SIZE) {
        this.state.bossSpawned = true;
        this.state.bossCutsceneTriggered = true;
        this.state.bossCutsceneTimer = 90;

        // Spawn Cavern Titan Boss during cutscene
        this.state.enemies.push({
          id: "boss",
          type: "boss",
          x: 18 * TILE_SIZE,
          y: 36 * TILE_SIZE,
          w: 80,
          h: 80,
          vx: 0,
          vy: 0,
          health: 500,
          maxHealth: 500,
          facingRight: false,
          isGrounded: true,
          invulnerableTimer: 0,
          onLadder: false,
          stateTimer: 0,
          aiState: "idle",
        });

        this.spawnParticles(20 * TILE_SIZE, 40 * TILE_SIZE, "#38bdf8", 30);
        this.state.texts.push({
          x: 20 * TILE_SIZE,
          y: 36 * TILE_SIZE,
          text: "CAVERN TITAN AWAKENS!",
          life: 90,
          maxLife: 90
        });
      }
    }

    // Cutscene timer tick
    if (this.state.bossCutsceneTimer && this.state.bossCutsceneTimer > 0) {
      this.state.bossCutsceneTimer--;
    }

    // Bow Charging System (Holding Left Click charges, releasing shoots!)
    if (p.weapon === 'bow' && p.weaponEquipped && !p.clawsActive && this.state.floorTitleState === "none" && this.state.transitionState === "none") {
      if (this.state.mouse.down && p.attackCooldown <= 0) {
        p.bowChargeTimer = Math.min(30, (p.bowChargeTimer || 0) + 1);
        if (p.bowChargeTimer % 5 === 0) {
          this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, "#f59e0b", 2);
        }
      } else if (!this.state.mouse.down && (p.bowChargeTimer || 0) > 0) {
        const ratio = Math.max(0.3, (p.bowChargeTimer || 0) / 30);
        this.fireArrow(ratio);
        p.bowChargeTimer = 0;
        p.isAttacking = true;
        p.attackTimer = 10;
        p.attackCooldown = 12;
      }
    }

    // Attack (only when valid weapon equipped or claws active - click/normal attack)
    const canAttackWithWeapon = p.clawsActive || (p.weaponEquipped && p.weapon && p.weapon !== 'torch');

    if (
      this.state.mouse.down &&
      p.attackTimer <= 0 &&
      p.attackCooldown <= 0 &&
      p.weapon !== 'mace' && // Mace uses charge release
      p.weapon !== 'bow' &&  // Bow uses charge release
      canAttackWithWeapon &&
      p.axeSpinTimer <= 0 && // Cannot attack while spinning
      this.state.floorTitleState === "none" &&
      this.state.transitionState === "none"
    ) {
      const isColossal = p.clawsActive ? false : p.weapon === 'colossal_sword';
      const isDaggers = p.clawsActive ? false : p.weapon === 'dual_daggers';
      const isAxe = p.clawsActive ? false : p.weapon === 'battle_axe';
      const isMoltenAxe = p.clawsActive ? false : p.weapon === 'molten_axe';
      const isFrozen = p.clawsActive ? false : p.weapon === 'frozen_sword';

      p.isAttacking = true;
      p.isAirAttacking = false;
      p.attackAngle = Math.atan2(this.state.mouse.worldY - (p.y + p.h / 2), this.state.mouse.worldX - (p.x + p.w / 2));

      if (p.clawsActive) {
        p.attackTimer = 4;
      } else {
        p.attackTimer = isColossal ? 20 : (isDaggers ? 6 : (isAxe ? 12 : (isMoltenAxe ? 14 : (isFrozen ? 10 : 10))));
      }
      p.slashFlipped = !p.slashFlipped;
      p.comboResetTimer = 120; // 2 seconds
      
      this.checkAttackHits();
    }

    if (p.attackTimer > 0) {
      p.attackTimer--;
      if (p.attackTimer === 0) {
        p.isAttacking = false;
        if (p.clawsActive) {
          p.attackCooldown = 3;
        } else {
          p.attackCooldown = p.weapon === 'colossal_sword' ? 50 : (p.weapon === 'dual_daggers' ? 5 : (p.weapon === 'battle_axe' ? 15 : (p.weapon === 'molten_axe' ? 16 : 12)));
        }
      }
    }

    // Afterimage ghost trail generation (ONLY during Supersonic Hyper Perception)
    if (!p.afterimages) p.afterimages = [];
    for (let i = p.afterimages.length - 1; i >= 0; i--) {
      p.afterimages[i].alpha -= 0.05;
      if (p.afterimages[i].alpha <= 0) {
        p.afterimages.splice(i, 1);
      }
    }

    const isMoving = Math.abs(p.vx) > 0.5 && p.isGrounded;
    if (p.supersonicActive && Math.abs(p.vx) > 0.5) {
      const lastImg = p.afterimages[p.afterimages.length - 1];
      const dist = lastImg ? Math.hypot(p.x - lastImg.x, p.y - lastImg.y) : 999;
      if (dist >= 16) {
        p.afterimages.push({
          x: p.x,
          y: p.y,
          facingRight: p.facingRight,
          alpha: 0.8,
          bob: isMoving ? Math.round(Math.sin(Date.now() / 50) * 2) : 0,
          weapon: p.weapon,
          weaponEquipped: p.weaponEquipped,
        });
        if (p.afterimages.length > 8) {
          p.afterimages.shift();
        }
      }
    }

    // physics
    p.vx *= inLava ? 0.75 : inWater ? 0.8 : FRICTION;
    if (!isClimbing) {
      if (inLava) {
        p.vy += GRAVITY * 0.25;
        if (p.vy > MAX_FALL_SPEED * 0.35) p.vy = MAX_FALL_SPEED * 0.35;
      } else if (inWater) {
        p.vy += GRAVITY * 0.4;
        if (p.vy > MAX_FALL_SPEED * 0.5) p.vy = MAX_FALL_SPEED * 0.5;
      } else if (p.wallSliding && p.vy > 0) {
        p.vy += GRAVITY * 0.4;
        if (p.vy > MAX_FALL_SPEED * 0.25) p.vy = MAX_FALL_SPEED * 0.25; // Wall slide slow fall
      } else {
        p.vy += GRAVITY;
        if (p.vy > MAX_FALL_SPEED) p.vy = MAX_FALL_SPEED;
      }
    }
    const currentSpeed = PLAYER_SPEED * effectiveSpeedMulti;
    if (Math.abs(p.vx) > currentSpeed) {
      if (p.isGrounded) p.vx = Math.sign(p.vx) * currentSpeed;
      else
        p.vx = Math.sign(p.vx) * Math.max(currentSpeed, Math.abs(p.vx) - 0.5); // Decay in air
    }

    // Track jump/fall apex while in the air to measure fall height
    if (!p.isGrounded && !p.onLadder && !inWater && !inLava) {
      if (p.fallPeakY === undefined || p.y < p.fallPeakY) {
        p.fallPeakY = p.y;
      }
    } else if (p.onLadder || inWater || inLava) {
      p.fallPeakY = undefined;
    }

    const oldVy = p.vy;
    const res = AABBMapCollision(
      p,
      p.vx,
      p.vy,
      this.state.map,
      this.state.width,
      this.state.height,
      isDropping,
    );
    let brokeIce = false;
    if (res.grounded && oldVy > 7) {
      const leftTile = Math.floor(res.x / TILE_SIZE);
      const rightTile = Math.floor((res.x + p.w) / TILE_SIZE);
      const ty = Math.floor((res.y + p.h + 2) / TILE_SIZE);

      for (let tx = leftTile; tx <= rightTile; tx++) {
        if (this.state.map[ty] && this.state.map[ty][tx] === 18) {
          this.state.map[ty][tx] = 6;
          brokeIce = true;
          this.spawnParticles(
            tx * TILE_SIZE + 8,
            ty * TILE_SIZE + 8,
            "rgba(150, 200, 255, 0.8)",
            10,
          );
        }
      }
    }

    let isHighFall = false;
    if (res.grounded && !brokeIce) {
      if (p.fallPeakY !== undefined) {
        const fallDistance = p.y - p.fallPeakY;
        const fallBlocks = fallDistance / TILE_SIZE;
        if (fallBlocks >= 6) {
          isHighFall = true;
          p.landingSlowTimer = 14; // brief landing recovery (~0.23s)
        }
      }
      p.fallPeakY = undefined;
    }

    p.x = res.x;
    p.y = res.y;
    p.vx = isHighFall ? res.vx * 0.25 : res.vx; // Speed falloff: jumping from heights over 6 blocks decreases velocity on landing
    p.vy = brokeIce ? oldVy * 0.5 : res.vy;
    p.isGrounded = brokeIce
      ? false
      : res.grounded || (p.onLadder && isClimbing && p.vy === 0);

    // Landing Impact Dust & Shockwave
    if (!brokeIce && res.grounded && (oldVy > 3.5 || isHighFall)) {
      this.spawnDustPuff(p.x + p.w / 2, p.y + p.h, oldVy > 7 || isHighFall ? 8 : 4);
      if (oldVy > 7 || isHighFall) {
        this.state.shakeTimer = Math.max(this.state.shakeTimer, isHighFall ? 4 : 3);
        this.state.particles.push({
          x: p.x + p.w / 2,
          y: p.y + p.h,
          vx: 0,
          vy: 0,
          life: 8,
          maxLife: 8,
          color: "#94a3b8",
          size: 3,
          shape: "ring",
          grow: 2.5,
        });
      }
    }

    // Running Dust at feet
    if (p.isGrounded && Math.abs(p.vx) > 1.8 && this.state.frameCounter % 6 === 0) {
      this.spawnDustPuff(p.x + (p.facingRight ? 2 : p.w - 2), p.y + p.h, 1);
    }

    // Wall slide logic
    p.wallSliding = false;
    if (
      !p.isGrounded &&
      !p.onLadder &&
      p.vy > 0 &&
      (res.hitXLeft || res.hitXRight)
    ) {
      if (
        (res.hitXLeft && (keys["a"] || keys["ArrowLeft"])) ||
        (res.hitXRight && (keys["d"] || keys["ArrowRight"]))
      ) {
        p.wallSliding = true;
        p.wallSlideDir = res.hitXLeft ? 1 : -1; // If wall is on left, jump right (+1). If wall is on right, jump left (-1).
        if (this.state.frameCounter % 5 === 0) {
          this.spawnParticles(
            p.x + (p.wallSlideDir > 0 ? 0 : p.w),
            p.y + p.h / 2,
            "#94a3b8",
            2,
            { shape: "streak", gravity: 0.35 },
          );
        }
      }
    }

    if (p.isGrounded || p.onLadder || inWater) {
      p.wallJumpsLeft = 2;
    }

    if (p.invulnerableTimer > 0) p.invulnerableTimer--;

    // Check map boundaries
    if (p.y > this.state.height * TILE_SIZE || p.health <= 0) {
      this.state.isGameOver = true;
    }

    // Map interactions
    if (
      this.state.map[centerTy] &&
      this.state.map[centerTy][centerTx] !== undefined
    ) {
      let tile = this.state.map[centerTy][centerTx];
      // Ensure other tile interactions remain if needed
    }

    // Chest Interaction Check
    const justPressedInteract = keys["e"] || keys["E"];
    if (justPressedInteract) {
      let nearestChest = null;
      const playerTx = Math.floor((p.x + p.w / 2) / TILE_SIZE);
      const playerTy = Math.floor((p.y + p.h / 2) / TILE_SIZE);

      for (const chest of this.state.chests) {
        if (chest.isOpen) continue;
        const chestTx = Math.floor((chest.x + chest.w / 2) / TILE_SIZE);
        const chestTy = Math.floor((chest.y + chest.h / 2) / TILE_SIZE);
        const manhattanDist = Math.abs(playerTx - chestTx) + Math.abs(playerTy - chestTy);
        if (manhattanDist <= 2) {
          nearestChest = chest;
          break;
        }
      }

      if (nearestChest) {
        nearestChest.isOpen = true;
        
        // Drop the weapon at the chest's location
        this.state.droppedWeapons.push({
          id: `dropped_weapon_${this.state.floor}_${Date.now()}_${Math.random()}`,
          x: nearestChest.x,
          y: nearestChest.y,
          w: 24,
          h: 24,
          type: nearestChest.weapon
        });

        // Consume the key press so it doesn't trigger repeatedly or interfere
        keys["e"] = false;
        keys["E"] = false;
        if (this.state.keys) {
          this.state.keys["e"] = false;
          this.state.keys["E"] = false;
        }

        // Spawn pop up text
        this.state.texts.push({
          x: nearestChest.x + nearestChest.w / 2,
          y: nearestChest.y - 15,
          text: "Loot Dropped!",
          life: 80,
          maxLife: 80
        });

        // Spawn gold celebrating particles
        for (let i = 0; i < 25; i++) {
          this.state.particles.push({
            x: nearestChest.x + nearestChest.w / 2,
            y: nearestChest.y + nearestChest.h / 2,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6 - 3,
            life: 40 + Math.floor(Math.random() * 20),
            maxLife: 60,
            color: `hsl(${45 + Math.random() * 15}, 100%, ${50 + Math.random() * 20}%)`,
            size: 3
          });
        }
      }
    }

    // Pick up / Swap Dropped Weapon Check (Press F)
    const justPressedSwap = keys["f"] || keys["F"];
    let nearestDropped = null;
    let minDropDist = 32; // interact range in pixels

    for (const dw of this.state.droppedWeapons) {
      const px = p.x + p.w / 2;
      const py = p.y + p.h / 2;
      const wx = dw.x + dw.w / 2;
      const wy = dw.y + dw.h / 2;
      const dist = Math.hypot(px - wx, py - wy);
      if (dist < minDropDist) {
        minDropDist = dist;
        nearestDropped = dw;
      }
    }

      if (nearestDropped && justPressedSwap) {
        const pickedType = nearestDropped.type;

        if (isWeapon(pickedType)) {
          // Player can ONLY have 1 weapon at a time
          const existingWeaponIndex = p.hotbar.findIndex(slot => isWeapon(slot));
          if (existingWeaponIndex !== -1) {
            // Already has a weapon: replace existing weapon slot!
            const oldWeapon = p.hotbar[existingWeaponIndex] as WeaponType;
            p.hotbar[existingWeaponIndex] = pickedType;
            nearestDropped.type = oldWeapon;
            p.activeSlot = existingWeaponIndex;
          } else {
            // Player currently has NO weapon in hotbar
            if (p.hotbar[p.activeSlot] === null) {
              p.hotbar[p.activeSlot] = pickedType;
              const index = this.state.droppedWeapons.indexOf(nearestDropped);
              if (index !== -1) this.state.droppedWeapons.splice(index, 1);
            } else {
              const emptyIdx = p.hotbar.indexOf(null);
              if (emptyIdx !== -1) {
                p.hotbar[emptyIdx] = pickedType;
                p.activeSlot = emptyIdx;
                const index = this.state.droppedWeapons.indexOf(nearestDropped);
                if (index !== -1) this.state.droppedWeapons.splice(index, 1);
              } else {
                const oldItem = p.hotbar[p.activeSlot] as WeaponType;
                p.hotbar[p.activeSlot] = pickedType;
                nearestDropped.type = oldItem;
              }
            }
          }
        } else {
          // Non-weapon item (potion, bomb, shield, torch)
          if (p.hotbar[p.activeSlot] === null) {
            p.hotbar[p.activeSlot] = pickedType;
            const index = this.state.droppedWeapons.indexOf(nearestDropped);
            if (index !== -1) this.state.droppedWeapons.splice(index, 1);
          } else {
            const emptyIdx = p.hotbar.indexOf(null);
            if (emptyIdx !== -1) {
              p.hotbar[emptyIdx] = pickedType;
              const index = this.state.droppedWeapons.indexOf(nearestDropped);
              if (index !== -1) this.state.droppedWeapons.splice(index, 1);
            } else {
              const oldItem = p.hotbar[p.activeSlot] as WeaponType;
              p.hotbar[p.activeSlot] = pickedType;
              nearestDropped.type = oldItem;
            }
          }
        }

        p.weapon = p.hotbar[p.activeSlot] || undefined;
        p.weaponEquipped = true;

        // Consume key
        keys["f"] = false;
        keys["F"] = false;
        if (this.state.keys) {
          this.state.keys["f"] = false;
          this.state.keys["F"] = false;
        }

        // Spawn pop up text
        const itemNames: Record<string, string> = {
          'sword': 'Sword',
          'bow': 'Bow',
          'colossal_sword': 'Colossal Sword',
          'dual_daggers': 'Dual Daggers',
          'mace': 'Mace',
          'battle_axe': 'Battle Axe',
          'molten_axe': 'Molten Axe',
          'frozen_sword': 'Frozen Sword',
          'lava_flask': 'Obsidian Draught',
          'magma_orb': 'Magma Orb',
          'torch': 'Torch',
          'health_potion': 'Health Potion',
          'speed_potion': 'Swiftness Potion',
          'bomb': 'Explosive Bomb',
          'shield': 'Iron Shield'
        };
        const itemName = itemNames[p.weapon || ''] || p.weapon || 'Nothing';
        this.state.texts.push({
          x: p.x + p.w / 2,
          y: p.y - 15,
          text: `Equipped ${itemName}!`,
          life: 80,
          maxLife: 80
        });
      }

    // Boss Cutscene Proximity Check on Floor 25
    if (this.state.floor === this.state.maxFloor) {
      const distToDiamond = Math.hypot(
        p.x - this.state.endPos.x * TILE_SIZE,
        p.y - this.state.endPos.y * TILE_SIZE
      );

      if (distToDiamond < 320 && !this.state.bossCutsceneTriggered) {
        this.state.bossCutsceneTriggered = true;
        this.state.bossCutsceneTimer = 90; // 1.5s intro cutscene
        this.state.shakeTimer = 30;
        const boss = this.state.enemies.find((e) => e.type === "boss");
        if (boss) {
          this.spawnParticles(boss.x + boss.w / 2, boss.y + boss.h / 2, "#f97316", 25);
          this.spawnParticles(boss.x + boss.w / 2, boss.y + boss.h / 2, "#ef4444", 25);
        }
      }

      if (this.state.bossCutsceneTimer && this.state.bossCutsceneTimer > 0) {
        this.state.bossCutsceneTimer--;
        p.vx = 0;
        p.vy = 0;
        // Top and bottom screen borders close in during cutscene
        this.state.letterboxHeight = Math.min(60, (90 - this.state.bossCutsceneTimer) * 2);
      } else if (this.state.bossCutsceneTriggered) {
        // Maintain cinematic letterbox borders during boss fight
        this.state.letterboxHeight = 35;
      }
    }

    // Exit Check
    if (centerTx === this.state.endPos.x && centerTy === this.state.endPos.y) {
      if (this.state.floor < this.state.maxFloor) {
        if (
          this.state.transitionState !== "out_to_cards" &&
          this.state.transitionState !== "out_to_cards_delay" &&
          this.state.transitionState !== "cards" &&
          !this.state.gateEntered
        ) {
          this.state.gateEntered = true;
          this.state.gateTimer = 0;
          this.state.frostTimer = 0; // remove any frost overlay immediately when descending
          p.vx = 0;
          p.vy = 0;
        }
      } else {
        // Check if boss exists
        if (!this.state.enemies.find((e) => e.type === "boss")) {
          this.state.player.hasDiamond = true;
          this.state.isWin = true;
        }
      }
    }
  }

  checkAttackHits() {
    const p = this.state.player;
    if (!p.clawsActive && (!p.weapon || p.weapon === 'torch' || p.weapon === 'bow')) return;

    // Spin attack: check hits in a circle around the player
    if (p.weapon === 'battle_axe' && p.axeSpinTimer > 0) {
      const px = p.x + p.w / 2;
      const py = p.y + p.h / 2;
      for (let e of this.state.enemies) {
        if (e.invulnerableTimer > 0) continue;
        const ex = e.x + e.w / 2;
        const ey = e.y + e.h / 2;
        if (Math.hypot(px - ex, py - ey) < 57) { // 2px radius extension
          const finalDamage = 45 * p.damageMulti;
          e.health -= finalDamage;
          e.invulnerableTimer = 10;
          const angle = Math.atan2(ey - py, ex - px);
          e.vx = Math.cos(angle) * 10;
          e.vy = Math.sin(angle) * 10 - 2;

          this.spawnHitImpact(ex, ey, "#fbbf24", true);
          this.spawnParticles(ex, ey, COLORS.blood, 10, { shape: "streak" });
          this.state.texts.push({
            x: e.x + e.w / 2,
            y: e.y - 12,
            text: Math.round(finalDamage).toString(),
            life: 35,
            maxLife: 35,
            color: "#fef08a",
            strokeColor: "#451a03",
            scale: 1.3,
            vy: -1.2,
            vx: (Math.random() - 0.5) * 1.5,
          });
        }
      }
      return;
    }

    let attackRect;
    let attackWidth = 65;
    let attackHeight = p.h + 40;
    let attackYOffset = -20;
    let damage = 15;
    let knockback = 5;

    if (p.clawsActive) {
      attackWidth = 90;
      attackHeight = p.h + 50;
      attackYOffset = -25;
      damage = 90;
      knockback = 9;
    } else if (p.weapon === 'colossal_sword') {
      attackWidth = 110;
      attackHeight = p.h + 70;
      attackYOffset = -35;
      damage = 45;
      knockback = 12;
    } else if (p.weapon === 'dual_daggers') {
      attackWidth = 55;
      attackHeight = p.h + 20;
      attackYOffset = -10;
      damage = 12;
      knockback = 3.0;
    } else if (p.weapon === 'mace') {
      attackWidth = 70;
      attackHeight = p.h + 50;
      attackYOffset = -25;
      damage = 25 * (1 + (p.maceChargeRatio || 0) * 2.5);
      knockback = 4 + (p.maceChargeRatio || 0) * 10;
    } else if (p.weapon === 'battle_axe') {
      attackWidth = 80;
      attackHeight = p.h + 30;
      attackYOffset = -15;
      damage = 35;
      knockback = 8;
    } else if (p.weapon === 'molten_axe') {
      attackWidth = 85;
      attackHeight = p.h + 40;
      attackYOffset = -20;
      damage = 45;
      knockback = 9;
    } else if (p.weapon === 'frozen_sword') {
      attackWidth = 70;
      attackHeight = p.h + 30;
      attackYOffset = -15;
      damage = 30;
      knockback = 6;
    }

    if (p.isAirAttacking) {
      const scaleHeight = p.clawsActive ? 3.0 : (p.weapon === 'colossal_sword' ? 4.5 : (p.weapon === 'dual_daggers' ? 1.5 : (p.weapon === 'molten_axe' ? 3.5 : 3.0)));
      attackRect = {
        x: p.x - 10 - 2, // 2px outside left
        y: p.y + p.h - 2, // 2px outside top
        w: p.w + 20 + 4, // 2px outside left & right (+4)
        h: TILE_SIZE * scaleHeight + 4, // 2px outside top & bottom (+4)
      };
    } else {
      attackRect = {
        x: (p.facingRight ? p.x + p.w : p.x - attackWidth) - 2, // 2px outside left
        y: p.y + attackYOffset - 2, // 2px outside top
        w: attackWidth + 4, // 2px outside left & right (+4)
        h: attackHeight + 4, // 2px outside top & bottom (+4)
      };
    }

    for (let e of this.state.enemies) {
      if (e.invulnerableTimer > 0) continue;
      if (rectIntersect(attackRect, e)) {
        // Hit!
        const finalDamage = damage * p.damageMulti;
        const isCrit = finalDamage >= 35 || p.clawsActive;
        e.health -= finalDamage;
        e.invulnerableTimer = p.clawsActive ? 8 : (p.weapon === 'dual_daggers' ? 6 : 10);
        e.vx = p.facingRight ? knockback : -knockback;
        e.vy = p.clawsActive ? -4 : (p.weapon === 'colossal_sword' ? -5 : (p.weapon === 'molten_axe' ? -4.5 : -3));
        
        if (p.weapon === 'molten_axe') {
          e.burnTimer = 180; // 3 seconds burning
          this.spawnParticles(e.x + e.w / 2, e.y + e.h / 2, "#f97316", 14, { shape: "circle", gravity: -0.06 });
        } else if (p.weapon === 'frozen_sword') {
          e.isFrozen = true;
          e.frozenTimer = 120; // 2 seconds frozen
          this.spawnParticles(e.x + e.w / 2, e.y + e.h / 2, "#38bdf8", 14, { shape: "star", gravity: 0.05 });
        }

        const pColor = p.clawsActive
          ? "#ff0000"
          : p.weapon === "molten_axe"
            ? "#f97316"
            : p.weapon === "frozen_sword"
              ? "#38bdf8"
              : e.type === "slime" ||
                  e.type === "frost_slime" ||
                  e.type === "moss_slime"
                ? COLORS.slime
                : COLORS.blood;

        this.spawnHitImpact(e.x + e.w / 2, e.y + e.h / 2, pColor, isCrit);
        this.spawnParticles(
          e.x + e.w / 2,
          e.y + e.h / 2,
          pColor,
          p.clawsActive ? 16 : p.weapon === "colossal_sword" ? 22 : p.weapon === "molten_axe" ? 18 : 12,
          { shape: "streak" }
        );
        
        this.state.texts.push({
          x: e.x + e.w / 2,
          y: e.y - 12,
          text: Math.round(finalDamage).toString() + (p.weapon === 'molten_axe' ? " 🔥" : (p.weapon === 'frozen_sword' ? " ❄" : "")),
          life: 36,
          maxLife: 36,
          color: p.weapon === 'molten_axe' ? "#f97316" : (p.weapon === 'frozen_sword' ? "#38bdf8" : (isCrit ? "#fef08a" : "#ffffff")),
          strokeColor: isCrit ? "#451a03" : "#090d16",
          scale: isCrit ? 1.35 : 1.0,
          vy: -1.2,
          vx: (Math.random() - 0.5) * 1.5,
        });
      }
    }
  }

  damagePlayer(amount: number, kbDir?: number, kbForceX: number = 8, kbForceY: number = -5, particleColor: string = COLORS.blood, bypassInvuln: boolean = false) {
    const p = this.state.player;
    if (p.invulnerableTimer > 0 && !bypassInvuln) return false;

    // Impenetrable shield check
    if (p.shieldActive) {
      p.shieldActive = false;
      p.shieldTimer = 0;
      p.superAbilityActive = false;
      p.superAbilityCooldown = 6600; // 110s cd
      
      this.state.texts.push({
        x: p.x + p.w / 2,
        y: p.y - 20,
        text: "SHIELD BLOCKED!",
        life: 60,
        maxLife: 60,
        color: "#38bdf8",
        strokeColor: "#082f49",
        scale: 1.3,
        vy: -1.0
      });
      
      // Spawn shield shatter particles & expanding shockwave ring
      this.spawnExplosionVFX(p.x + p.w / 2, p.y + p.h / 2, 28, false);
      return false;
    }

    // Malevolence claws: take 20% more damage
    let finalDamage = amount;
    if (p.clawsActive) {
      finalDamage = Math.round(finalDamage * 1.20);
    }
    // Iron Shield check: 40% damage reduction when active slot is holding shield
    if (p.hotbar[p.activeSlot] === 'shield') {
      finalDamage = Math.max(1, Math.round(finalDamage * 0.60));
    }

    p.health -= finalDamage;
    p.invulnerableTimer = 45; // 0.75s immunity time (45 frames at 60fps)

    if (kbDir !== undefined) {
      p.vx = kbDir * kbForceX;
      p.vy = kbForceY;
    }

    this.state.shakeTimer = Math.max(this.state.shakeTimer, 15);
    this.spawnHitImpact(p.x + p.w / 2, p.y + p.h / 2, "#ef4444", true);
    this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, particleColor, 15, { shape: "streak" });

    this.state.texts.push({
      x: p.x + p.w / 2,
      y: p.y - 18,
      text: `-${finalDamage} HP`,
      life: 45,
      maxLife: 45,
      color: "#ef4444",
      strokeColor: "#450a0a",
      scale: 1.3,
      vy: -1.2,
      vx: (Math.random() - 0.5) * 1.0,
    });

    if (p.health <= 0) {
      p.health = 0;
      this.state.isGameOver = true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("playerDied"));
      }
    }
    return true;
  }

  fireArrow(chargeRatio: number = 1.0) {
    const p = this.state.player;
    const arrowSpeed = 16 * (0.8 + 0.4 * chargeRatio); // Faster, smoother arrow velocity

    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    
    // Semi Aim Assist: Snap to enemy center if cursor is near (within 140px)
    let targetX = this.state.mouse.worldX;
    let targetY = this.state.mouse.worldY;
    let closestDist = 140;

    for (const e of this.state.enemies) {
      if (e.health <= 0) continue;
      const ex = e.x + e.w / 2;
      const ey = e.y + e.h / 2;
      const cursorDist = Math.hypot(this.state.mouse.worldX - ex, this.state.mouse.worldY - ey);
      if (cursorDist < closestDist) {
        closestDist = cursorDist;
        targetX = ex;
        targetY = ey;
      }
    }

    const dx = targetX - px;
    const dy = targetY - py;
    const angle = Math.atan2(dy, dx);

    const vx = Math.cos(angle) * arrowSpeed;
    const vy = Math.sin(angle) * arrowSpeed;

    const w = 20; // Bigger 20x8 arrow!
    const h = 8;

    const baseDmg = Math.round(35 * chargeRatio);

    this.state.projectiles.push({
      id: `arrow_${Date.now()}_${Math.random()}`,
      x: px - w / 2,
      y: py - h / 2,
      w,
      h,
      vx,
      vy,
      type: 'arrow',
      damage: baseDmg,
      facingRight: Math.cos(angle) >= 0
    });

    this.spawnParticles(px, py, "#f59e0b", 6);
  }

  updateProjectiles() {
    if (
      this.state.isPaused ||
      this.state.isGameOver ||
      this.state.isFloorComplete
    )
      return;

    const p = this.state.player;
    for (let i = this.state.projectiles.length - 1; i >= 0; i--) {
      const proj = this.state.projectiles[i];
      proj.x += proj.vx;
      proj.y += proj.vy;

      const tx = Math.floor((proj.x + proj.w / 2) / TILE_SIZE);
      const ty = Math.floor((proj.y + proj.h / 2) / TILE_SIZE);
      let hitWall = false;

      if (
        tx < 0 ||
        tx >= this.state.width ||
        ty < 0 ||
        ty >= this.state.height ||
        (this.state.map[ty] &&
          [1, 7, 8, 11, 15, 16, 17, 18, 19, 20].includes(this.state.map[ty][tx]))
      ) {
        hitWall = true;
      }

      if (proj.type === 'lava_wave') {
        proj.timer = (proj.timer || 70) - 1;
        // Spurt molten ground geysers and ember particles
        if (Math.random() < 0.8) {
          this.spawnParticles(proj.x + Math.random() * proj.w, proj.y + proj.h / 2, "#f97316", 2);
          this.spawnParticles(proj.x + Math.random() * proj.w, proj.y + proj.h / 2, "#fbbf24", 2);
        }

        if (hitWall || proj.timer <= 0) {
          this.spawnParticles(proj.x + proj.w / 2, proj.y + proj.h / 2, "#f97316", 15);
          this.state.projectiles.splice(i, 1);
          continue;
        }

        // Piercing hit on enemies
        for (const e of this.state.enemies) {
          if (e.invulnerableTimer > 0) continue;
          if (rectIntersect(proj, e)) {
            const finalDamage = proj.damage * p.damageMulti;
            e.health -= finalDamage;
            e.invulnerableTimer = 14;
            e.burnTimer = 240; // 4s burn
            e.vx = proj.vx > 0 ? 6 : -6;
            e.vy = -3;
            this.spawnParticles(e.x + e.w / 2, e.y + e.h / 2, "#f97316", 10);
            this.state.texts.push({
              x: e.x,
              y: e.y - 10,
              text: `${Math.round(finalDamage)} [LAVA WAVE]`,
              life: 35,
              maxLife: 35
            });
          }
        }
        continue; // Lava wave continues traveling
      }

      if (proj.type === 'bomb') {
        proj.vy += 0.25; // gravity
        proj.timer = (proj.timer || 90) - 1;
        this.spawnParticles(proj.x + proj.w / 2, proj.y + proj.h / 2, "#f59e0b", 1, { shape: "circle", gravity: -0.05, size: 2 });

        if (hitWall || proj.timer <= 0) {
          const bx = proj.x + proj.w / 2;
          const by = proj.y + proj.h / 2;
          this.state.shakeTimer = 22;
          this.spawnExplosionVFX(bx, by, 70, true);

          for (const e of this.state.enemies) {
            const dist = Math.hypot(e.x + e.w / 2 - bx, e.y + e.h / 2 - by);
            if (dist < 75) {
              const dmg = Math.round(proj.damage * p.damageMulti);
              e.health -= dmg;
              e.invulnerableTimer = 10;
              e.vx = (e.x + e.w / 2 > bx ? 1 : -1) * 7;
              e.vy = -4;
              this.spawnHitImpact(e.x + e.w / 2, e.y + e.h / 2, "#f97316", true);
              this.state.texts.push({
                x: e.x + e.w / 2,
                y: e.y - 12,
                text: `${dmg} 💥`,
                life: 38,
                maxLife: 38,
                color: "#fbbf24",
                strokeColor: "#451a03",
                scale: 1.4,
                vy: -1.3,
                vx: (Math.random() - 0.5) * 2.0,
              });
            }
          }
          this.state.projectiles.splice(i, 1);
          continue;
        }
      } else if (hitWall && proj.type !== 'magma') {
        this.spawnParticles(
          proj.x + (proj.w || 8) / 2,
          proj.y + (proj.h || 8) / 2,
          "#cbd5e1",
          6,
          { shape: "streak", gravity: 0.2 }
        );
        this.state.projectiles.splice(i, 1);
        continue;
      }

      if (proj.type === "magma") {
        if (!proj.ownerId) {
          // Player-thrown Magma Orb
          proj.vy += 0.22; // slight gravity arc
          proj.timer = (proj.timer || 120) - 1;
          this.spawnParticles(proj.x + proj.w / 2, proj.y + proj.h / 2, "#f97316", 1, { shape: "circle", gravity: -0.05, size: 2.5 });

          let triggered = hitWall || proj.timer <= 0;
          if (!triggered) {
            for (const e of this.state.enemies) {
              if (rectIntersect(proj, e)) {
                triggered = true;
                break;
              }
            }
          }

          if (triggered) {
            const mx = proj.x + proj.w / 2;
            const my = proj.y + proj.h / 2;
            this.state.shakeTimer = 18;
            this.spawnExplosionVFX(mx, my, 60, true);

            for (const e of this.state.enemies) {
              const dist = Math.hypot(e.x + e.w / 2 - mx, e.y + e.h / 2 - my);
              if (dist < 68) {
                const dmg = Math.round(proj.damage * p.damageMulti);
                e.health -= dmg;
                e.invulnerableTimer = 10;
                e.burnTimer = 300; // 5 seconds burn!
                e.vx = (e.x + e.w / 2 > mx ? 1 : -1) * 7;
                e.vy = -3;
                this.spawnHitImpact(e.x + e.w / 2, e.y + e.h / 2, "#f97316", true);
                this.state.texts.push({
                  x: e.x + e.w / 2,
                  y: e.y - 12,
                  text: `${dmg} 🔥`,
                  life: 40,
                  maxLife: 40,
                  color: "#f97316",
                  strokeColor: "#451a03",
                  scale: 1.35,
                  vy: -1.2,
                  vx: (Math.random() - 0.5) * 2.0,
                });
              }
            }
            this.state.projectiles.splice(i, 1);
            continue;
          }
        } else {
          // Enemy-fired magma fireball
          if (hitWall) {
            this.spawnParticles(proj.x + proj.w / 2, proj.y + proj.h / 2, "#f97316", 8, { shape: "circle", gravity: -0.05 });
            this.state.projectiles.splice(i, 1);
            continue;
          }

          if (proj.timer !== undefined) {
            proj.timer--;
            if (proj.timer <= 0) {
              this.state.projectiles.splice(i, 1);
              continue;
            }
          }
          this.state.particles.push({
            x: proj.x + proj.w / 2 - Math.sign(proj.vx) * 6,
            y: proj.y + proj.h / 2 + (Math.random() - 0.5) * 4,
            vx: (Math.random() - 0.5) * 0.4,
            vy: -(0.3 + Math.random() * 0.7),
            life: Math.random() * 20 + 15,
            maxLife: 35,
            color: Math.random() < 0.5 ? "#f97316" : "#fbbf24",
            size: 2 + Math.random() * 2,
            shape: "circle",
          });
          if (p.invulnerableTimer <= 0 && rectIntersect({ x: proj.x - 4, y: proj.y - 4, w: 8, h: 8 }, p)) {
            const hit = this.damagePlayer(proj.damage, Math.sign(proj.vx) || 1, 8, -4, "#f97316");
            if (hit && (!p.fireImmunityTimer || p.fireImmunityTimer <= 0)) {
              p.burnTimer = 60;
            }
            this.spawnHitImpact(proj.x, proj.y, "#f97316", false);
            this.state.projectiles.splice(i, 1);
            continue;
          }
        }
      }

      let hitEnemy = false;
      for (const e of this.state.enemies) {
        if (proj.ownerId && e.id === proj.ownerId) continue;
        if (e.invulnerableTimer > 0) continue;
        if (rectIntersect(proj, e)) {
          const finalDamage = proj.damage * p.damageMulti;
          const isCrit = finalDamage >= 30;
          e.health -= finalDamage;
          e.invulnerableTimer = 10;
          e.vx = proj.vx !== 0 ? Math.sign(proj.vx) * 3 : (p.facingRight ? 3 : -3);
          e.vy = -2;

          this.spawnHitImpact(e.x + e.w / 2, e.y + e.h / 2, isCrit ? "#fef08a" : "#cbd5e1", isCrit);
          this.spawnParticles(
            e.x + e.w / 2,
            e.y + e.h / 2,
            e.type === "slime" ? COLORS.slime : COLORS.blood,
            8,
            { shape: "streak" }
          );

          this.state.texts.push({
            x: e.x + e.w / 2,
            y: e.y - 12,
            text: Math.round(finalDamage).toString(),
            life: 35,
            maxLife: 35,
            color: isCrit ? "#fef08a" : "#ffffff",
            strokeColor: isCrit ? "#451a03" : "#090d16",
            scale: isCrit ? 1.3 : 1.0,
            vy: -1.2,
            vx: (Math.random() - 0.5) * 1.5,
          });

          hitEnemy = true;
          break;
        }
      }

      if (hitEnemy) {
        this.state.projectiles.splice(i, 1);
      }
    }
  }

  generateUpgrades() {
    const normalPool = [
      {
        title: "Fighter",
        desc: "+20% Damage",
        isSuper: false,
        cost: 25,
        effect: (p: any) => {
          p.damageMulti += 0.20;
        }
      },
      {
        title: "Glass Cannon",
        desc: "-35% Max HP\n+50% Damage",
        isSuper: false,
        cost: 25,
        effect: (p: any) => {
          p.maxHealth = Math.max(10, Math.round(p.maxHealth * 0.65));
          if (p.health > p.maxHealth) p.health = p.maxHealth;
          p.damageMulti += 0.50;
        }
      },
      {
        title: "Workout",
        desc: "+10% Damage\n+10% HP\n+5% Speed",
        isSuper: false,
        cost: 25,
        effect: (p: any) => {
          p.damageMulti += 0.10;
          p.maxHealth = Math.round(p.maxHealth * 1.10);
          p.health += Math.round(p.baseMaxHealth * 0.10);
          p.speedMulti += 0.05;
        }
      },
      {
        title: "Bones of Steel",
        desc: "+25% HP",
        isSuper: false,
        cost: 25,
        effect: (p: any) => {
          p.maxHealth = Math.round(p.maxHealth * 1.25);
          p.health += Math.round(p.baseMaxHealth * 0.25);
        }
      },
      {
        title: "Heavy",
        desc: "+30% HP\n-5% Speed",
        isSuper: false,
        cost: 25,
        effect: (p: any) => {
          p.maxHealth = Math.round(p.maxHealth * 1.30);
          p.health += Math.round(p.baseMaxHealth * 0.30);
          p.speedMulti -= 0.05;
        }
      },
      {
        title: "Runner",
        desc: "+35% Speed",
        isSuper: false,
        cost: 25,
        effect: (p: any) => {
          p.speedMulti += 0.35;
        }
      },
      {
        title: "Sprinter",
        desc: "+55% Speed\n-15% Jump Height\n-15% Max HP",
        isSuper: false,
        cost: 25,
        effect: (p: any) => {
          p.speedMulti += 0.55;
          p.jumpMulti -= 0.15;
          p.maxHealth = Math.max(10, Math.round(p.maxHealth * 0.85));
          if (p.health > p.maxHealth) p.health = p.maxHealth;
        }
      },
      {
        title: "Spring Heels",
        desc: "+20% Jump Height",
        isSuper: false,
        cost: 25,
        effect: (p: any) => {
          p.jumpMulti += 0.20;
        }
      },
      {
        title: "Jumper",
        desc: "+10% Speed\n+10% Jump Height",
        isSuper: false,
        cost: 25,
        effect: (p: any) => {
          p.speedMulti += 0.10;
          p.jumpMulti += 0.10;
        }
      }
    ];

    const superPool = [
      {
        title: "MALEVOLENCE",
        desc: "+120% Damage\n+35% Speed\n+15% HP\n\nRip and Tear Claws\nability on Q (CD 100s)",
        isSuper: true,
        abilityId: 'malevolence' as const,
        cost: 100,
        effect: (p: any) => {
          p.hasMalevolence = true;
          p.damageMulti += 1.20;
          p.speedMulti += 0.35;
          p.maxHealth = Math.round(p.maxHealth * 1.15);
          p.health += Math.round(p.baseMaxHealth * 0.15);
        }
      },
      {
        title: "IMPENETRABLE",
        desc: "+110% HP\n-5% Speed\n-25% Jump Height\n\nShield of Solidity\nability on Z (CD 110s)",
        isSuper: true,
        abilityId: 'impenetrable' as const,
        cost: 100,
        effect: (p: any) => {
          p.hasImpenetrable = true;
          p.maxHealth = Math.round(p.maxHealth * 2.10);
          p.health += Math.round(p.baseMaxHealth * 1.10);
          p.speedMulti -= 0.05;
          p.jumpMulti -= 0.25;
        }
      },
      {
        title: "SUPERSONIC",
        desc: "+140% Speed\n+35% Jump Height\n\nHyper Perception\nability on X (CD 125s)",
        isSuper: true,
        abilityId: 'supersonic' as const,
        cost: 100,
        effect: (p: any) => {
          p.hasSupersonic = true;
          p.speedMulti += 1.40;
          p.jumpMulti += 0.35;
        }
      },
      {
        title: "PULSAR",
        desc: "+50% Damage\n+30% Speed\n+15% HP\n\nShockwave Wave\nability on C (CD 60s)",
        isSuper: true,
        abilityId: 'pulsar' as const,
        cost: 100,
        effect: (p: any) => {
          p.hasPulsar = true;
          p.damageMulti += 0.50;
          p.speedMulti += 0.30;
          p.maxHealth = Math.round(p.maxHealth * 1.15);
          p.health += Math.round(p.baseMaxHealth * 0.15);
        }
      }
    ];

    const ultimateCard = {
      title: "COSMIC SUPERNOVA",
      desc: "+270% Damage\n+75% Speed\n+25% Jump Height\n+120% HP\n\nSupernova Starburst\nability on V (CD 90s)",
      isSuper: true,
      isUltimate: true,
      abilityId: 'supernova' as const,
      cost: 250,
      effect: (p: any) => {
        p.hasSupernova = true;
        p.damageMulti += 2.70;
        p.speedMulti += 0.75;
        p.jumpMulti += 0.25;
        p.maxHealth = Math.round(p.maxHealth * 2.20);
        p.health += Math.round(p.baseMaxHealth * 1.20);
      }
    };

    // Shuffle pools
    normalPool.sort(() => Math.random() - 0.5);
    superPool.sort(() => Math.random() - 0.5);

    const resultUpgrades: any[] = [];
    for (let i = 0; i < 3; i++) {
      const r = Math.random();
      if (r < 0.005) {
        // 0.5% Ultimate Cosmic Supernova
        resultUpgrades.push({
          id: `upgrade_${i}`,
          title: ultimateCard.title,
          desc: ultimateCard.desc,
          isSuper: true,
          isUltimate: true,
          abilityId: ultimateCard.abilityId,
          cost: 250,
          effect: ultimateCard.effect
        });
      } else if (r < 0.06 && superPool.length > 0) {
        // 5.5% Super Card
        const superUpgrade = superPool[i % superPool.length];
        resultUpgrades.push({
          id: `upgrade_${i}`,
          title: superUpgrade.title,
          desc: superUpgrade.desc,
          isSuper: true,
          abilityId: superUpgrade.abilityId,
          cost: 100,
          effect: superUpgrade.effect
        });
      } else {
        // Standard Upgrade Card
        const normUpgrade = normalPool[i % normalPool.length];
        resultUpgrades.push({
          id: `upgrade_${i}`,
          title: normUpgrade.title,
          desc: normUpgrade.desc,
          isSuper: false,
          cost: 25,
          effect: normUpgrade.effect
        });
      }
    }

    this.state.upgrades = resultUpgrades;
  }

  updateEnemies() {
    const p = this.state.player;

    for (let i = this.state.enemies.length - 1; i >= 0; i--) {
      let e = this.state.enemies[i];

      if (e.health <= 0) {
        const coinsGained =
          e.type === "boss"
            ? 50
            : e.type === "inferno_knight" || e.type === "frost_knight"
              ? 25
              : e.type === "yeti"
                ? 15
                : e.type === "frost_slime"
                  ? 10
                  : e.type === "slime"
                    ? 8
                    : 5;
        this.state.player.coins += coinsGained;
        this.state.texts.push({
          x: e.x,
          y: e.y - 10,
          text: `+${coinsGained} COINS`,
          life: 60,
          maxLife: 60,
        });
        this.spawnParticles(e.x + e.w / 2, e.y + e.h / 2, COLORS.bg, 20);
        this.state.enemies.splice(i, 1);
        continue;
      }

      if (e.invulnerableTimer > 0) e.invulnerableTimer--;
      e.stateTimer--;

      if (e.burnTimer && e.burnTimer > 0) {
        e.burnTimer--;
        if (Math.random() < 0.3) {
          this.spawnParticles(e.x + Math.random() * e.w, e.y + Math.random() * e.h, "#f97316", 1);
        }
        if (e.burnTimer % 30 === 0) {
          e.health -= 3;
          this.state.texts.push({
            x: e.x + e.w / 2,
            y: e.y - 10,
            text: "-3 [BURN]",
            life: 30,
            maxLife: 30,
          });
        }
      }

      let distToPlayer = Math.hypot(p.x - e.x, p.y - e.y);

      if (
        e.type === "slime" ||
        e.type === "frost_slime" ||
        e.type === "moss_slime" ||
        e.type === "lava_slime"
      ) {
        e.vy += GRAVITY;
        if (e.isGrounded && e.stateTimer <= 0) {
          // If player in sight, target player; otherwise stroll left/right randomly
          const dir = distToPlayer < 850 ? (p.x > e.x ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);
          e.facingRight = dir > 0;
          e.vy =
            e.type === "frost_slime" ? -4 : e.type === "moss_slime" ? -4.5 : e.type === "lava_slime" ? -4.5 : -3.5;
          e.vx =
            dir *
            (e.type === "frost_slime" ? 6 : e.type === "moss_slime" ? 7.5 : e.type === "lava_slime" ? 6.5 : 4.5);
          e.stateTimer = 50 + Math.random() * 25;
        } else if (e.isGrounded) {
          e.vx *= 0.8;
        }
      } else if (e.type === "flytrap") {
        e.vx = 0;
        e.vy += GRAVITY;

        const dx = Math.abs(p.x - e.x);
        const dy = Math.abs(p.y - e.y);

        if (dx < TILE_SIZE * 4.5 && dy < TILE_SIZE * 4.5 && e.stateTimer <= 0) {
          let clear = true;
          const steps = 6;
          for (let s = 1; s <= steps; s++) {
            const testX = e.x + (p.x - e.x) * (s / steps);
            const testY = e.y + (p.y - e.y) * (s / steps);
            const tx = Math.floor(testX / TILE_SIZE);
            const ty = Math.floor(testY / TILE_SIZE);
            if (
              this.state.map[ty] &&
              this.state.map[ty][tx] !== 0 &&
              this.state.map[ty][tx] !== 13 &&
              this.state.map[ty][tx] !== 5
            ) {
              clear = false;
              break;
            }
          }

          if (clear) {
            if (e.aiState !== "tracking") {
              e.aiState = "tracking";
              e.trackTimer = 45; // 0.75 seconds tracking
            } else {
              e.trackTimer = (e.trackTimer || 45) - 1;
              if (e.trackTimer <= 0) {
                e.stateTimer = 90; // Cooldown
                e.aiState = "attacking";
                
                // Deal damage and poison if player is in range
                if (Math.hypot(p.x - e.x, p.y - e.y) < TILE_SIZE * 3.0) {
                  const kbDir = p.x + p.w / 2 > e.x + e.w / 2 ? 1 : -1;
                  const hit = this.damagePlayer(10, kbDir, 6, -3, "#2d8d2d");
                  if (hit) {
                    p.poisonTimer = 300; // 5s poison at 60fps
                  }
                }

                // Vine/bite particles
                for (let s = 0; s <= 5; s++) {
                  this.spawnParticles(
                    e.x + (p.x - e.x) * (s / 5),
                    e.y + (p.y - e.y) * (s / 5),
                    "#2d8d2d",
                    2
                  );
                }
              }
            }
          } else {
            e.aiState = "idle";
          }
        } else {
          if (e.stateTimer > 0) {
            if (e.stateTimer < 50) e.aiState = "idle";
          } else {
            e.aiState = "idle";
          }
        }
      } else if (e.type === "bat") {
        if (e.stateTimer <= 0) {
          e.stateTimer = 25 + Math.random() * 25;
          e.vx = (Math.random() - 0.5) * 4;
          e.vy = (Math.random() - 0.5) * 4;
          if (distToPlayer < 750) {
            e.vx += (p.x > e.x ? 1 : -1) * 2.5;
            e.vy += (p.y > e.y ? 1 : -1) * 2.5;
          }
        }
      } else if (e.type === "lava_monster") {
        // Strafe on lava surface, only turning at the edge
        e.vy += GRAVITY;
        const mDir = e.facingRight ? 1 : -1;
        e.vx = mDir * 2.05;
        if (e.turnTimer !== undefined && e.turnTimer > 0) e.turnTimer--;
        // Lava (21) is not solid, so bob on the lava surface (partially submerged)
        const surfTx = Math.floor((e.x + e.w / 2) / TILE_SIZE);
        const surfTy = Math.floor((e.y + e.h + 4) / TILE_SIZE);
        if (this.state.map[surfTy] && this.state.map[surfTy][surfTx] === 21) {
          e.vy = 0;
          e.y =
            surfTy * TILE_SIZE -
            e.h +
            8 +
            Math.sin(Date.now() * 0.06 + e.x * 0.05) * 2.5;
        }
        // Edge turn: only flip when actually at the edge, and only after the
        // cooldown so it strafes across the pool instead of jittering in place.
        const aheadX = e.x + (e.facingRight ? e.w + 4 : -4);
        const aheadTx = Math.floor(aheadX / TILE_SIZE);
        const aheadTy = Math.floor((e.y + e.h + 4) / TILE_SIZE);
        const edgeClear =
          !this.state.map[aheadTy] ||
          !this.state.map[aheadTy][aheadTx] ||
          this.state.map[aheadTy][aheadTx] !== 21;
        if (edgeClear && e.turnTimer <= 0) {
          e.facingRight = !e.facingRight;
          e.turnTimer = 20;
        }
        // Aim fireball at the player, 3.5 blocks/sec
        const mcx = e.x + e.w / 2;
        const mcy = e.y + e.h / 2;
        const pxc = p.x + p.w / 2;
        const pyc = p.y + p.h / 2;
        const dist = Math.hypot(pxc - mcx, pyc - mcy);
        if (
          dist < 6 * TILE_SIZE &&
          e.stateTimer <= 0 &&
          e.turnTimer <= 15
        ) {
          e.stateTimer = 60;
          const speed = (3.5 * TILE_SIZE) / 60; // 3.5 blocks/sec at 60fps
          this.state.projectiles.push({
            id: `magma_${Date.now()}_${Math.random()}`,
            x: mcx - 6,
            y: mcy - 6,
            w: 12,
            h: 12,
            vx: ((pxc - mcx) / dist) * speed,
            vy: ((pyc - mcy) / dist) * speed,
            damage: 10,
            type: "magma",
            facingRight: pxc >= mcx,
            timer: Math.ceil((8 * TILE_SIZE) / speed), // travels ~8 blocks then despawns
            ownerId: e.id,
          });
        }
        // Punch: windup 0.7s when close, then hit with 0.3s cd
        if (
          Math.abs(p.y + p.h / 2 - mcy) < 1.5 * TILE_SIZE &&
          Math.abs(p.x + p.w / 2 - mcx) < 1.2 * TILE_SIZE
        ) {
          if (e.aiState === "idle") {
            e.aiState = "winding_up";
            e.stateTimer = 42; // 0.7s windup
          } else if (e.aiState === "winding_up" && e.stateTimer <= 0) {
            e.aiState = "idle";
            if (p.invulnerableTimer <= 0) {
              this.damagePlayer(8, mDir, 9, -4, "#f97316");
            }
          }
        } else {
          e.aiState = "idle";
        }
      } else if (e.type === "lava_spider") {
        if (e.aiState === "hanging") {
          e.vx = 0;
          e.vy = 0;
          const dx = p.x + p.w / 2 - (e.x + e.w / 2);
          if (
            dx > -4 * TILE_SIZE &&
            dx < 4 * TILE_SIZE &&
            Math.abs(p.y - e.y) < 8 * TILE_SIZE
          ) {
            e.aiState = "stalking";
          }
        } else if (e.aiState === "stalking") {
          e.vy += GRAVITY * 0.2;
          const sDir = p.x + p.w / 2 > e.x + e.w / 2 ? 1 : -1;
          e.vx = sDir * 1.6;
          if (Math.abs(p.x + p.w / 2 - (e.x + e.w / 2)) < e.w) {
            e.aiState = "beeping";
            e.stateTimer = 24; // 3 fast beeps (8 frames each)
          }
        } else if (e.aiState === "beeping") {
          e.vx = 0;
          e.vy = 0;
          if (e.stateTimer % 8 === 0) {
            this.spawnParticles(e.x + e.w / 2, e.y + e.h / 2, "#fb923c", 10);
          }
          if (e.stateTimer <= 0) {
            e.aiState = "explode";
          }
        } else if (e.aiState === "explode") {
          if (p.invulnerableTimer <= 0) {
            this.damagePlayer(18, 0, 0, 0, "#f97316");
            p.burnTimer = 300; // 5s burn
            p.slownessTimer = 240; // 4s slow
            p.redFlashTimer = 40; // ~0.6s red vignette
            this.state.shakeTimer = Math.max(this.state.shakeTimer, 25);
          }
          this.state.enemies.splice(i, 1);
          continue;
        }
      } else if (e.type === "yeti") {
        e.vy += GRAVITY;
        if (e.isGrounded) {
          if (distToPlayer < 900) {
            e.facingRight = p.x > e.x;
            if (e.stateTimer <= 0) {
              const rand = Math.random();
              if (distToPlayer < 120 || rand < 0.40) {
                // Ground Smash Attack
                e.aiState = "smashing";
                e.stateTimer = 50;
                e.vx = (p.x > e.x ? 1 : -1) * 2;
              } else if (rand < 0.75) {
                // Pounce Leap Attack
                e.aiState = "leaping";
                e.stateTimer = 45;
                e.vy = -7.5;
                e.vx = (p.x > e.x ? 1 : -1) * 5;
              } else {
                // Heavy Chasing Walk
                e.aiState = "walking";
                e.stateTimer = 40;
                e.vx = (p.x > e.x ? 1 : -1) * 3;
              }
            }
          } else if (e.stateTimer <= 0) {
            // Stroll left or right randomly when player is not in sight
            e.aiState = "walking";
            const dir = Math.random() < 0.5 ? 1 : -1;
            e.facingRight = dir > 0;
            e.vx = dir * 2;
            e.stateTimer = 60 + Math.floor(Math.random() * 40);
          } else if (e.aiState === "smashing") {
            e.vx *= 0.5;
            // Slam ground shockwave on frame 25 (NO SHAKE, readable Ice Spike Shockwave VFX)
            if (e.stateTimer === 25) {
              const slamX = e.x + (e.facingRight ? e.w + 10 : -10);
              
              // Clear, highly readable Ice Spike Ground Wave VFX
              for (let i = -3; i <= 3; i++) {
                const spikeX = slamX + i * 14;
                const spikeH = 18 - Math.abs(i) * 3;
                this.spawnParticles(spikeX, e.y + e.h - 10, "#38bdf8", 4);
                this.spawnParticles(spikeX, e.y + e.h - 5, "#e0f2fe", 4);
                this.state.texts.push({
                  x: spikeX,
                  y: e.y + e.h - spikeH,
                  text: "▲",
                  life: 25,
                  maxLife: 25
                });
              }

              if (Math.hypot(p.x - slamX, p.y - (e.y + e.h)) < 75 && p.invulnerableTimer <= 0) {
                const kbDir = p.x > slamX ? 1 : -1;
                this.damagePlayer(12, kbDir, 12, -7, "#e2e8f0");
              }
            }
          } else {
            if (e.aiState === "walking") {
              e.vx = (e.facingRight ? 1 : -1) * 2.0;
            } else {
              e.vx *= 0.8;
              e.aiState = "idle";
            }
          }
        }
      } else if (e.type === "boss") {
        e.vy += GRAVITY;
        const isEnraged = e.health < e.maxHealth * 0.5;

        if (isEnraged && Math.random() < 0.3) {
          // Enraged flame aura particles
          this.spawnParticles(
            e.x + Math.random() * e.w,
            e.y + Math.random() * e.h,
            "#f97316",
            1
          );
        }

        if (e.stateTimer <= 0) {
          const rand = Math.random();
          if (isEnraged && rand < 0.45) {
            // Phase 2: Magma Fireball Burst
            e.aiState = "magma_burst";
            e.stateTimer = 50;
            e.vx = 0;
            // Spawn 3 magma fireballs directed at player
            for (let i = -1; i <= 1; i++) {
              const angle = Math.atan2(p.y - e.y, p.x - e.x) + i * 0.25;
              this.state.projectiles.push({
                id: `magma_${Date.now()}_${i}`,
                x: e.x + e.w / 2 - 6,
                y: e.y + e.h / 2 - 6,
                w: 12,
                h: 12,
                vx: Math.cos(angle) * 7,
                vy: Math.sin(angle) * 7,
                damage: 12,
                type: "magma",
                facingRight: Math.cos(angle) >= 0,
              });
            }
          } else if (rand < 0.7) {
            // Ground Smash Shockwave
            e.aiState = "smash";
            e.stateTimer = isEnraged ? 40 : 60;
            e.vx = (p.x > e.x ? 1 : -1) * (isEnraged ? 3.5 : 2.5);
          } else {
            // Pounce Leap
            e.aiState = "jump";
            e.stateTimer = isEnraged ? 45 : 65;
            if (e.isGrounded) {
              e.vy = -12.5;
              e.vx = (p.x > e.x ? 1 : -1) * (isEnraged ? 5.5 : 4);
              e.isGrounded = false;
              this.state.shakeTimer = 15;
            }
          }
        } else if (e.aiState === "smash") {
          e.vx *= 0.85;
          // Frame 20 shockwave impact
          if (e.stateTimer === 20) {
            this.state.shakeTimer = 20;
            const slamX = e.x + e.w / 2;
            this.spawnParticles(slamX, e.y + e.h, "#f97316", 20);
            this.spawnParticles(slamX, e.y + e.h, "#ef4444", 20);
            if (Math.hypot(p.x - slamX, p.y - (e.y + e.h)) < 110 && p.invulnerableTimer <= 0) {
              const kbDir = p.x > slamX ? 1 : -1;
              this.damagePlayer(16, kbDir, 14, -8, "#f97316");
            }
          }
        }
      } else if (e.type === "inferno_knight") {
        e.vy += GRAVITY;
        if (e.isGrounded) {
          if (distToPlayer < 450) {
            e.facingRight = p.x > e.x;
            const dir = e.facingRight ? 1 : -1;
            if (e.stateTimer <= 0) {
              if (distToPlayer < 70) {
                // Fiery sword thrust!
                e.aiState = "thrusting";
                e.stateTimer = 40;
                e.vx = dir * 6;
                if (p.invulnerableTimer <= 0) {
                  const hit = this.damagePlayer(16, dir, 9, -4, "#f97316");
                  if (hit && (!p.fireImmunityTimer || p.fireImmunityTimer <= 0)) {
                    p.burnTimer = 90;
                  }
                }
                this.spawnParticles(e.x + (e.facingRight ? e.w + 6 : -6), e.y + e.h / 2, "#f97316", 8);
              } else {
                // Charge toward player
                e.aiState = "charging";
                e.stateTimer = 45;
                e.vx = dir * 3.5;
              }
            }
          } else {
            e.vx *= 0.8;
            e.aiState = "idle";
          }
        }
      } else if (e.type === "frost_knight") {
        e.vy += GRAVITY;
        if (e.isGrounded) {
          if (distToPlayer < 450) {
            e.facingRight = p.x > e.x;
            const dir = e.facingRight ? 1 : -1;
            if (e.stateTimer <= 0) {
              if (distToPlayer < 70) {
                // Frost slash!
                e.aiState = "thrusting";
                e.stateTimer = 40;
                e.vx = dir * 5.5;
                if (p.invulnerableTimer <= 0) {
                  const hit = this.damagePlayer(14, dir, 8, -4, "#38bdf8");
                  if (hit) p.slownessTimer = 180;
                }
                this.spawnParticles(e.x + (e.facingRight ? e.w + 6 : -6), e.y + e.h / 2, "#38bdf8", 8);
              } else {
                // Charge toward player
                e.aiState = "charging";
                e.stateTimer = 45;
                e.vx = dir * 3.0;
              }
            }
          } else {
            e.vx *= 0.8;
            e.aiState = "idle";
          }
        }
      }

      if (e.vx > 0) e.facingRight = true;
      if (e.vx < 0) e.facingRight = false;

      const res = AABBMapCollision(
        e,
        e.vx,
        e.vy,
        this.state.map,
        this.state.width,
        this.state.height,
        false,
      );
      e.x = res.x;
      e.y = res.y;
      if (res.hitX) e.vx = -e.vx;
      if (res.hitY) e.vy = 0;
      e.isGrounded = res.grounded;

      // Hit player
      if (p.invulnerableTimer <= 0 && rectIntersect(p, e)) {
        let damage =
          e.type === "boss"
            ? 15
            : e.type === "inferno_knight"
              ? 14
              : e.type === "frost_knight"
                ? 12
                : e.type === "yeti"
                  ? 12 // Yeti damage adjusted x0.65 (18 -> 12)
                  : e.type === "frost_slime"
                    ? 8
                    : e.type === "lava_slime"
                      ? 5
                      : 5;
        const kbDir = p.x + p.w / 2 > e.x + e.w / 2 ? 1 : -1;
        const kbForceX = e.type === "yeti" || e.type === "inferno_knight" ? 12 : 8;
        const kbForceY = e.type === "yeti" || e.type === "inferno_knight" ? -7 : -5;
        const pColor = e.type === "slime" || e.type === "frost_slime" || e.type === "moss_slime" || e.type === "lava_slime" ? COLORS.slime : COLORS.blood;
        this.damagePlayer(damage, kbDir, kbForceX, kbForceY, pColor);
        if (e.type === "lava_slime") {
          if (!p.fireImmunityTimer || p.fireImmunityTimer <= 0) {
            p.burnTimer = 60; // 1s burn on hit
          }
        }
      }
    }
  }

  updateParticlesAndTexts() {
    for (let i = this.state.particles.length - 1; i >= 0; i--) {
      let p = this.state.particles[i];
      if (p.target) {
        const dx = p.target.x - p.x;
        const dy = p.target.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
          p.vx += (dx / dist) * 0.25;
          p.vy += (dy / dist) * 0.25;
          p.vx *= 0.95;
          p.vy *= 0.95;
        }
      }

      if (p.drag !== undefined) {
        p.vx *= p.drag;
        p.vy *= p.drag;
      }
      if (p.gravity !== undefined) {
        p.vy += p.gravity;
      }
      if (p.grow !== undefined) {
        p.size = Math.max(0.5, p.size + p.grow);
      }
      if (p.vAngle !== undefined && p.angle !== undefined) {
        p.angle += p.vAngle;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) this.state.particles.splice(i, 1);
    }

    for (let i = this.state.texts.length - 1; i >= 0; i--) {
      let t = this.state.texts[i];
      if (t.vy !== undefined) {
        t.y += t.vy;
        t.vy += 0.03; // slight upward deceleration
      } else {
        t.y -= 0.6;
      }
      if (t.vx !== undefined) {
        t.x += t.vx;
        t.vx *= 0.96;
      }
      t.life--;
      if (t.life <= 0) this.state.texts.splice(i, 1);
    }
  }

  updateFallingIcicles() {
    if (
      this.state.isPaused ||
      this.state.isGameOver ||
      this.state.isFloorComplete
    )
      return;

    const p = this.state.player;
    for (let i = this.state.fallingIcicles.length - 1; i >= 0; i--) {
      const icicle = this.state.fallingIcicles[i];

      if (icicle.state === "hanging") {
        // Horizontal distance <= 4 blocks (4 * TILE_SIZE = 128 px), and player is underneath it (p.y >= icicle.y)
        const dx = Math.abs(p.x + p.w / 2 - (icicle.x + icicle.w / 2));
        if (dx <= 128 && p.y >= icicle.y) {
          icicle.state = "falling";
          icicle.vy = 1;
        }
      } else if (icicle.state === "falling") {
        icicle.vy += 0.4;
        if (icicle.vy > 12) icicle.vy = 12; // Terminal velocity
        icicle.y += icicle.vy;

        // Player collision
        if (rectIntersect(icicle, p)) {
          if (p.invulnerableTimer <= 0) {
            const kbDir = p.x + p.w / 2 > icicle.x + icicle.w / 2 ? 1 : -1;
            this.damagePlayer(icicle.damage, kbDir, 8, -3, "rgba(180, 220, 255, 0.9)");
          }
          icicle.state = "broken";
        }

        // Map solid blocks collision at bottom of icicle
        const bottomY = icicle.y + icicle.h;
        const leftX = icicle.x + 2;
        const rightX = icicle.x + icicle.w - 3;
        const tileY = Math.floor(bottomY / TILE_SIZE);
        const tileL = Math.floor(leftX / TILE_SIZE);
        const tileR = Math.floor(rightX / TILE_SIZE);

        const isSolid = (tx: number, ty: number) => {
          if (
            ty < 0 ||
            ty >= this.state.height ||
            tx < 0 ||
            tx >= this.state.width
          )
            return true;
          const t = this.state.map[ty] && this.state.map[ty][tx];
          return (
            t === 1 ||
            t === 8 ||
            t === 7 ||
            t === 15 ||
            t === 16 ||
            t === 17
          );
        };

        if (
          isSolid(tileL, tileY) ||
          isSolid(tileR, tileY) ||
          bottomY > this.state.height * TILE_SIZE
        ) {
          icicle.state = "broken";
        }
      }

      if (icicle.state === "broken") {
        // Spawn ice debris particles
        this.spawnParticles(
          icicle.x + icicle.w / 2,
          icicle.y + icicle.h,
          "rgba(180, 230, 255, 0.9)",
          15,
        );
        // Remove from list
        this.state.fallingIcicles.splice(i, 1);
      }
    }
  }

  // ponytail: pan the menu background camera left/right in a ping-pong loop,
  // zoomed in more than the legacy version; clamped to the map bounds
  panMenuCamera(speed: number) {
    const minX = 200;
    const maxX = this.state.width * TILE_SIZE - 200;
    this.state.camera.x += speed * (this.state.panDirection || 1);
    if (this.state.camera.x > maxX) {
      this.state.camera.x = maxX;
      this.state.panDirection = -1;
    } else if (this.state.camera.x < minX) {
      this.state.camera.x = minX;
      this.state.panDirection = 1;
    }
    this.state.camera.y = (this.state.height * TILE_SIZE) / 2;
  }

  updateCamera() {
    const targetX = this.state.player.x + this.state.player.w / 2;
    const targetY = this.state.player.y + this.state.player.h / 2;

    this.state.camera.x += (targetX - this.state.camera.x) * 0.1;
    this.state.camera.y += (targetY - this.state.camera.y) * 0.1;

    // ponytail: keep the camera glued to the player. Clamp to the map edges only
    // when the map is wider than the viewport; otherwise (map fits onscreen) never
    // fight the player — otherwise the camera pins to the map center and loses X.
    const halfW = this.canvasWidth / 2 / this.state.camera.zoom;
    const halfH = this.canvasHeight / 2 / this.state.camera.zoom;
    const mapW = this.state.width * TILE_SIZE;
    const mapH = this.state.height * TILE_SIZE;
    if (mapW >= 2 * halfW) {
      this.state.camera.x = Math.max(halfW, Math.min(mapW - halfW, this.state.camera.x));
    }
    if (mapH >= 2 * halfH) {
      this.state.camera.y = Math.max(halfH, Math.min(mapH - halfH, this.state.camera.y));
    }

    let targetZoom = 1.5;
    if ((this.state.introZoomTimer || 0) > 0) {
      this.state.introZoomTimer = (this.state.introZoomTimer || 0) - 1;
      if (this.state.introZoomTimer === 0) {
        this.state.camera.zoom = 1.5;
      }
    } else if (this.state.gateEntered) {
      targetZoom = 2.5; // Zoom in dramatically upon stepping on the exit gate
    }
    this.state.camera.zoom += (targetZoom - this.state.camera.zoom) * 0.08;
    if (Math.abs(this.state.camera.zoom - targetZoom) < 0.01) {
      this.state.camera.zoom = targetZoom;
    }

    // Update mouse world pos
    this.state.mouse.worldX =
      (this.state.mouse.x - this.canvasWidth / 2) / this.state.camera.zoom +
      this.state.camera.x;
    this.state.mouse.worldY =
      (this.state.mouse.y - this.canvasHeight / 2) / this.state.camera.zoom +
      this.state.camera.y;
  }

  // == RENDERING ==
  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false; // Razor-sharp pixel-art rendering
    const p = this.state.player;

    // Clear bg
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    // Camera transform
    ctx.save();

    // Screen shake
    let shakeX = 0,
      shakeY = 0;
    if (this.state.shakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * 5;
      shakeY = (Math.random() - 0.5) * 5;
    }

    const zoom = this.state.camera.zoom;
    const scaledCamX = Math.round(this.state.camera.x * zoom);
    const scaledCamY = Math.round(this.state.camera.y * zoom);

    ctx.translate(
      Math.round(this.canvasWidth / 2 + shakeX),
      Math.round(this.canvasHeight / 2 + shakeY),
    );
    ctx.translate(-scaledCamX, -scaledCamY);
    ctx.scale(zoom, zoom);

    // Draw Map
    const startCol = Math.max(
      0,
      Math.floor(
        (this.state.camera.x - this.canvasWidth / 2 / this.state.camera.zoom) /
          TILE_SIZE,
      ) - 1,
    );
    const endCol = Math.min(
      this.state.width,
      Math.ceil(
        (this.state.camera.x + this.canvasWidth / 2 / this.state.camera.zoom) /
          TILE_SIZE,
      ) + 1,
    );
    const startRow = Math.max(
      0,
      Math.floor(
        (this.state.camera.y - this.canvasHeight / 2 / this.state.camera.zoom) /
          TILE_SIZE,
      ) - 1,
    );
    const endRow = Math.min(
      this.state.height,
      Math.ceil(
        (this.state.camera.y + this.canvasHeight / 2 / this.state.camera.zoom) /
          TILE_SIZE,
      ) + 1,
    );

    // Draw Background Walls
    for (let y = startRow; y < endRow; y++) {
      for (let x = startCol; x < endCol; x++) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (tileTextures["background"] && tileTextures["background"].complete && tileTextures["background"].naturalWidth > 0) {
          ctx.drawImage(tileTextures["background"], px, py, TILE_SIZE + 1, TILE_SIZE + 1);
        } else if (this.state.bgMap[y] && this.state.bgMap[y][x] === 9) {
          // Weathered Medieval Timber & Overgrown Masonry Background
          ctx.fillStyle = "#2d1b10"; // Dark rich timber base
          ctx.fillRect(px, py, TILE_SIZE + 1, TILE_SIZE + 1);

          // Wood plank bands
          ctx.fillStyle = "#3e2617";
          ctx.fillRect(px, py + 1, TILE_SIZE + 1, 6);
          ctx.fillRect(px, py + 9, TILE_SIZE + 1, 6);
          ctx.fillRect(px, py + 17, TILE_SIZE + 1, 6);
          ctx.fillRect(px, py + 25, TILE_SIZE + 1, 6);

          // Deep recessed shadow seams between planks
          ctx.fillStyle = "#170e08";
          ctx.fillRect(px, py + 7, TILE_SIZE + 1, 2);
          ctx.fillRect(px, py + 15, TILE_SIZE + 1, 2);
          ctx.fillRect(px, py + 23, TILE_SIZE + 1, 2);
          ctx.fillRect(px, py + 31, TILE_SIZE + 1, 2);

          // Wrought-iron square nails
          ctx.fillStyle = "#111827";
          ctx.fillRect(px + 3, py + 3, 2, 2);
          ctx.fillRect(px + 27, py + 3, 2, 2);
          ctx.fillRect(px + 3, py + 19, 2, 2);
          ctx.fillRect(px + 27, py + 19, 2, 2);
        } else {
          const isIceBg = this.state.biome === "ice";
          const isMossBg = this.state.biome === "moss";
          const isVolcanicBg = this.state.biome === "volcanic";
          const bgHue = isIceBg
            ? 210
            : isMossBg
              ? 120
              : isVolcanicBg
                ? 18
                : 25 + ((this.state.floor * 12) % 20);
          const baseSat = isIceBg ? 30 : isMossBg ? 40 : isVolcanicBg ? 45 : 16;
          const baseLight = isIceBg ? 11 : isMossBg ? 6 : isVolcanicBg ? 6 : 8;

          // Render background in 8x8 chunky "mini blocks" with rich pixel depth
          for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
              const bgX = x * 4 + i;
              const bgY = y * 4 + j;
              const subPx = px + i * 8;
              const subPy = py + j * 8;

              // Pseudo-noise for natural rocky shade variation
              const baseNoise =
                Math.sin(bgX * 0.22 + bgY * 0.16) *
                Math.cos(bgX * 0.31 - bgY * 0.12);
              const mossNoise =
                Math.sin(bgX * 0.06 + bgY * 0.09) *
                  Math.cos(bgX * 0.12 - bgY * 0.05) +
                Math.sin(bgX * 0.16 + bgY * 0.22) * 0.5;

              let color = `hsl(${bgHue}, ${baseSat}%, ${baseLight}%)`;

              if (baseNoise > 0.35) {
                color = `hsl(${bgHue}, ${baseSat}%, ${baseLight - 2}%)`;
              } else if (baseNoise < -0.35) {
                color = `hsl(${bgHue}, ${baseSat}%, ${baseLight + 2}%)`;
              }

              if (isIceBg) {
                if (mossNoise > 0.2) {
                  color = mossNoise > 0.55 ? "#182c47" : (mossNoise > 0.35 ? "#101e30" : "#0a131f");
                }
              } else if (isMossBg) {
                if (mossNoise > -0.15) {
                  color = mossNoise > 0.55 ? "#142914" : (mossNoise > 0.25 ? "#0e1c0e" : "#081208");
                }
              } else if (isVolcanicBg) {
                if (mossNoise > 0.1) {
                  color = mossNoise > 0.55 ? "#24120a" : (mossNoise > 0.25 ? "#1a0d07" : "#120804");
                }
              } else {
                if (mossNoise > 0.2) {
                  color = mossNoise > 0.55 ? "#231b14" : (mossNoise > 0.35 ? "#1a140e" : "#120d09");
                }
              }

              ctx.fillStyle = color;
              ctx.fillRect(subPx, subPy, 9, 9); // seamless overlap to prevent any gaps
            }
          }
        }
      }
    }

    // Pass 2: Draw Foreground Solids, Custom Auto-Tiles, Overhangs, and Map Entities
    for (let y = startRow; y < endRow; y++) {
      for (let x = startCol; x < endCol; x++) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (this.state.map[y] && this.state.map[y][x] !== undefined) {
          const tile = this.state.map[y][x];
          if (
            tile === 1 ||
            tile === 7 ||
            tile === 8 ||
            tile === 11 ||
            tile === 15 ||
            tile === 16 ||
            tile === 17 ||
            tile === 19 ||
            tile === 20
          ) {
            const isStoneBrick = tile === 11;
            const isGrass = tile === 7;
            const isMossy = tile === 15;
            const isStone = tile === 8;
            const isSnow = tile === 16;
            const isIce = tile === 17;
            const isBasalt = tile === 19;
            const isMagma = tile === 20;

            const isSolid = (t: number | undefined) =>
              t === 1 ||
              t === 7 ||
              t === 8 ||
              t === 11 ||
              t === 15 ||
              t === 16 ||
              t === 17 ||
              t === 19 ||
              t === 20;
            const top = isSolid(this.state.map[y - 1]?.[x]);
            const bottom = isSolid(this.state.map[y + 1]?.[x]);
            const left = isSolid(this.state.map[y]?.[x - 1]);
            const right = isSolid(this.state.map[y]?.[x + 1]);

            const topLeft = isSolid(this.state.map[y - 1]?.[x - 1]);
            const topRight = isSolid(this.state.map[y - 1]?.[x + 1]);
            const bottomLeft = isSolid(this.state.map[y + 1]?.[x - 1]);
            const bottomRight = isSolid(this.state.map[y + 1]?.[x + 1]);

            // Check for user-imported custom texture PNGs from /tiles/ with full auto-tiling piece support
            let customTexture: HTMLImageElement | undefined;
            if (isGrass || (!top && tile === 1 && (this.state.biome === "neutral" || !this.state.biome))) {
              customTexture = getAutoTileTexture("grass", top, bottom, left, right) || getAutoTileTexture("dirt", top, bottom, left, right);
            }
            else if (isStone) customTexture = getAutoTileTexture("cobblestone", top, bottom, left, right);
            else if (isStoneBrick) customTexture = getAutoTileTexture("bricks", top, bottom, left, right);
            else if (isMossy) customTexture = getAutoTileTexture("moss", top, bottom, left, right);
            else if (isSnow) customTexture = getAutoTileTexture("snow", top, bottom, left, right);
            else if (isIce) customTexture = getAutoTileTexture("ice", top, bottom, left, right);
            else if (isBasalt) customTexture = getAutoTileTexture("basalt", top, bottom, left, right);
            else if (isMagma) customTexture = getAutoTileTexture("magma", top, bottom, left, right);
            else customTexture = getAutoTileTexture("dirt", top, bottom, left, right);

            if (customTexture && customTexture.complete && customTexture.naturalWidth > 0) {
              const baseGrid = customTexture.naturalWidth <= 18 ? 16 : (customTexture.naturalWidth <= 36 ? 32 : (customTexture.naturalWidth <= 72 ? 64 : customTexture.naturalWidth));
              const scale = TILE_SIZE / baseGrid;
              const drawW = Math.round(customTexture.naturalWidth * scale);
              const drawH = Math.round(customTexture.naturalHeight * scale);
              const extraTop = Math.max(0, Math.round((customTexture.naturalHeight - baseGrid) * scale));
              let extraLeft = 0;
              if (!left && customTexture.naturalWidth > baseGrid) {
                if (!right) {
                  // Symmetrical stub/pillar (e.g. 18x17 with 1px left overhang and 1px right overhang)
                  const leftProtrusion = Math.floor((customTexture.naturalWidth - baseGrid) / 2);
                  extraLeft = Math.round(leftProtrusion * scale);
                } else {
                  // Left corner tile (17x17 with 1px left overhang only)
                  extraLeft = Math.round((customTexture.naturalWidth - baseGrid) * scale);
                }
              }
              const drawX = px - extraLeft;
              const drawY = py - extraTop;
              ctx.drawImage(customTexture, drawX, drawY, drawW, drawH);
              continue;
            }

            let baseColor: string, darkColor: string, highlightColor: string, strokeColor: string;

            if (isBasalt) {
              baseColor = "#262626";
              darkColor = "#141414";
              highlightColor = "#3d3d3d";
              strokeColor = "#0a0a0a";
            } else if (isMagma) {
              baseColor = "#451a03";
              darkColor = "#1c1917";
              highlightColor = "#f97316";
              strokeColor = "#7f1d1d";
            } else if (isStoneBrick) {
              // Castle / Dungeon Stone Bricks (Tile 11)
              baseColor = "#334155";
              darkColor = "#1e293b";
              highlightColor = "#475569";
              strokeColor = "#0f172a";
            } else if (isStone) {
              // Rough-Hewn Cave Cobblestone (Tile 8)
              baseColor = "#3e4c5e";
              darkColor = "#1e293b";
              highlightColor = "#64748b";
              strokeColor = "#0f172a";
            } else if (isMossy) {
              // Lush Emerald Moss Block (Tile 15)
              baseColor = "#166534";
              darkColor = "#14532d";
              highlightColor = "#22c55e";
              strokeColor = "#052e16";
            } else if (isIce) {
              baseColor = "#0369a1";
              darkColor = "#075985";
              highlightColor = "#38bdf8";
              strokeColor = "#082f49";
            } else if (isSnow) {
              baseColor = "#1e293b";
              darkColor = "#0f172a";
              highlightColor = "#38bdf8";
              strokeColor = "#020617";
            } else {
              // Natural Cave Earth / Dirt (Tile 1, 7)
              baseColor = "#3b2d22";
              darkColor = "#241911";
              highlightColor = "#4d3a2b";
              strokeColor = "#140e09";
            }

            // Fill solid base
            ctx.fillStyle = baseColor;
            ctx.fillRect(px, py, TILE_SIZE + 1, TILE_SIZE + 1);

            // Interior Chunky Textures
            if (isStone) {
              // === ROUGH CAVE COBBLESTONE (Tile 8) ===
              // Dark mortar/crevice bed
              ctx.fillStyle = darkColor;
              ctx.fillRect(px, py, TILE_SIZE + 1, TILE_SIZE + 1);

              // 4 Chunky Cobblestone Boulders per block (with alternating pattern across tiles)
              const cobbleVariant = (x + y * 2) % 2;

              if (cobbleVariant === 0) {
                // Cobble 1 (Top-Left Big Boulder: 12x10)
                ctx.fillStyle = baseColor;
                ctx.fillRect(px + 2, py + 2, 12, 10);
                ctx.fillStyle = highlightColor; // Top-Left Bevel
                ctx.fillRect(px + 2, py + 2, 12, 2);
                ctx.fillRect(px + 2, py + 2, 2, 10);
                ctx.fillStyle = strokeColor; // Shadow edge
                ctx.fillRect(px + 2, py + 10, 12, 2);
                ctx.fillRect(px + 12, py + 2, 2, 10);

                // Cobble 2 (Top-Right Stone: 14x10)
                ctx.fillStyle = baseColor;
                ctx.fillRect(px + 16, py + 2, 14, 10);
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px + 16, py + 2, 14, 2);
                ctx.fillRect(px + 16, py + 2, 2, 10);
                ctx.fillStyle = strokeColor;
                ctx.fillRect(px + 16, py + 10, 14, 2);
                ctx.fillRect(px + 28, py + 2, 2, 10);

                // Cobble 3 (Bottom-Left Stone: 13x16)
                ctx.fillStyle = baseColor;
                ctx.fillRect(px + 2, py + 14, 13, 16);
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px + 2, py + 14, 13, 2);
                ctx.fillRect(px + 2, py + 14, 2, 16);
                ctx.fillStyle = strokeColor;
                ctx.fillRect(px + 2, py + 28, 13, 2);
                ctx.fillRect(px + 13, py + 14, 2, 16);

                // Cobble 4 (Bottom-Right Big Stone: 13x16)
                ctx.fillStyle = baseColor;
                ctx.fillRect(px + 17, py + 14, 13, 16);
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px + 17, py + 14, 13, 2);
                ctx.fillRect(px + 17, py + 14, 2, 16);
                ctx.fillStyle = strokeColor;
                ctx.fillRect(px + 17, py + 28, 13, 2);
                ctx.fillRect(px + 28, py + 14, 2, 16);
              } else {
                // Cobble Variant B (Staggered Cobbles)
                // Cobble 1 (Wide Top Stone: 18x9)
                ctx.fillStyle = baseColor;
                ctx.fillRect(px + 2, py + 2, 18, 9);
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px + 2, py + 2, 18, 2);
                ctx.fillRect(px + 2, py + 2, 2, 9);
                ctx.fillStyle = strokeColor;
                ctx.fillRect(px + 2, py + 9, 18, 2);
                ctx.fillRect(px + 18, py + 2, 2, 9);

                // Cobble 2 (Top-Right Small Stone: 8x9)
                ctx.fillStyle = baseColor;
                ctx.fillRect(px + 22, py + 2, 8, 9);
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px + 22, py + 2, 8, 2);
                ctx.fillRect(px + 22, py + 2, 2, 9);
                ctx.fillStyle = strokeColor;
                ctx.fillRect(px + 22, py + 9, 8, 2);
                ctx.fillRect(px + 28, py + 2, 2, 9);

                // Cobble 3 (Mid-Left Small Stone: 9x17)
                ctx.fillStyle = baseColor;
                ctx.fillRect(px + 2, py + 13, 9, 17);
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px + 2, py + 13, 9, 2);
                ctx.fillRect(px + 2, py + 13, 2, 17);
                ctx.fillStyle = strokeColor;
                ctx.fillRect(px + 2, py + 28, 9, 2);
                ctx.fillRect(px + 9, py + 13, 2, 17);

                // Cobble 4 (Mid-Right Wide Boulder: 17x17)
                ctx.fillStyle = baseColor;
                ctx.fillRect(px + 13, py + 13, 17, 17);
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px + 13, py + 13, 17, 2);
                ctx.fillRect(px + 13, py + 13, 2, 17);
                ctx.fillStyle = strokeColor;
                ctx.fillRect(px + 13, py + 28, 17, 2);
                ctx.fillRect(px + 28, py + 13, 2, 17);
              }
            } else if (isStoneBrick) {
              // === CASTLE STONE BRICKS (Tile 11) ===
              ctx.fillStyle = darkColor;
              ctx.fillRect(px, py + 15, TILE_SIZE + 1, 2);
              const r0 = (y % 2 === 0) ? 0 : 16;
              const r1 = (y % 2 === 0) ? 16 : 0;
              ctx.fillRect(px + r0, py, 2, 15);
              ctx.fillRect(px + r1, py + 16, 2, 16);
              ctx.fillStyle = highlightColor;
              ctx.fillRect(px + r0 + 2, py + 1, (TILE_SIZE / 2) - 4, 1);
              ctx.fillRect(px + ((r0 + 16) % 32) + 2, py + 1, (TILE_SIZE / 2) - 4, 1);
              ctx.fillRect(px + r1 + 2, py + 17, (TILE_SIZE / 2) - 4, 1);
              ctx.fillRect(px + ((r1 + 16) % 32) + 2, py + 17, (TILE_SIZE / 2) - 4, 1);
            } else if (isMagma) {
              // Magma blocks with connected channels
              ctx.fillStyle = darkColor;
              ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
              ctx.fillStyle = "#ea580c";
              ctx.fillRect(px + 6, py + 6, TILE_SIZE - 12, TILE_SIZE - 12);
              ctx.fillStyle = "#f97316";
              ctx.fillRect(px + 10, py + 10, TILE_SIZE - 20, TILE_SIZE - 20);
              ctx.fillStyle = "#fef08a";
              ctx.fillRect(px + 13, py + 13, 6, 6);
              if (top) {
                ctx.fillStyle = "#ea580c"; ctx.fillRect(px + 12, py, 8, 8);
                ctx.fillStyle = "#f97316"; ctx.fillRect(px + 14, py, 4, 8);
              }
              if (bottom) {
                ctx.fillStyle = "#ea580c"; ctx.fillRect(px + 12, py + 24, 8, 8);
                ctx.fillStyle = "#f97316"; ctx.fillRect(px + 14, py + 24, 4, 8);
              }
              if (left) {
                ctx.fillStyle = "#ea580c"; ctx.fillRect(px, py + 12, 8, 8);
                ctx.fillStyle = "#f97316"; ctx.fillRect(px, py + 14, 8, 4);
              }
              if (right) {
                ctx.fillStyle = "#ea580c"; ctx.fillRect(px + 24, py + 12, 8, 8);
                ctx.fillStyle = "#f97316"; ctx.fillRect(px + 24, py + 14, 8, 4);
              }
            } else if (isIce || isSnow) {
              // Glacial Ice / Permafrost with chunky crystal facets
              ctx.fillStyle = darkColor;
              ctx.fillRect(px + 2, py + 4, 12, 8);
              ctx.fillRect(px + 16, py + 16, 12, 10);
              ctx.fillStyle = highlightColor;
              ctx.fillRect(px + 4, py + 6, 8, 3);
              ctx.fillRect(px + 18, py + 18, 8, 4);
            } else {
              // === NATURAL CAVE EARTH & DIRT (Tiles 1, 7, 15) ===
              // Chunky dirt clumps and rock aggregates spaced horizontally AND vertically (NO STRIPES!)
              const dSeed = (x * 19 + y * 23) % 4;

              if (dSeed === 0) {
                // Patch A
                ctx.fillStyle = darkColor;
                ctx.fillRect(px + 2, py + 4, 10, 8);
                ctx.fillRect(px + 18, py + 14, 12, 8);
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px + 14, py + 4, 12, 6);
                ctx.fillRect(px + 4, py + 18, 10, 8);
                // Embedded slate pebble
                ctx.fillStyle = "#475569";
                ctx.fillRect(px + 8, py + 8, 4, 3);
              } else if (dSeed === 1) {
                // Patch B
                ctx.fillStyle = darkColor;
                ctx.fillRect(px + 14, py + 2, 14, 10);
                ctx.fillRect(px + 2, py + 16, 12, 10);
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px + 2, py + 4, 10, 8);
                ctx.fillRect(px + 16, py + 16, 12, 8);
                // Embedded slate pebble
                ctx.fillStyle = "#475569";
                ctx.fillRect(px + 20, py + 20, 4, 3);
              } else if (dSeed === 2) {
                // Patch C
                ctx.fillStyle = darkColor;
                ctx.fillRect(px + 6, py + 8, 18, 8);
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px + 2, py + 2, 12, 6);
                ctx.fillRect(px + 16, py + 20, 12, 8);
                // Embedded slate pebble
                ctx.fillStyle = "#475569";
                ctx.fillRect(px + 4, py + 22, 4, 3);
              } else {
                // Patch D
                ctx.fillStyle = darkColor;
                ctx.fillRect(px + 4, py + 14, 14, 12);
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px + 16, py + 4, 12, 10);
                ctx.fillRect(px + 2, py + 4, 8, 6);
                // Embedded slate pebble
                ctx.fillStyle = "#475569";
                ctx.fillRect(px + 18, py + 8, 4, 3);
              }

              if (isMossy) {
                // Moss patches for Tile 15
                ctx.fillStyle = "#14532d";
                ctx.fillRect(px + 4, py + 4, 12, 8);
                ctx.fillRect(px + 16, py + 16, 12, 8);
                ctx.fillStyle = "#16a34a";
                ctx.fillRect(px + 6, py + 6, 8, 4);
                ctx.fillRect(px + 18, py + 18, 8, 4);
              }
            }

            // === 3. Exposed Boundaries & Grass Top (NO green blocks in dirt!) ===
            if (!top) {
              if (isMossy) {
                // Lush moss block top
                ctx.fillStyle = "#14532d";
                ctx.fillRect(px, py + 4, TILE_SIZE + 1, 2);
                ctx.fillStyle = "#16a34a";
                ctx.fillRect(px, py, TILE_SIZE + 1, 4);
                ctx.fillStyle = "#4ade80";
                ctx.fillRect(px, py, TILE_SIZE + 1, 2);
              } else if (isSnow) {
                // Crisp chunky snow layer
                ctx.fillStyle = "#bae6fd";
                ctx.fillRect(px, py + 3, TILE_SIZE + 1, 2);
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(px, py, TILE_SIZE + 1, 3);
              } else if (isMagma) {
                ctx.fillStyle = "#f97316";
                ctx.fillRect(px, py - 1, TILE_SIZE + 1, 3);
                ctx.fillStyle = "#fef08a";
                ctx.fillRect(px + 2, py - 2, TILE_SIZE - 4, 2);
              } else {
                // Earth/Stone top bevel
                ctx.fillStyle = highlightColor;
                ctx.fillRect(px, py, TILE_SIZE + 1, 2);
              }
            }

            if (!bottom) {
              // Deep bottom shadow
              ctx.fillStyle = strokeColor;
              ctx.fillRect(px, py + TILE_SIZE - 2, TILE_SIZE + 1, 3);
            }

            if (!left) {
              // Left face
              ctx.fillStyle = highlightColor;
              ctx.fillRect(px, py, 2, TILE_SIZE + 1);
            }

            if (!right) {
              // Right face shadow
              ctx.fillStyle = strokeColor;
              ctx.fillRect(px + TILE_SIZE - 2, py, 3, TILE_SIZE + 1);
            }

            // Exposed Corners
            if (!top && !left && isMossy) {
              ctx.fillStyle = "#16a34a";
              ctx.fillRect(px - 1, py, 2, 4);
              ctx.fillStyle = "#4ade80";
              ctx.fillRect(px - 1, py, 2, 2);
            }
            if (!top && !right && isMossy) {
              ctx.fillStyle = "#16a34a";
              ctx.fillRect(px + TILE_SIZE - 1, py, 2, 4);
              ctx.fillStyle = "#4ade80";
              ctx.fillRect(px + TILE_SIZE - 1, py, 2, 2);
            }

            // Inner Diagonal Convex Fillets
            if (top && left && !topLeft) {
              ctx.fillStyle = darkColor;
              ctx.fillRect(px - 1, py - 1, 2, 2);
            }
            if (top && right && !topRight) {
              ctx.fillStyle = darkColor;
              ctx.fillRect(px + TILE_SIZE, py - 1, 2, 2);
            }
            if (bottom && left && !bottomLeft) {
              ctx.fillStyle = strokeColor;
              ctx.fillRect(px - 1, py + TILE_SIZE, 2, 2);
            }
            if (bottom && right && !bottomRight) {
              ctx.fillStyle = strokeColor;
              ctx.fillRect(px + TILE_SIZE, py + TILE_SIZE, 2, 2);
            }

            // Magma glow halo on exposed edges
            if (isMagma) {
              ctx.fillStyle = "rgba(249, 115, 22, 0.55)";
              if (!top) ctx.fillRect(px - 1, py - 3, TILE_SIZE + 3, 3);
              if (!bottom) ctx.fillRect(px - 1, py + TILE_SIZE, TILE_SIZE + 3, 3);
              if (!left) ctx.fillRect(px - 3, py - 1, 3, TILE_SIZE + 3);
              if (!right) ctx.fillRect(px + TILE_SIZE, py - 1, 3, TILE_SIZE + 3);
            }
          } else if (tile === 4) {
            // Ladder (Hemp Rope Ladder with Knots & Ivy Tendrils)
            const platformAbove =
              y > 0 && this.state.map[y - 1] && this.state.map[y - 1][x] === 5;

            const ropeBase = "#a16207"; // Rich golden hemp rope
            const ropeLight = "#ca8a04";
            const ropeShadow = "#713f12";
            const rungWood = "#78350f"; // Rich oak wood rung
            const rungLight = "#b45309";
            const rungShadow = "#451a03";

            const startY = platformAbove ? 10 : 0;

            // Rope Rails
            ctx.fillStyle = ropeShadow;
            ctx.fillRect(px + 5, py + startY, 4, TILE_SIZE - startY + 1);
            ctx.fillRect(px + 23, py + startY, 4, TILE_SIZE - startY + 1);
            ctx.fillStyle = ropeBase;
            ctx.fillRect(px + 6, py + startY, 2, TILE_SIZE - startY + 1);
            ctx.fillRect(px + 24, py + startY, 2, TILE_SIZE - startY + 1);
            ctx.fillStyle = ropeLight;
            ctx.fillRect(px + 6, py + startY, 1, TILE_SIZE - startY + 1);
            ctx.fillRect(px + 24, py + startY, 1, TILE_SIZE - startY + 1);

            // Knots attaching to platform
            if (platformAbove) {
              ctx.fillStyle = ropeShadow;
              ctx.fillRect(px + 4, py, 6, 10);
              ctx.fillRect(px + 22, py, 6, 10);
              ctx.fillStyle = ropeBase;
              ctx.fillRect(px + 5, py + 1, 4, 8);
              ctx.fillRect(px + 23, py + 1, 4, 8);
              ctx.fillStyle = ropeLight;
              ctx.fillRect(px + 5, py + 2, 2, 2);
              ctx.fillRect(px + 23, py + 2, 2, 2);
            }

            // Natural Timber Rungs with Woodgrain
            for (let i = 4; i < TILE_SIZE; i += 10) {
              if (i < startY) continue;
              ctx.fillStyle = rungShadow;
              ctx.fillRect(px + 6, py + i + 3, 20, 2);
              ctx.fillStyle = rungWood;
              ctx.fillRect(px + 6, py + i, 20, 3);
              ctx.fillStyle = rungLight;
              ctx.fillRect(px + 7, py + i, 18, 1);
              // Wood peg fasteners
              ctx.fillStyle = "#1c1917";
              ctx.fillRect(px + 7, py + i + 1, 1, 1);
              ctx.fillRect(px + 24, py + i + 1, 1, 1);
            }

            // Natural ivy vine winding around the left rope
            const vineSeed = (x * 11 + y * 19) % 3;
            if (vineSeed === 0) {
              ctx.fillStyle = "#15803d";
              ctx.fillRect(px + 4, py + 8, 3, 6);
              ctx.fillRect(px + 7, py + 18, 3, 5);
              ctx.fillStyle = "#4ade80"; // leaf bud
              ctx.fillRect(px + 2, py + 10, 3, 2);
              ctx.fillRect(px + 9, py + 20, 3, 2);
            }
          } else if (tile === 5) {
            // Platform (Hewn Timber Scaffold Bridge with Expansive Log Ends & Hanging Foliage)
            const platLeft = this.state.map[y]?.[x - 1] === 5;
            const platRight = this.state.map[y]?.[x + 1] === 5;
            const startX = platLeft ? px : px - 2;
            const endX = platRight ? px + TILE_SIZE + 1 : px + TILE_SIZE + 3;
            const totalW = endX - startX;

            // Main Timber Log Beam
            ctx.fillStyle = "#451a03"; // Dark bark shadow
            ctx.fillRect(startX, py + 8, totalW, 3);
            ctx.fillStyle = "#78350f"; // Rich aged wood core
            ctx.fillRect(startX, py + 2, totalW, 6);
            ctx.fillStyle = "#b45309"; // Top log highlight
            ctx.fillRect(startX, py + 2, totalW, 2);

            // Protruding log ends
            if (!platLeft) {
              ctx.fillStyle = "#451a03";
              ctx.fillRect(px - 2, py + 3, 2, 5);
              ctx.fillStyle = "#b45309"; // end grain
              ctx.fillRect(px - 2, py + 4, 1, 3);
            }
            if (!platRight) {
              ctx.fillStyle = "#451a03";
              ctx.fillRect(px + TILE_SIZE + 1, py + 3, 2, 5);
              ctx.fillStyle = "#b45309"; // end grain
              ctx.fillRect(px + TILE_SIZE + 2, py + 4, 1, 3);
            }

            // Plank dividers
            ctx.fillStyle = "#1c1917";
            ctx.fillRect(px + 8, py + 2, 2, 9);
            ctx.fillRect(px + 21, py + 2, 2, 9);

            // Wrought-iron forged nail heads
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(px + 4, py + 4, 2, 2);
            ctx.fillRect(px + 15, py + 4, 2, 2);
            ctx.fillRect(px + 26, py + 4, 2, 2);

            // Hemp rope lashings on ends
            ctx.fillStyle = "#ca8a04";
            ctx.fillRect(px + 2, py + 2, 3, 9);
            ctx.fillRect(px + 27, py + 2, 3, 9);
            ctx.fillStyle = "#713f12";
            ctx.fillRect(px + 2, py + 5, 3, 1);
            ctx.fillRect(px + 27, py + 5, 3, 1);

            // Hanging foliage tendrils / leaf buds drooping under platform
            const folSeed = (x * 13 + y * 7) % 4;
            if (folSeed < 3) {
              ctx.fillStyle = "#15803d";
              ctx.fillRect(px + 5, py + 11, 2, 4 + folSeed * 2);
              ctx.fillRect(px + 17, py + 11, 2, 3 + folSeed);
              ctx.fillStyle = "#4ade80"; // leaf tip
              ctx.fillRect(px + 4, py + 14 + folSeed * 2, 3, 2);
              ctx.fillRect(px + 16, py + 13 + folSeed, 3, 2);
            }
          } else if (tile === 6) {
            // Water (Crystalline Aquatic Ripples & Lily Algae)
            const waterAbove =
              y > 0 &&
              this.state.map[y - 1] &&
              (this.state.map[y - 1][x] === 6 ||
                this.state.map[y - 1][x] === 18);
            const isIce = this.state.biome === "ice";

            ctx.fillStyle = isIce
              ? "rgba(14, 116, 144, 0.75)"
              : "rgba(13, 148, 136, 0.70)";
            if (waterAbove) {
              ctx.fillRect(px, py, TILE_SIZE + 1, TILE_SIZE + 1);
            } else {
              ctx.fillRect(px, py + 4, TILE_SIZE + 1, TILE_SIZE - 4 + 1);
              // Animated crystalline wave crests
              const wTime = Date.now() * 0.003 + x * 0.6;
              ctx.fillStyle = isIce ? "#e0f2fe" : "#ccfbf1";
              if (Math.sin(wTime) > -0.2) {
                ctx.fillRect(px + 2, py + 4, TILE_SIZE - 4, 2);
              }
              // Secondary caustics ripple
              ctx.fillStyle = isIce ? "#38bdf8" : "#2dd4bf";
              ctx.fillRect(px + 4, py + 7, TILE_SIZE - 8, 2);

              // Floating surface lily pad or algae spec
              const lilySeed = (x * 19 + y * 7) % 5;
              if (lilySeed === 0 && !isIce) {
                ctx.fillStyle = "#15803d";
                ctx.fillRect(px + 8, py + 3, 6, 3);
                ctx.fillStyle = "#4ade80";
                ctx.fillRect(px + 10, py + 3, 2, 2);
                ctx.fillStyle = "#f472b6"; // tiny pink water lily flower
                ctx.fillRect(px + 11, py + 2, 2, 2);
              }
            }

            // Sub-surface aquatic depth gradient
            ctx.fillStyle = isIce ? "rgba(7, 89, 133, 0.4)" : "rgba(15, 118, 110, 0.4)";
            ctx.fillRect(px, py + 12, TILE_SIZE + 1, TILE_SIZE - 12);
          } else if (tile === 18) {
            // Thin Surface Ice over Water
            // Sub-surface water
            ctx.fillStyle = "rgba(14, 116, 144, 0.75)";
            ctx.fillRect(px, py, TILE_SIZE + 1, TILE_SIZE + 1);

            // Thin frosted ice sheet
            ctx.fillStyle = "rgba(186, 230, 253, 0.85)";
            ctx.fillRect(px, py, TILE_SIZE + 1, 8);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(px, py, TILE_SIZE + 1, 2);

            // Jagged frost fracture lines
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(px + 4, py + 2, 6, 2);
            ctx.fillRect(px + 16, py + 3, 8, 2);
            ctx.fillStyle = "#0284c7"; // deep blue ice crack
            ctx.fillRect(px + 8, py + 4, 12, 1);
          } else if (tile === 21) {
            // Searing Molten Lava (Viscous Thermal Magma & Floating Crusts)
            const lavaAbove =
              y > 0 &&
              this.state.map[y - 1] &&
              this.state.map[y - 1][x] === 21;

            ctx.fillStyle = "#9a3412"; // Deep rich molten base
            if (lavaAbove) {
              ctx.fillRect(px, py, TILE_SIZE + 1, TILE_SIZE + 1);
            } else {
              ctx.fillRect(px, py + 4, TILE_SIZE + 1, TILE_SIZE - 4 + 1);

              // Animated incandescent magma crests
              const lTime = Date.now() * 0.004 + x * 0.7;
              ctx.fillStyle = "#f97316";
              ctx.fillRect(px + 2, py + 4, TILE_SIZE - 4, 4);

              // Searing hot yellow wave peaks
              ctx.fillStyle = "#fef08a";
              if (Math.sin(lTime) > -0.3) {
                ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, 2);
              }

              // Drifting dark cooling crust islands
              const crustSeed = (x * 23 + y * 13) % 4;
              if (crustSeed === 0) {
                ctx.fillStyle = "#292524";
                ctx.fillRect(px + 8, py + 5, 8, 3);
                ctx.fillStyle = "#44403c";
                ctx.fillRect(px + 9, py + 5, 6, 1);
              }
            }

            // Molten thermal core veins
            ctx.fillStyle = "#ea580c";
            ctx.fillRect(px + 3, py + 12, TILE_SIZE - 6, 6);
            ctx.fillStyle = "#fbbf24";
            ctx.fillRect(px + 6, py + 14, TILE_SIZE - 12, 2);
          } else if (tile === 10 || tile === 12) {
            // Wall Torch (10) or Arcane Lantern (12)
            const isPurple = tile === 12;

            if (isPurple) {
              // Ornate Gothic Wrought-Iron Lantern
              // Wall soot wash
              ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
              ctx.fillRect(px + 8, py + 2, 16, 16);

              // Iron wall bracket arm
              ctx.fillStyle = "#1e293b";
              ctx.fillRect(px + 7, py + 6, 18, 3);
              ctx.fillRect(px + 7, py + 9, 3, 8);
              ctx.fillStyle = "#475569";
              ctx.fillRect(px + 8, py + 6, 16, 1);

              // Lantern housing cage
              ctx.fillStyle = "#0f172a";
              ctx.fillRect(px + 10, py + 9, 12, 15);
              ctx.fillStyle = "#334155";
              ctx.strokeRect(px + 10, py + 9, 12, 15);

              // 3-Frame Animated Soulfire Core
              const sFrame = Math.floor(Date.now() / 110 + (x * 7 + y * 13)) % 3;
              ctx.fillStyle = "#7e22ce";
              ctx.fillRect(px + 12, py + 12, 8, 9);
              ctx.fillStyle = "#a855f7";
              ctx.fillRect(px + 13, py + 13 + (sFrame === 1 ? -1 : 0), 6, 7);
              ctx.fillStyle = "#f0abfc";
              ctx.fillRect(px + 14, py + 14 + (sFrame === 2 ? -1 : 0), 4, 5);
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(px + 15, py + 15, 2, 3);
            } else {
              // Overhauled 3-Frame Hand-Crafted Wall Torch
              // 1. Warm charcoal soot shadow on wall
              ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
              ctx.fillRect(px + 8, py + 4, 16, 18);

              // 2. Iron wall mounting plate with rivets
              ctx.fillStyle = "#1e293b";
              ctx.fillRect(px + 9, py + 20, 14, 6);
              ctx.fillStyle = "#475569"; // rivet heads
              ctx.fillRect(px + 10, py + 22, 2, 2);
              ctx.fillRect(px + 20, py + 22, 2, 2);

              // 3. Timber sconce staff & angled support bracket
              ctx.fillStyle = "#0f172a"; // iron bracket arm
              ctx.fillRect(px + 12, py + 16, 8, 4);
              ctx.fillStyle = "#451a03"; // ash wood staff
              ctx.fillRect(px + 14, py + 11, 4, 11);
              ctx.fillStyle = "#78350f"; // wood highlight
              ctx.fillRect(px + 15, py + 11, 2, 11);

              // 4. Blackened iron basket cup holding hot coals
              ctx.fillStyle = "#1c1917";
              ctx.fillRect(px + 11, py + 12, 10, 4);
              ctx.fillStyle = "#292524";
              ctx.fillRect(px + 10, py + 11, 12, 2);
              ctx.fillStyle = "#ea580c"; // smoldering ember bed inside cup
              ctx.fillRect(px + 12, py + 11, 8, 2);
              ctx.fillStyle = "#fef08a";
              ctx.fillRect(px + 14, py + 11, 4, 1);

              // 5. Hand-Crafted 3-Frame Animated Fire Sprite (Frame-by-Frame)
              const fireFrame = Math.floor(Date.now() / 100 + (x * 5 + y * 11)) % 3;

              if (fireFrame === 0) {
                // Frame 0: Natural teardrop flame curling right
                // Outer Red Flame
                ctx.fillStyle = "#ef4444";
                ctx.fillRect(px + 11, py + 4, 10, 7);
                ctx.fillRect(px + 12, py + 2, 7, 3);
                ctx.fillRect(px + 14, py, 4, 2);
                // Mid Orange Flame
                ctx.fillStyle = "#f97316";
                ctx.fillRect(px + 12, py + 5, 8, 6);
                ctx.fillRect(px + 13, py + 3, 5, 3);
                // Hot Yellow Core
                ctx.fillStyle = "#fef08a";
                ctx.fillRect(px + 13, py + 6, 6, 5);
                ctx.fillRect(px + 14, py + 4, 4, 3);
                // White Hot Center
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(px + 14, py + 7, 4, 3);
                // Trailing ember spark
                ctx.fillStyle = "#fbbf24";
                ctx.fillRect(px + 17, py - 2, 2, 2);
              } else if (fireFrame === 1) {
                // Frame 1: Tall surging flare
                // Outer Red Flame
                ctx.fillStyle = "#ef4444";
                ctx.fillRect(px + 10, py + 3, 12, 8);
                ctx.fillRect(px + 12, py + 1, 8, 3);
                ctx.fillRect(px + 13, py - 2, 5, 3);
                ctx.fillRect(px + 14, py - 4, 3, 2);
                // Mid Orange Flame
                ctx.fillStyle = "#f97316";
                ctx.fillRect(px + 11, py + 4, 10, 7);
                ctx.fillRect(px + 13, py + 2, 6, 3);
                ctx.fillRect(px + 14, py, 4, 2);
                // Hot Yellow Core
                ctx.fillStyle = "#fef08a";
                ctx.fillRect(px + 12, py + 5, 8, 6);
                ctx.fillRect(px + 14, py + 3, 4, 3);
                // White Hot Center
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(px + 14, py + 6, 4, 4);
                // Trailing ember sparks
                ctx.fillStyle = "#fef08a";
                ctx.fillRect(px + 12, py - 4, 2, 2);
                ctx.fillStyle = "#f97316";
                ctx.fillRect(px + 18, py - 1, 2, 2);
              } else {
                // Frame 2: Flickering flame curling left
                // Outer Red Flame
                ctx.fillStyle = "#ef4444";
                ctx.fillRect(px + 11, py + 4, 10, 7);
                ctx.fillRect(px + 11, py + 2, 7, 3);
                ctx.fillRect(px + 12, py, 4, 2);
                // Mid Orange Flame
                ctx.fillStyle = "#f97316";
                ctx.fillRect(px + 12, py + 5, 8, 6);
                ctx.fillRect(px + 12, py + 3, 5, 3);
                // Hot Yellow Core
                ctx.fillStyle = "#fef08a";
                ctx.fillRect(px + 13, py + 6, 6, 5);
                ctx.fillRect(px + 13, py + 4, 4, 3);
                // White Hot Center
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(px + 14, py + 7, 4, 3);
                // Trailing ember spark
                ctx.fillStyle = "#fbbf24";
                ctx.fillRect(px + 11, py - 2, 2, 2);
              }
            }
          } else if (tile === 13) {
            // Hanging Vines & Foliage (Normal/Moss) or Crystalline Icicles (Ice)
            const isIce = this.state.biome === "ice";
            const hasVineBelow =
              y < this.state.height - 1 &&
              this.state.map[y + 1] &&
              this.state.map[y + 1][x] === 13;
            const hasVineAbove =
              y > 0 && this.state.map[y - 1] && this.state.map[y - 1][x] === 13;

            if (isIce) {
              // High-Detail Crystalline Faceted Icicles
              if (!hasVineAbove) {
                ctx.fillStyle = "#bae6fd";
                ctx.fillRect(px, py, TILE_SIZE + 1, 4);
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(px, py, TILE_SIZE + 1, 1);
              }

              const drawPixelIcicle = (vx: number, baseThick: number, len: number) => {
                let curThick = baseThick;
                let curY = 0;
                while (curY < len && curThick > 0) {
                  ctx.fillStyle = "#0284c7"; // shadow side
                  ctx.fillRect(px + vx, py + 4 + curY, curThick, 4);
                  ctx.fillStyle = "#38bdf8"; // crystal body
                  ctx.fillRect(px + vx, py + 4 + curY, curThick - 1, 4);
                  ctx.fillStyle = "#bae6fd"; // highlight edge
                  ctx.fillRect(px + vx, py + 4 + curY, 1, 4);
                  curY += 4;
                  curThick -= 1;
                }
                // Needle tip sparkle
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(px + vx, py + 4 + curY, 1, 2);
              };

              const h1 = Math.abs(Math.sin(px * 1.1 + py * 1.3));
              const h2 = Math.abs(Math.sin(px * 1.7 + py * 1.9));
              const h3 = Math.abs(Math.sin(px * 2.3 + py * 0.7));

              const bot1 = hasVineBelow ? TILE_SIZE : TILE_SIZE - 4 - h1 * 8;
              const bot2 = hasVineBelow ? TILE_SIZE : TILE_SIZE - 2 - h2 * 6;
              const bot3 = hasVineBelow ? TILE_SIZE : TILE_SIZE - 8 - h3 * 12;

              drawPixelIcicle(3, 5, bot1);
              drawPixelIcicle(13, 6, bot2);
              drawPixelIcicle(23, 5, bot3);
            } else {
              // Serpentine Jungle Vines with Leaf Clusters & Wild Flowers
              const drawVine = (vx: number, waveOffset: number, len: number) => {
                for (let step = 0; step < len; step += 4) {
                  const wave = Math.round(
                    Math.sin(px * 0.12 + py * 0.12 + step * 0.28 + waveOffset) * 2,
                  );
                  // Vine stem
                  ctx.fillStyle = "#14532d";
                  ctx.fillRect(px + vx + wave, py + step, 3, 5);
                  ctx.fillStyle = "#16a34a";
                  ctx.fillRect(px + vx + wave + 1, py + step, 1, 4);

                  // Leaf cluster
                  const leafHash = Math.cos(px * 1.4 + py * 2.3 + step * 1.8 + waveOffset * 3.2);
                  if (leafHash > 0.3) {
                    ctx.fillStyle = "#16a34a";
                    const lDir = leafHash > 0.65 ? -3 : 3;
                    ctx.fillRect(px + vx + wave + lDir, py + step, 4, 3);
                    ctx.fillStyle = "#4ade80"; // sunlit leaf tip
                    ctx.fillRect(px + vx + wave + lDir + (lDir > 0 ? 2 : 0), py + step, 2, 2);

                    // Tiny blooming wild cave flower
                    if (leafHash > 0.82) {
                      const fColor = (step + vx) % 2 === 0 ? "#c084fc" : "#fde047";
                      ctx.fillStyle = fColor;
                      ctx.fillRect(px + vx + wave + lDir * 1.5, py + step + 1, 3, 3);
                      ctx.fillStyle = "#ffffff";
                      ctx.fillRect(px + vx + wave + lDir * 1.5 + 1, py + step + 2, 1, 1);
                    }
                  }
                }
              };

              const h1 = Math.abs(Math.sin(px * 1.1 + py * 1.3));
              const h2 = Math.abs(Math.sin(px * 1.7 + py * 1.9));
              const h3 = Math.abs(Math.sin(px * 2.3 + py * 0.7));

              const bot1 = hasVineBelow ? TILE_SIZE : TILE_SIZE - 4 - h1 * 8;
              const bot2 = hasVineBelow ? TILE_SIZE : TILE_SIZE - 2 - h2 * 6;
              const bot3 = hasVineBelow ? TILE_SIZE : TILE_SIZE - 8 - h3 * 12;

              drawVine(4, 0, bot1);
              drawVine(14, 2.1, bot2);
              drawVine(24, 1.2, bot3);
            }
          }
        }
      }
    }

    // Draw Exit or Diamond
    const ex = this.state.endPos.x;
    const ey = this.state.endPos.y;
    if (this.state.floor < this.state.maxFloor) {
      // High-Detail Medieval Oak Trapdoor Exit
      const px = ex * TILE_SIZE;
      const py = ey * TILE_SIZE;

      // Stone well frame rim with creeping moss
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(px, py + TILE_SIZE - 10, TILE_SIZE + 1, 11);
      ctx.fillStyle = "#475569";
      ctx.fillRect(px, py + TILE_SIZE - 10, TILE_SIZE + 1, 2);
      ctx.fillStyle = "#15803d"; // moss fringe
      ctx.fillRect(px + 4, py + TILE_SIZE - 9, 6, 2);
      ctx.fillRect(px + 20, py + TILE_SIZE - 9, 8, 2);

      // Descending dark abyss hole
      ctx.fillStyle = "#090d16";
      ctx.fillRect(px + 2, py + TILE_SIZE - 8, TILE_SIZE - 4, 9);

      // Wooden ladder rails inside shaft
      ctx.fillStyle = "#78350f";
      ctx.fillRect(px + 7, py + TILE_SIZE - 8, 2, 9);
      ctx.fillRect(px + 23, py + TILE_SIZE - 8, 2, 9);
      ctx.fillStyle = "#b45309";
      ctx.fillRect(px + 9, py + TILE_SIZE - 5, 14, 2);

      // Weathered heavy oak trapdoor hatch propped open
      ctx.fillStyle = "#451a03"; // dark timber back
      ctx.fillRect(px - 3, py - 14, 7, 34);
      ctx.fillStyle = "#78350f"; // wood planks
      ctx.fillRect(px - 2, py - 12, 5, 30);
      ctx.fillStyle = "#b45309"; // wood grain
      ctx.fillRect(px - 1, py - 10, 2, 26);

      // Wrought-iron strap hinges with rivets
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(px - 4, py - 10, 8, 4);
      ctx.fillRect(px - 4, py + 10, 8, 4);
      ctx.fillStyle = "#94a3b8"; // rivet dots
      ctx.fillRect(px - 2, py - 9, 2, 2);
      ctx.fillRect(px - 2, py + 11, 2, 2);

      // Brass ring handle
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(px + 1, py - 2, 2, 6);

      // Descend prompt
      ctx.fillStyle = "#fbcfe8";
      ctx.font = "bold 12px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText("DESCEND", px + 16, py - 18);
    } else if (!this.state.player.hasDiamond) {
      // True Diamond on Carved Ancient Altar Pedestal
      const px = ex * TILE_SIZE;
      const py = ey * TILE_SIZE + Math.sin(Date.now() * 0.005) * 4;

      // Glowing Diamond Core & Shimmer Facets
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(px + 10, py + 4, 12, 4);
      ctx.fillRect(px + 6, py + 8, 20, 6);
      ctx.fillRect(px + 2, py + 14, 28, 8);
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(px + 6, py + 22, 20, 6);
      ctx.fillRect(px + 10, py + 28, 12, 4);
      ctx.fillRect(px + 14, py + 32, 4, 3);

      // Radiant Crystal Specular Highlights
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px + 10, py + 6, 4, 4);
      ctx.fillRect(px + 6, py + 14, 6, 4);
      ctx.fillRect(px + 14, py + 10, 4, 4);
    }

    // Draw Enemies
    for (let e of this.state.enemies) {
      ctx.save();
      ctx.translate(
        Math.round(e.x * zoom) / zoom - e.x,
        Math.round(e.y * zoom) / zoom - e.y,
      ); // ponytail: align enemy model to integer pixel grid in screen space
      ctx.fillStyle =
        e.invulnerableTimer > 0
          ? "#fff"
          : e.type === "bat"
            ? COLORS.bat
            : e.type === "boss"
              ? COLORS.boss
              : e.type === "frost_slime"
                ? "#b0e0e6"
                : e.type === "yeti"
                  ? "#e2e8f0"
                  : e.type === "moss_slime"
                    ? "#1b4a1b"
                    : e.type === "flytrap"
                    ? "#4a1b1b"
                    : e.type === "lava_slime"
                      ? "#f97316"
                      : COLORS.slime;

      if (
        e.type === "slime" ||
        e.type === "frost_slime" ||
        e.type === "moss_slime" ||
        e.type === "lava_slime"
      ) {
        // Clean, Sleek Gelatinous Slime Model (NO EYES, Vibrant Colors)
        const isFrost = e.type === "frost_slime";
        const isMoss = e.type === "moss_slime";
        const isLava = e.type === "lava_slime";

        const baseColor = isFrost ? "#0284c7" : (isMoss ? "#14532d" : (isLava ? "#7f1d1d" : "#6b21a8"));
        const bodyColor = isFrost ? "#38bdf8" : (isMoss ? "#16a34a" : (isLava ? "#f97316" : "#a855f7"));
        const coreColor = isFrost ? "#e0f2fe" : (isMoss ? "#bbf7d0" : (isLava ? "#fef08a" : "#e9d5ff"));

        // Dynamic squish/stretch
        const squish = !e.isGrounded ? -2 : (Math.sin(Date.now() / 150) * 1);
        const sy = e.y + e.h - 16 - squish;
        const sh = 16 + squish;

        // Ground shadow
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(e.x + 2, e.y + e.h - 3, e.w - 4, 3);

        // Translucent Gel Base
        ctx.fillStyle = e.invulnerableTimer > 0 ? "#ffffff" : baseColor;
        ctx.fillRect(e.x + 2, sy + 4, e.w - 4, sh - 4);
        ctx.fillRect(e.x + 4, sy + 2, e.w - 8, sh - 2);

        // Vibrant Main Gel Body
        ctx.fillStyle = e.invulnerableTimer > 0 ? "#ffffff" : bodyColor;
        ctx.fillRect(e.x + 3, sy + 4, e.w - 6, sh - 6);
        ctx.fillRect(e.x + 5, sy + 3, e.w - 10, sh - 4);

        // Inner Glowing Core / Nucleus
        ctx.fillStyle = e.invulnerableTimer > 0 ? "#ffffff" : coreColor;
        ctx.fillRect(e.x + e.w / 2 - 3, sy + sh / 2 - 1, 6, 5);

        // Ember flecks for Lava Slime
        if (isLava && e.invulnerableTimer <= 0) {
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(e.x + 4, sy + 3, 3, 3);
          ctx.fillRect(e.x + e.w - 8, sy + sh - 6, 3, 3);
        }

        // Moss patches for Moss Slime
        if (isMoss && e.invulnerableTimer <= 0) {
          ctx.fillStyle = "#15803d";
          ctx.fillRect(e.x + 4, sy + 3, 5, 3);
          ctx.fillRect(e.x + e.w - 8, sy + sh - 6, 4, 3);
        }

        // Crystalline ice facets for Frost Slime
        if (isFrost && e.invulnerableTimer <= 0) {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillRect(e.x + e.w - 7, sy + 4, 3, 3);
        }

        // Shiny Specular Highlight Sheen
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.fillRect(e.x + 4, sy + 3, 4, 3);
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.fillRect(e.x + 8, sy + 4, 3, 2);
      } else if (e.type === "flytrap") {
        // High-Detail Carnivorous Flytrap Plant Model
        let stretch = 0;
        if (e.aiState === "tracking") {
          stretch = (1 - (e.trackTimer || 45) / 45) * 45;
        } else if (e.aiState === "attacking") {
          stretch = e.stateTimer > 70 ? 90 : (e.stateTimer / 70) * 90;
        }

        const baseX = e.x + 12;
        const baseY = e.y + e.h - 8;
        const targetAngle = Math.atan2(p.y + p.h / 2 - baseY, p.x + p.w / 2 - baseX);
        const headX = baseX + Math.cos(targetAngle) * stretch;
        const headY = baseY + Math.sin(targetAngle) * stretch;

        // Draw Plant Neck / Stem connecting Base to Head
        ctx.strokeStyle = "#14532d";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        ctx.strokeStyle = "#4ade80"; // Light green vein stripe highlight
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(baseX - 1, baseY - 1);
        ctx.lineTo(headX - 1, headY - 1);
        ctx.stroke();

        // Plant Head Assembly
        ctx.save();
        ctx.translate(headX, headY);
        let trackAngle = 0;
        if (e.aiState === "tracking" || e.aiState === "attacking") {
          trackAngle = targetAngle;
          e.facingRight = (p.x + p.w / 2 > headX);
          if (!e.facingRight) {
            trackAngle = Math.atan2(-(p.y + p.h / 2 - headY), -(p.x + p.w / 2 - headX));
          }
        }
        if (!e.facingRight) ctx.scale(-1, 1);
        ctx.rotate(trackAngle);

        const jawOffset = e.aiState === "attacking" ? 8 : (e.aiState === "tracking" ? 3 : 0);

        // Outer Dark Green Leaf Shell
        ctx.fillStyle = e.invulnerableTimer > 0 ? "#fff" : "#14532d";
        ctx.fillRect(-12, -14 - jawOffset, 24, 8);
        ctx.fillRect(-12, -4 + jawOffset, 24, 8);

        // Mid Green Leaf Texture
        ctx.fillStyle = e.invulnerableTimer > 0 ? "#fff" : "#16a34a";
        ctx.fillRect(-10, -13 - jawOffset, 20, 6);
        ctx.fillRect(-10, -3 + jawOffset, 20, 6);

        // Crimson Inner Mouth Trap Cavity
        ctx.fillStyle = e.invulnerableTimer > 0 ? "#fff" : "#991b1b";
        ctx.fillRect(-8, -8 - jawOffset, 16, 3);
        ctx.fillRect(-8, -1 + jawOffset, 16, 3);

        // Sharp Ivory Teeth
        ctx.fillStyle = "#ffffff";
        for (let i = 0; i < 5; i++) {
          ctx.fillRect(-9 + i * 4, -5 - jawOffset, 2, 3);
          ctx.fillRect(-7 + i * 4, -4 + jawOffset, 2, 3);
        }
        ctx.restore();

        // Shaded Base Root Leaves
        ctx.fillStyle = "#14532d";
        ctx.fillRect(e.x + 2, e.y + e.h - 6, 8, 6);
        ctx.fillRect(e.x + 14, e.y + e.h - 6, 8, 6);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(e.x + 3, e.y + e.h - 4, 6, 2);
        ctx.fillRect(e.x + 15, e.y + e.h - 4, 6, 2);
      } else if (e.type === "lava_monster") {
        // Lava Monster: a lumpy blob of molten lava rising from the pool
        const isHitColor = e.invulnerableTimer > 0;
        const ex = e.x;
        const ey = e.y;
        const ew = e.w; // 28
        const eh = e.h; // 20
        const bob = Math.sin(Date.now() * 0.06 + e.x * 0.05) * 2.5;

        // Charred crust shell (lumpy dome)
        ctx.fillStyle = isHitColor ? "#fff" : "#431407";
        ctx.fillRect(ex + 2, ey + 8 + bob, ew - 4, eh - 12);
        ctx.fillRect(ex + 5, ey + 4 + bob, ew - 10, eh - 8);
        ctx.fillRect(ex + 8, ey + 1 + bob, ew - 16, eh - 5);

        // Glowing molten veins splitting the crust
        ctx.fillStyle = isHitColor ? "#fff" : "#f97316";
        ctx.fillRect(ex + 4, ey + 10 + bob, 4, 3);
        ctx.fillRect(ex + 11, ey + 5 + bob, 6, 3);
        ctx.fillRect(ex + 19, ey + 11 + bob, 4, 3);

        // Molten core between cracks (bright)
        ctx.fillStyle = isHitColor ? "#fff" : "#fbbf24";
        ctx.fillRect(ex + 10, ey + 9 + bob, 6, 4);
        ctx.fillRect(ex + 13, ey + 6 + bob, 3, 3);

        // Menacing molten eyes
        ctx.fillStyle = isHitColor ? "#fff" : "#fef08a";
        const eyeX = e.facingRight ? ex + ew - 9 : ex + 4;
        ctx.fillRect(eyeX, ey + 8 + bob, 6, 3);
        ctx.fillRect(eyeX + (e.facingRight ? 0 : 2), ey + 12 + bob, 4, 3);
        ctx.fillStyle = isHitColor ? "#fff" : "#7f1d1d";
        ctx.fillRect(eyeX + (e.facingRight ? 3 : 0), ey + 8 + bob, 2, 3);

        // Dripping lava into the pool
        ctx.fillStyle = isHitColor ? "#fff" : "#f97316";
        ctx.fillRect(ex + 6, ey + eh - 4, 2, 5);
        ctx.fillRect(ex + ew - 9, ey + eh - 3, 2, 4);
      } else if (e.type === "lava_spider") {
        // Lava Spider: ceiling stalker that explodes
        const isHitColor = e.invulnerableTimer > 0;
        const ex = e.x;
        const ey = e.y;
        const ew = e.w; // 18
        const eh = e.h; // 14

        // Legs
        ctx.fillStyle = isHitColor ? "#fff" : "#1c1917";
        ctx.fillRect(ex - 3, ey + 3, 3, 2);
        ctx.fillRect(ex - 3, ey + 8, 3, 2);
        ctx.fillRect(ex + ew, ey + 3, 3, 2);
        ctx.fillRect(ex + ew, ey + 8, 3, 2);

        // Body
        ctx.fillStyle = isHitColor ? "#fff" : "#7f1d1d";
        ctx.fillRect(ex + 1, ey + 2, ew - 2, eh - 4);

        // Lava abdomen core (pulses when beeping)
        const beep = e.aiState === "beeping" && Math.floor(Date.now() / 100) % 2 === 0;
        ctx.fillStyle = isHitColor ? "#fff" : (beep ? "#fb923c" : "#b91c1c");
        ctx.fillRect(ex + 4, ey + 5, ew - 8, 4);

        // Eyes (orange)
        ctx.fillStyle = isHitColor ? "#fff" : "#fef08a";
        ctx.fillRect(ex + 4, ey + 3, 3, 3);
        ctx.fillRect(ex + ew - 7, ey + 3, 3, 3);
      } else if (e.type === "yeti") {
        // High-Detail Yeti Beast (Inspired by reference photo)
        const isHitColor = e.invulnerableTimer > 0;
        const ex = e.x;
        const ey = e.y;
        const ew = e.w; // 32
        const eh = e.h; // 32

        // Ground Shadow
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(ex + 2, ey + eh - 3, ew - 4, 3);

        // Dark Purple/Slate Under-Mantle Shadow
        ctx.fillStyle = isHitColor ? "#ffffff" : "#475569";
        ctx.fillRect(ex + 4, ey + 10, ew - 8, eh - 12);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#334155";
        ctx.fillRect(ex + 6, ey + 14, ew - 12, eh - 16);

        // Broad Shaggy White Fur Torso
        ctx.fillStyle = isHitColor ? "#ffffff" : "#e2e8f0";
        ctx.fillRect(ex + 3, ey + 8, ew - 6, eh - 11);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#ffffff"; // Top fur highlight
        ctx.fillRect(ex + 5, ey + 6, ew - 10, eh - 16);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#cbd5e1"; // Lower fur shading
        ctx.fillRect(ex + 4, ey + eh - 6, ew - 8, 4);

        // Chest Fur Tuft Ridge
        ctx.fillStyle = isHitColor ? "#ffffff" : "#f1f5f9";
        ctx.fillRect(ex + 8, ey + 12, ew - 16, 8);

        // Massive Sweeping Ram Horns (Dark Slate/Indigo with Beveled Highlights)
        ctx.fillStyle = isHitColor ? "#ffffff" : "#1e293b"; // Dark base
        ctx.fillRect(ex - 4, ey - 6, 7, 14);
        ctx.fillRect(ex + ew - 3, ey - 6, 7, 14);

        ctx.fillStyle = isHitColor ? "#ffffff" : "#334155"; // Horn body
        ctx.fillRect(ex - 3, ey - 8, 5, 12);
        ctx.fillRect(ex + ew - 2, ey - 8, 5, 12);

        ctx.fillStyle = isHitColor ? "#ffffff" : "#64748b"; // Horn ridge
        ctx.fillRect(ex - 2, ey - 10, 4, 8);
        ctx.fillRect(ex + ew - 2, ey - 10, 4, 8);

        ctx.fillStyle = isHitColor ? "#ffffff" : "#94a3b8"; // Horn tip highlight
        ctx.fillRect(ex - 1, ey - 11, 2, 4);
        ctx.fillRect(ex + ew - 1, ey - 11, 2, 4);

        // Shaggy White Fur Collar Over Horn Base
        ctx.fillStyle = isHitColor ? "#ffffff" : "#ffffff";
        ctx.fillRect(ex + 2, ey + 2, ew - 4, 6);
        ctx.fillRect(ex + 4, ey, ew - 8, 4);

        // Dark Face Visor Socket
        ctx.fillStyle = isHitColor ? "#ffffff" : "#0f172a";
        ctx.fillRect(ex + 7, ey + 5, ew - 14, 7);

        // Fierce Glowing Orange/Crimson Eyes
        ctx.fillStyle = isHitColor ? "#ffffff" : "#f97316";
        const eyeX = e.facingRight ? ex + 14 : ex + 9;
        ctx.fillRect(eyeX, ey + 6, 4, 3);
        ctx.fillRect(eyeX + (e.facingRight ? 5 : -5), ey + 6, 4, 3);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#ef4444";
        ctx.fillRect(eyeX + 1, ey + 7, 2, 1);
        ctx.fillRect(eyeX + (e.facingRight ? 6 : -4), ey + 7, 2, 1);

        // Wide Menacing Jaw Line & Ivory Teeth
        ctx.fillStyle = isHitColor ? "#ffffff" : "#fef08a";
        ctx.fillRect(ex + 9, ey + 10, ew - 18, 3);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#0f172a";
        ctx.fillRect(ex + 11, ey + 11, 1, 2);
        ctx.fillRect(ex + 15, ey + 11, 1, 2);
        ctx.fillRect(ex + 19, ey + 11, 1, 2);

        // Heavy Furry Arms & Slate Claws
        ctx.fillStyle = isHitColor ? "#ffffff" : "#cbd5e1";
        if (e.aiState === "leaping") {
          ctx.fillRect(ex - 5, ey - 4, 6, 20);
          ctx.fillRect(ex + ew - 1, ey - 4, 6, 20);
          ctx.fillStyle = isHitColor ? "#ffffff" : "#334155";
          ctx.fillRect(ex - 6, ey - 6, 4, 4);
          ctx.fillRect(ex + ew + 1, ey - 6, 4, 4);
        } else {
          ctx.fillRect(ex - 4, ey + 10, 6, 18);
          ctx.fillRect(ex + ew - 2, ey + 10, 6, 18);
          ctx.fillStyle = isHitColor ? "#ffffff" : "#334155";
          ctx.fillRect(ex - 5, ey + 24, 4, 5);
          ctx.fillRect(ex + ew + 1, ey + 24, 4, 5);
        }
      } else if (e.type === "bat") {
        // High-Detail Winged Bat Model
        const isHitColor = e.invulnerableTimer > 0;
        const bx = e.x + e.w / 2;
        const by = e.y + e.h / 2;
        const flap = Math.floor(Date.now() / 120) % 2 === 0;

        // Furry Dark Purple Torso
        ctx.fillStyle = isHitColor ? "#fff" : "#3b0764";
        ctx.fillRect(bx - 5, by - 6, 10, 12);
        ctx.fillStyle = isHitColor ? "#fff" : "#581c87";
        ctx.fillRect(bx - 3, by - 4, 6, 8);

        // Pointed Bat Ears
        ctx.fillStyle = isHitColor ? "#fff" : "#7e22ce";
        ctx.fillRect(bx - 5, by - 9, 3, 4);
        ctx.fillRect(bx + 2, by - 9, 3, 4);

        // Glowing Crimson Eyes
        ctx.fillStyle = isHitColor ? "#fff" : "#ef4444";
        ctx.fillRect(bx - 3, by - 3, 2, 2);
        ctx.fillRect(bx + 1, by - 3, 2, 2);

        // Ivory Fangs
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(bx - 2, by + 1, 1, 2);
        ctx.fillRect(bx + 1, by + 1, 1, 2);

        // Layered Wings with Bone Ribs
        ctx.fillStyle = isHitColor ? "#fff" : "#6b21a8";
        if (flap) {
          ctx.fillRect(bx - 14, by - 8, 9, 8);
          ctx.fillRect(bx + 5, by - 8, 9, 8);
          ctx.fillStyle = isHitColor ? "#fff" : "#a855f7";
          ctx.fillRect(bx - 12, by - 6, 7, 5);
          ctx.fillRect(bx + 5, by - 6, 7, 5);
          ctx.fillStyle = "#e9d5ff";
          ctx.fillRect(bx - 14, by - 8, 9, 1);
          ctx.fillRect(bx + 5, by - 8, 9, 1);
        } else {
          ctx.fillRect(bx - 14, by - 2, 9, 8);
          ctx.fillRect(bx + 5, by - 2, 9, 8);
          ctx.fillStyle = isHitColor ? "#fff" : "#a855f7";
          ctx.fillRect(bx - 12, by, 7, 5);
          ctx.fillRect(bx + 5, by, 7, 5);
          ctx.fillStyle = "#e9d5ff";
          ctx.fillRect(bx - 14, by + 5, 9, 1);
          ctx.fillRect(bx + 5, by + 5, 9, 1);
        }
      } else if (e.type === "boss") {
        // High-Detail Cavern Titan Golem Boss Model (80x80)
        const isHitColor = e.invulnerableTimer > 0;
        const isEnraged = e.health < e.maxHealth * 0.5;

        // Ground Shadow
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(e.x + 4, e.y + e.h - 6, e.w - 8, 6);

        // Heavy Chiseled Obsidian Base Body
        ctx.fillStyle = isHitColor ? "#ffffff" : (isEnraged ? "#450a0a" : "#0f172a");
        ctx.fillRect(e.x + 6, e.y + 10, e.w - 12, e.h - 18);

        // Beveled Slate Armor Plates
        ctx.fillStyle = isHitColor ? "#ffffff" : "#1e293b";
        ctx.fillRect(e.x + 10, e.y + 14, e.w - 20, e.h - 24);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#334155";
        ctx.fillRect(e.x + 14, e.y + 18, e.w - 28, e.h - 32);

        // Plate Edge Bevel Highlights
        ctx.fillStyle = isHitColor ? "#ffffff" : "#64748b";
        ctx.fillRect(e.x + 10, e.y + 14, e.w - 20, 2);
        ctx.fillRect(e.x + 10, e.y + 14, 2, e.h - 24);

        // Molten Magma Core (Chest Chamber with Pulsating Cracks)
        const corePulse = Math.sin(Date.now() / 150) * 0.25 + 0.75;
        ctx.fillStyle = isHitColor ? "#ffffff" : `rgba(234, 88, 12, ${corePulse})`;
        ctx.fillRect(e.x + e.w / 2 - 14, e.y + 22, 28, 22);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#f97316";
        ctx.fillRect(e.x + e.w / 2 - 8, e.y + 26, 16, 14);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#fef08a";
        ctx.fillRect(e.x + e.w / 2 - 4, e.y + 30, 8, 6);

        // Ancient Rune Crown over Head
        ctx.fillStyle = isHitColor ? "#ffffff" : "#38bdf8";
        ctx.fillRect(e.x + e.w / 2 - 16, e.y + 4, 32, 4);
        ctx.fillRect(e.x + e.w / 2 - 12, e.y + 2, 24, 2);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#7dd3fc";
        ctx.fillRect(e.x + e.w / 2 - 10, e.y + 2, 4, 2);
        ctx.fillRect(e.x + e.w / 2 + 6, e.y + 2, 4, 2);

        // Massive Stone Shoulder Pauldrons
        ctx.fillStyle = isHitColor ? "#ffffff" : "#475569";
        ctx.fillRect(e.x - 6, e.y + 8, 18, 22);
        ctx.fillRect(e.x + e.w - 12, e.y + 8, 18, 22);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#94a3b8";
        ctx.fillRect(e.x - 6, e.y + 8, 18, 3);
        ctx.fillRect(e.x + e.w - 12, e.y + 8, 18, 3);

        // Heavy Fists with Knuckle Ridges
        const fistBob = Math.sin(Date.now() / 100) * 3;
        ctx.fillStyle = isHitColor ? "#ffffff" : "#1e293b";
        ctx.fillRect(e.x - 8, e.y + 32 + fistBob, 16, 20);
        ctx.fillRect(e.x + e.w - 8, e.y + 32 - fistBob, 16, 20);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#64748b";
        ctx.fillRect(e.x - 8, e.y + 48 + fistBob, 16, 4);
        ctx.fillRect(e.x + e.w - 8, e.y + 48 - fistBob, 16, 4);

        // Glowing Fiery Eyes
        ctx.fillStyle = isHitColor ? "#ffffff" : (isEnraged ? "#ef4444" : "#f59e0b");
        const eyeX = e.facingRight ? e.x + e.w / 2 + 6 : e.x + e.w / 2 - 14;
        ctx.fillRect(eyeX, e.y + 14, 8, 4);
        ctx.fillRect(eyeX + (e.facingRight ? 12 : -12), e.y + 14, 8, 4);
      } else if (e.type === "frost_knight") {
        // Frost Knight Castle Guard (Solid Ice Armor, Cyan Shield, Frost Spear)
        const isHitColor = e.invulnerableTimer > 0;
        ctx.fillStyle = isHitColor ? "#fff" : "#0284c7"; // Ice Plate Armor
        ctx.fillRect(e.x + 2, e.y + 4, e.w - 4, e.h - 4);
        ctx.fillStyle = isHitColor ? "#fff" : "#38bdf8"; // Cyan Runes
        ctx.fillRect(e.x + 6, e.y + 8, e.w - 12, 4);
        ctx.fillStyle = isHitColor ? "#fff" : "#e0f2fe"; // Helm Visor
        const eyeX = e.facingRight ? e.x + e.w - 10 : e.x + 4;
        ctx.fillRect(eyeX, e.y + 6, 6, 2);
      } else if (e.type === "inferno_knight") {
        // Inferno Knight Castle Guard (Heated Magma Armor & Fiery Blade)
        const isHitColor = e.invulnerableTimer > 0;
        ctx.fillStyle = isHitColor ? "#fff" : "#7f1d1d"; // Dark Magma Plate
        ctx.fillRect(e.x + 2, e.y + 4, e.w - 4, e.h - 4);
        ctx.fillStyle = isHitColor ? "#fff" : "#ea580c"; // Burning Core
        ctx.fillRect(e.x + 6, e.y + 8, e.w - 12, 4);
        ctx.fillStyle = isHitColor ? "#fff" : "#fef08a"; // Visor
        const eyeX = e.facingRight ? e.x + e.w - 10 : e.x + 4;
        ctx.fillRect(eyeX, e.y + 6, 6, 2);
      }

      // Status Effects Overlay: Frozen Ice Shell
      if (e.isFrozen) {
        ctx.fillStyle = "rgba(56, 189, 248, 0.40)";
        ctx.fillRect(e.x - 2, e.y - 2, e.w + 4, e.h + 4);
        ctx.strokeStyle = "#e0f2fe";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(e.x - 2, e.y - 2, e.w + 4, e.h + 4);
        // Crystal glints at corners
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(e.x - 2, e.y - 2, 2, 2);
        ctx.fillRect(e.x + e.w, e.y - 2, 2, 2);
      }

      // Status Effects Overlay: Burning Fire Tongues
      if (e.burnTimer && e.burnTimer > 0) {
        const flameAnim = Math.floor(Date.now() / 80) % 3;
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(e.x + 2, e.y - 4 + (flameAnim === 0 ? -2 : 0), e.w - 4, 4);
        ctx.fillStyle = "#f97316";
        ctx.fillRect(e.x + 4, e.y - 6 + (flameAnim === 1 ? -2 : 0), e.w - 8, 4);
        ctx.fillStyle = "#fef08a";
        ctx.fillRect(e.x + e.w / 2 - 2, e.y - 7 + (flameAnim === 2 ? -2 : 0), 4, 3);
      }

      // Draw Enemy Health Bar (for all enemies)
      if (e.health < e.maxHealth || e.type === "boss") {
        ctx.save();
        const barWidth = e.w;
        const barHeight = 4;
        const barX = e.x;
        const barY = e.y - 14;

        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

        ctx.fillStyle = "#ef4444";
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(barX, barY, barWidth * Math.max(0, e.health / e.maxHealth), barHeight);

        ctx.font = "bold 8px 'Courier New', Courier, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        const hpText = `${Math.round(e.health)}/${Math.round(e.maxHealth)}`;
        ctx.fillText(hpText, barX + barWidth / 2, barY - 4);
        ctx.restore();
      }

      ctx.restore();
    }

    // Render player afterimage trail
    this.drawAfterimages();

    // Draw Legacy Knight Player Model
    ctx.save();
    ctx.translate(
      Math.round(p.x * zoom) / zoom - p.x,
      Math.round(p.y * zoom) / zoom - p.y,
    ); // ponytail: align player model to integer pixel grid in screen space

    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;

    ctx.translate(cx, cy);
    if (!p.facingRight) {
      ctx.scale(-1, 1);
    }
    ctx.translate(-cx, -cy);

    const isMoving = Math.abs(p.vx) > 0.5 && p.isGrounded;
    const bob = isMoving ? Math.round(Math.sin(Date.now() / 50) * 2) : 0;
    const isHit =
      p.invulnerableTimer > 0 && Math.floor(Date.now() / 100) % 2 === 0;

    const accentColor = p.playerColor || "#ea580c";

    // 1. Legacy Knight Body Armor (Iron breastplate + gold pauldrons)
    ctx.fillStyle = isHit ? COLORS.playerHit : "#475569"; // Iron dark base
    ctx.fillRect(p.x + 3, p.y + 9 + bob, p.w - 6, p.h - 13);

    ctx.fillStyle = isHit ? COLORS.playerHit : "#94a3b8"; // Polished steel plate
    ctx.fillRect(p.x + 5, p.y + 10 + bob, p.w - 10, p.h - 16);

    // Gold shoulder pauldrons
    ctx.fillStyle = isHit ? COLORS.playerHit : "#fbbf24";
    ctx.fillRect(p.x + 2, p.y + 9 + bob, 3, 4);
    ctx.fillRect(p.x + p.w - 5, p.y + 9 + bob, 3, 4);

    // Leather belt with gold buckle
    ctx.fillStyle = "#78350f";
    ctx.fillRect(p.x + 4, p.y + 16 + bob, p.w - 8, 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(p.x + p.w / 2 - 2, p.y + 16 + bob, 4, 2);

    // 2. Legacy Great-Helm (Classic T-Visor Helmet)
    ctx.fillStyle = isHit ? COLORS.playerHit : "#cbd5e1"; // Bright steel helm
    ctx.fillRect(p.x + 2, p.y + bob, p.w - 4, 13);
    ctx.fillStyle = isHit ? COLORS.playerHit : "#64748b"; // Helm rim shadow
    ctx.fillRect(p.x + 2, p.y + 11 + bob, p.w - 4, 2);

    // Classic T-Visor slit
    ctx.fillStyle = "#0f172a"; // Dark T-slit
    ctx.fillRect(p.x + 8, p.y + 4 + bob, p.w - 9, 3); // Horizontal eye slit
    ctx.fillRect(p.x + 13, p.y + 4 + bob, 3, 6);      // Vertical nose slit

    // Bow Charge Progress Bar / Glowing Indicator
    if (p.weapon === 'bow' && (p.bowChargeTimer || 0) > 0) {
      const chargeRatio = Math.min(1.0, (p.bowChargeTimer || 0) / 30);
      const cx = p.x + p.w / 2;
      const cy = p.y - 14;

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(cx - 16, cy, 32, 6);

      ctx.fillStyle = chargeRatio >= 1.0 ? "#f59e0b" : "#38bdf8";
      ctx.fillRect(cx - 15, cy + 1, Math.round(30 * chargeRatio), 4);
    }

    // 3. Sabatons / Iron Boots
    ctx.fillStyle = isHit ? COLORS.playerHit : "#334155";
    const legOffset = isMoving ? Math.sin(Date.now() / 50) * 3 : 0;
    ctx.fillRect(p.x + 4, p.y + p.h - 4, 5, 4 - legOffset);
    ctx.fillRect(p.x + p.w - 9, p.y + p.h - 4, 5, 4 + legOffset);
    ctx.fillStyle = isHit ? COLORS.playerHit : "#94a3b8"; // Iron toe caps
    ctx.fillRect(p.x + 4, p.y + p.h - 2, 4, 2);
    ctx.fillRect(p.x + p.w - 9, p.y + p.h - 2, 4, 2);

    // Draw Player Status Auras & Shields
    if (p.shieldActive) {
      ctx.save();
      const sRadius = 22 + Math.sin(Date.now() * 0.008) * 1.5;
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h / 2 + bob, sRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56, 189, 248, 0.20)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(186, 230, 253, 0.85)";
      ctx.stroke();

      // Orbiting celestial rune glints
      const oAngle = (Date.now() * 0.004) % (Math.PI * 2);
      for (let s = 0; s < 3; s++) {
        const sa = oAngle + (s * Math.PI * 2) / 3;
        const sx = p.x + p.w / 2 + Math.cos(sa) * sRadius;
        const sy = p.y + p.h / 2 + bob + Math.sin(sa) * sRadius;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
      }
      ctx.restore();
    }

    if (p.fireImmunityTimer && p.fireImmunityTimer > 0) {
      ctx.save();
      const fRadius = 20 + Math.sin(Date.now() * 0.01) * 1.0;
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h / 2 + bob, fRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(249, 115, 22, 0.18)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(251, 191, 36, 0.75)";
      ctx.stroke();
      ctx.restore();
    }

    if (p.burnTimer && p.burnTimer > 0) {
      const flameCycle = Math.floor(Date.now() / 80) % 3;
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(p.x + 3, p.y - 4 + bob + (flameCycle === 0 ? -2 : 0), p.w - 6, 4);
      ctx.fillStyle = "#f97316";
      ctx.fillRect(p.x + 5, p.y - 6 + bob + (flameCycle === 1 ? -2 : 0), p.w - 10, 4);
      ctx.fillStyle = "#fef08a";
      ctx.fillRect(p.x + p.w / 2 - 2, p.y - 7 + bob + (flameCycle === 2 ? -2 : 0), 4, 3);
    }

    if (p.clawsActive) {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(p.x + p.w - 2, p.y + 8 + bob, 8, 2);
      ctx.fillRect(p.x + p.w, p.y + 11 + bob, 8, 2);
      ctx.fillRect(p.x + p.w - 2, p.y + 14 + bob, 8, 2);
    } else if (p.weaponEquipped) {
      if (p.weapon === "colossal_sword") {
        ctx.fillStyle = isHit ? COLORS.playerHit : "#94a3b8";
        ctx.fillRect(p.x + p.w - 3, p.y - 12 + bob, 6, 24);
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(p.x + p.w - 6, p.y + 10 + bob, 12, 4);
        ctx.fillStyle = "#78350f";
        ctx.fillRect(p.x + p.w - 2, p.y + 14 + bob, 4, 6);
      } else if (p.weapon === "dual_daggers") {
        ctx.fillStyle = isHit ? COLORS.playerHit : "#cbd5e1";
        ctx.fillRect(p.x - 4, p.y + 6 + bob, 3, 6);
        ctx.fillStyle = "#ea580c";
        ctx.fillRect(p.x - 5, p.y + 12 + bob, 5, 2);

        ctx.fillStyle = isHit ? COLORS.playerHit : "#cbd5e1";
        ctx.fillRect(p.x + p.w - 1, p.y + 8 + bob, 3, 6);
        ctx.fillStyle = "#ea580c";
        ctx.fillRect(p.x + p.w - 2, p.y + 14 + bob, 5, 2);
      } else if (p.weapon === "bow") {
        const px = p.x + p.w / 2;
        const py = p.y + p.h / 2;
        const dx = this.state.mouse.worldX - px;
        const dy = this.state.mouse.worldY - py;
        const angle = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(px, py + bob);
        ctx.rotate(angle);

        ctx.fillStyle = "#b45309";
        if (p.isAttacking && p.attackTimer > 0) {
          ctx.fillRect(4, -8, 3, 2);
          ctx.fillRect(6, -6, 3, 2);
          ctx.fillRect(8, -4, 3, 8);
          ctx.fillRect(6, 4, 3, 2);
          ctx.fillRect(4, 6, 3, 2);
          
          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(-2, -8, 2, 2);
          ctx.fillRect(-4, -6, 2, 2);
          ctx.fillRect(-6, -4, 2, 8);
          ctx.fillRect(-4, 4, 2, 2);
          ctx.fillRect(-2, 6, 2, 2);
          
          ctx.fillStyle = "#78350f";
          ctx.fillRect(-6, -1, 14, 2);
          ctx.fillStyle = "#10b981";
          ctx.fillRect(-8, -2, 2, 4);
          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(8, -2, 3, 4);
        } else {
          ctx.fillRect(4, -8, 2, 2);
          ctx.fillRect(6, -6, 2, 2);
          ctx.fillRect(8, -4, 2, 8);
          ctx.fillRect(6, 4, 2, 2);
          ctx.fillRect(4, 6, 2, 2);
          
          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(2, -8, 2, 18);
        }
        ctx.restore();
      } else if (p.weapon === "mace") {
        const maceX = p.x + p.w - 2;
        const maceY = p.y + 2 + bob;
        
        ctx.save();
        ctx.translate(maceX + 4, maceY + 12);
        if (p.maceChargeTimer > 0) {
          const shake = (Math.random() - 0.5) * (p.maceChargeTimer / 30);
          ctx.translate(shake, shake);
          ctx.rotate(-Math.PI * 0.25);
        }
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-2, -2, 4, 14);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(-6, -10, 12, 8);
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(-4, -8, 8, 4);
        if (p.maceChargeTimer > 0) {
          ctx.fillStyle = "rgba(251, 191, 36, 0.4)";
          ctx.fillRect(-8, -12, 16, 12);
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-1, -12, 2, 2);
        ctx.fillRect(-8, -7, 2, 2);
        ctx.fillRect(6, -7, 2, 2);
        ctx.restore();
      } else if (p.weapon === "battle_axe") {
        const axeX = p.x + p.w - 2;
        const axeY = p.y + bob;
        
        ctx.save();
        ctx.translate(axeX + 4, axeY + 12);
        if (p.axeSpinTimer > 0) {
          const spinAngle = (25 - p.axeSpinTimer) * Math.PI * 0.4;
          ctx.rotate(spinAngle);
        }
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-1.5, -6, 3, 20);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(-8, -6, 16, 6);
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(-9, -7, 3, 8);
        ctx.fillRect(6, -7, 3, 8);
        ctx.restore();
      } else if (p.weapon === "molten_axe") {
        const axeX = p.x + p.w - 2;
        const axeY = p.y + bob;
        
        ctx.save();
        ctx.translate(axeX + 4, axeY + 12);
        ctx.fillStyle = "#1c1917"; // Obsidian haft
        ctx.fillRect(-2, -8, 4, 24);
        ctx.fillStyle = "#fbbf24"; // Gold ring
        ctx.fillRect(-2.5, 4, 5, 2);
        ctx.fillStyle = "#7f1d1d"; // Dark magma blade base
        ctx.fillRect(-10, -10, 20, 6);
        ctx.fillStyle = "#ea580c"; // Burning blade body
        ctx.fillRect(-12, -12, 4, 10);
        ctx.fillRect(8, -12, 4, 10);
        ctx.fillStyle = "#fef08a"; // Molten hot glowing edge
        ctx.fillRect(-13, -11, 2, 8);
        ctx.fillRect(11, -11, 2, 8);
        ctx.restore();
      } else if (p.weapon === "frozen_sword") {
        const sx = p.facingRight ? p.x + p.w - 2 : p.x - 2;
        const sy = p.y + bob;
        ctx.save();
        ctx.translate(sx + 2, sy + 8);
        if (!p.facingRight) ctx.scale(-1, 1);
        ctx.fillStyle = "#e0f2fe";
        ctx.fillRect(-1, -15, 2, 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(-3, -13, 6, 14);
        ctx.fillStyle = "#7dd3fc";
        ctx.fillRect(-1, -13, 2, 14);
        ctx.fillStyle = "#0284c7";
        ctx.fillRect(-7, 1, 14, 3);
        ctx.fillStyle = "#0369a1";
        ctx.fillRect(-2, 4, 4, 5);
        ctx.fillStyle = "#e0f2fe";
        ctx.fillRect(-3, 9, 6, 2);
        ctx.restore();
      } else if (p.weapon === "lava_flask") {
        const flaskX = p.x + p.w - 2;
        const flaskY = p.y + 4 + bob;
        ctx.save();
        ctx.translate(flaskX + 2, flaskY);
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-1.5, -6, 3, 2);
        ctx.fillStyle = "#ea580c";
        ctx.fillRect(-4, -4, 8, 8);
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(-3, -3, 6, 6);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillRect(-2, -2, 2, 2);
        ctx.restore();
      } else if (p.weapon === "magma_orb") {
        const orbX = p.x + p.w - 2;
        const orbY = p.y + 4 + bob;
        ctx.save();
        ctx.translate(orbX + 2, orbY);
        ctx.fillStyle = "#1c1917";
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ea580c";
        ctx.fillRect(-2, -2, 4, 4);
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      } else if (p.weapon === "torch") {
        const torchX = p.x + p.w - 2;
        const torchY = p.y + bob;
        
        ctx.save();
        ctx.translate(torchX + 4, torchY + 12);
        ctx.rotate(Math.PI * 0.15);
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-1.5, -4, 3, 14);
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(-2.5, -5, 5, 2);
        const flameCycle = Math.floor(Date.now() / 100) % 3;
        ctx.fillStyle = "#f97316";
        ctx.fillRect(-3, -10, 6, 5);
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(-1.5, -8, 3, 3);
        if (flameCycle === 0) {
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(-1.5, -12, 3, 2);
        } else if (flameCycle === 1) {
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(0, -11, 2, 2);
        } else {
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(-2, -11, 2, 2);
        }
        ctx.restore();
      } else {
        // Custom Broadsword Model held by player (matching pixil-frame-0 (2).png)
        const gemColor = p.playerColor || "#ea580c";
        const sx = p.facingRight ? p.x + p.w - 2 : p.x - 2;
        const sy = p.y + bob;

        ctx.save();
        ctx.translate(sx + 2, sy + 8);
        if (!p.facingRight) ctx.scale(-1, 1);

        // Blade Tip (Specular Peak)
        ctx.fillStyle = isHit ? COLORS.playerHit : "#f8fafc";
        ctx.fillRect(-1, -15, 2, 2);

        // Blade Left (Light Highlight)
        ctx.fillStyle = isHit ? COLORS.playerHit : "#f1f5f9";
        ctx.fillRect(-3, -13, 3, 14);

        // Blade Center Ridge (Fuller)
        ctx.fillStyle = isHit ? COLORS.playerHit : "#cbd5e1";
        ctx.fillRect(0, -13, 1, 14);

        // Blade Right (Shaded Edge)
        ctx.fillStyle = isHit ? COLORS.playerHit : "#94a3b8";
        ctx.fillRect(1, -13, 2, 14);

        // Winged Crossguard
        ctx.fillStyle = isHit ? COLORS.playerHit : "#e2e8f0";
        ctx.fillRect(-7, 1, 14, 3);
        ctx.fillStyle = isHit ? COLORS.playerHit : "#64748b";
        ctx.fillRect(-7, 4, 14, 1);

        // Center Gem Housing & Player Color Gem
        ctx.fillStyle = isHit ? COLORS.playerHit : "#ffffff";
        ctx.fillRect(-3, -1, 6, 5);
        ctx.fillStyle = isHit ? COLORS.playerHit : gemColor;
        ctx.fillRect(-2, 0, 4, 3);
        ctx.fillStyle = "#ffffff"; // Top-left specular dot
        ctx.fillRect(-2, 0, 1, 1);

        // Leather Handle / Grip
        ctx.fillStyle = isHit ? COLORS.playerHit : "#78350f";
        ctx.fillRect(-2, 5, 4, 5);
        ctx.fillStyle = isHit ? COLORS.playerHit : "#451a03";
        ctx.fillRect(0, 5, 2, 5);

        // Diamond Steel Pommel & Gem Dot
        ctx.fillStyle = isHit ? COLORS.playerHit : "#cbd5e1";
        ctx.fillRect(-3, 10, 6, 2);
        ctx.fillStyle = isHit ? COLORS.playerHit : gemColor;
        ctx.fillRect(-1, 10, 2, 2);

        ctx.restore();
      }
    }
    ctx.restore();

    // Draw 6-frame chunky pixel-art stretched arch slash animation if attacking
    if (p.isAttacking && p.weapon !== "bow") {
      const duration = p.weapon === "colossal_sword" ? 20 : (p.weapon === "dual_daggers" ? 6 : (p.weapon === "molten_axe" ? 14 : 10));
      const progress = Math.max(0, Math.min(0.999, 1 - p.attackTimer / duration));
      const dir = p.facingRight ? 1 : -1;
      let ox = p.facingRight ? p.x + p.w : p.x;
      let oy = p.y + p.h / 2 - 4;

      ox = Math.round(ox * zoom) / zoom;
      oy = Math.round(oy * zoom) / zoom;

      ctx.save();
      ctx.translate(ox, oy);

      // Rotate slash directly toward cursor angle if available
      if (p.attackAngle !== undefined) {
        ctx.rotate(p.attackAngle);
      } else if (dir === -1) {
        ctx.scale(-1, 1);
      }

      if (p.slashFlipped) {
        ctx.scale(1, -1);
      }

      const PIX = 2; // 2x2 retro chunky pixel art grid

      // 6 Discrete Handcrafted Frames of a Stretched Forward Katana Arch
      const frameIndex = Math.min(5, Math.floor(progress * 6));
      const FRAMES = [
        // Frame 0: Quick opening spark wedge
        { hH: 10, fwd: 16, thick: 6, bowCurve: 1.4, alpha: 0.9 },
        // Frame 1: Expanding forward stretched razor arch
        { hH: 18, fwd: 30, thick: 9, bowCurve: 1.6, alpha: 1.0 },
        // Frame 2: Maximum peak power lunge! Stretched aerodynamic arch with needle ends
        { hH: 26, fwd: 46, thick: 13, bowCurve: 1.8, alpha: 1.0 },
        // Frame 3: Sweeping follow-through stretched arch drifting forward
        { hH: 22, fwd: 48, thick: 9, bowCurve: 1.7, alpha: 0.85 },
        // Frame 4: Thinning energy ribbon
        { hH: 16, fwd: 50, thick: 6, bowCurve: 1.5, alpha: 0.60 },
        // Frame 5: Fading wispy pixel embers
        { hH: 10, fwd: 52, thick: 3, bowCurve: 1.3, alpha: 0.30 },
      ];

      const f = FRAMES[frameIndex];
      const wScale = p.clawsActive ? 1.15 : (p.weapon === "colossal_sword" ? 1.45 : (p.weapon === "dual_daggers" ? 0.85 : (p.weapon === "molten_axe" ? 1.20 : 1.0)));
      const halfH = Math.round((f.hH * wScale) / PIX) * PIX;
      const fwd = Math.round((f.fwd * wScale) / PIX) * PIX;
      const maxThick = Math.round((f.thick * wScale) / PIX) * PIX;

      // Color palettes (Outer / Mid / Core)
      let outerColor = "#c084fc"; // soft purple
      let midColor = "#f3e8ff"; // bright lavender
      let coreColor = "#ffffff"; // pure white

      if (p.clawsActive) {
        outerColor = "#990000";
        midColor = "#ff3300";
        coreColor = "#ffffff";
      } else if (p.weapon === "molten_axe") {
        outerColor = "#ea580c";
        midColor = "#f97316";
        coreColor = "#fef08a";
      } else if (p.weapon === "frozen_sword") {
        outerColor = "#0284c7";
        midColor = "#38bdf8";
        coreColor = "#f0f9ff";
      }

      ctx.globalAlpha = f.alpha;

      const drawPixelArch = (yOffset: number, scaleX: number, thickMulti: number) => {
        for (let y = -halfH; y <= halfH; y += PIX) {
          const v = halfH > 0 ? y / halfH : 0; // -1 to 1
          const curve = Math.max(0, 1 - Math.pow(Math.abs(v), f.bowCurve));
          const archX = Math.round((curve * fwd * scaleX) / PIX) * PIX;
          const th = Math.max(PIX, Math.round(((1 - Math.pow(Math.abs(v), 2.2)) * maxThick * thickMulti) / PIX) * PIX);
          const drawY = y + yOffset;

          const startX = archX - Math.floor(th / 2);
          const endX = archX + Math.floor(th / 2);

          // 3-Tone Pixel Shading for authentic arcade pixel art
          for (let x = startX; x <= endX; x += PIX) {
            const distFromCenter = Math.abs(x - archX);
            const normDist = th > PIX ? distFromCenter / (th / 2) : 0;

            if (normDist < 0.35) {
              ctx.fillStyle = coreColor;
            } else if (normDist < 0.75) {
              ctx.fillStyle = midColor;
            } else {
              ctx.fillStyle = outerColor;
            }
            ctx.fillRect(x, drawY, PIX, PIX);
          }
        }
      };

      if (p.clawsActive) {
        // Triple parallel razor pixel claws
        drawPixelArch(-8, 0.95, 0.65);
        drawPixelArch(0, 1.0, 0.75);
        drawPixelArch(8, 0.95, 0.65);
      } else {
        drawPixelArch(0, 1.0, 1.0);
      }

      // Trailing Pixel Sparks on Peak Frames 1, 2, 3
      if (frameIndex >= 1 && frameIndex <= 3) {
        ctx.fillStyle = coreColor;
        const sparkCount = p.weapon === "colossal_sword" ? 6 : 3;
        for (let s = 0; s < sparkCount; s++) {
          const sy = Math.round(((Math.random() - 0.5) * halfH * 1.5) / PIX) * PIX;
          const v = halfH > 0 ? sy / halfH : 0;
          const curve = Math.max(0, 1 - Math.pow(Math.abs(v), f.bowCurve));
          const sx = Math.round((curve * fwd + (Math.random() * 8 + 2)) / PIX) * PIX;
          ctx.fillRect(sx, sy, PIX, PIX);
        }
      }

      ctx.restore();
    }

    // 360 Saturn-Ring Horizontal Wind Effect for Battle Axe Spin
    if (p.weapon === "battle_axe" && p.axeSpinTimer > 0) {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2 + 4;
      const spinProgress = (25 - p.axeSpinTimer) / 25;
      const baseAngle = spinProgress * Math.PI * 4;

      ctx.save();
      ctx.translate(cx, cy);

      // Saturn Ring flattening: wide horizontal X, flattened Y
      ctx.scale(2.2, 0.55);

      const ringRadius = 24;
      const ringThick = 6;

      // Outer wind aura
      ctx.fillStyle = "rgba(226, 232, 240, 0.35)";
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius + 5, 0, Math.PI * 2);
      ctx.arc(0, 0, Math.max(1, ringRadius - 5), 0, Math.PI * 2, true);
      ctx.fill();

      // Glowing Saturn Wind Ring Slashes (360 degrees horizontal loop around waist)
      ctx.fillStyle = "#ffffff";
      for (let arc = 0; arc < 3; arc++) {
        const aStart = baseAngle + (arc * Math.PI * 2) / 3;
        const aEnd = aStart + Math.PI * 0.9;

        const PIX = 3;
        const steps = 30;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const angle = aStart + (aEnd - aStart) * t;
          const thick = Math.sin(t * Math.PI) * ringThick;
          const px = Math.cos(angle) * ringRadius;
          const py = Math.sin(angle) * ringRadius;

          ctx.fillRect(px - thick / 2, py - thick / 2, thick + PIX, thick + PIX);
        }
      }

      // Wind dust / spark particles along the 360 ring
      ctx.fillStyle = "#cbd5e1";
      for (let s = 0; s < 6; s++) {
        const sa = baseAngle + s * 1.05;
        const sx = Math.cos(sa) * (ringRadius + (s % 2 === 0 ? 4 : -4));
        const sy = Math.sin(sa) * (ringRadius + (s % 2 === 0 ? 4 : -4));
        ctx.fillRect(sx, sy, 3, 3);
      }

      ctx.restore();
    }

    // Falling Icicles
    if (this.state.fallingIcicles) {
      for (const icicle of this.state.fallingIcicles) {
        if (icicle.state === "broken") continue;

        const px = icicle.x;
        const py = icicle.y;

        // Draw a thick horizontal connection at top
        ctx.fillStyle = "#a5f3fc"; 
        ctx.fillRect(px, py, TILE_SIZE, 6);

        // Multiple tapering cascades to form a massive majestic icicle
        let curThick = 26;
        let currentY = 0;
        const totalLen = icicle.h - 6;

        while (currentY < totalLen && curThick > 0) {
          const offsetX = Math.floor((TILE_SIZE - curThick) / 2);

          // Ice color gradients
          if (currentY % 12 < 6) {
            ctx.fillStyle = "#a5f3fc"; // brighter cyan
          } else {
            ctx.fillStyle = "#7dd3fc"; // sky blue
          }
          ctx.fillRect(px + offsetX, py + 6 + currentY, curThick, 4);

          // Inner darker blue core
          if (curThick > 8) {
            ctx.fillStyle = "#38bdf8"; 
            ctx.fillRect(
              px + offsetX + Math.floor(curThick / 4),
              py + 6 + currentY,
              Math.floor(curThick / 2),
              4,
            );
          }

          // Glittering glints
          if (currentY % 16 === 0) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(
              px + offsetX + Math.floor(curThick / 2) - 1,
              py + 6 + currentY,
              3,
              4,
            );
          }

          currentY += 4;

          // Taper slowly
          if (currentY < 16) {
            if (currentY % 8 === 0) curThick -= 2;
          } else if (currentY < 40) {
            if (currentY % 4 === 0) curThick -= 2;
          } else {
            if (currentY % 2 === 0) curThick -= 2;
          }
        }

        // Draw a sharp final point or glint at the tip
        ctx.fillStyle = "#ffffff";
        const finalOffsetX = Math.floor((TILE_SIZE - 4) / 2);
        ctx.fillRect(px + finalOffsetX + 1, py + 6 + currentY, 2, 4);
      }
    }

    // Draw Chests
    if (this.state.chests) {
      for (const chest of this.state.chests) {
        const px = Math.round(chest.x * zoom) / zoom; // ponytail: round coordinates in screen space
        const py = Math.round(chest.y * zoom) / zoom;
        
        if (!chest.isOpen) {
          // Closed Chest Model: brown box, dark iron bands, gold lock
          // Base box (brown wood)
          ctx.fillStyle = "#7c2d12"; // dark red-brown wood
          ctx.fillRect(px, py, chest.w, chest.h);
          
          // Lid line/shadow
          ctx.fillStyle = "#451a03"; // very dark brown
          ctx.fillRect(px, py + 5, chest.w, 2);
          
          // Iron bands (left and right)
          ctx.fillStyle = "#374151"; // charcoal grey
          ctx.fillRect(px + 4, py, 3, chest.h);
          ctx.fillRect(px + chest.w - 7, py, 3, chest.h);
          
          // Gold lock in center
          ctx.fillStyle = "#fbbf24"; // golden yellow
          ctx.fillRect(px + chest.w / 2 - 2, py + 4, 4, 5);
          ctx.fillStyle = "#1e293b"; // keyhole detail
          ctx.fillRect(px + chest.w / 2 - 1, py + 6, 2, 2);

          // If player is close, draw interaction prompt "[E] Open"
          const chestTx = Math.floor((chest.x + chest.w / 2) / TILE_SIZE);
          const chestTy = Math.floor((chest.y + chest.h / 2) / TILE_SIZE);
          const playerTx = Math.floor((this.state.player.x + this.state.player.w / 2) / TILE_SIZE);
          const playerTy = Math.floor((this.state.player.y + this.state.player.h / 2) / TILE_SIZE);
          
          const manhattanDist = Math.abs(playerTx - chestTx) + Math.abs(playerTy - chestTy);
          if (manhattanDist <= 2) {
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 10px 'Courier New', Courier, monospace";
            ctx.textAlign = "center";
            ctx.fillText("[E] OPEN", chest.x + chest.w / 2, py - 6);
          }
        } else {
          // Chest - open model: bottom box, open lid propped up/back, gold treasure glowing
          // Bottom box (lower part of chest)
          ctx.fillStyle = "#7c2d12";
          ctx.fillRect(px, py + 6, chest.w, chest.h - 6);
          
          // Iron bands on bottom
          ctx.fillStyle = "#374151";
          ctx.fillRect(px + 4, py + 6, 3, chest.h - 6);
          ctx.fillRect(px + chest.w - 7, py + 6, 3, chest.h - 6);
          
          // Glowing Gold Treasure inside!
          ctx.fillStyle = "#fbbf24"; // bright gold
          ctx.fillRect(px + 2, py + 3, chest.w - 4, 3);
          
          // Sparkle glints
          if (Math.random() < 0.3) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(px + 4 + Math.random() * (chest.w - 8), py + 2 + Math.random() * 2, 2, 2);
          }

          // Open Lid (propped up, angled back)
          ctx.fillStyle = "#9a3412"; // slightly lighter brown
          ctx.fillRect(px, py - 4, chest.w, 6);
          // Lid iron bands
          ctx.fillStyle = "#4b5563";
          ctx.fillRect(px + 4, py - 4, 3, 6);
          ctx.fillRect(px + chest.w - 7, py - 4, 3, 6);
        }
      }
    }

    // Draw Dropped Weapons
    if (this.state.droppedWeapons) {
      for (const dw of this.state.droppedWeapons) {
        const wx = Math.round(dw.x * zoom) / zoom;
        const wy = Math.round(dw.y * zoom) / zoom;
        
        ctx.save();
        ctx.translate(wx + dw.w / 2, wy + dw.h / 2);
        
        // Float effect (gentle bobbing up and down)
        const bob = Math.sin(this.state.frameCounter * 0.05) * 3;
        ctx.translate(0, bob);
        
        // Draw a light golden pedestal glow underneath
        ctx.fillStyle = "rgba(251, 191, 36, 0.25)";
        ctx.beginPath();
        ctx.ellipse(0, dw.h / 2 - 2, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        const type = dw.type;
        if (type === 'sword') {
          const gemColor = this.state.player ? (this.state.player.playerColor || "#ea580c") : "#ea580c";
          ctx.save();
          ctx.rotate(-Math.PI / 4);

          // Blade
          ctx.fillStyle = "#f8fafc";
          ctx.fillRect(-1, -12, 2, 2);
          ctx.fillStyle = "#f1f5f9";
          ctx.fillRect(-2, -10, 2, 11);
          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(0, -10, 1, 11);
          ctx.fillStyle = "#94a3b8";
          ctx.fillRect(1, -10, 1, 11);

          // Winged Crossguard
          ctx.fillStyle = "#e2e8f0";
          ctx.fillRect(-6, 1, 12, 2);

          // Gem emblem
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(-2, 0, 4, 3);
          ctx.fillStyle = gemColor;
          ctx.fillRect(-1, 1, 2, 2);

          // Leather Handle & Pommel
          ctx.fillStyle = "#78350f";
          ctx.fillRect(-1, 3, 2, 4);
          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(-2, 7, 4, 2);

          ctx.restore();
        } else if (type === 'bow') {
          // Curved wooden bow
          ctx.strokeStyle = "#b45309";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 8, -Math.PI * 0.4, Math.PI * 0.4);
          ctx.stroke();
          // Bowstring
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(3, -7);
          ctx.lineTo(3, 7);
          ctx.stroke();
        } else if (type === 'colossal_sword') {
          // Big heavy blade
          ctx.strokeStyle = "#6b7280";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(-8, 8);
          ctx.lineTo(8, -8);
          ctx.stroke();
          // Guard
          ctx.strokeStyle = "#d1d5db";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-7, 3);
          ctx.lineTo(-3, 7);
          ctx.stroke();
          // Brown handle
          ctx.fillStyle = "#78350f";
          ctx.fillRect(-10, 8, 3, 3);
        } else if (type === 'dual_daggers') {
          // Crossed daggers
          // Dagger 1
          ctx.strokeStyle = "#9ca3af";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-5, 5);
          ctx.lineTo(3, -3);
          ctx.stroke();
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(-7, 5, 2, 2);
          
          // Dagger 2
          ctx.strokeStyle = "#9ca3af";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(5, 5);
          ctx.lineTo(-3, -3);
          ctx.stroke();
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(5, 5, 2, 2);
        } else if (type === 'mace') {
          ctx.strokeStyle = "#78350f";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-6, 6);
          ctx.lineTo(1, -1);
          ctx.stroke();

          ctx.fillStyle = "#94a3b8";
          ctx.fillRect(0, -6, 6, 6);
          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(1, -5, 4, 4);

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(2, -8, 2, 2);
          ctx.fillRect(-2, -4, 2, 2);
          ctx.fillRect(6, -4, 2, 2);
        } else if (type === 'battle_axe') {
          ctx.strokeStyle = "#78350f";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-7, 7);
          ctx.lineTo(1, -1);
          ctx.stroke();

          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(0, -6, 5, 5);
          ctx.fillRect(-5, -6, 5, 5);
          ctx.fillStyle = "#94a3b8";
          ctx.fillRect(4, -7, 2, 7);
          ctx.fillRect(-6, -7, 2, 7);
        } else if (type === 'torch') {
          ctx.strokeStyle = "#78350f";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-4, 6);
          ctx.lineTo(2, -2);
          ctx.stroke();

          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(1, -4, 2, 2);
          ctx.fillStyle = "#f97316";
          ctx.fillRect(0, -7, 4, 3);
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(1, -9, 2, 2);
        } else if (type === 'health_potion') {
          ctx.fillStyle = "#78350f";
          ctx.fillRect(-2, -8, 4, 3);
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(-5, -5, 10, 11);
          ctx.fillStyle = "#dc2626";
          ctx.fillRect(-4, -4, 8, 9);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(-3, -3, 2, 3);
        } else if (type === 'speed_potion') {
          ctx.fillStyle = "#78350f";
          ctx.fillRect(-2, -8, 4, 3);
          ctx.fillStyle = "#06b6d4";
          ctx.fillRect(-5, -5, 10, 11);
          ctx.fillStyle = "#0891b2";
          ctx.fillRect(-4, -4, 8, 9);
          ctx.fillStyle = "#a5f3fc";
          ctx.fillRect(-3, -3, 2, 3);
        } else if (type === 'bomb') {
          ctx.fillStyle = "#1e293b";
          ctx.beginPath();
          ctx.arc(0, 2, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#64748b";
          ctx.fillRect(-2, 0, 2, 2);
          ctx.strokeStyle = "#eab308";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, -4);
          ctx.lineTo(3, -7);
          ctx.stroke();
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(3, -8, 2, 2);
        } else if (type === 'shield') {
          ctx.fillStyle = "#475569";
          ctx.fillRect(-6, -6, 12, 12);
          ctx.fillStyle = "#94a3b8";
          ctx.fillRect(-5, -5, 10, 10);
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(-1, -4, 2, 8);
          ctx.fillRect(-4, -1, 8, 2);
        } else if (type === 'molten_axe') {
          ctx.strokeStyle = "#1c1917";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-7, 7);
          ctx.lineTo(2, -2);
          ctx.stroke();

          ctx.fillStyle = "#ea580c";
          ctx.fillRect(0, -7, 6, 6);
          ctx.fillRect(-6, -7, 6, 6);
          ctx.fillStyle = "#fef08a";
          ctx.fillRect(5, -8, 2, 8);
          ctx.fillRect(-7, -8, 2, 8);
        } else if (type === 'frozen_sword') {
          ctx.strokeStyle = "#0284c7";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-6, 6);
          ctx.lineTo(6, -6);
          ctx.stroke();

          ctx.fillStyle = "#38bdf8";
          ctx.fillRect(0, -6, 6, 6);
          ctx.fillStyle = "#e0f2fe";
          ctx.fillRect(2, -8, 2, 2);
        } else if (type === 'lava_flask') {
          ctx.fillStyle = "#78350f";
          ctx.fillRect(-2, -8, 4, 3);
          ctx.fillStyle = "#ea580c";
          ctx.fillRect(-5, -5, 10, 11);
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(-4, -4, 8, 9);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(-3, -3, 2, 3);
        } else if (type === 'magma_orb') {
          ctx.fillStyle = "#1c1917";
          ctx.beginPath();
          ctx.arc(0, 2, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ea580c";
          ctx.fillRect(-2, 0, 4, 4);
          ctx.fillStyle = "#fef08a";
          ctx.fillRect(-1, 1, 2, 2);
        }
        
        ctx.restore();

        // If player is close, draw swap prompt "[F] Take [Item]"
        const px = this.state.player.x + this.state.player.w / 2;
        const py = this.state.player.y + this.state.player.h / 2;
        const dist = Math.hypot(px - (dw.x + dw.w / 2), py - (dw.y + dw.h / 2));
        if (dist < 32) {
          const itemNames: Record<string, string> = {
            'sword': 'Sword',
            'bow': 'Bow',
            'colossal_sword': 'Colossal Sword',
            'dual_daggers': 'Dual Daggers',
            'mace': 'Mace',
            'battle_axe': 'Battle Axe',
            'molten_axe': 'Molten Axe',
            'frozen_sword': 'Frozen Sword',
            'lava_flask': 'Obsidian Draught',
            'magma_orb': 'Magma Orb',
            'torch': 'Torch',
            'health_potion': 'Health Potion',
            'speed_potion': 'Swiftness Potion',
            'bomb': 'Explosive Bomb',
            'shield': 'Iron Shield'
          };
          const itemName = itemNames[dw.type] || dw.type;
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 9px 'Courier New', Courier, monospace";
          ctx.textAlign = "center";
          ctx.fillText(`[F] SWAP TO ${itemName.toUpperCase()}`, dw.x + dw.w / 2, dw.y - 12);
        }
      }
    }

    // Draw Projectiles
    if (this.state.projectiles) {
      for (const proj of this.state.projectiles) {
        if (proj.type === 'arrow') {
          const px = Math.round(proj.x * zoom) / zoom;
          const py = Math.round(proj.y * zoom) / zoom;
          const pw = proj.w;
          const ph = proj.h;
          
          const angle = Math.atan2(proj.vy, proj.vx);
          
          ctx.save();
          ctx.translate(px + pw / 2, py + ph / 2);
          ctx.rotate(angle);
          
          // Shaft (brown)
          ctx.fillStyle = "#78350f";
          ctx.fillRect(-8, -1, 12, 2);
          // Fletching (green feathers)
          ctx.fillStyle = "#10b981";
          ctx.fillRect(-10, -3, 2, 6);
          ctx.fillRect(-9, -2, 1, 4);
          // Steel arrowhead (polished grey with point)
          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(4, -2, 4, 4);
          ctx.fillStyle = "#94a3b8";
          ctx.fillRect(4, -1, 1, 2);
          
          ctx.restore();
        } else if (proj.type === 'magma') {
          const px = Math.round(proj.x * zoom) / zoom;
          const py = Math.round(proj.y * zoom) / zoom;
          const pw = proj.w;
          const ph = proj.h;
          const pulse = 1 + Math.sin(Date.now() * 0.05 + proj.x) * 0.15;

          ctx.save();
          ctx.translate(px + pw / 2, py + ph / 2);

          // Molten trail (behind the fireball)
          ctx.fillStyle = "rgba(249, 115, 22, 0.4)";
          ctx.fillRect(-10 - pulse * 2, -2, 5 + pulse * 2, 4);

          // Fireball body
          ctx.fillStyle = "#f97316";
          ctx.fillRect(-6, -4, 12, 8);
          ctx.fillStyle = "#fb923c";
          ctx.fillRect(-4, -3, 8, 6);
          // Bright core
          ctx.fillStyle = "#fef08a";
          ctx.fillRect(-3, -2, 6, 4);
          // Hot center
          ctx.fillStyle = "#fff7ed";
          ctx.fillRect(-1, -1, 3, 2);

          ctx.restore();
        } else if (proj.type === 'lava_wave') {
          const px = Math.round(proj.x * zoom) / zoom;
          const py = Math.round(proj.y * zoom) / zoom;
          const pw = proj.w;
          const ph = proj.h;
          const dir = proj.facingRight ? 1 : -1;

          ctx.save();
          ctx.translate(px + pw / 2, py + ph / 2);
          if (dir === -1) ctx.scale(-1, 1);

          // Searing Molten Wave Crest
          ctx.fillStyle = "rgba(127, 29, 29, 0.85)";
          ctx.fillRect(-16, -10, 32, 20);
          ctx.fillStyle = "#ea580c";
          ctx.fillRect(-14, -8, 28, 16);
          ctx.fillStyle = "#f97316";
          ctx.fillRect(-10, -6, 22, 12);
          ctx.fillStyle = "#fef08a";
          ctx.fillRect(-4, -4, 14, 8);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, -2, 8, 4);

          ctx.restore();
        } else if (proj.type === 'bomb') {
          const px = Math.round(proj.x * zoom) / zoom;
          const py = Math.round(proj.y * zoom) / zoom;
          ctx.save();
          ctx.translate(px + proj.w / 2, py + proj.h / 2);
          ctx.fillStyle = "#1e293b";
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#f59e0b";
          ctx.fillRect(-1, -8, 2, 3);
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(0, -9, 2, 2);
          ctx.restore();
        }
      }
    }

    // Dynamic VFX Particles
    for (let pt of this.state.particles) {
      const alpha = Math.max(0, Math.min(1.0, (pt.life / pt.maxLife) * (pt.alpha !== undefined ? pt.alpha : 1.0)));
      ctx.globalAlpha = alpha;
      const px = Math.round(pt.x * zoom) / zoom;
      const py = Math.round(pt.y * zoom) / zoom;
      const sz = Math.max(1, pt.size);

      if (pt.shape === "streak") {
        const spd = Math.hypot(pt.vx, pt.vy);
        if (spd > 0.8) {
          ctx.strokeStyle = pt.color;
          ctx.lineWidth = Math.max(1.5, sz * 0.8);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - pt.vx * 1.6, py - pt.vy * 1.6);
          ctx.stroke();
          if (pt.secondaryColor) {
            ctx.strokeStyle = pt.secondaryColor;
            ctx.lineWidth = Math.max(1, sz * 0.4);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px - pt.vx * 0.8, py - pt.vy * 0.8);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = pt.color;
          ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        }
      } else if (pt.shape === "ring" || pt.shape === "shockwave") {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = Math.max(1.5, Math.min(3.5, (pt.life / pt.maxLife) * 3));
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.shape === "star") {
        ctx.fillStyle = pt.color;
        ctx.fillRect(px - sz, py - 0.75, sz * 2, 1.5);
        ctx.fillRect(px - 0.75, py - sz, 1.5, sz * 2);
        if (pt.secondaryColor) {
          ctx.fillStyle = pt.secondaryColor;
          ctx.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
        }
      } else if (pt.shape === "circle") {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(px, py, sz / 2, 0, Math.PI * 2);
        ctx.fill();
        if (pt.secondaryColor) {
          ctx.fillStyle = pt.secondaryColor;
          ctx.beginPath();
          ctx.arc(px, py, sz / 4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Default square pixel
        ctx.fillStyle = pt.color;
        ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        if (pt.secondaryColor && sz >= 3) {
          ctx.fillStyle = pt.secondaryColor;
          ctx.fillRect(px - 0.5, py - 0.5, 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1.0;

    // Enhanced Combat Floating Numbers & Interaction Texts
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let t of this.state.texts) {
      const alpha = Math.max(0, Math.min(1.0, (t.life / t.maxLife) * 1.5));
      const prog = 1 - t.life / t.maxLife;
      // Spring pop scale: bouncy start then settling
      const popScale = (t.scale || 1.0) * (prog < 0.25 ? 1.0 + (0.25 - prog) * 2.0 : 1.0);
      const tx = Math.round(t.x * zoom) / zoom;
      const ty = Math.round(t.y * zoom) / zoom;

      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(popScale, popScale);

      const textColor = t.color || "#ffffff";
      const strokeColor = t.strokeColor || "#090d16";

      ctx.font = "bold 13px 'Courier New', Courier, monospace";
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = strokeColor;
      ctx.globalAlpha = alpha * 0.95;
      ctx.strokeText(t.text, 0, 0);

      ctx.fillStyle = textColor;
      ctx.globalAlpha = alpha;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1.0;

    // Darkness overlay (using offscreen canvas)
// Nolly: only early-return for the idle menu background when we are NOT
    // mid-card transition — otherwise the intro ring and the cards never show.
    if (this.isMenuBackground && !this.state.isFloorComplete && this.state.transitionState !== "cards_enter" && this.state.transitionState !== "cards" && this.state.transitionState !== "out") {
      ctx.restore(); // Restore main camera save state to prevent canvas matrix stack overflow!!
      // ponytail: the hold between the descend outro and the cards must be pure
      // black (not a dimmed cave) so the frame matches the dark screen
      ctx.fillStyle = this.state.transitionState === "out_to_cards_delay" ? "#000" : "rgba(9, 13, 22, 0.30)";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      return;
    }

    if (!this.lightCanvas) {
      this.lightCanvas = document.createElement("canvas");
    }
    // ponytail: half-res darkness canvas, scaled up on draw — ~4x cheaper, soft light hides the loss
    const lw = Math.ceil(this.canvasWidth / 2);
    const lh = Math.ceil(this.canvasHeight / 2);
    if (
      this.lightCanvas.width !== lw ||
      this.lightCanvas.height !== lh
    ) {
      this.lightCanvas.width = lw;
      this.lightCanvas.height = lh;
    }
    const lctx = this.lightCanvas.getContext("2d");
    if (lctx && !this.isMenuBackground && !this.state.isFloorComplete && this.state.transitionState !== "cards") {
      // ponytail: static lights (torches/lava/exit) never move in world space, so bake
      // them once into a padded half-res canvas and re-bake only when the camera crosses
      // a tile boundary / zoom bucket / floor / diamond-state changes. Player light is
      // the only dynamic one, drawn per-frame. This killed the per-frame gradient flood
      // that tanked FPS after the 2x caves.
      const PAD = 48; // px; covers max sub-tile blit shift = TILE*zoom*0.5 (40px at gate zoom 2.5)
      const camBakeX = Math.floor(this.state.camera.x / TILE_SIZE) * TILE_SIZE;
      const camBakeY = Math.floor(this.state.camera.y / TILE_SIZE) * TILE_SIZE;
      const zoomBucket = Math.round(zoom * 50);
      const key = `${camBakeX},${camBakeY},${zoomBucket},${this.state.floor},${this.state.biome},${p.hasDiamond}`;
      const slw = lw + 2 * PAD;
      const slh = lh + 2 * PAD;

      if (!this.staticLightCanvas) {
        this.staticLightCanvas = document.createElement("canvas");
        this.staticLightCanvas.width = slw;
        this.staticLightCanvas.height = slh;
      } else if (this.staticLightCanvas.width !== slw || this.staticLightCanvas.height !== slh) {
        this.staticLightCanvas.width = slw;
        this.staticLightCanvas.height = slh;
        this.staticLightKey = "";
      }

      if (this.staticLightKey !== key) {
        this.staticLightKey = key;
        const sctx = this.staticLightCanvas.getContext("2d");
        if (sctx) {
          sctx.clearRect(0, 0, slw, slh);
          sctx.save();
          sctx.translate(lw / 2 + PAD, lh / 2 + PAD);
          sctx.scale(zoom * 0.5, zoom * 0.5);
          // ponytail: translate applied BEFORE the scale, so it must be raw world
          // camera units (camBake), NOT camera*zoom — the pre-scale translate gets
          // scaled again, double-counting zoom otherwise.
          sctx.translate(-camBakeX, -camBakeY);

          const drawStaticLight = (x: number, y: number, radius: number) => {
            const grad = sctx.createRadialGradient(x, y, radius * 0.15, x, y, radius);
            grad.addColorStop(0, "rgba(255,255,255,1)");
            grad.addColorStop(0.5, "rgba(255,255,255,0.7)");
            grad.addColorStop(1, "rgba(255,255,255,0)");
            sctx.fillStyle = grad;
            sctx.beginPath();
            sctx.arc(x, y, radius, 0, Math.PI * 2);
            sctx.fill();
          };

          // Bake Torches + lava for the tile window around the baked camera
          const startColLight = Math.max(0, Math.floor((camBakeX - this.canvasWidth / 2 / zoom - 300) / TILE_SIZE));
          const endColLight = Math.min(this.state.width, Math.ceil((camBakeX + this.canvasWidth / 2 / zoom + 300) / TILE_SIZE));
          const startRowLight = Math.max(0, Math.floor((camBakeY - this.canvasHeight / 2 / zoom - 300) / TILE_SIZE));
          const endRowLight = Math.min(this.state.height, Math.ceil((camBakeY + this.canvasHeight / 2 / zoom + 300) / TILE_SIZE));

          for (let y = startRowLight; y < endRowLight; y++) {
            for (let x = startColLight; x < endColLight; x++) {
              const tile = this.state.map[y] && this.state.map[y][x];
              if (tile === 10) {
                drawStaticLight(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 204);
              } else if (tile === 12) {
                drawStaticLight(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 171);
              } else if (this.state.biome === "volcanic" && tile === 21) {
                // Lava self-glow: molten rock emits light into the dark around it
                drawStaticLight(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 165);
              }
            }
          }

          // Bake exit/boss room light
          if (this.state.floor < this.state.maxFloor && this.state.endPos.x >= startColLight && this.state.endPos.x < endColLight && this.state.endPos.y >= startRowLight && this.state.endPos.y < endRowLight) {
            drawStaticLight(this.state.endPos.x * TILE_SIZE + TILE_SIZE / 2, this.state.endPos.y * TILE_SIZE + TILE_SIZE / 2, 237);
          } else if (this.state.floor === this.state.maxFloor && !p.hasDiamond && this.state.endPos.x >= startColLight && this.state.endPos.x < endColLight && this.state.endPos.y >= startRowLight && this.state.endPos.y < endRowLight) {
            drawStaticLight(this.state.endPos.x * TILE_SIZE + TILE_SIZE / 2, this.state.endPos.y * TILE_SIZE + TILE_SIZE / 2, 210);
          }

          sctx.restore();
        }
      }

      lctx.clearRect(0, 0, lw, lh);
      lctx.fillStyle = "rgba(0, 0, 0, 0.97)"; // Pitch black atmospheric cave darkness
      lctx.fillRect(0, 0, lw, lh);

      lctx.globalCompositeOperation = "destination-out";
      // Blit the baked static layer shifted to the current (sub-tile) camera position
      // static canvas maps p -> lw/2+PAD+z/2*(p-camBake); desired is lw/2+z/2*(p-camera)
      // => offset = z/2*(camBake-camera) - PAD
      const dx = (camBakeX - this.state.camera.x) * zoom * 0.5 - PAD;
      const dy = (camBakeY - this.state.camera.y) * zoom * 0.5 - PAD;
      lctx.drawImage(this.staticLightCanvas, dx, dy);

      // Player light is dynamic — draw it live with the correct world transform
      lctx.save();
      lctx.translate(Math.round(lw / 2), Math.round(lh / 2));
      lctx.scale(zoom * 0.5, zoom * 0.5);
      // ponytail: this translate is applied BEFORE the scale above, so it must be
      // raw world units (camera.x/y), NOT scaledCamX (camera * zoom). Using the
      // scaled value threw the whole light field off by camera*(zoom-1) at any
      // zoom > 1 — huge misalignment during the 1.6 intro zoom.
      lctx.translate(-this.state.camera.x, -this.state.camera.y);

      const drawPlayerLight = (x: number, y: number, radius: number) => {
        const grad = lctx.createRadialGradient(x, y, radius * 0.15, x, y, radius);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.7)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        lctx.fillStyle = grad;
        lctx.beginPath();
        lctx.arc(x, y, radius, 0, Math.PI * 2);
        lctx.fill();
      };
      const pLightRad = (p.weapon === 'torch' && p.weaponEquipped) ? 260.0 : 150.0;
      drawPlayerLight(p.x + p.w / 2, p.y + p.h / 2, pLightRad);

      lctx.restore();
      lctx.globalCompositeOperation = "source-over";

      ctx.save();
      ctx.resetTransform();
      ctx.imageSmoothingEnabled = true; // soft upscale for the darkness layer
      ctx.drawImage(this.lightCanvas, 0, 0, this.canvasWidth, this.canvasHeight);
      ctx.restore();
    }

      // Structure dark overlay (always present in structure, dimmer when player inside)
      {
        const startX = Math.max(0, Math.floor((this.state.camera.x - this.canvasWidth / 2 / zoom) / TILE_SIZE));
        const endX = Math.min(this.state.width, Math.ceil((this.state.camera.x + this.canvasWidth / 2 / zoom) / TILE_SIZE));
        const startY = Math.max(0, Math.floor((this.state.camera.y - this.canvasHeight / 2 / zoom) / TILE_SIZE));
        const endY = Math.min(this.state.height, Math.ceil((this.state.camera.y + this.canvasHeight / 2 / zoom) / TILE_SIZE));

        const structOpacity = 0.85 - 0.45 * this.state.structureOverlayAlpha;
        ctx.fillStyle = `rgba(0, 0, 0, ${structOpacity})`;
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            if (this.state.bgMap[y] && this.state.bgMap[y][x] === 9) {
              ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 1, TILE_SIZE + 1);
            }
          }
        }
      }

        ctx.restore(); // Restore from Main Camera save

    // Screen Tints (Supersonic slow-mo and Poison)
    if (p.timeSlowActive) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 150, 255, 0.12)";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      for (let i = 0; i < 8; i++) {
        const yOffset = (Date.now() / 2 + i * 90) % this.canvasHeight;
        ctx.fillRect(0, yOffset, this.canvasWidth, 2);
      }
      ctx.restore();
    }

    if (p.poisonTimer > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(46, 125, 50, 0.12)";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      ctx.restore();
    }

    // Red vignette flash (lava spider explosion)
    if (p.redFlashTimer > 0) {
      ctx.save();
      const a = Math.min(0.5, p.redFlashTimer / 60);
      const g = ctx.createRadialGradient(
        this.canvasWidth / 2, this.canvasHeight / 2, this.canvasHeight * 0.3,
        this.canvasWidth / 2, this.canvasHeight / 2, this.canvasHeight * 0.7
      );
      g.addColorStop(0, "rgba(255, 0, 0, 0)");
      g.addColorStop(1, `rgba(255, 0, 0, ${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      ctx.restore();
    }

    // Screen Frost Overlay Pixelated
    // Suppress drawing the frost/screen borders completely upon descending or when transitioning
    const currentFrostTimer = 
      (this.state.transitionState !== "none" || 
       this.state.floorTitleState !== "none" || 
       this.state.gateEntered)
        ? 0
        : (this.state.frostTimer || 0);

    if (currentFrostTimer > 0) {
      const intensity = Math.min(0.5, currentFrostTimer / 300);
      ctx.fillStyle = `rgba(150, 220, 255, ${intensity})`;
      const pxSize = 16;
      for (let y = 0; y < this.canvasHeight; y += pxSize) {
        for (let x = 0; x < this.canvasWidth; x += pxSize) {
          const dx =
            Math.abs(x + pxSize / 2 - this.canvasWidth / 2) /
            (this.canvasWidth / 2);
          const dy =
            Math.abs(y + pxSize / 2 - this.canvasHeight / 2) /
            (this.canvasHeight / 2);
          const dist = Math.max(dx, dy);
          const noise = Math.sin(x * 0.1 + y * 0.2 + Date.now() * 0.002) * 0.1;
          if (dist + noise > 1 - (currentFrostTimer / 300) * 0.5) {
            ctx.fillRect(x, y, pxSize, pxSize);
          }
        }
      }
    }

    // Cinematic Letterbox Top & Bottom Borders (Closing in during cutscene & boss fight)
    if (this.state.letterboxHeight && this.state.letterboxHeight > 0) {
      ctx.save();
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, this.canvasWidth, this.state.letterboxHeight);
      ctx.fillRect(0, this.canvasHeight - this.state.letterboxHeight, this.canvasWidth, this.state.letterboxHeight);

      if (this.state.bossCutsceneTimer && this.state.bossCutsceneTimer > 0) {
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 30px 'Courier New', Courier, monospace";
        ctx.textAlign = "center";
        ctx.fillText("★ CAVERN TITAN AWAKENS ★", this.canvasWidth / 2, this.canvasHeight / 2 - 30);
        ctx.font = "bold 16px 'Courier New', Courier, monospace";
        ctx.fillStyle = "#fbbf24";
        ctx.fillText("ANCIENT GOLEM OF THE DEEP DEMANDS YOUR SOUL", this.canvasWidth / 2, this.canvasHeight / 2 + 10);
      }
      ctx.restore();
    }

    if (!this.isMenuBackground) {
      // HUD
      ctx.fillStyle = "#fbbf24"; // Yellow color for coins
      ctx.font = "bold 20px 'Courier New', Courier, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${this.state.player.coins} COINS`, this.canvasWidth - 20, 30);

      this.drawHUD();

      if (this.state.floorTitleState !== "none") {
        let alpha = 0;
        if (this.state.floorTitleState === "in")
          alpha = this.state.floorTitleTimer / 30;
        else if (this.state.floorTitleState === "show") alpha = 1;
        else if (this.state.floorTitleState === "out")
          alpha = 1 - this.state.floorTitleTimer / 30;

        let title = "Standard Caves";
        let subtitle = "The good ol' classic.";
        if (this.state.biome === "ice") {
          title = "Ice Pathways";
          subtitle = "You feel your own heart getting colder.";
        } else if (this.state.biome === "moss") {
          title = "Overgrown Moss";
          subtitle = "It spreads.";
        } else if (this.state.biome === "volcanic") {
          title = "Volcanic Caverns";
          subtitle = "A heatwave emerges. Watch your step.";
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.textAlign = "center";
        ctx.font = "bold 36px 'Courier New', Courier, monospace";
        ctx.fillText(
          `Floor ${this.state.floor} - ${title}`,
          this.canvasWidth / 2,
          140,
        );
        ctx.font = "20px 'Courier New', Courier, monospace";
        ctx.fillStyle = `rgba(180, 220, 255, ${alpha})`;
        ctx.fillText(subtitle, this.canvasWidth / 2, 180);
      }
    }

    const showCards =
      this.state.isFloorComplete ||
      this.state.transitionState === "cards_enter" ||
      this.state.transitionState === "cards" ||
      this.state.transitionState === "out";
    if (showCards) {
      // Pan camera across the world generation pane behind the player cards
      this.panMenuCamera(1.2);

      // 30% dark backdrop overlay (30% darkness when choosing cards)
      ctx.fillStyle = "rgba(0, 0, 0, 0.30)";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

      // The freely floating header text (NO box container)
      ctx.save();
      ctx.fillStyle = COLORS.diamond;
      ctx.font = "bold 34px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(
        `FLOOR ${this.state.floor} CLEARED - SELECT UPGRADE`,
        this.canvasWidth / 2,
        65,
      );
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 22px 'Courier New', Courier, monospace";
      ctx.fillText(
        `YOUR COINS: ${this.state.player.coins}`,
        this.canvasWidth / 2,
        100,
      );

      // Draw EXACT Legacy Cards (Bigger: 320px x 460px)
      const cardWidth = 320;
      const cardHeight = 460;
      const gap = 40;
      const totalWidth = 3 * cardWidth + 2 * gap;
      const startX = this.canvasWidth / 2 - totalWidth / 2;
      const startY = this.canvasHeight / 2 - cardHeight / 2 + 30;

      for (let i = 0; i < this.state.upgrades.length; i++) {
        const u = this.state.upgrades[i];
        const cx = startX + i * (cardWidth + gap);
        const cy = startY;

        const isHover =
          this.state.mouse.x >= cx &&
          this.state.mouse.x <= cx + cardWidth &&
          this.state.mouse.y >= cy &&
          this.state.mouse.y <= cy + cardHeight;

        // EXACT Legacy Card Styling
        let strokeColor = "#ffffff";
        let fillStyle = isHover ? "#2c2c2c" : "#1a1a1a";

        if (u.isUltimate) {
          const timeCycle = Date.now() / 200;
          const hue = Math.floor((timeCycle * 50) % 360);
          strokeColor = `hsl(${hue}, 100%, 60%)`;
          fillStyle = isHover ? "#350f25" : "#1e0815";
        } else if (u.isSuper) {
          const timeCycle = Date.now() / 250;
          const hue = Math.floor(45 + Math.sin(timeCycle) * 15);
          strokeColor = `hsl(${hue}, 100%, 50%)`;
          fillStyle = isHover ? "#322510" : "#1a150b";
        } else {
          strokeColor = isHover ? "#fbbf24" : "#4b5563";
        }

        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = u.isSuper || u.isUltimate ? 3 : 2;
        ctx.fillRect(cx, cy, cardWidth, cardHeight);
        ctx.strokeRect(cx, cy, cardWidth, cardHeight);

        // Selected card keeps its own card-color border (not black)
        if (this.state.selectedUpgradeIndex === i) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 5;
          ctx.shadowColor = strokeColor;
          ctx.shadowBlur = 16;
          ctx.strokeRect(cx - 4, cy - 4, cardWidth + 8, cardHeight + 8);
          ctx.shadowBlur = 0;
        }

        // Green lock-in pulse plays ONLY while the outro closes (card locked/confirmed)
        if (this.state.selectedUpgradeIndex === i && this.state.transitionState === "out") {
          const t = this.state.selectedPulseTimer || 0;
          const pulse = 0.55 + 0.45 * Math.sin(t / 6);
          ctx.save();
          ctx.translate(cx + cardWidth / 2, cy + cardHeight / 2);
          ctx.scale(1 + pulse * 0.03, 1 + pulse * 0.03);
          ctx.translate(-(cx + cardWidth / 2), -(cy + cardHeight / 2));
          ctx.strokeStyle = `rgba(34, 197, 94, ${0.5 + 0.5 * pulse})`;
          ctx.lineWidth = 7;
          ctx.strokeRect(cx - 7, cy - 7, cardWidth + 14, cardHeight + 14);
          ctx.restore();
        }

        // Title
        ctx.textAlign = "center";
        ctx.font = "bold 26px 'Courier New', Courier, monospace";
        ctx.fillStyle = u.isUltimate ? "#f472b6" : (u.isSuper ? "#fbbf24" : "#ffffff");
        ctx.fillText(u.title, cx + cardWidth / 2, cy + 45);

        // Sub-Label
        ctx.font = "bold 15px 'Courier New', Courier, monospace";
        ctx.fillStyle = u.isUltimate ? "#ec4899" : (u.isSuper ? "#f59e0b" : "#9ca3af");
        let subText = "NORMAL UPGRADE";
        if (u.isUltimate) subText = "★ ULTIMATE CARD ★";
        else if (u.isSuper) subText = "★ SUPER CARD ★";
        ctx.fillText(subText, cx + cardWidth / 2, cy + 82);

        // Desc lines
        ctx.fillStyle = "#e5e7eb";
        ctx.font = "17px 'Courier New', Courier, monospace";
        const lines = u.desc.split("\n");
        for (let j = 0; j < lines.length; j++) {
          ctx.fillText(lines[j], cx + cardWidth / 2, cy + 135 + j * 26);
        }

        // Card cost
        const affordable = this.state.player.coins >= u.cost;
        ctx.font = "bold 20px 'Courier New', Courier, monospace";
        ctx.fillStyle = affordable ? "#fbbf24" : "#f87171";
        ctx.fillText(`COST: ${u.cost} COINS`, cx + cardWidth / 2, cy + cardHeight - 30);
      }

      ctx.textAlign = "center";
      ctx.font = "bold 20px 'Courier New', Courier, monospace";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(
        "Press ENTER to skip / descend deeper",
        this.canvasWidth / 2,
        this.canvasHeight - 30,
      );
      ctx.restore();

      // SELECT confirmation button
      let selBtnW = 220;
      let selBtnH = 52;
      let selBtnX = this.canvasWidth / 2 - selBtnW / 2;
      let selBtnY = startY + cardHeight + 18;
      const hasSelection = this.state.selectedUpgradeIndex >= 0;
      if (hasSelection) {
        ctx.fillStyle = "#166534";
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
      } else {
        ctx.fillStyle = "#1f2937";
        ctx.strokeStyle = "#374151";
        ctx.lineWidth = 2;
      }
      ctx.fillRect(selBtnX, selBtnY, selBtnW, selBtnH);
      ctx.strokeRect(selBtnX, selBtnY, selBtnW, selBtnH);
      ctx.fillStyle = hasSelection ? "#ffffff" : "#6b7280";
      ctx.font = "bold 22px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText(hasSelection ? "SELECT UPGRADE" : "SELECT A CARD", selBtnX + selBtnW / 2, selBtnY + 34);
    }

    if (
      this.state.transitionState !== "none" &&
      this.state.transitionState !== "cards"
    ) {
      ctx.fillStyle = "#000";
      const r = Math.max(0, this.state.transitionRadius);
      const pxSize = 32;
      for (let y = 0; y < this.canvasHeight; y += pxSize) {
        for (let x = 0; x < this.canvasWidth; x += pxSize) {
          const dx = x + pxSize / 2 - this.canvasWidth / 2;
          const dy = y + pxSize / 2 - this.canvasHeight / 2;
          if (dx * dx + dy * dy >= r * r) {
            ctx.fillRect(x, y, pxSize, pxSize);
          }
        }
      }
    }

    if (this.state.isGameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 48px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        "SYSTEM FAILURE",
        this.canvasWidth / 2,
        this.canvasHeight / 2,
      );
      ctx.font = "24px 'Courier New', Courier, monospace";
      ctx.fillStyle = "#ffffff";

      // Restart button rect
      const btnW = 200;
      const btnH = 50;
      const btnX = this.canvasWidth / 2 - btnW / 2;
      const btnY = this.canvasHeight / 2 + 30;

      const isHover =
        this.state.mouse.x >= btnX &&
        this.state.mouse.x <= btnX + btnW &&
        this.state.mouse.y >= btnY &&
        this.state.mouse.y <= btnY + btnH;

      ctx.fillStyle = isHover ? "#444" : "#222";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.fillRect(btnX, btnY, btnW, btnH);
      ctx.strokeRect(btnX, btnY, btnW, btnH);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px 'Courier New', Courier, monospace";
      ctx.fillText("REBOOT", this.canvasWidth / 2, btnY + 32);
    }

    if (this.state.isWin) {
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      ctx.fillStyle = COLORS.diamond;
      ctx.font = "bold 48px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        "OBJECTIVE COMPLETE",
        this.canvasWidth / 2,
        this.canvasHeight / 2,
      );
      ctx.font = "24px 'Courier New', Courier, monospace";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(
        "True Diamond Secured.",
        this.canvasWidth / 2,
        this.canvasHeight / 2 + 40,
      );
    }

    // --- Pause Menu Modal Overlay ---
    if (this.state.isPaused && !this.isMenuBackground) {
      ctx.fillStyle = "rgba(10, 15, 26, 0.85)";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

      const panelW = 320;
      const panelH = 250;
      const panelX = this.canvasWidth / 2 - panelW / 2;
      const panelY = this.canvasHeight / 2 - panelH / 2;

      // Slate & Cyan Box
      ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
      ctx.fillRect(panelX, panelY, panelW, panelH);
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 3;
      ctx.strokeRect(panelX, panelY, panelW, panelH);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 1;
      ctx.strokeRect(panelX + 4, panelY + 4, panelW - 8, panelH - 8);

      ctx.fillStyle = "#67e8f9";
      ctx.font = "bold 26px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText("GAME PAUSED", this.canvasWidth / 2, panelY + 42);

      const buttons = [
        { text: "RESUME GAME" },
        { text: "SAVE & EXIT" },
        { text: "MAIN MENU" }
      ];

      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const bw = 240;
        const bh = 42;
        const bx = this.canvasWidth / 2 - bw / 2;
        const by = panelY + 68 + i * 52;

        const isHover =
          this.state.mouse.x >= bx &&
          this.state.mouse.x <= bx + bw &&
          this.state.mouse.y >= by &&
          this.state.mouse.y <= by + bh;

        ctx.fillStyle = isHover ? "rgba(6, 182, 212, 0.3)" : "rgba(30, 41, 59, 0.7)";
        ctx.strokeStyle = isHover ? "#22d3ee" : "#334155";
        ctx.lineWidth = 2;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = isHover ? "#67e8f9" : "#e2e8f0";
        ctx.font = "bold 15px 'Courier New', Courier, monospace";
        ctx.fillText(btn.text, this.canvasWidth / 2, by + 26);
      }
    }
  }

  drawHUD() {
    if (!this.ctx || this.isMenuBackground || this.state.isFloorComplete || this.state.transitionState === 'cards' || this.state.transitionState === 'out_to_cards_delay') return;
    const ctx = this.ctx;
    const p = this.state.player;

    ctx.imageSmoothingEnabled = false;
    ctx.textAlign = "left";
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
    ctx.shadowBlur = 0; // Crisp pixel shadow (no blur)
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // --- 1. FREELY FLOATING FLOOR TEXT (Top Center - Scaled 50% bigger = 3px blocks) ---
    ctx.fillStyle = "#94a3b8"; // Faded slate-silver
    ctx.font = "bold 24px 'Courier New', Courier, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`FLOOR ${this.state.floor} / ${this.state.maxFloor}`, Math.floor(this.canvasWidth / 2), 36);
    ctx.textAlign = "left";

    // --- 2. FREELY FLOATING 10 HEARTS (Clean 11x9 Pixel Grid, 3px blocks = 50% bigger than 2px) ---
    const hudX = 20;
    const hudY = 20;
    const hpPerHeart = 10; // 100 HP = 10 Hearts total
    const totalHearts = Math.ceil(p.maxHealth / hpPerHeart);
    const pSize = 3; // 3px per pixel block (50% bigger than 2px legacy)

    const drawPixelHeart = (startX: number, startY: number, state: 'full' | 'half' | 'empty') => {
      const heartMatrix = [
        [0,0,1,1,0,0,0,1,1,0,0],
        [0,1,1,1,1,0,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,1,1,1,0,0],
        [0,0,0,1,1,1,1,1,0,0,0],
        [0,0,0,0,1,1,1,0,0,0,0],
        [0,0,0,0,0,1,0,0,0,0,0],
      ];

      const sx = Math.floor(startX);
      const sy = Math.floor(startY);

      // Outer 1-block dark border outline
      ctx.fillStyle = "#1e1b1e";
      for (let r = 0; r < heartMatrix.length; r++) {
        for (let c = 0; c < heartMatrix[r].length; c++) {
          if (heartMatrix[r][c] === 1) {
            const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dx, dy] of offsets) {
              const nr = r + dy;
              const nc = c + dx;
              if (nr < 0 || nr >= heartMatrix.length || nc < 0 || nc >= heartMatrix[0].length || heartMatrix[nr][nc] === 0) {
                ctx.fillRect(sx + nc * pSize, sy + nr * pSize, pSize, pSize);
              }
            }
          }
        }
      }

      // Heart Fill Blocks
      for (let r = 0; r < heartMatrix.length; r++) {
        for (let c = 0; c < heartMatrix[r].length; c++) {
          if (heartMatrix[r][c] === 1) {
            const isLeftHalf = c < 5;
            let cellColor = "#2d1618"; // Dark empty

            if (state === 'full') {
              cellColor = "#dc2626"; // Full ruby red
            } else if (state === 'half') {
              cellColor = isLeftHalf ? "#dc2626" : "#2d1618";
            }

            ctx.fillStyle = cellColor;
            ctx.fillRect(sx + c * pSize, sy + r * pSize, pSize, pSize);

            // Glossy Pixel Specular Highlight at (col 2, row 1)
            if ((state === 'full' || (state === 'half' && isLeftHalf)) && r === 1 && c === 2) {
              ctx.fillStyle = "#f87171";
              ctx.fillRect(sx + c * pSize, sy + r * pSize, pSize, pSize);
            }
          }
        }
      }
    };

    const heartSpacing = 11 * pSize + 6; // 39px spacing
    for (let i = 0; i < totalHearts; i++) {
      const hx = hudX + i * heartSpacing;
      const hy = hudY;
      const hpInHeart = p.health - i * hpPerHeart;

      let state: 'full' | 'half' | 'empty' = 'empty';
      if (hpInHeart >= hpPerHeart) state = 'full';
      else if (hpInHeart >= hpPerHeart / 2) state = 'half';

      drawPixelHeart(hx, hy, state);
    }

    // Exact Numeric HP Readout
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 18px 'Courier New', Courier, monospace";
    ctx.fillText(`${Math.max(0, p.health)} / ${p.maxHealth} HP`, hudX + totalHearts * heartSpacing + 12, hudY + 22);

    // --- 3. FREELY FLOATING ACTIVE ITEM TEXT (1.5x Scale) ---
    const activeBadgeY = hudY + 46;

    ctx.fillStyle = "#94a3b8"; // Soft faded slate
    ctx.font = "bold 18px 'Courier New', Courier, monospace";
    const currentItem = p.hotbar[p.activeSlot];
    let displayItemName = "UNARMED";
    if (p.clawsActive) displayItemName = "RIP & TEAR CLAWS";
    else if (currentItem) {
      displayItemName = currentItem.toUpperCase().replace(/_/g, ' ');
    }
    ctx.fillText(`ACTIVE: ${displayItemName}`, hudX, activeBadgeY + 18);

    // Oxygen Meter (When submerged underwater/liquid)
    if (p.oxygen < p.maxOxygen) {
      const oxBarW = 160;
      const oxBarH = 10;
      const oxRatio = Math.max(0, p.oxygen / p.maxOxygen);
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(hudX, activeBadgeY + 26, oxBarW, oxBarH);
      ctx.fillStyle = oxRatio < 0.25 ? "#ef4444" : "#38bdf8";
      ctx.fillRect(hudX + 2, activeBadgeY + 28, (oxBarW - 4) * oxRatio, oxBarH - 4);
      ctx.strokeStyle = "#7dd3fc";
      ctx.lineWidth = 1;
      ctx.strokeRect(hudX, activeBadgeY + 26, oxBarW, oxBarH);
      ctx.fillStyle = "#e0f2fe";
      ctx.font = "bold 12px 'Courier New', Courier, monospace";
      ctx.fillText(`O2: ${Math.ceil(p.oxygen)}%`, hudX + oxBarW + 8, activeBadgeY + 35);
    }

    let nextHUDY = activeBadgeY + 48;

    // Super Abilities & Buff Status (1.5x Scale)
    const drawAbilityPanel = (title: string, has: boolean, active: boolean, timer: number, cooldown: number, maxTimer: number, maxCooldown: number, keyChar: string) => {
      if (!has) return;
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "bold 16px 'Courier New', Courier, monospace";
      ctx.fillText(title, hudX, nextHUDY + 16);

      if (active) {
        ctx.fillStyle = "#d97706";
        ctx.fillText(`ACTIVE: ${Math.ceil(timer / 60)}s`, hudX + 160, nextHUDY + 16);
      } else if (cooldown > 0) {
        ctx.fillStyle = "#ef4444";
        ctx.fillText(`CD: ${Math.ceil(cooldown / 60)}s`, hudX + 160, nextHUDY + 16);
      } else {
        ctx.fillStyle = "#22c55e";
        ctx.fillText(`READY [${keyChar}]`, hudX + 160, nextHUDY + 16);
      }
      nextHUDY += 32;
    };

    drawAbilityPanel("MALEVOLENCE", p.hasMalevolence, p.malevolenceActive, p.malevolenceTimer, p.malevolenceCooldown, 900, 6000, "Q");
    drawAbilityPanel("IMPENETRABLE", p.hasImpenetrable, p.impenetrableActive, p.impenetrableTimer, p.impenetrableCooldown, 1200, 6600, "Z");
    drawAbilityPanel("SUPERSONIC", p.hasSupersonic, p.supersonicActive, p.supersonicTimer, p.supersonicCooldown, 600, 7500, "X");

    // Fire Immunity status
    if (p.fireImmunityTimer && p.fireImmunityTimer > 0) {
      ctx.fillStyle = "#f97316";
      ctx.font = "bold 16px 'Courier New', Courier, monospace";
      ctx.fillText(`FIRE IMMUNITY: ${Math.ceil(p.fireImmunityTimer / 60)}s`, hudX, nextHUDY + 16);
      nextHUDY += 32;
    }

    // Speed Potion Swiftness Buff Status
    if (p.speedPotionTimer && p.speedPotionTimer > 0) {
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 16px 'Courier New', Courier, monospace";
      ctx.fillText(`SWIFTNESS: ${Math.ceil(p.speedPotionTimer / 60)}s`, hudX, nextHUDY + 16);
      nextHUDY += 32;
    }

    // Poison status
    if (p.poisonTimer > 0) {
      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 16px 'Courier New', Courier, monospace";
      ctx.fillText(`POISONED: ${Math.ceil(p.poisonTimer / 60)}s`, hudX, nextHUDY + 16);
      nextHUDY += 32;
    }

    if (p.burnTimer > 0) {
      ctx.fillStyle = "#f97316";
      ctx.font = "bold 16px 'Courier New', Courier, monospace";
      ctx.fillText(`BURNING: ${Math.ceil(p.burnTimer / 60)}s`, hudX, nextHUDY + 16);
      nextHUDY += 32;
    }

    if (p.slownessTimer > 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 16px 'Courier New', Courier, monospace";
      ctx.fillText(`SLOWED: ${Math.ceil(p.slownessTimer / 60)}s`, hudX, nextHUDY + 16);
      nextHUDY += 32;
    }

    // Diamond status
    if (p.hasDiamond) {
      ctx.fillStyle = COLORS.diamond;
      ctx.font = "bold 18px 'Courier New', Courier, monospace";
      ctx.fillText("[TRUE DIAMOND SECURED]", hudX, nextHUDY + 16);
    }

    ctx.restore();

    // --- Hotbar Slots Rendering (3 SLOTS, Bottom-Center - 1.5x Scale) ---
    const midX = Math.floor(this.canvasWidth / 2);
    const slotW = 81; // 54 * 1.5
    const slotH = 81; // 54 * 1.5
    const slotGap = 15; // 10 * 1.5
    const hotbarY = this.canvasHeight - slotH - 25;
    const totalHotbarW = 3 * slotW + 2 * slotGap;
    const startHotbarX = midX - Math.floor(totalHotbarW / 2);

    const drawItemIcon = (x: number, y: number, type: WeaponType) => {
      ctx.save();
      ctx.translate(Math.floor(x + slotW / 2), Math.floor(y + slotH / 2));
      ctx.scale(1.5, 1.5); // 1.5x Item Icon Scale!

      if (type === 'sword') {
        const gemColor = p.playerColor || "#ea580c";

        // Double-edged silver broadsword blade
        ctx.fillStyle = "#f8fafc"; // Tip highlight
        ctx.fillRect(-1, -17, 2, 3);

        ctx.fillStyle = "#f1f5f9"; // Left blade highlight
        ctx.fillRect(-3, -14, 3, 16);

        ctx.fillStyle = "#cbd5e1"; // Fuller ridge
        ctx.fillRect(0, -14, 1, 16);

        ctx.fillStyle = "#94a3b8"; // Right blade shadow
        ctx.fillRect(1, -14, 2, 16);

        // Silver winged crossguard
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(-8, 2, 16, 3);
        ctx.fillStyle = "#64748b";
        ctx.fillRect(-8, 5, 16, 1);

        // Center Gem Housing (White/Silver Frame)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-3, 0, 6, 6);

        // Player Color Gem Core (Cross Shape)
        ctx.fillStyle = gemColor;
        ctx.fillRect(-2, 1, 4, 4);
        ctx.fillStyle = "#ffffff"; // Top-left specular dot
        ctx.fillRect(-2, 1, 1, 1);

        // Wrapped Leather Handle / Grip
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-2, 6, 4, 7);
        ctx.fillStyle = "#451a03";
        ctx.fillRect(0, 6, 2, 7);

        // Diamond Steel Pommel with Gem Dot
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(-3, 13, 6, 3);
        ctx.fillRect(-2, 16, 4, 2);
        ctx.fillStyle = gemColor;
        ctx.fillRect(-1, 14, 2, 2);
      } else if (type === 'bow') {
        // High-Detail Polished Oak Bow & Silver String
        ctx.fillStyle = "#451a03";
        ctx.fillRect(-2, -2, 4, 4);
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-6, -14, 3, 28);
        ctx.fillStyle = "#b45309";
        ctx.fillRect(-5, -12, 2, 24);
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(-6, -15, 3, 2);
        ctx.fillRect(-6, 13, 3, 2);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(-4, -14, 1, 28);
        // Arrow
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(0, -2, 4, 4);
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-12, -1, 12, 2);
        ctx.fillStyle = "#10b981";
        ctx.fillRect(-14, -2, 3, 4);
      } else if (type === 'colossal_sword') {
        // High-Detail Chiseled Colossal Greatsword
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(-4, -18, 2, 22);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(-2, -18, 4, 22);
        ctx.fillStyle = "#475569";
        ctx.fillRect(2, -18, 2, 22);
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(-8, 4, 16, 4);
        ctx.fillStyle = "#b45309";
        ctx.fillRect(-8, 7, 16, 1);
        ctx.fillStyle = "#451a03";
        ctx.fillRect(-2, 8, 4, 8);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(-3, 16, 6, 3);
      } else if (type === 'dual_daggers') {
        // High-Detail Serrated Assassin Daggers
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(-8, -12, 2, 12);
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(-6, -12, 2, 12);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(-8, 0, 4, 2);
        ctx.fillStyle = "#451a03";
        ctx.fillRect(-7, 2, 2, 4);

        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(4, -12, 2, 12);
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(6, -12, 2, 12);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(4, 0, 4, 2);
        ctx.fillStyle = "#451a03";
        ctx.fillRect(5, 2, 2, 4);
      } else if (type === 'mace') {
        // High-Detail Spiked Iron Morningstar Mace
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-2, -4, 4, 18);
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(-6, -14, 12, 10);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(-4, -14, 8, 10);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(-8, -11, 2, 4);
        ctx.fillRect(6, -11, 2, 4);
        ctx.fillRect(-2, -16, 4, 2);
      } else if (type === 'battle_axe') {
        // High-Detail Double-Bitted Steel Battle Axe
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-2, -10, 4, 26);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(-10, -12, 3, 12);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(-7, -10, 5, 8);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(7, -12, 3, 12);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(2, -10, 5, 8);
        ctx.fillStyle = "#d97706";
        ctx.fillRect(-1, -8, 2, 4);
      } else if (type === 'torch') {
        // High-Detail Torch & Animated 3-Tone Flame
        ctx.fillStyle = "#451a03";
        ctx.fillRect(-2, -4, 4, 18);
        ctx.fillStyle = "#475569";
        ctx.fillRect(-4, -4, 8, 3);
        const fCycle = Math.floor(Date.now() / 100) % 3;
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(-5, -13, 10, 9);
        ctx.fillStyle = "#f97316";
        ctx.fillRect(-3, -11, 6, 7);
        ctx.fillStyle = "#fcd34d";
        ctx.fillRect(-1, -9, 2, 4);
      } else if (type === 'health_potion') {
        // High-Detail Glass Flask & Ruby Health Elixir
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-2, -14, 4, 3);
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.fillRect(-3, -11, 6, 4);
        ctx.fillStyle = "#991b1b";
        ctx.fillRect(-7, -7, 14, 14);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(-6, -6, 12, 12);
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.fillRect(-5, -5, 2, 5);
      } else if (type === 'speed_potion') {
        // High-Detail Glass Flask & Electric Blue Speed Elixir
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-2, -14, 4, 3);
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.fillRect(-3, -11, 6, 4);
        ctx.fillStyle = "#0284c7";
        ctx.fillRect(-7, -7, 14, 14);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(-6, -6, 12, 12);
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.fillRect(-5, -5, 2, 5);
      } else if (type === 'lava_flask') {
        // Glowing Obsidian Draught Fire Immunity Flask
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-2, -14, 4, 3);
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.fillRect(-3, -11, 6, 4);
        ctx.fillStyle = "#7f1d1d";
        ctx.fillRect(-7, -7, 14, 14);
        ctx.fillStyle = "#ea580c";
        ctx.fillRect(-6, -6, 12, 12);
        ctx.fillStyle = "#fef08a";
        ctx.fillRect(-3, -2, 6, 6);
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.fillRect(-5, -5, 2, 5);
      } else if (type === 'magma_orb') {
        // Crackling Incendiary Magma Bomb Orb
        ctx.fillStyle = "#1c1917";
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ea580c";
        ctx.fillRect(-5, -3, 10, 6);
        ctx.fillStyle = "#fef08a";
        ctx.fillRect(-3, -1, 6, 2);
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(-1, -5, 2, 10);
      } else if (type === 'bomb') {
        // High-Detail Cast Iron Bomb & Sparking Fuse
        ctx.fillStyle = "#d97706";
        ctx.fillRect(-2, -10, 4, 3);
        ctx.fillStyle = "#78350f";
        ctx.fillRect(-1, -14, 2, 4);
        ctx.fillStyle = "#f97316";
        ctx.fillRect(-2, -16, 4, 2);
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(0, 2, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.beginPath();
        ctx.arc(-3, -2, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === 'shield') {
        // High-Detail Reinforced Steel Kite Shield
        ctx.fillStyle = "#334155";
        ctx.beginPath();
        ctx.moveTo(0, 12);
        ctx.lineTo(-9, -10);
        ctx.lineTo(9, -10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#cbd5e1";
        ctx.strokeRect(-9, -10, 18, 20);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(-2, -6, 4, 12);
        ctx.fillRect(-6, -2, 12, 4);
      } else if (type === 'frozen_sword') {
        // Legendary Frozen Sword
        ctx.fillStyle = "#e0f2fe";
        ctx.fillRect(-1, -17, 2, 3);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(-3, -14, 6, 16);
        ctx.fillStyle = "#7dd3fc";
        ctx.fillRect(-1, -14, 2, 16);
        ctx.fillStyle = "#0284c7";
        ctx.fillRect(-8, 2, 16, 3);
        ctx.fillStyle = "#e0f2fe";
        ctx.fillRect(-3, 12, 6, 3);
      } else if (type === 'molten_axe') {
        // Legendary Molten Axe
        ctx.fillStyle = "#451a03";
        ctx.fillRect(-2, -10, 4, 26);
        ctx.fillStyle = "#fef08a";
        ctx.fillRect(-10, -12, 3, 12);
        ctx.fillRect(7, -12, 3, 12);
        ctx.fillStyle = "#ea580c";
        ctx.fillRect(-7, -10, 14, 8);
      }

      ctx.restore();
    };

    for (let i = 0; i < 3; i++) {
      const slotX = startHotbarX + i * (slotW + slotGap);
      const isActive = p.activeSlot === i;

      // Faded Muted Slate Slot Background
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.fillRect(slotX, hotbarY, slotW, slotH);

      if (isActive) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 3;
        ctx.strokeRect(slotX, hotbarY, slotW, slotH);
      } else {
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(slotX, hotbarY, slotW, slotH);
      }

      // Slot Number Label [1], [2], [3] (1.5x Scale)
      ctx.fillStyle = isActive ? "#38bdf8" : "#64748b";
      ctx.font = "bold 15px 'Courier New', Courier, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`[${i + 1}]`, slotX + 6, hotbarY + 18);

      const item = p.hotbar[i];
      if (item !== null) {
        drawItemIcon(slotX, hotbarY, item);
      }
    }

    // Faded Muted Hotbar Label (1.5x Scale)
    ctx.textAlign = "center";
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 15px 'Courier New', Courier, monospace";
    ctx.fillText("HOTBAR (1 - 3)", midX, hotbarY - 8);
  }

  drawAfterimages() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const p = this.state.player;
    const zoom = this.state.camera.zoom;
    if (!p.afterimages || p.afterimages.length === 0) return;

    for (let i = 0; i < p.afterimages.length; i++) {
      const img = p.afterimages[i];
      if (img.alpha <= 0) continue;

      ctx.save();
      ctx.globalAlpha = img.alpha * 0.65;

      const cx = img.x + p.w / 2;
      const cy = img.y + p.h / 2;

      ctx.translate(
        Math.round(img.x * zoom) / zoom - img.x,
        Math.round(img.y * zoom) / zoom - img.y,
      );

      ctx.translate(cx, cy);
      if (!img.facingRight) {
        ctx.scale(-1, 1);
      }
      ctx.translate(-cx, -cy);

      // Ethereal Cyan / Blue Hyper Perception Afterimage Trail (matching reference image!)
      const ghostColor = p.supersonicActive ? "#00f0ff" : "#38bdf8";
      ctx.shadowColor = "#00f0ff";
      ctx.shadowBlur = 10;

      // Iron body armor
      ctx.fillStyle = ghostColor;
      ctx.fillRect(img.x + 3, img.y + 9 + img.bob, p.w - 6, p.h - 13);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(img.x + 5, img.y + 10 + img.bob, p.w - 10, p.h - 16);

      // Gold shoulder pauldrons
      ctx.fillStyle = ghostColor;
      ctx.fillRect(img.x + 2, img.y + 9 + img.bob, 3, 4);
      ctx.fillRect(img.x + p.w - 5, img.y + 9 + img.bob, 3, 4);

      // Leather belt with gold buckle
      ctx.fillStyle = "#78350f";
      ctx.fillRect(img.x + 4, img.y + 16 + img.bob, p.w - 8, 2);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(img.x + p.w / 2 - 2, img.y + 16 + img.bob, 4, 2);

      // Great helm
      ctx.fillStyle = ghostColor;
      ctx.fillRect(img.x + 2, img.y + img.bob, p.w - 4, 13);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(img.x + 8, img.y + 4 + img.bob, p.w - 9, 3);
      ctx.fillRect(img.x + 13, img.y + 4 + img.bob, 3, 6);

      // Boots
      ctx.fillStyle = ghostColor;
      ctx.fillRect(img.x + 4, img.y + p.h - 4, 5, 4);
      ctx.fillRect(img.x + p.w - 9, img.y + p.h - 4, 5, 4);

      // Trailing weapon silhouette
      if (img.weaponEquipped && img.weapon) {
        ctx.fillStyle = ghostColor;
        if (img.weapon === "colossal_sword") {
          ctx.fillRect(img.x + p.w - 3, img.y - 12 + img.bob, 6, 24);
        } else if (img.weapon === "dual_daggers") {
          ctx.fillRect(img.x - 4, img.y + 6 + img.bob, 3, 6);
          ctx.fillRect(img.x + p.w - 1, img.y + 8 + img.bob, 3, 6);
        } else {
          ctx.fillRect(img.x + p.w - 2, img.y - 2 + img.bob, 4, 14);
        }
      }

      ctx.restore();
    }
  }
}
