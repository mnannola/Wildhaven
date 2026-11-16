import type { Animal } from './sim';
import { maturity, lifeStage } from './lifecycle';

export function animalTexture(a: Animal, pose: string) {
  if (a.species === 'bear' && lifeStage(a) === 'juvenile') return pose + '-cub';
  if (a.species === 'wolf' && lifeStage(a) === 'juvenile') return pose + '-pup';
  if (a.species !== 'deer') return pose;
  return lifeStage(a) === 'juvenile'
    ? pose + '-fawn-antlerless'
    : a.sex === 'female'
      ? pose + '-antlerless'
      : pose;
}

// Art direction only: these factors never affect simulation strength or speed.
export function sexBuild(a: Animal) {
  const growth = maturity(a),
    male = a.sex === 'male';
  const width = a.species === 'bear' ? 0.12 : a.species === 'wolf' ? 0.1 : 0.05;
  const height =
    a.species === 'bear' ? 0.06 : a.species === 'wolf' ? 0.04 : 0.02;
  return {
    x: 1 + (male ? width * growth : 0),
    y: 1 + (male ? height * growth : 0),
  };
}

export function coatTint(a: Animal) {
  return a.sex === 'female' || a.species === 'deer'
    ? 0xffffff
    : a.species === 'wolf'
      ? 0xb9c5cb
      : 0xcbb9a6;
}
