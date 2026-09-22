import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, matches, moxfieldURL, validateDeck, shareText, MatchQueue } from '../src/core.js';

test('bracket aliases and token boundaries', () => {
  for (const title of ['B3 no mox', 'Bracket 3 no mox', 'br-3 no mox', 'BR3 NO MOX']) assert.ok(matches(title, 'BR4, BR3 no mox'));
  assert.equal(normalize('B4: Casual'), 'br4 casual');
  for (const title of ['BR30 no mox', 'BR3 mox allowed', 'BR3 no proxies, mox allowed', 'BR2 no mox']) assert.equal(matches(title, 'BR4, BR3 no mox'), false);
});
test('OR alternatives, AND words, exclusions and empty rule', () => {
  assert.ok(matches('Late night BR4', 'BR4, BR3 no mox'));
  assert.ok(matches('BR3 casual no mox', 'BR3 no mox'));
  assert.equal(matches('BR4 cEDH', 'BR4', 'cedh, precon'), false);
  assert.equal(matches('BR4', ', \n ,'), false);
  assert.equal(matches('BR4', 'BR4', 'bracket 4'), false);
  assert.ok(matches('BR3 | no-mox', 'br3 no mox'));
  assert.equal(matches('BR4', 'BR3 .*'), false);
});
test('Moxfield validation strips tracking and rejects lookalikes', () => {
  assert.equal(moxfieldURL('https://moxfield.com/decks/abc_123-/?utm_source=x#view'), 'https://www.moxfield.com/decks/abc_123-');
  for(const url of ['javascript:alert(1)','https://moxfield.com.evil.test/decks/a','http://moxfield.com/decks/a','https://user:pass@moxfield.com/decks/a','https://moxfield.com:8443/decks/a','https://moxfield.com/profile/test']) assert.throws(()=>moxfieldURL(url));
});
test('loadouts validate full commander fields and optional link', () => {
  const deck = validateDeck({name:' Krenko ',commanders:['Krenko, Mob Boss',''],url:''});
  assert.equal(deck.name, 'Krenko'); assert.equal(deck.commanders.length,1);
  assert.throws(()=>validateDeck({name:'',commanders:['X']}));
  assert.throws(()=>validateDeck({name:'Deck',commanders:[]}));
  assert.throws(()=>validateDeck({name:'Deck',commanders:['X','x']}));
  assert.match(shareText({...deck,url:'https://moxfield.com/decks/abc'}), /Krenko, Mob Boss: https:\/\/www.moxfield.com\/decks\/abc/);
});
test('countdown joins once and never rearms itself', () => {
  const q = new MatchQueue(5000), candidate = {key:'a',open:true};
  assert.equal(q.tick([candidate],0).kind,'stopped'); q.start();
  assert.equal(q.tick([candidate],0).seconds,5);
  assert.equal(q.tick([candidate],4999).kind,'countdown');
  assert.equal(q.tick([candidate],5000).kind,'join');
  assert.equal(q.tick([candidate],10000).kind,'stopped');
});
test('cancel, full table, disappearance and replacement reset countdown', () => {
  const q = new MatchQueue(5000), a={key:'a',open:true}, b={key:'b',open:true};q.start();q.tick([a],0);
  assert.equal(q.tick([{...a,open:false}],4000).kind,'waiting');
  assert.equal(q.tick([a],5000).seconds,5);
  assert.equal(q.tick([b],8000).seconds,5);
  q.stop();assert.equal(q.tick([b],20000).kind,'stopped');
});
