import {useEffect,useRef,useState} from 'react';
import {bridge} from './game';
import './artPreview.css';

const details=[
 ['Riverbank','Cool blue-green water, soft muddy edges, and pale stepping stones make crossings easy to read.'],
 ['Trees & cover','Layered canopies, textured trunks, and dappled shadows give the woodland depth.'],
 ['Root den','A dark entrance framed by roots and moss makes a home feel part of the landscape.'],
 ['Deer','Warm coats and slender silhouettes stand out against the clearing; females remain antlerless.'],
 ['Wolf','A cool gray silhouette and clear ears and tail should stay readable against woodland shadows.'],
 ['Fishing bear','A broad warm-brown silhouette and water splashes communicate fishing at a glance.'],
];

export function ArtPreview({onClose}:{onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [source,setSource]=useState('art/woodland-study.png');
 const [missing,setMissing]=useState(false),[lighting,setLighting]=useState('day'),[strength,setStrength]=useState(65),[callouts,setCallouts]=useState(true),[selected,setSelected]=useState(0);
 useEffect(()=>{
  const previousFocus=document.activeElement as HTMLElement|null, speed=bridge.speed;
  bridge.speed=0;dialog.current?.showModal();
  return()=>{bridge.speed=speed;previousFocus?.focus();};
 },[]);
 useEffect(()=>()=>{if(source.startsWith('blob:'))URL.revokeObjectURL(source);},[source]);
 return <dialog ref={dialog} className="art-preview" aria-labelledby="art-title" onCancel={event=>{event.preventDefault();onClose();}}>
  <div className="art-top"><div><span className="eyebrow">WILDHAVEN / VISUAL DEVELOPMENT</span><h2 id="art-title">A woodland worth wandering.</h2><p>Woodland art study · static concept preview</p></div><button autoFocus onClick={onClose}>Back to reserve <span aria-hidden="true">×</span></button></div>
  <div className="art-layout"><div className="art-stage">
   <div className={'art-image-frame art-light-'+lighting} style={{'--light-strength':strength/100} as React.CSSProperties}>
    {!missing?<img src={source} onError={()=>setMissing(true)} alt="Woodland art study showing a sunlit clearing, stream crossing, root den, deer, wolf, and fishing bear."/>:<div className="art-missing"><span className="eyebrow">REFERENCE IMAGE</span><h3>Load the woodland study</h3><p>Select the image from the previous chat to explore the lighting treatments.</p><p>The reference image could not be loaded from the project.</p></div>}
    {!missing&&<div className="art-light-overlay" aria-hidden="true"/>}
   </div>
   <div className="art-caption"><span>FERNWOOD / ART STUDY 01</span><span>Simulation paused while previewing</span></div>
  </div><section className="art-controls" aria-label="Art preview controls">
   <span className="eyebrow">LOOK & FEEL</span><h3>Soft light. Living woodland.</h3><p>Judge the palette, shapes, and atmosphere before we turn the concept into game assets.</p>
   <label className="art-file">Load reference image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{const file=event.currentTarget.files?.[0];if(file){setMissing(false);setSource(URL.createObjectURL(file));}}}/></label>
   <fieldset><legend>Lighting study</legend><div className="art-light-buttons">{[['day','Original'],['golden','Golden hour'],['dusk','Dusk']].map(([value,label])=><button key={value} aria-pressed={lighting===value} onClick={()=>setLighting(value)}>{label}</button>)}</div><label className="art-strength">Treatment strength <output>{strength}%</output><input type="range" min="0" max="100" value={strength} disabled={lighting==='day'} onChange={event=>setStrength(+event.target.value)}/></label><small>Color overlays explore mood; they do not relight the scene.</small></fieldset>
   <label className="art-toggle"><input type="checkbox" checked={callouts} onChange={event=>setCallouts(event.target.checked)}/> Scene callouts</label>
   {callouts&&<div className="art-callouts"><div className="art-callout-buttons">{details.map(([name],index)=><button key={name} aria-pressed={selected===index} onClick={()=>setSelected(index)}><span>{String(index+1).padStart(2,'0')}</span>{name}</button>)}</div><div className="art-detail" aria-live="polite"><h4>{details[selected][0]}</h4><p>{details[selected][1]}</p></div></div>}
   <p className="art-note">Concept only. The reserve still uses its current graphics. Loaded images stay in this browser session.</p>
  </section></div>
 </dialog>;
}
