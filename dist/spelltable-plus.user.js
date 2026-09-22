// ==UserScript==
// @name         SpellTable Plus
// @namespace    https://github.com/kgeg401/spelltable-plus
// @version      0.1.0
// @description  Deck loadouts, a refreshed lobby, Moxfield sharing and keyword auto-join.
// @author       kgeg401
// @match        https://spelltable.wizards.com/*
// @match        https://spelltable.com/*
// @match        https://www.spelltable.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @downloadURL  https://raw.githubusercontent.com/kgeg401/spelltable-plus/main/dist/spelltable-plus.user.js
// @updateURL    https://raw.githubusercontent.com/kgeg401/spelltable-plus/main/dist/spelltable-plus.user.js
// ==/UserScript==
(() => {
  // src/core.js
  function normalize(text) {
    return String(text ?? "").normalize("NFKC").toLowerCase().replace(/\b(?:bracket|br|b)\s*[-:]?\s*([1-5])\b/g, "br$1").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  function rules(text) {
    return String(text ?? "").split(/[,\n]/).map(normalize).filter(Boolean).map((rule) => rule.match(/\b(?:no|not|without)\s+\S+|\S+/g) ?? []);
  }
  function matches(title, include, exclude = "") {
    const haystack = ` ${normalize(title)} `;
    const accepts = (terms) => terms.every((term) => haystack.includes(` ${term} `));
    const wanted = rules(include);
    return wanted.length > 0 && wanted.some(accepts) && !rules(exclude).some(accepts);
  }
  function moxfieldURL(value) {
    if (!String(value).trim()) return "";
    let url;
    try {
      url = new URL(String(value).trim());
    } catch {
      throw new Error("Enter a complete Moxfield deck URL.");
    }
    if (url.protocol !== "https:" || !["moxfield.com", "www.moxfield.com"].includes(url.hostname) || url.port || url.username || url.password || !/^\/decks\/[\w-]+\/?$/.test(url.pathname)) {
      throw new Error("Use an https://www.moxfield.com/decks/\u2026 link.");
    }
    return `https://www.moxfield.com${url.pathname.replace(/\/$/, "")}`;
  }
  function validateDeck(value) {
    const name = String(value.name ?? "").trim().slice(0, 80);
    const commanders = (value.commanders ?? []).map((x) => String(x).trim()).filter(Boolean);
    if (!name) throw new Error("Give this loadout a name.");
    if (!commanders.length || commanders.length > 2 || commanders.some((x) => x.length > 120)) {
      throw new Error("Enter one or two full commander names.");
    }
    if (new Set(commanders.map(normalize)).size !== commanders.length) throw new Error("Commander names must be different.");
    return {
      id: String(value.id || crypto.randomUUID()),
      name,
      commanders,
      url: moxfieldURL(value.url ?? ""),
      include: String(value.include ?? "").slice(0, 500),
      exclude: String(value.exclude ?? "").slice(0, 500)
    };
  }
  function shareText(deck) {
    return `${deck.name} \u2014 ${deck.commanders.join(" + ")}: ${moxfieldURL(deck.url)}`;
  }
  var MatchQueue = class {
    constructor(delay = 5e3) {
      this.delay = delay;
      this.stop();
    }
    start() {
      this.active = true;
      this.pending = null;
    }
    stop() {
      this.active = false;
      this.pending = null;
    }
    tick(candidates, now) {
      if (!this.active) return { kind: "stopped" };
      const candidate = candidates.find((x) => x.open);
      if (!candidate) {
        this.pending = null;
        return { kind: "waiting" };
      }
      if (!this.pending || this.pending.key !== candidate.key) this.pending = { key: candidate.key, since: now };
      const remaining = this.delay - (now - this.pending.since);
      if (remaining > 0) return { kind: "countdown", candidate, seconds: Math.ceil(remaining / 1e3) };
      this.stop();
      return { kind: "join", candidate };
    }
  };

  // src/adapter.js
  var visible = (el) => Boolean(el?.isConnected && !el.closest('[hidden], [aria-hidden="true"]') && el.getClientRects().length);
  var all = (root, selector) => [...root.querySelectorAll(selector)];
  var exact = (root, selector, label) => all(root, selector).filter(visible).filter((el) => normalize(el.textContent) === normalize(label));
  function setInput(input, value) {
    const win = input.ownerDocument.defaultView;
    const proto = input.tagName === "TEXTAREA" ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value);
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
  }
  var SpellTableAdapter = class {
    constructor(doc = document) {
      this.doc = doc;
      this.ids = /* @__PURE__ */ new WeakMap();
      this.serial = 0;
    }
    commanderInputs() {
      return all(this.doc, "input[placeholder]").filter((el) => el.getAttribute("placeholder") === "+ Add commander").filter(visible);
    }
    lobbyCards() {
      const cards = all(this.doc, "div.block.rounded.bg-surface-low");
      return cards.flatMap((card) => {
        const title = card.querySelector(".text-xl");
        const join = exact(card, "button", "Join");
        const count = all(card, "span").filter((el) => !el.children.length).map((el) => el.textContent.match(/(?:^|\s)(\d+)\s*\/\s*(\d+)\s*$/)).find(Boolean);
        if (!visible(card) || !title || join.length !== 1 || !count) return [];
        if (!this.ids.has(join[0])) this.ids.set(join[0], ++this.serial);
        const players = Number(count[1]), capacity = Number(count[2]);
        return [{
          title: title.textContent.trim(),
          players,
          capacity,
          button: join[0],
          key: `${this.ids.get(join[0])}:${title.textContent.trim()}`,
          open: capacity > 0 && players < capacity && !join[0].disabled
        }];
      });
    }
    join(card) {
      const fresh = this.lobbyCards().find((x) => x.key === card.key && x.open);
      if (!fresh) throw new Error("That table is no longer available. Start again to find another.");
      fresh.button.click();
    }
    joinNow() {
      const buttons = exact(this.doc, "button", "Join Now");
      if (buttons.length !== 1 || buttons[0].disabled) return false;
      buttons[0].click();
      return true;
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
    async waitFor(find, signal, timeout = 6e3) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (signal?.aborted) throw new Error("Loadout application cancelled.");
        const result = find();
        if (result) return result;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw new Error("SpellTable control did not appear. Use the native player menu and try again.");
    }
    async applyCommanders(deck, signal) {
      if (signal?.aborted) throw new Error("Loadout application cancelled.");
      const local = this.localPlayer();
      if (!local) throw new Error("Join as a player first. Your editable player panel is not available.");
      const names = deck.commanders;
      if (names.every((name) => normalize(local.row.textContent).includes(normalize(name)))) return;
      const opened = this.commanderInputs().length === 0;
      if (opened) local.trigger.click();
      try {
        await this.waitFor(() => this.commanderInputs()[0] || all(this.doc, "#popover-container .border.bg-st-purple-light").find(visible), signal);
        const existing = all(this.doc, "#popover-container .border.bg-st-purple-light").filter(visible).map((el) => normalize(el.textContent));
        if (existing.some((name) => !names.map(normalize).includes(name))) {
          throw new Error("A different commander is already set. Clear it in your native player panel, then Apply commanders.");
        }
        for (const name of names) {
          if (normalize(local.row.textContent).includes(normalize(name))) continue;
          const input = await this.waitFor(() => this.commanderInputs()[0], signal);
          setInput(input, name);
          const option = await this.waitFor(() => {
            const results = exact(this.doc.querySelector("#popover-container") || this.doc, '[role="button"]', name);
            return results.length === 1 ? results[0] : null;
          }, signal);
          if (signal?.aborted) throw new Error("Loadout application cancelled.");
          option.click();
          await this.waitFor(() => normalize(local.row.textContent).includes(normalize(name)), signal);
        }
      } finally {
        if (opened && local.trigger.isConnected && (this.commanderInputs().length || all(this.doc, "#popover-container .border.bg-st-purple-light").some(visible))) local.trigger.click();
      }
    }
    async prepareDeckLink(url, signal) {
      const local = this.localPlayer();
      if (!local) throw new Error("Join as a player first to set your native deck link.");
      local.trigger.click();
      const edit = await this.waitFor(() => exact(this.doc.querySelector("#popover-container") || this.doc, "div", "Edit Decklist").find((el) => el.children.length === 0), signal);
      edit.click();
      const input = await this.waitFor(() => all(this.doc, 'input[placeholder^="https://www.moxfield.com/decks/"]').find(visible), signal);
      setInput(input, url);
      input.focus();
    }
    pasteChat(message) {
      const fields = all(this.doc, 'textarea, input[type="text"]').filter(visible).filter((el) => /^(?:send a message|type a message|message|chat message)(?:\.{3}|…)?$/i.test(el.getAttribute("placeholder") || el.getAttribute("aria-label") || ""));
      if (fields.length !== 1 || fields[0].value.trim()) return false;
      setInput(fields[0], message);
      fields[0].focus();
      return true;
    }
  };

  // src/styles.css
  var styles_default = ":host { all: initial; color-scheme: dark; font-family: Inter, 'Segoe UI', sans-serif; color: #e9edf2; font-size: 16px; line-height: 1.5; display: block; }\n:host([hidden]) { display: none !important; }\n* { box-sizing: border-box; }\n.shell { background: #101719; border: 1px solid #364247; border-radius: 10px; max-width: 1336px; margin: 32px auto; overflow: hidden; box-shadow: 0 18px 60px #0003; }\nheader { padding: 20px 28px; display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 1px solid #303d42; }\nh1 { margin: 0; font-size: 36px; line-height: 1.3; letter-spacing: -1px; font-weight: 700; }\nh1 span { color: #bedc9b; }\nh2 { margin: 0 0 10px; font-size: 28px; line-height: 1.25; letter-spacing: -.5px; }\nh3 { margin: 0 0 18px; font-size: 23px; line-height: 1.35; }\n.layout { display: grid; grid-template-columns: 350px minmax(0, 1fr); }\naside { padding: 28px; border-right: 1px solid #303d42; }\nmain { padding: 24px 28px 16px; min-width: 0; }\n.headline { font-size: clamp(30px, 3.4vw, 50px); letter-spacing: -1.4px; }\n.subtitle { color: #a6b3c0; font-size: 22px; margin: 0 0 20px; }\nlabel { display: block; color: #c5cfd8; margin: 14px 0 7px; }\ninput,select,textarea,button { font: inherit; font-size: 16px; line-height: 1.4; }\ninput,select,textarea { width: 100%; min-width: 0; background: #192226; color: #f0f4f8; border: 1px solid #75848b; border-radius: 8px; padding: 11px 16px; }\nselect { cursor: pointer; padding-right: 28px; }\ninput:focus,select:focus,textarea:focus { border-color: #bedc9b; outline: 2px solid #bedc9b44; outline-offset: 2px; }\nbutton { border: 1px solid #617177; border-radius: 8px; color: #e9edf2; background: transparent; padding: 9px 20px; font-weight: 600; cursor: pointer; transition: background .15s; }\nbutton:hover { background: #273339; }\nbutton:focus-visible { outline: 2px solid #bedc9b; outline-offset: 3px; }\nbutton:disabled { opacity: .45; cursor: not-allowed; }\n.primary { background: #bedc9b; border-color: #bedc9b; color: #101719; }\n.primary:hover { background: #cce7ae; }\n.wide { width: 100%; margin-top: 20px; }\n.deck-actions { display: grid; gap: 12px; margin-top: 28px; }\n.deck-actions button { min-height: 50px; }\n.muted,small { color: #99a9b4; }\nsmall { font-size: 14px; display: block; margin-top: 9px; }\n.commander-label { margin: 22px 0 3px; color: #99a9b4; }\n.commander { font-size: 19px; margin: 0; overflow-wrap: anywhere; }\n.tables { border-top: 1px solid #303d42; margin-top: 26px; padding-top: 22px; }\ntable { width: 100%; border-collapse: collapse; table-layout: fixed; }\nth { text-align: left; font-weight: 400; color: #a6b3c0; border-bottom: 1px solid #46565d; padding: 0 0 8px; }\ntd { padding: 9px 12px 9px 0; border-bottom: 1px solid #29383e; font-size: 17px; overflow-wrap: anywhere; }\nth:first-child { width: 63%; } th:nth-child(2) { width: 19%; }\ntd:last-child { padding-right: 0; }\ntd button { width: 100%; padding: 7px 10px; color: #bedc9b; border-color: #bedc9b; font-size: 15px; }\n.status { border-top: 1px solid #29383e; padding-top: 17px; margin: 26px 0 0; color: #a6b3c0; font-size: 14px; min-height: 40px; }\n.empty { padding: 25px 0; color: #a6b3c0; }\n.check { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; }\n.check input { width: 17px; height: 17px; margin: 3px 0 0; accent-color: #bedc9b; flex-shrink: 0; }\n.error { color: #ffc5b8; }\n.notice { margin-top: 18px; font-size: 14px; overflow-wrap: anywhere; }\ndialog { color: #e9edf2; background: #101719; border: 1px solid #56676f; border-radius: 12px; padding: 28px; max-width: min(560px, calc(100vw - 24px)); width: 560px; max-height: 90vh; overflow: auto; }\ndialog::backdrop { background: #000b; }\n.actions { display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap; }\n.danger { color: #ffb5a3; }\n[hidden] { display: none !important; }\n.compact { position: fixed; right: 18px; bottom: 18px; width: 330px; max-width: calc(100vw - 36px); margin: 0; z-index: 90; }\n.compact header { padding: 12px 16px; }\n.compact h1 { font-size: 20px; letter-spacing: -.4px; }\n.compact header button { font-size: 13px; padding: 6px 10px; }\n.compact .layout { display: block; max-height: 70vh; overflow: auto; }\n.compact aside { border: 0; padding: 16px; }\n.compact main { display: none; }\n.compact h2 { font-size: 22px; }\n.compact .deck-actions { margin-top: 16px; gap: 8px; }\n.compact .deck-actions button { min-height: 38px; }\n.collapsed .layout { display: none; }\n.compact .notice { margin-bottom: 0; }\n@media(max-width: 850px) { .shell:not(.compact) { margin: 16px 12px; } .layout { grid-template-columns: 250px minmax(0,1fr); } aside,main { padding: 20px; } h1 { font-size: 28px; } .subtitle { font-size: 18px; } th:first-child { width: 55%; } }\n@media(max-width: 760px) { .layout { display: block; } aside { border-right: 0; border-bottom: 1px solid #303d42; } header { padding: 16px 20px; } h1 { font-size: 23px; } header button { padding: 8px 10px; font-size: 13px; } .headline { font-size: 30px; } .subtitle { font-size: 17px; } td { font-size: 14px; } th { font-size: 13px; } th:first-child { width: 53%; } .deck-actions { grid-template-columns: 1fr 1fr; margin-top: 18px; } .deck-actions button { font-size: 14px; padding: 8px; } }\n@media(prefers-reduced-motion: reduce) { * { transition: none !important; } }\n";

  // src/ui.js
  var esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var Panel = class {
    constructor(actions) {
      this.actions = actions;
      this.host = document.createElement("div");
      this.host.id = "spelltable-plus";
      this.root = this.host.attachShadow({ mode: "open" });
      this.root.innerHTML = `<style>${styles_default}</style><section class="shell" aria-label="SpellTable Plus">
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
      <label for="url">Moxfield deck link (optional)</label><input id="url" type="url" placeholder="https://www.moxfield.com/decks/\u2026">
      <label for="deckInclude">Match any rule</label><input id="deckInclude" maxlength="500" placeholder="BR4, BR3 no mox">
      <label for="deckExclude">Exclude</label><input id="deckExclude" maxlength="500" placeholder="cedh, precon">
      <p id="form-error" class="error" role="alert"></p><div class="actions"><button class="primary" type="submit">Save loadout</button><button id="cancel" type="button">Cancel</button><button id="remove" class="danger" type="button">Delete loadout</button></div>
      <button id="new" type="button" class="wide">Create another loadout</button></form></dialog>`;
      document.body.prepend(this.host);
      this.el("start").onclick = () => actions.toggle();
      this.el("native").onclick = () => actions.native();
      this.el("edit").onclick = () => this.edit(this.selected);
      this.el("new").onclick = () => this.fillEditor(null);
      this.el("cancel").onclick = () => this.el("editor").close();
      this.el("remove").onclick = () => {
        if (this.editingId) actions.remove(this.editingId);
        this.el("editor").close();
      };
      this.el("deck").onchange = (e) => actions.select(e.target.value);
      this.el("share").onclick = () => actions.share();
      this.el("apply").onclick = () => actions.apply();
      this.el("decklink").onclick = () => actions.decklink();
      for (const id of ["include", "exclude"]) this.el(id).oninput = () => actions.filter(this.el("include").value, this.el("exclude").value);
      for (const id of ["autoCommander", "finishJoin"]) this.el(id).onchange = (e) => actions.preference(id, e.target.checked);
      this.el("form").onsubmit = (e) => {
        e.preventDefault();
        try {
          actions.save({
            id: this.editingId,
            name: this.el("name").value,
            commanders: [this.el("commander1").value, this.el("commander2").value],
            url: this.el("url").value,
            include: this.el("deckInclude").value,
            exclude: this.el("deckExclude").value
          });
          this.el("editor").close();
        } catch (error) {
          this.el("form-error").textContent = error.message;
        }
      };
    }
    el(id) {
      return this.root.getElementById(id);
    }
    fillEditor(deck) {
      this.editingId = deck?.id;
      for (const [id, value] of Object.entries({
        name: deck?.name,
        commander1: deck?.commanders[0],
        commander2: deck?.commanders[1],
        url: deck?.url,
        deckInclude: deck?.include ?? this.el("include").value,
        deckExclude: deck?.exclude ?? this.el("exclude").value
      })) this.el(id).value = value || "";
      this.el("remove").hidden = !deck;
      this.el("form-error").textContent = "";
    }
    edit(deck) {
      this.fillEditor(deck);
      this.el("editor").showModal();
    }
    settings(state) {
      this.selected = state.decks.find((x) => x.id === state.selectedId);
      this.el("deck").innerHTML = state.decks.length ? state.decks.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("") : '<option value="">No saved loadouts</option>';
      this.el("deck").value = state.selectedId || "";
      this.el("commanders").textContent = this.selected?.commanders.join(" + ") || "Choose a loadout to get started.";
      this.el("edit").textContent = this.selected ? "Edit loadout" : "Add loadout";
      this.el("share").disabled = !this.selected?.url;
      this.el("apply").disabled = !this.selected;
      this.el("decklink").disabled = !this.selected?.url;
      this.el("include").value = state.include;
      this.el("exclude").value = state.exclude;
      this.el("autoCommander").checked = state.autoCommander;
      this.el("finishJoin").checked = state.finishJoin;
    }
    mode(lobby, collapsed) {
      const shell = this.root.querySelector(".shell");
      shell.classList.toggle("compact", !lobby || collapsed);
      shell.classList.toggle("collapsed", collapsed);
      this.el("native").textContent = lobby ? collapsed ? "Open" : "Native lobby" : collapsed ? "Open" : "Minimize";
      this.el("apply").hidden = lobby;
      this.el("decklink").hidden = lobby;
    }
    tables(cards) {
      const key = JSON.stringify(cards.map((x) => [x.key, x.title, x.players, x.capacity]));
      if (key === this.tableKey) return;
      this.tableKey = key;
      this.el("rows").replaceChildren(...cards.map((card) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(card.title)}</td><td>${card.players}/${card.capacity}</td><td><button>Join</button></td>`;
        tr.querySelector("button").onclick = () => this.actions.join(card);
        return tr;
      }));
      this.el("empty").hidden = Boolean(cards.length);
    }
    status(text, running) {
      if (this.el("status").textContent !== text) this.el("status").textContent = text;
      this.el("start").textContent = running ? "Stop auto-join" : "Start auto-join";
    }
    notice(text, error = false) {
      this.el("notice").textContent = text;
      this.el("notice").classList.toggle("error", error);
    }
  };

  // src/main.js
  if (!document.getElementById("spelltable-plus")) boot();
  function boot() {
    const KEY = "spelltable-plus:v1";
    const defaults = { decks: [], selectedId: "", include: "BR4, BR3 no mox", exclude: "", autoCommander: true, finishJoin: true };
    let state = { ...defaults }, storageError = "";
    try {
      const raw = typeof GM_getValue === "function" ? GM_getValue(KEY, null) : localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        state = {
          ...defaults,
          decks: Array.isArray(saved.decks) ? saved.decks.map(validateDeck) : [],
          selectedId: String(saved.selectedId ?? ""),
          include: String(saved.include ?? defaults.include).slice(0, 500),
          exclude: String(saved.exclude ?? "").slice(0, 500),
          autoCommander: saved.autoCommander !== false,
          finishJoin: saved.finishJoin !== false
        };
      }
    } catch {
      storageError = "Saved settings could not be read. They will only be replaced when you save a change.";
    }
    if (!state.decks.some((x) => x.id === state.selectedId)) state.selectedId = state.decks[0]?.id || "";
    const adapter = new SpellTableAdapter(), queue = new MatchQueue();
    let path = location.pathname, collapsed = false, joining = null, busy = false, controller = null, applied = "";
    const isLobby = () => /^\/lobby\/?$/.test(location.pathname);
    const isGame = () => /^\/game\/[^/]+\/?$/.test(location.pathname);
    const selected = () => state.decks.find((x) => x.id === state.selectedId);
    const save = () => {
      try {
        const raw = JSON.stringify(state);
        if (typeof GM_setValue === "function") GM_setValue(KEY, raw);
        else localStorage.setItem(KEY, raw);
      } catch {
        panel.notice("Could not save settings. Browser storage may be full or blocked.", true);
      }
    };
    const stop = () => {
      queue.stop();
      joining = null;
      panel.status("Auto-join is stopped.", false);
    };
    const cancelApply = () => {
      controller?.abort();
    };
    const apply = async () => {
      const deck = selected();
      if (!deck || busy) return;
      busy = true;
      controller = new AbortController();
      const key = `${location.pathname}:${deck.id}`;
      applied = key;
      panel.notice("Applying commanders\u2026");
      try {
        await adapter.applyCommanders(deck, controller.signal);
        panel.notice("Commanders selected.");
      } catch (error) {
        panel.notice(error.message, true);
      } finally {
        busy = false;
      }
    };
    const join = (card, automatic = false) => {
      stop();
      try {
        if (automatic && state.finishJoin) joining = { from: location.pathname, route: null, deadline: Date.now() + 2e4 };
        adapter.join(card);
        panel.status(`Opening ${card.title}\u2026`, false);
      } catch (error) {
        joining = null;
        panel.notice(error.message, true);
      }
    };
    const panel = new Panel({
      toggle() {
        if (queue.active) return stop();
        if (!isLobby()) return panel.notice("Open the SpellTable lobby to find a table.", true);
        if (!rules(state.include).length) return panel.notice("Add at least one match rule before starting.", true);
        queue.start();
        collapsed = false;
        panel.mode(true, false);
        panel.notice("A match will join after a five-second countdown. Stop cancels it.");
        tick();
      },
      native() {
        stop();
        collapsed = !collapsed;
        panel.mode(isLobby(), collapsed);
      },
      select(id) {
        stop();
        cancelApply();
        state.selectedId = id;
        const deck = selected();
        if (deck) {
          state.include = deck.include;
          state.exclude = deck.exclude;
        }
        applied = "";
        save();
        panel.settings(state);
        tick();
      },
      filter(include, exclude) {
        stop();
        state.include = include;
        state.exclude = exclude;
        save();
        tick();
      },
      preference(key, value) {
        state[key] = value;
        if (key === "autoCommander" && !value) cancelApply();
        if (key === "finishJoin" && !value) joining = null;
        save();
      },
      save(value) {
        const deck = validateDeck(value);
        stop();
        cancelApply();
        state.decks = [...state.decks.filter((x) => x.id !== deck.id), deck];
        state.selectedId = deck.id;
        state.include = deck.include;
        state.exclude = deck.exclude;
        applied = "";
        save();
        panel.settings(state);
        panel.notice("Loadout saved on this browser.");
        tick();
      },
      remove(id) {
        stop();
        cancelApply();
        state.decks = state.decks.filter((x) => x.id !== id);
        if (state.selectedId === id) state.selectedId = state.decks[0]?.id || "";
        const deck = selected();
        if (deck) {
          state.include = deck.include;
          state.exclude = deck.exclude;
        }
        save();
        panel.settings(state);
        tick();
      },
      async share() {
        const deck = selected();
        if (!deck?.url) return;
        const text = shareText(deck);
        if (adapter.pasteChat(text)) return panel.notice("Deck link pasted into chat. Press Send when ready.");
        try {
          if (typeof GM_setClipboard === "function") GM_setClipboard(text, "text");
          else await navigator.clipboard.writeText(text);
          panel.notice("Deck link copied. Paste it into your group chat. SpellTable currently has no native text chat.");
        } catch {
          panel.notice(`Copy this deck link: ${deck.url}`);
        }
      },
      apply,
      async decklink() {
        if (!selected()?.url || busy) return;
        busy = true;
        controller = new AbortController();
        try {
          await adapter.prepareDeckLink(selected().url, controller.signal);
          panel.notice("Link filled in. Click Submit in SpellTable to update your profile deck link.");
        } catch (error) {
          panel.notice(error.message, true);
        } finally {
          busy = false;
        }
      },
      join: (card) => join(card, false)
    });
    panel.settings(state);
    panel.mode(isLobby(), false);
    if (storageError) panel.notice(storageError, true);
    function tick() {
      if (path !== location.pathname) {
        const old = path;
        path = location.pathname;
        queue.stop();
        cancelApply();
        applied = "";
        collapsed = false;
        if (joining && old === joining.from && isGame()) joining.route = path;
        else joining = null;
        panel.mode(isLobby(), false);
      }
      panel.host.hidden = !isLobby() && !isGame();
      if (isLobby()) {
        const cards = adapter.lobbyCards().filter((x) => x.open && matches(x.title, state.include, state.exclude));
        panel.tables(cards);
        const result = queue.tick(cards, Date.now());
        if (result.kind === "waiting") panel.status("Watching this lobby page for an open matching table\u2026", true);
        if (result.kind === "countdown") panel.status(`Joining \u201C${result.candidate.title}\u201D in ${result.seconds}s \u2014 Stop auto-join to cancel.`, true);
        if (result.kind === "join") join(result.candidate, true);
      } else if (isGame()) {
        if (joining && (Date.now() > joining.deadline || joining.route !== path)) joining = null;
        if (joining && adapter.joinNow()) joining = null;
        const key = `${path}:${state.selectedId}`;
        if (state.autoCommander && selected() && applied !== key && !busy && adapter.localPlayer()) apply();
      }
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        stop();
        cancelApply();
      }
    });
    window.addEventListener("pagehide", () => {
      stop();
      cancelApply();
    });
    setInterval(tick, 750);
    tick();
  }
})();
