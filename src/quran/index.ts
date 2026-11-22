import { HIZB_QUARTER_STARTS, JUZ_STARTS, PAGE_STARTS, SURAS } from './data';

/** Stable Quran reference: Surah number (1-114) and Ayah number within it. */
export type AyahRef = { surah: number; ayah: number };
export type Range = { from: AyahRef; to: AyahRef };

/** Goal units. Hizb goals are expressed in quarters (1 = ربع حزب, 4 = حزب كامل). */
export type GoalUnit = 'ayah' | 'page' | 'quarter';

export const SURAH_COUNT = 114;
export const AYAH_COUNT = 6236;
export const PAGE_COUNT = 604;
export const QUARTER_COUNT = 240;

// First global ayah index (1-based) of every surah, plus a sentinel.
const SURAH_START: number[] = [1];
for (const [count] of SURAS) SURAH_START.push(SURAH_START[SURAH_START.length - 1] + count);

export const ayahCount = (surah: number) => SURAS[surah - 1][0];
export const surahName = (surah: number, lang: 'ar' | 'en') => SURAS[surah - 1][lang === 'ar' ? 1 : 2];

export function isValidRef(r: AyahRef): boolean {
  return Number.isInteger(r.surah) && Number.isInteger(r.ayah) &&
    r.surah >= 1 && r.surah <= SURAH_COUNT && r.ayah >= 1 && r.ayah <= ayahCount(r.surah);
}

/** Global sequential index, 1..6236 (Mushaf order). */
export function toIndex(r: AyahRef): number {
  if (!isValidRef(r)) throw new RangeError(`Invalid ayah ${r.surah}:${r.ayah}`);
  return SURAH_START[r.surah - 1] + r.ayah - 1;
}

export function fromIndex(i: number): AyahRef {
  if (!Number.isInteger(i) || i < 1 || i > AYAH_COUNT) throw new RangeError(`Invalid ayah index ${i}`);
  const s = upperBound(SURAH_START, i); // surah whose start <= i
  return { surah: s, ayah: i - SURAH_START[s - 1] + 1 };
}

export type RangeIssue = 'invalid_from' | 'invalid_to' | 'end_before_start';
export function validateRange(r: Range): RangeIssue | null {
  if (!isValidRef(r.from)) return 'invalid_from';
  if (!isValidRef(r.to)) return 'invalid_to';
  return toIndex(r.to) < toIndex(r.from) ? 'end_before_start' : null;
}

// Start indexes of pages / quarters / juz (sentinel [115,1] = AYAH_COUNT + 1).
const starts = (arr: readonly (readonly [number, number])[]) =>
  arr.map(([s, a]) => (s === 115 ? AYAH_COUNT + 1 : toIndex({ surah: s, ayah: a })));
const PAGE_START = starts(PAGE_STARTS);
const QUARTER_START = starts(HIZB_QUARTER_STARTS);
const JUZ_START = starts(JUZ_STARTS);

/** Largest k (1-based) with sorted[k-1] <= i. */
function upperBound(sorted: number[], i: number): number {
  let lo = 0, hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sorted[mid] <= i) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

export const pageOf = (i: number) => upperBound(PAGE_START, i);
export const quarterOf = (i: number) => upperBound(QUARTER_START, i);
export const juzOf = (i: number) => upperBound(JUZ_START, i);
export const hizbOf = (i: number) => Math.ceil(quarterOf(i) / 4);
export const pageAyahCount = (p: number) => PAGE_START[p] - PAGE_START[p - 1];
export const quarterAyahCount = (q: number) => QUARTER_START[q] - QUARTER_START[q - 1];
export const pageStartIndex = (p: number) => PAGE_START[p - 1];

/**
 * How much of a goal unit a single ayah is worth.
 * shortcut: pages/quarters are weighted by ayah count, not by letters, so a long ayah counts
 * the same as a short one on the same page. Upgrade by weighting with per-ayah text length.
 */
export function weight(unit: GoalUnit, i: number): number {
  if (unit === 'ayah') return 1;
  return unit === 'page' ? 1 / pageAyahCount(pageOf(i)) : 1 / quarterAyahCount(quarterOf(i));
}

/** Union of ranges as a sorted set of ayah indexes (overlaps are counted once). */
export function ayahSet(ranges: Range[]): Set<number> {
  const set = new Set<number>();
  for (const r of ranges) for (let i = toIndex(r.from); i <= toIndex(r.to); i++) set.add(i);
  return set;
}

/** Amount of `unit` covered by the ranges, counting each ayah once. */
export function measure(unit: GoalUnit, ranges: Range[]): number {
  let total = 0;
  for (const i of ayahSet(ranges)) total += weight(unit, i);
  return round(total);
}

export const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Portion of `amount` units starting at ayah index `start`. Stops at the end of the Quran.
 * Uses the same weights as `measure`, so measure(plan) >= amount unless the Quran ends first.
 */
export function planPortion(start: number, unit: GoalUnit, amount: number): Range {
  let end = start, acc = 0;
  for (; end <= AYAH_COUNT; end++) {
    acc += weight(unit, end);
    if (acc >= amount - 1e-9) break;
  }
  return { from: fromIndex(start), to: fromIndex(Math.min(end, AYAH_COUNT)) };
}

/** The ayah after `r`, wrapping to Al-Fatiha after An-Nas (a new khatma). */
export function nextAyah(r: AyahRef): AyahRef {
  const i = toIndex(r);
  return fromIndex(i === AYAH_COUNT ? 1 : i + 1);
}
