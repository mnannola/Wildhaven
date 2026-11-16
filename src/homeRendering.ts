import type Phaser from 'phaser';
import type { World } from './sim';
import { TILE } from './sim';
import type { Home } from './homes';

export function drawHomeMarkers(w: World, g: Phaser.GameObjects.Graphics) {
  g.clear();
  for (const h of w.homes) {
    const x = h.x * TILE,
      y = h.y * TILE,
      alpha = h.abandonedAt === undefined ? 1 : 0.35;
    g.fillStyle(0x263c28, 0.2 * alpha).fillEllipse(x, y + 5, 30, 13);
    if (h.kind === 'deer-gathering') {
      g.fillStyle(0xa28e5f, 0.55 * alpha).fillEllipse(x, y + 2, 23, 13);
      g.lineStyle(1, 0xb9b080, 0.7 * alpha);
      for (let i = 0; i < 5; i++)
        g.lineBetween(x - 8 + i * 4, y + 2, x - 5 + i * 4, y + 5);
      g.fillStyle(0x738a4b, alpha)
        .fillRect(x - 13, y - 1, 2, 6)
        .fillRect(x + 10, y - 3, 2, 6);
    } else {
      const bear = h.kind === 'bear-den';
      g.fillStyle(0x9b8656, 0.35 * alpha).fillEllipse(x + 1, y + 8, 38, 19);
      g.fillStyle(bear ? 0x777963 : 0x715b3c, alpha).fillEllipse(
        x,
        y - 3,
        bear ? 38 : 34,
        28,
      );
      g.fillStyle(0xa6a17a, 0.8 * alpha).fillEllipse(x - 5, y - 11, 23, 10);
      g.fillStyle(0x4b5037, alpha).fillEllipse(x + 2, y, 25, 21);
      g.fillStyle(0x202c23, alpha).fillEllipse(x + 2, y + 2, 20, 17);
      g.fillStyle(0x121f1b, 0.65 * alpha).fillEllipse(x + 3, y, 14, 11);
      g.fillStyle(0x86704b, alpha).fillEllipse(x + 2, y + 9, 19, 4);
      for (let i = 0; i < 7; i++) {
        const dx = -14 + i * 4;
        g.fillStyle(i % 2 ? 0x748245 : 0x91a052, 0.9 * alpha).fillEllipse(
          x + dx,
          y - 11 - Math.sin(i) * 2,
          8,
          4,
        );
      }
      if (!bear) {
        for (const side of [-1, 1]) {
          g.lineStyle(3, 0x53452f, alpha)
            .beginPath()
            .moveTo(x + side * 5, y - 14)
            .lineTo(x + side * 13, y - 5)
            .lineTo(x + side * 12, y + 4)
            .lineTo(x + side * 19, y + 10)
            .strokePath();
          g.lineStyle(1, 0xb39a63, 0.8 * alpha).lineBetween(
            x + side * 6,
            y - 13,
            x + side * 13,
            y - 5,
          );
        }
      }
      for (let i = 0; i < 5; i++)
        g.fillStyle(i % 2 ? 0xb2a481 : 0x6a7546, 0.8 * alpha).fillEllipse(
          x - 13 + i * 6,
          y + 11 + (i % 2) * 2,
          3,
          2,
        );
    }
  }
}

export function drawHomeRange(
  h: Home,
  g: Phaser.GameObjects.Graphics,
  range: boolean,
) {
  const color =
      h.species === 'wolf'
        ? 0xa3bec6
        : h.species === 'bear'
          ? 0xc4a178
          : 0xd4c58b,
    x = h.x * TILE,
    y = h.y * TILE;
  g.lineStyle(2, color, 0.85).strokeEllipse(x, y + 3, 35, 25);
  if (range && h.abandonedAt === undefined) {
    g.lineStyle(1, color, 0.35).strokeCircle(x, y, h.radius * TILE);
    if (h.species !== 'deer')
      g.lineStyle(1, color, 0.16).strokeCircle(x, y, h.radius * 0.4 * TILE);
  }
}
