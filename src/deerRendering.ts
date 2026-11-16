import type Phaser from 'phaser';
export const DEER_TEXTURE_SCALE = 3;

export function detailedGraphics(raw: Phaser.GameObjects.Graphics) {
  // Supersample the artwork while retaining the same world-space footprint.
  const proxy: Phaser.GameObjects.Graphics = new Proxy(raw, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        let scaled = args;
        if (
          [
            'fillEllipse',
            'fillCircle',
            'fillTriangle',
            'moveTo',
            'lineTo',
            'generateTexture',
          ].includes(String(key))
        )
          scaled = args.map((v) =>
            typeof v === 'number' ? v * DEER_TEXTURE_SCALE : v,
          );
        if (key === 'lineStyle')
          scaled = [Number(args[0]) * DEER_TEXTURE_SCALE, ...args.slice(1)];
        const result = value.apply(target, scaled);
        return result === target ? proxy : result;
      };
    },
  });
  return proxy;
}

export const deerPoses = [
  'deer',
  'deer-sleep',
  ...['walk', 'run', 'sniff', 'search'].flatMap((a) =>
    Array.from({ length: 8 }, (_, i) => `deer-${a}-${i}`),
  ),
  ...['alert', 'sniff', 'search'].flatMap((a) =>
    Array.from({ length: 8 }, (_, i) => `deer-${a}-idle-${i}`),
  ),
  ...['graze', 'drink'].flatMap((a) =>
    Array.from({ length: 6 }, (_, i) => `deer-${a}-${i}`),
  ),
  ...['court', 'nurse', 'nurse-mother', 'wait', 'rest'].flatMap((a) =>
    Array.from({ length: 8 }, (_, i) => `deer-family-${a}-${i}`),
  ),
  ...Array.from({ length: 6 }, (_, i) => `deer-collapse-${i}`),
  ...Array.from({ length: 4 }, (_, i) => `deer-carcass-${i}`),
];

