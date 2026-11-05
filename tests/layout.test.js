import {describe, it, expect} from 'vitest';
import levels from '../src/data/levels.json';
import {buildChains, cardsOf, hitBox, chipsOf, pileAxis} from '../src/layout.js';

const lv5 = levels.find(l => l.id === 'level_005');
const byId = id => lv5.stacks.find(s => s.id === id);

describe('level 5 matches the game build', () => {
  const chains = buildChains(lv5.stacks);
  it('the stack on top carries on the pile below it', () => {
    expect(chains.get('s4').root.id).toBe('s0');
    expect(chains.get('s4').start).toBe(5);
    expect(chains.get('s9').root.id).toBe('s8');
    expect(chains.get('s9').start).toBe(6);
    expect(chains.get('s12').root.id).toBe('s10');
  });
  it('the first card sits at x, y and the pile runs toward spread_direction', () => {
    const left = cardsOf(byId('s0'), chains.get('s0'));
    expect(left[0]).toMatchObject({x: 0, y: 0});
    expect(left[4].x).toBeGreaterThan(0);
    const right = cardsOf(byId('s1'), chains.get('s1'));
    expect(right[4].x).toBeLessThan(580);
    const column = cardsOf(byId('s9'), chains.get('s9'));
    expect(column.at(-1).y).toBeGreaterThan(200);
  });
  it('the footprint starts at the first card', () => {
    const b = hitBox(byId('s8'));
    expect(b.y0).toBeCloseTo(-20 - 103);
    expect(b.y1).toBeCloseTo(-20 - 103 + 500);
  });
});

const lv8 = levels.find(l => l.id === 'level_008');
const s8 = id => lv8.stacks.find(s => s.id === id);

describe('chip piles are drawn as upright spirals', () => {
  const chains = buildChains(lv8.stacks);
  const xs = cs => cs.map(c => c.x);
  it('the bottom chip stands at x, y and the top stack carries the spiral on', () => {
    const red = chipsOf(s8('s07'), chains.get('s07'));
    expect(red[0]).toMatchObject({x: 100, y: 560});
    const yellow = chipsOf(s8('s08'), chains.get('s08'));
    const whole = chipsOf({...s8('s07'), count: 10}, chains.get('s07'));
    expect(yellow[0].x).toBeCloseTo(whole[5].x);
    expect(yellow[0].y).toBeCloseTo(whole[5].y);
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
