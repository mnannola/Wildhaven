import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { World, Animal, Species, Traits } from './sim';
import { lifeStage, LIFE_CYCLE, juvenileSize } from './lifecycle';
import {
  REPRODUCTION,
  related,
  breedingStatus,
  reservedPopulation,
  familyDecision,
  isDependent,
} from './reproduction';
import { LifecycleDetails } from './LifecycleDetails';
import { EcosystemStatistics } from './EcosystemStatistics';

function pair(species: Species = 'deer') {
  const w = new World(33);
  w.cells = w.cells.map((c) => ({
    ...c,
    kind: 'grass',
    forage: true,
    food: 100,
    river: undefined,
    ford: false,
  }));
  w.rivers = [];
  const mother = w.spawn(species, 20.5, 20.5)!,
    father = w.spawn(species, 21.5, 20.5)!;
  for (const a of [mother, father]) {
    a.age = LIFE_CYCLE[species].adult + 1;
    a.hunger = a.thirst = a.fatigue = 10;
    a.traits.sociability = 0;
    a.traits.exploration = 0;
  }
  mother.sex = 'female';
  father.sex = 'male';
  if (species !== 'deer') {
    const food = w.spawn('deer', 22.5, 21.5)!;
    w.die(food, 'test food');
    food.carcass = 50;
  }
  w.perceive(mother);
  w.perceive(father);
  return { w, mother, father };
}
function conceive(setup = pair()) {
  const { w, mother } = setup;
  for (let i = 0; i < 80 && !mother.pregnancy; i++) w.step(0.1);
  assert.ok(
    mother.pregnancy,
    'A healthy visible pair should conceive through normal decisions and courtship.',
  );
  return setup;
}
function birth(setup = conceive()) {
  const { w, mother } = setup;
  mother.pregnancy!.dueAt = w.time + 0.1;
  w.step(0.1);
  const children = w.animals.filter((a) => a.parentIds?.[0] === mother.id);
  assert.ok(children.length);
  return { ...setup, children };
}

test('each species courts, conceives, and gives birth through the simulation', () => {
  for (const species of ['deer', 'wolf', 'bear'] as const) {
    const setup = conceive(pair(species)),
      { w, mother, father } = setup,
      pregnancy = mother.pregnancy!,
      count = pregnancy.litterSize,
      added = w.stats.added[species];
    assert.ok(
      Math.abs(
        pregnancy.dueAt -
          pregnancy.conceivedAt -
          REPRODUCTION[species].pregnancy,
      ) < 1e-8,
    );
    assert.equal(
      reservedPopulation(w),
      w.animals.filter((a) => a.alive).length + count,
    );
    const { children } = birth(setup);
    assert.equal(children.length, count);
    assert.equal(w.stats.births[species], count);
    assert.equal(w.stats.added[species], added);
    assert.equal(mother.pregnancy, undefined);
    assert.ok(mother.nextBreedAt! > w.time);
    for (const child of children) {
      assert.equal(child.age, 0);
      assert.equal(lifeStage(child), 'juvenile');
      assert.equal(child.caregiverId, mother.id);
      assert.deepEqual(child.parentIds, [mother.id, father.id]);
      assert.ok(isDependent(child));
      assert.equal(juvenileSize(child), 0.55);
      assert.ok(w.walkable(child.x, child.y));
      if (species === 'deer') assert.equal(child.herdId, mother.herdId);
      if (species === 'wolf') assert.equal(child.packId, mother.packId);
      for (const key of Object.keys(child.traits) as (keyof Traits)[])
        assert.ok(
          Math.abs(
            child.traits[key] - (mother.traits[key] + father.traits[key]) / 2,
          ) <= 8.00001,
        );
    }
  }
});

