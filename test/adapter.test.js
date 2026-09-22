import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SpellTableAdapter, setInput } from '../src/adapter.js';
function setup(html) { const dom=new JSDOM(html);dom.window.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};return {dom,doc:dom.window.document,adapter:new SpellTableAdapter(dom.window.document)}; }
const card=(title,count='2/4')=>`<div class="block rounded bg-surface-low"><div class="text-xl">${title}</div><span>Players ${count}</span><button>Join</button></div>`;
test('read lobby titles and exclude full / malformed cards',()=>{
  const {adapter}=setup(card('BR3 no mox')+card('BR4 full','4/4')+card('Broken','??'));
  const cards=adapter.lobbyCards();assert.equal(cards.length,2);assert.ok(cards[0].open);assert.equal(cards[1].open,false);
});
test('join revalidates occupancy and identity immediately before click',()=>{
  const {doc,adapter}=setup(card('BR3 no mox'));let clicks=0;doc.querySelector('button').onclick=()=>clicks++;
  const candidate=adapter.lobbyCards()[0];doc.querySelector('span').textContent='Players 4/4';
  assert.throws(()=>adapter.join(candidate));assert.equal(clicks,0);
  doc.querySelector('span').textContent='Players 3/4';adapter.join(candidate);assert.equal(clicks,1);
  doc.querySelector('.text-xl').textContent='cEDH';assert.throws(()=>adapter.join(candidate));
});
test('chat insertion does not overwrite a draft or send',()=>{
  const {doc,adapter}=setup('<textarea placeholder="Type a message"></textarea><button>Send</button>');let sent=0;doc.querySelector('button').onclick=()=>sent++;
  assert.ok(adapter.pasteChat('deck link'));assert.equal(doc.querySelector('textarea').value,'deck link');assert.equal(sent,0);
  assert.equal(adapter.pasteChat('replace'),false);
});
test('ambiguous chat inputs fail closed',()=>{
  const {adapter}=setup('<textarea placeholder="Type a message"></textarea><textarea placeholder="Type a message"></textarea>');assert.equal(adapter.pasteChat('X'),false);
});
test('native input events support controlled framework fields',()=>{
  const {doc}=setup('<input>');const input=doc.querySelector('input');let observed='';input.addEventListener('input',()=>observed=input.value);setInput(input,'Krenko');assert.equal(observed,'Krenko');
});
test('local player detection ignores opponent disabled life inputs',()=>{
  const {adapter}=setup('<section><div><input aria-label="Life Total" disabled></div><div><input aria-describedby="playerpopover"></div></section><section id="self"><div><input aria-label="Life Total"></div><div><input aria-describedby="playerpopover"></div></section>');assert.equal(adapter.localPlayer().row.id,'self');
});
test('commander search selects exact name and verifies native row',async()=>{
  const {doc,adapter}=setup('<section id="self"><div><input aria-label="Life Total"></div><div id="trigger"><input aria-describedby="playerpopover"><span id="names"></span></div></section><div id="popover-container"></div>');
  doc.querySelector('#trigger').onclick=()=>{const pop=doc.querySelector('#popover-container');if(pop.children.length){pop.replaceChildren();return;}pop.innerHTML='<input placeholder="+ Add commander"><div role="button">Wrong card</div><div role="button" id="exact">Krenko, Mob Boss</div>';doc.querySelector('#exact').onclick=()=>doc.querySelector('#names').textContent='Krenko, Mob Boss';};
  await adapter.applyCommanders({commanders:['Krenko, Mob Boss']},new AbortController().signal);
  assert.equal(doc.querySelector('#names').textContent,'Krenko, Mob Boss');assert.equal(doc.querySelector('#popover-container').children.length,0);
});
test('aborted commander application does not select a card',async()=>{
  const {doc,adapter}=setup('<section><div><input aria-label="Life Total"></div><div><input aria-describedby="playerpopover"></div></section>');
  const c=new AbortController();c.abort();await assert.rejects(adapter.applyCommanders({commanders:['X']},c.signal),/cancelled/);
});
test('a different existing commander blocks adding the loadout',async()=>{
  const {doc,adapter}=setup('<section><div><input aria-label="Life Total"></div><div id="trigger"><input aria-describedby="playerpopover"><span>Other Commander</span></div></section><div id="popover-container"></div>');
  doc.querySelector('#trigger').onclick=()=>{const p=doc.querySelector('#popover-container');if(p.children.length){p.replaceChildren();return;}p.innerHTML='<div class="border bg-surface-high"><div class="border bg-st-purple-light">Other Commander</div><input placeholder="+ Add commander"></div>';};
  await assert.rejects(adapter.applyCommanders({commanders:['Krenko, Mob Boss']},new AbortController().signal),/different commander/);
  assert.equal(doc.querySelector('#popover-container').children.length,0);
});
