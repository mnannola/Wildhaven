import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Phaser from 'phaser';
import { World, TILE } from './sim';
import { WoodlandRenderer } from './woodlandRendering';

test('woodland scenery preserves world state, caches ground, restores tree transparency, and rebuilds after terrain changes', () => {
  const textures = new Map<string, any>(),
    images: any[] = [];
  let refreshes = 0,
    waterClears = 0;
  const context = new Proxy(
    { createRadialGradient: () => ({ addColorStop() {} }) },
    {
      get: (o, k) => (k in o ? o[k as keyof typeof o] : () => {}),
      set: (o, k, v) => {
        (o as any)[k] = v;
        return true;
      },
    },
  );
  const graphics: any = {
    clear() {
      waterClears++;
      return this;
    },
    lineStyle() {
      return this;
    },
    lineBetween() {
      return this;
    },
    beginPath() {
      return this;
    },
    moveTo() {
      return this;
    },
    lineTo() {
      return this;
    },
    strokePath() {
      return this;
    },
    fillStyle() {
      return this;
    },
    fillEllipse() {
      return this;
    },
    setDepth() {
      return this;
    },
  };
  const scene = {
    events: { once() {} },
    textures: {
      exists: (k: string) => textures.has(k),
      get: (k: string) => {
        assert.ok(textures.has(k));
        return textures.get(k);
      },
      createCanvas: (k: string) => {
        const t = {
          context,
          refresh() {
            refreshes++;
          },
        };
        textures.set(k, t);
        return t;
      },
    },
    add: {
      graphics: () => graphics,
      image: (x: number, y: number, key: string) => {
        const image = {
          x,
          y,
          key,
          alpha: 1,
          destroyed: false,
          rotation: 0,
          setRotation(n: number) {
            this.rotation = n;
            return this;
          },
          setOrigin() {
            return this;
          },
          setDepth() {
            return this;
          },
          setTexture(k: string) {
            this.key = k;
            return this;
          },
          setAlpha(n: number) {
            this.alpha = n;
            return this;
          },
          destroy() {
            this.destroyed = true;
          },
        };
        images.push(image);
        return image;
      },
    },
  };
  const w = new World(4721),
    saved = w.serialize(),
    renderer = new WoodlandRenderer(scene as unknown as Phaser.Scene);
  renderer.paint(w);
  assert.equal(w.serialize(), saved);
  assert.equal(textures.size, 9);
  const painted = refreshes,
    tree = images.find((i) => i.key.startsWith('woodland-tree-'));
  assert.ok(tree);
  renderer.paint(w);
  assert.equal(refreshes, painted);
  const forage = w.cells.find((c) => c.forage)!;
  forage.food = 0;
  renderer.paint(w);
  assert.equal(refreshes, painted, 'Food changes must not rerasterize scenery');
  const behind = [
    {
      x: tree.x - 10,
      y: tree.y - 35,
      width: 20,
      height: 30,
      depth: tree.y - 20,
    },
  ];
  renderer.update(w, behind, 16);
  assert.ok(tree.alpha > 0.45 && tree.alpha < 1, 'Fade must start gradually');
  const partial = tree.alpha;
  renderer.update(w, [], 16);
  assert.ok(
    tree.alpha > partial && tree.alpha < 1,
    'Reversing mid-fade stays smooth',
  );
  for (let i = 0; i < 50; i++) renderer.update(w, behind, 16);
  assert.equal(tree.alpha, 0.45);
  renderer.update(w, [], 16);
  assert.ok(tree.alpha > 0.45 && tree.alpha < 1);
  for (let i = 0; i < 50; i++) renderer.update(w, [], 16);
  assert.equal(
    tree.alpha,
    1,
    'Fade completes even while simulation time is paused',
  );
  // Sprite edge overlap must work even when its center lies outside the crown.
  const edge = [
    {
      x: tree.x + 35,
      y: tree.y - 90,
      width: 30,
      height: 25,
      depth: tree.y - 80,
    },
  ];
  for (let i = 0; i < 50; i++) renderer.update(w, edge, 16);
  assert.equal(tree.alpha, 0.45);
  // An animal drawn in front must not keep the tree faded.
  for (let i = 0; i < 50; i++)
    renderer.update(w, [{ ...edge[0], depth: tree.y + 1 }], 16);
  assert.equal(tree.alpha, 1);
  const clears = waterClears;
  const rotation = tree.rotation,
    windState = w.serialize();
  renderer.update(w);
  assert.equal(
    tree.rotation,
    rotation,
    'Wind freezes when simulation time is paused',
  );
  assert.equal(
    w.serialize(),
    windState,
    'Atmosphere must not change simulation state or RNG',
  );
  assert.equal(waterClears, clears, 'Paused water should be cached');
  w.time += 0.2;
  renderer.update(w);
  assert.ok(waterClears > clears);
  assert.notEqual(
    tree.rotation,
    rotation,
    'Tree sway advances with simulation time',
  );
  assert.ok(
    Math.abs(tree.rotation) <= 0.041,
    'Sway stays within a gentle 2.4 degree arc',
  );
  const index = w.cells.findIndex((c) => c.kind === 'tree');
  w.cells[index].kind = 'grass';
  renderer.paint(w);
  assert.equal(refreshes, painted + 1);
  assert.equal(tree.destroyed, true);
  renderer.paint(World.restore(saved));
  assert.equal(refreshes, painted + 2);
});
