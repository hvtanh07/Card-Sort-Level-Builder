import {esc,cname,cidx} from './util.js';
import {hitBox,boxesOverlap} from './layout.js';

/* ---------- rules engine (checked against all 40 saved solutions) ----------
   Poles: targets[i] goes into queue i % n_slots, the first one in each queue is at the bottom.
   Blocking: a stack is blocked by any remaining stack on a higher layer, of a different color, whose w x h footprint overlaps it
   (see layout.js: the footprint starts at the first card and runs in the spread direction).
   Waiting slots: buffer_capacity counts cards. The level is lost when more cards wait than fit. */
export function overlap(a,b){return boxesOverlap(a.box,b.box);}
export function blockerOf(s,list){for(const o of list){if(o!==s&&o.layer>s.layer&&o.color!==s.color&&overlap(o,s))return o;}return null;}
export function newGame(lv){
  const n=Math.max(1,lv.n_slots|0);
  const poles=lv.targets.map((t,i)=>({i,color:t.color,cap:+t.capacity||0,hidden:!!t.hidden,fill:0,done:false}));
  const queues=[];for(let q=0;q<n;q++)queues.push([]);
  poles.forEach((p,i)=>queues[i%n].push(p.i));
  const stacks=lv.stacks.map(s=>({id:s.id,x:+s.x||0,y:+s.y||0,w:+s.w||0,h:+s.h||0,box:hitBox(s),layer:+s.layer||0,color:s.color,hidden:!!s.hidden,left:+s.count||0,lockN:+s.lock||0,started:false,revealed:false,gone:false}));
  const g={n,poles,queues,stacks,buffer:[],cap:+lv.buffer_capacity||0,moves:[],state:'play',cleared:0,msg:''};
  settle(g);updateLocks(g,0);checkEnd(g);
  return g;
}
export const activeOf=(g,q)=>{for(const i of g.queues[q]){if(!g.poles[i].done)return g.poles[i];}return null;};
export const remaining=g=>g.stacks.filter(s=>!s.gone);
export function place(g,color,n){
  for(let q=0;q<g.n&&n>0;q++){const p=activeOf(g,q);if(p&&p.color===color){const k=Math.min(n,p.cap-p.fill);p.fill+=k;n-=k;}}
  return n;
}
export function settle(g){
  let cleared=0,ch=true;
  while(ch){
    ch=false;
    for(let q=0;q<g.n;q++){const p=activeOf(g,q);if(p&&p.fill>=p.cap){p.done=true;cleared++;ch=true;}}
    const cols=[...new Set(g.buffer)];
    for(const c of cols){
      const cnt=g.buffer.filter(x=>x===c).length,left=place(g,c,cnt),moved=cnt-left;
      if(moved>0){let k=moved;g.buffer=g.buffer.filter(x=>{if(x===c&&k>0){k--;return false;}return true;});ch=true;}
    }
  }
  g.cleared+=cleared;return cleared;
}
export function updateLocks(g,cleared){
  const rem=remaining(g);
  for(const s of rem){
    const free=!blockerOf(s,rem);
    if(free)s.revealed=true;
    if(s.lockN>0&&free)s.lockN=Math.max(0,s.lockN-cleared);
  }
  /* fail-safe from the GDD: when only locked cards are left on the table, they unlock */
  if(rem.length&&rem.every(s=>s.lockN>0))rem.forEach(s=>{s.lockN=0;});
}
export function checkEnd(g){
  if(g.buffer.length>g.cap){g.state='lost';g.msg=`Waiting slots overflowed: ${g.buffer.length} cards for ${g.cap} spaces.`;return;}
  if(!remaining(g).length&&!g.buffer.length){g.state='won';g.msg=`Cleared in ${g.moves.length} moves.`;return;}
  if(!remaining(g).length&&g.buffer.length){g.state='lost';g.msg='The table is empty but cards are still waiting with no pole to go to.';return;}
  g.state='play';
}
export function canTap(g,s){const rem=remaining(g);if(s.gone)return 'gone';if(blockerOf(s,rem))return 'blocked';if(s.lockN>0)return 'locked';return '';}
export function tap(g,id,force){
  const s=g.stacks.find(x=>x.id===id);if(!s)return 'missing';
  if(g.state!=='play')return 'over';
  const why=canTap(g,s);if(why&&!(force&&why!=='gone'))return why;
  s.gone=true;s.lockN=0;
  const rest=place(g,s.color,s.left);
  for(let k=0;k<rest;k++)g.buffer.push(s.color);
  const c=settle(g);updateLocks(g,c);g.moves.push(id);checkEnd(g);
  return '';
}
export function boosterShuffle(g){
  const order=[];
  g.buffer.forEach(c=>{if(!order.includes(c))order.push(c);});
  const rem=remaining(g);
  rem.filter(s=>!blockerOf(s,rem)&&s.lockN===0).sort((a,b)=>b.layer-a.layer).forEach(s=>{if(!order.includes(s.color))order.push(s.color);});
  const live=[];g.queues.forEach(q=>q.forEach(i=>{if(!g.poles[i].done)live.push(i);}));
  const lens=g.queues.map(q=>q.filter(i=>!g.poles[i].done).length);
  const picks=[];
  for(const c of order){
    if(picks.length>=Math.min(3,g.n))break;
    const cand=live.filter(i=>!picks.includes(i)&&g.poles[i].color===c).sort((a,b)=>(g.poles[a].hidden-g.poles[b].hidden));
    if(cand.length)picks.push(cand[0]);
  }
  let rest=live.filter(i=>!picks.includes(i));
  for(let i=rest.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}
  const nq=g.queues.map(()=>[]);
  const qOrder=lens.map((l,q)=>q).filter(q=>lens[q]>0);
  picks.forEach((p,k)=>{const q=qOrder[k%qOrder.length];if(q!=null)nq[q].push(p);else rest.unshift(p);});
  for(let q=0;q<g.n;q++){while(nq[q].length<lens[q]&&rest.length)nq[q].push(rest.shift());}
  while(rest.length)nq[0].push(rest.shift());
  g.queues=nq.map((q,i)=>g.queues[i].filter(x=>g.poles[x].done).concat(q));
  const c=settle(g);updateLocks(g,c);checkEnd(g);
}
export function boosterRemove(g,pi){
  const p=g.poles[pi];if(!p||p.done)return;
  let need=p.cap-p.fill;
  let k=Math.min(need,g.buffer.filter(x=>x===p.color).length),take=k;
  g.buffer=g.buffer.filter(x=>{if(x===p.color&&take>0){take--;return false;}return true;});need-=k;
  const rem=remaining(g);
  const rank=s=>{if(s.lockN>0)return 3;if(s.hidden&&!s.revealed)return 2;if(blockerOf(s,rem))return 1;return 0;};
  rem.filter(s=>s.color===p.color).sort((a,b)=>rank(a)-rank(b)||b.layer-a.layer).forEach(s=>{
    if(need<=0)return;const t=Math.min(need,s.left);s.left-=t;need-=t;if(s.left<=0){s.gone=true;s.lockN=0;}
  });
  p.fill=p.cap;p.done=true;g.cleared++;
  const c=settle(g);updateLocks(g,1+c);checkEnd(g);
}
export function snapGame(g){return JSON.stringify({queues:g.queues,poles:g.poles,stacks:g.stacks,buffer:g.buffer,moves:g.moves,state:g.state,cleared:g.cleared,msg:g.msg});}
export function restoreGame(g,s){Object.assign(g,JSON.parse(s));}

