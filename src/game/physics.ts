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

function isTileSolid(tx: number, ty: number, map: number[][]): boolean {
  const mapHeight = map.length;
  const mapWidth = map[0] ? map[0].length : 0;

  // ponytail: out-of-bounds (except below bottom) is solid
  if (tx < 0 || tx >= mapWidth || ty < 0) {
    return true;
  }
  if (ty >= mapHeight) {
    return false;
  }

  const tile = map[ty][tx];
  return tile === 1 || tile === 7 || tile === 8 || tile === 11 || tile === 15 || tile === 16 || tile === 17 || tile === 18;
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
      // ponytail: scan and snap to leftmost solid tile boundary
      const leftTile = Math.floor(entity.x / TILE_SIZE);
      const rightTile = Math.floor((testX + entity.w) / TILE_SIZE);
      const topTile = Math.floor(entity.y / TILE_SIZE);
      const bottomTile = Math.floor((entity.y + entity.h) / TILE_SIZE);
      
      let snapX = testX;
      let found = false;
      for (let tx = leftTile; tx <= rightTile; tx++) {
        for (let ty = topTile; ty <= bottomTile; ty++) {
          if (isTileSolid(tx, ty, map)) {
            const limit = tx * TILE_SIZE - entity.w - 0.01;
            if (!found || limit < snapX) {
              snapX = limit;
              found = true;
            }
          }
        }
      }
      result.x = found ? snapX : Math.floor((testX + entity.w) / TILE_SIZE) * TILE_SIZE - entity.w - 0.01;
    } else if (vx < 0) {
      result.hitXLeft = true;
      // ponytail: scan and snap to rightmost solid tile boundary
      const leftTile = Math.floor(testX / TILE_SIZE);
      const rightTile = Math.floor((entity.x + entity.w) / TILE_SIZE);
      const topTile = Math.floor(entity.y / TILE_SIZE);
      const bottomTile = Math.floor((entity.y + entity.h) / TILE_SIZE);
      
      let snapX = testX;
      let found = false;
      for (let tx = leftTile; tx <= rightTile; tx++) {
        for (let ty = topTile; ty <= bottomTile; ty++) {
          if (isTileSolid(tx, ty, map)) {
            const limit = (tx + 1) * TILE_SIZE + 0.01;
            if (!found || limit > snapX) {
              snapX = limit;
              found = true;
            }
          }
        }
      }
      result.x = found ? snapX : Math.floor(testX / TILE_SIZE) * TILE_SIZE + TILE_SIZE + 0.01;
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
       // ponytail: scan and snap to topmost solid/platform boundary
       const leftTile = Math.floor(result.x / TILE_SIZE);
       const rightTile = Math.floor((result.x + entity.w) / TILE_SIZE);
       const topTile = Math.floor(entity.y / TILE_SIZE);
       const bottomTile = Math.floor((testY + entity.h) / TILE_SIZE);
       
       let snapY = testY;
       let found = false;
       for (let ty = topTile; ty <= bottomTile; ty++) {
         for (let tx = leftTile; tx <= rightTile; tx++) {
           let isPlatformColliding = false;
           const mapHeight = map.length;
           const mapWidth = map[0] ? map[0].length : 0;
           const isTilePlatform = tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight && map[ty][tx] === 5;
           
           if (isTilePlatform && !isDropping) {
             const platformTop = ty * TILE_SIZE;
             if (entity.y + entity.h <= platformTop + 0.1) {
               isPlatformColliding = true;
             }
           }
           
           if (isTileSolid(tx, ty, map) || isPlatformColliding) {
             const limit = ty * TILE_SIZE - entity.h - 0.01;
             if (!found || limit < snapY) {
               snapY = limit;
               found = true;
             }
           }
         }
       }
       result.y = found ? snapY : Math.floor((testY + entity.h) / TILE_SIZE) * TILE_SIZE - entity.h - 0.01;
    } else if (vy < 0) {
       // ponytail: scan and snap to bottommost solid boundary
       const leftTile = Math.floor(result.x / TILE_SIZE);
       const rightTile = Math.floor((result.x + entity.w) / TILE_SIZE);
       const topTile = Math.floor(testY / TILE_SIZE);
       const bottomTile = Math.floor((entity.y + entity.h) / TILE_SIZE);
       
       let snapY = testY;
       let found = false;
       for (let ty = topTile; ty <= bottomTile; ty++) {
         for (let tx = leftTile; tx <= rightTile; tx++) {
           if (isTileSolid(tx, ty, map)) {
             const limit = (ty + 1) * TILE_SIZE + 0.01;
             if (!found || limit > snapY) {
               snapY = limit;
               found = true;
             }
           }
         }
       }
       result.y = found ? snapY : Math.floor(testY / TILE_SIZE) * TILE_SIZE + TILE_SIZE + 0.01;
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
      if (isTileSolid(tx, ty, map)) {
        return true;
      }
      const mapHeight = map.length;
      const mapWidth = map[0] ? map[0].length : 0;
      if (tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight) {
        const tile = map[ty][tx];
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
