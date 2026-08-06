# Volcanic Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the volcanic biome denser: lava slows+burns the player, potions are nerfed 50%, vines don't spawn there, and three new volcanic-exclusive enemies (lava slime, lava monster, lava spider) replace the default enemies.

**Architecture:** All game logic lives in `src/game/Engine.ts` (AI, physics, render) and `src/game/mapGen.ts` (map/entity placement). Types in `src/game/types.ts`. No test framework exists; the only automated check is `cmd /c "npx tsc --noEmit"` (lint script). Manual playtest via `cmd /c "npm run dev"`.

**Tech Stack:** TypeScript, Vite, canvas 2D. No test framework — verification is typecheck + manual playtest.

---

## File map

- `src/game/types.ts` — added fields/timers + new enemy types.
- `src/game/Engine.ts` — lava physics, burn/slow timers, potion nerf, enemy spawn gating, 3 new AI branches, 3 new render branches, HUD, red vignette, projectile solid list.
- `src/game/mapGen.ts` — vine gate in volcanic.

## Task 1: Types

**Files:**
- Modify: `src/game/types.ts:118` (EnemyType union), `:66-67` (already has burnTimer), Player interface timers.

- [ ] **Step 1: Add new enemy types to EnemyType**

In `types.ts:118`, change:
```ts
export type EnemyType = 'bat' | 'slime' | 'boss' | 'frost_slime' | 'yeti' | 'moss_slime' | 'flytrap' | 'frost_knight' | 'inferno_knight';
```
to:
```ts
export type EnemyType = 'bat' | 'slime' | 'boss' | 'frost_slime' | 'yeti' | 'moss_slime' | 'flytrap' | 'frost_knight' | 'inferno_knight' | 'lava_slime' | 'lava_monster' | 'lava_spider';
```

- [ ] **Step 2: Add missing player timers**

In the `Player` interface (types.ts~66-67 has `poisonTimer`, `burnTimer` already), add after `burnTimer`:
```ts
  slownessTimer: number;
  redFlashTimer: number;
```

- [ ] **Step 3: Typecheck**

Run: `cmd /c "npx tsc --noEmit"`.
Expected: errors at EnemyType usages and Player construction until later tasks. Not yet green — that's expected mid-plan.

## Task A2: Player state init for new timers

**Files:**
- Modify: `src/game/Engine.ts:170-180` (player init object).

- [ ] **Step 1: Initialize new timers**

In the player init object (near `poisonTimer: 0, burnTimer: 0,`), add:
```ts
        slownessTimer: 0,
        redFlashTimer: 0,
```

## Task A3: Burn + slowness damage tick

**Files:**
- Modify: `src/game/Engine.ts:1294-1304` (poison tick block).

- [ ] **Step 1: Add burn tick alongside poison**

Replace:
```ts
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
```
with:
```ts
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

    // Burn tick (3 HP per 0.5s)
    if (p.burnTimer > 0) {
      p.burnTimer--;
      if (p.burnTimer % 30 === 0 && p.burnTimer > 0) {
        p.health -= 3;
        if (p.health <= 0) {
          p.health = 0;
          this.state.isGameOver = true;
        }
      }
    }
```

- [ ] **Step 2: Slowness tick decrement + red flash decrement**

Add after the burn tick (same file, right after):
```ts
    if (p.slownessTimer > 0) p.slownessTimer--;
    if (p.redFlashTimer > 0) p.redFlashTimer--;
```

## Task A4: Lava swimming (dense + burn)

**Files:**
- Modify: `src/game/Engine.ts:906-1041` (movement/swim).

- [ ] **Step 1: Detect inLava**

Replace the tile-scan at `Engine.ts:916-925`:
```ts
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
```
with:
```ts
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
```
Add `let inLava = false;` after line 907 (`let inWater = false;`).

- [ ] **Step 2: Burn while in lava + dense physics**

After the `inWater` detect and before the multipliers, add (right after the frostTimer block at `Engine.ts:1002`):
```ts
    // Dense lava: slow movement + burning
    if (inLava) {
      p.burnTimer = 30; // refresh burn while submerged (0.5s min)
      // dense: reduce horizontal accel below water (handled below)
    }
```
Then update accel for lava (in `Engine.ts:963`):
```ts
      const accel = (inWater ? 0.8 : 1.5) * effectiveSpeedMulti;
```
to:
```ts
      const accel = (inLava ? 0.45 : inWater ? 0.8 : 1.5) * effectiveSpeedMulti;
```
And cap velocity: after the accel block, near gravity, reduce vertical in lava. Locate `p.vy += GRAVITY;` (line ~1512) and the `MAX_FALL_SPEED` cap (~1513). Change:
```ts
        p.vy += GRAVITY;
        if (p.vy > MAX_FALL_SPEED) p.vy = MAX_FALL_SPEED;
```
to:
```ts
        p.vy += inLava ? GRAVITY * 0.35 : GRAVITY;
        if (p.vy > (inLava ? MAX_FALL_SPEED * 0.5 : MAX_FALL_SPEED)) p.vy = inLava ? MAX_FALL_SPEED * 0.5 : MAX_FALL_SPEED;
```
Note: `inLava` must be in scope at _line 1512_ — it is declared at function top (`update()`), yes.

