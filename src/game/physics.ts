import { Rect, Vector2 } from './types';
import { TILE_SIZE } from './constants';

export function rectIntersect(r1: Rect, r2: Rect): boolean {
  return !(
    r2.x >= r1.x + r1.w || 
    r2.x + r2.w <= r1.x || 
    r2.y >= r1.y + r1.h || 
    r2.y + r2.h <= r1.y
  );
}

export function AABBMapCollision(
  entity: Rect,
  vx: number,
  vy: number,
  map: number[][],
  width: number,
  height: number,
  isDropping: boolean = false
) {
  let result = {
    x: entity.x,
    y: entity.y,
    vx: vx,
    vy: vy,
    hitX: false,
    hitY: false,
    grounded: false,
    hitXLeft: false,
    hitXRight: false
  };

  // Check X movement
  let testX = entity.x + vx;
  let collisionX = checkMapCollision(testX, entity.y, entity.w, entity.h, map, 0, false, entity.y + entity.h);
  if (collisionX) {
    result.vx = 0;
    result.hitX = true;
    if (vx > 0) {
      result.hitXRight = true;
      result.x = Math.floor((testX + entity.w) / TILE_SIZE) * TILE_SIZE - entity.w - 0.01;
    } else if (vx < 0) {
      result.hitXLeft = true;
      result.x = Math.floor(testX / TILE_SIZE) * TILE_SIZE + TILE_SIZE + 0.01;
    }
  } else {
    result.x = testX;
  }

  // Check Y movement
  let testY = entity.y + vy;
  let collisionY = checkMapCollision(result.x, testY, entity.w, entity.h, map, vy, isDropping, entity.y + entity.h);
  if (collisionY) {
    result.vy = 0;
    result.hitY = true;
    if (vy > 0) {
       result.grounded = true;
       result.y = Math.floor((testY + entity.h) / TILE_SIZE) * TILE_SIZE - entity.h - 0.01;
    } else if (vy < 0) {
       result.y = Math.floor(testY / TILE_SIZE) * TILE_SIZE + TILE_SIZE + 0.01;
    }
  } else {
    result.y = testY;
  }

  return result;
}

function checkMapCollision(x: number, y: number, w: number, h: number, map: number[][], vy: number, isDropping: boolean, oldBottom: number) {
  const leftTile = Math.floor(x / TILE_SIZE);
  const rightTile = Math.floor((x + w) / TILE_SIZE);
  const topTile = Math.floor(y / TILE_SIZE);
  const bottomTile = Math.floor((y + h) / TILE_SIZE);

  for (let ty = topTile; ty <= bottomTile; ty++) {
    for (let tx = leftTile; tx <= rightTile; tx++) {
      const tile = map[ty] && map[ty][tx];
      if (tile === 1 || tile === 7 || tile === 8 || tile === 11 || tile === 15 || tile === 16 || tile === 17 || tile === 18) { // 1=dirt, 7=grass, 8=stone, 11=structure, 15=mossgrass, 16=snow, 17=ice, 18=thin ice
        return true;
      }
      if (tile === 5) { // 5 is platform
        if (vy > 0 && !isDropping) { // Only collide if falling and not dropping
           const platformTop = ty * TILE_SIZE;
           if (oldBottom <= platformTop + 0.1) {
              return true;
           }
        }
      }
    }
  }
  return false;
}

export function checkTilesAt(entity: Rect, map: number[][], acceptedTiles: number[]): boolean {
  const leftTile = Math.floor(entity.x / TILE_SIZE);
  const rightTile = Math.floor((entity.x + entity.w) / TILE_SIZE);
  const topTile = Math.floor(entity.y / TILE_SIZE);
  const bottomTile = Math.floor((entity.y + entity.h) / TILE_SIZE);

  for (let ty = topTile; ty <= bottomTile; ty++) {
    for (let tx = leftTile; tx <= rightTile; tx++) {
      if (map[ty] && acceptedTiles.includes(map[ty][tx])) {
        return true;
      }
    }
  }
  return false;
}