export function verify(lv){
  const g=newGame(lv),sol=Array.isArray(lv.solution)?lv.solution:[];
  for(let i=0;i<sol.length;i++){
    const r=tap(g,sol[i]);
    if(r)return {ok:false,step:i,why:r==='missing'?`Move ${i+1} names ${sol[i]}, which is not a stack in this level.`:r==='blocked'?`Move ${i+1}: ${sol[i]} is still covered by ${blockerOf(g.stacks.find(x=>x.id===sol[i]),remaining(g)).id}.`:r==='locked'?`Move ${i+1}: ${sol[i]} is still locked.`:r==='gone'?`Move ${i+1}: ${sol[i]} was already sent up.`:`Move ${i+1}: the level was already over (${g.msg})`,g};
  }
  if(g.state==='won')return {ok:true,g};
  return {ok:false,step:sol.length,why:g.state==='lost'?g.msg:`After ${sol.length} moves the table still has ${remaining(g).length} stacks.`,g};
}
export function solve(lv,limit){
  const g0=newGame(lv),seen=new Set();let nodes=0;const t0=Date.now();
  function key(g){return g.stacks.map(s=>s.gone?'1':(s.lockN?String(s.lockN):'0')).join('')+'|'+g.poles.map(p=>p.done?'x':p.fill).join(',')+'|'+g.buffer.slice().sort().join(',');}
  function rec(g){
    if(g.state==='won')return g.moves.slice();
    if(g.state!=='play')return null;
    if(++nodes>limit||Date.now()-t0>6000)return null;
    const k=key(g);if(seen.has(k))return null;seen.add(k);
    const act=new Set();for(let q=0;q<g.n;q++){const p=activeOf(g,q);if(p)act.add(p.color);}
    const cand=remaining(g).filter(s=>!canTap(g,s)).sort((a,b)=>(act.has(b.color)-act.has(a.color))||(b.left-a.left));
    for(const s of cand){
      const snapS=snapGame(g);tap(g,s.id);
      const r=rec(g);if(r)return r;
      restoreGame(g,snapS);
    }
    return null;
  }
  const r=rec(g0);
  return {moves:r,nodes,capped:!r&&(nodes>limit||Date.now()-t0>6000)};
}

