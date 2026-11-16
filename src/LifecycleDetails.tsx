import React from 'react';
import type {Animal,World} from './sim';
import type {DeathCause} from './statistics';
import {DAY_SECONDS,LIFE_CYCLE,lifeStage} from './lifecycle';
import {breedingStatus,dependents,REPRODUCTION} from './reproduction';

const deathLabels:Record<DeathCause,string>={predation:'Predation',combat:'Combat',hunger:'Hunger',thirst:'Thirst',oldAge:'Old age',other:'Other'};

export function LifecycleDetails({animal:a,world:w}:{animal:Animal;world?:World}){
 const stage=lifeStage(a),ages=LIFE_CYCLE[a.species],pregnancy=a.pregnancy,young=w?dependents(w,a):[];
 const caregiver=w?.animals.find(b=>b.id===a.caregiverId);
 return <section className="lifecycle-details" aria-label="Animal life cycle">
  <h3>Life cycle</h3>
  <div className="world-fact"><span>Sex</span><strong>{a.sex==='female'?'Female':'Male'}</strong></div>
  <div className="world-fact"><span>{a.alive?'Age':'Age at death'}</span><strong>{(a.age/DAY_SECONDS).toFixed(1)} simulated days</strong></div>
  <div className="world-fact"><span>{a.alive?'Life stage':'Stage at death'}</span><strong>{stage==='juvenile'?'Juvenile':stage==='adult'?'Adult':'Elder'}</strong></div>
  {a.parentIds&&<div className="world-fact"><span>Parents</span><strong>{a.parentNames?.join(' & ')??a.parentIds.map(id=>'#'+id).join(' & ')}</strong></div>}
  {a.alive&&stage==='juvenile'&&<><div className="world-fact"><span>Caregiver</span><strong>{caregiver?.alive?caregiver.name:a.caregiverId?'Unavailable':'Independent'}</strong></div><p className="muted">{a.age<REPRODUCTION[a.species].wean?`Nursing age; weans at ${REPRODUCTION[a.species].wean/DAY_SECONDS} days.`:'Weaned; feeds independently and stays near family.'}</p></>}
  {w&&a.alive&&<div className="world-fact"><span>Breeding</span><strong>{breedingStatus(w,a)}</strong></div>}
  {young.length>0&&<div className="world-fact"><span>Dependent young</span><strong>{young.map(b=>b.name).join(', ')}</strong></div>}
  {pregnancy&&<div className="pregnancy-progress"><div className="world-fact"><span>Expecting</span><strong>{pregnancy.litterSize} young</strong></div><progress aria-label="Pregnancy progress" max={1} value={Math.max(0,Math.min(1,((w?.time??pregnancy.conceivedAt)-pregnancy.conceivedAt)/(pregnancy.dueAt-pregnancy.conceivedAt||1)))}/><p className="muted">Due in {Math.max(0,(pregnancy.dueAt-(w?.time??pregnancy.conceivedAt))/DAY_SECONDS).toFixed(1)} days. Father: {pregnancy.fatherName}.</p></div>}
  {a.alive&&a.birthStatus&&<p className="muted">{a.birthStatus}.</p>}
  {!a.alive?<div className="world-fact"><span>Cause of death</span><strong>{a.deathCause?deathLabels[a.deathCause]:'Not recorded'}</strong></div>:<p className="muted">{stage==='juvenile'?`Adulthood at ${ages.adult/DAY_SECONDS} days.`:stage==='adult'?`Elderhood starts at ${ages.elder/DAY_SECONDS} days.`:'Elders gradually move slower and tire faster.'} One simulated day is four minutes at 1x speed.</p>}
 </section>;
}
