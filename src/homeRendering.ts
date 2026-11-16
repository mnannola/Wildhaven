import type Phaser from 'phaser';
import type {World} from './sim';
import {TILE} from './sim';
import type {Home} from './homes';

export function drawHomeMarkers(w:World,g:Phaser.GameObjects.Graphics){
 g.clear();for(const h of w.homes){const x=h.x*TILE,y=h.y*TILE,alpha=h.abandonedAt===undefined?1:.35;
  g.fillStyle(0x263c28,.2*alpha).fillEllipse(x,y+5,30,13);
  if(h.kind==='deer-gathering'){
   g.fillStyle(0xa28e5f,.55*alpha).fillEllipse(x,y+2,23,13);g.lineStyle(1,0xb9b080,.7*alpha);for(let i=0;i<5;i++)g.lineBetween(x-8+i*4,y+2,x-5+i*4,y+5);
   g.fillStyle(0x738a4b,alpha).fillRect(x-13,y-1,2,6).fillRect(x+10,y-3,2,6);
  }else{
   const bear=h.kind==='bear-den';g.fillStyle(bear?0x726f58:0x786344,alpha).fillEllipse(x,y,bear?29:26,bear?21:17);
   g.fillStyle(0x253026,alpha).fillEllipse(x+1,y+2,bear?16:15,bear?12:10);
   g.fillStyle(bear?0x9c9780:0x9b8054,.9*alpha).fillRect(x-11,y-5,6,5).fillRect(x+7,y-4,6,5);
   g.fillStyle(0x537044,.9*alpha).fillRect(x-8,y-10,5,4).fillRect(x+3,y-9,5,3);
   if(!bear)g.lineStyle(2,0x56432d,alpha).lineBetween(x-12,y-7,x+10,y-9);
  }
 }
}

export function drawHomeRange(h:Home,g:Phaser.GameObjects.Graphics,range:boolean){
 const color=h.species==='wolf'?0xa3bec6:h.species==='bear'?0xc4a178:0xd4c58b,x=h.x*TILE,y=h.y*TILE;
 g.lineStyle(2,color,.85).strokeEllipse(x,y+3,35,25);
 if(range&&h.abandonedAt===undefined){g.lineStyle(1,color,.35).strokeCircle(x,y,h.radius*TILE);if(h.species!=='deer')g.lineStyle(1,color,.16).strokeCircle(x,y,h.radius*.4*TILE);}
}
