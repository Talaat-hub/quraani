// Converts Tanzil quran-data.js into a typed TS module WITHOUT eval'ing the downloaded file.
// usage: node convert-tanzil.js <quran-data.js> <out.ts>
const fs = require('fs');
const [, , src, out] = process.argv;
const text = fs.readFileSync(src, 'utf8');

function block(name) {
  const m = text.match(new RegExp(`QuranData\\.${name} = \\[([\\s\\S]*?)\\n\\];`));
  if (!m) throw new Error('missing ' + name);
  return m[1];
}
function pairs(name) {
  return [...block(name).matchAll(/\[(\d+),\s*(\d+)\]/g)].map((m) => [+m[1], +m[2]]);
}
const suras = [...block('Sura').matchAll(/\[(\d+), (\d+), (\d+), (\d+), '([^']+)', "([^"]+)", '([^']*)', '(Meccan|Medinan)'\]/g)]
  .map((m) => ({ start: +m[1], ayas: +m[2], ar: m[5], tr: m[6], type: m[8] }));

const pages = pairs('Page');
const quarters = pairs('HizbQaurter');
const juz = pairs('Juz');

// Sanity checks against well-known facts.
const total = suras.reduce((s, x) => s + x.ayas, 0);
if (suras.length !== 114) throw new Error('suras ' + suras.length);
if (total !== 6236) throw new Error('total ' + total);
suras.forEach((s, i) => { if (i && s.start !== suras[i - 1].start + suras[i - 1].ayas) throw new Error('start ' + i); });

const header = `// GENERATED from Tanzil Quran Metadata v1.0 (https://tanzil.net/docs/quran_metadata)
// Copyright (C) 2008-2009 Tanzil.info — License: Creative Commons Attribution 3.0.
// Do not edit by hand. Regenerate with scripts/convert-tanzil.js.
// Pages = Madani Mushaf (604 pages, King Fahd Complex print); Hizb quarters = 240 rub' al-hizb marks.
// Arrays may end with a [115, 1] sentinel meaning "end of Quran".
`;
const ts = `${header}
export type SuraMeta = readonly [ayahCount: number, nameAr: string, nameEn: string, type: 'Meccan' | 'Medinan'];

/** Index 0 = Surah 1. */
export const SURAS: readonly SuraMeta[] = ${JSON.stringify(suras.map((s) => [s.ayas, s.ar, s.tr, s.type]))};

/** [surah, ayah] where each page starts. Index 0 = page 1. */
export const PAGE_STARTS: readonly (readonly [number, number])[] = ${JSON.stringify(pages)};

/** [surah, ayah] where each hizb quarter starts. Index 0 = quarter 1. */
export const HIZB_QUARTER_STARTS: readonly (readonly [number, number])[] = ${JSON.stringify(quarters)};

/** [surah, ayah] where each juz starts. Index 0 = juz 1. */
export const JUZ_STARTS: readonly (readonly [number, number])[] = ${JSON.stringify(juz)};
`;
fs.writeFileSync(out, ts);
console.log({ suras: suras.length, total, pages: pages.length, quarters: quarters.length, juz: juz.length, last: [pages.at(-1), quarters.at(-1), juz.at(-1)] });
