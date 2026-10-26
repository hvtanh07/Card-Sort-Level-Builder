export const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const clone=o=>JSON.parse(JSON.stringify(o));
/* color_0..3 checked against the game build (level 5). color_4..7 follow the GDD color list and are not confirmed yet. */
export const COLORS=['Red','Blue','Yellow','Green','Pink','Orange','Purple','Cyan'];
export const ckey=i=>'color_'+i;
export const cidx=c=>{const m=/^color_(\d+)$/.exec(c||'');return m?+m[1]:-1;};
export const cname=c=>{const i=cidx(c);return i>=0&&i<COLORS.length?COLORS[i]:c;};
export const fcls=c=>{const i=cidx(c);return i>=0&&i<8?'f'+i:'fh';};
export const bcls=c=>{const i=cidx(c);return i>=0&&i<8?'b'+i:'bh';};
