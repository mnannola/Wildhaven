import React from 'react';
import type { World, Animal } from './sim';

export function TerrainDetails({
  world: w,
  animal: a,
}: {
  world: World;
  animal: Animal;
}) {
  const cover = w.coverAt(a),
    ford = !!w.cell(a.x, a.y).ford;
  return (
    <section className="terrain-details" aria-label="Animal surroundings">
      <h3>Surroundings</h3>
      <div className="world-fact">
        <span>Ground</span>
        <strong>
          {ford ? 'River ford' : cover ? 'Woodland edge' : 'Open grass'}
        </strong>
      </div>
      <div className="world-fact">
        <span>Cover</span>
        <strong>{Math.round(cover * 100)}%</strong>
      </div>
      <div className="world-fact">
        <span>Footing</span>
        <strong>
          {Math.round(w.terrainSpeed(a, a.species) * 100)}% movement speed
        </strong>
      </div>
      <p className="muted">
        {ford
          ? 'Animals cross slowly over the stepping stones.'
          : cover
            ? 'Nearby trees conceal animals and slow movement. Moving animals are easier to spot.'
            : 'Open ground offers fast movement with little concealment.'}{' '}
        Animals can see across water, but need a ford to cross.
      </p>
    </section>
  );
}
