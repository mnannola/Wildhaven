import React from 'react';
import type { Animal, World } from './sim';
import { homeFor, homeName, residents, Home } from './homes';
import { isDependent } from './reproduction';

export function HomeDetails({
  world: w,
  animal: a,
  onView,
}: {
  world: World;
  animal: Animal;
  onView: () => void;
}) {
  const home = homeFor(w, a);
  return (
    <section className="home-details" aria-label="Animal home">
      <h3>Home &amp; territory</h3>
      {home ? (
        <>
          <div className="world-fact">
            <span>Home</span>
            <strong>
              {homeName(home)} #{home.id}
            </strong>
          </div>
          <div className="world-fact">
            <span>Residents</span>
            <strong>{residents(w, home).length}</strong>
          </div>
          <div className="world-fact">
            <span>
              {a.species === 'deer' ? 'Gathering range' : 'Home range'}
            </span>
            <strong>{home.radius} tiles</strong>
          </div>
          <p className="muted">
            {a.species === 'deer'
              ? 'A familiar gathering and resting place shared by the herd.'
              : 'Familiar shelter and a base for resting, raising young, and checking the surrounding territory.'}
          </p>
          <button className="follow" onClick={onView}>
            View home
          </button>
        </>
      ) : (
        <p className="muted">
          {a.alive
            ? 'No established home. Adults settle after discovering suitable shelter near known food and water.'
            : 'No occupied home remains for this animal.'}
        </p>
      )}
    </section>
  );
}

export function HomeInspector({
  world: w,
  home: h,
  onRange,
}: {
  world: World;
  home: Home;
  onRange: () => void;
}) {
  const members = residents(w, h),
    young = members.filter(isDependent);
  return (
    <div className="inspector home-inspector">
      <span className="eyebrow">FAMILIAR GROUND</span>
      <h2>{homeName(h)}</h2>
      <div className="world-fact">
        <span>Status</span>
        <strong>
          {h.abandonedAt === undefined ? 'Occupied' : 'Abandoned'}
        </strong>
      </div>
      <div className="world-fact">
        <span>{h.species === 'bear' ? 'Resident family' : 'Group'}</span>
        <strong>
          {h.species === 'wolf'
            ? 'Pack #' + h.groupId
            : h.species === 'deer'
              ? 'Herd #' + h.groupId
              : (w.animals.find((a) => a.id === h.ownerId)?.name ??
                'Former resident')}
        </strong>
      </div>
      <div className="world-fact">
        <span>Residents</span>
        <strong>{members.length}</strong>
      </div>
      <div className="world-fact">
        <span>Dependent young</span>
        <strong>{young.length}</strong>
      </div>
      <div className="world-fact">
        <span>Range</span>
        <strong>{h.radius} tiles</strong>
      </div>
      <p className="muted">
        {h.abandonedAt !== undefined
          ? 'This site can be reclaimed by animals of the same species before it fades away.'
          : h.species === 'deer'
            ? 'Herd members gather and rest here. This area is shared, rather than defended.'
            : 'Residents rest here, check familiar ground, and warn nearby rivals. Animals can leave the range to find resources or escape danger.'}
      </p>
      {!!young.length && h.species === 'wolf' && (
        <p className="muted">
          Dependent pups can wait at the den while their mother forages and
          returns to nurse.
        </p>
      )}
      {members.length > 0 && (
        <>
          <h3>Residents</h3>
          <p className="muted">{members.map((a) => a.name).join(', ')}</p>
        </>
      )}
      <button className="follow" onClick={onRange}>
        Show range
      </button>
      <p className="muted">
        The range is familiar ground, not an impassable boundary.
      </p>
    </div>
  );
}
