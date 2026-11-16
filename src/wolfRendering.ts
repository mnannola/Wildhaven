import type Phaser from 'phaser';
import { detailedGraphics } from './deerRendering';
export const WOLF_TEXTURE_SCALE = 3;
export const wolfPoses = [
  'wolf',
  'wolf-sleep',
  ...['walk', 'run', 'sniff', 'search', 'attack'].flatMap((a) =>
    Array.from({ length: 8 }, (_, i) => `wolf-${a}-${i}`),
  ),
  ...['alert', 'sniff', 'search'].flatMap((a) =>
    Array.from({ length: 8 }, (_, i) => `wolf-${a}-idle-${i}`),
  ),
  ...['drink', 'feed'].flatMap((a) =>
    Array.from({ length: 6 }, (_, i) => `wolf-${a}-${i}`),
  ),
  ...['court', 'nurse', 'nurse-mother', 'wait', 'rest'].flatMap((a) =>
    Array.from({ length: 8 }, (_, i) => `wolf-family-${a}-${i}`),
  ),
  ...Array.from({ length: 6 }, (_, i) => `wolf-collapse-${i}`),
  ...Array.from({ length: 4 }, (_, i) => `wolf-carcass-${i}`),
];

export function makeWolfTextures(scene: {
  make: {
    graphics: (config: { x: number; y: number }) => Phaser.GameObjects.Graphics;
  };
  textures?: {
    exists: (key: string) => boolean;
    remove: (key: string) => unknown;
  };
}) {
  for (const pose of wolfPoses)
    for (const pup of [false, true]) {
      const key = pose + (pup ? '-pup' : '');
      if (scene.textures?.exists(key)) scene.textures.remove(key);
      const g = detailedGraphics(scene.make.graphics({ x: 0, y: 0 })),
        frame = Number(pose.match(/-(\d+)$/)?.[1] ?? 0),
        phase = (frame / 8) * Math.PI * 2;
      const sleep = pose === 'wolf-sleep',
        rest = sleep || pose.includes('family-rest'),
        dead = pose.includes('carcass'),
        collapse = pose.includes('collapse'),
        fallen = dead || collapse,
        drop = dead ? 1 : collapse ? frame / 5 : 0;
      const run = pose.includes('-run-'),
        moving = /wolf-(walk|run|sniff|search)-\d/.test(pose),
        low = /drink|feed|sniff/.test(pose),
        attack = pose.includes('attack'),
        nurse = pose.includes('family-nurse-'),
        court = pose.includes('family-court'),
        alert = pose.includes('alert') || pose.includes('wait');
      const by = rest
          ? 22
          : 16 +
            (moving ? Math.sin(phase * 2) * (run ? 0.7 : 0.2) : 0) +
            drop * 6,
        fur = pup ? 0x827a68 : 0x8b8d7b,
        dark = 0x474e48,
        cream = 0xd1ccb0;
      const line = (points: number[][], color: number, width: number) => {
        g.lineStyle(width, color);
        for (let i = 1; i < points.length; i++)
          g.beginPath()
            .moveTo(...(points[i - 1] as [number, number]))
            .lineTo(...(points[i] as [number, number]))
            .strokePath();
        g.fillStyle(color);
        for (const [x, y] of points) g.fillCircle(x, y, width / 2);
      };
      g.fillStyle(0x1c3025, 0.2).fillEllipse(18, 29, 31, 6);
      const leg = (hip: number, front: boolean, near: boolean) => {
        const a =
            phase + (front ? 0 : Math.PI) + (near ? 0 : run ? 0.8 : Math.PI),
          swing = moving ? Math.sin(a) * (run ? 5 : 2.5) : 0,
          lift = moving ? Math.max(0, Math.cos(a)) * (run ? 4 : 1.5) : 0,
          knee = hip + (front ? -1 : 2) + swing * 0.35,
          foot = hip + swing;
        line(
          [
            [hip, by + 2],
            [knee, 23],
          ],
          near ? fur : dark,
          near ? 2.3 : 1.8,
        );
        line(
          [
            [knee, 23],
            [foot, 28 - lift],
          ],
          near ? 0xb3ae94 : 0x777c6b,
          1.4,
        );
        g.fillStyle(near ? cream : 0x797e6e).fillEllipse(
          foot + 0.5,
          29 - lift,
          3.2,
          1.6,
        );
      };
      if (rest) {
        line(
          [
            [7, 26],
            [15, 27],
            [27, 27],
          ],
          dark,
          3,
        );
        line(
          [
            [8, 22],
            [3, 23],
            [5, 27],
            [16, 28],
          ],
          dark,
          4,
        );
      } else if (fallen) {
        line(
          [
            [11, by],
            [5, 29],
          ],
          dark,
          2,
        );
        line(
          [
            [24, by],
            [32, 29],
          ],
          dark,
          2,
        );
      } else {
        leg(10, false, false);
        leg(24, true, false);
        line(
          [
            [7, by],
            [3, by + 5],
            [2, by + 9],
          ],
          dark,
          pup ? 3 : 4,
        );
        line(
          [
            [6, by + 1],
            [3, by + 5],
          ],
          fur,
          2.8,
        );
      }
      if (!dead || frame < 3) {
        g.fillStyle(dark).fillEllipse(17, by + 1, 25, 10);
        g.fillStyle(fur).fillEllipse(17, by, 25, 9);
        g.fillStyle(0xadb09a, 0.45).fillEllipse(16, by - 1.8, 20, 4);
        g.fillStyle(cream, 0.8).fillEllipse(19, by + 3, 17, 2.2);
        g.fillStyle(fur)
          .fillEllipse(9, by, 7, 9)
          .fillEllipse(25, by - 1, 7, 11);
        for (let k = 0; k < 40; k++) {
          const x = 6 + (k % 20) * 1.05,
            y = by - 3 + (k % 5) * 1.05;
          line(
            [
              [x, y],
              [x + 1.2, y + 0.4],
            ],
            k % 3 === 0 ? 0xbcbc9f : k % 3 === 1 ? 0x5f6860 : 0x9c9c85,
            0.28,
          );
        }
        if (!rest && !fallen) {
          leg(10, false, true);
          leg(24, true, true);
        }
        const hx = rest
            ? 26
            : fallen
              ? 29
              : low
                ? 29
                : attack
                  ? 28 + (frame >= 3 && frame <= 5 ? 1 : 0)
                  : 27,
          hy = rest
            ? 23
            : fallen
              ? 12 + drop * 13
              : low
                ? 24
                : alert
                  ? 9
                  : pup
                    ? 12
                    : 11;
        line(
          [
            [24, by],
            [hx - 2, hy + 2],
          ],
          fur,
          pup ? 5 : 6,
        );
        line(
          [
            [25, by + 3],
            [hx, hy + 3],
          ],
          cream,
          2.2,
        );
        // Neck ruff and long wedge muzzle distinguish wolves from the deer silhouettes.
        for (let k = 0; k < 5; k++)
          g.fillStyle(k % 2 ? fur : 0xa3a48e).fillTriangle(
            23,
            by - 4 + k * 1.7,
            20,
            by - 3 + k * 1.7,
            25,
            by + k * 1.7,
          );
        g.fillStyle(fur).fillEllipse(hx, hy, pup ? 8 : 7, pup ? 6.7 : 6);
        line(
          [
            [hx + 1, hy + 1],
            [hx + 6, hy + 3],
          ],
          fur,
          3.3,
        );
        line(
          [
            [hx + 1, hy + 3],
            [hx + 6, hy + 3.7],
          ],
          cream,
          1.4,
        );
        g.fillStyle(dark)
          .fillTriangle(
            hx - 3,
            hy - 1,
            hx - 2.5,
            hy - (pup ? 5 : 6),
            hx,
            hy - 2,
          )
          .fillTriangle(hx + 1, hy - 2, hx + 3, hy - (pup ? 5 : 6), hx + 4, hy);
        g.fillStyle(0xb1a88f).fillTriangle(
          hx - 2.4,
          hy - 2,
          hx - 2.3,
          hy - 4.7,
          hx - 1,
          hy - 2,
        );
        g.fillStyle(cream, 0.8).fillEllipse(hx + 1.8, hy + 1, 4, 2);
        if (sleep || fallen)
          line(
            [
              [hx + 1, hy],
              [hx + 2.7, hy + 0.4],
            ],
            dark,
            0.6,
          );
        else {
          line(
            [
              [hx + 0.7, hy - 0.7],
              [hx + 2.5, hy - 0.5],
            ],
            dark,
            0.5,
          );
          g.fillStyle(0xcbb66a).fillCircle(hx + 1.9, hy, 0.7);
          g.fillStyle(0x222e28).fillCircle(hx + 2.1, hy, 0.4);
        }
        g.fillStyle(0x27332d).fillEllipse(hx + 6.3, hy + 2.9, 2, 1.6);
        if (attack && frame >= 2 && frame <= 5) {
          line(
            [
              [hx + 2, hy + 4],
              [hx + 6, hy + 5],
            ],
            0x26302a,
            1.8,
          );
          g.fillStyle(0xf1e5c9).fillTriangle(
            hx + 3,
            hy + 3.5,
            hx + 3.5,
            hy + 4.9,
            hx + 4.1,
            hy + 3.7,
          );
        }
        if (nurse)
          line(
            [
              [hx + 4, hy + 4],
              [hx + 5, hy + 4.5],
            ],
            cream,
            0.8,
          );
        if (court && frame >= 3 && frame <= 4)
          line(
            [
              [hx + 6, hy + 4],
              [hx + 7, hy + 4.5],
            ],
            0xba8a7b,
            0.7,
          );
      }
      if (dead && frame >= 1) {
        line(
          [
            [8, 24],
            [25, 24],
          ],
          0xc7bea1,
          1,
        );
        for (let i = 0; i < 5; i++)
          line(
            [
              [11 + i * 2, 24],
              [10 + i * 2, 26],
            ],
            0xc7bea1,
            0.8,
          );
        if (frame === 3) g.fillStyle(0xd4c9ad).fillEllipse(29, 26, 6, 4);
      }
      g.generateTexture(key, 40, 34);
      g.destroy();
    }
}
