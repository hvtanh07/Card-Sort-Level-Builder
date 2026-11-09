import './style.css';
import ORIGINAL from './data/levels.json';
import {esc,clone,COLORS,ckey,cidx,cname,fcls,bcls} from './util.js';
import {CHIP_R,LAYOUT_DEFAULTS,hitBox,boxesOverlap,buildChains,restingChains,chipsOf,pileAxis} from './layout.js';
import {blockerOf,newGame,activeOf,remaining,tap,canTap,boosterShuffle,boosterMagnet,snapGame,restoreGame,verify,solve,check,tally,statusOf,setHard} from './engine.js';

const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const NS='http://www.w3.org/2000/svg';
const STORE='cardSlotsLevelEditor.v1';
const inFrame=(()=>{try{return window.self!==window.top;}catch(e){return true;}})();

/* ---------- state ---------- */
let levels=[],cur=0,sel=new Set(),selPole=-1,tab='level',mode='edit';
let undo=[],redo=[],lastSnap='';
const view={x:-300,y:-300,w:1400,h:1000};
let flipY=false,showFree=true,showOrder=false,showBoxes=false,snap=10;
let layoutOpts=Object.assign({},LAYOUT_DEFAULTS),refImg=null;
let game=null,gameHist=[],booster=null,boostUse={hand:0,shuffle:0,magnet:0},replayIdx=0;
let issuesCache=[];
const L=()=>levels[cur];

/* a short fingerprint of the built-in levels, so a browser with saved edits can tell when they change */
const BASE=(()=>{const t=JSON.stringify(ORIGINAL);let h=0;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;return String(h>>>0);})();
let savedBase=BASE;
function load(){
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(STORE)||'null');}catch(e){}
  if(saved&&Array.isArray(saved.levels)&&saved.levels.length){levels=saved.levels;cur=Math.min(saved.cur|0,levels.length-1);savedBase=saved.base||'';}
  else{levels=clone(ORIGINAL);cur=0;}
  try{const p=JSON.parse(localStorage.getItem(STORE+'.prefs')||'{}');if(p.snap)snap=p.snap;if(p.showBoxes)showBoxes=true;if(p.layout){if(p.layoutV!==3)delete p.layout.lean;layoutOpts=Object.assign({},LAYOUT_DEFAULTS,p.layout);}if(p.showFree===false)showFree=false;if(p.showOrder)showOrder=true;}catch(e){}
}
function persist(){
  try{localStorage.setItem(STORE,JSON.stringify({levels,cur,base:savedBase}));$('#saveNote').textContent=savedBase===BASE?'Changes are saved in this browser.':'The built-in levels were updated since you last saved here. Press Reset to sheet to load them. That replaces the edits saved in this browser, so export first if you want to keep them.';}
  catch(e){$('#saveNote').textContent='This browser is not saving changes. Export before you close the page.';}
}
function savePrefs(){try{localStorage.setItem(STORE+'.prefs',JSON.stringify({snap,showFree,showOrder,showBoxes,layout:layoutOpts,layoutV:3}));}catch(e){}}
const origById=id=>ORIGINAL.find(o=>o.id===id);
const isChanged=lv=>{const o=origById(lv.id);return !o||JSON.stringify(o)!==JSON.stringify(lv);};

/* ---------- history ---------- */
function resetHistory(){undo=[];redo=[];lastSnap=JSON.stringify(L());syncUndo();}
function commit(){
  const s=JSON.stringify(L());
  if(s===lastSnap)return;
  undo.push(lastSnap);if(undo.length>200)undo.shift();
  redo=[];lastSnap=s;persist();syncUndo();refreshList();refreshChecks();
}
function doUndo(){if(!undo.length)return;redo.push(lastSnap);lastSnap=undo.pop();levels[cur]=JSON.parse(lastSnap);afterHistory();}
function doRedo(){if(!redo.length)return;undo.push(lastSnap);lastSnap=redo.pop();levels[cur]=JSON.parse(lastSnap);afterHistory();}
function afterHistory(){const ids=new Set(L().stacks.map(s=>s.id));sel=new Set([...sel].filter(i=>ids.has(i)));if(selPole>=L().targets.length)selPole=-1;persist();syncUndo();renderAll();}
function syncUndo(){$('#tUndo').disabled=!undo.length;$('#tRedo').disabled=!redo.length;}

/* ---------- level list ---------- */
let listStatus=[];
function refreshAllStatus(){listStatus=levels.map(lv=>statusOf(check(lv,levels)));}
function refreshList(){
  listStatus[cur]=statusOf(check(L(),levels));
  const q=$('#lvSearch').value.trim().toLowerCase();
  $('#lvList').innerHTML=levels.map((lv,i)=>{
    if(q&&!(String(lv.id).toLowerCase().includes(q)||String(i+1)===q))return '';
    const st=listStatus[i]||'ok',ch=isChanged(lv);
    const el=[];if(lv.hard)el.push('<b class="hard">HARD</b>');if(lv.stacks.some(s=>s.hidden))el.push('hidden');if(lv.targets.some(t=>t.hidden))el.push('hidden pole');if(lv.stacks.some(s=>s.lock))el.push('locked');
    return `<li><button type="button" class="lv" data-i="${i}" aria-current="${i===cur}"><span class="n">${i+1}</span><span><span class="t">${esc(lv.id)}${ch?' <i class="sr">changed</i>':''}</span><span class="m">${ch?'<i>● </i>':''}${lv.stacks.length} stacks · ${lv.targets.length} poles${el.length?' · '+el.join(', '):''}</span></span><span class="dot ${st}" title="${st==='ok'?'No problems':st==='warn'?'Has warnings':'Has errors'}"></span></button></li>`;
  }).join('');
  const a=$('#lvList [aria-current="true"]');if(a)a.scrollIntoView({block:'nearest'});
}
function selectLevel(i){
  if(i<0||i>=levels.length)return;
  if(mode==='play')setMode('edit');
  cur=i;sel.clear();selPole=-1;resetHistory();persist();fit();renderAll();
}

/* ---------- board ---------- */
const board=$('#board');
const vy=y=>y;
function setViewBox(){board.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);}
/* screen extent of every chip of every stack */
function stackExtent(lv,chains){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  const grow=(a,b,c,d)=>{x0=Math.min(x0,a);y0=Math.min(y0,b);x1=Math.max(x1,c);y1=Math.max(y1,d);};
  lv.stacks.forEach(s=>{
    const ch=chains.get(s.id),ax=pileAxis(ch?ch.root:s,layoutOpts),r=CHIP_R;
    chipsOf(s,ch,layoutOpts).forEach(c=>grow(c.x-r,c.y-r+Math.min(0,ax.step[1]),c.x+r,c.y+r+Math.max(0,ax.step[1])));
    const h=hitBox(s);grow(h.x0,h.y0,h.x1,h.y1);
  });
  if(!isFinite(x0)){x0=0;y0=0;x1=800;y1=600;}
  return {x0,y0,x1,y1};
}
/* Where the game screen sits around the stacks, in level units. Sizes are taken from the game build's level 8
   at its scale (about 0.3 screen px per level unit on a phone 923 px wide): poles in a grid above the table,
   one column per queue with the first pole of each queue in the bottom row, the waiting tray under them, then the table. */
const FRAME={poleW:560,colGap:712,rowGap:668,trayW:2950,trayH:520,trayGap:90,tableGap:110,tableW:2830,pad:320};
function frameOf(lv,chains){
  const e=stackExtent(lv,chains),cx=(e.x0+e.x1)/2;
  const n=Math.max(1,lv.n_slots|0),rows=Math.max(1,Math.ceil((lv.targets||[]).length/n));
  const tableW=Math.max(FRAME.tableW,e.x1-e.x0+FRAME.pad*2);
  const table={x0:cx-tableW/2,x1:cx+tableW/2,y0:e.y0-FRAME.pad,y1:e.y1+FRAME.pad};
  const trayW=Math.max(FRAME.trayW,tableW+120);
  const tray={x0:cx-trayW/2,x1:cx+trayW/2,y1:table.y0-FRAME.tableGap};tray.y0=tray.y1-FRAME.trayH;
  const poleH=FRAME.poleW*64/58,polesBottom=tray.y0-FRAME.trayGap;
  const poles=[];
  for(let i=0;i<(lv.targets||[]).length;i++){
    const q=i%n,k=Math.floor(i/n);
    poles.push({i,q,k,x:cx+(q-(n-1)/2)*FRAME.colGap,y:polesBottom-poleH-k*FRAME.rowGap});
  }
  const top=polesBottom-poleH-(rows-1)*FRAME.rowGap;
  return {e,table,tray,poles,poleH,rows,n,box:{x0:Math.min(table.x0,tray.x0),y0:top-60,x1:Math.max(table.x1,tray.x1),y1:table.y1}};
}
function fit(){
  const lv=L(),f=frameOf(lv,buildChains(lv.stacks,layoutOpts)).box;
  const pad=60,r=board.getBoundingClientRect(),ar=(r.width||800)/(r.height||600);
  let w=f.x1-f.x0+pad*2,h=f.y1-f.y0+pad*2;
  if(w/h<ar)w=h*ar;else h=w/ar;
  view.w=w;view.h=h;view.x=(f.x0+f.x1)/2-w/2;view.y=(f.y0+f.y1)/2-h/2;setViewBox();
}
function zoom(f,cx,cy){
  if(cx==null){cx=view.x+view.w/2;cy=view.y+view.h/2;}
  const nw=Math.min(40000,Math.max(150,view.w*f)),k=nw/view.w;
  view.x=cx-(cx-view.x)*k;view.y=cy-(cy-view.y)*k;view.w=nw;view.h*=k;setViewBox();
}
function toWorld(e){const pt=board.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform(board.getScreenCTM().inverse());}

