import {describe, it, expect} from 'vitest';
import levels from '../src/data/levels.json';
import {verify, check, solve} from '../src/engine.js';

describe('the 40 sheet levels', () => {
  it.each(levels.map(l => [l.id, l]))('%s: saved solution clears the level', (id, lv) => {
    const v = verify(lv);
    expect(v.ok, v.why).toBe(true);
  });
  it.each(levels.map(l => [l.id, l]))('%s: no check problems', (id, lv) => {
    expect(check(lv, levels).map(i => i.t)).toEqual([]);
  });
  it('the solver finds a solution for every level', () => {
    for (const lv of levels) {
      const r = solve(lv, 200000);
      expect(r.moves, lv.id).toBeTruthy();
    }
  });
});
