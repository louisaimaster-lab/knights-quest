export function generateCave(floor: number, maxFloor: number) {
  // Floor 25: Fixed Custom Ice Fortress Biome
  if (floor === maxFloor) {
    const width = 44;
    const height = 50;
    const biome: 'ice_fortress' = 'ice_fortress';
    let map = Array(height).fill(0).map(() => Array(width).fill(16)); // Dark Fortress Bricks
    let bgMap = Array(height).fill(0).map(() => Array(width).fill(9));

    // Carve out majestic grand fortress hall
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        map[y][x] = 0;
      }
    }

    // Outer fortress walls
    for (let y = 0; y < height; y++) {
      map[y][0] = 16; map[y][1] = 16;
      map[y][width - 1] = 16; map[y][width - 2] = 16;
    }
    for (let x = 0; x < width; x++) {
      map[0][x] = 16; map[1][x] = 16;
      map[height - 1][x] = 16; map[height - 2][x] = 16;
    }

    // Entrance spawn platform at top
    for (let x = 16; x <= 27; x++) {
      map[5][x] = 16;
    }
    const startPos = { x: 22, y: 4 };

    // Terraced platforms and torches going down the fortress
    const platY = [11, 17, 23, 29, 35];
    for (const py of platY) {
      for (let x = 4; x <= 16; x++) map[py][x] = 5; // Left platform
      for (let x = 27; x <= 39; x++) map[py][x] = 5; // Right platform
      map[py - 2][5] = 10; map[py - 2][38] = 10; // Wall torches
    }

    // Bottom arena floor
    for (let x = 2; x < width - 2; x++) {
      map[height - 3][x] = 16;
    }

    // Center bottom Stone Pedestal with Diamond on top!
    map[height - 4][21] = 16; map[height - 4][22] = 16;
    map[height - 5][21] = 16; map[height - 5][22] = 16;
    map[height - 6][21] = 3;  // Diamond on Pedestal!

    const endPos = { x: 21, y: height - 6 };
    const chests: { x: number; y: number }[] = [
      { x: 5, y: height - 4 },
      { x: 38, y: height - 4 },
    ];
    const openSpaces: { x: number; y: number }[] = [];
    for (let y = 38; y <= 46; y++) {
      for (let x = 4; x <= 39; x++) {
        openSpaces.push({ x, y });
      }
    }

    return { width, height, map, bgMap, openSpaces, startPos, endPos, biome, chests };
  }

  // Biome assignment (Equal 25% chance for neutral, ice, moss, and volcanic biomes)
  const randBiome = Math.random();
  let biome: 'neutral' | 'ice' | 'moss' | 'volcanic' = 'neutral';
  if (randBiome < 0.25) {
      biome = 'neutral';
  } else if (randBiome < 0.50) {
      biome = 'ice';
  } else if (randBiome < 0.75) {
      biome = 'moss';
  } else {
      biome = 'volcanic';
  }

  // Expanded cave map scale by 1.5x
  const width = Math.floor(Math.min(24 + floor * 2, 48) * 1.8 * 1.5);
  const height = Math.floor(Math.min(80 + floor * 10, 180) * 1.45 * 1.5);
  
  // 1 = solid wall, 0 = empty, 2 = exit, 3 = diamond, 4 = ladder, 5 = platform
  let map = Array(height).fill(0).map(() => Array(width).fill(1));
  let bgMap = Array(height).fill(0).map(() => Array(width).fill(0));

  
  // 1. Random noise (varying density based on floor)
  const density = 0.37 + (Math.sin(floor) * 0.05); // Lowered for wider caves
  for (let my = 1; my < height - 1; my++) {
      for (let mx = 1; mx < width - 1; mx++) {
          map[my][mx] = Math.random() < density ? 1 : 0;
      }
  }

  // 1.5 Inject heavy horizontal layers (creates cave sub-floors)
  for (let my = 8; my < height - 8; my += (6 + Math.floor(Math.random() * 4))) {
      for (let mx = 1; mx < width - 1; mx++) {
          if (Math.random() < 0.8) {
              map[my][mx] = 1;
              if (Math.random() < 0.6) map[my+1][mx] = 1;
          }
      }
  }

  // 2. Cellular Automata - Multiple passes with different rules for varied shapes
  // Pass 1: standard smooth
  for (let s = 0; s < 4; s++) {
      const nextMap = map.map(row => [...row]);
      for (let my = 1; my < height - 1; my++) {
          for (let mx = 1; mx < width - 1; mx++) {
              let walls = 0;
              for (let dy = -1; dy <= 1; dy++) {
                  for (let dx = -1; dx <= 1; dx++) {
                      if (dx === 0 && dy === 0) continue;
                      if (map[my+dy][mx+dx] === 1) walls++;
                  }
              }
              if (map[my][mx] === 1) nextMap[my][mx] = walls >= 4 ? 1 : 0;
              else nextMap[my][mx] = walls >= 5 ? 1 : 0;
          }
      }
      map = nextMap;
  }
  
  // Pass 2: erode edges to create more organic varied shapes
  const erodedMap = map.map(row => [...row]);
  for (let my = 2; my < height - 2; my++) {
      for (let mx = 2; mx < width - 2; mx++) {
          let walls = 0;
          for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                  if (map[my+dy][mx+dx] === 1) walls++;
              }
          }
          if (map[my][mx] === 1 && walls < 7) erodedMap[my][mx] = 0;
      }
  }
  map = erodedMap;

  // 3. Drunken worms carving paths to the bottom (more organic than snake zig-zag)
  const numWorms = 2 + Math.floor(Math.random() * 2);
  for (let w = 0; w < numWorms; w++) {
      let cx = Math.floor(width/4 + Math.random() * (width/2));
      let cy = 2;
      
      while (cy < height - 2) {
          // Carve around current point with varying radius
          let radius = 1 + Math.floor(Math.random() * 3); // 1 to 3 radius
          for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                  // Rough circle carve
                  if (dx*dx + dy*dy <= radius*radius * 1.2) {
                      if (cy+dy > 0 && cy+dy < height-1 && cx+dx > 0 && cx+dx < width-1) {
                          map[cy+dy][cx+dx] = 0;
                      }
                  }
              }
          }
          
          // Move worm: mostly down, occasionally horizontal
          let dir = Math.random();
          if (dir < 0.5) {
              cy += 1;
              cx += (Math.random() < 0.5 ? -1 : 1);
          } else if (dir < 0.75) {
              cx -= 1 + Math.floor(Math.random() * 2);
          } else {
              cx += 1 + Math.floor(Math.random() * 2);
          }
          
          cx = Math.max(3, Math.min(width-4, cx));
      }
  }

  // 4. (Removed normal deterministic ladder generation)

  // 5. Removed: Water generation moved to the end

  // 6. Grass and Stone Sections
  for (let my = 1; my < height - 1; my++) {
      for (let mx = 1; mx < width - 1; mx++) {
          if (map[my][mx] === 1) {
              // 20% chance of stone patch
              if (Math.sin(mx*0.2 + my*0.3) > 0.6) map[my][mx] = 8;
              // Add grass to top blocks
              else if (map[my-1][mx] === 0 && Math.random() < 0.6) map[my][mx] = 7;
          }
      }
  }

  // 7. Structures (3 Types: Small, Medium, Large 2-3 Rooms)
  let chests: { x: number; y: number; weapon?: string; isCastleChest?: boolean }[] = [];
  let numStructures = Math.floor(floor * 0.75) + 1;
  let structureBoxes: { x: number, y: number, w: number, h: number }[] = [];

  for(let i=0; i<numStructures; i++) {
      let placed = false;
      let sx = 0, sy = 0, sw = 0, sh = 0;
      let structType: 'small' | 'medium' | 'large' = 'small';

      for (let attempt = 0; attempt < 50; attempt++) {
          let testSw = 0, testSh = 0;
          const randType = Math.random();
          if (randType < 0.35) {
              structType = 'small';
              testSw = 5 + Math.floor(Math.random() * 2);
              testSh = 4 + Math.floor(Math.random() * 2);
          } else if (randType < 0.70) {
              structType = 'medium';
              testSw = 8 + Math.floor(Math.random() * 3);
              testSh = 6 + Math.floor(Math.random() * 2);
          } else {
              structType = 'large';
              testSw = 15 + Math.floor(Math.random() * 4);
              testSh = 7 + Math.floor(Math.random() * 3);
          }

          let testSx = Math.floor(2 + Math.random() * (width - testSw - 3));
          let testSy = Math.floor(5 + Math.random() * (height - testSh - 5));

          // Bounding box with 2-tile padding to prevent merging structures
          let box = {
              x: testSx - 2,
              y: testSy - 2,
              w: testSw + 4,
              h: testSh + 4
          };

          let overlaps = structureBoxes.some(b =>
              box.x < b.x + b.w &&
              box.x + box.w > b.x &&
              box.y < b.y + b.h &&
              box.y + box.h > b.y
          );

          if (!overlaps) {
              sx = testSx;
              sy = testSy;
              sw = testSw;
              sh = testSh;
              structureBoxes.push(box);
              placed = true;
              break;
          }
      }

      if (!placed) continue;

      // Carve out a perimeter around the structure so it doesn't get embedded completely
      for (let y = sy - 1; y <= sy + sh; y++) {
          for (let x = sx - 1; x <= sx + sw; x++) {
              if (y > 0 && y < height - 1 && x > 0 && x < width - 1) {
                  if (y < sy || y >= sy + sh || x < sx || x >= sx + sw) {
                      if (map[y][x] !== 12 && map[y][x] !== 2 && map[y][x] !== 3) {
                          map[y][x] = 0;
                      }
                  }
              }
          }
      }
      
      // Carve out inside and add walls
      for(let y=sy; y<sy+sh; y++) {
          for(let x=sx; x<sx+sw; x++) {
                bgMap[y][x] = 9; // Structure background everywhere
                if (y === sy || y === sy+sh-1 || x === sx || x === sx+sw-1) {
                     map[y][x] = 11; // Structure solid block
                } else {
                     map[y][x] = 0;
                }
          }
      }
      
      // If Large Structure (2 - 3 rooms), add interior wall partitions with connecting doorways!
      if (structType === 'large') {
          const room1Width = Math.floor(sw / 3);
          const room2Width = Math.floor(sw / 3);

          // Partition 1
          const p1X = sx + room1Width;
          for (let y = sy + 1; y < sy + sh - 1; y++) {
              map[y][p1X] = 11;
          }
          // Doorway 1
          map[sy + sh - 2][p1X] = 0;
          map[sy + sh - 3][p1X] = 0;

          // Partition 2 (if wide enough for 3 rooms)
          const p2X = sx + room1Width + room2Width;
          if (p2X < sx + sw - 3) {
              for (let y = sy + 1; y < sy + sh - 1; y++) {
                  map[y][p2X] = 11;
              }
              // Doorway 2
              map[sy + 2][p2X] = 0;
              map[sy + 3][p2X] = 0;
          }
      }

      // Make doors on outer walls
      bgMap[sy+sh-2][sx] = 9; map[sy+sh-2][sx] = 0;
      bgMap[sy+sh-2][sx+sw-1] = 9; map[sy+sh-2][sx+sw-1] = 0;
      
      // Top and bottom access via platforms
      let doorX = sx + 2 + Math.floor(Math.random() * (sw - 4));
      if (doorX < sx + 1) doorX = sx + 1;
      
      map[sy][doorX] = 5; // platform on roof
      map[sy][doorX+1] = 5; 
      
      map[sy+sh-1][doorX] = 5; // platform on floor
      map[sy+sh-1][doorX+1] = 5; 
      
      // Add torches in structure
      map[sy+1][sx+Math.floor(sw/2)] = 10;
      if (structType === 'large') {
          map[sy+1][sx+3] = 10;
          map[sy+1][sx+sw-4] = 10;
      }

      // Spawn chest inside structure
      if (Math.random() < 0.90) {
          let cx = sx + Math.floor(sw / 2);
          const cy = sy + sh - 2; // Bottom inside row
          if (cx === doorX || cx === doorX + 1) {
              cx = sx + 1;
          }
          chests.push({ x: cx, y: cy });
      }
  }

  // 7.5 Fill in disconnected areas
  let visitedRegions = new Set<string>();
  let largestRegion = new Set<string>();
  
  for (let my = 1; my < height - 1; my++) {
      for (let mx = 1; mx < width - 1; mx++) {
          let tile = map[my][mx];
          let key = `${mx},${my}`;
          if ((tile === 0 || tile === 4 || tile === 5 || tile === 6) && !visitedRegions.has(key)) {
              let currentRegion = new Set<string>();
              let queue = [{x: mx, y: my}];
              
              while(queue.length > 0) {
                  let curr = queue.shift()!;
                  let ckey = `${curr.x},${curr.y}`;
                  if (currentRegion.has(ckey)) continue;
                  currentRegion.add(ckey);
                  visitedRegions.add(ckey);
                  
                  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
                  for (let d of dirs) {
                      let nx = curr.x + d[0];
                      let ny = curr.y + d[1];
                      let ntile = map[ny][nx];
                      if (ntile === 0 || ntile === 4 || ntile === 5 || ntile === 6 || ntile === 2 || ntile === 3) {
                          if (!currentRegion.has(`${nx},${ny}`)) {
                              queue.push({x: nx, y: ny});
                          }
                      }
                  }
              }
              
              if (currentRegion.size > largestRegion.size) {
                  largestRegion = currentRegion;
              }
          }
      }
  }

  // Fill everything not in the largest region
  for (let my = 1; my < height - 1; my++) {
      for (let mx = 1; mx < width - 1; mx++) {
          if (!largestRegion.has(`${mx},${my}`) && map[my][mx] === 0) {
              map[my][mx] = 1;
          }
      }
  }

  // 8. Calculate open spaces
  let openSpaces: {x: number, y: number}[] = [];
  let minY = height, maxY = 0;
  for (let my = 1; my < height - 1; my++) {
      for (let mx = 1; mx < width - 1; mx++) {
          if (map[my][mx] === 0 || map[my][mx] === 4 || map[my][mx] === 5) {
              openSpaces.push({x: mx, y: my});
              if (my < minY) minY = my;
              if (my > maxY) maxY = my;
          }
      }
  }

  // 6. Placements
  let startSpaces = openSpaces.filter(s => s.y <= minY + 8 && map[s.y + 1] && (map[s.y + 1][s.x] === 1 || map[s.y + 1][s.x] === 8 || map[s.y + 1][s.x] === 11 || map[s.y + 1][s.x] === 15 || map[s.y + 1][s.x] === 5));
  if (startSpaces.length === 0) {
      startSpaces = openSpaces.filter(s => s.y <= minY + 5);
  }
  const startPos = startSpaces.length > 0 
    ? startSpaces[Math.floor(Math.random() * startSpaces.length)] 
    : {x: Math.floor(width/2), y: 5};
    
  // Ensure start is not mid-air
  if (map[startPos.y + 1] && map[startPos.y + 1][startPos.x] === 0) {
      map[startPos.y + 1][startPos.x] = 5; // Place a platform right beneath spawn
  }
    
  // Descend gate MUST spawn on the floor of the lower 30% of the cave,
  // standing on natural solid ground (never water/lava, never floating).
  const solidGroundBelow = (x: number, y: number) => {
    if (y >= height || y < 0 || x < 0 || x >= width) return false;
    const below = map[y + 1] ? map[y + 1][x] : 1;
    return (below === 1 || below === 7 || below === 8 || below === 11 ||
            below === 15 || below === 16 || below === 17 || below === 19 || below === 20);
  };

  let endSpaces = openSpaces.filter(
    s => s.y >= Math.floor(height * 0.70) &&
         s.y > 1 &&
         map[s.y][s.x] === 0 &&
         map[s.y - 1] && map[s.y - 1][s.x] === 0 &&
         solidGroundBelow(s.x, s.y) &&
         map[s.y + 1][s.x] !== 21
  );
  if (endSpaces.length === 0) {
    endSpaces = openSpaces.filter(
      s => s.y >= Math.floor(height * 0.50) &&
           s.y > 1 &&
           map[s.y][s.x] === 0 &&
           map[s.y - 1] && map[s.y - 1][s.x] === 0 &&
           solidGroundBelow(s.x, s.y) &&
           map[s.y + 1][s.x] !== 21
    );
  }
  let endPos = endSpaces.length > 0 
    ? endSpaces[Math.floor(Math.random() * endSpaces.length)] 
    : {x: Math.floor(width/2), y: height - 5};

  // Guarantee solid ground underneath endPos and clear air above endPos
  if (map[endPos.y] && map[endPos.y][endPos.x] !== 0) {
    map[endPos.y][endPos.x] = 0; // Gate spot must be open air
  }
  if (map[endPos.y - 1] && map[endPos.y - 1][endPos.x] !== 0) {
    map[endPos.y - 1][endPos.x] = 0; // Space above gate must be open air
  }
  if (!map[endPos.y + 1] || map[endPos.y + 1][endPos.x] === 0 || map[endPos.y + 1][endPos.x] === 6 || map[endPos.y + 1][endPos.x] === 21) {
    const solidBlock = biome === 'ice' ? 16 : (biome === 'volcanic' ? 20 : (biome === 'moss' ? 15 : 1));
    if (map[endPos.y + 1]) map[endPos.y + 1][endPos.x] = solidBlock; // Place solid floor underneath gate
  }

  if (floor < maxFloor) {
      // Exit is handled by Engine via endPos
      // Add hints: purple torches (12) near the exit
      let hintCandles = 0;
      for (let ty = endPos.y - 3; ty <= endPos.y + 3; ty++) {
          for (let tx = endPos.x - 4; tx <= endPos.x + 4; tx++) {
              if (tx > 0 && tx < width-1 && ty > 0 && ty < height-1) {
                  if (map[ty][tx] === 0 && map[ty+1] && (map[ty+1][tx] === 1 || map[ty+1][tx] === 8) && hintCandles < 3 && Math.random() < 0.3) {
                      map[ty][tx] = 12; // 12 = Purple torch
                      hintCandles++;
                  }
              }
          }
      }
  } else {
      // Diamond is handled by Engine via endPos
  }

  // Guarantee softlock prevention down to the bottom (REMOVED: Replaced by smart basin detection below)

  // Identify unescapable pools and place ladders/platforms
  for (let my = 2; my < height - 1; my++) {
      for (let mx = 1; mx < width - 1; mx++) {
          let currentTile = map[my][mx];
          let blockBelow = map[my+1][mx];
          
          if ((currentTile === 0 || currentTile === 6) && 
              (blockBelow === 1 || blockBelow === 8 || blockBelow === 11 || blockBelow === 15)) {
              
              let escapable = false;
              let visited = new Set<string>();
              let queue = [{x: mx, y: my}];
              
              while(queue.length > 0) {
                  let curr = queue.shift()!;
                  let key = `${curr.x},${curr.y}`;
                  if (visited.has(key)) continue;
                  visited.add(key);
                  
                  // Can we escape to a lower depth, or to the exit?
                  if (curr.y > my || (curr.x === endPos.x && curr.y === endPos.y)) {
                      escapable = true;
                      break;
                  }
                  
                  // Limit search span (a huge cavern is considered escapable or not a trap)
                  if (visited.size > 300) {
                      escapable = true; 
                      break;
                  }
                  
                  // Fall down
                  if (curr.y + 1 < height) {
                      let down = map[curr.y+1][curr.x];
                      if (down !== 1 && down !== 8 && down !== 11 && down !== 15) {
                          queue.push({x: curr.x, y: curr.y + 1});
                      }
                  }
                  
                  // Walk left/right
                  for (let dx of [-1, 1]) {
                      let nx = curr.x + dx;
                      if (nx > 0 && nx < width - 1) {
                          let side = map[curr.y][nx];
                          if (side !== 1 && side !== 8 && side !== 11 && side !== 15) {
                              queue.push({x: nx, y: curr.y});
                          }
                      }
                  }
                  
                    // Jump (up to 3 blocks up, actual jump max)
                    let isGrounded = false;
                    if (curr.y + 1 < height) {
                        let down = map[curr.y+1][curr.x];
                        if (down === 1 || down === 8 || down === 11 || down === 15 || down === 5) isGrounded = true;
                    }
                    let tile = map[curr.y][curr.x];
                    if (tile === 4 || tile === 6) isGrounded = true; 
                    
                    if (isGrounded) {
                        for (let j = 1; j <= 3; j++) {
                            if (curr.y - j <= 0) break;
                            let up = map[curr.y - j][curr.x];
                            if (up === 1 || up === 8 || up === 11 || up === 15) break; 
                            queue.push({x: curr.x, y: curr.y - j});
                        }
                    }
              }
              
              if (!escapable) {
                  // Pool is unescapable! Find its bounds.
                  let rx = mx;
                  while (rx < width - 2) {
                      const nextTile = map[my][rx + 1];
                      const nextBelow = map[my + 1][rx + 1];
                      if ((nextTile === 0 || nextTile === 6) && (nextBelow === 1 || nextBelow === 8 || nextBelow === 11 || nextBelow === 15 || nextBelow === 5)) {
                          rx++;
                      } else {
                          break;
                      }
                  }

                  // Escape shaft logic
                  let cx = mx;
                  let ly = my;
                  // Make sure we have 2 block width for the shaft
                  if (cx === width - 2) cx--;
                  
                  while (ly > 0) {
                      // Check if BOTH the ladder column and the adjacent column have open space above
                      let leftOpen = map[ly-1] && (map[ly-1][cx] === 0 || map[ly-1][cx] === 5 || map[ly-1][cx] === 6 || map[ly-1][cx] === 2 || map[ly-1][cx] === 3);
                      let rightOpen = map[ly-1] && (map[ly-1][cx+1] === 0 || map[ly-1][cx+1] === 5 || map[ly-1][cx+1] === 6 || map[ly-1][cx+1] === 2 || map[ly-1][cx+1] === 3);
                      
                      // Carve 2-wide space
                      if (map[ly][cx] !== 2 && map[ly][cx] !== 3 && map[ly][cx] !== 12) {
                          map[ly][cx] = 4; // Ladder on left side
                      }
                      if (map[ly][cx+1] !== 2 && map[ly][cx+1] !== 3 && map[ly][cx+1] !== 12) {
                          map[ly][cx+1] = 0; // Air on right side
                      }
                      
                      // Replace adjacent dirt with sleek structure block to make the shaft look intentional
                      if (cx > 1 && map[ly][cx-1] === 1) map[ly][cx-1] = 11;
                      if (cx < width - 3 && map[ly][cx+2] === 1) map[ly][cx+2] = 11;

                      if (leftOpen && rightOpen && ly < my - 1) {
                          // We breached into a cavern! Add a resting platform at the top
                          if (map[ly][cx] !== 2 && map[ly][cx] !== 3) map[ly][cx] = 5;
                          if (map[ly][cx+1] !== 2 && map[ly][cx+1] !== 3) map[ly][cx+1] = 5;
                          break;
                      }
                      ly--;
                  }
                  
                  mx = rx;
              }
          }
      }
  }

  // 10. Final pass: Generate water pools in logically enclosed dips
  const isSolid = (x: number, y: number) => {
      if (y < 0 || y >= height || x < 0 || x >= width) return true;
      const t = map[y][x];
      return t === 1 || t === 8 || t === 7 || t === 15 || t === 11 || t === 6;
  };
  
  for (let my = height - 2; my >= 2; my--) {
      for (let mx = 2; mx < width - 2; mx++) {
          if (map[my][mx] === 0 && isSolid(mx, my+1)) {
              // Measure pool width to the right
              let poolWidth = 0;
              let rightBounded = false;
              
              while (mx + poolWidth < width - 1) {
                  const checkingX = mx + poolWidth;
                  const tg = map[my][checkingX];
                  if (isSolid(checkingX, my) || tg === 5 || tg === 4 || tg === 11) {
                      rightBounded = true;
                      break; // Hit a wall to the right
                  }
                  if (!isSolid(checkingX, my+1) && map[my+1][checkingX] !== 5 && map[my+1][checkingX] !== 4) {
                      break; // Floor dropped out
                  }
                  // It will fill until it hits a solid block, overwriting torches, vines etc. if they are in the pool
                  poolWidth++;
              }
              
              if (poolWidth >= 3 && rightBounded) {
                 const leftBounded = isSolid(mx-1, my) || map[my][mx-1] === 5 || map[my][mx-1] === 4;
                 
                 // If bounded safely on both sides and floor is solid (already checked by the while loop)
                 if (leftBounded && rightBounded) {
                     for(let w=-1; w<=poolWidth; w++) {
                         if (w < 0 || w == poolWidth) {
                             if (!isSolid(mx+w, my+1)) map[my+1][mx+w] = 1;
                         } else {
                             const currentTile = map[my][mx+w];
                             if (currentTile !== 5 && currentTile !== 4 && currentTile !== 11) {
                                 map[my][mx+w] = 6;
                                 if (my + 2 < height) {
                                     map[my+1][mx+w] = 6; // Carve deeper
                                     if (!isSolid(mx+w, my+2)) map[my+2][mx+w] = 1; // Ensure bottom is solid
                                 }
                             }
                         }
                     }
                 }
                 mx += poolWidth; // Skip checked area
              }
          }
      }
  }

  // Water cleanup: water cannot spawn if it bounds non-water/non-solids (prevents floating water passing through vines/torches)
  let changedWater = true;
  while(changedWater) {
      changedWater = false;
      for (let my = 1; my < height - 1; my++) {
          for (let mx = 1; mx < width - 1; mx++) {
              if (map[my][mx] === 6) {
                  if (!isSolid(mx-1, my) && map[my][mx-1] !== 5 && map[my][mx-1] !== 4 && map[my][mx-1] !== 11) { map[my][mx] = 0; changedWater = true; continue; }
                  if (!isSolid(mx+1, my) && map[my][mx+1] !== 5 && map[my][mx+1] !== 4 && map[my][mx+1] !== 11) { map[my][mx] = 0; changedWater = true; continue; }
                  if (!isSolid(mx, my+1) && map[my+1][mx] !== 5 && map[my+1][mx] !== 4 && map[my+1][mx] !== 11) { map[my][mx] = 0; changedWater = true; continue; }
              }
          }
      }
  }
  
  // Clear top layer of water to ensure a gap before the ceiling
  for (let my = 1; my < height - 1; my++) {
      for (let mx = 1; mx < width - 1; mx++) {
          if (map[my][mx] === 6 && map[my-1][mx] !== 0 && map[my-1][mx] !== 6) {
              map[my][mx] = 0; // if right under a ceiling, remove water to leave air gap
          }
      }
  }

  // 11. Break up massive vertical drops with floating platforms
  // Generate Moss Biomes early so platforms can use it
  const numMossBiomes = 4 + Math.floor(Math.random() * 5); // Huge number of moss biomes
  const mossBiomes = [];
  for (let i = 0; i < numMossBiomes; i++) {
      mossBiomes.push({
          x: Math.floor(Math.random() * width),
          y: Math.floor(Math.random() * height),
          radius: 20 + Math.random() * 25 // larger moss radius
      });
  }

  const inMossBiome = (x: number, y: number) => {
      for (const b of mossBiomes) {
          if (Math.pow(x - b.x, 2) + Math.pow(y - b.y, 2) < b.radius * b.radius) return true;
      }
      return false;
  };

  for (let my = 5; my < height - 5; my++) {
      for (let mx = 5; mx < width - 5; mx++) {
          if (map[my][mx] === 0) {
              // Check if it's a huge open space (e.g., 4x8 air)
              let isEmpty = true;
              for (let dy = -4; dy <= 4; dy++) {
                  for (let dx = -3; dx <= 3; dx++) {
                      if (map[my+dy] && map[my+dy][mx+dx] !== 0) {
                          isEmpty = false;
                          break;
                      }
                  }
                  if (!isEmpty) break;
              }
              
              if (isEmpty && Math.random() < 0.25) {
                  // Add a small floating platform
                  let pWidth = 3 + Math.floor(Math.random() * 4);
                  // 70% of platforms should fill in air as a generated cave part (solid dirt/stone)
                  const isSolidCavePart = Math.random() < 0.70;
                  const useBlock = isSolidCavePart ? (Math.random() < 0.5 ? 1 : 8) : 5;
                  
                  let pHeight = isSolidCavePart ? 2 + Math.floor(Math.random() * 3) : 1;
                  
                  for (let w = 0; w < pWidth; w++) {
                      let colHeight = pHeight;
                      // Taper the edges for a more natural look
                      if (isSolidCavePart && (w === 0 || w === pWidth - 1)) colHeight = Math.max(1, pHeight - 1);
                      if (isSolidCavePart && Math.random() < 0.3) colHeight--;

                      for (let h = 0; h < colHeight; h++) {
                          if (mx+w < width - 2 && my+h < height - 2) {
                              map[my+h][mx+w] = useBlock; 
                          }
                      }
                      
                      // Add moss/grass on top optionally
                      if (isSolidCavePart && mx+w < width - 2 && Math.random() < 0.5) {
                          if (inMossBiome(mx+w, my-1)) {
                              map[my-1][mx+w] = 15; // Mossy grass on top
                          }
                      }
                  }
                  
                  // Maybe add a torch
                  if (Math.random() < 0.5) {
                      map[my-2][mx + Math.floor(pWidth/2)] = 10;
                  }
              }
          }
      }
  }
  
  // 12. Add Moss randomly to caves (using Moss Biomes generated earlier)
  for (let my = 1; my < height - 1; my++) {
      for (let mx = 1; mx < width - 1; mx++) {
          if (!inMossBiome(mx, my)) continue;
          
          if (map[my][mx] === 0) {
              // If there's dirt/stone/mossgrass above, have a chance to spawn dangling moss/vines
              if ((map[my-1][mx] === 1 || map[my-1][mx] === 8 || map[my-1][mx] === 7 || map[my-1][mx] === 15) && Math.random() < 0.25) {
                  let generate = true;
                  if (biome === 'ice') {
                      const topL = map[my-1][mx-1] === 1 || map[my-1][mx-1] === 8 || map[my-1][mx-1] === 7 || map[my-1][mx-1] === 15;
                      const topR = map[my-1][mx+1] === 1 || map[my-1][mx+1] === 8 || map[my-1][mx+1] === 7 || map[my-1][mx-1] === 15;
                      if (!topL || !topR) generate = false;
                      // "icicles shouldn't spawn on eachother" - check left, right, top, bottom adjacency
                      if (map[my][mx-1] === 13 || map[my][mx+1] === 13 || map[my-1][mx] === 13 || map[my+1][mx] === 13) {
                          generate = false;
                      }
                  }
                  
                  if (generate) {
                      map[my][mx] = 13; // Moss/Vines / Icicle
                      if (biome !== 'ice') {
                          // Grown moss/vines (tile 13)
                          if (Math.random() < 0.6 && map[my+1][mx] === 0) {
                              map[my+1][mx] = 13;
                              if (Math.random() < 0.4 && map[my+2][mx] === 0) {
                                  map[my+2][mx] = 13;
                              }
                          }
                      }
                  }
              }
          }
      }
  }

  // Drop ladders from platforms > 3 tiles high
  for (let my = 0; my < height; my++) {
      let mx = 0;
      while (mx < width) {
          if (map[my][mx] === 5) {
              let startX = mx;
              while (mx < width && map[my][mx] === 5) {
                  mx++;
              }
              let endX = mx - 1;
              
              // Find the x coordinate with the shortest drop to flatground
              let bestX = -1;
              let minDist = Infinity;
              
              for (let x = startX; x <= endX; x++) {
                  for (let dy = 1; my + dy < height; dy++) {
                      let tileDown = map[my + dy][x];
                      if (tileDown === 1 || tileDown === 7 || tileDown === 8 || tileDown === 11 || tileDown === 15 || tileDown === 16 || tileDown === 17 || tileDown === 5 || tileDown === 6) {
                          // Found ground!
                          if (dy < minDist) {
                              minDist = dy;
                              bestX = x;
                          }
                          // We stop checking down further for this column
                          break;
                      }
                  }
              }

              // Place ladder if platform is above jump height (> 3 blocks)
              if (minDist > 3 && bestX !== -1) {
                  for (let i = 1; i < minDist; i++) {
                      const t = map[my + i][bestX];
                      if (t !== 1 && t !== 7 && t !== 8 && t !== 11 && t !== 15 && t !== 16 && t !== 17 && t !== 5 && t !== 6 && t !== 2 && t !== 3) {
                          map[my + i][bestX] = 4; // Ladder
                      }
                  }
              }
          } else {
              mx++;
          }
      }
  }

  // Replace tiles if ice biome
  if (biome === 'ice') {
      for (let my = 0; my < height; my++) {
          for (let mx = 0; mx < width; mx++) {
              if (map[my][mx] === 1) map[my][mx] = 16; // Snow
              if (map[my][mx] === 8) map[my][mx] = 17; // Ice
              if (map[my][mx] === 7 || map[my][mx] === 15) map[my][mx] = 16; // Grass -> Snow
              if (map[my][mx] === 6 && map[my-1] && map[my-1][mx] !== 6 && map[my-1][mx] !== 18 && map[my-1][mx] !== 6) map[my][mx] = 18; // Thin Ice
          }
      }
  } else if (biome === 'moss') {
      for (let my = 0; my < height; my++) {
          for (let mx = 0; mx < width; mx++) {
              if (map[my][mx] === 1) map[my][mx] = 15; // Dirt -> Mossy
              if (map[my][mx] === 8) map[my][mx] = 15; // Stone -> Mossy
              if (map[my][mx] === 7) map[my][mx] = 15; // Grass -> Mossy
              if (map[my][mx] === 0 && map[my-1]) {
                  if (map[my-1][mx] === 15 || map[my-1][mx] === 13) {
                      if (Math.random() < 0.8) {
                          map[my][mx] = 13; // Super high chance of hanging moss underneath, making cascading ivy
                      }
                  }
              }
          }
      }
  } else if (biome === 'volcanic') {
      for (let my = 0; my < height; my++) {
          for (let mx = 0; mx < width; mx++) {
              if (map[my][mx] === 1) map[my][mx] = 19; // Basalt
              if (map[my][mx] === 8) map[my][mx] = 20; // Heated Magma Block
              if (map[my][mx] === 7 || map[my][mx] === 15) map[my][mx] = 19; // Basalt
              if (map[my][mx] === 6) map[my][mx] = 21; // Lava Liquid!
          }
      }
  }

  // 1% Chance for Legendary Castle Structure in Ice Pathways or Volcanic Caverns
  if ((biome === 'ice' || biome === 'volcanic') && Math.random() < 0.01) {
      const castleW = 22;
      const castleH = 14;
      const castleX = Math.floor(width / 2 - castleW / 2);
      const castleY = Math.floor(height / 2 - castleH / 2);
      const brickTile = biome === 'ice' ? 16 : 20;

      // Carve out 2x size Castle interior and build themed brick walls
      for (let cy = castleY; cy < castleY + castleH; cy++) {
          for (let cx = castleX; cx < castleX + castleW; cx++) {
              if (cy === castleY || cy === castleY + castleH - 1 || cx === castleX || cx === castleX + castleW - 1) {
                  map[cy][cx] = brickTile;
              } else {
                  map[cy][cx] = 0; // Empty interior
                  bgMap[cy][cx] = 9; // Wood background
              }
          }
      }

      // Add Legendary Castle Chest
      const chestWeapon = biome === 'ice' ? 'frozen_sword' : 'molten_axe';
      const chestX = castleX + Math.floor(castleW / 2);
      const chestY = castleY + castleH - 2;
      chests.push({
          x: chestX,
          y: chestY,
          weapon: chestWeapon,
          isCastleChest: true
      });
  }

  // Descend gate rule: endPos CANNOT spawn inside lava (tile 21) AND MUST spawn on top of solid ground in the lower 30% of the cave
  if (map[endPos.y] && map[endPos.y][endPos.x] === 21) {
      const lower30 = openSpaces.filter(s =>
          s.y >= Math.floor(height * 0.70) &&
          s.y > 1 &&
          map[s.y][s.x] === 0 &&
          map[s.y - 1] && map[s.y - 1][s.x] === 0 &&
          map[s.y + 1] && map[s.y + 1][s.x] !== 21 &&
          solidGroundBelow(s.x, s.y)
      );
      const pool = lower30.length > 0 ? lower30 : openSpaces;
      for (let spot of pool) {
          if (map[spot.y] && map[spot.y][spot.x] !== 21 && map[spot.y][spot.x] !== 1 && map[spot.y + 1] && map[spot.y + 1][spot.x] !== 21) {
              endPos = spot;
              map[endPos.y][endPos.x] = 2;
              break;
          }
      }
  }

  // Final Pass: Fill all disconnected areas from startPos so no isolated pockets or weird unreachable areas remain
  let reachableFromStart = new Set<string>();
  let startQueue = [{ x: startPos.x, y: startPos.y }];
  reachableFromStart.add(`${startPos.x},${startPos.y}`);

  while (startQueue.length > 0) {
      let curr = startQueue.shift()!;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let d of dirs) {
          let nx = curr.x + d[0];
          let ny = curr.y + d[1];
          if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1) {
              let ntile = map[ny][nx];
              let key = `${nx},${ny}`;
              // Non-solid / traversable tiles
              if (!reachableFromStart.has(key) && (ntile === 0 || ntile === 2 || ntile === 3 || ntile === 4 || ntile === 5 || ntile === 6 || ntile === 10 || ntile === 12 || ntile === 13 || ntile === 15 || ntile === 18 || ntile === 21)) {
                  reachableFromStart.add(key);
                  startQueue.push({ x: nx, y: ny });
              }
          }
      }
  }

  // Any non-solid tile not reachable from startPos becomes solid wall (use biome-appropriate solid AFTER biome conversion!)
  const biomeSolid = biome === 'ice' ? 16 : (biome === 'moss' ? 15 : (biome === 'volcanic' ? 19 : 1));
  for (let my = 1; my < height - 1; my++) {
      for (let mx = 1; mx < width - 1; mx++) {
          let tile = map[my][mx];
          if ((tile === 0 || tile === 4 || tile === 5 || tile === 6 || tile === 10 || tile === 12 || tile === 13 || tile === 18 || tile === 21) && !reachableFromStart.has(`${mx},${my}`)) {
              map[my][mx] = biomeSolid; // Fill disconnected pocket with biome solid wall
          }
      }
  }

  // Ensure solid ground block directly beneath endPos AFTER BFS cleanup!
  map[endPos.y - 1][endPos.x] = 0; // Empty air space above door
  map[endPos.y][endPos.x] = 2;     // Descend trapdoor gate
  if (map[endPos.y + 1]) {
      const tileBelow = map[endPos.y + 1][endPos.x];
      if (tileBelow !== 1 && tileBelow !== 7 && tileBelow !== 8 && tileBelow !== 11 && tileBelow !== 15 && tileBelow !== 16 && tileBelow !== 17 && tileBelow !== 19 && tileBelow !== 20 && tileBelow !== 21) {
          const groundBlock = biome === 'ice' ? 16 : (biome === 'volcanic' ? 19 : (biome === 'moss' ? 15 : 1));
          map[endPos.y + 1][endPos.x] = groundBlock; // Create solid natural ground block underneath gate
      }
  }

  return { width, height, map, bgMap, openSpaces, startPos, endPos, biome, chests };
}