function el(tag,attrs,parent){const n=document.createElementNS(NS,tag);for(const k in attrs)n.setAttribute(k,attrs[k]);if(parent)parent.appendChild(n);return n;}
const fx=v=>+(+v).toFixed(2);
/* one chip face (or side) as a circle of radius CHIP_R squashed into the pile's face ellipse */
function chipDisc(parent,x,y,face,cls){
  return el('g',{transform:`translate(${fx(x)} ${fx(y)}) rotate(${fx(face.rot)}) scale(1 ${fx(face.ry/face.rx)})`,class:cls},parent);
}
function drawChipFace(g,fill){
  el('circle',{class:'chip-rim',r:CHIP_R},g);
  el('circle',{class:'chip '+fill,r:CHIP_R*0.84},g);
  for(let k=0;k<6;k++){const a=k*Math.PI/3+Math.PI/6;el('rect',{class:'notch',x:-9,y:-6,width:18,height:12,rx:2,transform:`rotate(${fx(a*180/Math.PI+90)} ${fx(Math.cos(a)*CHIP_R*0.92)} ${fx(Math.sin(a)*CHIP_R*0.92)}) translate(${fx(Math.cos(a)*CHIP_R*0.92)} ${fx(Math.sin(a)*CHIP_R*0.92)})`},g);}
  el('circle',{class:'chip-in',r:CHIP_R*0.5},g);
}
/* back to front: a stack lying on another one is drawn after it, and of two stacks that do not touch,
   the one nearer the player (larger y) is drawn after, so tall piles in front cover the ones behind */
