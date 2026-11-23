import type { GoalUnit } from '../quran';
import { round } from '../quran';
import { STRINGS, type Lang, type StringKey } from './strings';

export type { Lang, StringKey };
export type T = (key: StringKey, vars?: Record<string, string | number>) => string;

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** Arabic-Indic digits in Arabic, Western digits in English. */
export const fmtNum = (lang: Lang, n: number | string) =>
  lang === 'ar' ? String(n).replace(/\d/g, (d) => AR_DIGITS[+d]).replace('.', '٫') : String(n);

export function makeT(lang: Lang): T {
  return (key, vars) =>
    (STRINGS[lang][key] ?? STRINGS.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      vars?.[k] == null ? '' : typeof vars[k] === 'number' ? fmtNum(lang, vars[k]) : String(vars[k]));
}

/** Human goal text: "5 ayahs", "2 pages", "Half hizb", "2 hizb". Quarter amounts are shown in hizb. */
export function fmtAmount(t: T, unit: GoalUnit, amount: number): string {
  if (unit === 'ayah') return t('amount.ayah', { n: round(amount) });
  if (unit === 'page') return t('amount.page', { n: round(amount) });
  if ([1, 2, 3, 4].includes(amount)) return t(`amount.q${amount}` as StringKey);
  return t('amount.hizb', { n: round(amount / 4) });
}

/** Progress number in the display unit (hizb for quarter goals). */
export const displayQty = (unit: GoalUnit, n: number) => round(unit === 'quarter' ? n / 4 : n);

/** Parses a number typed with Western or Arabic-Indic digits ("1.5", "١٫٥", "1,5"); NaN if not a plain number. */
export function parseNum(s: string): number {
  const w = s.trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[٫,]/g, '.');
  return /^\d+(\.\d+)?$/.test(w) ? +w : NaN;
}