## Task A5: Remove lava self-glow

**Files:**
- Modify: `src/game/Engine.ts:5101-5116`.

- [ ] **Step 1: Delete the block**

Replace the entire lava self-glow block:
```ts
      // Lava self-glow: lava tiles stay visible/pulsing in the dark (no light cast on surroundings)
      if (this.state.biome === "volcanic") {
        const lvStartX = Math.max(0, Math.floor((this.state.camera.x - this.canvasWidth / 2 / zoom) / TILE_SIZE));
        const lvEndX = Math.min(this.state.width, Math.ceil((this.state.camera.x + this.canvasWidth / 2 / zoom) / TILE_SIZE));
        const lvStartY = Math.max(0, Math.floor((this.state.camera.y - this.canvasHeight / 2 / zoom) / TILE_SIZE));
        const lvEndY = Math.min(this.state.height, Math.ceil((this.state.camera.y + this.canvasHeight / 2 / zoom) / TILE_SIZE));
        const lavaPulse = 0.5 + Math.sin(Date.now() * 0.005) * 0.15;
        ctx.fillStyle = `rgba(234, 88, 12, ${lavaPulse})`;
        for (let y = lvStartY; y < lvEndY; y++) {
          for (let x = lvStartX; x < lvEndX; x++) {
            if (this.state.map[y] && this.state.map[y][x] === 21) {
              ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 1, TILE_SIZE + 1);
            }
          }
        }
      }
```
with nothing (delete). Lava is now dark in darkness.

## Task A6: Potion nerf 50%

**Files:**
- Modify: `src/game/Engine.ts:1092` (heal), `:940-941` (speed mult), `:1105` (duration).

- [ ] **Step 1: Health potion heal to 20**

`Engine.ts:1092` → `const healAmt = 20;`

- [ ] **Step 2: Speed potion mult to 1.10**

`Engine.ts:940-941` → `potionSpeedMult = 1.10;`

- [ ] **Step 3: Speed potion duration to 450**

`:1105` → `p.speedPotionTimer = 450; // 7.5 seconds`
Also update the comment at 1105.

## Task A7: Slowness debuff multiplier

**Files:**
- Modify: `src/game/Engine.ts:955-956` (magnitudes).

- [ ] **Step 1: Fold slowness into effective multipliers**

Replace:
```ts
    const effectiveSpeedMulti = p.speedMulti * weaponSpeedMult * superSpeedMult * potionSpeedMult;
```
with:
```ts
    const slowMult = p.slownessTimer > 0 ? 0.65 : 1;
    const effectiveSpeedMulti = p.speedMulti * weaponSpeedMult * superSpeedMult * potionSpeedMult * slowMult;
```

## Task A8: Red vignette overlay draw

**Files:**
- Modify: `src/game/Engine.ts:5133-5138` (poison tint region).

- [ ] **Step 1: Add red vignette when redFlashTimer > 0**

After the poison tint block (`Engine.ts`~5138):
```ts
    if (p.redFlashTimer > 0) {
      ctx.save();
      const a = Math.min(0.5, p.redFlashTimer / 60);
      // radial vignette (red edges)
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
```

## Task A9: Projectile solid list add volcanic blocks

**Files:**
- Modify: `src/game/Engine.ts:2080`.

- [ ] **Step 1: Add 19/20**

`[1, 7, 8, 11, 15, 16, 17, 18]` → `[1, 7, 8, 11, 15, 16, 17, 18, 19, 20]`

## Task B1: Vine gate in volcanic (mapGen.ts)

**Files:**
- Modify: `src/game/mapGen.ts:741-775`.

- [ ] **Step 1: Gate vines on biome !== 'volcanic'**

