import {describe, it, expect} from 'vitest';
import levels from '../src/data/levels.json';
import {buildChains, hitBox, boxesOverlap, chipsOf, pileAxis} from '../src/layout.js';

const lv5 = levels.find(l => l.id === 'level_005');
const byId = id => lv5.stacks.find(s => s.id === id);

describe('levels 1 to 10 are laid out for chips', () => {
  const first10 = levels.slice(0, 10);
  it('every footprint is one chip', () => {
    for (const l of first10) for (const s of l.stacks) expect([s.w, s.h]).toEqual([150, 150]);
  });
  it('a stack only covers another when their chips really overlap', () => {
    for (const l of first10) for (const a of l.stacks) for (const b of l.stacks) {
      if (b.layer <= a.layer || !boxesOverlap(hitBox(a), hitBox(b))) continue;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(150);
    }
  });
  it('stacks that do not touch keep a clear gap', () => {
    for (const l of first10) for (const a of l.stacks) for (const b of l.stacks) {
      if (a.id >= b.id || boxesOverlap(hitBox(a), hitBox(b))) continue;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(190);
    }
  });
});

const lv8 = levels.find(l => l.id === 'level_008');
const s8 = id => lv8.stacks.find(s => s.id === id);

describe('chip piles are drawn as upright spirals', () => {
  const chains = buildChains(lv8.stacks);
  const xs = cs => cs.map(c => c.x);
  it('the bottom chip stands at x, y and the top stack carries the spiral on', () => {
    const red = chipsOf(s8('s07'), chains.get('s07'));
    expect(red[0]).toMatchObject({x: s8('s07').x, y: s8('s07').y});
    const yellow = chipsOf(s8('s08'), chains.get('s08'));
    const n = s8('s07').count, whole = chipsOf({...s8('s07'), count: n + s8('s08').count}, chains.get('s07'));
    expect(yellow[0].x).toBeCloseTo(whole[n].x);
    expect(yellow[0].y).toBeCloseTo(whole[n].y);
  });
  it('spread_angle 0 is a straight stack', () => {
    const c = chipsOf(s8('s07'), chains.get('s07'));
    expect(new Set(xs(c).map(x => x.toFixed(6))).size).toBe(1);
    expect(c[1].y).toBeLessThan(c[0].y);
  });
  it('spread_angle twists the stack, and spread_direction -1 starts it from the other side', () => {
    const base = {x: 0, y: 0, count: 8, spread: true, spread_angle: 90};
    const right = chipsOf({...base, spread_direction: 1}), left = chipsOf({...base, spread_direction: -1});
    expect(new Set(xs(right).map(x => x.toFixed(3))).size).toBeGreaterThan(1);
    right.forEach((c, i) => expect(left[i].x).toBeCloseTo(-c.x));
    const back = chipsOf({...base, spread_direction: 1, spread_angle: -90});
    expect(back[2].y).not.toBeCloseTo(right[2].y);
    const more = chipsOf({...base, spread_direction: 1, spread_angle: 145});
    expect(Math.abs(more[1].x)).toBeGreaterThan(Math.abs(right[1].x));
  });
});
