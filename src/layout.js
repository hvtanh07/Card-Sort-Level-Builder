/* Where the game puts the cards of each stack. Worked out from the game build's level 5:
   - x, y is the center of the stack's first (bottom) card, not the center of the w x h box.
   - Every card is the same size, CARD_W x CARD_H level units.
   - A spread stack lays its cards out from that first card along spread_angle, toward spread_direction.
   - The w x h box starts at the first card and runs the same way. It is the stack's footprint, and blocking uses it.
   - A stack laid on top of another one with the same spread carries on where the lower one ends,
     so the two read as one long pile (level 5: s4 continues s0, s9 continues s8).
   - A fan stack tilts its cards around their bottom edge, the first card tilted most. */
export const CARD_W=150,CARD_H=206;
export const LAYOUT_DEFAULTS={gapMode:'box',gap:22,fanGap:18,fanStart:70,fanStep:4,chainDist:40};

export function spreadDir(s){
  const a=(+s.spread_angle||0)*Math.PI/180,d=(+s.spread_direction)===-1?-1:1;
  return [d*Math.cos(a),d*Math.sin(a)];
}
/* the w x h footprint, anchored at the first card */
export function hitBox(s){
  const w=+s.w||0,h=+s.h||0;let cx=+s.x||0,cy=+s.y||0;
  if(s.spread!==false&&!s.fan){
    const [ux,uy]=spreadDir(s);
    if(Math.abs(ux)>0.2)cx+=Math.sign(ux)*Math.max(0,w/2-CARD_W/2);
    if(Math.abs(uy)>0.2)cy+=Math.sign(uy)*Math.max(0,h/2-CARD_H/2);
  }
  return {x0:cx-w/2,y0:cy-h/2,x1:cx+w/2,y1:cy+h/2,cx,cy};
}
export const boxesOverlap=(a,b)=>a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1;

/* which stacks continue another one's pile: id -> {root, start, total} */
export function buildChains(stacks,opts){
  const o=Object.assign({},LAYOUT_DEFAULTS,opts);
  const order=stacks.map((s,i)=>({s,i})).sort((a,b)=>(a.s.layer-b.s.layer)||(a.i-b.i)).map(x=>x.s);
  const info=new Map(),done=[];
  const same=(a,b)=>!!a.fan===!!b.fan&&(a.spread!==false)===(b.spread!==false)&&((+a.spread_direction===-1)===(+b.spread_direction===-1))&&Math.abs((+a.spread_angle||0)-(+b.spread_angle||0))<=3;
  for(const s of order){
    let base=null;
    for(const t of done){
      if(t.layer>=s.layer)continue;
      const linked=s.on_stack===t.id;
      const near=same(s,t)&&Math.abs(s.x-t.x)<=o.chainDist&&Math.abs(s.y-t.y)<=o.chainDist;
      if(!(linked&&same(s,t))&&!near)continue;
      if(!base||t.layer>base.layer||(t.layer===base.layer&&Math.hypot(s.x-t.x,s.y-t.y)<Math.hypot(s.x-base.x,s.y-base.y)))base=t;
    }
    if(base){const bi=info.get(base.id);info.set(s.id,{root:bi.root,start:bi.start+(+base.count||0)});}
    else info.set(s.id,{root:s,start:0});
    done.push(s);
  }
  const totals=new Map();
  for(const s of stacks){const i=info.get(s.id);totals.set(i.root.id,Math.max(totals.get(i.root.id)||0,i.start+(+s.count||0)));}
  for(const s of stacks){const i=info.get(s.id);i.total=totals.get(i.root.id);}
  return info;
}

/* card placements for one stack: [{x, y, rot, j}] where (x, y) is the card center, rot in degrees, j the index in its pile */
export function cardsOf(s,chain,opts,count){
  const o=Object.assign({},LAYOUT_DEFAULTS,opts);
  const root=chain?chain.root:s,start=chain?chain.start:0,total=chain?chain.total:(+s.count||0);
  const n=count==null?(+s.count||0):count;
  const [ux,uy]=spreadDir(root),dir=(+root.spread_direction)===-1?-1:1;
  const out=[];
  if(root.fan){
    for(let k=0;k<n;k++){
      const j=start+k,rot=-dir*(o.fanStart-j*o.fanStep),r=rot*Math.PI/180;
      const px=root.x+j*o.fanGap*dir,py=root.y+CARD_H/2;
      out.push({x:px+Math.sin(r)*CARD_H/2,y:py-Math.cos(r)*CARD_H/2,rot,j});
    }
    return out;
  }
  let gap=0;
  if(root.spread!==false){
    if(o.gapMode==='box'){
      const L=Math.abs(ux)*(+root.w||0)+Math.abs(uy)*(+root.h||0),C=Math.abs(ux)*CARD_W+Math.abs(uy)*CARD_H;
      gap=total>1?Math.max(0,(L-C)/(total-1)):0;
    }else gap=o.gap;
  }else gap=2;
  for(let k=0;k<n;k++){const j=start+k;out.push({x:root.x+ux*gap*j,y:root.y+uy*gap*j,rot:0,j});}
  return out;
}
