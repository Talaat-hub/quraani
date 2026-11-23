import { SURAS } from '../src/quran/data';
import {
  AYAH_COUNT, fromIndex, hizbOf, juzOf, measure, nextAyah, pageAyahCount, pageOf, planPortion,
  quarterAyahCount, quarterOf, surahName, toGoalAmount, toIndex, validateRange,
} from '../src/quran';

const r = (surah: number, ayah: number) => ({ surah, ayah });

describe('metadata integrity', () => {
  it('has 114 surahs and 6236 ayahs', () => {
    expect(SURAS).toHaveLength(114);
    expect(SURAS.reduce((s, x) => s + x[0], 0)).toBe(6236);
  });
  it('known surah sizes and names', () => {
    expect(SURAS[0][0]).toBe(7);
    expect(SURAS[1][0]).toBe(286);
    expect(SURAS[113][0]).toBe(6);
    expect(surahName(2, 'ar')).toBe('البقرة');
    expect(surahName(114, 'en')).toBe('An-Naas');
  });
  it('pages and quarters partition the whole Quran', () => {
    let pages = 0, quarters = 0;
    for (let p = 1; p <= 604; p++) pages += pageAyahCount(p);
    for (let q = 1; q <= 240; q++) quarters += quarterAyahCount(q);
    expect(pages).toBe(AYAH_COUNT);
    expect(quarters).toBe(AYAH_COUNT);
  });
  it('known Madani page / hizb / juz boundaries', () => {
    expect(pageOf(toIndex(r(1, 7)))).toBe(1);
    expect(pageOf(toIndex(r(2, 1)))).toBe(2);
    expect(pageOf(toIndex(r(2, 5)))).toBe(2);
    expect(pageOf(toIndex(r(2, 6)))).toBe(3);
    expect(pageOf(toIndex(r(3, 1)))).toBe(50);
    expect(pageOf(AYAH_COUNT)).toBe(604);
    expect(juzOf(toIndex(r(2, 142)))).toBe(2);
    expect(juzOf(toIndex(r(78, 1)))).toBe(30);
    expect(quarterOf(toIndex(r(2, 26)))).toBe(2);
    expect(quarterOf(toIndex(r(2, 25)))).toBe(1);
    expect(hizbOf(toIndex(r(2, 75)))).toBe(2);
    expect(quarterOf(AYAH_COUNT)).toBe(240);
  });
});

describe('references', () => {
  it('round-trips every ayah', () => {
    for (let i = 1; i <= AYAH_COUNT; i++) expect(toIndex(fromIndex(i))).toBe(i);
  });
  it('rejects invalid refs', () => {
    expect(() => toIndex(r(1, 8))).toThrow();
    expect(() => toIndex(r(115, 1))).toThrow();
    expect(() => toIndex(r(0, 1))).toThrow();
    expect(() => fromIndex(6237)).toThrow();
  });
  it('validates ranges', () => {
    expect(validateRange({ from: r(2, 1), to: r(2, 10) })).toBeNull();
    expect(validateRange({ from: r(2, 286), to: r(3, 10) })).toBeNull();
    expect(validateRange({ from: r(2, 10), to: r(2, 1) })).toBe('end_before_start');
    expect(validateRange({ from: r(2, 287), to: r(3, 1) })).toBe('invalid_from');
    expect(validateRange({ from: r(2, 1), to: r(1, 1) })).toBe('end_before_start');
  });
  it('wraps to Al-Fatiha after An-Nas', () => {
    expect(nextAyah(r(114, 6))).toEqual(r(1, 1));
    expect(nextAyah(r(2, 286))).toEqual(r(3, 1));
  });
});

describe('measure & plan', () => {
  it('counts ayahs across surahs, overlaps once', () => {
    expect(measure('ayah', [{ from: r(2, 286), to: r(3, 10) }])).toBe(11);
    expect(measure('ayah', [{ from: r(2, 1), to: r(2, 10) }, { from: r(2, 5), to: r(2, 12) }])).toBe(12);
  });
  it('full page measures 1', () => {
    expect(measure('page', [{ from: r(2, 1), to: r(2, 5) }])).toBe(1);
    expect(measure('page', [{ from: r(1, 1), to: r(2, 5) }])).toBe(2);
  });
  it('full hizb = 4 quarters, half = 2', () => {
    expect(measure('quarter', [{ from: r(2, 26), to: r(2, 74) }])).toBe(3);
    expect(measure('quarter', [{ from: r(1, 1), to: r(2, 74) }])).toBe(4);
  });
  it('planPortion matches measure for each unit', () => {
    expect(planPortion(toIndex(r(2, 1)), 'ayah', 10)).toEqual({ from: r(2, 1), to: r(2, 10) });
    expect(planPortion(toIndex(r(2, 1)), 'page', 1)).toEqual({ from: r(2, 1), to: r(2, 5) });
    expect(planPortion(toIndex(r(2, 26)), 'quarter', 2)).toEqual({ from: r(2, 26), to: r(2, 59) });
    for (const [unit, amt] of [['page', 2], ['quarter', 1], ['ayah', 7]] as const) {
      const p = planPortion(toIndex(r(18, 50)), unit, amt);
      expect(measure(unit, [p])).toBeGreaterThanOrEqual(amt);
    }
  });
  it('planPortion stops at the end of the Quran', () => {
    expect(planPortion(toIndex(r(114, 1)), 'page', 5).to).toEqual(r(114, 6));
  });
});

describe('custom goal amounts', () => {
  it.each([
    ['ayah', 20, 20], ['ayah', 6236, 6236], ['ayah', 6237, null], ['ayah', 2.5, null], ['ayah', 0, null],
    ['page', 3, 3], ['page', 604, 604], ['page', 605, null],
    ['quarter', 1.5, 6], ['quarter', 0.25, 1], ['quarter', 0.75, 3], ['quarter', 60, 240], ['quarter', 0.3, null], ['quarter', 61, null],
    ['ayah', NaN, null],
  ] as const)('%s %p -> %p', (unit, n, want) => expect(toGoalAmount(unit, n)).toBe(want));
});
