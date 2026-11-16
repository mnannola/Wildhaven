import { World, W, TILE } from '../src/sim';
import { paintWater, drawRiver, riverFlow } from '../src/riverRendering';
import { writeFileSync, mkdirSync } from 'node:fs';
import type Phaser from 'phaser';
const calls: unknown[][] = [],
  w = new World(4721);
let style = '';
const c = {
  set fillStyle(value: string) {
    style = value;
  },
  fillRect(...args: number[]) {
    const rgb = style.match(/\d+/g)!.map(Number);
    calls.push(
      ['fillStyle', (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]],
      ['fillRect', ...args],
    );
  },
};
paintWater(c as unknown as CanvasRenderingContext2D, w);
for (let i = 0; i < w.cells.length; i++)
  if (w.cells[i].ford) {
    const x = (i % W) * TILE,
      y = Math.floor(i / W) * TILE;
    calls.push(
      ['fillStyle', 0x9b987c],
      ['fillEllipse', x + 6, y + 8, 14, 8],
      ['fillEllipse', x + 18, y + 17, 16, 9],
    );
  }
let g: Phaser.GameObjects.Graphics;
g = new Proxy(
  {},
  {
    get:
      (_, key) =>
      (...args: unknown[]) => {
        calls.push([key, ...args]);
        return g;
      },
  },
) as Phaser.GameObjects.Graphics;
drawRiver(g, riverFlow(w), 2);
mkdirSync('performance-results', { recursive: true });
writeFileSync(
  'performance-results/water-draw-commands.json',
  JSON.stringify({ water: calls }),
);