test('courtship and an ongoing pregnancy preserve their future across save/load', () => {
  const { w, mother } = pair();
  w.step(0.1);
  assert.equal(mother.goal, 'Mate');
  const courting = World.restore(w.serialize());
  for (let i = 0; i < 45; i++) {
    w.step(0.1);
    courting.step(0.1);
  }
  assert.ok(mother.pregnancy);
  assert.equal(w.serialize(), courting.serialize());
  mother.pregnancy!.dueAt = w.time + 0.2;
  const pregnant = World.restore(w.serialize());
  for (let i = 0; i < 10; i++) {
    w.step(0.1);
    pregnant.step(0.1);
  }
  assert.equal(w.serialize(), pregnant.serialize());
  assert.ok(w.stats.births.deer > 0);
});

test('courtship respects maturity, sex, health, resources, and direct family relationships', () => {
  for (const change of [
    (a: Animal) => {
      a.age = 0;
    },
    (a: Animal) => {
      a.age = LIFE_CYCLE.deer.elder;
    },
    (a: Animal) => {
      a.sex = 'female';
    },
    (a: Animal) => {
      a.hunger = 90;
    },
    (a: Animal) => {
      a.health = 30;
    },
    (a: Animal) => {
      a.thirst = 90;
    },
    (a: Animal) => {
      a.fatigue = 90;
    },
    (a: Animal) => {
      a.parentIds = [1, 99];
    },
  ]) {
    const { w, mother, father } = pair();
    change(father);
    w.decide(mother);
    assert.equal(mother.mateId, undefined);
    assert.equal(mother.pregnancy, undefined);
  }
  const { w, mother, father } = pair();
  mother.memory = [];
  assert.equal(familyDecision(w, mother), false);
  assert.match(breedingStatus(w, mother), /food source/);
  mother.parentIds = [88, 89];
  father.parentIds = [88, 90];
  assert.equal(related(mother, father), true);
  assert.equal(related(father, mother), true);
});

test('mating needs visibility and a reachable route and cannot proceed through trees', () => {
  const { w, mother, father } = pair();
  w.cells[20 * 72 + 21].kind = 'tree';
  assert.equal(familyDecision(w, mother), false);
  w.cells[20 * 72 + 21].kind = 'grass';
  father.x = 35.5;
  father.y = 35.5;
  assert.equal(familyDecision(w, mother), false);
});

test('danger and urgent needs interrupt courtship before conception', () => {
  const { w, mother, father } = pair();
  w.step(0.1);
  assert.equal(mother.goal, 'Mate');
  mother.thirst = 95;
  w.decide(mother);
  w.decide(father);
  assert.equal(mother.pregnancy, undefined);
  assert.equal(mother.mateId, undefined);
  assert.equal(father.mateId, undefined);
  assert.notEqual(mother.action, 'Courting');
  const setup = pair();
  setup.w.step(0.1);
  const wolf = setup.w.spawn('wolf', 20.5, 21.5)!;
  wolf.target = setup.mother.id;
  setup.w.decide(setup.mother);
  assert.equal(setup.mother.action, 'Fleeing');
  assert.equal(setup.mother.pregnancy, undefined);
});

test('pending litters reserve capacity and lowered limits resolve a pregnancy only once', () => {
  const setup = conceive(),
    { w, mother } = setup;
  w.birthLimit = w.animals.filter((a) => a.alive).length;
  mother.pregnancy!.dueAt = w.time + 0.1;
  w.step(0.1);
  assert.equal(mother.pregnancy, undefined);
  assert.equal(w.stats.births.deer, 0);
  assert.match(mother.birthStatus!, /no space/);
  const events = w.events.length;
  for (let i = 0; i < 20; i++) w.step(0.1);
  assert.equal(w.events.length, events);
  assert.equal(w.stats.births.deer, 0);
  const small = pair();
  small.w.birthLimit = 3;
  conceive(small);
  assert.equal(small.mother.pregnancy!.litterSize, 1);
  assert.equal(reservedPopulation(small.w), 3);
  birth(small);
  assert.equal(small.w.animals.filter((a) => a.alive).length, 3);
  const disabled = pair();
  disabled.w.birthLimit = 0;
  disabled.w.step(0.1);
  assert.equal(disabled.mother.pregnancy, undefined);
  assert.ok(disabled.w.spawn('deer', 10, 10));
});

