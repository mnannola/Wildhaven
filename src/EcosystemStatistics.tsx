import React from 'react';
import {World} from './sim';
import type {EcosystemSample} from './statistics';
import {lifeStage} from './lifecycle';

const species=['deer','wolf','bear'] as const;
const names={deer:'Deer',wolf:'Wolves',bear:'Bears'};
const colors={deer:'#d9b67f',wolf:'#a3b9bd',bear:'#b58b62'};
const clock=(time:number)=>`${Math.floor(time/60)}:${Math.floor(time%60).toString().padStart(2,'0')}`;
const percent=(value:number,total:number)=>total>0?Math.round(value/total*100):0;

function HistoryChart({samples,resources=false}:{samples:EcosystemSample[];resources?:boolean}){
 const left=28,right=276,top=12,bottom=125,first=samples[0].time,last=samples.at(-1)!.time;
 const maximum=resources?100:Math.ceil(Math.max(2,...samples.flatMap(s=>species.map(k=>s.population[k])))/2)*2;
 const x=(time:number)=>left+(time-first)/Math.max(5,last-first)*(right-left);
 const y=(value:number)=>bottom-value/maximum*(bottom-top);
 const lines=resources?[{name:'Grass',color:'#a6bd79',value:(s:EcosystemSample)=>percent(s.grass,s.grassCapacity)},{name:'Fish',color:'#8bb7b8',value:(s:EcosystemSample)=>percent(s.fish,s.fishCapacity)}]:species.map(k=>({name:names[k],color:colors[k],value:(s:EcosystemSample)=>s.population[k]}));
 return <><svg className="ecosystem-chart" viewBox="0 0 288 151" role="img" aria-label={resources?'Grass and fish availability over simulation time':'Living deer, wolf, and bear populations over simulation time'}>
  {[0,maximum/2,maximum].map((tick,i)=><g key={i}><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="#ffffff16"/><text x={left-5} y={y(tick)+3} textAnchor="end">{Math.round(tick)}{resources?'%':''}</text></g>)}
  {lines.map(line=><g key={line.name}><polyline fill="none" stroke={line.color} strokeWidth="2" points={samples.map(s=>`${x(s.time)},${y(line.value(s))}`).join(' ')}/><circle cx={x(last)} cy={y(line.value(samples.at(-1)!))} r="2" fill={line.color}/></g>)}
  <text x={left} y="145">{clock(first)}</text><text x={right} y="145" textAnchor="end">{clock(last)} sim time</text>
 </svg><div className="chart-legend">{lines.map(line=><span key={line.name}><i style={{background:line.color}}/>{line.name}</span>)}</div></>;
}

export function EcosystemStatistics({world:w}:{world:World}){
 const stats=w.stats,current=w.snapshot(),samples=[...stats.samples];
 if(samples.length&&Math.abs(samples.at(-1)!.time-current.time)<1e-8)samples[samples.length-1]=current;else samples.push(current);
 const total=(p:Record<string,number>)=>Object.values(p).reduce((n,v)=>n+v,0);
 const causes=[['predation','Predation'],['combat','Combat'],['hunger','Hunger'],['thirst','Thirst'],['oldAge','Old age'],['other','Other']] as const;
 const active=w.animals.filter(a=>a.alive&&a.trackedHunt!==undefined).length;
 const resources=[{name:'Grass',value:current.grass,max:current.grassCapacity},{name:'Fish',value:current.fish,max:current.fishCapacity}];
 const stages={juvenile:0,adult:0,elder:0};for(const a of w.animals)if(a.alive)stages[lifeStage(a)]++;
 return <section className="ecosystem-statistics" aria-label="Ecosystem statistics">
  <h3>Ecosystem statistics</h3><p className="muted">Tracking since {clock(stats.startedAt)} simulation time. History retains the latest 720 samples.</p>
  <h4>Population over time</h4><HistoryChart samples={samples}/>
  <div className="statistics-cards">{species.map(k=><div key={k}><b style={{color:colors[k]}}>{current.population[k]}</b><span>{names[k]}</span></div>)}</div>
  <h4>Life stages</h4><div className="statistics-cards">{(['juvenile','adult','elder'] as const).map(stage=><div key={stage}><b>{stages[stage]}</b><span>{stage==='juvenile'?'Juveniles':stage==='adult'?'Adults':'Elders'}</span></div>)}</div>
  <h4>Home sites</h4><div className="statistics-cards">{species.map(k=><div key={k}><b>{w.homes.filter(h=>h.species===k&&h.abandonedAt===undefined).length}</b><span>{k==='deer'?'Gatherings':k==='wolf'?'Wolf dens':'Bear dens'}</span></div>)}</div><p className="muted">{w.homes.filter(h=>h.abandonedAt!==undefined).length} abandoned sites. Click a home on the map or use View home in an animal inspector.</p>
  <h4>Births</h4><div className="statistics-cards">{species.map(k=><div key={k}><b>{stats.births[k]}</b><span>{names[k]}</span></div>)}</div><p className="muted">{total(stats.births)} born in the reserve. Natural birth limit: {w.birthLimit} living animals. Player additions are separate.</p>
  <p className="muted">Player added {total(stats.added)} · removed {total(stats.removed)}. Removals are not deaths.</p>
  <h4>Deaths by cause</h4><table><caption className="sr-only">Deaths since tracking began, by cause and species</caption><thead><tr><th>Cause</th>{species.map(k=><th key={k}>{names[k]}</th>)}</tr></thead><tbody>{causes.map(([key,label])=><tr key={key}><th>{label}</th>{species.map(k=><td key={k}>{stats.deaths[key][k]}</td>)}</tr>)}</tbody><tfoot><tr><th>Total</th>{species.map(k=><td key={k}>{causes.reduce((n,[cause])=>n+stats.deaths[cause][k],0)}</td>)}</tr></tfoot></table>
  <h4>Hunt outcomes</h4><table><caption className="sr-only">Predator pursuit attempts and outcomes</caption><thead><tr><th>Predator</th><th>Started</th><th>Caught</th><th>Failed</th></tr></thead><tbody>{(['wolf','bear'] as const).map(k=>{const h=stats.hunts[k],finished=h.successful+h.failed;return <tr key={k}><th>{names[k]}<small>{finished?percent(h.successful,finished)+'% success':'No completed hunts'}</small></th><td>{h.started}</td><td>{h.successful}</td><td>{h.failed}</td></tr>;})}</tbody></table>
  <p className="muted">{active} active pursuits. Each predator counts separately; packmates can share a catch. Failed includes abandoned pursuits. Success rate uses completed pursuits. Defensive fights are excluded.</p>
  <h4>Food availability</h4><HistoryChart samples={samples} resources/>
  {resources.map(r=><div className="resource-stat" key={r.name}><span>{r.name}</span><b>{Math.floor(r.value)} / {r.max}</b><progress aria-label={r.name+' available'} value={r.value} max={Math.max(1,r.max)}/></div>)}
  <div className="world-fact"><span>Carcass meat available</span><strong>{Math.floor(current.meat)}</strong></div>
  <p className="muted">Consumed: {Math.floor(stats.grassEaten)} grass · {Math.floor(stats.meatEaten)} meat · {Math.floor(stats.fishCaught)} fish.</p>
  <h4>Animals under strain</h4><div className="strain-stat"><span>Hungry <b>{current.hungry}</b></span><span>Thirsty <b>{current.thirsty}</b></span><span>Exhausted <b>{current.exhausted}</b></span></div><p className="muted">Living animals with a need at 80% or higher.</p>
 </section>;
}