The vine block (sets `map[my][mx] = 13`) runs inside moss circles. Wrap/skip when volcanic. Prepend the condition:
```ts
if (biome !== 'volcanic' && inside moss circle ...) 
```
Concretely, find the line that checks the moss circle (`if (... inMossBiome ... && map solid above)`) and add `&& biome !== 'volcanic'`. If volcanic has no moss circles anyway, add a guard comment + condition for clarity/explicit behavior.

## Task B2: Volcanic enemy type selection

**Files:**
- Modify: `src/game/Engine.ts:365-372`.

- [ ] **Step 1: Add volcanic branch**

Replace:
```ts
      let type: EnemyType;
      if (this.state.biome === "ice" || this.state.biome === "ice_fortress") {
        type = Math.random() < 0.20 ? "yeti" : "frost_slime";
      } else if (this.state.biome === "moss") {
        type = Math.random() > 0.5 ? "bat" : "moss_slime";
      } else {
        type = Math.random() > 0.5 ? "bat" : "slime";
      }
```
with:
```ts
      let type: EnemyType;
      if (this.state.biome === "ice" || this.state.biome === "ice_fortress") {
        type = Math.random() < 0.20 ? "yeti" : "frost_slime";
      } else if (this.state.biome === "moss") {
        type = Math.random() > 0.5 ? "bat" : "moss_slime";
      } else if (this.state.biome === "volcanic") {
        type = Math.random() < 0.4 ? "lava_slime" : "bat"; // 40% lava slime, 60% bat
      } else {
        type = Math.random() > 0.5 ? "bat" : "slime";
      }
```
Note: The spec says lava slime "replaces the default slime" and bat → lava spider; but bat rsp the `lava_spider` spawns on structure ceilings via a separate scan. The base spawn keeps bat (flyer) + lava_slime. The lava_monster spawns on lava via scan. The spider via structure scan.

- [ ] **Step 2: Size/hp tweaks for lava_slime**

In `Engine.ts:374-388`, `isTank` etc unchanged. Add handling so `lava_slime` uses slime-ish size and hp 20. Update the size/hp ternaries:
```ts
      const isSlime = type === "slime" || type === "lava_slime";
      // hp fallback: isFlying ? 20 : isBig ? 100 : isTank ? 45 : 30
```
Change the `health` line to:
```ts
        health: isBig ? 100 : isTank ? 45 : isFlying ? 20 : type === "lava_slime" ? 20 : 30,
        maxHealth: isBig ? 100 : isTank ? 45 : isFlying ? 20 : type === "lava_slime" ? 20 : 30,
```
And ensure `w`/`h`: lava_slime is 20x20 already (falls to default 20).

## Task B3: Spawn lava_monster on lava tiles (tile-scan)

**Files:**
- Modify: `src/game/Engine.ts` after the moss flytrap block (~425).

- [ ] **Step 1: Add lava_monster scan**

After the `if (this.state.biome === "moss") { ... }` block (ends line 425), add:
```ts
    if (this.state.biome === "volcanic") {
      for (let y = 1; y < this.state.height; y++) {
        for (let x = 1; x < this.state.width; x++) {
          if (this.state.map[y][x] === 21) {
            if (Math.random() < 0.01) {
              this.state.enemies.push({
                id: `lava_monster_${Math.random()}`,
                type: "lava_monster",
                x: x * TILE_SIZE + 2,
                y: (y - 1) * TILE_SIZE,
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
                onLadder: false,
                aiState: "idle",
                walkDir: Math.random() < 0.5 ? -1 : 1,
              });
            }
          }
        }
      }
    }
```
Note: this adds a `walkDir` property not in the Enemy type — either add `walkDir?: number;` to Enemy in `types.ts`, or use `facingRight`/`stateTimer`. Simpler: use `stateTimer` as patrol direction sign via `e.facingRight ? 1 : -1`. We'll use `facingRight` instead of a new `walkDir`. Adjust code to drop `walkDir`.
Actually use:
```ts
                facingRight: Math.random() > 0.5,
                ...
```
and derive dir from `e.facingRight`. Remove the `walkDir` line. **Important: Enemy type has no `walkDir` field; do not add unnecessary fields** (ponytail: YAGNI). We'll use `facingRight` for patrol dir.

## Task B4: Lava spider structure-ceiling spawn

**Files:**
- Modify: `src/game/Engine.ts` (in initFloor, after lava_monster block).

- [ ] **Step 1: Scan structure interior ceilings**