test('a reserved litter blocks another pair from claiming the same capacity', () => {
  const { w, mother, father } = conceive();
  w.birthLimit = reservedPopulation(w);
  const other = w.spawn('deer', 23.5, 20.5)!;
  other.sex = 'female';
  other.hunger = other.thirst = other.fatigue = 0;
  w.perceive(other);
  father.nextBreedAt = 0;
  assert.match(breedingStatus(w, other), /limit/);
  assert.equal(familyDecision(w, other), false);
  assert.equal(other.pregnancy, undefined);
  assert.ok(mother.pregnancy);
});

test('lowering the limit permits only the remaining slots of a litter', () => {
  const setup = conceive(),
    { w, mother } = setup;
  mother.pregnancy!.litterSize = 2;
  w.birthLimit = 3;
  const { children } = birth(setup);
  assert.equal(children.length, 1);
  assert.equal(w.stats.births.deer, 1);
  assert.equal(mother.pregnancy, undefined);
  for (let i = 0; i < 20; i++) w.step(0.1);
  assert.equal(w.stats.births.deer, 1);
});

test('young nurse nearby and transfer nourishment costs to their mother', () => {
  const {
    w,
    mother,
    children: [child],
  } = birth();
  mother.path = [];
  mother.plan = undefined;
  mother.action = 'Wandering';
  mother.think = 100;
  mother.hunger = 20;
  mother.thirst = 20;
  child.hunger = 80;
  child.thirst = 80;
  child.think = 0;
  child.x = mother.x;
  child.y = mother.y;
  w.step(0.1);
  assert.equal(child.action, 'Nursing');
  assert.ok(child.hunger < 80);
  assert.ok(child.thirst < 80);
  assert.ok(mother.hunger > 20.05);
  assert.ok(mother.thirst > 20.02);
  const saved = World.restore(w.serialize());
  for (let i = 0; i < 10; i++) {
    w.step(0.1);
    saved.step(0.1);
  }
  assert.equal(w.serialize(), saved.serialize());
});

test('young follow their mother and she waits when a visible dependent falls behind', () => {
  const {
    w,
    mother,
    children: [child],
  } = birth();
  child.x = mother.x - 4;
  child.hunger = child.thirst = 25;
  child.fatigue = 0;
  child.plan = undefined;
  w.decide(child);
  assert.equal(child.action, 'Following mother');
  assert.ok(child.path.length);
  mother.hunger = mother.thirst = mother.fatigue = 10;
  mother.plan = undefined;
  w.decide(mother);
  assert.equal(mother.action, 'Waiting for young');
  assert.equal(mother.path.length, 0);
});

test('unseen mothers are not tracked globally and orphaned young resume independent survival', () => {
  const {
    w,
    mother,
    children: [child],
  } = birth();
  mother.x = 65.5;
  mother.y = 40.5;
  child.memory = [];
  child.plan = undefined;
  w.decide(child);
  assert.notEqual(child.goal, 'Family');
  w.removeAnimal(mother.id);
  child.hunger = 80;
  child.thirst = 0;
  child.fatigue = 0;
  w.decide(child);
  assert.equal(child.goal, 'Eat');
  assert.notEqual(child.action, 'Nursing');
  assert.equal(child.parentIds?.[0], mother.id);
});

test('weaned young feed independently and juveniles do not join hunts or count as defending wolves', () => {
  const {
    w,
    mother,
    children: [child],
  } = birth(conceive(pair('wolf')));
  child.age = REPRODUCTION.wolf.wean + 0.1;
  child.hunger = 80;
  child.thirst = child.fatigue = 0;
  child.think = 0;
  w.perceive(child);
  w.decide(child);
  assert.equal(isDependent(child), false);
  assert.equal(child.goal, 'Eat');
  assert.equal(child.action, 'Seeking carcass');
  assert.equal(w.combatReady(child), false);
  assert.equal(w.joinPackHunt(child), false);
  w.die(child, 'test');
  assert.ok(child.carcass < 50);
  assert.equal(child.carcass, child.carcassCapacity);
  assert.ok(mother.alive);
});

