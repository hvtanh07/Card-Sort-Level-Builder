import {describe, it, expect} from 'vitest';
import levels from '../src/data/levels.json';
import {verify, check, solve, setHard} from '../src/engine.js';

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

describe('hard / normal flag', () => {
  it('levels 1-30 say hard true or false, right after id', () => {
    levels.slice(0, 30).forEach(lv => {
      expect(typeof lv.hard).toBe('boolean');
      expect(Object.keys(lv).slice(0, 2)).toEqual(['id', 'hard']);
    });
    expect(levels.slice(0, 30).filter(lv => lv.hard).map(lv => lv.id))
      .toEqual(['level_005', 'level_010', 'level_015', 'level_020', 'level_025', 'level_030']);
  });
  it('setHard keeps hard right after id', () => {
    const lv = {id: 'x', revision: 1, n_slots: 2};
    setHard(lv, true);
    expect(Object.keys(lv)).toEqual(['id', 'hard', 'revision', 'n_slots']);
    setHard(lv, false);
    expect(lv.hard).toBe(false);
  });
  it('check flags a hard value that is not true or false', () => {
    const lv = {...levels[0], hard: 'yes'};
    expect(check(lv).some(i => i.k === 'bad' && i.t.includes('hard'))).toBe(true);
  });
});
