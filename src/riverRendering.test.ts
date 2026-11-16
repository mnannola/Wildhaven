import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, W, H } from './sim';
import { riverFlow, drawRiver, drawLake, waterSplash } from './riverRendering';
import type Phaser from 'phaser';

test('lake ripples scatter across tile columns and remain deterministic on pause', () => {
  const w = new World(4721),
    tiles = w.cells.flatMap((c, i) =>
      c.kind === 'water' && c.river === undefined ? [i] : [],
    );
  const starts: number[][] = [];
  let g: Phaser.GameObjects.Graphics;
  g = new Proxy(
    {},
    {
      get:
        (_, method) =>
        (...args: number[]) => {
          if (method === 'moveTo') starts.push(args);
          return g;
        },
    },
  ) as Phaser.GameObjects.Graphics;
  const draw = (time: number) => {
    starts.length = 0;
    drawLake(g, w, tiles, time);
    return JSON.stringify(starts);
  };
  const first = draw(1);
  assert.ok(starts.length > 10);
  const offsets = new Set(
    starts.map(([x]) => Math.round(((x % 24) + 24) % 24)),
  );
  assert.ok(
    offsets.size > 8,
    'Ripple positions must span the tile instead of lining up at fixed offsets',
  );
  assert.equal(draw(1), first);
  assert.notEqual(draw(20), first);
  for (const [x, y] of starts) {
    const c = w.cell(x / 24, y / 24);
    assert.equal(c.kind, 'water');
    assert.equal(c.river, undefined);
  }
});

test('river flow reaches the mouth through crossings without changing the world', () => {
  const w = new World(4721),
    before = w.serialize(),
    flow = riverFlow(w),
    byTile = new Map(flow.map((f) => [f.tile, f]));
  assert.ok(flow.some((f) => f.ford));
  assert.ok(
    flow.some((f) => f.dx !== 0),
    'Tributary must have lateral flow',
  );
  for (const f of flow) {
    let tile = f.tile;
    const visited = new Set<number>();
    while (Math.floor(tile / W) < H - 1) {
      assert.ok(!visited.has(tile), 'Flow must not cycle');
      visited.add(tile);
      const current = byTile.get(tile);
      assert.ok(current);
      tile += current.dx + current.dy * W;
      assert.ok(
        byTile.has(tile),
        'Current must stay inside river including crossings',
      );
    }
  }
  assert.equal(w.serialize(), before);
});

test('river and splash drawing is deterministic at pause and changes with simulation time', () => {
  const calls: unknown[] = [];
  let g: Phaser.GameObjects.Graphics;
  g = new Proxy(
    {},
    {
      get:
        (_, method) =>
        (...args: unknown[]) => {
          calls.push([method, ...args]);
          return g;
        },
    },
  ) as Phaser.GameObjects.Graphics;
  const flow = riverFlow(new World(4721));
  const draw = (time: number) => {
    calls.length = 0;
    drawRiver(g, flow, time);
    waterSplash(g, 100, 100, (time * 0.3) % 1);
    return JSON.stringify(calls);
  };
  assert.equal(draw(1), draw(1));
  assert.notEqual(draw(1), draw(1.2));
});
