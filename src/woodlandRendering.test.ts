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
  renderer.update(w, { x: tree.x / TILE, y: (tree.y - 20) / TILE });
  assert.equal(tree.alpha, 0.45);
  renderer.update(w);
  assert.equal(tree.alpha, 1);
  const clears = waterClears;
  renderer.update(w);
  assert.equal(waterClears, clears, 'Paused water should be cached');
  w.time += 0.2;
  renderer.update(w);
  assert.ok(waterClears > clears);
  const index = w.cells.findIndex((c) => c.kind === 'tree');
  w.cells[index].kind = 'grass';
  renderer.paint(w);
  assert.equal(refreshes, painted + 1);
  assert.equal(tree.destroyed, true);
  renderer.paint(World.restore(saved));
  assert.equal(refreshes, painted + 2);
});
