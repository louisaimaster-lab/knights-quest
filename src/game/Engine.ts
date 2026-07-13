import {
  GameState,
  Enemy,
  Particle,
  InteractionText,
  Rect,
  EnemyType,
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

export class GameEngine {
  state: GameState;
  ctx: CanvasRenderingContext2D | null = null;
  lightCanvas?: HTMLCanvasElement;
  canvasWidth = 800;
  canvasHeight = 600;

  constructor() {
    this.state = this.getInitialState();
    this.initFloor(1);
  }

  getInitialState(): GameState {
    return {
      floor: 1,
      maxFloor: 15,
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
      const weapons: ('bow' | 'colossal_sword' | 'dual_daggers')[] = ['bow', 'colossal_sword', 'dual_daggers'];
      const randomWeapon = weapons[Math.floor(Math.random() * weapons.length)];
      return {
        id: `chest_${floor}_${idx}`,
        x: c.x * TILE_SIZE + 4,
        y: c.y * TILE_SIZE + 14,
        w: 24,
        h: 18,
        isOpen: false,
        weapon: randomWeapon
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
    const enemyCount = floor * 5 + Math.floor(Math.random() * 5);
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
      if (this.state.biome === "ice") {
        type = Math.random() > 0.5 ? "frost_slime" : "yeti";
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

    if (floor === this.state.maxFloor) {
      // Spawn Boss near endPos
      this.state.enemies.push({
        id: "boss",
        type: "boss",
        x: gen.endPos.x * TILE_SIZE - TILE_SIZE,
        y: gen.endPos.y * TILE_SIZE - TILE_SIZE,
        w: 64,
        h: 64,
        vx: 0,
        vy: 0,
        health: 350,
        maxHealth: 350,
        facingRight: false,
        isGrounded: false,
        invulnerableTimer: 0,
        onLadder: false,
        stateTimer: 0,
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
    if (this.state.isPaused) return;

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
            u.effect(this.state.player);
            if (u.isSuper && u.abilityId) {
              this.state.player.superAbility = u.abilityId;
              this.state.player.superAbilityCooldown = 0;
              this.state.player.superAbilityActive = false;
              this.state.player.superAbilityTimer = 0;
            }
            this.state.isFloorComplete = false;
            this.initFloor(this.state.floor + 1);
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

    // Time slow accumulator logic (SUPERSONIC)
    if (this.state.timeScale && this.state.timeScale < 1.0) {
      this.state.timeAccumulator = (this.state.timeAccumulator || 0) + this.state.timeScale;
      if (this.state.timeAccumulator < 1.0) {
        // Only update camera and particles/texts for smooth render flow, skip physics/AI/player movement!
        this.updateCamera();
        this.updateParticlesAndTexts();
        
        // Still tick down real-world duration and cooldown of player abilities & poison
        const p = this.state.player;
        if (p.superAbilityActive) {
          p.superAbilityTimer--;
          if (p.superAbilityTimer <= 0) {
            p.superAbilityActive = false;
            p.timeSlowActive = false;
            this.state.timeScale = 1.0;
            p.superAbilityCooldown = 7500; // 125s CD
          }
        }
        if (p.superAbilityCooldown > 0) p.superAbilityCooldown--;
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

    this.updatePlayer();
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

    // Compute weapon jump multiplier early (needed for jump code)
    let earlyWeaponJumpMult = 1;
    if (p.weaponEquipped && !p.clawsActive) {
      if (p.weapon === 'colossal_sword') earlyWeaponJumpMult = 0.90;
      else if (p.weapon === 'bow') earlyWeaponJumpMult = 1.20;
      else if (p.weapon === 'dual_daggers') earlyWeaponJumpMult = 1.10;
    }
    if (p.superAbilityActive && p.superAbility === 'supersonic') earlyWeaponJumpMult *= 1.15;

    if (this.state.floorTitleState === "none") {
      p.facingRight = this.state.mouse.worldX > p.x + p.w / 2;
    }

    if (!isStunned) {
      if (keys["a"] || keys["ArrowLeft"]) {
        p.vx -= 1;
      }
      if (keys["d"] || keys["ArrowRight"]) {
        p.vx += 1;
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
        const scaledJump = JUMP_POWER * p.jumpMulti * earlyWeaponJumpMult;
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
        const scaledJump = JUMP_POWER * p.jumpMulti * earlyWeaponJumpMult;
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

    // Hotbar: Press 1 to toggle equip/unequip weapon
    if ((keys["1"] && !prevKeys["1"])) {
      p.weaponEquipped = !p.weaponEquipped;
      this.state.texts.push({
        x: p.x + p.w / 2, y: p.y - 15,
        text: p.weaponEquipped ? "Weapon Equipped" : "Weapon Unequipped",
        life: 60, maxLife: 60
      });
    }

    // Super ability activation: Press Q
    if ((keys["q"] || keys["Q"]) && !(prevKeys["q"] || prevKeys["Q"])) {
      if (p.superAbility && p.superAbilityCooldown <= 0 && !p.superAbilityActive) {
        p.superAbilityActive = true;
        if (p.superAbility === 'malevolence') {
          p.superAbilityTimer = 900; // 15s
          p.clawsActive = true;
        } else if (p.superAbility === 'impenetrable') {
          p.superAbilityTimer = 1200; // 20s
          p.shieldActive = true;
          p.shieldTimer = 1200;
        } else if (p.superAbility === 'supersonic') {
          p.superAbilityTimer = 600; // 10s
          p.timeSlowActive = true;
          this.state.timeScale = 0.3;
        }
        this.state.texts.push({
          x: p.x + p.w / 2, y: p.y - 20,
          text: `${p.superAbility.toUpperCase()} ACTIVATED!`,
          life: 90, maxLife: 90
        });
      }
    }

    // Super ability timer tick
    if (p.superAbilityActive) {
      p.superAbilityTimer--;
      if (p.superAbilityTimer <= 0) {
        p.superAbilityActive = false;
        p.clawsActive = false;
        if (p.superAbility === 'impenetrable') {
          p.shieldActive = false;
          p.shieldTimer = 0;
        }
        if (p.superAbility === 'supersonic') {
          p.timeSlowActive = false;
          this.state.timeScale = 1;
        }
        // Start cooldown
        if (p.superAbility === 'malevolence') p.superAbilityCooldown = 6000; // 100s
        else if (p.superAbility === 'impenetrable') p.superAbilityCooldown = 6600; // 110s
        else if (p.superAbility === 'supersonic') p.superAbilityCooldown = 7500; // 125s
      }
    }
    if (p.superAbilityCooldown > 0) p.superAbilityCooldown--;

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

    // Attack (only when weapon equipped)
    if (
      this.state.mouse.down &&
      p.attackTimer <= 0 &&
      p.attackCooldown <= 0 &&
      p.weaponEquipped &&
      this.state.floorTitleState === "none" &&
      this.state.transitionState === "none"
    ) {
      const isBow = p.clawsActive ? false : p.weapon === 'bow';
      const isColossal = p.clawsActive ? false : p.weapon === 'colossal_sword';
      const isDaggers = p.clawsActive ? false : p.weapon === 'dual_daggers';

      p.isAttacking = true;
      p.isAirAttacking = false;

      if (p.clawsActive) {
        // Claws: 70% of daggers speed (6 * 0.7 ≈ 4 frames)
        p.attackTimer = 4;
      } else {
        p.attackTimer = isBow ? 15 : (isColossal ? 20 : (isDaggers ? 6 : 10));
      }
      p.slashFlipped = !p.slashFlipped;
      p.comboResetTimer = 120; // 2 seconds
      
      if (!p.wallSliding && !isClimbing && !p.onLadder && !inWater) {
        if (!isBow) {
          const lungeSpeed = isColossal ? 4 : (isDaggers ? 3 : 6);
          p.vx += p.facingRight ? lungeSpeed * 0.5 : -lungeSpeed * 0.5;
          p.vy = -1; // slight hop
        }
      }
      
      if (!isBow) {
        this.checkAttackHits();
      }
    }

    if (p.attackTimer > 0) {
      if (p.weapon === 'bow' && !p.clawsActive && p.attackTimer === 10) {
        this.fireArrow();
      }

      p.attackTimer--;
      if (p.attackTimer === 0) {
        p.isAttacking = false;
        if (p.clawsActive) {
          p.attackCooldown = 3;
        } else {
          p.attackCooldown = p.weapon === 'colossal_sword' ? 50 : (p.weapon === 'dual_daggers' ? 5 : 12);
        }
      }
    }

    // Weapon stat effects
    let weaponSpeedMult = 1;
    let weaponJumpMult = 1;
    if (p.weaponEquipped && !p.clawsActive) {
      if (p.weapon === 'colossal_sword') { weaponSpeedMult = 0.80; weaponJumpMult = 0.90; }
      else if (p.weapon === 'bow') { weaponSpeedMult = 1.05; weaponJumpMult = 1.20; }
      else if (p.weapon === 'dual_daggers') { weaponSpeedMult = 1.15; weaponJumpMult = 1.10; }
    }

    // SUPERSONIC active boost
    let superSpeedMult = 1;
    let superJumpMult = 1;
    if (p.superAbilityActive && p.superAbility === 'supersonic') {
      superSpeedMult = 1.20;
      superJumpMult = 1.15;
    }

    // Apply effective multipliers
    const effectiveSpeedMulti = p.speedMulti * weaponSpeedMult * superSpeedMult;
    const effectiveJumpMulti = p.jumpMulti * weaponJumpMult * superJumpMult;

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

    if (nearestDropped) {
      if (justPressedSwap) {
        // Swap active weapon with dropped weapon
        const oldWeapon = p.weapon || 'sword';
        p.weapon = nearestDropped.type;
        nearestDropped.type = oldWeapon; // Swap in place

        // Consume key
        keys["f"] = false;
        keys["F"] = false;
        if (this.state.keys) {
          this.state.keys["f"] = false;
          this.state.keys["F"] = false;
        }

        // Spawn pop up text
        const weaponNames: Record<string, string> = {
          'sword': 'Sword',
          'bow': 'Bow',
          'colossal_sword': 'Colossal Sword',
          'dual_daggers': 'Dual Daggers'
        };
        this.state.texts.push({
          x: p.x + p.w / 2,
          y: p.y - 15,
          text: `Equipped ${weaponNames[p.weapon] || p.weapon}!`,
          life: 80,
          maxLife: 80
        });
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
    if (p.weapon === 'bow' && !p.clawsActive) return;

    let attackRect;
    let attackWidth = 65;
    let attackHeight = p.h + 40;
    let attackYOffset = -20;
    let damage = 15;
    let knockback = 5;

    if (p.clawsActive) {
      attackWidth = 90; // slightly smaller than colossal sword (110)
      attackHeight = p.h + 50;
      attackYOffset = -25;
      damage = 90; // twice colossal sword (45 * 2)
      knockback = 9;
    } else if (p.weapon === 'colossal_sword') {
      attackWidth = 110;
      attackHeight = p.h + 70;
      attackYOffset = -35;
      damage = 45;
      knockback = 12;
    } else if (p.weapon === 'dual_daggers') {
      attackWidth = 35;
      attackHeight = p.h + 10;
      attackYOffset = -5;
      damage = 8;
      knockback = 2.5;
    }

    if (p.isAirAttacking) {
      const scaleHeight = p.clawsActive ? 3.0 : (p.weapon === 'colossal_sword' ? 4.5 : (p.weapon === 'dual_daggers' ? 1.5 : 3.0));
      attackRect = {
        x: p.x - 10,
        y: p.y + p.h,
        w: p.w + 20,
        h: TILE_SIZE * scaleHeight,
      };
    } else {
      attackRect = {
        x: p.facingRight ? p.x + p.w : p.x - attackWidth,
        y: p.y + attackYOffset,
        w: attackWidth,
        h: attackHeight,
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

    p.health -= finalDamage;
    p.invulnerableTimer = 30;

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
    }
    return true;
  }

  fireArrow() {
    const p = this.state.player;
    const arrowSpeed = 14;
    let vx = 0;
    let vy = 0;
    let w = 16;
    let h = 8;
    let x = p.x + p.w / 2 - w / 2;
    let y = p.y + p.h / 2 - h / 2;

    if (p.isAirAttacking) {
      vy = arrowSpeed;
      w = 8;
      h = 16;
      y = p.y + p.h;
    } else {
      vx = p.facingRight ? arrowSpeed : -arrowSpeed;
      x = p.facingRight ? p.x + p.w : p.x - w;
    }

    this.state.projectiles.push({
      id: `arrow_${Date.now()}_${Math.random()}`,
      x,
      y,
      w,
      h,
      vx,
      vy,
      type: 'arrow',
      damage: 12,
      facingRight: p.facingRight
    });

    this.spawnParticles(x + w / 2, y + h / 2, "rgba(255, 255, 255, 0.5)", 4);
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

      if (hitWall) {
        this.spawnParticles(proj.x + proj.w / 2, proj.y + proj.h / 2, "rgba(200, 200, 200, 0.4)", 4);
        this.state.projectiles.splice(i, 1);
        continue;
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
        effect: (p: any) => {
          p.damageMulti += 0.20;
        }
      },
      {
        title: "Glass Cannon",
        desc: "-35% HP\n+50% Damage",
        isSuper: false,
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
        effect: (p: any) => {
          p.maxHealth = Math.round(p.maxHealth * 1.25);
          p.health += Math.round(p.baseMaxHealth * 0.25);
        }
      },
      {
        title: "Heavy",
        desc: "+30% HP\n-15% Speed",
        isSuper: false,
        effect: (p: any) => {
          p.maxHealth = Math.round(p.maxHealth * 1.30);
          p.health += Math.round(p.baseMaxHealth * 0.30);
          p.speedMulti -= 0.15;
        }
      },
      {
        title: "Runner",
        desc: "+25% Speed",
        isSuper: false,
        effect: (p: any) => {
          p.speedMulti += 0.25;
        }
      },
      {
        title: "Sprinter",
        desc: "+40% Speed\n-20% Jump Height\n-15% HP",
        isSuper: false,
        effect: (p: any) => {
          p.speedMulti += 0.40;
          p.jumpMulti -= 0.20;
          p.maxHealth = Math.max(10, Math.round(p.maxHealth * 0.85));
          if (p.health > p.maxHealth) p.health = p.maxHealth;
        }
      },
      {
        title: "Spring Heels",
        desc: "+25% Jump Height",
        isSuper: false,
        effect: (p: any) => {
          p.jumpMulti += 0.25;
        }
      },
      {
        title: "Jumper",
        desc: "+10% Speed\n+15% Jump Height",
        isSuper: false,
        effect: (p: any) => {
          p.speedMulti += 0.10;
          p.jumpMulti += 0.15;
        }
      }
    ];

    const superPool = [
      {
        title: "MALEVOLENCE",
        desc: "+120% Damage\n+25% Speed\n+15% HP\n\nRip and Tear Claws\nability on Q (CD 100s)",
        isSuper: true,
        abilityId: 'malevolence' as const,
        effect: (p: any) => {
          p.damageMulti += 1.20;
          p.speedMulti += 0.25;
          p.maxHealth = Math.round(p.maxHealth * 1.15);
          p.health += Math.round(p.baseMaxHealth * 0.15);
        }
      },
      {
        title: "IMPENETRABLE",
        desc: "+110% HP\n-15% Speed\n-30% Jump Height\n\nShield of Solidity\nability on Q (CD 110s)",
        isSuper: true,
        abilityId: 'impenetrable' as const,
        effect: (p: any) => {
          p.maxHealth = Math.round(p.maxHealth * 2.10);
          p.health += Math.round(p.baseMaxHealth * 1.10);
          p.speedMulti -= 0.15;
          p.jumpMulti -= 0.30;
        }
      },
      {
        title: "SUPERSONIC",
        desc: "+70% Speed\n+45% Jump Height\n\nHyper Perception\nability on Q (CD 125s)",
        isSuper: true,
        abilityId: 'supersonic' as const,
        effect: (p: any) => {
          p.speedMulti += 0.70;
          p.jumpMulti += 0.45;
        }
      }
    ];

    // Pick 3 random normal upgrades
    normalPool.sort(() => Math.random() - 0.5);
    const selected = normalPool.slice(0, 3);

    // 5% chance to replace each chosen card with a random super card
    this.state.upgrades = selected.map((u, i) => {
      if (Math.random() < 0.05) {
        const superUpgrade = superPool[Math.floor(Math.random() * superPool.length)];
        return {
          id: `upgrade_${i}`,
          title: superUpgrade.title,
          desc: superUpgrade.desc,
          isSuper: true,
          abilityId: superUpgrade.abilityId,
          effect: superUpgrade.effect
        };
      }
      return {
        id: `upgrade_${i}`,
        title: u.title,
        desc: u.desc,
        isSuper: false,
        effect: u.effect
      };
    });
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
        if (e.isGrounded && e.stateTimer <= 0 && distToPlayer < 300) {
          e.vy =
            e.type === "frost_slime" ? -8 : e.type === "moss_slime" ? -9 : -7;
          e.vx =
            (p.x > e.x ? 1 : -1) *
            (e.type === "frost_slime" ? 4 : e.type === "moss_slime" ? 5 : 3);
          e.stateTimer = 60 + Math.random() * 30;
        } else if (e.isGrounded) {
          e.vx *= 0.8;
        }
      } else if (e.type === "flytrap") {
        e.vx = 0;
        e.vy += GRAVITY;

        const dx = Math.abs(p.x - e.x);
        const dy = Math.abs(p.y - e.y);

        if (dx < TILE_SIZE * 3.5 && dy < TILE_SIZE * 3.5 && e.stateTimer <= 0) {
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
          e.stateTimer = 30 + Math.random() * 30;
          e.vx = (Math.random() - 0.5) * 4;
          e.vy = (Math.random() - 0.5) * 4;
          if (distToPlayer < 200) {
            e.vx += (p.x > e.x ? 1 : -1) * 2;
            e.vy += (p.y > e.y ? 1 : -1) * 2;
          }
        }
      } else if (e.type === "yeti") {
        e.vy += GRAVITY;
        if (e.isGrounded) {
          e.vx *= 0.8;
          e.aiState = "idle";
          if (e.stateTimer <= 0 && distToPlayer < 500) {
            e.stateTimer = 60 + Math.random() * 60;
            e.aiState = "leaping";
            e.vy = -12; // massive jump height
            e.vx = (p.x > e.x ? 1 : -1) * 8; // massive leap speed
            e.facingRight = p.x > e.x;
          }
        }
      } else if (e.type === "boss") {
        e.vy += GRAVITY;
        if (e.stateTimer <= 0) {
          e.aiState = Math.random() > 0.5 ? "jump" : "smash";
          e.stateTimer = 100;
        }
        if (e.aiState === "jump" && e.isGrounded) {
          e.vy = -12;
          e.vx = (p.x > e.x ? 1 : -1) * 4;
          e.isGrounded = false;
          this.state.shakeTimer = 10;
        } else if (e.aiState === "smash") {
          if (e.isGrounded) e.vx *= 0.9;
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
              ? 18 // Yeti rework: 18 damage
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
              baseColor = `#11223d`; // very dark icy rock
              darkColor = `#07101f`; // nearly black
              highlightColor = `#2e5885`; // frosty edge
              strokeColor = `#030810`;
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
        // Pixelated Slime
        ctx.fillRect(e.x + 4, e.y + e.h - 16, e.w - 8, 16);
        ctx.fillRect(e.x + 2, e.y + e.h - 12, e.w - 4, 12);
        ctx.fillRect(e.x, e.y + e.h - 8, e.w, 8);
        if (e.type === "frost_slime") {
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.fillRect(e.x + 4, e.y + e.h - 12, 6, 4); // ice reflection
        } else if (e.type === "moss_slime") {
          ctx.fillStyle = "#2d8d2d"; // moss patches
          ctx.fillRect(e.x + 6, e.y + e.h - 14, 6, 4);
          ctx.fillRect(e.x + e.w - 10, e.y + e.h - 10, 4, 4);
          ctx.fillRect(e.x + 2, e.y + e.h - 6, 4, 4);
        }
        // Slime eyes
        ctx.fillStyle =
          e.type === "frost_slime"
            ? "#003366"
            : e.type === "moss_slime"
              ? "#a2f520"
              : "rgba(0,0,0,0.5)";
ctx.fillRect(
          e.x + e.w / 2 + (e.facingRight ? 2 : -4),
          e.y + e.h - 8,
          2,
          2,
        );
      } else if (e.type === "flytrap") {
        // Stem
        ctx.fillStyle = "#1e3c1a"; // dark green stem
        ctx.fillRect(e.x + 10, e.y + 16, 4, e.h - 16);

        // Head (rotates toward player if tracking/attacking)
        ctx.save();
        ctx.translate(e.x + 12, e.y + 18);
        
        let trackAngle = 0;
        if (e.aiState === "tracking" || e.aiState === "attacking") {
          const targetAngle = Math.atan2(p.y + p.h / 2 - (e.y + 12), p.x + p.w / 2 - (e.x + 12));
          trackAngle = targetAngle;
          e.facingRight = (p.x + p.w / 2 > e.x + 12);
          
          if (e.facingRight) {
            trackAngle = Math.max(-Math.PI * 0.25, Math.min(Math.PI * 0.25, trackAngle));
          } else {
            trackAngle = Math.atan2(-(p.y + p.h / 2 - (e.y + 12)), -(p.x + p.w / 2 - (e.x + 12)));
            trackAngle = -Math.max(-Math.PI * 0.25, Math.min(Math.PI * 0.25, trackAngle));
          }
        }
        
        if (!e.facingRight) {
          ctx.scale(-1, 1);
        }
        ctx.rotate(trackAngle);

        ctx.fillStyle = e.invulnerableTimer > 0 ? "#fff" : "#1e801e";
        const jawOffset = e.aiState === "attacking" ? 6 : (e.aiState === "tracking" ? 2 : 0);
        
        // Upper jaw
        ctx.fillRect(-10, -14 - jawOffset, 20, 8);
        // Lower jaw
        ctx.fillRect(-10, -6 + jawOffset, 20, 6);

        // Teeth
        ctx.fillStyle = "#fff";
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(-8 + i * 4, -6 - jawOffset, 2, 2);
          ctx.fillRect(-6 + i * 4, -8 + jawOffset, 2, 2);
        }
        
        // Eye
        ctx.fillStyle = e.aiState === "tracking" ? "#ffcc00" : "#ff0000";
        ctx.fillRect(2, -10, 3, 3);
        
        ctx.restore();

        // Leaf at bottom
        ctx.fillStyle = "#2d8d2d";
        ctx.fillRect(e.x + 4, e.y + e.h - 4, 6, 4);
        ctx.fillRect(e.x + 14, e.y + e.h - 4, 6, 4);
      } else if (e.type === "yeti") {
        // Body
        ctx.fillRect(e.x + 4, e.y, e.w - 8, e.h);
        ctx.fillRect(e.x + 2, e.y + 4, e.w - 4, e.h - 8);
        ctx.fillRect(e.x, e.y + 8, e.w, e.h - 16);

        // Raised arms if leaping
        ctx.fillStyle = e.invulnerableTimer > 0 ? "#fff" : "#e2e8f0";
        if (e.aiState === "leaping") {
          ctx.fillRect(e.x - 4, e.y - 8, 4, 16);
          ctx.fillRect(e.x + e.w, e.y - 8, 4, 16);
        } else {
          ctx.fillRect(e.x - 2, e.y + 8, 2, 16);
          ctx.fillRect(e.x + e.w, e.y + 8, 2, 16);
        }

        // Face (Blue skin)
        ctx.fillStyle = "#7aa8b8";
        ctx.fillRect(e.x + 8, e.y + 8, e.w - 16, 12);

        // Eyes
        ctx.fillStyle = "#fff";
        const eyeX = e.facingRight ? e.x + 16 : e.x + 12;
        ctx.fillRect(eyeX, e.y + 10, 4, 4);
        ctx.fillRect(eyeX + (e.facingRight ? 6 : -6), e.y + 10, 4, 4);
        ctx.fillStyle = "#000";
        ctx.fillRect(eyeX + (e.facingRight ? 2 : 0), e.y + 12, 2, 2);
        ctx.fillRect(eyeX + (e.facingRight ? 8 : -6), e.y + 12, 2, 2);

        // Horns
        ctx.fillStyle = "#fff";
        ctx.fillRect(e.x, e.y + 2, 4, 4);
        ctx.fillRect(e.x + e.w - 4, e.y + 2, 4, 4);
      } else if (e.type === "bat") {
        ctx.fillRect(e.x + e.w / 2 - 4, e.y + e.h / 2 - 4, 8, 8);

        // Wings anim
        if (Math.floor(Date.now() / 150) % 2 === 0) {
          ctx.fillRect(e.x + e.w / 2 - 12, e.y + e.h / 2 + 2, 8, 4);
          ctx.fillRect(e.x + e.w / 2 - 16, e.y + e.h / 2 + 4, 4, 8);
          ctx.fillRect(e.x + e.w / 2 + 4, e.y + e.h / 2 + 2, 8, 4);
          ctx.fillRect(e.x + e.w / 2 + 12, e.y + e.h / 2 + 4, 4, 8);
        } else {
          ctx.fillRect(e.x + e.w / 2 - 12, e.y + e.h / 2 - 6, 8, 4);
          ctx.fillRect(e.x + e.w / 2 - 16, e.y + e.h / 2 - 12, 4, 8);
          ctx.fillRect(e.x + e.w / 2 + 4, e.y + e.h / 2 - 6, 8, 4);
          ctx.fillRect(e.x + e.w / 2 + 12, e.y + e.h / 2 - 12, 4, 8);
        }
        ctx.fillStyle = "red";
        ctx.fillRect(e.x + e.w / 2 + (e.facingRight ? 2 : -4), e.y + e.h / 2 - 2, 2, 2);
      } else if (e.type === "boss") {
        ctx.fillRect(e.x + 4, e.y, e.w - 8, e.h);
        ctx.fillRect(e.x, e.y + 8, e.w, e.h - 16);

        ctx.fillStyle = "#000";
        ctx.fillRect(e.x + 16, e.y + 20, 8, 8);
        ctx.fillRect(e.x + e.w - 24, e.y + 20, 8, 8);
        ctx.fillStyle = "#ff4d00";
        ctx.fillRect(e.x + 20, e.y + 24, 4, 4);
        ctx.fillRect(e.x + e.w - 20, e.y + 24, 4, 4);
        ctx.fillStyle = "#000";
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(e.x + 24 + i * 4, e.y + 44 + (i % 2) * 4, 4, 4);
        }
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

    // Draw Player Miner Model
    ctx.save();
    ctx.translate(
      Math.round(p.x * zoom) / zoom - p.x,
      Math.round(p.y * zoom) / zoom - p.y,
    ); // ponytail: align player model to integer pixel grid in screen space
    const isMoving = Math.abs(p.vx) > 0.5 && p.isGrounded;
    const bob = isMoving ? Math.round(Math.sin(Date.now() / 50) * 2) : 0;

    const isHit =
      p.invulnerableTimer > 0 && Math.floor(Date.now() / 100) % 2 === 0;

    // Shield (Back arm)
    ctx.fillStyle = isHit ? COLORS.playerHit : "#475569";
    if (p.facingRight) ctx.fillRect(p.x - 2, p.y + 10 + bob, 8, 10);
    else ctx.fillRect(p.x + p.w - 6, p.y + 10 + bob, 8, 10);

    // Body
    ctx.fillStyle = isHit ? COLORS.playerHit : "#a0aab5";
    ctx.fillRect(p.x + 4, p.y + 10 + bob, p.w - 8, p.h - 14);

    // Helmet
    ctx.fillStyle = isHit ? COLORS.playerHit : "#cbd5e1";
    ctx.fillRect(p.x + 2, p.y + bob, p.w - 4, 14);

    // Visor
    ctx.fillStyle = "#1e293b";
    if (p.facingRight) {
      ctx.fillRect(p.x + 8, p.y + 4 + bob, p.w - 10, 4); // Top bar
      ctx.fillRect(p.x + p.w - 8, p.y + 8 + bob, 4, 6); // Vert bar
    } else {
      ctx.fillRect(p.x + 2, p.y + 4 + bob, p.w - 10, 4);
      ctx.fillRect(p.x + 4, p.y + 8 + bob, 4, 6);
    }

    // Legs
    ctx.fillStyle = isHit ? COLORS.playerHit : "#64748b";
    const legOffset = isMoving ? Math.sin(Date.now() / 50) * 4 : 0;
    ctx.fillRect(p.x + 4, p.y + p.h - 4, 6, 4 - legOffset);
    ctx.fillRect(p.x + p.w - 10, p.y + p.h - 4, 6, 4 + legOffset);

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
      if (p.facingRight) {
        ctx.fillRect(p.x + p.w - 2, p.y + 8 + bob, 8, 2);
        ctx.fillRect(p.x + p.w, p.y + 11 + bob, 8, 2);
        ctx.fillRect(p.x + p.w - 2, p.y + 14 + bob, 8, 2);
      } else {
        ctx.fillRect(p.x - 6, p.y + 8 + bob, 8, 2);
        ctx.fillRect(p.x - 8, p.y + 11 + bob, 8, 2);
        ctx.fillRect(p.x - 6, p.y + 14 + bob, 8, 2);
      }
    } else if (p.weaponEquipped) {
      if (p.weapon === "colossal_sword") {
        // Colossal Sword Blade (Behind Hand)
        ctx.fillStyle = isHit ? COLORS.playerHit : "#94a3b8"; // steel grey
        if (p.facingRight) ctx.fillRect(p.x + p.w - 3, p.y - 12 + bob, 6, 24);
        else ctx.fillRect(p.x - 3, p.y - 12 + bob, 6, 24);

        // Colossal Sword hilt (Front hand)
        ctx.fillStyle = "#fbbf24"; // golden guard
        if (p.facingRight) ctx.fillRect(p.x + p.w - 6, p.y + 10 + bob, 12, 4);
        else ctx.fillRect(p.x - 6, p.y + 10 + bob, 12, 4);

        // Colossal Sword handle
        ctx.fillStyle = "#78350f"; // brown handle
        if (p.facingRight) ctx.fillRect(p.x + p.w - 2, p.y + 14 + bob, 4, 6);
        else ctx.fillRect(p.x - 2, p.y + 14 + bob, 4, 6);
      } else if (p.weapon === "dual_daggers") {
        // Dagger 1 (Back hand/arm)
        ctx.fillStyle = isHit ? COLORS.playerHit : "#cbd5e1";
        if (p.facingRight) {
          ctx.fillRect(p.x - 4, p.y + 6 + bob, 3, 6); // blade pointing down
          ctx.fillStyle = "#ea580c";
          ctx.fillRect(p.x - 5, p.y + 12 + bob, 5, 2); // hilt
        } else {
          ctx.fillRect(p.x + p.w + 1, p.y + 6 + bob, 3, 6);
          ctx.fillStyle = "#ea580c";
          ctx.fillRect(p.x + p.w, p.y + 12 + bob, 5, 2);
        }

        // Dagger 2 (Front hand)
        ctx.fillStyle = isHit ? COLORS.playerHit : "#cbd5e1";
        if (p.facingRight) {
          ctx.fillRect(p.x + p.w - 1, p.y + 8 + bob, 3, 6);
          ctx.fillStyle = "#ea580c";
          ctx.fillRect(p.x + p.w - 2, p.y + 14 + bob, 5, 2);
        } else {
          ctx.fillRect(p.x - 2, p.y + 8 + bob, 3, 6);
          ctx.fillStyle = "#ea580c";
          ctx.fillRect(p.x - 3, p.y + 14 + bob, 5, 2);
        }
      } else if (p.weapon === "bow") {
        const bowX = p.facingRight ? p.x + p.w : p.x - 8;
        const bowY = p.y + 6 + bob;

        if (p.isAttacking && p.attackTimer > 0) {
          // Bow-pull-back Model (bending more, string pulled)
          ctx.fillStyle = "#b45309"; // wood brown
          if (p.facingRight) {
            ctx.fillRect(bowX - 4, bowY + 1, 4, 2);
            ctx.fillRect(bowX - 2, bowY + 3, 4, 2);
            ctx.fillRect(bowX + 1, bowY + 5, 3, 6); // grip
            ctx.fillRect(bowX - 2, bowY + 11, 4, 2);
            ctx.fillRect(bowX - 4, bowY + 13, 4, 2);
            // Draw pulled back string (forming a V shape)
            ctx.fillStyle = "#cbd5e1";
            ctx.fillRect(bowX - 6, bowY + 1, 2, 2);
            ctx.fillRect(bowX - 8, bowY + 3, 2, 2);
            ctx.fillRect(bowX - 10, bowY + 5, 2, 6);
            ctx.fillRect(bowX - 8, bowY + 11, 2, 2);
            ctx.fillRect(bowX - 6, bowY + 13, 2, 2);

            // Draw arrow in the bow
            ctx.fillStyle = "#78350f"; // wood arrow shaft
            ctx.fillRect(bowX - 10, bowY + 7, 12, 2);
            ctx.fillStyle = "#10b981"; // green arrow fletching
            ctx.fillRect(bowX - 12, bowY + 6, 2, 4);
            ctx.fillStyle = "#cbd5e1"; // steel arrowhead
            ctx.fillRect(bowX + 2, bowY + 6, 3, 4);
          } else {
            ctx.fillRect(bowX + 8, bowY + 1, 4, 2);
            ctx.fillRect(bowX + 6, bowY + 3, 4, 2);
            ctx.fillRect(bowX + 4, bowY + 5, 3, 6); // grip
            ctx.fillRect(bowX + 6, bowY + 11, 4, 2);
            ctx.fillRect(bowX + 8, bowY + 13, 4, 2);
            // Draw pulled back string
            ctx.fillStyle = "#cbd5e1";
            ctx.fillRect(bowX + 12, bowY + 1, 2, 2);
            ctx.fillRect(bowX + 14, bowY + 3, 2, 2);
            ctx.fillRect(bowX + 16, bowY + 5, 2, 6);
            ctx.fillRect(bowX + 14, bowY + 11, 2, 2);
            ctx.fillRect(bowX + 12, bowY + 13, 2, 2);

            // Draw arrow in the bow
            ctx.fillStyle = "#78350f";
            ctx.fillRect(bowX + 6, bowY + 7, 12, 2);
            ctx.fillStyle = "#10b981";
            ctx.fillRect(bowX + 18, bowY + 6, 2, 4);
            ctx.fillStyle = "#cbd5e1";
            ctx.fillRect(bowX + 3, bowY + 6, 3, 4);
          }
        } else {
          // Bow Model (normal held)
          ctx.fillStyle = "#b45309"; // wood brown
          if (p.facingRight) {
            ctx.fillRect(bowX - 2, bowY + 2, 4, 2);
            ctx.fillRect(bowX, bowY + 4, 4, 2);
            ctx.fillRect(bowX + 2, bowY + 6, 4, 4); // grip
            ctx.fillRect(bowX, bowY + 10, 4, 2);
            ctx.fillRect(bowX - 2, bowY + 12, 4, 2);
            // Draw string
            ctx.fillStyle = "#cbd5e1";
            ctx.fillRect(bowX - 4, bowY + 2, 2, 12);
          } else {
            ctx.fillRect(bowX + 6, bowY + 2, 4, 2);
            ctx.fillRect(bowX + 4, bowY + 4, 4, 2);
            ctx.fillRect(bowX + 2, bowY + 6, 4, 4); // grip
            ctx.fillRect(bowX + 4, bowY + 10, 4, 2);
            ctx.fillRect(bowX + 6, bowY + 12, 4, 2);
            // Draw string
            ctx.fillStyle = "#cbd5e1";
            ctx.fillRect(bowX + 10, bowY + 2, 2, 12);
          }
        }
      } else {
        // Standard Sword Blade (Behind Hand)
        ctx.fillStyle = isHit ? COLORS.playerHit : "#e2e8f0";
        if (p.facingRight) ctx.fillRect(p.x + p.w - 2, p.y - 2 + bob, 4, 14);
        else ctx.fillRect(p.x - 2, p.y - 2 + bob, 4, 14);

        // Standard Sword hilt (Front hand)
        ctx.fillStyle = p.playerColor || "#ea580c";
        if (p.facingRight) ctx.fillRect(p.x + p.w - 4, p.y + 10 + bob, 8, 4);
        else ctx.fillRect(p.x - 4, p.y + 10 + bob, 8, 4);
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

      if (dir === -1) {
        ctx.scale(-1, 1);
      }
      if (p.slashFlipped) {
        ctx.scale(1, -1);
      }
      let scaleX = p.weapon === "colossal_sword" ? 3.8 : (p.weapon === "dual_daggers" ? 1.4 : 2.4);
      let scaleY = p.weapon === "colossal_sword" ? 0.7 : (p.weapon === "dual_daggers" ? 0.25 : 0.45);
      if (p.clawsActive) {
        scaleX = 3.2;
        scaleY = 0.6;
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
      
      // Draw 3 layers for beautiful neon glow and pointy edges
      // Outer glow
      drawPixelCrescent(rBase, spread, maxThick + 4, tailAngle - 0.04, headAngle + 0.04, purple);
      // Middle glow
      drawPixelCrescent(rBase, spread, maxThick, tailAngle - 0.02, headAngle + 0.02, pink);
      // Inner core
      drawPixelCrescent(rBase, spread, Math.max(2, maxThick - 6), tailAngle, headAngle, white);

      // Sparks in front of the blade
      if (progress > 0.1 && progress < 0.9) {
        const sparkCount = p.clawsActive ? Math.floor(trailProgress * 8) : (p.weapon === "colossal_sword" ? Math.floor(trailProgress * 12) : (p.weapon === "dual_daggers" ? Math.floor(trailProgress * 3) : Math.floor(trailProgress * 6)));
        const sparkRad = p.clawsActive ? 32 : (p.weapon === "colossal_sword" ? 40 : (p.weapon === "dual_daggers" ? 16 : 26));
        drawSparks(headAngle + 0.1, sparkRad, sparkCount);
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
          // Dagger 1 (slash right)
          ctx.strokeStyle = "#9ca3af";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-5, 5);
          ctx.lineTo(3, -3);
          ctx.stroke();
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(-7, 5, 2, 2);
          
          // Dagger 2 (slash left)
          ctx.strokeStyle = "#9ca3af";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(5, 5);
          ctx.lineTo(-3, -3);
          ctx.stroke();
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(5, 5, 2, 2);
        }
        
        ctx.restore();

        // If player is close, draw swap prompt "[F] Swap to [Weapon]"
        const px = this.state.player.x + this.state.player.w / 2;
        const py = this.state.player.y + this.state.player.h / 2;
        const dist = Math.hypot(px - (dw.x + dw.w / 2), py - (dw.y + dw.h / 2));
        if (dist < 32) {
          const weaponNames: Record<string, string> = {
            'sword': 'Sword',
            'bow': 'Bow',
            'colossal_sword': 'Colossal Sword',
            'dual_daggers': 'Dual Daggers'
          };
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 9px 'Courier New', Courier, monospace";
          ctx.textAlign = "center";
          ctx.fillText(`[F] SWAP TO ${weaponNames[dw.type].toUpperCase()}`, dw.x + dw.w / 2, dw.y - 12);
        }
      }
    }

    // Draw Projectiles
    if (this.state.projectiles) {
      for (const proj of this.state.projectiles) {
        if (proj.type === 'arrow') {
          const px = Math.round(proj.x * zoom) / zoom; // ponytail: round coordinates in screen space
          const py = Math.round(proj.y * zoom) / zoom;
          const pw = proj.w;
          const ph = proj.h;
          
          if (proj.vy > 0) {
            // Shaft (vertical brown line)
            ctx.fillStyle = "#78350f";
            ctx.fillRect(px + pw / 2 - 1, py + 2, 2, ph - 6);
            // Fletching (green feathers at top)
            ctx.fillStyle = "#10b981";
            ctx.fillRect(px + pw / 2 - 3, py, 6, 2);
            // Steel point (cyan/steel tip at bottom)
            ctx.fillStyle = "#cbd5e1";
            ctx.fillRect(px + pw / 2 - 2, py + ph - 4, 4, 4);
          } else {
            if (proj.facingRight) {
              // Shaft
              ctx.fillStyle = "#78350f";
              ctx.fillRect(px + 2, py + ph / 2 - 1, pw - 6, 2);
              // Fletching (feathers on left)
              ctx.fillStyle = "#10b981";
              ctx.fillRect(px, py + ph / 2 - 3, 2, 6);
              // Arrowhead on right
              ctx.fillStyle = "#cbd5e1";
              ctx.fillRect(px + pw - 4, py + ph / 2 - 2, 4, 4);
            } else {
              // Shaft
              ctx.fillStyle = "#78350f";
              ctx.fillRect(px + 4, py + ph / 2 - 1, pw - 6, 2);
              // Fletching on right
              ctx.fillStyle = "#10b981";
              ctx.fillRect(px + pw - 2, py + ph / 2 - 3, 2, 6);
              // Arrowhead on left
              ctx.fillStyle = "#cbd5e1";
              ctx.fillRect(px, py + ph / 2 - 2, 4, 4);
            }
          }
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
      const centerTy = Math.floor((p.y + p.h / 2) / TILE_SIZE);

      // 1. Draw standard cave lighting (if structureOverlayAlpha < 1)
      if (this.state.structureOverlayAlpha < 1.0) {
        lctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        lctx.fillStyle = "rgba(5, 2, 0, 0.85)"; // 85% dark outside
        lctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        lctx.globalCompositeOperation = "destination-out";
        lctx.save();
        lctx.translate(Math.round(this.canvasWidth / 2), Math.round(this.canvasHeight / 2));
        lctx.translate(-scaledCamX, -scaledCamY);
        lctx.scale(zoom, zoom);

        const drawLight = (x: number, y: number, radius: number) => {
          const grad = lctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
          grad.addColorStop(0, "rgba(255,255,255,1)");
          grad.addColorStop(0.4, "rgba(255,255,255,0.6)");
          grad.addColorStop(1, "rgba(255,255,255,0)");
          lctx.fillStyle = grad;
          lctx.beginPath();
          lctx.arc(x, y, radius, 0, Math.PI * 2);
          lctx.fill();
        };

        // Draw Player light
        drawLight(p.x + p.w / 2, p.y + p.h / 2, 175.5);

        // Draw Torches light
        const startColLight = Math.max(0, Math.floor((this.state.camera.x - this.canvasWidth / 2 / zoom - 300) / TILE_SIZE));
        const endColLight = Math.min(this.state.width, Math.ceil((this.state.camera.x + this.canvasWidth / 2 / zoom + 300) / TILE_SIZE));
        const startRowLight = Math.max(0, Math.floor((this.state.camera.y - this.canvasHeight / 2 / zoom - 300) / TILE_SIZE));
        const endRowLight = Math.min(this.state.height, Math.ceil((this.state.camera.y + this.canvasHeight / 2 / zoom + 300) / TILE_SIZE));

        for (let y = startRowLight; y < endRowLight; y++) {
          for (let x = startColLight; x < endColLight; x++) {
            if (this.state.map[y] && this.state.map[y][x] === 10) {
              drawLight(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 162.5 + Math.random() * 15);
            } else if (this.state.map[y] && this.state.map[y][x] === 12) {
              drawLight(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 130 + Math.random() * 25);
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
        lctx.fillStyle = "rgba(5, 2, 0, 0.85)"; // 85% dark outside
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

      // Outside of structure (or transitioning): inside of structure is faded dark and you can barely see
      if (this.state.structureOverlayAlpha < 1.0) {
        const startX = Math.max(0, Math.floor((this.state.camera.x - this.canvasWidth / 2 / zoom) / TILE_SIZE));
        const endX = Math.min(this.state.width, Math.ceil((this.state.camera.x + this.canvasWidth / 2 / zoom) / TILE_SIZE));
        const startY = Math.max(0, Math.floor((this.state.camera.y - this.canvasHeight / 2 / zoom) / TILE_SIZE));
        const endY = Math.min(this.state.height, Math.ceil((this.state.camera.y + this.canvasHeight / 2 / zoom) / TILE_SIZE));

        ctx.fillStyle = `rgba(5, 2, 0, ${0.85 * (1.0 - this.state.structureOverlayAlpha)})`;
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
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      ctx.fillStyle = COLORS.diamond;
      ctx.font = "bold 36px 'Courier New', Courier, monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        `FLOOR ${this.state.floor} CLEARED - SELECT UPGRADE`,
        this.canvasWidth / 2,
        80,
      );
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(
        `COINS: ${this.state.player.coins}`,
        this.canvasWidth / 2,
        120,
      );

      // Draw upgrades
      const cardWidth = 200;
      const cardHeight = 280;
      const gap = 40;
      const startX = this.canvasWidth / 2 - (cardWidth * 1.5 + gap);
      const startY = this.canvasHeight / 2 - cardHeight / 2 + 20;

      for (let i = 0; i < this.state.upgrades.length; i++) {
        const u = this.state.upgrades[i];
        const cx = startX + i * (cardWidth + gap);
        const cy = startY;

        const isHover =
          this.state.mouse.x >= cx &&
          this.state.mouse.x <= cx + cardWidth &&
          this.state.mouse.y >= cy &&
          this.state.mouse.y <= cy + cardHeight;

        // Card background
        let strokeColor = "#ffffff";
        let fillStyle = isHover ? "#2a2a35" : "#13131e";
        
        if (u.isSuper) {
          const timeCycle = Date.now() / 250;
          const hue = Math.floor(45 + Math.sin(timeCycle) * 15);
          strokeColor = `hsl(${hue}, 100%, 50%)`;
          fillStyle = isHover ? "#322510" : "#1a150b";
        } else {
          strokeColor = isHover ? "#fbbf24" : "#4b5563";
        }

        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = u.isSuper ? 3 : 2;
        ctx.fillRect(cx, cy, cardWidth, cardHeight);
        ctx.strokeRect(cx, cy, cardWidth, cardHeight);

        // Title
        ctx.textAlign = "center";
        ctx.font = "bold 18px 'Courier New', Courier, monospace";
        ctx.fillStyle = u.isSuper ? "#fbbf24" : "#fff";
        ctx.fillText(u.title, cx + cardWidth / 2, cy + 30);

        // Label
        ctx.font = "bold 12px 'Courier New', Courier, monospace";
        ctx.fillStyle = u.isSuper ? "#f59e0b" : "#9ca3af";
        ctx.fillText(u.isSuper ? "★ SUPER CARD ★" : "NORMAL UPGRADE", cx + cardWidth / 2, cy + 60);

        // Desc lines
        ctx.fillStyle = "#e5e7eb";
        ctx.font = "14px 'Courier New', Courier, monospace";
        const lines = u.desc.split("\n");
        for (let j = 0; j < lines.length; j++) {
          ctx.fillText(lines[j], cx + cardWidth / 2, cy + 100 + j * 20);
        }
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
  }

  drawHUD() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const p = this.state.player;

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(20, 20, 240, 105);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, 240, 105);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px 'Courier New', Courier, monospace";
    ctx.fillText(`FLOOR ${this.state.floor} / ${this.state.maxFloor}`, 30, 45);

    // Health bar
    ctx.fillStyle = "#f87171"; // red-400
    ctx.font = "bold 12px 'Courier New', Courier, monospace";
    ctx.fillText("HP", 30, 75);

    ctx.fillStyle = "#ef4444"; // red-500
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.fillRect(60, 63, 180, 15);
    ctx.strokeRect(60, 63, 180, 15);
    ctx.fillStyle = "#b91c1c"; // red-700
    ctx.fillRect(
      60,
      63,
      180 * (Math.max(0, p.health) / p.maxHealth),
      15,
    );

    // Weapon Name display
    ctx.fillStyle = "#fbbf24"; // gold/yellow
    ctx.font = "bold 12px 'Courier New', Courier, monospace";
    const weaponName = p.weaponEquipped
      ? (p.clawsActive ? "RIP & TEAR CLAWS" : (p.weapon ? p.weapon.toUpperCase().replace('_', ' ') : 'SWORD'))
      : "UNARMED";
    ctx.fillText(`WEAPON: ${weaponName}`, 30, 105);

    let nextHUDY = 135;

    // Super Ability status panel
    if (p.superAbility) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(20, nextHUDY, 240, 40);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(20, nextHUDY, 240, 40);

      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px 'Courier New', Courier, monospace";
      ctx.fillText(p.superAbility.toUpperCase(), 30, nextHUDY + 16);

      // Status
      if (p.superAbilityActive) {
        ctx.fillStyle = "#f59e0b"; // orange
        ctx.fillText(`ACTIVE: ${Math.ceil(p.superAbilityTimer / 60)}s`, 140, nextHUDY + 16);
        
        // Draw tiny active duration bar
        const maxTimer = p.superAbility === "malevolence" ? 900 : (p.superAbility === "impenetrable" ? 1200 : 600);
        ctx.fillStyle = "#d97706";
        ctx.fillRect(30, nextHUDY + 24, 220 * (p.superAbilityTimer / maxTimer), 4);
      } else if (p.superAbilityCooldown > 0) {
        ctx.fillStyle = "#ef4444"; // red
        ctx.fillText(`CD: ${Math.ceil(p.superAbilityCooldown / 60)}s`, 140, nextHUDY + 16);
        
        // Draw tiny cooldown bar
        const maxCD = p.superAbility === "malevolence" ? 6000 : (p.superAbility === "impenetrable" ? 6600 : 7500);
        ctx.fillStyle = "#7f1d1d";
        ctx.fillRect(30, nextHUDY + 24, 220 * (1 - p.superAbilityCooldown / maxCD), 4);
      } else {
        ctx.fillStyle = "#22c55e"; // green
        ctx.fillText("READY [Q]", 140, nextHUDY + 16);
      }
      nextHUDY += 50;
    }

    // Poison status panel
    if (p.poisonTimer > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(20, nextHUDY, 240, 35);
      ctx.strokeStyle = "#22c55e";
      ctx.strokeRect(20, nextHUDY, 240, 35);

      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 11px 'Courier New', Courier, monospace";
      ctx.fillText(`POISONED: ${Math.ceil(p.poisonTimer / 60)}s`, 30, nextHUDY + 16);
      
      // Poison progress bar
      ctx.fillStyle = "#15803d";
      ctx.fillRect(30, nextHUDY + 22, 220 * (p.poisonTimer / 300), 4);
      nextHUDY += 45;
    }

    // Diamond status
    if (p.hasDiamond) {
      ctx.fillStyle = COLORS.diamond;
      ctx.font = "bold 14px 'Courier New', Courier, monospace";
      ctx.textAlign = "left";
      ctx.fillText("[TRUE DIAMOND SECURED]", 30, nextHUDY + 15);
    }

    // Hotbar slots rendering (bottom-center)
    const hotbarX = this.canvasWidth / 2 - 25;
    const hotbarY = this.canvasHeight - 75;
    const hotbarW = 50;
    const hotbarH = 50;

    // Slot border glow/active style
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(hotbarX, hotbarY, hotbarW, hotbarH);

    ctx.strokeStyle = p.weaponEquipped ? "#fbbf24" : "#4b5563";
    ctx.lineWidth = p.weaponEquipped ? 2 : 1;
    ctx.strokeRect(hotbarX, hotbarY, hotbarW, hotbarH);

    // [1] Label
    ctx.fillStyle = "#9ca3af";
    ctx.font = "bold 9px 'Courier New', Courier, monospace";
    ctx.textAlign = "left";
    ctx.fillText("[1]", hotbarX + 4, hotbarY + 11);

    // Slot contents text/icon abbreviation
    ctx.textAlign = "center";
    ctx.font = "bold 12px 'Courier New', Courier, monospace";
    ctx.fillStyle = p.weaponEquipped ? "#ffffff" : "#4b5563";
    
    let activeWepName = "SWD";
    if (p.weapon === "colossal_sword") activeWepName = "CLSL";
    else if (p.weapon === "dual_daggers") activeWepName = "DGR";
    else if (p.weapon === "bow") activeWepName = "BOW";

    ctx.fillText(activeWepName, hotbarX + hotbarW / 2, hotbarY + 28);
    
    // Equipped/Unequipped state label
    ctx.font = "bold 8px 'Courier New', Courier, monospace";
    ctx.fillStyle = p.weaponEquipped ? "#fbbf24" : "#6b7280";
    ctx.fillText(p.weaponEquipped ? "EQ" : "UNEQ", hotbarX + hotbarW / 2, hotbarY + 42);

    // Hotbar label above
    ctx.textAlign = "center";
    ctx.fillStyle = "#9ca3af";
    ctx.font = "bold 9px 'Courier New', Courier, monospace";
    ctx.fillText("HOTBAR", hotbarX + hotbarW / 2, hotbarY - 6);
  }
}