function drawOrder(list,lv,idx){
  const src=id=>lv.stacks.find(o=>o.id===id)||list.find(o=>o.id===id);
  const box=new Map(list.map(s=>[s.id,hitBox(src(s.id))]));
  const before=(a,b)=>{const A=src(a.id),B=src(b.id);
    if(boxesOverlap(box.get(a.id),box.get(b.id))&&A.layer!==B.layer)return A.layer<B.layer;
    if(A.y!==B.y)return A.y<B.y;
    return A.layer!==B.layer?A.layer<B.layer:idx.get(a.id)<idx.get(b.id);};
  const left=list.slice(),out=[];
  while(left.length){
    let k=left.findIndex(a=>!left.some(b=>b!==a&&before(b,a)));
    if(k<0)k=left.reduce((m,a,i)=>src(a.id).layer<src(left[m].id).layer?i:m,0);
    out.push(left.splice(k,1)[0]);
  }
  return out;
}
function renderBoard(){
  board.innerHTML='';
  const defs=el('defs',{},board);
  const pat=el('pattern',{id:'hatch',width:18,height:18,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'},defs);
  el('rect',{width:9,height:18,fill:'rgba(255,255,255,.28)'},pat);
  const lv=L();
  const play=mode==='play'&&game;
  const chains=buildChains(lv.stacks,layoutOpts);
  const fr=frameOf(lv,chains);
  // table
  const t=fr.table;
  el('rect',{class:'table-rim',x:t.x0-36,y:t.y0-36,width:t.x1-t.x0+72,height:t.y1-t.y0+72,rx:110},board);
  el('rect',{class:'table',x:t.x0,y:t.y0,width:t.x1-t.x0,height:t.y1-t.y0,rx:80},board);
  // grid
  const g0=el('g',{},board),step=50;
  const gx0=Math.floor(view.x/step)*step-step*20,gx1=view.x+view.w+step*20,gy0=Math.floor(view.y/step)*step-step*20,gy1=view.y+view.h+step*20;
  let d='';for(let x=gx0;x<=gx1;x+=step)d+=`M${x} ${gy0}V${gy1}`;for(let y=gy0;y<=gy1;y+=step)d+=`M${gx0} ${y}H${gx1}`;
  el('path',{d,class:'grid'},g0);
  el('path',{d:`M${gx0} 0H${gx1}M0 ${gy0}V${gy1}`,class:'axis'},g0);
  renderFrame(fr,lv,play);
  if(refImg)el('image',{href:refImg.src,x:refImg.x,y:refImg.y,width:refImg.w,height:refImg.w*refImg.ar,opacity:refImg.opacity,class:'refimg'},board);
  const list=play?game.stacks.filter(s=>!s.gone):lv.stacks;
  const idx=new Map(lv.stacks.map((s,i)=>[s.id,i]));
  const order=drawOrder(list,lv,idx);
  const rest=restingChains(list.map(s=>lv.stacks.find(o=>o.id===s.id)||s),chains,play?new Map(game.stacks.map(g=>[g.id,g.left])):null);
  const startG=play?game:newGame(lv),rem=remaining(startG);
  const solIdx=new Map();(lv.solution||[]).forEach((id,i)=>{if(!solIdx.has(id))solIdx.set(id,i+1);});
  const layerG=el('g',{},board),over=el('g',{},board);
  // only the top stack of each pile shows its face; the ones under it are covered by its chips
  const topOf=new Map();list.forEach(s=>{const c=chains.get(s.id);if(!c)return;const k=c.root.id,cur=topOf.get(k);if(!cur||c.start>cur.start)topOf.set(k,{id:s.id,start:c.start});});
  order.forEach(s=>{
    const src=lv.stacks.find(o=>o.id===s.id)||s;
    const gs=startG.stacks.find(o=>o.id===s.id);
    const blocked=gs&&!gs.gone&&!!blockerOf(gs,rem);
    const hiddenNow=src.hidden&&(play?!(gs&&gs.revealed):false);
    const lockN=play?(gs?gs.lockN:0):(+src.lock||0);
    const count=play?gs.left:(+src.count||0);
    const ch=rest.get(src.id)||chains.get(src.id),ax=pileAxis(ch?ch.root:src,layoutOpts);
    const chips=chipsOf(src,ch,layoutOpts,count);
    const cls=['stk'];if(blocked&&(showFree||play))cls.push('blocked');if(!blocked&&showFree&&!play)cls.push('free');if(!play&&sel.has(s.id))cls.push('sel');
    const g=el('g',{class:cls.join(' '),'data-id':s.id},layerG);
    el('title',{},g).textContent=`${s.id} · ${cname(src.color)} · ${count} chips · layer ${src.layer}${src.hidden?' · hidden':''}${lockN?' · locked '+lockN:''}${blocked?' · covered':''}`;
    const fill=hiddenNow?'fh':fcls(src.color);
    chips.forEach(c=>{const sd=chipDisc(g,c.x,c.y,ax.face,'side');el('circle',{class:'chip '+fill,r:CHIP_R},sd);el('circle',{class:'chip-edge',r:CHIP_R},sd);});
    if(!chips.length)return;
    if(ch&&topOf.get(ch.root.id)&&topOf.get(ch.root.id).id!==s.id){if(showBoxes||(!play&&sel.has(s.id))){const h=hitBox(src);el('rect',{class:'foot'+(sel.has(s.id)?' on':''),x:h.x0,y:h.y0,width:h.x1-h.x0,height:h.y1-h.y0},over);}return;}
    const last=chips[chips.length-1],fx0=last.x+ax.step[0],fy0=last.y+ax.step[1];
    const face=chipDisc(g,fx0,fy0,ax.face,'face');
    drawChipFace(face,fill);
    if(src.hidden&&!hiddenNow)el('circle',{r:CHIP_R,fill:'url(#hatch)','pointer-events':'none'},face);
    if(lockN>0)el('circle',{class:'ice',r:CHIP_R*0.98},face);
    const lab=el('g',{class:'lab',transform:`translate(${fx(fx0)} ${fx(fy0)})`},g);
    if(hiddenNow)el('text',{class:'q',x:0,y:0},lab).textContent='?';
    else el('text',{class:'cnt',x:0,y:0},lab).textContent=count;
    el('text',{class:'meta',x:0,y:-CHIP_R-14},lab).textContent=s.id;
    if(lockN>0){const b=el('g',{class:'lockb',transform:`translate(${CHIP_R*0.75} ${CHIP_R*0.55})`},lab);el('circle',{r:26},b);el('text',{x:0,y:1},b).textContent=lockN;}
    if(showOrder&&!play&&solIdx.has(s.id)){
      const b=el('g',{transform:`translate(${-CHIP_R*0.8} ${CHIP_R*0.6})`},lab);
      el('circle',{class:'ordc',r:21},b);el('text',{class:'ord',x:0,y:1},b).textContent=solIdx.get(s.id);
    }
    if(showBoxes||(!play&&sel.has(s.id))){const h=hitBox(src);el('rect',{class:'foot'+(sel.has(s.id)?' on':''),x:h.x0,y:h.y0,width:h.x1-h.x0,height:h.y1-h.y0},over);}
  });
  // on_stack links for the selection
  if(!play)lv.stacks.forEach(s=>{if(s.on_stack&&sel.has(s.id)){const p=lv.stacks.find(o=>o.id===s.on_stack);if(p)el('line',{class:'link',x1:s.x,y1:s.y,x2:p.x,y2:p.y},over);}});
}

/* ---------- poles + waiting tray, drawn above the table like the game screen ---------- */
/* a pole as the game draws it: a peg standing in a colored ring; in Play test the chips on it stack up the peg */
function poleInner(p,shut,play){
  const ring=shut?'ring-hid':fcls(p.color);
  let discs='';
  if(play&&p.fill>0){const n=Math.max(1,Math.round(p.fill/p.cap*12));for(let k=0;k<n;k++)discs+=`<rect class="disc ${fcls(p.color)}" x="17" y="${(43-k*3.2).toFixed(1)}" width="24" height="3" rx="1.2"/>`;}
  return `<ellipse class="${ring}" cx="29" cy="51" rx="27" ry="12.5"/><ellipse class="under" cx="29" cy="51" rx="27" ry="12.5"/>
    <ellipse class="${ring}" cx="29" cy="46" rx="27" ry="12.5"/>
    <ellipse class="hole" cx="29" cy="46" rx="10" ry="4.6"/>
    <rect class="rod" x="23" y="2" width="12" height="45" rx="6"/><rect class="rodhi" x="25.5" y="5" width="3" height="38" rx="1.5"/>
    ${discs}${shut?'<text class="qm" x="29" y="49">?</text>':''}`;
}
function renderFrame(fr,lv,play){
  const g=el('g',{class:'frame'},board);
  // poles: in Play test each queue drops the cleared poles, so the next one moves down to the bottom row
  const items=[];
  if(play){
    for(let q=0;q<fr.n;q++){
      const act=activeOf(game,q);
      game.queues[q].filter(i=>!game.poles[i].done).forEach((i,k)=>{const p=game.poles[i];items.push({i,q,k,color:p.color,cap:p.cap,hidden:p.hidden,fill:p.fill,bottom:p===act});});
    }
  }else lv.targets.forEach((tg,i)=>{const q=i%fr.n,k=Math.floor(i/fr.n);items.push({i,q,k,color:tg.color,cap:tg.capacity,hidden:!!tg.hidden,fill:0,bottom:k===0});});
  const cx=(fr.table.x0+fr.table.x1)/2,polesBottom=fr.tray.y0-FRAME.trayGap,W=FRAME.poleW,H=fr.poleH;
  items.sort((a,b)=>b.k-a.k).forEach(p=>{
    const x=cx+(p.q-(fr.n-1)/2)*FRAME.colGap-W/2,y=polesBottom-H-p.k*FRAME.rowGap,shut=p.hidden&&!p.bottom;
    const pg=el('g',{class:'pole'+(!play&&selPole===p.i?' on':''),'data-pole':p.i},g);
    el('title',{},pg).textContent=`Pole ${p.i+1}: ${cname(p.color)}, ${p.cap} chips${p.hidden?', hidden until it reaches the bottom':''}${p.bottom?' · at the bottom, taking chips':''}`;
    if(!play&&selPole===p.i)el('rect',{class:'pole-sel',x:x-20,y:y-20,width:W+40,height:H+40,rx:60},pg);
    const sv=el('svg',{x,y,width:W,height:H,viewBox:'0 0 58 64',overflow:'visible'},pg);
    sv.innerHTML=poleInner(p,shut&&play,play);
    el('text',{class:'pole-n',x:x+W/2,y:y+H+70},pg).textContent=(shut&&play?'?':(play?p.fill+'/'+p.cap:p.cap))+(p.hidden&&!(shut&&play)?' ?':'');
  });
  for(let q=0;q<fr.n;q++)el('text',{class:'queue-n',x:cx+(q-(fr.n-1)/2)*FRAME.colGap,y:polesBottom-H-(fr.rows-1)*FRAME.rowGap-40},g).textContent=`Queue ${q+1}`;
  // waiting tray: one slot per waiting chip
  const tr=fr.tray,cap=lv.buffer_capacity|0,buf=play?game.buffer:[];
  el('rect',{class:'tray-rim',x:tr.x0,y:tr.y0,width:tr.x1-tr.x0,height:tr.y1-tr.y0,rx:70},g);
  el('rect',{class:'tray',x:tr.x0+40,y:tr.y0+40,width:tr.x1-tr.x0-80,height:tr.y1-tr.y0-80,rx:40},g);
  const tot=Math.max(cap,buf.length,1),inner=tr.x1-tr.x0-140,sw=inner/tot;
  for(let i=0;i<tot;i++){
    const c=buf[i],x=tr.x0+70+i*sw;
    const w=sw*0.76,h=tr.y1-tr.y0-150;
    el('rect',{class:'slot'+(c?' full':'')+(i>=cap?' over':''),x:x+sw*0.12,y:tr.y0+75,width:w,height:h,rx:Math.min(30,sw*0.35)},g);
    if(c){const k=Math.min(w,h)*0.46/CHIP_R,cg=el('g',{class:'tray-chip',transform:`translate(${fx(x+sw/2)} ${fx(tr.y0+75+h/2)}) scale(${fx(k)})`},g);drawChipFace(cg,fcls(c));}
  }
  el('text',{class:'tray-n',x:tr.x1,y:tr.y0-40},g).textContent=play?`Waiting ${buf.length} / ${cap}`:`Waiting slots: ${cap}`;
}

/* ---------- inspector ---------- */
function fld(label,key,inner,cls){return `<label class="fld${cls?' '+cls:''}"><span>${label}${key?` <code>${key}</code>`:''}</span>${inner}</label>`;}
function num(id,v,extra){return `<input type="number" id="${id}" value="${v==null?'':esc(v)}" ${extra||''}>`;}
function swatches(id,val){return `<div class="swatches" id="${id}">${COLORS.map((c,i)=>`<button type="button" class="sw b${i}" data-color="${ckey(i)}" aria-pressed="${val===ckey(i)}" title="${c} (${ckey(i)})">${i}</button>`).join('')}</div>`;}
function renderPane(){
  $$('#tabs [data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
  const p=$('#pane'),lv=L();
  if(tab==='level'){
    const tc=tally(lv),cards=lv.stacks.reduce((a,s)=>a+(+s.count||0),0),layers=new Set(lv.stacks.map(s=>s.layer)).size;
    p.innerHTML=`<h2>Level settings</h2>
      <div class="fields">
        ${fld('Level id','id',`<input id="fId" value="${esc(lv.id)}">`,'full')}
        ${fld('Difficulty','hard',`<select id="fHard"><option value="0"${lv.hard?'':' selected'}>Normal</option><option value="1"${lv.hard?' selected':''}>Hard</option></select>`)}
        ${fld('Pole queues','n_slots',num('fSlots',lv.n_slots,'min="1" max="8"'))}
        ${fld('Waiting slots (chips)','buffer_capacity',num('fBuf',lv.buffer_capacity,'min="1"'))}
        ${fld('Revision','revision',num('fRev',lv.revision))}
        ${fld('Seed','seed',num('fSeed',lv.seed))}
        ${fld('FTUE key (blank for none)','ftue',`<input id="fFtue" value="${esc(lv.ftue||'')}" placeholder="ftue.l1">`,'full')}
      </div>
      <h3>Chips and poles by color</h3>
      <table class="tally"><thead><tr><th>Color</th><th>Stacks</th><th>Chips</th><th>Poles</th><th>Spaces</th></tr></thead><tbody>
      ${tc.map(r=>`<tr><td><span class="sw ${bcls(r.color)}" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;border-radius:3px"></span> ${cname(r.color)}</td><td>${r.stacks}</td><td${r.cards!==r.cap?' class="x"':''}>${r.cards}</td><td>${r.poles}</td><td${r.cards!==r.cap?' class="x"':''}>${r.cap}</td></tr>`).join('')}
      <tr><th>Total</th><th>${lv.stacks.length}</th><th>${cards}</th><th>${lv.targets.length}</th><th>${lv.targets.reduce((a,t)=>a+(+t.capacity||0),0)}</th></tr></tbody></table>
      <p class="hint">${layers} layer${layers===1?'':'s'}. Chips of each color must exactly fill the poles of that color.</p>
      <div class="btns"><button class="btn" id="autoPoles" type="button">Rebuild poles from chips</button></div>
      <p class="hint">Makes one pole of ${levelCap(lv)} for every ${levelCap(lv)} chips of a color and deals them across the queues. Undo brings the old poles back.</p>
      <h3>Elements in this level</h3>
      <ul class="issues">
        <li class="${lv.stacks.some(s=>s.hidden)?'ok':''}"><b>Hidden Chip Stack</b>: ${lv.stacks.filter(s=>s.hidden).length} <code>stacks[].hidden</code></li>
        <li class="${lv.targets.some(t=>t.hidden)?'ok':''}"><b>Hidden Color Pole</b>: ${lv.targets.filter(t=>t.hidden).length} <code>targets[].hidden</code></li>
        <li class="${lv.stacks.some(s=>s.lock)?'ok':''}"><b>Locked Chip Stack</b>: ${lv.stacks.filter(s=>s.lock).length} <code>stacks[].lock</code></li>
      </ul>
      <h3>Chip drawing</h3>
      <p class="hint">How the editor draws the chip piles. This only changes the picture, never the level JSON. Every pile is an upright stack that twists like a spiral: <code>spread_direction</code> picks the side the spiral starts from, and <code>spread_angle</code> picks how much it twists (0 is straight).</p>
      <div class="fields">
        ${fld('Twist per chip, per 1° of spread_angle (°)','',num('lyTwist',layoutOpts.twist,'min="0" step="0.05"'))}
        ${fld('Spiral swing (units)','',num('lySpiralR',layoutOpts.spiralR,'min="0"'))}
        ${fld('Camera pitch (°)','',num('lyPitch',layoutOpts.pitch,'min="10" max="90"'))}
        ${fld('Chip thickness (units)','',num('lyChipT',layoutOpts.chipT,'min="1"'))}
                ${fld('Pile join distance (units)','',num('lyChain',layoutOpts.chainDist,'min="0"'))}
      </div>
      <div class="btns"><button class="btn" type="button" id="lyReset">Reset drawing</button></div>
      <h3>Game screenshot overlay</h3>
      <p class="hint">Put a screenshot from the game behind the table to line the layout up. It stays on this page and is not saved.</p>
      <div class="btns"><input type="file" id="refFile" accept="image/*" aria-label="Game screenshot"></div>
      ${refImg?`<div class="fields" style="margin-top:8px">
        ${fld('Opacity','',`<input type="range" id="refOp" min="0" max="1" step="0.05" value="${refImg.opacity}">`,'full')}
        ${fld('Width (units)','',num('refW',Math.round(refImg.w)))}
        ${fld('Left x','',num('refX',Math.round(refImg.x)))}
        ${fld('Top y','',num('refY',Math.round(refImg.y)))}
      </div><div class="btns"><button class="btn" type="button" id="refClear">Remove screenshot</button></div>`:''}
      <h3>Shortcuts</h3>
      <div class="keys"><kbd>A</kbd><span>Add a stack</span><kbd>T</kbd><span>Add a stack on top of the selected one</span><kbd>Ctrl D</kbd><span>Duplicate</span><kbd>Del</kbd><span>Delete</span><kbd>[ ]</kbd><span>Layer down, up</span><kbd>Arrows</kbd><span>Nudge by the snap step, Shift for ×5</span><kbd>H</kbd><span>Toggle hidden</span><kbd>Shift drag</kbd><span>Box select</span><kbd>Wheel</kbd><span>Zoom, drag the table to pan</span><kbd>P</kbd><span>Switch Edit and Play test</span></div>`;
  }else if(tab==='stack'){
    const ss=lv.stacks.filter(s=>sel.has(s.id));
    if(!ss.length){p.innerHTML=`<h2>Stack</h2><p class="hint">Select a stack on the table, or add one with <kbd>A</kbd>.</p><div class="btns"><button class="btn primary" type="button" data-act="add">Add a stack</button></div>`;return;}
    if(ss.length>1){
      const c=ss.every(s=>s.color===ss[0].color)?ss[0].color:'';
      p.innerHTML=`<h2>${ss.length} stacks selected</h2>
        <h3>Color</h3>${swatches('mColor',c)}
        <h3>Layer</h3><div class="btns"><button class="btn" type="button" data-act="laydown">Layer −1</button><button class="btn" type="button" data-act="layup">Layer +1</button></div>
        <h3>Elements</h3>
        <div class="btns"><button class="btn" type="button" id="mHidOn">Make hidden</button><button class="btn" type="button" id="mHidOff">Not hidden</button></div>
        <div class="fields" style="margin-top:8px">${fld('Lock countdown (0 = not locked)','lock',num('mLock','', 'min="0" placeholder="mixed"'))}${fld('Chips in each','count',num('mCount','', 'min="1" placeholder="mixed"'))}</div>
        <div class="btns"><button class="btn" type="button" data-act="dup">Duplicate</button><button class="btn" type="button" data-act="del">Delete</button></div>`;
      return;
    }
    const s=ss[0],others=lv.stacks.filter(o=>o.id!==s.id);
    p.innerHTML=`<h2>Stack ${esc(s.id)}</h2>
      <div class="fields">
        ${fld('Id','id',`<input id="sId" value="${esc(s.id)}">`)}
        ${fld('Chips','count',num('sCount',s.count,'min="1"'))}
        ${fld('X (bottom chip)','x',num('sX',s.x))}
        ${fld('Y (bottom chip)','y',num('sY',s.y))}
        ${fld('Width','w',num('sW',s.w,'min="10"'))}
        ${fld('Height','h',num('sH',s.h,'min="10"'))}
        ${fld('Layer','layer',num('sLayer',s.layer,'min="0"'))}
        ${fld('Sits on','on_stack',`<select id="sOn"><option value="">nothing</option>${others.map(o=>`<option value="${esc(o.id)}"${s.on_stack===o.id?' selected':''}>${esc(o.id)} (layer ${o.layer})</option>`).join('')}</select>`)}
      </div>
      <h3>Color <code style="font:11px var(--mono)">color</code></h3>${swatches('sColor',s.color)}
      <h3>Pile</h3>
      <div class="fields">
        <label class="chk"><input type="checkbox" id="sSpread"${s.spread?' checked':''}> Spread <code style="font:11px var(--mono);color:var(--muted)">spread</code></label>
        <label class="chk"><input type="checkbox" id="sFan"${s.fan?' checked':''}> Fan <code style="font:11px var(--mono);color:var(--muted)">fan</code></label>
        ${fld('Direction','spread_direction',`<select id="sDir"><option value="1"${s.spread_direction!==-1?' selected':''}>1 (forward)</option><option value="-1"${s.spread_direction===-1?' selected':''}>−1 (backward)</option></select>`)}
        ${fld('Angle (degrees)','spread_angle',num('sAng',s.spread_angle,'step="1"'))}
      </div>
      <h3>Elements</h3>
      <div class="elem"><label class="chk"><input type="checkbox" id="sHidden"${s.hidden?' checked':''}> <b>Hidden Chip Stack</b></label><p class="hint">Shows grey with a “?” until nothing covers it. Unlocks at level 7. Saved as <code>"hidden": true</code>.</p></div>
      <div class="elem"><label class="chk"><input type="checkbox" id="sLocked"${s.lock?' checked':''}> <b>Locked Chip Stack</b></label>
        <div class="fields">${fld('Poles to clear','lock',num('sLock',s.lock||'', 'min="1" max="20"'+(s.lock?'':' disabled')))}</div>
        <p class="hint">Counts down once nothing covers it, one per cleared pole. Unlocks at level 17. Saved as <code>"lock": n</code>.</p></div>
      <div class="btns"><button class="btn" type="button" data-act="ontop">Add a stack on top</button><button class="btn" type="button" data-act="dup">Duplicate</button><button class="btn" type="button" data-act="del">Delete</button></div>`;
  }else if(tab==='poles'){
    const n=Math.max(1,lv.n_slots|0);
    p.innerHTML=`<h2>Poles</h2>
      <p class="hint">Pole order matters. Pole 1 goes to queue 1, pole 2 to queue 2, and so on, wrapping after queue ${n}. The first pole in each queue starts at the bottom.</p>
      <div class="fields" style="margin:8px 0">${fld('Pole queues','n_slots',num('pSlots',lv.n_slots,'min="1" max="8"'))}${fld('Default capacity','',num('pDefCap',levelCap(lv),'min="1"'))}</div>
      <div id="poleRows">${lv.targets.map((t,i)=>`<div class="prow${selPole===i?' on':''}" data-row="${i}">
        <span class="pc ${bcls(t.color)}"></span>
        <select data-pf="color" aria-label="Pole ${i+1} color">${COLORS.map((c,k)=>`<option value="${ckey(k)}"${t.color===ckey(k)?' selected':''}>${k} ${c}</option>`).join('')}${cidx(t.color)<0?`<option selected>${esc(t.color)}</option>`:''}</select>
        <input type="number" min="1" data-pf="capacity" value="${esc(t.capacity)}" aria-label="Pole ${i+1} capacity">
        <label class="chk" title="Hidden Color Pole: grey until it reaches the bottom. Unlocks at level 12."><input type="checkbox" data-pf="hidden"${t.hidden?' checked':''}> ?</label>
        <span class="ops"><span class="qtag">Q${i%n+1}·${Math.floor(i/n)+1}</span><button class="ib" type="button" data-pop="up" aria-label="Move pole ${i+1} up">↑</button><button class="ib" type="button" data-pop="down" aria-label="Move pole ${i+1} down">↓</button><button class="ib" type="button" data-pop="del" aria-label="Delete pole ${i+1}">✕</button></span>
      </div>`).join('')}</div>
      <div class="btns"><button class="btn primary" type="button" id="pAdd">Add pole</button><button class="btn" type="button" id="autoPoles">Rebuild from chips</button><button class="btn" type="button" id="pShuffle">Shuffle order</button></div>
      <p class="hint">“?” marks a <b>Hidden Color Pole</b>, saved as <code>"hidden": true</code> on the pole. Q2·1 means queue 2, first in line.</p>`;
  }else if(tab==='check'){
    const iss=issuesCache,sol=lv.solution||[],v=sol.length?verify(lv):null;
    p.innerHTML=`<h2>Check</h2>
      <ul class="issues">${iss.length?iss.map(i=>`<li class="${i.k}">${i.t}</li>`).join(''):'<li class="ok">No problems found. The saved solution clears the level.</li>'}</ul>
      <h3>Saved solution · ${sol.length} moves</h3>
      <div class="sol">${sol.map((id,i)=>`<span class="${v&&!v.ok&&i===v.step?'fail':''}">${i+1}·${esc(id)}</span>`).join('')||'<span class="hint">none</span>'}</div>
      <div class="btns"><button class="btn" type="button" id="cPlay">Step through in Play test</button><button class="btn" type="button" id="cSolve">Find a solution</button><button class="btn" type="button" id="cClear">Clear solution</button></div>
      <div class="msg" id="solveMsg"></div>
      <h3>How the check plays the level</h3>
      <p class="hint">Pole <i>i</i> goes to queue <i>i</i> mod <code>n_slots</code>. A stack is covered by any stack on a higher layer, of another color, whose footprint overlaps it. The footprint is the <code>w</code> × <code>h</code> box that starts at the bottom chip (<code>x</code>, <code>y</code>) and runs in the spread direction. Turn on Footprints to see them. Chips with no pole wait in the slots, and the level is lost when more than <code>buffer_capacity</code> chips wait. These rules replay all 40 saved solutions from the sheet without a failure.</p>`;
  }else if(tab==='json'){
    p.innerHTML=`<h2>Level JSON</h2>
      <p class="hint">Edit and press Apply, or paste a whole level here. Same format as the Level column of the sheet.</p>
      <textarea class="code" id="jText" spellcheck="false" aria-label="Level JSON">${esc(JSON.stringify(lv,null,2))}</textarea>
      <div class="btns"><button class="btn primary" type="button" id="jApply">Apply</button><button class="btn" type="button" id="jCopy">Copy</button>${inFrame?'':'<button class="btn" type="button" id="jDl">Download .json</button>'}<button class="btn" type="button" id="jRevert">Revert to sheet</button></div>
      <div class="msg" id="jMsg"></div>`;
  }
}
function refreshChecks(){
  issuesCache=check(L(),levels);
  const b=$('#chkBadge'),st=statusOf(issuesCache);
  b.textContent=issuesCache.length;b.className='badge'+(st==='ok'?'':' '+st);
}

/* ---------- edits ---------- */
const int=v=>{const n=parseInt(v,10);return isNaN(n)?0:n;};
function nextId(lv){
  const ids=lv.stacks.map(s=>s.id),pad=ids.some(i=>/^s0\d/.test(i));
  let n=0;ids.forEach(i=>{const m=/^s(\d+)$/.exec(i);if(m)n=Math.max(n,+m[1]+1);});
  let id;do{id='s'+(pad?String(n).padStart(2,'0'):n);n++;}while(ids.includes(id));return id;
}
function makeStack(lv,o){
  return Object.assign({id:nextId(lv),x:0,y:0,w:150,h:206,layer:0,color:'color_0',count:6,fan:false,spread:true,on_stack:null,spread_direction:1,spread_angle:0},o||{});
}
function addStack(onTop){
  const lv=L();let s;
  const base=lv.stacks.find(o=>sel.has(o.id));
  if(onTop&&base)s=makeStack(lv,{x:base.x,y:base.y,w:base.w,h:base.h,layer:base.layer+1,color:base.color,count:base.count,spread_direction:base.spread_direction,spread_angle:base.spread_angle,on_stack:base.id});
  else{const cx=Math.round((view.x+view.w/2)/snap)*snap,cy=Math.round(vy(view.y+view.h/2)/snap)*snap;s=makeStack(lv,{x:cx,y:cy});}
  lv.stacks.push(s);sel=new Set([s.id]);tab='stack';commit();renderAll();
}
function dupSel(){
  const lv=L(),ss=lv.stacks.filter(s=>sel.has(s.id));if(!ss.length)return;
  const map={},news=[];
  ss.forEach(s=>{const c=clone(s);c.id=nextId(lv);map[s.id]=c.id;c.x+=40;lv.stacks.push(c);news.push(c);});
  news.forEach(c=>{if(c.on_stack&&map[c.on_stack])c.on_stack=map[c.on_stack];});
  sel=new Set(news.map(c=>c.id));commit();renderAll();
}
function delSel(){
  const lv=L();if(!sel.size)return;
  lv.stacks=lv.stacks.filter(s=>!sel.has(s.id));
  lv.stacks.forEach(s=>{if(s.on_stack&&sel.has(s.on_stack))s.on_stack=null;});
  if(Array.isArray(lv.solution))lv.solution=lv.solution.filter(id=>!sel.has(id));
  sel.clear();commit();renderAll();
}
function layerSel(d){L().stacks.forEach(s=>{if(sel.has(s.id))s.layer=Math.max(0,s.layer+d);});commit();renderAll();}
function nudge(dx,dy){L().stacks.forEach(s=>{if(sel.has(s.id)){s.x+=dx;s.y+=flipY?-dy:dy;}});commit();renderBoard();renderPane();}
function setHidden(s,on){if(on)s.hidden=true;else delete s.hidden;}
function setLock(s,n){if(n>0)s.lock=n;else delete s.lock;}
function renameStack(lv,s,nid){
  if(!nid||nid===s.id)return true;
  if(lv.stacks.some(o=>o.id===nid)){toast(`${nid} is already used in this level.`);return false;}
  const old=s.id;s.id=nid;
  lv.stacks.forEach(o=>{if(o.on_stack===old)o.on_stack=nid;});
  if(Array.isArray(lv.solution))lv.solution=lv.solution.map(i=>i===old?nid:i);
  if(sel.has(old)){sel.delete(old);sel.add(nid);}
  return true;
}
/* the pole size this level uses: its first pole's capacity, 18 when it has none */
function levelCap(lv){return (lv.targets&&lv.targets[0]&&+lv.targets[0].capacity)||18;}
function rebuildPoles(){
  const lv=L(),n=Math.max(1,lv.n_slots|0),cap=int(($('#pDefCap')||{}).value)||levelCap(lv);
  const by=new Map();lv.stacks.forEach(s=>by.set(s.color,(by.get(s.color)||0)+(+s.count||0)));
  const colors=[...by.keys()].sort((a,b)=>cidx(a)-cidx(b));
  const groups=colors.map(c=>{const out=[];let left=by.get(c);while(left>0){out.push({color:c,capacity:Math.min(cap,left)});left-=cap;}return out;});
  const flat=[];let more=true;while(more){more=false;groups.forEach(g=>{if(g.length){flat.push(g.shift());more=true;}});}
  const old=lv.targets;lv.targets=flat.map(t=>{const o=old.find(x=>x.color===t.color&&x.hidden);return o?Object.assign(t,{hidden:true}):t;});
  selPole=-1;commit();renderAll();toast(`Made ${flat.length} poles across ${n} queues.`);
}

/* ---------- pane events ---------- */
const pane=$('#pane');
pane.addEventListener('change',e=>{
  const t=e.target,lv=L(),id=t.id;
  if(tab==='level'&&/^ly/.test(id)){
    const v=t.value;
    if(id==='lyTwist')layoutOpts.twist=Math.max(0,+v||0);
    if(id==='lySpiralR')layoutOpts.spiralR=Math.max(0,+v||0);
    if(id==='lyPitch')layoutOpts.pitch=Math.min(90,Math.max(10,+v||0));
    if(id==='lyChipT')layoutOpts.chipT=Math.max(1,+v||0);
    if(id==='lyFanGap')layoutOpts.fanGap=+v||0;
    if(id==='lyChain')layoutOpts.chainDist=Math.max(0,+v||0);
    savePrefs();renderBoard();renderPane();return;
  }
  if(tab==='level'&&id==='refFile'){
    const f=t.files&&t.files[0];if(!f)return;
    const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{
      const ar=im.naturalHeight/im.naturalWidth,w=view.w*0.6;
      refImg={src:r.result,ar,w,x:view.x+view.w*0.2,y:view.y+view.h*0.05,opacity:0.5};renderBoard();renderPane();};im.src=r.result;};
    r.readAsDataURL(f);return;
  }
  if(tab==='level'&&/^ref/.test(id)){refInput(t);return;}
  if(tab==='level'){
    if(id==='fId'){const v=t.value.trim();if(v)lv.id=v;}
    if(id==='fHard')setHard(lv,t.value==='1');
    if(id==='fSlots'||id==='pSlots')lv.n_slots=Math.max(1,int(t.value));
    if(id==='fBuf')lv.buffer_capacity=Math.max(1,int(t.value));
    if(id==='fRev')lv.revision=int(t.value);
    if(id==='fSeed')lv.seed=int(t.value);
    if(id==='fFtue'){const v=t.value.trim();if(v)lv.ftue=v;else if('ftue' in lv)lv.ftue=null;}
    commit();renderAll();return;
  }
  if(tab==='stack'){
    const ss=lv.stacks.filter(s=>sel.has(s.id));if(!ss.length)return;
    if(ss.length>1){
      if(id==='mLock'&&t.value!=='')ss.forEach(s=>setLock(s,int(t.value)));
      if(id==='mCount'&&t.value!=='')ss.forEach(s=>s.count=Math.max(1,int(t.value)));
      commit();renderAll();return;
    }
    const s=ss[0];
    if(id==='sId'){if(!renameStack(lv,s,t.value.trim())){t.value=s.id;return;}}
    if(id==='sCount')s.count=Math.max(1,int(t.value));
    if(id==='sX')s.x=int(t.value);
    if(id==='sY')s.y=int(t.value);
    if(id==='sW')s.w=Math.max(10,int(t.value));
    if(id==='sH')s.h=Math.max(10,int(t.value));
    if(id==='sLayer')s.layer=Math.max(0,int(t.value));
    if(id==='sOn'){s.on_stack=t.value||null;const p=lv.stacks.find(o=>o.id===s.on_stack);if(p&&s.layer<=p.layer)s.layer=p.layer+1;}
    if(id==='sSpread')s.spread=t.checked;
    if(id==='sFan')s.fan=t.checked;
    if(id==='sDir')s.spread_direction=int(t.value);
    if(id==='sAng')s.spread_angle=int(t.value);
    if(id==='sHidden')setHidden(s,t.checked);
    if(id==='sLocked')setLock(s,t.checked?(s.lock||2):0);
    if(id==='sLock')setLock(s,int(t.value));
    commit();renderAll();return;
  }
  if(tab==='poles'){
    if(id==='pSlots'){lv.n_slots=Math.max(1,int(t.value));commit();renderAll();return;}
    const row=t.closest('[data-row]');if(!row)return;const i=+row.dataset.row,tg=lv.targets[i],f=t.dataset.pf;
    if(f==='color')tg.color=t.value;
    if(f==='capacity')tg.capacity=Math.max(1,int(t.value));
    if(f==='hidden'){if(t.checked)tg.hidden=true;else delete tg.hidden;}
    selPole=i;commit();renderAll();
  }
});
pane.addEventListener('click',e=>{
  const t=e.target,lv=L();
  const sw=t.closest('.sw[data-color]');
  if(sw){lv.stacks.forEach(s=>{if(sel.has(s.id))s.color=sw.dataset.color;});commit();renderAll();return;}
  const act=t.closest('[data-act]');
  if(act){const a=act.dataset.act;
    if(a==='add')addStack(false);if(a==='ontop')addStack(true);if(a==='dup')dupSel();if(a==='del')delSel();if(a==='layup')layerSel(1);if(a==='laydown')layerSel(-1);return;}
  if(t.id==='mHidOn'||t.id==='mHidOff'){lv.stacks.forEach(s=>{if(sel.has(s.id))setHidden(s,t.id==='mHidOn');});commit();renderAll();return;}
  if(t.id==='autoPoles'){rebuildPoles();return;}
  if(t.id==='lyReset'){layoutOpts=Object.assign({},LAYOUT_DEFAULTS);savePrefs();renderBoard();renderPane();return;}
  if(t.id==='refClear'){refImg=null;renderBoard();renderPane();return;}
  if(t.id==='pAdd'){
    const used=new Set(lv.targets.map(x=>x.color));const need=tally(lv).find(r=>r.cards>r.cap);
    lv.targets.push({color:need?need.color:(lv.targets.length?lv.targets[lv.targets.length-1].color:'color_0'),capacity:int(($('#pDefCap')||{}).value)||levelCap(lv)});
    selPole=lv.targets.length-1;commit();renderAll();return;}
  if(t.id==='pShuffle'){const a=lv.targets;for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}commit();renderAll();return;}
  const pop=t.closest('[data-pop]');
  if(pop){const i=+pop.closest('[data-row]').dataset.row,a=lv.targets,op=pop.dataset.pop;
    if(op==='up'&&i>0){[a[i-1],a[i]]=[a[i],a[i-1]];selPole=i-1;}
    if(op==='down'&&i<a.length-1){[a[i+1],a[i]]=[a[i],a[i+1]];selPole=i+1;}
    if(op==='del'){a.splice(i,1);selPole=-1;}
    commit();renderAll();return;}
  const row=t.closest('[data-row]');if(row&&!t.closest('select,input,label')){selPole=+row.dataset.row;renderBoard();renderPane();return;}
  if(t.id==='cPlay'){setMode('play');replayIdx=0;toast('Press “Step solution” to play the saved moves one at a time.');return;}
  if(t.id==='cClear'){delete lv.solution;lv.solution=[];commit();renderAll();return;}
  if(t.id==='cSolve'){
    const m=$('#solveMsg');m.className='msg';m.textContent='Searching…';
    setTimeout(()=>{const r=solve(lv,400000);
      if(r.moves){lv.solution=r.moves;commit();renderAll();const mm=$('#solveMsg');if(mm){mm.className='msg ok';mm.textContent=`Found a ${r.moves.length}-move solution after ${r.nodes.toLocaleString()} positions and saved it.`;}}
      else{m.className='msg bad';m.textContent=r.capped?`Stopped after ${r.nodes.toLocaleString()} positions without a win. The level may still be solvable; try play testing it.`:`No way to win without boosters. Every order of taps overflows the waiting slots or gets stuck (${r.nodes.toLocaleString()} positions tried).`;}
    },30);return;}
  if(t.id==='jApply'){
    const m=$('#jMsg');
    try{const o=JSON.parse($('#jText').value);const lvl=pickLevel(o);if(!lvl)throw new Error('This JSON has no "stacks" and "targets" lists.');
      levels[cur]=lvl;sel.clear();selPole=-1;commit();fit();renderAll();const mm=$('#jMsg');if(mm){mm.className='msg ok';mm.textContent='Applied.';}}
    catch(err){m.className='msg bad';m.textContent='Could not read the JSON: '+err.message;}
    return;}
  if(t.id==='jCopy'){copyText(JSON.stringify(lv,null,2),'Level JSON copied.',$('#jText'));return;}
  if(t.id==='jDl'){download(lv.id+'.json',JSON.stringify(lv,null,2));return;}
  if(t.id==='jRevert'){const o=origById(lv.id);if(!o){toast('This level is not in the sheet.');return;}levels[cur]=clone(o);sel.clear();commit();fit();renderAll();toast('Back to the sheet version. Undo to get your edits back.');return;}
});
function refInput(t){
  if(!refImg)return;const v=+t.value;
  if(t.id==='refOp')refImg.opacity=v;if(t.id==='refW'&&v>0)refImg.w=v;if(t.id==='refX')refImg.x=v;if(t.id==='refY')refImg.y=v;
  renderBoard();
}
pane.addEventListener('input',e=>{
  const t=e.target;
  if(tab==='level'&&/^ref(Op|W|X|Y)$/.test(t.id)){refInput(t);return;}
  if(tab==='stack'&&/^s[XYWH]$|^sLayer$|^sAng$/.test(t.id)){
    const s=L().stacks.find(o=>sel.has(o.id));if(!s)return;
    const v=int(t.value);({sX:()=>s.x=v,sY:()=>s.y=v,sW:()=>s.w=Math.max(10,v),sH:()=>s.h=Math.max(10,v),sLayer:()=>s.layer=Math.max(0,v),sAng:()=>s.spread_angle=v})[t.id]();
    renderBoard();
  }
});

/* ---------- board pointer ---------- */
let drag=null,drawQueued=false;
board.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==1)return;
  const w=toWorld(e),stk=e.target.closest('.stk'),pole=e.target.closest('[data-pole]');
  if(pole&&e.button===0){poleTap(+pole.dataset.pole);return;}
  board.setPointerCapture(e.pointerId);
  if(mode==='play'){
    if(stk)playTap(stk.dataset.id,stk);
    else drag={kind:'pan',sx:e.clientX,sy:e.clientY,vx:view.x,vy:view.y,moved:false};
    return;
  }
  if(stk&&e.button===0){
    const id=stk.dataset.id;
    if(e.shiftKey||e.metaKey||e.ctrlKey){if(sel.has(id))sel.delete(id);else sel.add(id);}
    else if(!sel.has(id))sel=new Set([id]);
    const starts=L().stacks.filter(s=>sel.has(s.id)).map(s=>({s,x:s.x,y:s.y}));
    drag={kind:'move',w0:w,starts,moved:false};
    tab='stack';renderBoard();renderPane();
  }else if(e.shiftKey&&e.button===0){
    drag={kind:'marq',w0:w,rect:el('rect',{class:'marq',x:w.x,y:w.y,width:0,height:0},board)};
  }else{
    drag={kind:'pan',sx:e.clientX,sy:e.clientY,vx:view.x,vy:view.y,moved:false};
  }
});
board.addEventListener('pointermove',e=>{
  const w=toWorld(e);
  $('#coords').textContent=`x ${Math.round(w.x)} · y ${Math.round(vy(w.y))}`;
  if(!drag)return;
  if(drag.kind==='pan'){
    const r=board.getBoundingClientRect(),k=view.w/r.width;
    if(Math.abs(e.clientX-drag.sx)+Math.abs(e.clientY-drag.sy)>3)drag.moved=true;
    view.x=drag.vx-(e.clientX-drag.sx)*k;view.y=drag.vy-(e.clientY-drag.sy)*k;setViewBox();
  }else if(drag.kind==='move'){
    const dx=w.x-drag.w0.x,dy=w.y-drag.w0.y;
    if(!drag.moved&&Math.hypot(dx,dy)<4)return;
    drag.moved=true;
    drag.starts.forEach(o=>{
      o.s.x=Math.round((o.x+dx)/snap)*snap;
      o.s.y=Math.round((o.y+(flipY?-dy:dy))/snap)*snap;
    });
    if(!drawQueued){drawQueued=true;requestAnimationFrame(()=>{drawQueued=false;renderBoard();});}
  }else if(drag.kind==='marq'){
    const x=Math.min(w.x,drag.w0.x),y=Math.min(w.y,drag.w0.y);
    Object.entries({x,y,width:Math.abs(w.x-drag.w0.x),height:Math.abs(w.y-drag.w0.y)}).forEach(([k,v])=>drag.rect.setAttribute(k,v));
  }
});
function endDrag(e){
  if(!drag)return;
  const d=drag;drag=null;
  if(d.kind==='move'){if(d.moved)commit();renderAll();}
  else if(d.kind==='marq'){
    const w=toWorld(e),x0=Math.min(w.x,d.w0.x),x1=Math.max(w.x,d.w0.x),y0=Math.min(w.y,d.w0.y),y1=Math.max(w.y,d.w0.y);
    L().stacks.forEach(s=>{const cy=vy(s.y);if(s.x>=x0&&s.x<=x1&&cy>=y0&&cy<=y1)sel.add(s.id);});
    tab='stack';renderAll();
  }else if(d.kind==='pan'){
    if(!d.moved&&mode==='edit'){sel.clear();renderBoard();renderPane();}
    renderBoard();
  }
}
board.addEventListener('pointerup',endDrag);
board.addEventListener('pointercancel',endDrag);
board.addEventListener('wheel',e=>{e.preventDefault();const w=toWorld(e);zoom(e.deltaY>0?1.12:1/1.12,w.x,w.y);renderBoard();},{passive:false});

/* ---------- play test ---------- */
function setMode(m){
  mode=m;
  $('#modeEdit').setAttribute('aria-pressed',String(m==='edit'));$('#modePlay').setAttribute('aria-pressed',String(m==='play'));
  $$('[data-edit]').forEach(x=>x.hidden=m!=='edit');$$('[data-play]').forEach(x=>x.hidden=m!=='play');
  if(m==='play')startGame();else{game=null;booster=null;$('#banner').hidden=true;}
  renderAll();
}
function startGame(){game=newGame(L());gameHist=[];booster=null;boostUse={hand:0,shuffle:0,magnet:0};replayIdx=0;syncBoost();banner();}
function pushHist(){gameHist.push({g:snapGame(game),b:clone(boostUse)});}
function banner(text,kind){
  const b=$('#banner');
  if(game&&game.state!=='play'){b.hidden=false;b.className='banner '+game.state;b.textContent=(game.state==='won'?'Level cleared. ':'Level lost. ')+game.msg;return;}
  if(text){b.hidden=false;b.className='banner '+(kind||'info');b.textContent=text;return;}
  b.hidden=true;
}
function playTap(id,node){
  if(!game||game.state!=='play')return;
  pushHist();
  let r;
  if(booster==='hand'){r=tap(game,id,true);if(!r){boostUse.hand++;booster=null;}}
  else r=tap(game,id,false);
  if(r){gameHist.pop();if(node){node.classList.remove('shake');void node.getBBox();node.classList.add('shake');}
    banner(r==='blocked'?`${id} is covered by another stack.`:r==='locked'?`${id} is locked. Clear more poles first.`:'',r?'info':'');setTimeout(()=>banner(),1400);}
  else banner();
  syncBoost();renderBoard();
}
function syncBoost(){
  $('#bHand').setAttribute('aria-pressed',String(booster==='hand'));$('#bMagnet').setAttribute('aria-pressed',String(booster==='magnet'));
  $('#bHandN').textContent=boostUse.hand+' used';$('#bShuffleN').textContent=boostUse.shuffle+' used';$('#bMagnetN').textContent=boostUse.magnet+' used';
  $('#pUndo').disabled=!gameHist.length;
  $('#pSave').disabled=!game||!game.moves.length;
}
$('#bHand').addEventListener('click',()=>{if(!game||game.state!=='play')return;booster=booster==='hand'?null:'hand';syncBoost();banner(booster?'Hand: tap any stack.':'');});
$('#bMagnet').addEventListener('click',()=>{if(!game||game.state!=='play')return;booster=booster==='magnet'?null:'magnet';syncBoost();banner(booster?'Magnet: tap any pole.':'');});
$('#bShuffle').addEventListener('click',()=>{if(!game||game.state!=='play')return;pushHist();boosterShuffle(game);boostUse.shuffle++;booster=null;syncBoost();banner();renderBoard();});
function poleTap(i){
  if(mode==='play'){
    if(booster==='magnet'&&game.state==='play'){pushHist();boosterMagnet(game,i);boostUse.magnet++;booster=null;syncBoost();banner();renderBoard();}
    return;
  }
  selPole=i;tab='poles';renderBoard();renderPane();
}
$('#pUndo').addEventListener('click',()=>{const h=gameHist.pop();if(!h)return;restoreGame(game,h.g);boostUse=h.b;booster=null;syncBoost();banner();renderBoard();});
$('#pRestart').addEventListener('click',()=>{startGame();renderBoard();});
$('#pReplay').addEventListener('click',()=>{
  const sol=L().solution||[];
  if(!sol.length){banner('This level has no saved solution yet.');return;}
  if(game.moves.length!==replayIdx||game.state!=='play'){startGame();}
  if(replayIdx>=sol.length){banner('That was the last saved move.');return;}
  const id=sol[replayIdx];pushHist();const r=tap(game,id,false);
  if(r){gameHist.pop();banner(`Move ${replayIdx+1} (${id}) can't be played: ${r}.`,'lost');}
  else{replayIdx++;if(game.state==='play')banner(`Move ${replayIdx} of ${sol.length}: ${id}`);else banner();}
  syncBoost();renderBoard();
});
$('#pSave').addEventListener('click',()=>{
  if(!game||!game.moves.length)return;
  const used=boostUse.hand+boostUse.shuffle+boostUse.magnet;
  L().solution=game.moves.slice();commit();refreshChecks();
  toast(`Saved ${game.moves.length} moves as the solution.`+(used?' Boosters were used, so the check may not replay it.':''));
});

/* ---------- toolbar ---------- */
$('#modeEdit').addEventListener('click',()=>setMode('edit'));
$('#modePlay').addEventListener('click',()=>setMode('play'));
$('#tUndo').addEventListener('click',doUndo);$('#tRedo').addEventListener('click',doRedo);
$('#tAdd').addEventListener('click',()=>addStack(false));
$('#tOnTop').addEventListener('click',()=>{if(!sel.size){toast('Select the stack to build on first.');return;}addStack(true);});
$('#tDup').addEventListener('click',dupSel);$('#tDel').addEventListener('click',delSel);
$('#tLayUp').addEventListener('click',()=>layerSel(1));$('#tLayDown').addEventListener('click',()=>layerSel(-1));
$('#snap').addEventListener('change',e=>{snap=+e.target.value;savePrefs();});
$('#tFree').addEventListener('click',e=>{showFree=!showFree;e.currentTarget.setAttribute('aria-pressed',String(showFree));savePrefs();renderBoard();});
$('#tOrder').addEventListener('click',e=>{showOrder=!showOrder;e.currentTarget.setAttribute('aria-pressed',String(showOrder));savePrefs();renderBoard();});
$('#tBoxes').addEventListener('click',e=>{showBoxes=!showBoxes;e.currentTarget.setAttribute('aria-pressed',String(showBoxes));savePrefs();renderBoard();});
$('#tCopy').addEventListener('click',()=>copyText(JSON.stringify(L(),null,2),'Level JSON copied.'));
$('#zIn').addEventListener('click',()=>{zoom(1/1.25);renderBoard();});
$('#zOut').addEventListener('click',()=>{zoom(1.25);renderBoard();});
$('#zFit').addEventListener('click',()=>{fit();renderBoard();});
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;tab=b.dataset.tab;renderPane();});

/* ---------- level list events ---------- */
$('#lvList').addEventListener('click',e=>{const b=e.target.closest('.lv');if(b)selectLevel(+b.dataset.i);});
$('#lvSearch').addEventListener('input',refreshList);
$('#lvNew').addEventListener('click',()=>{
  let n=levels.length+1,id;do{id='level_'+String(n).padStart(3,'0');n++;}while(levels.some(l=>l.id===id));
  const lv={id,hard:false,revision:1,seed:0,n_slots:3,buffer_capacity:26,targets:[{color:'color_0',capacity:18},{color:'color_1',capacity:18},{color:'color_2',capacity:18}],stacks:[],solution:[]};
  [['color_0',-200],['color_1',0],['color_2',200]].forEach(([c,x],k)=>{for(let r=0;r<3;r++)lv.stacks.push(makeStack(lv,{x,y:r*230,color:c,count:6}));});
  levels.splice(cur+1,0,lv);refreshAllStatus();selectLevel(cur+1);toast(`Added ${id} after the current level.`);
});
$('#lvDup').addEventListener('click',()=>{
  const c=clone(L());let n=2;const base=c.id;while(levels.some(l=>l.id===base+'_copy'+(n>2?n:'')))n++;
  c.id=base+'_copy'+(n>2?n:'');levels.splice(cur+1,0,c);refreshAllStatus();selectLevel(cur+1);toast(`Made ${c.id}.`);
});
$('#lvUp').addEventListener('click',()=>{if(cur<1)return;[levels[cur-1],levels[cur]]=[levels[cur],levels[cur-1]];[listStatus[cur-1],listStatus[cur]]=[listStatus[cur],listStatus[cur-1]];cur--;persist();refreshList();});
$('#lvDown').addEventListener('click',()=>{if(cur>=levels.length-1)return;[levels[cur+1],levels[cur]]=[levels[cur],levels[cur+1]];[listStatus[cur+1],listStatus[cur]]=[listStatus[cur],listStatus[cur+1]];cur++;persist();refreshList();});
function arm(btn,label,fn){
  if(btn.classList.contains('armed')){btn.classList.remove('armed');btn.textContent=btn.dataset.label;fn();return;}
  btn.dataset.label=btn.textContent;btn.classList.add('armed');btn.textContent=label;
  setTimeout(()=>{if(btn.classList.contains('armed')){btn.classList.remove('armed');btn.textContent=btn.dataset.label;}},3500);
}
$('#lvDel').addEventListener('click',e=>arm(e.currentTarget,'Confirm delete',()=>{
  if(levels.length<=1){toast('Keep at least one level.');return;}
  const id=L().id;levels.splice(cur,1);listStatus.splice(cur,1);cur=Math.min(cur,levels.length-1);persist();selectLevel(cur);toast(`Deleted ${id}.`);
}));
$('#btnReset').addEventListener('click',e=>arm(e.currentTarget,'Confirm reset',()=>{
  levels=clone(ORIGINAL);cur=0;savedBase=BASE;refreshAllStatus();persist();selectLevel(0);toast('All 40 levels are back to the sheet version.');
}));

/* ---------- import / export ---------- */
function pickLevel(o){
  if(o&&typeof o==='object'&&!Array.isArray(o)){
    if(Array.isArray(o.stacks)&&Array.isArray(o.targets))return o;
    if(o.Level)return pickLevel(typeof o.Level==='string'?JSON.parse(o.Level):o.Level);
  }
  return null;
}
function parseSheet(text){
  /* tab-separated rows as copied from Google Sheets or Excel, with quoted multi-line cells */
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;}
    else if(c==='"'&&cell==='')q=true;
    else if(c==='\t'){row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  const out=[];
  rows.forEach(r=>r.forEach(c=>{const s=c.trim();if(s.startsWith('{')){try{const l=pickLevel(JSON.parse(s));if(l)out.push(l);}catch(e){}}}));
  return out;
}
function parseAny(text){
  text=text.trim();if(!text)return [];
  try{const o=JSON.parse(text);
    if(Array.isArray(o))return o.map(pickLevel).filter(Boolean);
    const l=pickLevel(o);if(l)return [l];
    if(o&&Array.isArray(o.levels))return o.levels.map(pickLevel).filter(Boolean);
  }catch(e){}
  return parseSheet(text);
}
function openModal(title,body,foot){$('#dlgTitle').textContent=title;$('#dlgBody').innerHTML=body;$('#dlgFoot').innerHTML=foot;$('#modal').hidden=false;}
function closeModal(){$('#modal').hidden=true;}
$('#dlgX').addEventListener('click',closeModal);
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
$('#btnImport').addEventListener('click',()=>{
  openModal('Import levels',`<p class="hint">Paste one level, a list of levels, or rows copied straight from the sheet (Id and Level columns). You can also pick a .json file.</p>
    <textarea class="code" id="impText" spellcheck="false" aria-label="Level JSON to import" placeholder='{ "id": "level_041", ... }'></textarea>
    <div class="btns"><input type="file" id="impFile" accept=".json,.txt,.tsv,application/json"></div>
    <label class="chk" style="margin-top:8px"><input type="checkbox" id="impReplace" checked> Replace levels that have the same id</label>
    <div class="msg" id="impMsg"></div>`,
    `<button class="btn" type="button" id="impCancel">Cancel</button><button class="btn primary" type="button" id="impGo">Import</button>`);
  $('#impCancel').addEventListener('click',closeModal);
  $('#impFile').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{$('#impText').value=r.result;};r.readAsText(f);});
  $('#impGo').addEventListener('click',()=>{
    const got=parseAny($('#impText').value),m=$('#impMsg');
    if(!got.length){m.className='msg bad';m.textContent='No level found. A level needs "stacks" and "targets" lists.';return;}
    const rep=$('#impReplace').checked;let a=0,r=0,first=-1;
    got.forEach(lv=>{const i=rep?levels.findIndex(o=>o.id===lv.id):-1;
      if(i>=0){levels[i]=lv;r++;if(first<0)first=i;}else{levels.push(lv);a++;if(first<0)first=levels.length-1;}});
    refreshAllStatus();persist();closeModal();selectLevel(first);
    toast(`Imported ${got.length} level${got.length>1?'s':''}: ${r} replaced, ${a} added.`);
  });
  setTimeout(()=>$('#impText').focus(),30);
});
$('#btnExportAll').addEventListener('click',()=>{
  openModal('Export levels',`<p class="hint">Copy the levels in the format you need. Sheet rows paste straight into the Id and Level columns.</p>
    <div class="btns"><button class="btn primary" type="button" data-exp="sheet">Copy as sheet rows</button><button class="btn" type="button" data-exp="all">Copy all as a JSON list</button><button class="btn" type="button" data-exp="one">Copy this level</button>${inFrame?'':'<button class="btn" type="button" data-exp="dl">Download all .json</button>'}</div>
    <div class="msg" id="expMsg"></div>
    <textarea class="code" id="expText" spellcheck="false" aria-label="Exported text" readonly></textarea>`,
    `<button class="btn" type="button" id="expClose">Done</button>`);
  $('#expClose').addEventListener('click',closeModal);
  const out={
    sheet:()=>'Id\tLevel\n'+levels.map((lv,i)=>{const m=/(\d+)$/.exec(lv.id);return `${m?+m[1]:i+1}\t"${JSON.stringify(lv,null,2).replace(/"/g,'""')}"`;}).join('\n'),
    all:()=>JSON.stringify(levels,null,2),
    one:()=>JSON.stringify(L(),null,2)
  };
  $('#dlgBody').addEventListener('click',e=>{const b=e.target.closest('[data-exp]');if(!b)return;const k=b.dataset.exp;
    if(k==='dl'){download('card_slots_levels.json',out.all());return;}
    const txt=out[k]();$('#expText').value=txt;copyText(txt,k==='sheet'?`Copied ${levels.length} sheet rows.`:k==='all'?`Copied ${levels.length} levels.`:'Level JSON copied.',$('#expText'));});
});
function copyText(txt,ok,fallbackEl){
  const fail=()=>{if(fallbackEl){fallbackEl.value=txt;fallbackEl.focus();fallbackEl.select();toast('Copy is blocked here. The text is selected, press Ctrl+C.');}
    else{openModal('Copy JSON','<textarea class="code" id="cpText" readonly></textarea>','<button class="btn" type="button" id="cpClose">Done</button>');$('#cpText').value=txt;$('#cpText').select();$('#cpClose').addEventListener('click',closeModal);toast('Copy is blocked here. The text is selected, press Ctrl+C.');}};
  try{navigator.clipboard.writeText(txt).then(()=>toast(ok),fail);}catch(e){fail();}
}
function download(name,txt){
  try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'application/json'}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}catch(e){toast('Download is blocked here. Use Copy instead.');}
}
let toastT=0;
function toast(t){const n=$('#toast');n.textContent=t;n.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{n.hidden=true;},2600);}

