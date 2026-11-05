/* Where the game puts the cards of each stack. Worked out from the game build's level 5:
   - x, y is the center of the stack's first (bottom) card, not the center of the w x h box.
   - Every card is the same size, CARD_W x CARD_H level units.
   - A spread stack lays its cards out from that first card along spread_angle, toward spread_direction.
   - The w x h box starts at the first card and runs the same way. It is the stack's footprint, and blocking uses it.
   - A stack laid on top of another one with the same spread carries on where the lower one ends,
     so the two read as one long pile (level 5: s4 continues s0, s9 continues s8).
   - A fan stack tilts its cards around their bottom edge, the first card tilted most. */
export const CARD_W=150,CARD_H=206;
export const LAYOUT_DEFAULTS={gapMode:'box',gap:22,fanGap:18,fanStart:70,fanStep:4,chainDist:40,chipT:30,lean:0,pitch:56,twist:0.25,spiralR:22};
export const CHIP_R=CARD_W/2;

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

/* ---------- chips (the game's current theme) ----------
   Worked out from the game build's level 8:
   - x, y is where the bottom chip of the pile stands on the table.
   - A pile is a column of chips that leans lean° away from straight up, toward spreadDir() on the table.
     spread_angle 0 leans right (left with spread_direction -1), 90 leans toward the player, so the column
     is seen nearly end on, and 40 sits in between.
   - The camera looks down at the table at pitch° from the horizon, so the lean toward the player is
     foreshortened and height shows as "up" on screen.
   - Chips are CHIP_R in radius and chipT thick. A stack on top of another carries on its column (buildChains). */
function norm(v){const l=Math.hypot(...v)||1;return v.map(c=>c/l);}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
export function project(o,v){const p=o.pitch*Math.PI/180;return [v[0],v[1]*Math.sin(p)-v[2]*Math.cos(p)];}
/* the pile's axis in 3D, the screen step from one chip to the next, and the chip face as an ellipse */
export function pileAxis(root,opts){
  const o=Object.assign({},LAYOUT_DEFAULTS,opts);
  let A=[0,0,1];
  if(o.lean&&root.spread!==false&&!root.fan){const [hx,hy]=spreadDir(root),l=o.lean*Math.PI/180;A=[Math.sin(l)*hx,Math.sin(l)*hy,Math.cos(l)];}
  const st=project(o,A.map(c=>c*o.chipT));
  const u=norm(Math.abs(A[2])>0.999?[1,0,0]:cross(A,[0,0,1])),v=norm(cross(A,u));
  return {A,step:st,face:faceEllipse(project(o,u),project(o,v),CHIP_R)};
}
/* the ellipse that a circle with screen basis vectors bu, bv draws: {rx, ry, rot} */
export function faceEllipse(bu,bv,r){
  const a=bu[0]*bu[0]+bv[0]*bv[0],b=bu[0]*bu[1]+bv[0]*bv[1],d=bu[1]*bu[1]+bv[1]*bv[1];
  const tr=(a+d)/2,df=Math.sqrt(Math.max(0,((a-d)/2)**2+b*b));
  const l1=tr+df,l2=Math.max(0,tr-df),rot=Math.atan2(l1-a,b||1e-9)*180/Math.PI;
  return {rx:r*Math.sqrt(l1),ry:r*Math.sqrt(l2),rot:Math.abs(b)<1e-9?(a>=d?0:90):rot};
}
/* Spiral piles (how the editor draws every stack since 2026-11-05, as the designer asked):
   - Every pile is an upright stack of chips. Each chip is shifted a little on the table so the pile twists like a spiral.
   - spread_direction picks where the spiral starts: 1 starts swinging from the right side, -1 from the left.
   - spread_angle picks how much it twists: each chip turns spread_angle × twist degrees further round the spiral,
     so 0 is a straight stack and a negative angle twists the other way.
   - The bottom chip stays at x, y, and a stack on top of another carries the spiral on (buildChains). */
export function spiralTurn(root,opts){const o=Object.assign({},LAYOUT_DEFAULTS,opts);return (+root.spread_angle||0)*o.twist;}
/* chip placements for one stack: [{x, y, j}] where (x, y) is the screen center of the chip's base and j its index in the pile */
export function chipsOf(s,chain,opts,count){
  const o=Object.assign({},LAYOUT_DEFAULTS,opts);
  const root=chain?chain.root:s,start=chain?chain.start:0,n=count==null?(+s.count||0):count;
  const {step}=pileAxis(root,o);
  const R=root.spread===false?0:o.spiralR,turn=spiralTurn(root,o)*Math.PI/180,p0=(+root.spread_direction)===-1?Math.PI:0;
  const out=[];
  for(let k=0;k<n;k++){
    const j=start+k,ph=p0+turn*j,off=project(o,[R*(Math.cos(ph)-Math.cos(p0)),R*(Math.sin(ph)-Math.sin(p0)),0]);
    out.push({x:root.x+step[0]*j+off[0],y:root.y+step[1]*j+off[1],j});
  }
  return out;
}
