import {describe, it, expect} from 'vitest';
import levels from '../src/data/levels.json';
import {buildChains, cardsOf, hitBox} from '../src/layout.js';

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
