# Volcanic Update Design

Date: 2026-08-06
Status: Approved

## Goal Statement

Make the volcanic biome feel dense and dangerous by adding lava swimming physics, potion nerfs, volcanic-only enemy species with unique AI, and removing lava self-glow.

## Changes

### A. Lava physics & burning (Engine.ts)

- Detect player in lava: scan player's tiles for tile `21` (like the existing `inWater` detection at ~Engine.ts:916-925). Compute `inLava`.
- `inLava` effects:
  - Reduce horizontal `accel` further than water (dense feel).
  - Reduce gravity: use a lower gravity constant while submerged and cap fall speed lower. Other liquid jump stays.
  - Apply burn: set `p.burnTimer` (persisting). Burning ticks damage (~3 HP per 0.5s), mirroring the poison tick at Engine.ts:1294-1304. Visual tint + HUD readout for burn.
- Remove lava self-glow block (Engine.ts:5101-5116). Lava is drawn normally; in darkness it emits no light (no self-glow loop).
- Add `p.burnTimer` to the player damage-tick section and HUD.

### B. Potion nerf 50% (Engine.ts ~1090-1114, ~938-945)

- Health potion heal: `40 -> 20`.
- Speed potion: `1.20 -> 1.10`, duration `900 -> 450` frames (15s -> 7.5s). GUI text uses `Math.ceil(timer/60)` already so it stays correct.

### C. Vine gating in volcanic (mapGen.ts)

- The moss-circle vine block (mapGen.ts ~741-758) already gates on ice. Add gate so tile-13 vines do NOT spawn when `biome === 'volcanic'`.
- Volcanic has no moss circles, so vines effectively already absent; add explicit guard for correctness/density.

## D. New volcanic enemies

Spawn gating: `volcanic` is currently unhandled and falls into the default `else` (bat/slime) at Engine.ts~371. Add `else if (this.state.biome === "volcanic")`.

### D1. Lava Slime (replaces slime)
- Same hop AI as slime. Inherits slime branch (add `lava_slime` to the slime AI ternary at Engine.ts:2426-2444).
- Less HP: `30 -> 20`.
- On contact (Engine.ts~2675-2690): applies `p.burnTimer = 60` (1s burn) in addition to its damage.

### D2. Lava Monster (fireball shooter, walks on lava)
- Spawn: like flytrap (tile-scan), on tile `21` (lava) in volcanic. Place on a lava surface tile (y) with air above optional.
- AI: `e.vy` stays at lava surface; horizontal patrol across lava until edge reached, then reverse (repeats).
- Vision: 6 blocks (6*TILE_SIZE). If player within range, shoot a `magma` projectile (reuse `magma` projectile type / boss pattern Engine.ts:2609-2624) that travels 8 blocks then despawns / on wall hit despawns. Add `19`/`20` to projectile solid list (Engine.ts ~2080) so fireballs don't fly through basalt.
- Punch: if player within 1.5 blocks, windup 0.7s (stateTimer for windup), then punch with cooldown 0.3s, dealing contact damage.

### D3. Lava Spider (ceiling stalker in structures)
- Spawn: 70% chance per volcanic structure room interior (scan a structure room; e.g. over `bgMap===9` interior or a tile-11 ceiling). Hangs from ceiling (rest on the solid tile above).
- AI: if player within 4 blocks left / 4 blocks right (x within 4*TILE each side; y any within the structure), slowly crawls toward player (adjust x velocity toward center).
- When directly under player: drops from ceiling, "grabs" onto the player, beeps orange 3x fast (particles), then blows up on the player: player takes damage, `p.burnTimer`, `slowness`, red camera effect + sudden screen shake.

## E. New debuffs & effects

- **Slowness**: new `p.slownessTimer`. While active, speed & jump reduced ~35% (fold into accel/jump multipliers in the movement block). HUD readout similar to poison.
- **Red vignette overlay**: new short-lived red edge flash (`p.redFlashTimer` or `redVignetteTimer`). Draw in the screen-tint region (after Engine.ts:5118) as a red radial/vignette overlay ~0.5-0.8s.
- All new timers added to Player type in `types.ts`.

## Types to add

`types.ts:118` EnemyType: add `'lava_slime' | 'lava_monster' | 'lava_spider'`.

`types.ts` Player: add `burnTimer: number; slownessTimer: number; redFlashTimer: number;` (burnTimer already exists partially).

## Render

Add render branches for the 3 enemies in the enemy render cascade (Engine.ts ~4057-4077 region), drawn in the existing blocky/solid `fillRect` art style with hit-flash (`invulnerableTimer>0` -> white).

## HUD

Add burn + slowness readouts next to poison readout (Engine.ts ~5647-5650).

## Verification

- `cmd /c "npx tsc --noEmit"` passes.
- Manual playtest: volcanic floor has lava slime + lava monster + lava spider, no vines, no lava glow, potions weaker, lava slow+burn noticeable.
- Push to GitHub, deploy `cmd /c "vercel --prod"`.