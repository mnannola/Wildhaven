import assert from 'node:assert/strict';
// Measures the actual scene update code with instrumented display objects.
// This intentionally excludes browser layout, rasterization, and GPU time.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { World, W, H } from '../src/sim.ts';
import { LIFE_CYCLE } from '../src/lifecycle.ts';

const label = process.argv[2] ?? 'trial',
  mode = process.argv[3] ?? 'paused',
  calls: Record<string, number> = {},
  textures = new Set<string>(),
  textureDrawCounts = new Map<string, number>();
const display = (texture = '', recordDrawing = false) => {
  let drawingCalls = 0;
  const data = new Map();
  let proxy: any;
  const state: any = {
    texture: { key: texture },
    isTinted: false,
    tintTopLeft: 0xffffff,
    visible: true,
    getData: (key: string) => data.get(key),
    setData: (key: string, value: unknown) => {
      data.set(key, value);
      return proxy;
    },
  };
  proxy = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args: any[]) => {
        calls[String(key)] = (calls[String(key)] ?? 0) + 1;
        if (recordDrawing && key !== 'generateTexture') drawingCalls++;
        if (key === 'generateTexture') {
          textures.add(args[0]);
          if (recordDrawing) textureDrawCounts.set(args[0], drawingCalls);
        }
        if (key === 'setTexture') {
          if (!textures.has(args[0]))
            throw Error('Missing animation texture: ' + args[0]);
          target.texture = { key: args[0] };
        }
        if (key === 'setFlipX') target.flipX = args[0];
        if (key === 'setScale') {
          target.scaleX = args[0];
          target.scaleY = args[1];
        }
        if (key === 'setTint') {
          target.isTinted = true;
          target.tintTopLeft = args[0];
        }
        if (key === 'clearTint') target.isTinted = false;
        return proxy;
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  return proxy;
};
const source = readFileSync('src/game.ts', 'utf8').replace(
  "import Phaser from 'phaser';",
  'const Phaser=globalThis.__phaser;',
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText;
const module = { exports: {} as any },
  context = vm.createContext({
    __phaser: {
      Scene: class {},
      Math: {
        Clamp: (n: number, low: number, high: number) =>
          Math.max(low, Math.min(high, n)),
      },
    },
    performance,
    console,
    Map,
    Set,
    Math,
  });
const run = vm.runInContext(
  '(function(require,module,exports){' + code + '\n})',
  context,
);
run(createRequire(resolve('src/game.ts')), module, module.exports);
const { Habitat, bridge } = module.exports,
  results = [];
for (const count of [50, 100, 200]) {
  const scene = new Habitat();
  scene.homeGraphics = display();
  scene.terrain = display();
  scene.marks = display();
  scene.fishGraphics = display();
  scene.activityGraphics = display();
  scene.effectGraphics = display();
  scene.cameras = { main: { centerOn() {} } };
  scene.game = { loop: { actualFps: 60 } };
  scene.make = { graphics: () => display('', true) };
  for (const method of [
    'makeTextures',
    'makeMovementTextures',
    'makeSurvivalTextures',
    'makeAwarenessTextures',
    'makeFishingCombatTextures',
    'makeDeathTextures',
    'makeSleepingDeerTexture',
    'makeSleepingPredatorTextures',
    'makeAntlerlessTextures',
    'makeFamilyTextures',
    'makeDeerTextures',
  ])
    scene[method]();
  scene.add = {
    image: (_x: number, _y: number, key: string) => display(key),
    text: () => display(),
  };
  const w = new World(4721);
  for (let i = 0; i < count; i++)
    w.spawn(
      i < count * 0.85 ? 'deer' : i < count * 0.95 ? 'wolf' : 'bear',
      2 + w.random() * (W - 4),
      2 + w.random() * (H - 4),
    );
  for (let i = 0; i < 20; i++) w.step(0.1);
  bridge.world = w;
  bridge.speed = 0;
  bridge.selected = 0;
  bridge.selectedRiver = 0;
  scene.update(0, 16.67);
  for (const key of Object.keys(calls)) delete calls[key];
  const times = [];
  for (let i = 0; i < 300; i++) {
    if (mode === 'moving' && i % 6 === 0) w.step(0.1);
    const began = performance.now();
    scene.update(i * 16.67, 16.67);
    times.push(performance.now() - began);
  }
  const sorted = [...times].sort((a, b) => a - b),
    result = {
      count,
      mode,
      frames: 300,
      meanMs: times.reduce((n, v) => n + v, 0) / times.length,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      displayCalls: { ...calls },
    };
  if (typeof scene.terrainChanged === 'function') {
    const cell = w.cells.find((c) => c.kind === 'grass' && c.forage)!;
    cell.food = 80;
    scene.paint();
    assert.equal(scene.terrainChanged(), false);
    cell.food = 79;
    assert.equal(scene.terrainChanged(), false);
    cell.food = 40;
    assert.equal(scene.terrainChanged(), true);
    scene.paint();
    cell.food = 12;
    assert.equal(scene.terrainChanged(), true);
    scene.paint();
    cell.kind = 'tree';
    assert.equal(scene.terrainChanged(), true);
  }
  verifyAppearance(scene, w);
  verifyFamilyAnimations(scene);
  verifyHomes(scene);
  results.push(result);
  console.log(JSON.stringify(result));
}
mkdirSync('performance-results', { recursive: true });
writeFileSync(
  `performance-results/render-${label}-${mode}.json`,
  JSON.stringify(
    {
      label,
      scope:
        'Actual Habitat.update with instrumented display objects; no GPU/DOM/paint timing. Mode is paused or moving at 10 simulation steps/60 prepared frames. Simulation work is excluded from timed scene updates; animation texture keys are validated.',
      results,
    },
    null,
    2,
  ) + '\n',
);

function verifyAppearance(scene: any, w: World) {
  for (const key of textures)
    if (key.startsWith('deer') && !key.endsWith('-antlerless')) {
      assert.ok(
        textures.has(key + '-antlerless'),
        'Missing antlerless animation: ' + key,
      );
      assert.ok(
        textureDrawCounts.get(key)! >
          textureDrawCounts.get(key + '-antlerless')!,
        'Antler drawing was not removed: ' + key,
      );
    }
  const deer = w.animals.find((a) => a.species === 'deer')!;
  deer.alive = true;
  deer.path = [];
  deer.action = 'Sleeping';
  deer.lastHit = undefined;
  deer.age = LIFE_CYCLE.deer.adult;
  deer.sex = 'male';
  scene.update(0, 16.67);
  const sprite = scene.actors.get(deer.id);
  assert.equal(sprite.texture.key, 'deer-sleep');
  deer.sex = 'female';
  scene.update(0, 16.67);
  assert.equal(sprite.texture.key, 'deer-sleep-antlerless');
  deer.sex = 'male';
  deer.age = 0;
  scene.update(0, 16.67);
  assert.equal(sprite.texture.key, 'deer-sleep-fawn-antlerless');
  deer.sex = 'female';
  deer.age = LIFE_CYCLE.deer.adult;
  for (const action of [
    'Wandering',
    'Fleeing',
    'Grazing',
    'Drinking',
    'Checking surroundings',
    'Seeking grass',
    'Searching for prey',
  ]) {
    deer.action = action;
    deer.path = ['Wandering', 'Fleeing'].includes(action)
      ? [{ x: deer.x + 0.5, y: deer.y }]
      : [];
    scene.update(0, 16.67);
    assert.ok(sprite.texture.key.endsWith('-antlerless'), action);
  }
  deer.alive = false;
  deer.diedAt = w.time;
  scene.update(0, 16.67);
  assert.ok(
    sprite.texture.key.startsWith('deer-collapse-') &&
      sprite.texture.key.endsWith('-antlerless'),
  );
  deer.diedAt = undefined;
  deer.carcass = 0;
  scene.update(0, 16.67);
  assert.equal(sprite.texture.key, 'deer-carcass-3-antlerless');
  for (const species of ['wolf', 'bear'] as const) {
    const a = w.animals.find((a) => a.species === species)!;
    a.alive = true;
    a.age = LIFE_CYCLE[species].adult;
    a.action = 'Wandering';
    a.reason = 'Resting';
    a.path = [];
    a.lastStrike = undefined;
    a.lastCatch = undefined;
    a.lastHit = undefined;
    a.sex = 'female';
    scene.update(0, 16.67);
    const actor = scene.actors.get(a.id),
      femaleWidth = actor.scaleX;
    assert.equal(actor.isTinted, false);
    a.sex = 'male';
    scene.update(0, 16.67);
    const tint = actor.tintTopLeft;
    assert.equal(actor.isTinted, true);
    assert.ok(actor.scaleX > femaleWidth);
    a.lastHit = w.time;
    scene.update(0, 16.67);
    assert.equal(actor.tintTopLeft, 0xffb7a0);
    a.lastHit = undefined;
    scene.update(0, 16.67);
    assert.equal(actor.tintTopLeft, tint);
  }
}

function verifyFamilyAnimations(scene: any) {
  for (const species of ['deer', 'wolf', 'bear'] as const) {
    const w = new World(77);
    w.cells = w.cells.map((c) => ({ ...c, kind: 'grass' }));
    w.time = 30;
    bridge.world = w;
    bridge.speed = 0;
    const mother = w.spawn(species, 20.5, 20.5)!,
      father = w.spawn(species, 21.5, 20.5)!,
      child = w.spawn(species, 19.5, 20.5)!;
    mother.sex = 'female';
    father.sex = 'male';
    mother.age = father.age = LIFE_CYCLE[species].adult;
    child.age = 0;
    child.caregiverId = mother.id;
    child.sex = 'male';
    child.alive = false;
    for (const a of [mother, father]) {
      a.mateId = a === mother ? father.id : mother.id;
      a.action = 'Courting';
      a.path = [];
      a.plan = {
        goal: 'Mate',
        steps: [{ kind: 'mate', label: 'Court' }],
        index: 0,
        elapsed: 1,
      };
    }
    scene.update(0, 16.67);
    assert.ok(
      scene.actors
        .get(mother.id)
        .texture.key.startsWith(species + '-family-court-'),
    );
    assert.equal(scene.actors.get(father.id).flipX, true);
    mother.mateId = father.mateId = undefined;
    mother.action = father.action = 'Wandering';
    mother.plan = father.plan = undefined;
    mother.hunger = mother.thirst = 20;
    child.alive = true;
    child.path = [];
    child.action = 'Nursing';
    child.plan = {
      goal: 'Family',
      steps: [{ kind: 'nurse', label: 'Nurse' }],
      index: 0,
      elapsed: 0,
    };
    scene.update(0, 16.67);
    const actor = scene.actors.get(child.id);
    assert.ok(actor.texture.key.startsWith(species + '-family-nurse-'));
    assert.ok(
      scene.actors
        .get(mother.id)
        .texture.key.startsWith(species + '-family-nurse-mother-'),
    );
    if (species === 'deer')
      assert.ok(actor.texture.key.endsWith('-antlerless'));
    const paused = actor.texture.key,
      state = w.serialize();
    scene.update(10000, 500);
    assert.equal(actor.texture.key, paused);
    assert.equal(w.serialize(), state);
    w.time += 0.2;
    scene.update(0, 16.67);
    assert.notEqual(actor.texture.key, paused);
    // Resource actions stay visible even when the mother is nursing young.
    mother.action =
      species === 'deer'
        ? 'Grazing'
        : species === 'bear'
          ? 'Fishing'
          : 'Feeding';
    scene.update(0, 16.67);
    assert.ok(!scene.actors.get(mother.id).texture.key.includes('-family-'));
    child.action = 'Wandering';
    child.plan = undefined;
    child.x = mother.x - 4;
    mother.action = 'Waiting for young';
    mother.plan = {
      goal: 'Family',
      steps: [{ kind: 'care', label: 'Wait' }],
      index: 0,
      elapsed: 0,
    };
    scene.update(0, 16.67);
    assert.ok(
      scene.actors
        .get(mother.id)
        .texture.key.startsWith(species + '-family-wait-'),
    );
    assert.equal(scene.actors.get(mother.id).flipX, true);
    child.x = mother.x - 1;
    child.action = 'Resting near mother';
    child.plan = {
      goal: 'Family',
      steps: [{ kind: 'care', label: 'Rest' }],
      index: 0,
      elapsed: 0,
    };
    mother.action = 'Wandering';
    mother.plan = undefined;
    scene.update(0, 16.67);
    assert.ok(actor.texture.key.startsWith(species + '-family-rest-'));
  }
}

function verifyHomes(scene: any) {
  const w = new World(8);
  bridge.world = w;
  bridge.selected = 0;
  bridge.selectedRiver = 0;
  bridge.selectedHome = 0;
  bridge.overlay = false;
  const a = w.spawn('wolf', 20, 20)!,
    home = {
      id: 1,
      species: 'wolf' as const,
      kind: 'wolf-den' as const,
      groupId: a.id,
      ownerId: a.id,
      radius: 12,
      x: a.x,
      y: a.y,
      foundedAt: 0,
      lastUsedAt: 0,
    };
  w.homes = [home];
  w.nextHomeId = 2;
  a.homeId = 1;
  const g = display();
  let clears = 0;
  g.clear = () => {
    clears++;
    return g;
  };
  scene.homeGraphics = g;
  scene.drawHomes();
  scene.drawHomes();
  assert.equal(clears, 1);
  bridge.selectedHome = 1;
  bridge.overlay = true;
  const circles = calls.strokeCircle ?? 0;
  scene.update(0, 16.67);
  assert.ok((calls.strokeCircle ?? 0) > circles);
  scene.viewHome(1);
  assert.equal(bridge.selectedHome, 1);
  assert.equal(bridge.selected, 0);
  bridge.selectedHome = 0;
  bridge.overlay = false;
  a.action = 'Marking territory';
  a.path = [];
  scene.update(0, 16.67);
  assert.ok(scene.actors.get(a.id).texture.key.startsWith('wolf-sniff-idle-'));
  a.action = 'Guarding territory';
  scene.update(0, 16.67);
  assert.ok(scene.actors.get(a.id).texture.key.startsWith('wolf-alert-idle-'));
  a.action = 'Wandering';
  a.x = home.x + 4;
  a.y = home.y;
  const pup = w.spawn('wolf', home.x, home.y)!;
  pup.age = 0;
  pup.homeId = home.id;
  pup.caregiverId = a.id;
  pup.action = 'Resting at den';
  pup.plan = {
    goal: 'Family',
    steps: [{ kind: 'care', label: 'Rest at den' }],
    index: 0,
    elapsed: 0,
  };
  scene.update(0, 16.67);
  assert.ok(
    scene.actors.get(pup.id).texture.key.startsWith('wolf-family-rest-'),
  );
}
