import { mkdirSync } from 'node:fs';

export const VIEWPORTS = {
  m360: [360, 740, true], m390: [390, 844, true], t768: [768, 1024, true],
  l1024: [1024, 768], d1440: [1440, 900], f1920: [1920, 1080], u3440: [3440, 1440],
};
export const pick = (arg) => { const only = arg?.split(','); return Object.entries(VIEWPORTS).filter(([n]) => !only || only.includes(n)); };
export const mkOut = () => { const OUT = process.env.SHOTS || '/tmp/shots'; mkdirSync(OUT, { recursive: true }); return OUT; };