/* ---------- checks ---------- */
export function check(lv,all){
  const out=[],bad=(t)=>out.push({k:'bad',t}),warn=(t)=>out.push({k:'warn',t});
  const ids=new Map();
  (lv.stacks||[]).forEach(s=>ids.set(s.id,(ids.get(s.id)||0)+1));
  ids.forEach((n,id)=>{if(n>1)bad(`Stack id <b>${esc(id)}</b> is used ${n} times.`);});
  if(!lv.id)bad('The level has no id.');
  if(all&&all.filter(o=>o.id===lv.id).length>1)warn(`Another level in the list also has the id <b>${esc(lv.id)}</b>.`);
  if(!(lv.n_slots>=1))bad('<code>n_slots</code> (pole queues) must be 1 or more.');
  if(!(lv.buffer_capacity>=1))bad('<code>buffer_capacity</code> (waiting slots) must be 1 or more.');
  if(!(lv.targets||[]).length)bad('The level has no poles.');
  if(!(lv.stacks||[]).length)bad('The table has no stacks.');
  const tc=tally(lv);
  tc.forEach(r=>{if(r.cards!==r.cap)bad(`<b>${cname(r.color)}</b>: ${r.cards} cards on the table, ${r.cap} spaces on ${r.color} poles.`);});
  (lv.targets||[]).forEach((t,i)=>{if(!(t.capacity>0))bad(`Pole ${i+1} has no capacity.`);});
  (lv.stacks||[]).forEach(s=>{
    if(!(s.count>0))bad(`Stack <b>${esc(s.id)}</b> has no cards.`);
    if(cidx(s.color)<0)bad(`Stack <b>${esc(s.id)}</b> has an unknown color “${esc(s.color)}”.`);
    if(s.on_stack){const p=lv.stacks.find(o=>o.id===s.on_stack);
      if(!p)warn(`Stack <b>${esc(s.id)}</b> sits on <b>${esc(s.on_stack)}</b>, which does not exist.`);
      else if(p.layer!==s.layer-1)warn(`Stack <b>${esc(s.id)}</b> sits on <b>${esc(p.id)}</b> (layer ${p.layer}) but is on layer ${s.layer}. The saved levels always use the layer just above.`);}
  });
  const g=newGame(lv),rem=remaining(g);
  rem.forEach(s=>{
    if(s.hidden&&!blockerOf(s,rem))warn(`Hidden stack <b>${esc(s.id)}</b> is not covered, so it shows its color from the start.`);
  });
  (lv.stacks||[]).forEach(s=>{if(s.lock>(lv.targets||[]).length)warn(`Locked stack <b>${esc(s.id)}</b> needs ${s.lock} poles cleared but the level has ${(lv.targets||[]).length}. Only the fail-safe will open it.`);});
  if(!rem.some(s=>!canTap(g,s))&&rem.length)bad('No stack can be tapped at the start.');
  const sol=lv.solution;
  if(!Array.isArray(sol)||!sol.length)warn('The level has no saved solution. Play test it and press “Save as solution”, or use “Find a solution”.');
  else{
    const v=verify(lv);
    if(!v.ok)bad('Saved solution fails. '+v.why);
    const missing=(lv.stacks||[]).filter(s=>!sol.includes(s.id)).map(s=>s.id);
    if(v.ok&&missing.length)warn(`The solution never taps ${missing.map(esc).join(', ')}. A booster or a pull cleared them.`);
  }
  return out;
}
export function tally(lv){
  const m=new Map();
  (lv.stacks||[]).forEach(s=>{const r=m.get(s.color)||{color:s.color,cards:0,cap:0,poles:0,stacks:0};r.cards+=+s.count||0;r.stacks++;m.set(s.color,r);});
  (lv.targets||[]).forEach(t=>{const r=m.get(t.color)||{color:t.color,cards:0,cap:0,poles:0,stacks:0};r.cap+=+t.capacity||0;r.poles++;m.set(t.color,r);});
  return [...m.values()].sort((a,b)=>cidx(a.color)-cidx(b.color));
}
export const statusOf=iss=>iss.some(i=>i.k==='bad')?'bad':iss.some(i=>i.k==='warn')?'warn':'ok';

