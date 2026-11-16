import type Phaser from 'phaser';
import { W, H, TILE, type World } from './sim';

// Coordinate noise is independent of the simulation RNG, including after loading a save.
export function woodlandNoise(x: number, y: number, salt = 0) {
  let n =
    Math.imul(x + 31, 374761393) ^
    Math.imul(y + 17, 668265263) ^
    Math.imul(salt + 1, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function woodlandTopology(w: World) {
  return w.cells
    .map(
      (c) =>
        (c.kind === 'water' ? 'w' : c.kind === 'tree' ? 't' : 'g') +
        (c.ford ? 'f' : '') +
        c.variant,
    )
    .join('');
}
type Context = CanvasRenderingContext2D;
function ellipse(
  c: Context,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}
function stroke(c: Context, points: number[][], color: string, width: number) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
function stone(c: Context, x: number, y: number, size: number, n: number) {
  ellipse(c, x + 2, y + 3, size * 1.05, size * 0.58, '#253c3540');
  c.fillStyle = n > 0.5 ? '#8d9076' : '#a39b7e';
  c.beginPath();
  c.moveTo(x - size, y);
  c.lineTo(x - size * 0.65, y - size * 0.55);
  c.lineTo(x + size * 0.3, y - size * 0.68);
  c.lineTo(x + size, y - size * 0.15);
  c.lineTo(x + size * 0.8, y + size * 0.4);
  c.lineTo(x - size * 0.6, y + size * 0.5);
  c.closePath();
  c.fill();
  stroke(
    c,
    [
      [x - size * 0.65, y - size * 0.45],
      [x + size * 0.25, y - size * 0.57],
      [x + size * 0.7, y - size * 0.2],
    ],
    '#d4c8a1',
    1.2,
  );
  ellipse(
    c,
    x - size * 0.4,
    y - size * 0.2,
    size * 0.36,
    size * 0.16,
    '#748147',
  );
}
function fern(c: Context, x: number, y: number, size: number) {
  for (let j = -2; j <= 2; j++) {
    const dx = j * size * 0.3,
      dy = -size * (1 - Math.abs(j) * 0.16);
    stroke(
      c,
      [
        [x, y],
        [x + dx, y + dy],
      ],
      '#536c35',
      0.8,
    );
    for (let k = 1; k <= 4; k++) {
      const t = k / 5;
      ellipse(
        c,
        x + dx * t - 1.3,
        y + dy * t,
        2.4 * (1 - t) + 0.5,
        0.8,
        '#8b9b4f',
      );
      ellipse(
        c,
        x + dx * t + 1.3,
        y + dy * t + 1,
        2 * (1 - t) + 0.5,
        0.8,
        '#647f3f',
      );
    }
  }
}

export function drawWoodlandForage(w: World, g: Phaser.GameObjects.Graphics) {
  g.clear();
  for (let i = 0; i < w.cells.length; i++) {
    const cell = w.cells[i];
    if (cell.kind !== 'grass' || !cell.forage || cell.ford) continue;
    const x = (i % W) * TILE,
      y = Math.floor(i / W) * TILE,
      lush = cell.food > 12;
    g.fillStyle(lush ? 0x4f713a : 0x9b8555, 0.3).fillEllipse(
      x + 12,
      y + 14,
      23,
      15,
    );
    for (let k = 0; k < 6; k++) {
      const px = x + 4 + woodlandNoise(i, k) * 16,
        py = y + 7 + woodlandNoise(k, i) * 12;
      g.lineStyle(1, lush ? 0xb1ba6c : 0x9a8054, 0.9)
        .lineBetween(px - 2, py, px - 3, py - (lush ? 4 : 1))
        .lineBetween(px, py + 1, px + 1, py - (lush ? 6 : 1));
      if (cell.food > 40)
        g.fillStyle(0xd1c888, 0.85).fillEllipse(px + 1, py - 5, 3, 2);
    }
  }
}

/** Static ground is rasterized once per topology, not once per food change or frame. */
export class WoodlandRenderer {
  private ground: Phaser.GameObjects.Image;
  private trees: {
    image: Phaser.GameObjects.Image;
    x: number;
    y: number;
    alpha: number;
  }[] = [];
  private water: Phaser.GameObjects.Graphics;
  private waterTiles: number[] = [];
  private topology = '';
  private lastWater = -1;
  private groundKey = 'woodland-ground';
  constructor(private scene: Phaser.Scene) {
    this.makeTrees();
    this.ground = scene.add.image(0, 0, '__WHITE').setOrigin(0).setDepth(-2);
    this.water = scene.add.graphics().setDepth(-0.5);
    scene.events.once('shutdown', () => {
      for (const key of [
        this.groundKey,
        ...Array.from({ length: 8 }, (_, i) => 'woodland-tree-' + i),
      ])
        if (scene.textures.exists(key)) scene.textures.remove(key);
    });
  }
  paint(w: World) {
    const key = woodlandTopology(w);
    if (key === this.topology) return;
    this.topology = key;
    const canvas = this.scene.textures.exists(this.groundKey)
      ? (this.scene.textures.get(
          this.groundKey,
        ) as Phaser.Textures.CanvasTexture)
      : this.scene.textures.createCanvas(this.groundKey, W * TILE, H * TILE)!;
    const c = canvas.context;
    c.clearRect(0, 0, W * TILE, H * TILE);
    this.waterTiles = [];
    c.fillStyle = '#75854b';
    c.fillRect(0, 0, W * TILE, H * TILE);
    // Large overlapping washes break up the grid without implying unwalkable terrain.
    for (let y = 0; y < H * TILE; y += 65)
      for (let x = 0; x < W * TILE; x += 65) {
        const n = woodlandNoise(x, y),
          r = 90 + n * 65;
        const wash = c.createRadialGradient(x, y, 0, x, y, r);
        wash.addColorStop(0, n > 0.5 ? '#d4b95a35' : '#244e3638');
        wash.addColorStop(1, '#75854b00');
        c.fillStyle = wash;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
    for (let i = 0; i < w.cells.length; i++) {
      const cell = w.cells[i],
        tx = i % W,
        ty = Math.floor(i / W),
        x = tx * TILE,
        y = ty * TILE,
        n = woodlandNoise(tx, ty);
      if (cell.kind === 'water' || cell.ford) {
        c.fillStyle = '#386d68';
        c.fillRect(x, y, TILE, TILE);
        for (let k = 0; k < 12; k++) {
          const px = x + woodlandNoise(i, k, 1) * 24,
            py = y + woodlandNoise(i, k, 2) * 24;
          ellipse(
            c,
            px,
            py,
            2 + woodlandNoise(i, k, 3) * 4,
            1,
            ['#6e9e864b', '#b9ba7e35', '#183f4838'][k % 3],
          );
        }
        if (cell.kind === 'water') this.waterTiles.push(i);
      } else {
        for (let k = 0; k < 18; k++) {
          const px = x + woodlandNoise(i, k, 4) * 24,
            py = y + woodlandNoise(i, k, 5) * 24;
          ellipse(
            c,
            px,
            py,
            0.6 + woodlandNoise(i, k, 6) * 2,
            0.5,
            ['#b7ad595e', '#3e653b50', '#d0ba6b45', '#8fa05a75'][k % 4],
          );
        }
        if (cell.kind === 'tree') {
          ellipse(c, x + 18, y + 19, 26, 13, '#213e3435');
          ellipse(c, x + 17, y + 18, 18, 10, '#213e3428');
        }
      }
      if (cell.ford) {
        stone(c, x + 6, y + 8, 7, n);
        stone(c, x + 18, y + 17, 8, 1 - n);
        continue;
      }
      if (cell.kind === 'water') continue;
      // Scalloped shoreline stays on the dry side of each real water boundary.
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ])
        if (
          tx + dx >= 0 &&
          ty + dy >= 0 &&
          tx + dx < W &&
          ty + dy < H &&
          w.cell(tx + dx, ty + dy).kind === 'water'
        ) {
          const bx = x + 12 + dx * 12,
            by = y + 12 + dy * 12;
          for (let j = -10; j <= 10; j += 4) {
            const px = bx + (dy ? j : 0) - dx * 2,
              py = by + (dx ? j : 0) - dy * 2;
            ellipse(c, px, py, dy ? 4 : 5, dx ? 4 : 5, '#b5a071');
            ellipse(c, px - dx * 4, py - dy * 4, 4, 3, '#8f8d50');
          }
          if (n > 0.55) stone(c, bx - dx * 7, by - dy * 7, 3 + n * 3, n);
          if (n < 0.35) fern(c, bx - dx * 9, by - dy * 9, 9);
        }
      if (cell.kind === 'grass' && !cell.forage && n > 0.9)
        fern(c, x + 12, y + 18, 6 + n * 4);
      if (cell.kind === 'grass' && !cell.forage && n < 0.065) {
        for (let k = 0; k < 3; k++) {
          const fx = x + 6 + k * 4,
            fy = y + 8 + woodlandNoise(i, k) * 10;
          stroke(
            c,
            [
              [fx, fy + 3],
              [fx, fy - 1],
            ],
            '#687b3c',
            0.7,
          );
          ellipse(c, fx, fy - 1, 1.7, 1.2, k % 2 ? '#ded4a0' : '#c4a94e');
        }
      }
    }
    // Faint worn approaches lead to crossings; they are decorative, not new routes.
    for (let i = 0; i < w.cells.length; i++)
      if (w.cells[i].ford) {
        const tx = i % W,
          ty = Math.floor(i / W);
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ])
          for (let j = 1; j <= 3; j++) {
            const x = tx + dx * j,
              y = ty + dy * j,
              cell = w.cell(x, y);
            if (
              x < 0 ||
              y < 0 ||
              x >= W ||
              y >= H ||
              cell.kind !== 'grass' ||
              cell.ford ||
              cell.forage
            )
              break;
            ellipse(
              c,
              x * TILE + 12,
              y * TILE + 12,
              dx ? 15 : 6,
              dy ? 15 : 6,
              `rgba(181,153,97,${0.24 / j})`,
            );
          }
      }
    // Small pools of sunlight under each canopy keep the clearing softly lit.
    for (let i = 0; i < w.cells.length; i++)
      if (w.cells[i].kind === 'tree')
        for (let k = 0; k < 6; k++) {
          const x = (i % W) * TILE + woodlandNoise(i, k, 20) * 42 - 10,
            y = Math.floor(i / W) * TILE + woodlandNoise(k, i, 21) * 30;
          if (w.cell(x / TILE, y / TILE).kind === 'grass')
            ellipse(c, x, y, 2 + woodlandNoise(i, k, 22) * 5, 1.5, '#edcf7535');
        }
    canvas.refresh();
    this.ground.setTexture(this.groundKey);
    for (const tree of this.trees) tree.image.destroy();
    this.trees = [];
    for (let i = 0; i < w.cells.length; i++)
      if (w.cells[i].kind === 'tree') {
        const x = ((i % W) + 0.5) * TILE,
          y = (Math.floor(i / W) + 0.8) * TILE,
          variant = Math.floor(woodlandNoise(i, 0) * 8),
          image = this.scene.add
            .image(x, y, 'woodland-tree-' + variant)
            .setOrigin(0.5, 0.88)
            .setDepth(y);
        this.trees.push({ image, x, y, alpha: 1 });
      }
    this.lastWater = -1;
  }
  update(w: World, selected?: { x: number; y: number }) {
    // Only the selected animal's nearby crowns fade, keeping it inspectable.
    for (const tree of this.trees) {
      const hidden =
          selected &&
          Math.abs(selected.x * TILE - tree.x) < 27 &&
          selected.y * TILE < tree.y &&
          selected.y * TILE > tree.y - 65,
        alpha = hidden ? 0.45 : 1;
      if (alpha !== tree.alpha) {
        tree.image.setAlpha(alpha);
        tree.alpha = alpha;
      }
    }
    const tick = Math.floor(w.time * 8);
    if (tick === this.lastWater) return;
    this.lastWater = tick;
    const g = this.water;
    g.clear();
    for (const i of this.waterTiles) {
      if (i % 3) continue;
      const phase = (tick / 32 + woodlandNoise(i, 1)) % 1,
        x = (i % W) * TILE + 4 + woodlandNoise(i, 2) * 10,
        y = Math.floor(i / W) * TILE + 4 + phase * 15;
      g.lineStyle(0.8, 0xbad3ad, Math.sin(phase * Math.PI) * 0.32).lineBetween(
        x,
        y,
        x + 5 + woodlandNoise(i, 3) * 6,
        y - 0.7,
      );
    }
  }
  private makeTrees() {
    for (let v = 0; v < 8; v++) {
      const key = 'woodland-tree-' + v;
      if (this.scene.textures.exists(key)) continue;
      const t = this.scene.textures.createCanvas(key, 88, 100)!,
        c = t.context,
        pine = v % 3 === 0;
      stroke(
        c,
        [
          [32, 89],
          [43, 78],
          [56, 88],
        ],
        '#51492f',
        5,
      );
      stroke(
        c,
        [
          [43, 87],
          [45, 40],
        ],
        '#58492e',
        9,
      );
      stroke(
        c,
        [
          [42, 84],
          [43, 38],
        ],
        '#a08048',
        3,
      );
      if (pine) {
        for (let tier = 0; tier < 5; tier++) {
          const y = 15 + tier * 12,
            r = 9 + tier * 4.7;
          c.fillStyle = ['#294c3b', '#365c40', '#456a43'][tier % 3];
          c.beginPath();
          c.moveTo(44, y - 13);
          c.lineTo(44 + r, y + 15);
          c.lineTo(44 + 6, y + 11);
          c.lineTo(44, y + 17);
          c.lineTo(44 - r, y + 14);
          c.closePath();
          c.fill();
          for (let k = 0; k < 22; k++) {
            const px = 44 + (woodlandNoise(v, k, tier) - 0.5) * r * 1.5,
              py = y + woodlandNoise(k, v, tier) * 10;
            stroke(
              c,
              [
                [px, py],
                [px - 3, py + 2],
              ],
              k % 2 ? '#71804d' : '#496e44',
              1,
            );
          }
        }
      } else {
        stroke(
          c,
          [
            [44, 65],
            [25, 40],
            [18, 30],
          ],
          '#695435',
          5,
        );
        stroke(
          c,
          [
            [44, 61],
            [61, 38],
            [67, 24],
          ],
          '#695435',
          4,
        );
        for (let layer = 0; layer < 3; layer++)
          for (let k = 0; k < 26; k++) {
            const a = woodlandNoise(v, k, layer) * Math.PI * 2,
              r =
                Math.sqrt(woodlandNoise(k, v, layer + 4)) *
                (layer === 2 ? 24 : 31),
              x = 44 + Math.cos(a) * r,
              y = 37 + Math.sin(a) * r * 0.72 - layer * 4;
            ellipse(
              c,
              x,
              y,
              8 + woodlandNoise(v, k, 9) * 6,
              6 + woodlandNoise(k, v, 9) * 5,
              ['#385738', '#647a3d', '#8b9145'][layer],
            );
          }
        for (let k = 0; k < 170; k++) {
          const a = woodlandNoise(v, k, 13) * Math.PI * 2,
            r = Math.sqrt(woodlandNoise(k, v, 14)) * 31,
            x = 43 + Math.cos(a) * r,
            y = 32 + Math.sin(a) * r * 0.73;
          ellipse(
            c,
            x,
            y,
            1.5 + woodlandNoise(v, k, 15) * 3,
            1.1 + woodlandNoise(k, v, 15) * 1.6,
            ['#b4ac56', '#c8b35c', '#627b3f', '#899547', '#4e6837'][k % 5],
          );
        }
      }
      fern(c, 35, 88, 9);
      t.refresh();
    }
  }
}
