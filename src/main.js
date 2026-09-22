import { matches, validateDeck, shareText, MatchQueue, rules } from './core.js';
import { SpellTableAdapter } from './adapter.js';
import { Panel } from './ui.js';

if (!document.getElementById('spelltable-plus')) boot();
function boot() {
  const KEY = 'spelltable-plus:v1';
  const defaults = { decks: [], selectedId: '', include: 'BR4, BR3 no mox', exclude: '', autoCommander: true, finishJoin: true };
  let state = { ...defaults }, storageError = '';
  try {
    const raw = typeof GM_getValue === 'function' ? GM_getValue(KEY, null) : localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state = { ...defaults, decks: Array.isArray(saved.decks) ? saved.decks.map(validateDeck) : [],
        selectedId: String(saved.selectedId ?? ''), include: String(saved.include ?? defaults.include).slice(0,500),
        exclude: String(saved.exclude ?? '').slice(0,500), autoCommander: saved.autoCommander !== false, finishJoin: saved.finishJoin !== false };
    }
  } catch { storageError = 'Saved settings could not be read. They will only be replaced when you save a change.'; }
  if (!state.decks.some(x => x.id === state.selectedId)) state.selectedId = state.decks[0]?.id || '';
  const adapter = new SpellTableAdapter(), queue = new MatchQueue();
  let path = location.pathname, collapsed = false, joining = null, busy = false, controller = null, applied = '';
  const isLobby = () => /^\/lobby\/?$/.test(location.pathname);
  const isGame = () => /^\/game\/[^/]+\/?$/.test(location.pathname);
  const selected = () => state.decks.find(x => x.id === state.selectedId);
  const save = () => {
    try {
      const raw = JSON.stringify(state);
      if (typeof GM_setValue === 'function') GM_setValue(KEY, raw); else localStorage.setItem(KEY, raw);
    } catch { panel.notice('Could not save settings. Browser storage may be full or blocked.', true); }
  };
  const stop = () => { queue.stop(); joining = null; panel.status('Auto-join is stopped.', false); };
  const cancelApply = () => { controller?.abort(); };
  const apply = async () => {
    const deck = selected(); if (!deck || busy) return;
    busy = true; controller = new AbortController();
    const key = `${location.pathname}:${deck.id}`;
    applied = key;
    panel.notice('Applying commanders…');
    try { await adapter.applyCommanders(deck, controller.signal); panel.notice('Commanders selected.'); }
    catch (error) { panel.notice(error.message, true); }
    finally { busy = false; }
  };
  const join = (card, automatic = false) => {
    stop();
    try {
      // Only auto-complete the prejoin screen reached by this explicit queue attempt.
      if (automatic && state.finishJoin) joining = { from: location.pathname, route: null, deadline: Date.now() + 20000 };
      adapter.join(card);
      panel.status(`Opening ${card.title}…`, false);
    } catch (error) { joining = null; panel.notice(error.message, true); }
  };
  const panel = new Panel({
    toggle() {
      if (queue.active) return stop();
      if (!isLobby()) return panel.notice('Open the SpellTable lobby to find a table.', true);
      if (!rules(state.include).length) return panel.notice('Add at least one match rule before starting.', true);
      queue.start(); collapsed = false; panel.mode(true, false); panel.notice('A match will join after a five-second countdown. Stop cancels it.'); tick();
    },
    native() { stop(); collapsed = !collapsed; panel.mode(isLobby(), collapsed); },
    select(id) { stop(); cancelApply(); state.selectedId = id; const deck = selected(); if (deck) { state.include = deck.include; state.exclude = deck.exclude; } applied = ''; save(); panel.settings(state); tick(); },
    filter(include, exclude) { stop(); state.include = include; state.exclude = exclude; save(); tick(); },
    preference(key, value) { state[key] = value; if (key === 'autoCommander' && !value) cancelApply(); if (key === 'finishJoin' && !value) joining = null; save(); },
    save(value) { const deck = validateDeck(value); stop(); cancelApply(); state.decks = [...state.decks.filter(x => x.id !== deck.id), deck]; state.selectedId = deck.id; state.include = deck.include; state.exclude = deck.exclude; applied = ''; save(); panel.settings(state); panel.notice('Loadout saved on this browser.'); tick(); },
    remove(id) { stop(); cancelApply(); state.decks = state.decks.filter(x => x.id !== id); if (state.selectedId === id) state.selectedId = state.decks[0]?.id || ''; const deck = selected(); if(deck) {state.include=deck.include;state.exclude=deck.exclude;} save(); panel.settings(state); tick(); },
    async share() {
      const deck = selected(); if (!deck?.url) return;
      const text = shareText(deck);
      if (adapter.pasteChat(text)) return panel.notice('Deck link pasted into chat. Press Send when ready.');
      try {
        if (typeof GM_setClipboard === 'function') GM_setClipboard(text, 'text'); else await navigator.clipboard.writeText(text);
        panel.notice('Deck link copied. Paste it into your group chat. SpellTable currently has no native text chat.');
      } catch { panel.notice(`Copy this deck link: ${deck.url}`); }
    },
    apply,
    async decklink() {
      if (!selected()?.url || busy) return;
      busy = true; controller = new AbortController();
      try { await adapter.prepareDeckLink(selected().url, controller.signal); panel.notice('Link filled in. Click Submit in SpellTable to update your profile deck link.'); }
      catch(error) { panel.notice(error.message, true); } finally { busy = false; }
    },
    join: card => join(card, false)
  });
  panel.settings(state); panel.mode(isLobby(), false);
  if (storageError) panel.notice(storageError, true);
  function tick() {
    if (path !== location.pathname) {
      const old = path; path = location.pathname; queue.stop(); cancelApply(); applied = ''; collapsed = false;
      if (joining && old === joining.from && isGame()) joining.route = path;
      else joining = null;
      panel.mode(isLobby(), false);
    }
    panel.host.hidden = !isLobby() && !isGame();
    if (isLobby()) {
      const cards = adapter.lobbyCards().filter(x => x.open && matches(x.title, state.include, state.exclude));
      panel.tables(cards);
      const result = queue.tick(cards, Date.now());
      if (result.kind === 'waiting') panel.status('Watching this lobby page for an open matching table…', true);
      if (result.kind === 'countdown') panel.status(`Joining “${result.candidate.title}” in ${result.seconds}s — Stop auto-join to cancel.`, true);
      if (result.kind === 'join') join(result.candidate, true);
    } else if (isGame()) {
      if (joining && (Date.now() > joining.deadline || joining.route !== path)) joining = null;
      if (joining && adapter.joinNow()) joining = null;
      const key = `${path}:${state.selectedId}`;
      if (state.autoCommander && selected() && applied !== key && !busy && adapter.localPlayer()) apply();
    }
  }
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { stop(); cancelApply(); } });
  window.addEventListener('pagehide', () => { stop(); cancelApply(); });
  // Lightweight DOM reads only. SpellTable owns its network refresh cadence.
  setInterval(tick, 750); tick();
}
