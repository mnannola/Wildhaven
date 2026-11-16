import type Phaser from 'phaser';
import { detailedGraphics } from './deerRendering';
export const BEAR_TEXTURE_SCALE = 3;
export const bearPoses = [
  'bear',
  'bear-sleep',
  ...Array.from({ length: 16 }, (_, i) => `bear-idle-${i}`),
  ...['walk', 'run', 'sniff', 'search', 'attack', 'fish', 'catch'].flatMap(
    (a) =>
      Array.from(
        { length: ['walk', 'run', 'sniff', 'search'].includes(a) ? 16 : 8 },
        (_, i) => `bear-${a}-${i}`,
      ),
  ),
  ...['alert', 'sniff', 'search'].flatMap((a) =>
    Array.from({ length: 8 }, (_, i) => `bear-${a}-idle-${i}`),
  ),
  ...['drink', 'feed'].flatMap((a) =>
    Array.from({ length: 6 }, (_, i) => `bear-${a}-${i}`),
  ),
  ...['court', 'nurse', 'nurse-mother', 'wait', 'rest'].flatMap((a) =>
    Array.from({ length: 8 }, (_, i) => `bear-family-${a}-${i}`),
  ),
  ...Array.from({ length: 6 }, (_, i) => `bear-collapse-${i}`),
  ...Array.from({ length: 4 }, (_, i) => `bear-carcass-${i}`),
];