/* ---------- keyboard ---------- */
document.addEventListener('keydown',e=>{
  if(!$('#modal').hidden){if(e.key==='Escape')closeModal();return;}
  const a=document.activeElement,typing=a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.tagName==='SELECT'||a.isContentEditable);
  if(typing)return;
  const k=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
  if(k==='p'&&!mod){setMode(mode==='edit'?'play':'edit');e.preventDefault();return;}
  if(mode==='play'){if(mod&&k==='z'){$('#pUndo').click();e.preventDefault();}return;}
  if(mod&&k==='z'&&!e.shiftKey){doUndo();e.preventDefault();return;}
  if(mod&&(k==='y'||(k==='z'&&e.shiftKey))){doRedo();e.preventDefault();return;}
  if(mod&&k==='d'){dupSel();e.preventDefault();return;}
  if(mod&&k==='a'){sel=new Set(L().stacks.map(s=>s.id));tab='stack';renderAll();e.preventDefault();return;}
  if(mod)return;
  if(k==='delete'||k==='backspace'){delSel();e.preventDefault();return;}
  if(k==='a'){addStack(false);return;}
  if(k==='t'&&sel.size){addStack(true);return;}
  if(k==='['){layerSel(-1);return;}if(k===']'){layerSel(1);return;}
  if(k==='h'&&sel.size){const on=!L().stacks.filter(s=>sel.has(s.id)).every(s=>s.hidden);L().stacks.forEach(s=>{if(sel.has(s.id))setHidden(s,on);});commit();renderAll();return;}
  if(k==='escape'){sel.clear();renderAll();return;}
  if(k==='f'){fit();renderBoard();return;}
  const st=snap*(e.shiftKey?5:1);
  if(sel.size&&k.startsWith('arrow')){e.preventDefault();nudge(k==='arrowleft'?-st:k==='arrowright'?st:0,k==='arrowup'?-st:k==='arrowdown'?st:0);}
});
document.addEventListener('paste',e=>{
  const a=document.activeElement;if(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'))return;
  const txt=(e.clipboardData||window.clipboardData).getData('text');const got=parseAny(txt||'');
  if(!got.length)return;e.preventDefault();
  if(got.length===1){const lv=got[0],i=levels.findIndex(o=>o.id===lv.id);
    if(i>=0){levels[i]=lv;selectLevel(i);refreshAllStatus();refreshList();toast(`Pasted over ${lv.id}. Undo is not available for this, use Revert to sheet if needed.`);}
    else{levels.push(lv);refreshAllStatus();selectLevel(levels.length-1);toast(`Pasted ${lv.id} as a new level.`);}}
  else{$('#btnImport').click();$('#impText').value=txt;}
});

/* ---------- render ---------- */
function renderAll(){
  $('#lvTitle').textContent=L().id;
  refreshChecks();renderBoard();renderPane();refreshList();syncUndo();
  if(mode==='play')syncBoost();
}
window.addEventListener('resize',()=>{const r=board.getBoundingClientRect();if(r.width&&r.height){view.h=view.w*r.height/r.width;setViewBox();renderBoard();}});

load();
if(savedBase!==BASE){$('#saveNote').textContent='The built-in levels were updated since you last saved here. Press Reset to sheet to load them. That replaces the edits saved in this browser, so export first if you want to keep them.';setTimeout(()=>toast('New built-in levels: press Reset to sheet to load them.'),400);}
$('#snap').value=String(snap);
$('#tBoxes').setAttribute('aria-pressed',String(showBoxes));$('#tFree').setAttribute('aria-pressed',String(showFree));$('#tOrder').setAttribute('aria-pressed',String(showOrder));
refreshAllStatus();resetHistory();
requestAnimationFrame(()=>{fit();renderAll();});
fit();renderAll();
window.__cs={levels:()=>levels,verify,solve,newGame,tap,check};