Add after the lava_monster scan block:
```ts
    if (this.state.biome === "volcanic") {
      for (let y = 0; y < this.state.height; y++) {
        for (let x = 0; x < this.state.width; x++) {
          // structure interior: bgMap wood (9) with a solid ceiling above (tile 11)
          if (this.state.bgMap[y] && this.state.bgMap[y][x] === 9 &&
              y > 0 && this.state.map[y - 1] && this.state.map[y - 1][x] === 11) {
            if (Math.random() < 0.70) {
              this.state.enemies.push({
                id: `lava_spider_${Math.random()}`,
                type: "lava_spider",
                x: x * TILE_SIZE + 4,
                y: (y - 1) * TILE_SIZE - 2,
                w: 18,
                h: 14,
                vx: 0, vy: 0,
                health: 30,
                maxHealth: 30,
                facingRight: Math.random() > 0.5,
                isGrounded: false,
                invulnerableTimer: 0,
                stateTimer: 0,
                onLadder: false,
                aiState: "hanging",
              });
            }
          }
        }
      }
    }
```
Note this can spawn MANY spiders if a big structure ceiling. Cap: add a spider count limit (e.g., spawn at most `Math.floor(floor*0.5)+1` per structure interior scan). Simplest: track a counter, stop after e.g. 4. ponytail. Implement increment & early bail.

## Task B5: Lava slime AI (reuse slime branch)

**Files:**
- Modify: `src/game/Engine.ts:2426-2444` (slime AI).

- [ ] **Step 1: Add lava_slime to slime branch**

