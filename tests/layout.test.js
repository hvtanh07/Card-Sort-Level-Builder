import {describe, it, expect} from 'vitest';
import levels from '../src/data/levels.json';
import {buildChains, cardsOf, hitBox, chipsOf, pileAxis, GAME_LEAN} from '../src/layout.js';

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

const G = {lean: GAME_LEAN};

describe('level 8 chip piles match the game build', () => {
  const chains = buildChains(lv8.stacks);
  it('the bottom chip stands at x, y and the top stack carries the column on', () => {
    const red = chipsOf(s8('s07'), chains.get('s07'));
    expect(red[0]).toMatchObject({x: 100, y: 560});
    const yellow = chipsOf(s8('s08'), chains.get('s08'));
    expect(yellow[0].x).toBeCloseTo(red[4].x + (red[4].x - red[3].x));
  });
  it('spread_angle 0 leans right and up, -1 leans left and up', () => {
    const r = pileAxis(s8('s07'), G).step, l = pileAxis(s8('s09'), G).step;
    expect(r[0]).toBeGreaterThan(0); expect(r[1]).toBeLessThan(0);
    expect(l[0]).toBeLessThan(0); expect(l[1]).toBeLessThan(0);
    expect(Math.atan2(-r[1], r[0]) * 180 / Math.PI).toBeCloseTo(39, -1);
  });
  it('spread_angle 40 leans flatter, 90 is seen nearly end on', () => {
    const a40 = pileAxis(s8('s00'), G).step, a90 = pileAxis(s8('s02'), G).step;
    expect(Math.atan2(-a40[1], a40[0]) * 180 / Math.PI).toBeCloseTo(20, -1);
    expect(Math.hypot(...a90)).toBeLessThan(2);
  });
});

describe('the editor draws piles upright by default', () => {
  it('every chip sits straight above the one below it', () => {
    for (const l of levels) for (const s of l.stacks) {
      if (s.fan) continue;
      const st = pileAxis(s).step;
      expect(Math.abs(st[0])).toBeLessThan(1e-9);
      expect(st[1]).toBeLessThan(0);
    }
  });
});
