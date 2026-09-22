export function normalize(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase()
    .replace(/\b(?:bracket|br|b)\s*[-:]?\s*([1-5])\b/g, 'br$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Commas/newlines separate OR alternatives; tokens inside one rule are ANDed.
// Negative phrases stay contiguous: "no mox" must not match "no proxies, mox ok".
export function rules(text) {
  return String(text ?? '').split(/[,\n]/).map(normalize).filter(Boolean).map(rule =>
    rule.match(/\b(?:no|not|without)\s+\S+|\S+/g) ?? []);
}
export function matches(title, include, exclude = '') {
  const haystack = ` ${normalize(title)} `;
  const accepts = terms => terms.every(term => haystack.includes(` ${term} `));
  const wanted = rules(include);
  return wanted.length > 0 && wanted.some(accepts) && !rules(exclude).some(accepts);
}
export function moxfieldURL(value) {
  if (!String(value).trim()) return '';
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('Enter a complete Moxfield deck URL.'); }
  if (url.protocol !== 'https:' || !['moxfield.com', 'www.moxfield.com'].includes(url.hostname) ||
      url.port || url.username || url.password || !/^\/decks\/[\w-]+\/?$/.test(url.pathname)) {
    throw new Error('Use an https://www.moxfield.com/decks/… link.');
  }
  return `https://www.moxfield.com${url.pathname.replace(/\/$/, '')}`;
}
export function validateDeck(value) {
  const name = String(value.name ?? '').trim().slice(0, 80);
  const commanders = (value.commanders ?? []).map(x => String(x).trim()).filter(Boolean);
  if (!name) throw new Error('Give this loadout a name.');
  if (!commanders.length || commanders.length > 2 || commanders.some(x => x.length > 120)) {
    throw new Error('Enter one or two full commander names.');
  }
  if (new Set(commanders.map(normalize)).size !== commanders.length) throw new Error('Commander names must be different.');
  return { id: String(value.id || crypto.randomUUID()), name, commanders, url: moxfieldURL(value.url ?? ''),
    include: String(value.include ?? '').slice(0, 500), exclude: String(value.exclude ?? '').slice(0, 500) };
}
export function shareText(deck) { return `${deck.name} — ${deck.commanders.join(' + ')}: ${moxfieldURL(deck.url)}`; }

export class MatchQueue {
  constructor(delay = 5000) { this.delay = delay; this.stop(); }
  start() { this.active = true; this.pending = null; }
  stop() { this.active = false; this.pending = null; }
  tick(candidates, now) {
    if (!this.active) return { kind: 'stopped' };
    const candidate = candidates.find(x => x.open);
    if (!candidate) { this.pending = null; return { kind: 'waiting' }; }
    if (!this.pending || this.pending.key !== candidate.key) this.pending = { key: candidate.key, since: now };
    const remaining = this.delay - (now - this.pending.since);
    if (remaining > 0) return { kind: 'countdown', candidate, seconds: Math.ceil(remaining / 1000) };
    this.stop(); // One click per explicit Start, including if navigation fails.
    return { kind: 'join', candidate };
  }
}