test('juvenile carcasses start with less meat and preserve their capacity across saves', () => {
  const {
    w,
    children: [child],
  } = birth();
  w.die(child, 'test');
  assert.equal(child.carcass, 15);
  assert.equal(child.carcassCapacity, 15);
  const saved = World.restore(w.serialize());
  assert.equal(
    saved.animals.find((a) => a.id === child.id)!.carcassCapacity,
    15,
  );
});

test('father removal preserves inherited traits and mother death ends pregnancy', () => {
  const setup = conceive(),
    { w, mother, father } = setup;
  const traits = { ...father.traits };
  w.removeAnimal(father.id);
  const { children } = birth(setup);
  assert.equal(children[0].parentNames?.[1], father.name);
  for (const key of Object.keys(traits) as (keyof Traits)[])
    assert.ok(
      Math.abs(
        children[0].traits[key] - (mother.traits[key] + traits[key]) / 2,
      ) <= 8.00001,
    );
  const other = conceive();
  other.w.die(other.mother, 'test');
  assert.equal(other.mother.pregnancy, undefined);
  other.w.step(300);
  assert.equal(other.w.stats.births.deer, 0);
});

test('version 6 saves upgrade without invented births or pregnancies', () => {
  const { w } = pair();
  const raw = JSON.parse(w.serialize());
  raw.version = 6;
  delete raw.birthLimit;
  delete raw.stats.births;
  const saved = World.restore(JSON.stringify(raw));
  assert.equal(saved.birthLimit, 200);
  assert.equal(saved.stats.births.deer, 0);
  assert.equal(saved.animals[0].pregnancy, undefined);
  assert.equal(saved.animals[0].age, w.animals[0].age);
  assert.equal(World.restore(saved.serialize()).serialize(), saved.serialize());
});

test('invalid family and population data in new saves is rejected', () => {
  const { w, mother } = conceive();
  for (const patch of [
    { parentIds: [mother.id, 99] },
    { caregiverId: mother.id },
    { nextBreedAt: -1 },
    { pregnancy: { ...mother.pregnancy, litterSize: 0 } },
    { pregnancy: { ...mother.pregnancy, fatherTraits: null } },
  ]) {
    const raw = JSON.parse(w.serialize());
    Object.assign(raw.animals[0], patch);
    assert.throws(() => World.restore(JSON.stringify(raw)), /Invalid family/);
  }
  for (const limit of [-1, 1.5, 1001, null]) {
    const raw = JSON.parse(w.serialize());
    raw.birthLimit = limit;
    assert.throws(
      () => World.restore(JSON.stringify(raw)),
      /Invalid birth limit/,
    );
  }
});

test('inspector exposes pregnancy, family, and births separately from player additions', () => {
  const setup = conceive(),
    { w, mother } = setup;
  let html = renderToStaticMarkup(
    React.createElement(LifecycleDetails, { animal: mother, world: w }),
  );
  assert.match(html, /Pregnancy progress/);
  assert.match(html, /Expecting/);
  const {
    children: [child],
  } = birth(setup);
  html = renderToStaticMarkup(
    React.createElement(LifecycleDetails, { animal: child, world: w }),
  );
  assert.match(html, /Parents/);
  assert.match(html, /Caregiver/);
  assert.match(html, /Nursing age/);
  html = renderToStaticMarkup(
    React.createElement(EcosystemStatistics, { world: w }),
  );
  assert.match(html, /born in the reserve/);
  assert.ok(w.stats.births.deer > 0);
  assert.equal(w.stats.added.deer, 2);
  w.resetAnimals();
  assert.equal(w.stats.births.deer, 0);
});
