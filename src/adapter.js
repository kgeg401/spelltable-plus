import { normalize } from './core.js';

export const visible = el => Boolean(el?.isConnected && !el.closest('[hidden], [aria-hidden="true"]') && el.getClientRects().length);
const all = (root, selector) => [...root.querySelectorAll(selector)];
const exact = (root, selector, label) => all(root, selector).filter(visible).filter(el => normalize(el.textContent) === normalize(label));
export function setInput(input, value) {
  const win = input.ownerDocument.defaultView;
  const proto = input.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
}
export class SpellTableAdapter {
  constructor(doc = document) { this.doc = doc; this.ids = new WeakMap(); this.serial = 0; }
  commanderInputs() { return all(this.doc, 'input[placeholder]').filter(el => el.getAttribute('placeholder') === '+ Add commander').filter(visible); }
  lobbyCards() {
    // Confirmed against the public SpellTable lobby on 2026-09-21.
    const cards = all(this.doc, 'div.block.rounded.bg-surface-low');
    return cards.flatMap(card => {
      const title = card.querySelector('.text-xl');
      const join = exact(card, 'button', 'Join');
      const count = all(card, 'span').filter(el => !el.children.length)
        .map(el => el.textContent.match(/(?:^|\s)(\d+)\s*\/\s*(\d+)\s*$/)).find(Boolean);
      if (!visible(card) || !title || join.length !== 1 || !count) return [];
      if (!this.ids.has(join[0])) this.ids.set(join[0], ++this.serial);
      const players = Number(count[1]), capacity = Number(count[2]);
      return [{ title: title.textContent.trim(), players, capacity, button: join[0],
        key: `${this.ids.get(join[0])}:${title.textContent.trim()}`,
        open: capacity > 0 && players < capacity && !join[0].disabled }];
    });
  }
  join(card) {
    const fresh = this.lobbyCards().find(x => x.key === card.key && x.open);
    if (!fresh) throw new Error('That table is no longer available. Start again to find another.');
    fresh.button.click();
  }
  joinNow() {
    const buttons = exact(this.doc, 'button', 'Join Now');
    if (buttons.length !== 1 || buttons[0].disabled) return false;
    buttons[0].click(); return true;
  }
  localPlayer() {
    const lives = all(this.doc, 'input[aria-label="Life Total"]:not(:disabled)').filter(visible);
    if (lives.length !== 1) return null;
    let row = lives[0].parentElement;
    for (let i = 0; row && i < 4; i++, row = row.parentElement) {
      const trigger = row.querySelector('input[aria-describedby="playerpopover"]');
      if (trigger) return { row, trigger: trigger.parentElement };
    }
    return null;
  }
  async waitFor(find, signal, timeout = 6000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (signal?.aborted) throw new Error('Loadout application cancelled.');
      const result = find(); if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('SpellTable control did not appear. Use the native player menu and try again.');
  }
  async applyCommanders(deck, signal) {
    if (signal?.aborted) throw new Error('Loadout application cancelled.');
    const local = this.localPlayer();
    if (!local) throw new Error('Join as a player first. Your editable player panel is not available.');
    const names = deck.commanders;
    if (names.every(name => normalize(local.row.textContent).includes(normalize(name)))) return;
    const opened = this.commanderInputs().length === 0;
    if (opened) local.trigger.click();
    try {
      await this.waitFor(() => this.commanderInputs()[0] || all(this.doc, '#popover-container .border.bg-st-purple-light').find(visible), signal);
      const existing = all(this.doc, '#popover-container .border.bg-st-purple-light').filter(visible).map(el => normalize(el.textContent));
      if (existing.some(name => !names.map(normalize).includes(name))) {
        throw new Error('A different commander is already set. Clear it in your native player panel, then Apply commanders.');
      }
      for (const name of names) {
        if (normalize(local.row.textContent).includes(normalize(name))) continue;
        const input = await this.waitFor(() => this.commanderInputs()[0], signal);
        setInput(input, name);
        const option = await this.waitFor(() => {
          const results = exact(this.doc.querySelector('#popover-container') || this.doc, '[role="button"]', name);
          return results.length === 1 ? results[0] : null;
        }, signal);
        if (signal?.aborted) throw new Error('Loadout application cancelled.');
        option.click();
        await this.waitFor(() => normalize(local.row.textContent).includes(normalize(name)), signal);
      }
    } finally {
      // Close only the player popover, using the same trigger, never a random close control.
      if (opened && local.trigger.isConnected && (this.commanderInputs().length || all(this.doc, '#popover-container .border.bg-st-purple-light').some(visible))) local.trigger.click();
    }
  }
  async prepareDeckLink(url, signal) {
    const local = this.localPlayer();
    if (!local) throw new Error('Join as a player first to set your native deck link.');
    local.trigger.click();
    const edit = await this.waitFor(() => exact(this.doc.querySelector('#popover-container') || this.doc, 'div', 'Edit Decklist').find(el => el.children.length === 0), signal);
    edit.click();
    const input = await this.waitFor(() => all(this.doc, 'input[placeholder^="https://www.moxfield.com/decks/"]').find(visible), signal);
    setInput(input, url);
    input.focus(); // User submits the site-wide profile change in the native modal.
  }
  pasteChat(message) {
    const fields = all(this.doc, 'textarea, input[type="text"]').filter(visible).filter(el =>
      /^(?:send a message|type a message|message|chat message)(?:\.{3}|…)?$/i.test(el.getAttribute('placeholder') || el.getAttribute('aria-label') || ''));
    if (fields.length !== 1 || fields[0].value.trim()) return false;
    setInput(fields[0], message); fields[0].focus(); return true;
  }
}
