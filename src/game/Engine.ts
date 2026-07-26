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

export function isWeapon(type: WeaponType | null): boolean {
  if (!type) return false;
  return ['sword', 'bow', 'colossal_sword', 'dual_daggers', 'mace', 'battle_axe'].includes(type);
}

export class GameEngine {
  state: GameState;
  ctx: CanvasRenderingContext2D | null = null;
  lightCanvas?: HTMLCanvasElement;
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

    p.x = rp.x;
    p.y = rp.y;
    p.vx = rp.vx;
    p.vy = rp.vy;
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
  }

  initMenuBackground() {
    this.isMenuBackground = true;
    this.state = this.getInitialState();
    this.initFloor(1);
    this.state.isPaused = false;
    this.state.transitionState = "none";
    this.state.floorTitleState = "none";
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
      camera: { x: 0, y: 0, zoom: 1 },
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
    };
  }

  initFloor(floor: number) {
    const gen = generateCave(floor, this.state.maxFloor);

    // Transition in
    this.state.transitionState = "in";
    this.state.transitionRadius = 0;

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

    // Reset camera zoom and timer states upon descending
    this.state.camera.zoom = 1;
    this.state.gateEntered = false;
    this.state.gateTimer = 0;
    this.state.frostTimer = 0;

    this.state.enemies = [];
    this.state.particles = [];
    this.state.projectiles = [];
    this.state.droppedWeapons = [];
    this.state.chests = gen.chests ? gen.chests.map((c, idx) => {
      let chestItem: WeaponType;
      if (Math.random() < 0.55) {
        const itemPool: WeaponType[] = ['torch', 'health_potion', 'speed_potion', 'bomb', 'shield'];
        chestItem = itemPool[Math.floor(Math.random() * itemPool.length)];
      } else {
        const weaponPool: WeaponType[] = ['sword', 'bow', 'colossal_sword', 'dual_daggers', 'mace', 'battle_axe'];
        chestItem = weaponPool[Math.floor(Math.random() * weaponPool.length)];
      }
      return {
        id: `chest_${floor}_${idx}`,
        x: c.x * TILE_SIZE + 4,
        y: c.y * TILE_SIZE + 14,
        w: 24,
        h: 18,
        isOpen: false,
        weapon: chestItem
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
        health: isBig ? 100 : isTank ? 45 : isFlying ? 20 : 30,
        maxHealth: isBig ? 100 : isTank ? 45 : isFlying ? 20 : 30,
        facingRight: Math.random() > 0.5,
        isGrounded: false,
        invulnerableTimer: 0,
        stateTimer: 0,
        onLadder: false,
        aiState: "idle",
      });
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
  }

  spawnParticles(x: number, y: number, color: string, amount: number) {
    for (let i = 0; i < amount; i++) {
      this.state.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: Math.random() * 20 + 10,
        maxLife: 30,
        color,
        size: Math.random() * 4 + 2,
      });
    }
  }

  update() {
    if (this.isMenuBackground) {
      this.state.frameCounter++;
      const panSpeed = 0.6;
      this.state.camera.x += panSpeed;
      if (this.state.camera.x > (this.state.width * TILE_SIZE) - 400) {
        this.state.camera.x = 200;
      }
      this.state.camera.y = (this.state.height * TILE_SIZE) / 2;
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
    } else if (this.state.transitionState === "out") {
      this.state.transitionRadius -= 25;
      if (this.state.transitionRadius <= 0) {
        this.state.isFloorComplete = false;
        this.initFloor(this.state.floor + 1);
      }
      return; // Pause game while transitioning out
    } else if (this.state.transitionState === "out_to_cards") {
      this.state.transitionRadius -= 25;
      if (this.state.transitionRadius <= 0) {
        this.state.transitionState = "out_to_cards_delay";
        this.state.transitionDelayTimer = 0;
      }
      return;
    } else if (this.state.transitionState === "out_to_cards_delay") {
      this.state.transitionDelayTimer = (this.state.transitionDelayTimer || 0) + 1;
      if (this.state.transitionDelayTimer >= 60) { // 60 frames = 1 second
        this.state.transitionState = "cards";
        this.state.isFloorComplete = true;
        this.generateUpgrades();
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("floorCompleted", {
              detail: { maxFloor: this.state.floor + 1 },
            }),
          );
        }
      }
      return;
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

      // Handle Upgrade Clicks
      if (this.state.mouse.clicked) {
        const cardWidth = 200;
        const cardHeight = 280;
        const gap = 40;
        const startX = this.canvasWidth / 2 - (cardWidth * 1.5 + gap);
        const startY = this.canvasHeight / 2 - cardHeight / 2;

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
      for (let y = 0; y < this.state.height; y++) {
        for (let x = 0; x < this.state.width; x++) {
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
      this.state.floorTitleState !== "none" ||
      this.state.transitionState !== "none" ||
      this.state.gateEntered;

    // Check if player is in water or on ladder
    let inWater = false;
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
    }

    let potionSpeedMult = 1;
    if (p.speedPotionTimer && p.speedPotionTimer > 0) {
      p.speedPotionTimer--;
      potionSpeedMult = 1.20;
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

    const effectiveSpeedMulti = p.speedMulti * weaponSpeedMult * superSpeedMult * potionSpeedMult;
    const effectiveJumpMulti = p.jumpMulti * weaponJumpMult * superJumpMult;

    if (this.state.floorTitleState === "none") {
      p.facingRight = this.state.mouse.worldX > p.x + p.w / 2;
    }

    if (!isStunned) {
      const accel = (inWater ? 0.8 : 1.5) * effectiveSpeedMulti;
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

    if (!isStunned && (!p.onLadder || (p.onLadder && justPressedJump))) {
      // Jump
      const isJumpHeld = keys["w"] || keys["ArrowUp"] || keys[" "];

      if (justPressedJump) {
        const scaledJump = JUMP_POWER * effectiveJumpMulti;
        if (p.isGrounded || (p.onLadder && p.vy > scaledJump + 2)) {
          p.vy = scaledJump;
          p.isGrounded = false;
          isClimbing = false;
          this.spawnParticles(p.x + p.w / 2, p.y + p.h, COLORS.wallAccent, 5);
        } else if (inWater) {
          p.vy = scaledJump * 0.8; // Better swim jump
          isClimbing = false;
          this.spawnParticles(p.x + p.w / 2, p.y, "rgba(0, 255, 200, 0.5)", 5);
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
            COLORS.wallAccent,
            5,
          );
        }
      }

      if (inWater && isJumpHeld) {
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

    // Hotbar: Press 1, 2, or 3 to switch slots / toggle equip
    if (keys["1"] && !prevKeys["1"]) {
      if (p.activeSlot === 0) {
        p.weaponEquipped = !p.weaponEquipped;
      } else {
        p.activeSlot = 0;
        p.weaponEquipped = true;
      }
      p.weapon = p.hotbar[0] || undefined;
    } else if (keys["2"] && !prevKeys["2"]) {
      if (p.activeSlot === 1) {
        p.weaponEquipped = !p.weaponEquipped;
      } else {
        p.activeSlot = 1;
        p.weaponEquipped = true;
      }
      p.weapon = p.hotbar[1] || undefined;
    } else if (keys["3"] && !prevKeys["3"]) {
      if (p.activeSlot === 2) {
        p.weaponEquipped = !p.weaponEquipped;
      } else {
        p.activeSlot = 2;
        p.weaponEquipped = true;
      }
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
        const healAmt = 40;
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
        p.speedPotionTimer = 900; // 15 seconds
        p.itemUseCooldown = 20;
        this.state.texts.push({
          x: p.x + p.w / 2,
          y: p.y - 15,
          text: "SWIFTNESS!",
          life: 60,
          maxLife: 60
        });
        this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, "#38bdf8", 20);
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

      p.isAttacking = true;
      p.isAirAttacking = false;
      p.attackAngle = Math.atan2(this.state.mouse.worldY - (p.y + p.h / 2), this.state.mouse.worldX - (p.x + p.w / 2));

      if (p.clawsActive) {
        p.attackTimer = 4;
      } else {
        p.attackTimer = isColossal ? 20 : (isDaggers ? 6 : (isAxe ? 12 : 10));
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
          p.attackCooldown = p.weapon === 'colossal_sword' ? 50 : (p.weapon === 'dual_daggers' ? 5 : (p.weapon === 'battle_axe' ? 15 : 12));
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
    p.vx *= inWater ? 0.8 : FRICTION;
    if (!isClimbing) {
      if (inWater) {
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

    p.x = res.x;
    p.y = res.y;
    p.vx = res.vx;
    p.vy = brokeIce ? oldVy * 0.5 : res.vy;
    p.isGrounded = brokeIce
      ? false
      : res.grounded || (p.onLadder && isClimbing && p.vy === 0);

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

          this.spawnParticles(ex, ey, COLORS.blood, 10);
          this.state.texts.push({
            x: e.x,
            y: e.y - 10,
            text: Math.round(finalDamage).toString(),
            life: 30,
            maxLife: 30,
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
    }

    if (p.isAirAttacking) {
      const scaleHeight = p.clawsActive ? 3.0 : (p.weapon === 'colossal_sword' ? 4.5 : (p.weapon === 'dual_daggers' ? 1.5 : 3.0));
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
        e.health -= finalDamage;
        e.invulnerableTimer = p.clawsActive ? 8 : (p.weapon === 'dual_daggers' ? 6 : 10);
        e.vx = p.facingRight ? knockback : -knockback;
        e.vy = p.clawsActive ? -4 : (p.weapon === 'colossal_sword' ? -5 : -3);
        
        // Claws have red VFX particles!
        const pColor = p.clawsActive ? "#ff0000" : (e.type === "slime" || e.type === "frost_slime" || e.type === "moss_slime" ? COLORS.slime : COLORS.blood);
        this.spawnParticles(
          e.x + e.w / 2,
          e.y + e.h / 2,
          pColor,
          p.clawsActive ? 15 : (p.weapon === 'colossal_sword' ? 20 : 10)
        );
        
        this.state.texts.push({
          x: e.x,
          y: e.y - 10,
          text: Math.round(finalDamage).toString(),
          life: 30,
          maxLife: 30,
        });
        this.state.shakeTimer = p.clawsActive ? 8 : (p.weapon === 'colossal_sword' ? 12 : 5);
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
        maxLife: 60
      });
      
      // Spawn shield shatter particles
      this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, "rgba(100, 200, 255, 0.8)", 30);
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
    this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, particleColor, 15);

    this.state.texts.push({
      x: p.x,
      y: p.y - 20,
      text: `-${finalDamage} HP`,
      life: 45,
      maxLife: 45
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
          [1, 7, 8, 11, 15, 16, 17, 18].includes(this.state.map[ty][tx]))
      ) {
        hitWall = true;
      }

      if (proj.type === 'bomb') {
        proj.vy += 0.25; // gravity
        proj.timer = (proj.timer || 90) - 1;
        this.spawnParticles(proj.x + proj.w / 2, proj.y + proj.h / 2, "#f59e0b", 1);

        if (hitWall || proj.timer <= 0) {
          const bx = proj.x + proj.w / 2;
          const by = proj.y + proj.h / 2;
          this.state.shakeTimer = 20;
          this.spawnParticles(bx, by, "#ef4444", 20);
          this.spawnParticles(bx, by, "#f97316", 20);
          this.spawnParticles(bx, by, "#eab308", 15);

          for (const e of this.state.enemies) {
            const dist = Math.hypot(e.x + e.w / 2 - bx, e.y + e.h / 2 - by);
            if (dist < 70) {
              const dmg = Math.round(proj.damage * p.damageMulti);
              e.health -= dmg;
              e.invulnerableTimer = 10;
              e.vx = (e.x + e.w / 2 > bx ? 1 : -1) * 6;
              e.vy = -4;
              this.spawnParticles(e.x + e.w / 2, e.y + e.h / 2, "#f97316", 10);
              this.state.texts.push({
                x: e.x,
                y: e.y - 10,
                text: dmg.toString(),
                life: 30,
                maxLife: 30
              });
            }
          }
          this.state.projectiles.splice(i, 1);
          continue;
        }
      } else if (hitWall) {
        this.spawnParticles(proj.x + (proj.w || 8) / 2, proj.y + (proj.h || 8) / 2, "rgba(200, 200, 200, 0.4)", 4);
        this.state.projectiles.splice(i, 1);
        continue;
      }

      if (proj.type === "magma") {
        this.spawnParticles(proj.x, proj.y, "#f97316", 1);
        if (p.invulnerableTimer <= 0 && rectIntersect({ x: proj.x - 4, y: proj.y - 4, w: 8, h: 8 }, p)) {
          this.damagePlayer(proj.damage, Math.sign(proj.vx) || 1, 8, -4, "#f97316");
          this.spawnParticles(proj.x, proj.y, "#ef4444", 8);
          this.state.projectiles.splice(i, 1);
          continue;
        }
      }

      let hitEnemy = false;
      for (const e of this.state.enemies) {
        if (e.invulnerableTimer > 0) continue;
        if (rectIntersect(proj, e)) {
          const finalDamage = proj.damage * p.damageMulti;
          e.health -= finalDamage;
          e.invulnerableTimer = 10;
          e.vx = proj.vx !== 0 ? Math.sign(proj.vx) * 3 : (p.facingRight ? 3 : -3);
          e.vy = -2;

          this.spawnParticles(
            e.x + e.w / 2,
            e.y + e.h / 2,
            e.type === "slime" ? COLORS.slime : COLORS.blood,
            8
          );

          this.state.texts.push({
            x: e.x,
            y: e.y - 10,
            text: Math.round(finalDamage).toString(),
            life: 30,
            maxLife: 30,
          });

          this.state.shakeTimer = Math.max(this.state.shakeTimer, 3);
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

      let distToPlayer = Math.hypot(p.x - e.x, p.y - e.y);

      if (
        e.type === "slime" ||
        e.type === "frost_slime" ||
        e.type === "moss_slime"
      ) {
        e.vy += GRAVITY;
        if (e.isGrounded && e.stateTimer <= 0) {
          // If player in sight, target player; otherwise stroll left/right randomly
          const dir = distToPlayer < 850 ? (p.x > e.x ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);
          e.facingRight = dir > 0;
          e.vy =
            e.type === "frost_slime" ? -4 : e.type === "moss_slime" ? -4.5 : -3.5;
          e.vx =
            dir *
            (e.type === "frost_slime" ? 6 : e.type === "moss_slime" ? 7.5 : 4.5);
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
            : e.type === "yeti"
              ? 12 // Yeti damage adjusted x0.65 (18 -> 12)
              : e.type === "frost_slime"
                ? 8
                : 5;
        const kbDir = p.x + p.w / 2 > e.x + e.w / 2 ? 1 : -1;
        const kbForceX = e.type === "yeti" ? 12 : 8; // Yeti rework: 12 knockback force
        const kbForceY = e.type === "yeti" ? -7 : -5;
        const pColor = e.type === "slime" || e.type === "frost_slime" || e.type === "moss_slime" ? COLORS.slime : COLORS.blood;
        this.damagePlayer(damage, kbDir, kbForceX, kbForceY, pColor);
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
          p.vx += (dx / dist) * 0.2;
          p.vy += (dy / dist) * 0.2;
          p.vx *= 0.95;
          p.vy *= 0.95;
        }
      }
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) this.state.particles.splice(i, 1);
    }
    for (let i = this.state.texts.length - 1; i >= 0; i--) {
      let t = this.state.texts[i];
      t.y -= 0.5;
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

  updateCamera() {
    const targetX = this.state.player.x + this.state.player.w / 2;
    const targetY = this.state.player.y + this.state.player.h / 2;

    this.state.camera.x += (targetX - this.state.camera.x) * 0.1;
    this.state.camera.y += (targetY - this.state.camera.y) * 0.1;

    let targetZoom = 1.0;
    if (this.state.gateEntered) {
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
    const p = this.state.player;

    // Clear bg
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    // Camera transform
    ctx.save();

    // Screen shake
    let shakeX = 0,
      shakeY = 0;
    if (this.state.shakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * 10;
      shakeY = (Math.random() - 0.5) * 10;
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
        if (this.state.bgMap[y] && this.state.bgMap[y][x] === 9) {
          // Rustic Wooden Planks Background
          ctx.fillStyle = "#3b2518"; // dark wood background
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 1, TILE_SIZE + 1); // ponytail: overlap to prevent gaps
          ctx.fillStyle = "#26170e"; // darker plank gaps
          // Draw horizontal plank lines
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + 7, TILE_SIZE + 1, 2);
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + 15, TILE_SIZE + 1, 2);
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + 23, TILE_SIZE + 1, 2);
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + 31, TILE_SIZE + 1, 2);
          // Draw vertical nails or plank ends occasionally
          ctx.fillStyle = "#1c100a";
          if ((x + y) % 3 === 0) {
            ctx.fillRect(x * TILE_SIZE + 8, y * TILE_SIZE, 2, TILE_SIZE + 1);
          }
        } else {
          const isIceBg = this.state.biome === "ice";
          const isMossBg = this.state.biome === "moss";
          const bgHue = isIceBg
            ? 210
            : isMossBg
              ? 120
              : 15 + ((this.state.floor * 15) % 25);
          const baseSat = isIceBg ? 30 : isMossBg ? 40 : 15;
          const baseLight = isIceBg ? 12 : isMossBg ? 6 : 8;

          // Render background in 8x8 chunks for "mini blocks" look
          for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
              const bgX = x * 4 + i;
              const bgY = y * 4 + j;

              // Using sine patterns as a pseudo noise
              const baseNoise =
                Math.sin(bgX * 0.2 + bgY * 0.15) *
                Math.cos(bgX * 0.3 - bgY * 0.1);
              const mossNoise =
                Math.sin(bgX * 0.05 + bgY * 0.08) *
                  Math.cos(bgX * 0.1 - bgY * 0.04) +
                Math.sin(bgX * 0.15 + bgY * 0.2) * 0.5;

              let color = `hsl(${bgHue}, ${baseSat}%, ${baseLight}%)`; // Default dark rock

              if (baseNoise > 0.4) {
                color = `hsl(${bgHue}, ${baseSat}%, ${baseLight - 2}%)`; // slightly darker
              } else if (baseNoise < -0.4) {
                color = `hsl(${bgHue}, ${baseSat}%, ${baseLight + 2}%)`; // slightly lighter
              }

              const px = x * TILE_SIZE + i * 8;
              const py = y * TILE_SIZE + j * 8;

              if (isIceBg) {
                if (mossNoise > 0.2) {
                  if (mossNoise > 0.6) {
                    color = "#1b3252"; // dark icy blue
                  } else if (mossNoise > 0.4) {
                    color = "#132338"; // darker blue
                  } else {
                    color = "#0b1420"; // very dark blue
                  }
                }
              } else if (isMossBg) {
                if (mossNoise > -0.2) {
                  if (mossNoise > 0.6) {
                    color = "#163116"; // Mid-dark moss
                  } else if (mossNoise > 0.3) {
                    color = "#102510"; // Dark moss
                  } else {
                    color = "#0d1f0d"; // Very dark moss
                  }
                }
              } else {
                // Giant lush moss patches
                if (mossNoise > 0.2) {
                  if (mossNoise > 0.6) {
                    color = "#254220"; // Mid-bright moss
                  } else if (mossNoise > 0.4) {
                    color = "#1e331b"; // Dark moss
                  } else {
                    color = "#182b15"; // Very dark moss
                  }
                }
              }

              ctx.fillStyle = color;
              ctx.fillRect(px, py, 9, 9); // ponytail: overlap to prevent gaps

              if (isIceBg) {
                const detailHash = Math.sin(px * 1.3 + py * 1.7);
                if (detailHash > 0.6 && mossNoise > 0.1) {
                  const timeHash = Math.sin(
                    px * 3.1 + py * 2.7 + Date.now() * 0.002,
                  );
                  const sparkColor =
                    timeHash > 0.8
                      ? "#ffffff"
                      : detailHash > 0.95
                        ? "#ffffff"
                        : detailHash > 0.8
                          ? "#8bd3ff"
                          : "#4585ad";
                  ctx.fillStyle = sparkColor; // bright ice accent / sparkle
                  const sparkX = px + Math.abs(Math.cos(px * 2.1)) * 6;
                  const sparkY = py + Math.abs(Math.sin(py * 1.3)) * 6;
                  const sparkSize = timeHash > 0.9 ? 2 : 1;
                  ctx.fillRect(sparkX, sparkY, sparkSize, sparkSize);
                }
              } else {
                // Seeded detailing for texture
                const detailHash = Math.sin(px * 1.3 + py * 1.7);
                if (detailHash > 0.8 && mossNoise > 0.3) {
                  ctx.fillStyle = "#2d5a27"; // Bright moss accent
                  ctx.fillRect(
                    px + Math.abs(Math.cos(px)) * 6,
                    py + Math.abs(Math.sin(py)) * 6,
                    2,
                    2,
                  );
                }

                // Occasional hanging background vines from the 8x8 blocks
                const vineHash = Math.cos(px * 1.7 + py * 2.3);
                if (mossNoise > 0.5 && j < 3 && vineHash > 0.6) {
                  ctx.fillStyle = "#1e331b";
                  ctx.fillRect(
                    px + 2,
                    py + 8,
                    2,
                    4 + Math.abs(Math.sin(px + py)) * 8,
                  );
                }
              }
            }
          }
        }

        if (this.state.map[y] && this.state.map[y][x] !== undefined) {
          const tile = this.state.map[y][x];
          const hue = 15 + ((this.state.floor * 15) % 25);
          if (
            tile === 1 ||
            tile === 7 ||
            tile === 8 ||
            tile === 11 ||
            tile === 15 ||
            tile === 16 ||
            tile === 17
          ) {
            const isStoneBrick = tile === 11;
            const isGrass = tile === 7;
            const isMossy = tile === 15;
            const isStone = tile === 8;
            const isSnow = tile === 16;
            const isIce = tile === 17;

            let baseColor, darkColor, highlightColor, strokeColor;

            if (isStoneBrick) {
              baseColor = `hsl(${hue}, 5%, 35%)`;
              darkColor = `hsl(${hue}, 5%, 22%)`;
              highlightColor = `hsl(${hue}, 5%, 45%)`;
              strokeColor = `hsl(${hue}, 5%, 15%)`;
            } else if (isStone) {
              baseColor = `#4a4a50`;
              darkColor = `#2e2e34`;
              highlightColor = `#6b6b75`;
              strokeColor = `#1c1c20`;
            } else if (isIce) {
              baseColor = `#1e3a5f`;
              darkColor = `#0e203b`;
              highlightColor = `#4fa1d6`;
              strokeColor = `#0a1526`;
            } else if (isSnow) {
              if (this.state.biome === "ice_fortress") {
                baseColor = "#1e293b";      // Dark slate fortress brick
                darkColor = "#0f172a";      // Deep void slate
                highlightColor = "#38bdf8"; // Cyan icy glow accent
                strokeColor = "#020617";
              } else {
                baseColor = `#11223d`; // very dark icy rock
                darkColor = `#07101f`; // nearly black
                highlightColor = `#2e5885`; // frosty edge
                strokeColor = `#030810`;
              }
            } else {
              // Dirt / Cavern base for 1, 7, 15
              baseColor = `hsl(${hue}, 15%, 28%)`;
              darkColor = `hsl(${hue}, 15%, 20%)`;
              highlightColor = `hsl(${hue}, 15%, 38%)`;
              strokeColor = `hsl(${hue}, 20%, 10%)`;
            }

            // Fill block interior
            ctx.fillStyle = darkColor;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 1, TILE_SIZE + 1); // ponytail: overlap to prevent gaps

            // Base texture for interior
            ctx.fillStyle = baseColor;
            if (!isStoneBrick) {
              if ((x * 11 + y * 7) % 3 === 0)
                ctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, 8, 8);
              if ((x * 13 + y * 5) % 4 === 0)
                ctx.fillRect(x * TILE_SIZE + 20, y * TILE_SIZE + 16, 12, 8);
              if ((x * 7 + y * 19) % 5 === 0)
                ctx.fillRect(x * TILE_SIZE + 12, y * TILE_SIZE + 8, 4, 4);
            } else {
              // brick pattern
              ctx.fillRect(
                x * TILE_SIZE + 2,
                y * TILE_SIZE + 2,
                TILE_SIZE - 4,
                10,
              );
              ctx.fillRect(
                x * TILE_SIZE + 2,
                y * TILE_SIZE + 14,
                TILE_SIZE / 2 - 4,
                10,
              );
              ctx.fillRect(
                x * TILE_SIZE + TILE_SIZE / 2 + 2,
                y * TILE_SIZE + 14,
                TILE_SIZE / 2 - 4,
                10,
              );
              ctx.fillRect(
                x * TILE_SIZE + 2,
                y * TILE_SIZE + 26,
                TILE_SIZE - 4,
                6,
              );
            }

            if (isMossy) {
              const seed = x * 31 + y * 17;
              ctx.fillStyle = "#1e4d1b";
              if (seed % 3 === 0)
                ctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, 12, 12);
              if (seed % 5 === 0)
                ctx.fillRect(x * TILE_SIZE + 16, y * TILE_SIZE + 12, 12, 16);
              if (seed % 2 === 0)
                ctx.fillRect(x * TILE_SIZE + 8, y * TILE_SIZE + 20, 16, 8);

              ctx.fillStyle = "#2d8d2d";
              if (seed % 4 === 0)
                ctx.fillRect(x * TILE_SIZE + 6, y * TILE_SIZE + 6, 8, 8);
              if (seed % 7 === 0)
                ctx.fillRect(x * TILE_SIZE + 20, y * TILE_SIZE + 16, 6, 8);
              if (seed % 3 === 1)
                ctx.fillRect(x * TILE_SIZE + 10, y * TILE_SIZE + 2, 8, 6);
            }

            const isSolid = (t: number | undefined) =>
              t === 1 ||
              t === 7 ||
              t === 8 ||
              t === 11 ||
              t === 15 ||
              t === 16 ||
              t === 17;
            const top = isSolid(this.state.map[y - 1]?.[x]);
            const bottom = isSolid(this.state.map[y + 1]?.[x]);
            const left = isSolid(this.state.map[y][x - 1]);
            const right = isSolid(this.state.map[y][x + 1]);

            // Outside Details (Outer Shell)
            if (!top) {
              const topHighlight =
                isGrass || isSnow
                  ? isSnow
                    ? "#ffffff"
                    : "#44aa44"
                  : isMossy
                    ? "#2d6a27"
                    : highlightColor;
              const topBase =
                isGrass || isSnow
                  ? isSnow
                    ? "#e2e8f0"
                    : "#2d8d2d"
                  : isMossy
                    ? "#1e4d1b"
                    : baseColor;

              ctx.fillStyle = topHighlight;
              ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 1, 4); // ponytail: overlap to prevent gaps
              ctx.fillStyle = topBase;
              ctx.fillRect(
                x * TILE_SIZE + 4,
                y * TILE_SIZE + 4,
                TILE_SIZE - 8,
                4,
              );

              if (isGrass || isMossy || isSnow) {
                // Overhangs
                ctx.fillStyle = topHighlight;
                if (x % 2 === 0)
                  ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 8, 4, 4);
                if (x % 3 === 0)
                  ctx.fillRect(x * TILE_SIZE + 22, y * TILE_SIZE + 8, 4, 2);
                // Grass/Snow top bumps sticking up
                for (let g = 0; g < 3; g++) {
                  if ((x * g) % 2 === 0)
                    ctx.fillRect(
                      x * TILE_SIZE + 4 + g * 8,
                      y * TILE_SIZE - 4,
                      2,
                      4,
                    );
                }
              } else if (!isStoneBrick && x % 2 === 0) {
                // Jagged edges for natural cave
                ctx.fillStyle = strokeColor;
                ctx.fillRect(
                  x * TILE_SIZE + Math.abs((x * 7) % TILE_SIZE),
                  y * TILE_SIZE,
                  4,
                  4,
                );
              }
            }
            if (!bottom) {
              ctx.fillStyle = strokeColor;
              ctx.fillRect(
                x * TILE_SIZE,
                y * TILE_SIZE + TILE_SIZE - 4,
                TILE_SIZE + 1, // ponytail: overlap to prevent gaps
                4,
              );
              ctx.fillStyle = darkColor;
              ctx.fillRect(
                x * TILE_SIZE + 4,
                y * TILE_SIZE + TILE_SIZE - 8,
                TILE_SIZE - 8,
                4,
              );
            }
            if (!left) {
              ctx.fillStyle =
                isGrass || isMossy || isSnow
                  ? isSnow
                    ? "#e2e8f0"
                    : "#2d8d2d"
                  : highlightColor;
              if (top && (isGrass || isMossy || isSnow))
                ctx.fillStyle = strokeColor; // Top layer doesn't go all the way down sides if it's connected
              ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, 4, TILE_SIZE + 1); // ponytail: overlap to prevent gaps
              ctx.fillStyle = baseColor;
              ctx.fillRect(
                x * TILE_SIZE + 4,
                y * TILE_SIZE + 4,
                4,
                TILE_SIZE - 8,
              );
            }
            if (!right) {
              ctx.fillStyle = strokeColor;
              ctx.fillRect(
                x * TILE_SIZE + TILE_SIZE - 4,
                y * TILE_SIZE,
                4,
                TILE_SIZE + 1, // ponytail: overlap to prevent gaps
              );
              ctx.fillStyle = darkColor;
              ctx.fillRect(
                x * TILE_SIZE + TILE_SIZE - 8,
                y * TILE_SIZE + 4,
                4,
                TILE_SIZE - 8,
              );
            }
          } else if (tile === 4) {
            // Ladder
            const platformAbove =
              y > 0 && this.state.map[y - 1] && this.state.map[y - 1][x] === 5;

            const sideColor = "#a68c69"; // rope/tan color
            const rungColor = "#6b4c3a"; // lighter brown
            const shadowColor = "#4a3325"; // dark brown

            const startY = platformAbove ? 10 : 0;

            // Ropes (side rails)
            ctx.fillStyle = sideColor;
            ctx.fillRect(
              x * TILE_SIZE + 6,
              y * TILE_SIZE + startY,
              2,
              TILE_SIZE - startY + 1, // ponytail: overlap to prevent gaps
            );
            ctx.fillRect(
              x * TILE_SIZE + 24,
              y * TILE_SIZE + startY,
              2,
              TILE_SIZE - startY + 1, // ponytail: overlap to prevent gaps
            );

            // If there's a platform above, draw the knots attaching to the platform
            if (platformAbove) {
              ctx.fillStyle = sideColor;
              // Tie knot left
              ctx.fillRect(x * TILE_SIZE + 5, y * TILE_SIZE, 4, 10);
              // Tie knot right
              ctx.fillRect(x * TILE_SIZE + 23, y * TILE_SIZE, 4, 10);
              // Cross wraps
              ctx.fillStyle = shadowColor;
              ctx.fillRect(x * TILE_SIZE + 6, y * TILE_SIZE + 2, 2, 2);
              ctx.fillRect(x * TILE_SIZE + 24, y * TILE_SIZE + 2, 2, 2);
            }

            // Rungs
            for (let i = 4; i < TILE_SIZE; i += 10) {
              if (i < startY) continue;
              ctx.fillStyle = rungColor;
              ctx.fillRect(x * TILE_SIZE + 7, y * TILE_SIZE + i, 18, 3); // ponytail: overlap to prevent gaps
              ctx.fillStyle = shadowColor;
              ctx.fillRect(x * TILE_SIZE + 7, y * TILE_SIZE + i + 3, 18, 2); // ponytail: overlap to prevent gaps
            }
          } else if (tile === 5) {
            // Platform (Rope Bridge / Scaffold)
            // Top Logs
            ctx.fillStyle = "#6b4c3a"; // lighter brown
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + 2, TILE_SIZE + 1, 6); // ponytail: overlap to prevent gaps
            ctx.fillStyle = "#4a3325"; // dark brown bottom
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + 8, TILE_SIZE + 1, 2); // ponytail: overlap to prevent gaps

            // Planks / Gaps
            ctx.fillStyle = "#222";
            ctx.fillRect(x * TILE_SIZE + 8, y * TILE_SIZE + 2, 2, 8);
            ctx.fillRect(x * TILE_SIZE + 20, y * TILE_SIZE + 2, 2, 8);

            // Rope Binding
            ctx.fillStyle = "#d2b48c"; // tan (rope)
            ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, 4, 9);
            ctx.fillRect(x * TILE_SIZE + 26, y * TILE_SIZE + 2, 4, 9);

            // Hanging rope/strands
            ctx.fillStyle = "#a68c69"; // dark tan
            ctx.fillRect(
              x * TILE_SIZE + 4,
              y * TILE_SIZE + 9, // ponytail: overlap to prevent gaps
              2,
              5 + Math.random() * 2,
            );
            ctx.fillRect(
              x * TILE_SIZE + 28,
              y * TILE_SIZE + 9, // ponytail: overlap to prevent gaps
              2,
              5 + Math.random() * 2,
            );
          } else if (tile === 6) {
            // Water
            const waterAbove =
              y > 0 &&
              this.state.map[y - 1] &&
              (this.state.map[y - 1][x] === 6 ||
                this.state.map[y - 1][x] === 18);
            const isIce = this.state.biome === "ice";

            ctx.fillStyle = isIce
              ? "rgba(100, 200, 255, 0.6)"
              : "rgba(0, 180, 150, 0.5)"; // Icy water or jungle water
            if (waterAbove) {
              ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 1, TILE_SIZE + 1); // ponytail: overlap to prevent gaps
            } else {
              ctx.fillRect(
                x * TILE_SIZE,
                y * TILE_SIZE + 4,
                TILE_SIZE + 1, // ponytail: overlap to prevent gaps
                TILE_SIZE - 4 + 1,
              );
              // Little waves
              ctx.fillStyle = isIce
                ? "rgba(255, 255, 255, 0.5)"
                : "rgba(255, 255, 255, 0.3)";
              if (Math.sin(Date.now() * 0.002 + x) > 0) {
                ctx.fillRect(
                  x * TILE_SIZE + 4,
                  y * TILE_SIZE + 4,
                  TILE_SIZE - 8,
                  2,
                );
              }
            }

            // Soft glow below surface
            if (!waterAbove) {
              ctx.fillStyle = isIce
                ? "rgba(200, 230, 255, 0.3)"
                : "rgba(0, 255, 200, 0.2)";
              ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + 6, TILE_SIZE + 1, 8); // ponytail: overlap to prevent gaps
            }
          } else if (tile === 18) {
            // Thin ice covering water
            // First draw water
            ctx.fillStyle = "rgba(100, 200, 255, 0.6)";
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 1, TILE_SIZE + 1); // ponytail: overlap to prevent gaps

            // Then draw the thin ice crust
            ctx.fillStyle = "rgba(180, 230, 255, 0.8)";
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 1, 8); // ponytail: overlap to prevent gaps
            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 1, 2); // ponytail: overlap to prevent gaps
            ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
            if (Math.sin(x * 1.3) > 0)
              ctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 2, 4, 4);
            if (Math.cos(x * 2.7) > 0)
              ctx.fillRect(x * TILE_SIZE + 18, y * TILE_SIZE + 4, 6, 2);
          } else if (tile === 10 || tile === 12) {
            // Torch
            const isPurple = tile === 12;

            // Base/Bracket
            ctx.fillStyle = "#1c1c1c";
            ctx.fillRect(x * TILE_SIZE + 10, y * TILE_SIZE + 22, 12, 6);
            ctx.fillStyle = "#333";
            ctx.fillRect(x * TILE_SIZE + 12, y * TILE_SIZE + 24, 8, 2);

            // Pole Core
            ctx.fillStyle = "#6b4c3a"; // lighter wood
            ctx.fillRect(x * TILE_SIZE + 13, y * TILE_SIZE + 10, 6, 13); // ponytail: overlap to prevent gaps
            ctx.fillStyle = "#4a3325"; // dark wood shadow
            ctx.fillRect(x * TILE_SIZE + 17, y * TILE_SIZE + 10, 2, 13); // ponytail: overlap to prevent gaps
            ctx.fillStyle = "#222";
            ctx.fillRect(x * TILE_SIZE + 12, y * TILE_SIZE + 10, 8, 3); // iron band

            // Fire
            ctx.fillStyle = isPurple
              ? `hsl(${260 + Math.random() * 30}, 100%, 65%)`
              : `hsl(${20 + Math.random() * 20}, 100%, 55%)`;
            ctx.fillRect(
              x * TILE_SIZE + 12,
              y * TILE_SIZE + 4 + Math.random() * 4,
              8,
              8,
            );

            // Core Fire
            ctx.fillStyle = isPurple ? "#fff" : "#ffea00";
            ctx.fillRect(
              x * TILE_SIZE + 14,
              y * TILE_SIZE + 6 + Math.random() * 2,
              4,
              4,
            );

            // Little spark
            ctx.fillStyle = isPurple ? "#d8b4fe" : "#fcd34d";
            ctx.fillRect(
              x * TILE_SIZE + 12 + Math.random() * 8,
              y * TILE_SIZE + Math.random() * 6,
              2,
              2,
            );
          } else if (tile === 13) {
            // Moss/Vines or Icicles
            const isIce = this.state.biome === "ice";
            const hasVineBelow =
              y < this.state.height - 1 &&
              this.state.map[y + 1] &&
              this.state.map[y + 1][x] === 13;
            const hasVineAbove =
              y > 0 && this.state.map[y - 1] && this.state.map[y - 1][x] === 13;

            const px = x * TILE_SIZE;
            const py = y * TILE_SIZE;

            if (isIce) {
              // Draw Connected Pixel Icicles
              ctx.fillStyle = "#b0e0e6"; // light icy blue

              if (!hasVineAbove) {
                ctx.fillRect(px, py, TILE_SIZE + 1, 4); // ponytail: overlap to prevent gaps
              }

              const drawPixelIcicle = (
                vx: number,
                baseThick: number,
                len: number,
              ) => {
                ctx.fillStyle = "#b0e0e6";
                let curThick = baseThick;
                let currentY = 0;

                while (currentY < len && curThick > 0) {
                  ctx.fillRect(
                    px + vx + Math.floor((baseThick - curThick) / 2),
                    py + 4 + currentY,
                    curThick,
                    5, // ponytail: overlap to prevent gaps
                  );
                  currentY += 4;
                  curThick -= 2; // Fixed taper
                }

                // Glint
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(px + vx + Math.floor(baseThick / 2), py + 4, 2, 4);
              };

              const hash1 = Math.abs(Math.sin(px * 1.1 + py * 1.3));
              const hash2 = Math.abs(Math.sin(px * 1.7 + py * 1.9));
              const hash3 = Math.abs(Math.sin(px * 2.3 + py * 0.7));

              const bottom1 = hasVineBelow
                ? TILE_SIZE - 4
                : TILE_SIZE - 4 - hash1 * 8;
              const bottom2 = hasVineBelow
                ? TILE_SIZE - 4
                : TILE_SIZE - 2 - hash2 * 6;
              const bottom3 = hasVineBelow
                ? TILE_SIZE - 4
                : TILE_SIZE - 8 - hash3 * 12;

              drawPixelIcicle(2, 6, bottom1);
              drawPixelIcicle(12, 8, bottom2);
              drawPixelIcicle(22, 6, bottom3);
            } else {
              // Draw wavy green lines and leaves
              const drawVine = (
                vx: number,
                waveOffset: number,
                thick: number,
                len: number,
              ) => {
                ctx.fillStyle = "#1e3c1a"; // Dark green vine stem
                // We draw it in chunky segments
                for (let step = 0; step < len; step += 4) {
                  const wave = Math.round(
                    Math.sin(px * 0.1 + py * 0.1 + step * 0.3 + waveOffset) * 2,
                  );
                  ctx.fillRect(px + vx + wave, py + step, thick, 5); // ponytail: overlap to prevent gaps

                  // Occasional leaf based on position hash
                  const leafHash = Math.cos(
                    px * 1.3 + py * 2.1 + step * 1.7 + waveOffset * 3.1,
                  );
                  if (leafHash > 0.4) {
                    ctx.fillStyle = "#2d8d2d"; // Bright leaf
                    const leafDir = leafHash > 0.7 ? -3 : thick;
                    ctx.fillRect(px + vx + wave + leafDir, py + step, 3, 3);
                    ctx.fillStyle = "#1e3c1a"; // Switch back to stem
                  }
                }
              };

              const hash1 = Math.abs(Math.sin(px * 1.1 + py * 1.3));
              const hash2 = Math.abs(Math.sin(px * 1.7 + py * 1.9));
              const hash3 = Math.abs(Math.sin(px * 2.3 + py * 0.7));

              const bottom1 = hasVineBelow
                ? TILE_SIZE
                : TILE_SIZE - 4 - hash1 * 8;
              const bottom2 = hasVineBelow
                ? TILE_SIZE
                : TILE_SIZE - 2 - hash2 * 6;
              const bottom3 = hasVineBelow
                ? TILE_SIZE
                : TILE_SIZE - 8 - hash3 * 12;

              drawVine(4, 0, 3, bottom1);
              drawVine(14, 2, 2, bottom2);
              drawVine(24, 1, 3, bottom3);
            }
          }
        }
      }
    }

    // Draw Exit or Diamond
    const ex = this.state.endPos.x;
    const ey = this.state.endPos.y;
    if (this.state.floor < this.state.maxFloor) {
      // Trapdoor Exit
      const px = ex * TILE_SIZE;
      const py = ey * TILE_SIZE;

      // Ladder inside the hole
      ctx.fillStyle = "#1c1917"; // hole background
      ctx.fillRect(px, py + TILE_SIZE - 8, 32, 9); // ponytail: overlap to prevent gaps
      ctx.fillStyle = "#78350f"; // ladder rails inside hole
      ctx.fillRect(px + 8, py + TILE_SIZE - 8, 2, 9); // ponytail: overlap to prevent gaps
      ctx.fillRect(px + 22, py + TILE_SIZE - 8, 2, 9); // ponytail: overlap to prevent gaps
      ctx.fillStyle = "#b45309"; // ladder rung
      ctx.fillRect(px + 10, py + TILE_SIZE - 4, 12, 2);

      // Wood trapdoor propped open
      ctx.fillStyle = "#5ac"; // trapdoor edge highlight
      ctx.fillRect(px - 4, py - 12, 4, 32);

      ctx.fillStyle = "#381c00"; // dark wood
      ctx.fillRect(px, py - 12, 8, 32);
      ctx.fillStyle = "#542a00"; // light wood planks
      ctx.fillRect(px + 2, py - 10, 2, 28);
      ctx.fillRect(px + 6, py - 10, 2, 28);

      // Iron hinges
      ctx.fillStyle = "#333";
      ctx.fillRect(px, py - 8, 12, 4);
      ctx.fillRect(px, py + 12, 12, 4);

      ctx.fillStyle = "#ddaaff";
      ctx.fillText("Descend", px - 6, py - 20);
    } else if (!this.state.player.hasDiamond) {
      // Pixelated True Diamond
      const px = ex * TILE_SIZE;
      const py = ey * TILE_SIZE + Math.sin(Date.now() * 0.005) * 4;

      ctx.fillStyle = "#7bf";
      ctx.fillRect(px + 12, py + 4, 8, 4);
      ctx.fillRect(px + 8, py + 8, 16, 4);
      ctx.fillRect(px + 4, py + 12, 24, 8);
      ctx.fillStyle = "#49d";
      ctx.fillRect(px + 8, py + 20, 16, 4);
      ctx.fillRect(px + 12, py + 24, 8, 4);
      ctx.fillRect(px + 16, py + 28, 4, 4);
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
                      : COLORS.slime;

      if (
        e.type === "slime" ||
        e.type === "frost_slime" ||
        e.type === "moss_slime"
      ) {
        // Clean, Sleek Gelatinous Slime Model (NO EYES, Vibrant Colors)
        const isFrost = e.type === "frost_slime";
        const isMoss = e.type === "moss_slime";

        const baseColor = isFrost ? "#0284c7" : (isMoss ? "#14532d" : "#6b21a8");
        const bodyColor = isFrost ? "#38bdf8" : (isMoss ? "#16a34a" : "#a855f7");
        const coreColor = isFrost ? "#e0f2fe" : (isMoss ? "#bbf7d0" : "#e9d5ff");

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
        // Clean, Sleek Flytrap Plant Model
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

        // Clean Vine Stem
        ctx.fillStyle = "#15803d";
        ctx.fillRect(baseX - 3, baseY - 4, 6, 8);
        ctx.fillStyle = "#166534";
        ctx.beginPath();
        ctx.arc(headX, headY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Plant Head
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

        const jawOffset = e.aiState === "attacking" ? 6 : (e.aiState === "tracking" ? 2 : 0);
        ctx.fillStyle = e.invulnerableTimer > 0 ? "#fff" : "#16a34a";
        ctx.fillRect(-10, -12 - jawOffset, 20, 7);
        ctx.fillRect(-10, -5 + jawOffset, 20, 6);

        ctx.fillStyle = "#ffffff";
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(-8 + i * 4, -5 - jawOffset, 2, 2);
          ctx.fillRect(-6 + i * 4, -7 + jawOffset, 2, 2);
        }
        ctx.restore();

        // Sleek base leaves
        ctx.fillStyle = "#166534";
        ctx.fillRect(e.x + 3, e.y + e.h - 4, 7, 4);
        ctx.fillRect(e.x + 14, e.y + e.h - 4, 7, 4);
      } else if (e.type === "yeti") {
        // Clean, Sleek Yeti Model
        const isHitColor = e.invulnerableTimer > 0;
        
        // Crisp White Body
        ctx.fillStyle = isHitColor ? "#fff" : "#e2e8f0";
        ctx.fillRect(e.x + 3, e.y + 4, e.w - 6, e.h - 6);
        ctx.fillStyle = isHitColor ? "#fff" : "#f8fafc";
        ctx.fillRect(e.x + 5, e.y + 2, e.w - 10, e.h - 8);

        // Smooth Horn Silhouettes
        ctx.fillStyle = isHitColor ? "#fff" : "#38bdf8";
        ctx.fillRect(e.x + 2, e.y - 2, 4, 5);
        ctx.fillRect(e.x + e.w - 6, e.y - 2, 4, 5);

        // Face Visor / Eyes
        ctx.fillStyle = isHitColor ? "#fff" : "#0f172a";
        ctx.fillRect(e.x + 8, e.y + 6, e.w - 16, 6);
        ctx.fillStyle = isHitColor ? "#fff" : "#fbbf24";
        const eyeX = e.facingRight ? e.x + 14 : e.x + 10;
        ctx.fillRect(eyeX, e.y + 7, 3, 3);
        ctx.fillRect(eyeX + (e.facingRight ? 5 : -5), e.y + 7, 3, 3);

        // Sleek Arms
        ctx.fillStyle = isHitColor ? "#fff" : "#cbd5e1";
        if (e.aiState === "leaping") {
          ctx.fillRect(e.x - 4, e.y - 6, 5, 18);
          ctx.fillRect(e.x + e.w - 1, e.y - 6, 5, 18);
        } else {
          ctx.fillRect(e.x - 3, e.y + 8, 4, 16);
          ctx.fillRect(e.x + e.w - 1, e.y + 8, 4, 16);
        }
      } else if (e.type === "bat") {
        // Clean, Sleek Bat Model
        ctx.fillStyle = e.invulnerableTimer > 0 ? "#fff" : "#581c87";
        ctx.fillRect(e.x + e.w / 2 - 4, e.y + e.h / 2 - 4, 8, 8);

        ctx.fillStyle = e.invulnerableTimer > 0 ? "#fff" : "#7e22ce";
        if (Math.floor(Date.now() / 150) % 2 === 0) {
          ctx.fillRect(e.x + e.w / 2 - 12, e.y + e.h / 2, 8, 4);
          ctx.fillRect(e.x + e.w / 2 + 4, e.y + e.h / 2, 8, 4);
        } else {
          ctx.fillRect(e.x + e.w / 2 - 12, e.y + e.h / 2 - 4, 8, 4);
          ctx.fillRect(e.x + e.w / 2 + 4, e.y + e.h / 2 - 4, 8, 4);
        }
      } else if (e.type === "boss") {
        // Pixelated Cavern Titan Golem Model (80x80)
        const isHitColor = e.invulnerableTimer > 0;
        const isEnraged = e.health < e.maxHealth * 0.5;

        // Base Shadow
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(e.x + 4, e.y + e.h - 6, e.w - 8, 6);

        // Heavy Obsidian Body Base
        ctx.fillStyle = isHitColor ? "#ffffff" : (isEnraged ? "#7f1d1d" : "#0f172a");
        ctx.fillRect(e.x + 8, e.y + 12, e.w - 16, e.h - 20);

        // Stone Armor Plates
        ctx.fillStyle = isHitColor ? "#ffffff" : "#334155";
        ctx.fillRect(e.x + 12, e.y + 16, e.w - 24, e.h - 28);

        // Magma Core Chest (Glowing Orange/Red)
        const corePulse = Math.sin(Date.now() / 200) * 0.2 + 0.8;
        ctx.fillStyle = isHitColor ? "#ffffff" : `rgba(249, 115, 22, ${corePulse})`;
        ctx.fillRect(e.x + e.w / 2 - 12, e.y + 24, 24, 20);
        ctx.fillStyle = isHitColor ? "#ffffff" : "#ef4444";
        ctx.fillRect(e.x + e.w / 2 - 6, e.y + 28, 12, 12);

        // Massive Stone Shoulder Pauldrons
        ctx.fillStyle = isHitColor ? "#ffffff" : "#475569";
        ctx.fillRect(e.x - 4, e.y + 10, 16, 20);
        ctx.fillRect(e.x + e.w - 12, e.y + 10, 16, 20);

        // Heavy Fists
        const fistBob = Math.sin(Date.now() / 100) * 3;
        ctx.fillStyle = isHitColor ? "#ffffff" : "#1e293b";
        ctx.fillRect(e.x - 6, e.y + 32 + fistBob, 14, 18);
        ctx.fillRect(e.x + e.w - 8, e.y + 32 - fistBob, 14, 18);

        // Glowing Fiery Eyes
        ctx.fillStyle = isHitColor ? "#ffffff" : (isEnraged ? "#ef4444" : "#f59e0b");
        const eyeX = e.facingRight ? e.x + e.w / 2 + 6 : e.x + e.w / 2 - 14;
        ctx.fillRect(eyeX, e.y + 16, 8, 4);
        ctx.fillRect(eyeX + (e.facingRight ? 12 : -12), e.y + 16, 8, 4);
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

    // Draw Player Weapon Model / Claws / Shield
    if (p.shieldActive) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h / 2 + bob, 22, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 190, 255, 0.22)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(100, 220, 255, 0.8)";
      ctx.stroke();
      ctx.restore();
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
        // Standard Sword Blade (Behind Hand)
        ctx.fillStyle = isHit ? COLORS.playerHit : "#e2e8f0";
        ctx.fillRect(p.x + p.w - 2, p.y - 2 + bob, 4, 14);
        ctx.fillStyle = p.playerColor || "#ea580c";
        ctx.fillRect(p.x + p.w - 4, p.y + 10 + bob, 8, 4);
      }
    }
    ctx.restore();

    // Draw pixel slash animation if attacking
    if (p.isAttacking && p.weapon !== "bow") {
      const duration = p.weapon === "colossal_sword" ? 20 : (p.weapon === "dual_daggers" ? 6 : 10);
      const progress = 1 - p.attackTimer / duration;
      const dir = p.facingRight ? 1 : -1;
      let ox = p.facingRight ? p.x + p.w : p.x;
      let oy = p.y + p.h / 2 - 10;

      ox = Math.round(ox * zoom) / zoom; // ponytail: align slash origin to screen pixel grid
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
      // +15% slash size for all weapons; dual daggers enlarged & centered
      let scaleX = p.weapon === "colossal_sword" ? 4.37 : (p.weapon === "dual_daggers" ? 2.53 : 2.76);
      let scaleY = p.weapon === "colossal_sword" ? 0.80 : (p.weapon === "dual_daggers" ? 0.46 : 0.52);
      if (p.clawsActive) {
        scaleX = 3.68;
        scaleY = 0.69;
      }
      ctx.scale(scaleX, scaleY);
      ctx.rotate(Math.PI * 0.1); // tilt the whole oval a bit

      const PIX = 3; // 3x3 pixel grid for rendering
      const drawPixelCrescent = (
        rBase: number,
        spread: number,
        maxThick: number,
        startAngle: number,
        endAngle: number,
        color: string,
      ) => {
        ctx.fillStyle = color;
        const steps = 45;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps; // 0 to 1
          const angle = startAngle + (endAngle - startAngle) * t;
          
          // Pointy ends: Taper thickness from 0 at the ends to maxThick in the middle
          const thickness = Math.sin(t * Math.PI) * maxThick;
          const curR = rBase + spread * t;

          // Draw centered around curR to keep curve smooth and symmetrical
          for (let r = -thickness / 2; r <= thickness / 2; r += PIX) {
            let px = Math.round((Math.cos(angle) * (curR + r)) / PIX) * PIX;
            let py = Math.round((Math.sin(angle) * (curR + r)) / PIX) * PIX;
            ctx.fillRect(px, py, PIX, PIX);
          }
        }
      };

      const drawSparks = (angle: number, radius: number, count: number) => {
        ctx.fillStyle = p.clawsActive ? "#ff5500" : "#ffffff";
        for (let i = 0; i < count; i++) {
          const spread = (Math.random() - 0.5) * 0.4;
          const dist = radius + Math.random() * 20;
          const px = Math.round((Math.cos(angle + spread) * dist) / PIX) * PIX;
          const py = Math.round((Math.sin(angle + spread) * dist) / PIX) * PIX;
          ctx.fillRect(px, py, PIX, PIX);
          if (Math.random() < 0.5) {
            ctx.fillStyle = p.clawsActive ? "#ff0000" : "#f3e1f5"; // red vs pink spark
            ctx.fillRect(px + PIX, py, PIX, PIX);
            ctx.fillStyle = p.clawsActive ? "#ff5500" : "#ffffff";
          }
        }
      };

      // Colors
      let white = "#ffffff";
      let pink = "#f3e1f5";
      let purple = "#c7aecb";
      
      if (p.clawsActive) {
        white = "#ffffff";
        pink = "#ff5500";
        purple = "#990000";
      }

      // Animate headAngle and tailLength
      const headAngle = -Math.PI * 0.5 + progress * Math.PI * 1.0;

      // trail length peaks at progress 0.5
      const trailProgress = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
      const trailLength = Math.max(0.1, trailProgress * Math.PI * 0.6);
      const tailAngle = headAngle - trailLength;

      // Draw crescent: Pointy ends and wider middle design
      const rBase = p.clawsActive ? 25 : (p.weapon === "colossal_sword" ? 30 : (p.weapon === "dual_daggers" ? 14 : 20));
      const spread = p.clawsActive ? 6 : (p.weapon === "colossal_sword" ? 10 : (p.weapon === "dual_daggers" ? 2 : 5));
      const maxThick = p.clawsActive ? 28 : (p.weapon === "colossal_sword" ? 36 : (p.weapon === "dual_daggers" ? 14 : 24));
      
      if (p.clawsActive) {
        // Custom 3-Claw Slash Effect (3 parallel fiery claw swipes following the crescent arc)
        const clawOffsets = [-7, 0, 7];
        for (let c = 0; c < 3; c++) {
          const cR = rBase + clawOffsets[c];
          // Fiery crimson glow outer layer
          drawPixelCrescent(cR, spread, 8, tailAngle - 0.03, headAngle + 0.03, "#ff3300");
          // Inner white-hot claw core
          drawPixelCrescent(cR, spread, 3, tailAngle, headAngle, "#ffffff");
        }
        if (progress > 0.1 && progress < 0.9) {
          drawSparks(headAngle + 0.1, rBase + 12, 8);
        }
      } else {
        // Standard 3-layer weapon crescent slash
        drawPixelCrescent(rBase, spread, maxThick + 4, tailAngle - 0.04, headAngle + 0.04, purple);
        drawPixelCrescent(rBase, spread, maxThick, tailAngle - 0.02, headAngle + 0.02, pink);
        drawPixelCrescent(rBase, spread, Math.max(2, maxThick - 6), tailAngle, headAngle, white);

        if (progress > 0.1 && progress < 0.9) {
          const sparkCount = p.weapon === "colossal_sword" ? Math.floor(trailProgress * 12) : (p.weapon === "dual_daggers" ? Math.floor(trailProgress * 3) : Math.floor(trailProgress * 6));
          const sparkRad = p.weapon === "colossal_sword" ? 40 : (p.weapon === "dual_daggers" ? 16 : 26);
          drawSparks(headAngle + 0.1, sparkRad, sparkCount);
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
          // Grey blade
          ctx.strokeStyle = "#9ca3af";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-6, 6);
          ctx.lineTo(6, -6);
          ctx.stroke();
          // Gold hilt
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(-8, 4, 3, 3);
          ctx.fillRect(-6, 6, 2, 2);
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
        }
      }
    }

    // Particles
    for (let pt of this.state.particles) {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = pt.life / pt.maxLife;
      ctx.fillRect(
        Math.round(pt.x * zoom) / zoom,
        Math.round(pt.y * zoom) / zoom,
        pt.size,
        pt.size,
      ); // ponytail: round coordinates in screen space
    }
    ctx.globalAlpha = 1.0;

    // Texts
    ctx.textAlign = "center";
    ctx.font = "bold 14px 'Courier New', Courier, monospace";
    for (let t of this.state.texts) {
      ctx.fillStyle = `rgba(255,255,255,${t.life / t.maxLife})`;
      ctx.fillText(
        t.text,
        Math.round(t.x * zoom) / zoom,
        Math.round(t.y * zoom) / zoom,
      ); // ponytail: round coordinates in screen space
    }

    // Darkness overlay (using offscreen canvas)
    if (!this.lightCanvas) {
      this.lightCanvas = document.createElement("canvas");
    }
    if (
      this.lightCanvas.width !== this.canvasWidth ||
      this.lightCanvas.height !== this.canvasHeight
    ) {
      this.lightCanvas.width = this.canvasWidth;
      this.lightCanvas.height = this.canvasHeight;
    }
    const lctx = this.lightCanvas.getContext("2d");
    if (lctx) {
      const centerTx = Math.floor((p.x + p.w / 2) / TILE_SIZE);
      const centerTy = Math.floor((p.y + p.h / 2) / TILE_SIZE);      // 1. Draw standard cave lighting (if structureOverlayAlpha < 1)
      if (this.state.structureOverlayAlpha < 1.0) {
        lctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        lctx.fillStyle = "rgba(0, 0, 0, 1.0)"; // Pitch black outside
        lctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        lctx.globalCompositeOperation = "destination-out";
        lctx.save();
        lctx.translate(Math.round(this.canvasWidth / 2), Math.round(this.canvasHeight / 2));
        lctx.translate(-scaledCamX, -scaledCamY);
        lctx.scale(zoom, zoom);

        const drawLight = (x: number, y: number, radius: number) => {
          const tx = Math.floor(x / TILE_SIZE);
          const ty = Math.floor(y / TILE_SIZE);
          const isLightInside = this.state.bgMap[ty] && this.state.bgMap[ty][tx] === 9;
          
          let finalRadius = radius;
          if (isLightInside) {
            finalRadius = radius * 0.55; // 45% reduction inside structures
          }

          const grad = lctx.createRadialGradient(x, y, finalRadius * 0.2, x, y, finalRadius);
          grad.addColorStop(0, "rgba(255,255,255,1)");
          grad.addColorStop(0.4, "rgba(255,255,255,0.6)");
          grad.addColorStop(1, "rgba(255,255,255,0)");
          lctx.fillStyle = grad;
          lctx.beginPath();
          lctx.arc(x, y, finalRadius, 0, Math.PI * 2);
          lctx.fill();
        };

        // Draw Player light (higher radius if holding torch)
        const pLightRad = (p.weapon === 'torch' && p.weaponEquipped) ? 330.0 : 175.5;
        drawLight(p.x + p.w / 2, p.y + p.h / 2, pLightRad);

        // Draw Torches light
        const startColLight = Math.max(0, Math.floor((this.state.camera.x - this.canvasWidth / 2 / zoom - 300) / TILE_SIZE));
        const endColLight = Math.min(this.state.width, Math.ceil((this.state.camera.x + this.canvasWidth / 2 / zoom + 300) / TILE_SIZE));
        const startRowLight = Math.max(0, Math.floor((this.state.camera.y - this.canvasHeight / 2 / zoom - 300) / TILE_SIZE));
        const endRowLight = Math.min(this.state.height, Math.ceil((this.state.camera.y + this.canvasHeight / 2 / zoom + 300) / TILE_SIZE));

        for (let y = startRowLight; y < endRowLight; y++) {
          for (let x = startColLight; x < endColLight; x++) {
            if (this.state.map[y] && this.state.map[y][x] === 10) {
              drawLight(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 195 + Math.random() * 18);
            } else if (this.state.map[y] && this.state.map[y][x] === 12) {
              drawLight(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 156 + Math.random() * 30);
            }
          }
        }

        // Draw exit/boss room light
        if (this.state.floor < this.state.maxFloor && this.state.endPos.x >= startColLight && this.state.endPos.x < endColLight && this.state.endPos.y >= startRowLight && this.state.endPos.y < endRowLight) {
          drawLight(this.state.endPos.x * TILE_SIZE + TILE_SIZE / 2, this.state.endPos.y * TILE_SIZE + TILE_SIZE / 2, 227.5 + Math.random() * 30);
        } else if (this.state.floor === this.state.maxFloor && !p.hasDiamond && this.state.endPos.x >= startColLight && this.state.endPos.x < endColLight && this.state.endPos.y >= startRowLight && this.state.endPos.y < endRowLight) {
          drawLight(this.state.endPos.x * TILE_SIZE + TILE_SIZE / 2, this.state.endPos.y * TILE_SIZE + TILE_SIZE / 2, 200 + Math.random() * 20);
        }

        lctx.restore();
        lctx.globalCompositeOperation = "source-over";

        ctx.save();
        ctx.resetTransform();
        ctx.globalAlpha = 1.0 - this.state.structureOverlayAlpha;
        ctx.drawImage(this.lightCanvas, 0, 0);
        ctx.restore();
      }

      // 2. Draw structure mask (if structureOverlayAlpha > 0)
      if (this.state.structureOverlayAlpha > 0.0) {
        lctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        lctx.fillStyle = "rgba(0, 0, 0, 0.85)"; // 85% dark outside when inside structure
        lctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        lctx.globalCompositeOperation = "destination-out";
        lctx.save();
        lctx.translate(Math.round(this.canvasWidth / 2), Math.round(this.canvasHeight / 2));
        lctx.translate(-scaledCamX, -scaledCamY);
        lctx.scale(zoom, zoom);

        // Find structure bounds dynamically by walking outward along bgMap === 9
        let sx = centerTx;
        while (sx >= 0 && this.state.bgMap[centerTy]?.[sx] === 9) sx--;
        sx++;

        let ex = centerTx;
        while (ex < this.state.width && this.state.bgMap[centerTy]?.[ex] === 9) ex++;
        ex--;

        let sy = centerTy;
        while (sy >= 0 && this.state.bgMap[sy]?.[centerTx] === 9) sy--;
        sy++;

        let ey = centerTy;
        while (ey < this.state.height && this.state.bgMap[ey]?.[centerTx] === 9) ey++;
        ey--;

        // Light area fits structure exactly, NOT 1 block outside it
        const xMin = sx * TILE_SIZE;
        const xMax = (ex + 1) * TILE_SIZE;
        const yMin = sy * TILE_SIZE;
        const yMax = (ey + 1) * TILE_SIZE;

        lctx.fillStyle = "rgba(255, 255, 255, 1.0)";
        lctx.fillRect(xMin, yMin, xMax - xMin, yMax - yMin);
        lctx.restore();
        lctx.globalCompositeOperation = "source-over";

        ctx.save();
        ctx.resetTransform();
        ctx.globalAlpha = this.state.structureOverlayAlpha;
        ctx.drawImage(this.lightCanvas, 0, 0);
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

    if (this.state.isFloorComplete) {
      // Main menu style backdrop overlay
      ctx.fillStyle = "rgba(9, 13, 22, 0.85)";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

      // Main Menu Style Container Panel
      const panelW = Math.min(this.canvasWidth - 60, 1120);
      const panelH = Math.min(this.canvasHeight - 60, 640);
      const panelX = (this.canvasWidth - panelW) / 2;
      const panelY = (this.canvasHeight - panelH) / 2;

      ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
      ctx.fillRect(panelX, panelY, panelW, panelH);
      ctx.strokeStyle = "rgba(6, 182, 212, 0.60)";
      ctx.lineWidth = 3;
      ctx.strokeRect(panelX, panelY, panelW, panelH);
      ctx.strokeStyle = "rgba(6, 182, 212, 0.30)";
      ctx.lineWidth = 1;
      ctx.strokeRect(panelX + 4, panelY + 4, panelW - 8, panelH - 8);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 32px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        `FLOOR ${this.state.floor} CLEARED`,
        this.canvasWidth / 2,
        panelY + 48,
      );
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 20px 'Courier New', Courier, monospace";
      ctx.fillText(
        `YOUR COINS: ${this.state.player.coins}`,
        this.canvasWidth / 2,
        panelY + 80,
      );

      // Draw Screen-Filling Legacy Upgrades (320px x 460px)
      const cardWidth = Math.min(320, Math.floor((panelW - 120) / 3));
      const cardHeight = Math.min(460, panelH - 160);
      const gap = 24;
      const totalWidth = 3 * cardWidth + 2 * gap;
      const startX = this.canvasWidth / 2 - totalWidth / 2;
      const startY = panelY + 110;

      for (let i = 0; i < this.state.upgrades.length; i++) {
        const u = this.state.upgrades[i];
        const cx = startX + i * (cardWidth + gap);
        const cy = startY;

        const isHover =
          this.state.mouse.x >= cx &&
          this.state.mouse.x <= cx + cardWidth &&
          this.state.mouse.y >= cy &&
          this.state.mouse.y <= cy + cardHeight;

        // Legacy Card Background & Borders
        let fillStyle = isHover ? "rgba(30, 20, 12, 0.98)" : "rgba(20, 14, 8, 0.95)";
        let strokeColor = isHover ? "#f59e0b" : "#b45309";
        let innerColor = "#78350f";
        let titleColor = "#fbbf24";

        if (u.isUltimate) {
          const timeCycle = Date.now() / 200;
          const hue = Math.floor((timeCycle * 50) % 360);
          strokeColor = `hsl(${hue}, 100%, 60%)`;
          fillStyle = isHover ? "rgba(45, 10, 35, 0.98)" : "rgba(25, 5, 20, 0.95)";
          innerColor = "#ec4899";
          titleColor = "#f472b6";
        } else if (u.isSuper) {
          strokeColor = isHover ? "#fbbf24" : "#d97706";
          fillStyle = isHover ? "rgba(35, 25, 10, 0.98)" : "rgba(22, 16, 6, 0.95)";
          innerColor = "#ca8a04";
          titleColor = "#fef08a";
        }

        ctx.fillStyle = fillStyle;
        ctx.fillRect(cx, cy, cardWidth, cardHeight);

        // Classic Legacy Card Double Border
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = u.isSuper || u.isUltimate ? 4 : 3;
        ctx.strokeRect(cx, cy, cardWidth, cardHeight);

        ctx.strokeStyle = innerColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 6, cy + 6, cardWidth - 12, cardHeight - 12);

        // Card Header Banner
        ctx.fillStyle = u.isUltimate ? "#831843" : (u.isSuper ? "#78350f" : "#451a03");
        ctx.fillRect(cx + 8, cy + 8, cardWidth - 16, 60);

        // Title
        ctx.textAlign = "center";
        ctx.font = "bold 20px 'Courier New', Courier, monospace";
        ctx.fillStyle = titleColor;
        ctx.fillText(u.title, cx + cardWidth / 2, cy + 36);

        // Sub-Label Banner
        ctx.font = "bold 12px 'Courier New', Courier, monospace";
        ctx.fillStyle = u.isUltimate ? "#f472b6" : (u.isSuper ? "#fef08a" : "#fde047");
        let subText = "LEGACY UPGRADE";
        if (u.isUltimate) subText = "★ ULTIMATE CARD ★";
        else if (u.isSuper) subText = "★ SUPER CARD ★";
        ctx.fillText(subText, cx + cardWidth / 2, cy + 56);

        // Gold Banner Divider
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + 12, cy + 68);
        ctx.lineTo(cx + cardWidth - 12, cy + 68);
        ctx.stroke();

        // Desc lines (green for +, red for -, cyan for abilities)
        ctx.font = "bold 15px 'Courier New', Courier, monospace";
        const lines = u.desc.split("\n");
        for (let j = 0; j < lines.length; j++) {
          const line = lines[j];
          if (line.startsWith("+")) {
            ctx.fillStyle = "#4ade80"; // Green bonus
          } else if (line.startsWith("-")) {
            ctx.fillStyle = "#f87171"; // Red penalty
          } else if (line.includes("ability")) {
            ctx.fillStyle = "#38bdf8"; // Cyan ability
          } else {
            ctx.fillStyle = "#fef08a";
          }
          ctx.fillText(line, cx + cardWidth / 2, cy + 104 + j * 24);
        }

        // Card cost badge button
        const affordable = this.state.player.coins >= u.cost;
        ctx.fillStyle = affordable ? (isHover ? "#15803d" : "#166534") : "#7f1d1d";
        ctx.fillRect(cx + 16, cy + cardHeight - 56, cardWidth - 32, 40);
        ctx.strokeStyle = affordable ? "#4ade80" : "#ef4444";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 16, cy + cardHeight - 56, cardWidth - 32, 40);

        ctx.font = "bold 16px 'Courier New', Courier, monospace";
        ctx.fillStyle = affordable ? "#ffffff" : "#f87171";
        ctx.fillText(`COST: ${u.cost} COINS`, cx + cardWidth / 2, cy + cardHeight - 30);
      }

      ctx.textAlign = "center";
      ctx.font = "20px 'Courier New', Courier, monospace";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(
        "Press ENTER to skip / descend deeper",
        this.canvasWidth / 2,
        this.canvasHeight - 40,
      );
    }

    if (
      this.state.transitionState !== "none" &&
      this.state.transitionState !== "cards"
    ) {
      ctx.fillStyle = "#111";
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
    if (!this.ctx || this.isMenuBackground) return;
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
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(-2, -14, 4, 18);
        ctx.fillStyle = "#64748b";
        ctx.fillRect(-6, 4, 12, 3);
        ctx.fillStyle = "#78716c";
        ctx.fillRect(-2, 7, 4, 7);
      } else if (type === 'bow') {
        ctx.strokeStyle = "#78716c";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 14, -Math.PI * 0.4, Math.PI * 0.4);
        ctx.stroke();
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(8, -12);
        ctx.lineTo(8, 12);
        ctx.stroke();
      } else if (type === 'colossal_sword') {
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(-4, -16, 8, 22);
        ctx.fillStyle = "#475569";
        ctx.fillRect(-8, 6, 16, 4);
      } else if (type === 'dual_daggers') {
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(-8, -10, 3, 12);
        ctx.fillRect(5, -10, 3, 12);
      } else if (type === 'mace') {
        ctx.fillStyle = "#475569";
        ctx.fillRect(-6, -14, 12, 12);
      } else if (type === 'battle_axe') {
        ctx.fillStyle = "#475569";
        ctx.fillRect(-10, -14, 20, 10);
      } else if (type === 'torch') {
        ctx.fillStyle = "#78716c";
        ctx.fillRect(-2, -4, 4, 16);
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(-4, -14, 8, 10);
      } else if (type === 'health_potion') {
        ctx.fillStyle = "#f87171";
        ctx.fillRect(-6, -6, 12, 14);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(-4, -4, 8, 10);
      } else if (type === 'speed_potion') {
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(-6, -6, 12, 14);
      } else if (type === 'bomb') {
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.arc(0, 2, 9, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === 'shield') {
        ctx.fillStyle = "#475569";
        ctx.fillRect(-9, -11, 18, 20);
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(-7, -9, 14, 16);
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