// Shared anatomy keeps the appearance consistent across every existing behavior.
// Frames are generated once, with no drawing or random sampling during play.
export function makeDeerTextures(scene: {
  make: {
    graphics: (config: { x: number; y: number }) => Phaser.GameObjects.Graphics;
  };
  textures?: {
    exists: (key: string) => boolean;
    remove: (key: string) => unknown;
  };
}) {
  for (const pose of deerPoses)
    for (const form of ['buck', 'doe', 'fawn'] as const) {
      const key =
        pose +
        (form === 'buck'
          ? ''
          : form === 'doe'
            ? '-antlerless'
            : '-fawn-antlerless');
      if (scene.textures?.exists(key)) scene.textures.remove(key);
      const g = detailedGraphics(scene.make.graphics({ x: 0, y: 0 })),
        buck = form === 'buck',
        fawn = form === 'fawn',
        frame = Number(pose.match(/-(\d+)$/)?.[1] ?? 0),
        phase = (frame / 8) * Math.PI * 2;
      const sleeping = pose === 'deer-sleep',
        rest = sleeping || pose.includes('family-rest'),
        dead = pose.includes('carcass'),
        collapse = pose.includes('collapse'),
        fallen = dead || collapse,
        drop = dead ? 1 : collapse ? frame / 5 : 0;
      const run = pose.includes('-run-'),
        moving = /deer-(walk|run|sniff|search)-\d/.test(pose),
        low =
          pose.includes('graze') ||
          pose.includes('drink') ||
          pose.includes('sniff'),
        nurse = pose.includes('family-nurse-'),
        court = pose.includes('family-court');
      const bob = moving ? Math.sin(phase * 2) * (run ? 0.7 : 0.25) : 0,
        by = rest ? 21 : 14.5 + bob + drop * 7.5;
      const fur = fawn ? 0xc18a50 : buck ? 0xa77949 : 0xb78954,
        light = 0xd9b77d,
        shade = 0x765036;
      const line = (points: number[][], color: number, width: number) => {
        // Separate rounded segments avoid long miter spikes in folded necks and knees.
        g.lineStyle(width, color);
        for (let i = 1; i < points.length; i++)
          g.beginPath()
            .moveTo(points[i - 1][0], points[i - 1][1])
            .lineTo(points[i][0], points[i][1])
            .strokePath();
        g.fillStyle(color);
        for (const [x, y] of points) g.fillCircle(x, y, width / 2);
      };
      g.fillStyle(0x1c3025, 0.2).fillEllipse(18, 29, 29, 6);
      function leg(x: number, front: boolean, near: boolean) {
        const a = phase + (front ? 0 : Math.PI) + (near ? 0 : Math.PI),
          swing = moving ? Math.sin(a) * (run ? 5 : 2.5) : 0,
          lift = moving ? Math.max(0, Math.cos(a)) * (run ? 4 : 1.5) : 0;
        const foot = x + swing,
          knee = x + (front ? -0.6 : 2) + swing * 0.4;
        line(
          [
            [x, by + 2],
            [knee, 22 - drop * 2],
          ],
          near ? fur : shade,
          near ? 1.7 : 1.3,
        );
        line(
          [
            [knee, 22 - drop * 2],
            [foot, 29 - lift],
          ],
          near ? 0x9b744e : shade,
          near ? 1.05 : 0.85,
        );
        line(
          [
            [foot, 28.5 - lift],
            [foot + 1, 29 - lift],
          ],
          0x453b2d,
          1.2,
        );
      }
      if (rest)
        line(
          [
            [7, 26],
            [14, 27],
            [25, 27],
          ],
          shade,
          3,
        );
      else if (fallen) {
        line(
          [
            [10, by + 1],
            [6, 27],
            [3, 29],
          ],
          shade,
          2,
        );
        line(
          [
            [23, by + 1],
            [28, 28],
            [32, 29],
          ],
          shade,
          2,
        );
      } else {
        leg(10, false, false);
        leg(23, true, false);
      }
      if (!dead || frame < 3) {
        g.fillStyle(shade).fillEllipse(16, by + 0.7, 23, 9);
        g.fillStyle(fur).fillEllipse(16, by, 23, 8.5);
        for (let k = 0; k < 5; k++)
          g.fillStyle(light, 0.08).fillEllipse(
            14,
            by - 1.4 - k * 0.13,
            19 - k * 1.8,
            6 - k * 0.8,
          );
        g.fillStyle(0xd8c29b, 0.8).fillEllipse(17, by + 3, 15, 1.6);
        g.fillStyle(fur).fillEllipse(8, by, 6, 8).fillEllipse(24, by, 5, 8);
        // A short white underside, rather than a raised triangular flag at rest.
        line(
          [
            [5, by - 1],
            [3.1, by + 1.5],
            [3.6, by + 3],
          ],
          fur,
          1.8,
        );
        line(
          [
            [3.8, by],
            [3.1, by + 2.8],
          ],
          0xe5d8bc,
          1,
        );
        for (let k = 0; k < 34; k++) {
          const x = 7 + (k % 17) * 1.05,
            y = by - 2 + (k % 5) * 0.8;
          line(
            [
              [x, y],
              [x + 0.7, y + 0.3],
            ],
            k % 2 ? 0xc39a61 : 0x966a42,
            0.22,
          );
        }
        if (fawn)
          for (const [x, y] of [
            [8, -2],
            [12, -2.5],
            [16, -2],
            [20, -2],
            [10, 0],
            [14, 0.4],
            [18, 0.2],
            [22, 0],
          ])
            g.fillStyle(0xf5e3bd, 0.95).fillEllipse(x, by + y, 1.7, 1.2);
        if (!rest && !fallen) {
          leg(9, false, true);
          leg(23, true, true);
        }
        const hx = rest ? 24 : fallen ? 28 : low ? 29 : 26.5,
          hy = rest
            ? 21
            : fallen
              ? 11 + drop * 13
              : low
                ? 24 + (frame % 2) * 0.35
                : nurse
                  ? 15
                  : 9.8 + (court ? Math.sin(phase) * 0.7 : 0);
        line(
          rest || fallen || low
            ? [
                [23, by + 1],
                [hx - 1, hy + 2],
              ]
            : [
                [23, by + 1],
                [24, by - 3],
                [hx - 1, hy + 2],
              ],
          fur,
          buck ? 4.4 : 3.2,
        );
        line(
          [
            [25, by + 1],
            [hx, hy + 3],
          ],
          0xdcc59b,
          1.05,
        );
        g.fillStyle(fur).fillEllipse(hx, hy, 5.5, fawn ? 4.5 : 3.8);
        line(
          [
            [hx + 0.7, hy + 0.6],
            [hx + 4.5, hy + 2.1],
          ],
          fur,
          2.2,
        );
        line(
          [
            [hx + 2, hy + 2.3],
            [hx + 4.8, hy + 2.4],
          ],
          0xe7d5b0,
          0.7,
        );
        const tilt = low ? 2 : 0;
        line(
          [
            [hx - 1, hy - 1],
            [hx - 4.3, hy - 4 + tilt],
          ],
          shade,
          1.7,
        );
        line(
          [
            [hx + 1, hy - 1],
            [hx + 2.7, hy - 4.3 + tilt],
          ],
          shade,
          1.6,
        );
        line(
          [
            [hx - 1.5, hy - 1.8],
            [hx - 3.8, hy - 3.8 + tilt],
          ],
          0xd5b58c,
          0.8,
        );
        if (buck) {
          for (const side of [-1, 1]) {
            const ax = hx - 1 + side;
            line(
              [
                [ax, hy - 2],
                [ax + side * 1.5, hy - 4],
                [ax + side * 2.6, hy - 6],
                [ax + side * 3, hy - 9],
              ],
              0xcbb68b,
              0.8,
            );
            line(
              [
                [ax + side * 2, hy - 5],
                [ax + side * 4.5, hy - 6],
                [ax + side * 5.5, hy - 8],
              ],
              0xd7c59a,
              0.65,
            );
            line(
              [
                [ax + side * 2.5, hy - 7],
                [ax + side * 0.8, hy - 9],
              ],
              0xd7c59a,
              0.55,
            );
          }
        }
        if (sleeping || fallen)
          line(
            [
              [hx + 1, hy],
              [hx + 2.7, hy + 0.5],
            ],
            0x302c24,
            0.7,
          );
        else {
          g.fillStyle(0x292c23).fillCircle(hx + 1.7, hy, 0.75);
          g.fillStyle(0xf1e4c9).fillCircle(hx + 1.8, hy - 0.2, 0.2);
        }
        g.fillStyle(0x35342b).fillEllipse(hx + 4.9, hy + 2.1, 1.3, 1);
      }
      if (dead && frame >= 1) {
        line(
          [
            [8, 23],
            [25, 24],
          ],
          0xc7bea1,
          1,
        );
        for (let k = 0; k < 5; k++)
          line(
            [
              [11 + k * 2.3, 23],
              [10 + k * 2.3, 26],
            ],
            0xc7bea1,
            0.8,
          );
        if (frame === 3) g.fillStyle(0xd4c9ad).fillEllipse(29, 26, 6, 4);
      }
      if (dead && frame === 3 && buck) {
        line(
          [
            [28, 25],
            [25, 20],
            [23, 18],
          ],
          0xd7c59a,
          1,
        );
        line(
          [
            [25, 20],
            [28, 19],
            [29, 17],
          ],
          0xd7c59a,
          1,
        );
      }
      g.generateTexture(key, 36, 34);
      g.destroy();
    }
}
