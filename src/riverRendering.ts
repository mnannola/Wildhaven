import type Phaser from 'phaser';
import { W, H, TILE, type World } from './sim';
export type RiverFlow = { tile: number; dx: number; dy: number; ford: boolean };

// Independent, decorrelated samples; never consume the ecosystem's RNG.
function rippleNoise(tile: number, salt: number) {
  let n = Math.imul(tile + 1, 374761393) ^ Math.imul(salt + 17, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// Continuous world-space color fields avoid a repeating pattern on every tile.
export function paintWater(c: CanvasRenderingContext2D, w: World) {
  const wet = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < W &&
    y < H &&
    (w.cell(x, y).kind === 'water' || !!w.cell(x, y).ford);
  for (let i = 0; i < w.cells.length; i++) {
    const tx = i % W,
      ty = Math.floor(i / W);
    if (!wet(tx, ty)) continue;
    const banks: { x: number; y: number }[] = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (!wet(tx + dx, ty + dy))
          banks.push({ x: (tx + dx) * TILE, y: (ty + dy) * TILE });
    for (let oy = 0; oy < TILE; oy += 3)
      for (let ox = 0; ox < TILE; ox += 3) {
        const x = tx * TILE + ox,
          y = ty * TILE + oy;
        let shore = 48;
        for (const b of banks)
          shore = Math.min(
            shore,
            Math.hypot(
              Math.max(b.x - x, 0, x - b.x - TILE),
              Math.max(b.y - y, 0, y - b.y - TILE),
            ),
          );
        const deep = Math.min(1, shore / 24),
          wash =
            Math.sin(x * 0.019 + y * 0.027) * 3 +
            Math.sin(x * 0.043 - y * 0.012) * 2;
        const reflection =
          (Math.sin(y * 0.083 + Math.sin(x * 0.016) * 2) +
            Math.sin(y * 0.037 + x * 0.007)) *
          0.5;
        const r = Math.round(103 - deep * 55 + wash + reflection * 5),
          g = Math.round(128 - deep * 29 + wash + reflection * 7),
          b = Math.round(105 + deep * 1 + wash + reflection * 8);
        c.fillStyle = `rgb(${r},${g},${b})`;
        c.fillRect(x, y, 3, 3);
      }
  }
}

// Work backwards from the river mouth so tributaries flow into the main channel.
// Crossings participate in connectivity even though animals can walk on them.
export function riverFlow(w: World): RiverFlow[] {
  const river = (i: number) =>
    i >= 0 && i < w.cells.length && w.cells[i].river !== undefined;
  const neighbors = (i: number) =>
    [
      i % W > 0 ? i - 1 : -1,
      i % W < W - 1 ? i + 1 : -1,
      i >= W ? i - W : -1,
      i < W * (H - 1) ? i + W : -1,
    ].filter(river);
  const distance = new Int32Array(W * H).fill(-1),
    queue: number[] = [];
  for (let x = 0; x < W; x++) {
    const i = (H - 1) * W + x;
    if (river(i)) {
      distance[i] = 0;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++)
    for (const next of neighbors(queue[head]))
      if (distance[next] < 0) {
        distance[next] = distance[queue[head]] + 1;
        queue.push(next);
      }
  return w.cells.flatMap((c, i) => {
    if (c.river === undefined) return [];
    const next = neighbors(i)
      .filter((n) => distance[n] >= 0 && distance[n] < distance[i])
      .sort((a, b) => distance[a] - distance[b] || b - a)[0];
    return [
      {
        tile: i,
        dx: next === undefined ? 0 : (next % W) - (i % W),
        dy: next === undefined ? 1 : Math.floor(next / W) - Math.floor(i / W),
        ford: !!c.ford,
      },
    ];
  });
}

export function drawRiver(
  g: Phaser.GameObjects.Graphics,
  flow: readonly RiverFlow[],
  time: number,
) {
  const byTile = new Map(flow.map((f) => [f.tile, f]));
  const wet = (x: number, y: number) => {
    const tx = Math.floor(x / TILE),
      ty = Math.floor(y / TILE);
    return tx >= 0 && ty >= 0 && tx < W && ty < H && byTile.has(ty * W + tx);
  };
  for (const { tile, dx, dy, ford } of flow) {
    const x = (tile % W) * TILE,
      y = Math.floor(tile / W) * TILE;
    if (ford) {
      // Two stones share the same positions as the cached terrain artwork.
      for (const [ox, oy] of [
        [6, 8],
        [18, 17],
      ])
        for (const side of [-1, 1]) {
          const p = (time * 0.3 + tile * 0.137) % 1;
          g.lineStyle(0.8, 0xc7d7bf, 0.12 + Math.sin(p * Math.PI) * 0.12)
            .beginPath()
            .moveTo(
              x + ox + dx * 5 - dy * side * 5,
              y + oy + dy * 5 + dx * side * 5,
            )
            .lineTo(
              x + ox + dx * 9 - dy * side * 6,
              y + oy + dy * 9 + dx * side * 6,
            )
            .lineTo(
              x + ox + dx * 14 - dy * side * 4,
              y + oy + dy * 14 + dx * side * 4,
            )
            .strokePath();
        }
      continue;
    }
    // Sparse, soft reflection ribbons; averaging directions removes right-angle turns.
    const seed = rippleNoise(tile, 0);
    if (seed > 0.4) continue;
    let fx = dx,
      fy = dy;
    for (const offset of [-W, W, -1, 1]) {
      const n = byTile.get(tile + offset);
      if (n && Math.abs((n.tile % W) - (tile % W)) <= 1) {
        fx += n.dx;
        fy += n.dy;
      }
    }
    const length = Math.hypot(fx, fy) || 1;
    fx /= length;
    fy /= length;
    const age =
        time * (0.07 + rippleNoise(tile, 1) * 0.08) + rippleNoise(tile, 2) * 11,
      cycle = Math.floor(age),
      phase = age - cycle,
      // Each new reflection forms elsewhere, rather than resetting on a tile center.
      px = x + rippleNoise(tile, 3 + cycle * 7) * 24 + fx * (phase - 0.5) * 18,
      py = y + rippleNoise(tile, 4 + cycle * 7) * 24 + fy * (phase - 0.5) * 18,
      halfLength = 5 + rippleNoise(tile, 5 + cycle * 7) * 11,
      tilt = (rippleNoise(tile, 6 + cycle * 7) - 0.5) * 0.35,
      bend = 0.6 + rippleNoise(tile, 7 + cycle * 7) * 1.8;
    const alpha =
      Math.sin(phase * Math.PI) ** 2 * (0.1 + rippleNoise(tile, 8) * 0.14);
    for (const [width, opacity] of [
      [3, alpha * 0.28],
      [0.9, alpha],
    ]) {
      g.lineStyle(width, 0xb5d1bf, opacity).beginPath();
      let drawing = false;
      for (let step = 0; step <= 12; step++) {
        const k = ((step / 12) * 2 - 1) * halfLength,
          wave = Math.sin(k * 0.14 + seed * 6 + time * 0.35) * bend,
          qx = px + k + wave * 0.2,
          qy = py + k * tilt + wave * 0.5;
        if (wet(qx, qy)) {
          if (drawing) g.lineTo(qx, qy);
          else g.moveTo(qx, qy);
          drawing = true;
        } else drawing = false;
      }
      g.strokePath();
    }
  }
}

export function drawLake(
  g: Phaser.GameObjects.Graphics,
  w: World,
  tiles: readonly number[],
  time: number,
) {
  const wet = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W * TILE || y >= H * TILE) return false;
    const c = w.cell(x / TILE, y / TILE);
    return c.kind === 'water' && c.river === undefined;
  };
  for (const tile of tiles) {
    if (w.cells[tile].river !== undefined || rippleNoise(tile, 40) > 0.36)
      continue;
    // Never choose every Nth tile: world width can turn that into visible columns.
    const age =
        time * (0.06 + rippleNoise(tile, 41) * 0.09) +
        rippleNoise(tile, 42) * 9,
      cycle = Math.floor(age),
      p = age - cycle,
      x =
        (tile % W) * TILE +
        rippleNoise(tile, 43 + cycle * 6) * 24 +
        (p - 0.5) * 5,
      y =
        Math.floor(tile / W) * TILE +
        rippleNoise(tile, 44 + cycle * 6) * 24 +
        Math.sin(p * Math.PI) * 2,
      size = 4 + rippleNoise(tile, 45 + cycle * 6) * 9,
      tilt = (rippleNoise(tile, 46 + cycle * 6) - 0.5) * 0.3,
      alpha = Math.sin(p * Math.PI) ** 2 * (0.12 + rippleNoise(tile, 47) * 0.1);
    g.lineStyle(0.9, 0xbad3bd, alpha).beginPath();
    let drawing = false;
    for (let k = 0; k <= 10; k++) {
      const dx = ((k / 10) * 2 - 1) * size,
        qx = x + dx,
        qy = y + dx * tilt + Math.sin(dx * 0.2 + p * 2) * 0.6;
      if (wet(qx, qy)) {
        if (drawing) g.lineTo(qx, qy);
        else g.moveTo(qx, qy);
        drawing = true;
      } else drawing = false;
    }
    g.strokePath();
  }
}

export function waterRings(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  phase: number,
  strength = 1,
) {
  for (let k = 0; k < 2; k++) {
    const p = (phase + k * 0.5) % 1;
    g.lineStyle(1.2, 0xc8e4d6, (1 - p) * 0.7 * strength).strokeEllipse(
      x + p * 2,
      y + p,
      5 + p * 25,
      2 + p * 10,
    );
  }
}

export function waterSplash(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  phase: number,
) {
  waterRings(g, x, y, phase, 1);
  for (let k = 0; k < 9; k++) {
    const spread = (k - 4) / 4,
      px = x + spread * phase * 21,
      py = y - Math.sin(phase * Math.PI) * (9 + (k % 3) * 4) + phase * 4;
    g.fillStyle(k % 2 ? 0xd9ede0 : 0x94c6bf, (1 - phase) * 0.95).fillEllipse(
      px,
      py,
      2.5 - phase,
      3.5 - phase * 2,
    );
  }
}