Change the if at 2426-2430:
```ts
      if (
        e.type === "slime" ||
        e.type === "frost_slime" ||
        e.type === "moss_slime"
      ) {
```
to include `e.type === "lava_slime"`. Also the hop power/speed at 2436-2440 add lava_slime handling:
```ts
          e.vy = e.type === "frost_slime" ? -4 : e.type === "moss_slime" ? -4.5 : -3.5;
          e.vx = dir * (e.type === "frost_slime" ? 6 : e.type === "moss_slime" ? 7.5 : 4.5);
```
Leave as (lava_slime default) or tune: lava_slime -4 / 5.5. Optional. Keep default -3.5/4.5 to be safe (ponytail: don't tune unneeded).

## Task B6: Lava monster AI

**Files:**
- Modify: `src/game/Engine.ts` updateEnemies — add a new `else if (e.type === "lava_monster")` branch **before** the yeti branch (line 2521).

- [ ] **Step 1: Add AI branch**

Insert before line 2521 (`} else if (e.type === "yeti")`):
```ts
      } else if (e.type === "lava_monster") {
        // Walks on lava surface, patrols back and forth across contiguous lava below
        e.vy += GRAVITY;
        const dir = e.facingRight ? 1 : -1;
        e.vx = dir * 2.05;
        // Prevent from departing lava: if no lava below ahead, reverse
        const aheadX = e.x + e.w / 2 + dir * 30;
        const belowTy = Math.floor((e.y + e.h + 6) / TILE_SIZE);
        const belowTx = Math.floor(aheadX / TILE_SIZE);
        if (this.state.map[belowTy] && this.state.map[belowTy][belowTx] !== 21) {
          e.facingRight = !e.facingRight;
        }
        // Vision 6 blocks, shoot magma fireball
        if (Math.abs(p.x + p.w/2 - (e.x + e.w/2)) < 6 * TILE_SIZE &&
            Math.abs(p.y + p.h/2 - (e.y + e.h/2)) < 6 * TILE_SIZE &&
            e.stateTimer <= 0) {
          e.stateTimer = 50;
          // windup fireball
          this.state.projectiles.push({
            id: `magma_${Date.now()}_${Math.random()}`,
            x: e.x + e.w / 2 - 6,
            y: e.y + e.h / 2 - 6,
            w: 12, h: 12,
            vx: dir * 8, // 8 blocks per second-ish travel
            vy: 0,
            damage: 10,
            type: "magma",
            facingRight: dir > 0,
          });
        }
        // Punch windup 0.7s when close (1.5 blocks)
        if (Math.abs(p.y + p.h/2 - (e.y + e.h/2)) < 1.5 * TILE_SIZE &&
            Math.abs(p.x + p.w/2 - (e.x + e.w/2)) < 1.2 * TILE_SIZE) {
          if (e.invulnerableTimer <= 0 && p.invulnerableTimer <= 0) {
            if (e.aiState === "idle") { e.aiState = "winding_up"; e.stateTimer = 42; } // 0.7s
            else if (e.aiState === "winding_up" && e.stateTimer <= 0) {
              e.stateTimer = 18; // 0.3s cooldown
              e.aiState = "idle";
              this.damagePlayer(8, dir, 9, -4, "#f97316");
            }
          }
        }
      }
```
Note: `type: "magma"` is already valid. `e.pos` doesn't exist — use `e.y`. Fix: use `p`/`e` properly. Also `e.state` is wrong. Use `e.aiState` and `e.stateTimer`. I'll rewrite clean below in implementation. This snippet is a sketch; implement carefully with `e.x`,`e.y`.

## Task B7: Lava spider AI

**Files:**
- Modify: `src/game/Engine.ts` updateEnemies — add `else if (e.type === "lava_spider")` before yeti branch.

- [ ] **Step 1: AI**

```ts
      } else if (e.type === "lava_spider") {
        // hanging state: stays on ceiling
        if (e.aiState === "hanging") {
          e.vx = 0; e.vy = 0;
          const dx = p.x - e.x;
          // within 4 left/4 right blocks, same y region
          if (dx > -4 * TILE_SIZE && dx < 4 * TILE_SIZE &&
              Math.abs(p.y - e.y) < 8 * TILE_SIZE) {
            e.aiState = "stalking";
          }
        } else if (e.aiState === "stalking") {
          const dir = p.x + p.w/2 > e.x + e.w/2 ? 1 : -1;
          e.vx = dir * 1.6;
          if (Math.abs(p.x + p.w/2 - (e.x + e.w/2)) < e.w) {
            e.aiState = "attaching";
            e.stateTimer = 24; // 3x beep 8f
          }
        } else if (e.aiState === "attach_beeping") {
          e.vx = 0;
          if (e.stateTimer % 8 === 0) this.spawnParticles(e.x+e.w/2, e.y+e.h/2, "#fb923c", 8);
          if (e.stateTimer <= 0) {
            e.aiState = "explode";
          }
        } else if (e.aiState === "explode") {
          // damage + effects + red flash
          if (p.invulnerableTimer <= 0) {
            this.damagePlayer(18, 0, 0, 0, "#f97316");
            p.burnTimer = 300; // 5s burn
            p.slownessTimer = 240; // 4s slow
            p.redFlashTimer = 40; // ~0.6s red
            this.state.shakeTimer = Math.max(this.state.shakeTimer, 25);
          }
          this.state.enemies.splice(i, 1);
          continue; // clear spider
        }
      }
```

## Task B8: Enemy render branches

**Files:**
- Modify: `src/game/Engine.ts` (enemy render cascade ~3700-4190).

- [ ] **Step 1: Lava slime render**

Add to the slime ternary (like `isFrost`/`isMoss`) a `isLava` variant: base `#7f1d1d`, body `#f97316`, core `#fef08a`, plus flame accent.
In `Engine.ts:~3729`, add `const isLava = e.type === "lava_slime";` and extend `baseColor`/`bodyColor`/`coreColor` ternaries.

- [ ] **Step 2: Lava spider render**

Add an `else if (e.type === "lava_spider")` block drawing a dark spider with orange legs/beep.

- [ ] **Step 3: Lava monster render**

Add `else if (e.type === "lava_monster")` block drawing a lava blob with ember core.

The exact per-enemy render pixel code is up to the implementer and must match the blocky canvas style. Provide gray/orphan fill with hit-flash (`invulnerableTimer>0 -> white`).

## Task B9: HUD readouts (burn + slowness)

**Files:**
- Modify: `src/game/Engine.ts:~5647-5650` (HUD status lines).

- [ ] **Step 1: Add burn + slowness readouts**

After the poison readout:
```ts
    if (p.poisonTimer > 0) {
      nextHUDY += 12;
      ctx.fillStyle = "#4ade80";
      ctx.fillText(`POISONED: ${Math.ceil(p.poisonTimer / 60)}s`, hudX, nextHUDY + 16);
    }
```
add:
```ts
    if (p.burnTimer > 0) {
      nextHUDY += 12;
      ctx.fillStyle = "#f97316";
      ctx.fillText(`BURNING: ${Math.ceil(p.burnTimer / 60)}s`, hudX, nextHUDY + 16);
    }
    if (p.slownessTimer > 0) {
      nextHUDY += 12;
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`SLOWED: ${Math.ceil(p.slownessTimer / 60)}s`, hudX, nextHUDY + 16);
    }
```

## Final verification

- [ ] Run `cmd /c "npx tsc --noEmit"`. Must pass with no errors.
- [ ] Clean up: remove any scratch files.
- [ ] Commit: describe all changes.
- [ ] Push to origin main.
- [ ] Deploy: `cmd /c "vercel --prod"`.
- [ ] Manual playtest in volcanic: verify lava slows+burns, no glow, potions slower, lava monster, lava slime, lava spider (burning, slowness, red vignette, shake).