export function makeBearTextures(scene: {
  make: {
    graphics: (config: { x: number; y: number }) => Phaser.GameObjects.Graphics;
  };
  textures?: {
    exists: (key: string) => boolean;
    remove: (key: string) => unknown;
  };
}) {
  for (const pose of bearPoses)
    for (const cub of [false, true]) {
      const key = pose + (cub ? '-cub' : '');
      if (scene.textures?.exists(key)) scene.textures.remove(key);
      const g = detailedGraphics(scene.make.graphics({ x: 0, y: 0 })),
        frame = Number(pose.match(/-(\d+)$/)?.[1] ?? 0),
        phase =
          (frame /
            (/bear-(walk|run|sniff|search)-\d|bear-idle-/.test(pose)
              ? 16
              : 8)) *
          Math.PI *
          2;
      const sleep = pose === 'bear-sleep',
        rest = sleep || pose.includes('family-rest'),
        dead = pose.includes('carcass'),
        collapse = pose.includes('collapse'),
        fallen = dead || collapse,
        drop = dead ? 1 : collapse ? frame / 5 : 0;
      const run = pose.includes('-run-'),
        moving = /bear-(walk|run|sniff|search)-\d/.test(pose),
        low = /drink|feed|sniff/.test(pose),
        attack = pose.includes('attack'),
        fishing = pose.includes('-fish-'),
        caught = pose.includes('-catch-'),
        raised = pose.includes('alert') || pose.includes('wait');
      const idle = pose.includes('bear-idle-'),
        shoulder = moving
          ? Math.sin(phase + 0.5) * (run ? 1 : 0.65)
          : idle
            ? Math.sin(phase) * 0.18
            : 0;
      const by = rest
          ? 23
          : 17 +
            (moving
              ? Math.sin(phase * 2) * (run ? 1 : 0.45)
              : idle
                ? Math.sin(phase) * 0.18
                : 0) +
            drop * 6,
        fur = cub ? 0x765237 : 0x89623f,
        dark = 0x4a3628,
        light = cub ? 0xad8454 : 0xbe985e;
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
      g.fillStyle(0x1b3024, 0.23).fillEllipse(22, 32, 38, 7);
      const paw = (x: number, y: number, near: boolean) => {
        g.fillStyle(near ? 0x5d432e : dark).fillEllipse(x, y, 6, 3.4);
        for (let k = 0; k < 3; k++)
          line(
            [
              [x + 1 + k * 0.8, y + 0.3],
              [x + 1.7 + k * 0.8, y + 1.2],
            ],
            near ? 0xd3ba88 : 0x8c7858,
            0.4,
          );
      };
      const leg = (hip: number, front: boolean, near: boolean) => {
        const a =
            phase +
            (front ? 0 : run ? 2.2 : Math.PI * 0.65) +
            (near ? 0 : run ? 0.6 : Math.PI),
          cycle = (((a / (Math.PI * 2)) % 1) + 1) % 1,
          stance = cycle < 0.72,
          swing = moving
            ? run
              ? Math.sin(a) * 4.8
              : stance
                ? 2.6 - (cycle / 0.72) * 5.2
                : -2.6 + ((cycle - 0.72) / 0.28) * 5.2
            : 0,
          lift = moving
            ? run
              ? Math.max(0, Math.cos(a)) * 3.8
              : stance
                ? 0
                : Math.sin(((cycle - 0.72) / 0.28) * Math.PI) * 2
            : 0;
        line(
          [
            [hip, by + 2],
            [hip + swing * 0.4, 26 - lift * 0.35],
            [hip + swing, 30 - lift],
          ],
          near ? fur : dark,
          near ? 5 : 4,
        );
        paw(hip + swing + 1, 31 - lift, near);
      };
      if (rest) {
        g.fillStyle(dark).fillEllipse(22, 29, 31, 7);
        paw(29, 31, true);
      } else if (fallen) {
        line(
          [
            [12, by],
            [5, 32],
          ],
          dark,
          4,
        );
        line(
          [
            [29, by],
            [39, 32],
          ],
          dark,
          4,
        );
      } else {
        leg(11, false, false);
        leg(29, true, false);
      }
      if (!dead || frame < 3) {
        g.fillStyle(dark).fillEllipse(20, by + 1, 34, 20);
        g.fillStyle(fur).fillEllipse(20, by, 34, 19);
        // Grizzlies carry a pronounced muscular shoulder; cubs are rounder and lower.
        g.fillStyle(fur).fillEllipse(
          27,
          by - (cub ? 1.5 : 3) + shoulder,
          cub ? 15 : 17,
          cub ? 14 : 16,
        );
        for (let k = 0; k < 6; k++)
          g.fillStyle(light, 0.07).fillEllipse(
            21,
            by - 3 - k * 0.5,
            29 - k * 2.6,
            13 - k * 1.5,
          );
        g.fillStyle(dark, 0.28).fillEllipse(20, by + 5, 26, 6);
        for (let k = 0; k < 65; k++) {
          const x = 7 + (((k * 17) % 61) / 61) * 25,
            y = by - 5 + (((k * 23) % 67) / 67) * 10;
          line(
            [
              [x, y],
              [x + 0.7, y + 1.2],
            ],
            k % 4 === 0 ? light : k % 4 === 1 ? 0x62452f : fur,
            0.3,
          );
        }
        if (!rest && !fallen) {
          leg(10, false, true);
          if (!attack && !fishing && !caught) leg(29, true, true);
        }
        const hx = rest
            ? 32
            : fallen
              ? 34
              : low || fishing
                ? 34
                : raised
                  ? 33
                  : 34,
          hy = rest
            ? 25
            : fallen
              ? 13 + drop * 14
              : low || fishing
                ? 23
                : raised
                  ? 11
                  : caught
                    ? 18
                    : 16 + shoulder * 0.5;
        line(
          [
            [30, by],
            [hx - 2, hy + 2],
          ],
          fur,
          cub ? 8 : 9,
        );
        g.fillStyle(fur).fillEllipse(hx, hy, cub ? 12 : 11, cub ? 12 : 11);
        g.fillStyle(dark)
          .fillCircle(hx - 3, hy - 5, cub ? 2.4 : 2)
          .fillCircle(hx + 3, hy - 4.5, cub ? 2.2 : 1.8);
        g.fillStyle(light, 0.7)
          .fillCircle(hx - 3, hy - 5, 1.1)
          .fillCircle(hx + 3, hy - 4.5, 0.9);
        for (let k = 0; k < 12; k++)
          line(
            [
              [hx - 4 + k * 0.6, hy - 3 + (k % 3)],
              [hx - 3.7 + k * 0.6, hy - 2 + (k % 3)],
            ],
            k % 2 ? light : fur,
            0.25,
          );
        g.fillStyle(light).fillEllipse(hx + 4, hy + 3, 10, 6);
        g.fillStyle(0xd0ac75, 0.4).fillEllipse(hx + 4, hy + 2, 7, 2.4);
        if (sleep || fallen)
          line(
            [
              [hx + 1, hy],
              [hx + 3, hy + 0.4],
            ],
            0x302a22,
            0.7,
          );
        else {
          line(
            [
              [hx + 0.6, hy - 0.9],
              [hx + 2.8, hy - 0.7],
            ],
            dark,
            0.6,
          );
          g.fillStyle(0x221f1a).fillCircle(hx + 2, hy, 0.7);
          g.fillStyle(0xdccb9b).fillCircle(hx + 2.2, hy - 0.2, 0.2);
        }
        g.fillStyle(0x2c2922).fillEllipse(hx + 8, hy + 2.5, 3.2, 2.4);
        line(
          [
            [hx + 4, hy + 5],
            [hx + 7, hy + 5],
          ],
          dark,
          0.55,
        );
        if (attack || fishing || caught) {
          const strike = frame >= 3 && frame <= 5,
            px = attack
              ? strike
                ? 40
                : 30
              : caught
                ? 35
                : [29, 29, 30, 33, 38, 40, 36, 30][frame],
            py = attack
              ? strike
                ? 20
                : 14
              : caught
                ? 28
                : [29, 26, 20, 16, 23, 31, 31, 29][frame];
          line(
            [
              [28, by + 1],
              [px - 3, py - 3],
              [px, py],
            ],
            fur,
            5,
          );
          paw(px, py, true);
        }
        if (caught && frame < 6) {
          g.fillStyle(0xb8cfc0).fillEllipse(38, 29 + (frame % 2), 8, 2.5);
          g.fillStyle(0x6d9793).fillTriangle(34, 29, 31, 27, 31, 31);
          g.fillStyle(dark).fillCircle(40, 29, 0.35);
        }
      }
      if (dead && frame >= 1) {
        line(
          [
            [9, 26],
            [31, 27],
          ],
          0xc7bea1,
          1.3,
        );
        for (let i = 0; i < 6; i++)
          line(
            [
              [12 + i * 3, 26],
              [11 + i * 3, 30],
            ],
            0xc7bea1,
            1,
          );
        if (frame === 3) g.fillStyle(0xd4c9ad).fillEllipse(37, 30, 8, 5);
      }
      g.generateTexture(key, 46, 38);
      g.destroy();
    }
}
