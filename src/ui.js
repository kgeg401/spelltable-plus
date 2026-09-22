import css from './styles.css';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export class Panel {
  constructor(actions) {
    this.actions = actions;
    this.host = document.createElement('div'); this.host.id = 'spelltable-plus';
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${css}</style><section class="shell" aria-label="SpellTable Plus">
      <header><h1>SpellTable <span>Plus</span></h1><button id="native">Native lobby</button></header>
      <div class="layout"><aside><h2>Your loadout</h2>
      <select id="deck" aria-label="Selected loadout"></select>
      <p class="commander-label">Commander</p><p class="commander" id="commanders">Choose a loadout to get started.</p>
      <div class="deck-actions"><button id="edit">Add loadout</button><button id="share">Share this deck</button>
      <button id="apply" hidden>Apply commanders</button><button id="decklink" hidden>Set native deck link</button></div>
      <label class="check"><input id="autoCommander" type="checkbox">Apply commanders when I join</label>
      <p class="notice" id="notice" role="status" aria-live="polite"></p>
      </aside><main><h2 class="headline">Find your next table</h2><p class="subtitle">Match the table. Bring your deck.</p>
      <label for="include">Match any rule</label><input id="include" placeholder="BR4, BR3 no mox" maxlength="500">
      <small>Separate alternatives with commas. Words within a rule must all match.</small>
      <label for="exclude">Exclude</label><input id="exclude" placeholder="cedh, precon" maxlength="500">
      <button id="start" class="primary wide">Start auto-join</button>
      <label class="check"><input id="finishJoin" type="checkbox">Finish joining automatically using my camera and microphone preferences</label>
      <section class="tables"><h2>Matching tables</h2><table><thead><tr><th>Table</th><th>Players</th><th>Action</th></tr></thead><tbody id="rows"></tbody></table>
      <div class="empty" id="empty">No matching open tables on this lobby page.</div>
      <small>Follows the current native lobby page and format. BR3, B3 and Bracket 3 match alike.</small></section>
      <p class="status" id="status" role="status" aria-live="polite">Auto-join is stopped.</p></main></div></section>
      <dialog id="editor" aria-labelledby="editor-title"><form id="form"><h2 id="editor-title">Deck loadout</h2>
      <label for="name">Loadout name</label><input id="name" required maxlength="80" placeholder="Krenko tokens">
      <label for="commander1">Commander</label><input id="commander1" required maxlength="120" placeholder="Krenko, Mob Boss">
      <label for="commander2">Partner / background (optional)</label><input id="commander2" maxlength="120">
      <label for="url">Moxfield deck link (optional)</label><input id="url" type="url" placeholder="https://www.moxfield.com/decks/…">
      <label for="deckInclude">Match any rule</label><input id="deckInclude" maxlength="500" placeholder="BR4, BR3 no mox">
      <label for="deckExclude">Exclude</label><input id="deckExclude" maxlength="500" placeholder="cedh, precon">
      <p id="form-error" class="error" role="alert"></p><div class="actions"><button class="primary" type="submit">Save loadout</button><button id="cancel" type="button">Cancel</button><button id="remove" class="danger" type="button">Delete loadout</button></div>
      <button id="new" type="button" class="wide">Create another loadout</button></form></dialog>`;
    document.body.prepend(this.host);
    this.el('start').onclick = () => actions.toggle();
    this.el('native').onclick = () => actions.native();
    this.el('edit').onclick = () => this.edit(this.selected);
    this.el('new').onclick = () => this.fillEditor(null);
    this.el('cancel').onclick = () => this.el('editor').close();
    this.el('remove').onclick = () => { if (this.editingId) actions.remove(this.editingId); this.el('editor').close(); };
    this.el('deck').onchange = e => actions.select(e.target.value);
    this.el('share').onclick = () => actions.share();
    this.el('apply').onclick = () => actions.apply();
    this.el('decklink').onclick = () => actions.decklink();
    for (const id of ['include', 'exclude']) this.el(id).oninput = () => actions.filter(this.el('include').value, this.el('exclude').value);
    for (const id of ['autoCommander', 'finishJoin']) this.el(id).onchange = e => actions.preference(id, e.target.checked);
    this.el('form').onsubmit = e => {
      e.preventDefault();
      try {
        actions.save({ id: this.editingId, name: this.el('name').value, commanders: [this.el('commander1').value, this.el('commander2').value],
          url: this.el('url').value, include: this.el('deckInclude').value, exclude: this.el('deckExclude').value });
        this.el('editor').close();
      } catch (error) { this.el('form-error').textContent = error.message; }
    };
  }
  el(id) { return this.root.getElementById(id); }
  fillEditor(deck) {
    this.editingId = deck?.id;
    for (const [id, value] of Object.entries({ name: deck?.name, commander1: deck?.commanders[0], commander2: deck?.commanders[1], url: deck?.url,
      deckInclude: deck?.include ?? this.el('include').value, deckExclude: deck?.exclude ?? this.el('exclude').value })) this.el(id).value = value || '';
    this.el('remove').hidden = !deck; this.el('form-error').textContent = '';
  }
  edit(deck) { this.fillEditor(deck); this.el('editor').showModal(); }
  settings(state) {
    this.selected = state.decks.find(x => x.id === state.selectedId);
    this.el('deck').innerHTML = state.decks.length ? state.decks.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('') : '<option value="">No saved loadouts</option>';
    this.el('deck').value = state.selectedId || '';
    this.el('commanders').textContent = this.selected?.commanders.join(' + ') || 'Choose a loadout to get started.';
    this.el('edit').textContent = this.selected ? 'Edit loadout' : 'Add loadout';
    this.el('share').disabled = !this.selected?.url;
    this.el('apply').disabled = !this.selected;
    this.el('decklink').disabled = !this.selected?.url;
    this.el('include').value = state.include; this.el('exclude').value = state.exclude;
    this.el('autoCommander').checked = state.autoCommander; this.el('finishJoin').checked = state.finishJoin;
  }
  mode(lobby, collapsed) {
    const shell = this.root.querySelector('.shell');
    shell.classList.toggle('compact', !lobby || collapsed);
    shell.classList.toggle('collapsed', collapsed);
    this.el('native').textContent = lobby ? (collapsed ? 'Open' : 'Native lobby') : (collapsed ? 'Open' : 'Minimize');
    this.el('apply').hidden = lobby; this.el('decklink').hidden = lobby;
  }
  tables(cards) {
    const key = JSON.stringify(cards.map(x => [x.key, x.title, x.players, x.capacity]));
    if (key === this.tableKey) return;
    this.tableKey = key;
    this.el('rows').replaceChildren(...cards.map(card => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(card.title)}</td><td>${card.players}/${card.capacity}</td><td><button>Join</button></td>`;
      tr.querySelector('button').onclick = () => this.actions.join(card);
      return tr;
    }));
    this.el('empty').hidden = Boolean(cards.length);
  }
  status(text, running) {
    if (this.el('status').textContent !== text) this.el('status').textContent = text;
    this.el('start').textContent = running ? 'Stop auto-join' : 'Start auto-join';
  }
  notice(text, error = false) { this.el('notice').textContent = text; this.el('notice').classList.toggle('error', error); }
}
