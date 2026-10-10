// GM hub section "Bounties" (0.6.0 layout, user-approved): a Contracts /
// Contacts switch with search and filters, a compact list on the left
// (contracts by town, contacts by tier) and a detail panel on the right that
// shows the selected entry (gear, finds, who has or finished it, grant to a
// character) or edits it in titled sections. Generate, duplicate, letters,
// notices and delete work from the panel.
import { MODULE_ID } from "./professions.js";
import { contacts, contracts, saveContact, saveContract, deleteContact, deleteContract, generateContract, resetContacts, workGold, CONTACT_PREFIX, CONTRACT_PREFIX } from "./contacts.js";
import { makeContactScroll, makeWantedNotice } from "./craft.js";
import { learn, forget } from "./state.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const option = (value, label, current) => `<option value="${escape(value)}" ${String(value) === String(current) ? "selected" : ""}>${escape(label)}</option>`;
const TYPES = { alive: "Retrieval (alive)", kill: "Kill", either: "Dead or alive" };
const SHORT_TYPES = { alive: "Alive", kill: "Kill", either: "Dead or alive" };
const MODES = { used: "Used up", kept: "Kept", risk: "Kept, at risk" };
const PER = { longRest: "per long rest", day: "per day", none: "unlimited" };
const PROFESSION = "bountyhunter";
const TIERS = [1, 2, 3, 4, 5];

// Section state (kept across re-renders while the hub is open).
let view = { tab: "contracts", selected: null, search: "", tier: "", town: "", hideDone: false };
let editing = null; // { kind: "contact"|"contract", id|null, data }
let generator = { tier: 1, town: "" };

const isPartyActor = actor => actor?.type === "character" && Boolean(actor.hasPlayerOwner);
const party = () => Array.from(game.actors ?? []).filter(isPartyActor);
const actorById = id => game.actors?.get?.(id) ?? Array.from(game.actors ?? []).find(actor => actor.id === id) ?? null;
const holders = key => party().filter(actor => (actor.getFlag?.(MODULE_ID, "known") ?? []).includes(key));
const finishers = key => party().filter(actor => (actor.getFlag?.(MODULE_ID, "completed") ?? []).includes(key));
const goldText = body => (body.type === "either" ? `${workGold(body, "kill")} / ${workGold(body, "alive")} gp` : `${workGold(body, body.type)} gp`);
const keyOf = (kind, id) => `${kind === "contact" ? CONTACT_PREFIX : CONTRACT_PREFIX}${id}`;
const firstSentence = text => { const plain = String(text ?? "").trim(); const end = plain.search(/[.!?](\s|$)/); return end > 0 ? plain.slice(0, end + 1) : plain; };
const names = list => list.map(actor => actor.name).join(", ");

/* ---------------------------------------------------------------------- */
/* List                                                                    */
/* ---------------------------------------------------------------------- */

/** Contracts / contacts after search and filters (pure apart from settings; unit tested). */
export function filteredEntries(state = view) {
  const query = state.search.trim().toLowerCase();
  const matches = (...texts) => !query || texts.some(text => String(text ?? "").toLowerCase().includes(query));
  if (state.tab === "contacts") {
    return contacts().filter(entry => (!state.tier || entry.tier === Number(state.tier))
      && matches(entry.name, entry.text, entry.task?.title, entry.task?.brief));
  }
  return contracts().filter(entry => (!state.tier || entry.tier === Number(state.tier)) && (!state.town || entry.town === state.town)
    && (!state.hideDone || !finishers(keyOf("contract", entry.id)).length)
    && matches(entry.title, entry.target, entry.town, entry.brief));
}

function contractItem(entry) {
  const key = keyOf("contract", entry.id);
  const who = holders(key), done = finishers(key);
  const reason = firstSentence(entry.brief);
  return `<div class="cp-bl-item ${view.selected === entry.id ? "active" : ""}" role="button" tabindex="0" data-cb="select" data-id="${escape(entry.id)}">
      <span class="cp-bl-main"><strong>${escape(entry.title)}</strong>
        <small>${[entry.title.includes(entry.target) || reason.startsWith(entry.target) ? "" : entry.target, reason].filter(Boolean).map(escape).join(" · ")}</small></span>
      <span class="cp-bl-meta"><span class="cp-bl-tag">T${entry.tier} · ${escape(SHORT_TYPES[entry.type])}</span><b>${escape(goldText(entry))}</b>
        ${done.length ? `<span class="cp-bl-done" title="Completed by ${escape(names(done))}"><i class="fas fa-check"></i> ${escape(names(done))}</span>`
          : who.length ? `<span class="cp-bl-who" title="Has it"><i class="fas fa-user"></i> ${escape(names(who))}</span>` : ""}</span>
    </div>`;
}

function contactItem(entry) {
  const who = holders(keyOf("contact", entry.id));
  return `<div class="cp-bl-item ${view.selected === entry.id ? "active" : ""}" role="button" tabindex="0" data-cb="select" data-id="${escape(entry.id)}">
      <img src="${escape(entry.img)}" alt="">
      <span class="cp-bl-main"><strong>${escape(entry.name)}</strong><small>${escape(entry.task.title)} · ${escape(SHORT_TYPES[entry.task.type])}</small></span>
      <span class="cp-bl-meta"><b>${escape(goldText(entry.task))}</b><span class="cp-bl-tag">${escape(entry.limit?.count ?? 1)}× ${escape(PER[entry.limit?.per ?? "longRest"])}</span>
        ${who.length ? `<span class="cp-bl-who" title="Known by"><i class="fas fa-user"></i> ${escape(names(who))}</span>` : ""}</span>
    </div>`;
}

function listHtml() {
  const entries = filteredEntries();
  if (!entries.length) return `<p class="cp-bl-empty">${view.search || view.tier || view.town || view.hideDone ? "Nothing matches the search or filters." : view.tab === "contacts" ? "No contacts yet." : "No contracts yet. Generate one or write one."}</p>`;
  if (view.tab === "contacts") {
    return TIERS.map(tier => {
      const list = entries.filter(entry => entry.tier === tier);
      return list.length ? `<h4 class="cp-bl-group">Tier ${tier}</h4>${list.map(contactItem).join("")}` : "";
    }).join("");
  }
  return [...new Set(entries.map(entry => entry.town))].sort().map(town =>
    `<h4 class="cp-bl-group">${escape(town)}</h4>${entries.filter(entry => entry.town === town).sort((a, b) => a.tier - b.tier || a.title.localeCompare(b.title)).map(contractItem).join("")}`).join("");
}

/* ---------------------------------------------------------------------- */
/* Detail                                                                  */
/* ---------------------------------------------------------------------- */

function gearList(body) {
  const choices = body.type === "either" ? ["kill", "alive"] : [body.type];
  return choices.map(choice => {
    const part = body[choice] ?? { gear: [] };
    const rows = (part.gear ?? []).map(row => `<li><span>${escape(row.quantity)}× ${escape(row.name)}</span><span class="cp-bd-mode cp-mode-${escape(row.mode)}">${escape(MODES[row.mode] ?? row.mode)}</span>${row.reason ? `<small>${escape(row.reason)}</small>` : ""}</li>`).join("");
    return `<div class="cp-bd-choice"><h5>${choice === "kill" ? "Kill" : "Alive"} · ${escape(workGold(body, choice))} gp</h5>${rows ? `<ul class="cp-bd-gear">${rows}</ul>` : '<p class="cp-bd-none">No gear needed.</p>'}</div>`;
  }).join("");
}

function detailHtml(kind, entry) {
  const body = kind === "contact" ? entry.task : entry;
  const key = keyOf(kind, entry.id);
  const who = holders(key), done = kind === "contract" ? finishers(key) : [];
  const grantable = party().filter(actor => !who.includes(actor));
  const finds = (body.finds ?? []).map(([name, weight]) => `<li>${escape(name)} <small>weight ${escape(weight)}</small></li>`).join("");
  const facts = kind === "contact"
    ? [["Tier", `Tier ${entry.tier}`], ["Task", body.title], ["Type", TYPES[body.type]], ["Repeats", `${entry.limit?.count ?? 1}× ${PER[entry.limit?.per ?? "longRest"]}`], ["Hunt takes", `${body.days ?? 1} day${body.days === 1 ? "" : "s"}`]]
    : [["Town", entry.town], ["Quarry", entry.target], ["Tier", `Tier ${entry.tier}`], ["Type", TYPES[body.type]], ["Reward", goldText(body)], ["Hunt takes", `${body.days ?? 1} day${body.days === 1 ? "" : "s"}`]];
  return `<div class="cp-bd">
    <header class="cp-bd-head">${kind === "contact" ? `<img src="${escape(entry.img)}" alt="">` : '<i class="fas fa-file-signature"></i>'}
      <div><h3>${escape(kind === "contact" ? entry.name : entry.title)}</h3><small>${escape(kind === "contact" ? entry.text : `${entry.target} · ${entry.town}`)}</small></div></header>
    <dl class="cp-bd-facts">${facts.map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join("")}</dl>
    ${body.brief ? `<p class="cp-bd-brief">${escape(body.brief)}</p>` : ""}
    <section><h4>Gear</h4>${gearList(body)}</section>
    <section><h4>Possible rare finds</h4>${finds ? `<ul class="cp-bd-finds">${finds}</ul>` : '<p class="cp-bd-none">None: the GM picks if a great result calls for one.</p>'}</section>
    <section><h4>${kind === "contact" ? "Known by" : "Taken by"}</h4>
      ${who.length ? `<div class="cp-bd-people">${who.map(actor => `<span class="cp-bd-person">${escape(actor.name)}${done.includes(actor) ? ' <i class="fas fa-check" title="Completed"></i>' : ""}<button type="button" class="gp-rw-iconbtn" data-cb="revoke" data-actor="${escape(actor.id)}" title="Remove from ${escape(actor.name)}"><i class="fas fa-xmark"></i></button></span>`).join("")}</div>` : '<p class="cp-bd-none">Nobody yet.</p>'}
      ${done.length ? `<p class="cp-bd-none"><i class="fas fa-check"></i> Completed by ${escape(names(done))}</p>` : ""}
      ${grantable.length ? `<div class="cp-bd-grant"><select data-cb-grant aria-label="Character">${grantable.map(actor => option(actor.id, actor.name, "")).join("")}</select>
        <button type="button" class="gp-hub-ghost" data-cb="grant"><i class="fas fa-user-plus"></i> Grant</button></div>` : ""}</section>
    <footer class="cp-bd-actions">
      <button type="button" class="gp-hub-primary" data-cb="edit"><i class="fas fa-pen"></i> Edit</button>
      <button type="button" class="gp-hub-ghost" data-cb="duplicate"><i class="fas fa-copy"></i> Duplicate</button>
      <button type="button" class="gp-hub-ghost" data-cb="${kind === "contact" ? "letter" : "notice"}"><i class="fas ${kind === "contact" ? "fa-envelope" : "fa-scroll"}"></i> ${kind === "contact" ? "Contact letter" : "Wanted notice"}</button>
      <button type="button" class="gp-hub-ghost cp-bd-danger" data-cb="delete"><i class="fas fa-trash"></i> Delete</button>
    </footer>
  </div>`;
}

/* ---------------------------------------------------------------------- */
/* Editor                                                                  */
/* ---------------------------------------------------------------------- */

function gearRows(choice, gear) {
  return `<div class="cp-b-gear"><div class="cp-b-gear-head"><strong>${choice === "kill" ? "Kill" : "Alive"}</strong>
      <label class="cp-b-inline">Reward <input type="number" name="${choice}.gold" min="0" step="1" value="${escape(gear?.gold ?? "")}" placeholder="${choice === "alive" ? "auto" : "0"}" title="${choice === "alive" ? "Blank: the dead reward × the alive reward setting" : ""}"> gp</label></div>
      ${(gear?.gear ?? []).length ? `<div class="cp-b-rows">${(gear.gear).map((row, index) => `<div class="cp-b-row">
        <input type="text" list="cp-b-items" name="${choice}.gear.${index}.name" value="${escape(row.name)}" placeholder="Item">
        <input type="number" min="1" max="99" name="${choice}.gear.${index}.quantity" value="${escape(row.quantity)}" title="Quantity">
        <select name="${choice}.gear.${index}.mode" title="On success">${Object.entries(MODES).map(([value, label]) => option(value, label, row.mode)).join("")}</select>
        <input type="text" name="${choice}.gear.${index}.reason" value="${escape(row.reason)}" placeholder="Why (shown to players)">
        <button type="button" class="gp-rw-iconbtn" data-cb="remove-gear" data-choice="${choice}" data-index="${index}" title="Remove"><i class="fas fa-xmark"></i></button></div>`).join("")}</div>` : '<p class="cp-bd-none">No gear.</p>'}
      <button type="button" class="gp-hub-ghost cp-b-add" data-cb="add-gear" data-choice="${choice}"><i class="fas fa-plus"></i> Add item</button></div>`;
}

/** Editor for a contact or contract draft, in titled sections (pure; unit tested). */
export function editorHtml(draft) {
  const data = draft.data;
  const body = draft.kind === "contact" ? data.task : data;
  const choices = body.type === "either" ? ["kill", "alive"] : [body.type];
  const who = draft.kind === "contact"
    ? `<label class="gp-field"><span>Contact name</span><input type="text" name="name" value="${escape(data.name)}"></label>
       <label class="gp-field"><span>Who they are</span><input type="text" name="text" value="${escape(data.text)}"></label>`
    : `<label class="gp-field"><span>Town</span><input type="text" name="town" value="${escape(data.town)}"></label>
       <label class="gp-field"><span>Quarry</span><input type="text" name="target" value="${escape(data.target)}"></label>`;
  return `<div class="cp-bd cp-b-editor">
    <header class="cp-bd-head"><i class="fas fa-pen"></i><div><h3>${draft.id ? "Edit" : "New"} ${draft.kind}</h3><small>${escape(draft.kind === "contact" ? data.name || "Unnamed contact" : body.title || "Untitled contract")}</small></div></header>
    <section><h4>Basics</h4><div class="cp-b-grid">
      ${who}
      <label class="gp-field"><span>${draft.kind === "contact" ? "Task title" : "Title"}</span><input type="text" name="title" value="${escape(body.title)}"></label>
      <label class="gp-field"><span>Tier</span><select name="tier">${TIERS.map(tier => option(tier, `Tier ${tier}`, data.tier ?? body.tier)).join("")}</select></label>
      <label class="gp-field"><span>Type</span><select name="type" data-cb-change="type">${Object.entries(TYPES).map(([value, label]) => option(value, label, body.type)).join("")}</select></label>
      <label class="gp-field"><span>Hunt takes (days)</span><input type="number" name="days" min="0" step="0.5" value="${escape(body.days ?? 1)}"></label></div>
      <label class="gp-field cp-b-wide"><span>Brief</span><textarea name="brief" rows="3">${escape(body.brief)}</textarea></label></section>
    <section><h4>Reward and gear</h4>${choices.map(choice => gearRows(choice, body[choice])).join("")}</section>
    <section><h4>Possible rare finds</h4>
      ${(body.finds ?? []).length ? `<div class="cp-b-rows">${body.finds.map(([name, weight], index) => `<div class="cp-b-row cp-b-find">
        <input type="text" list="cp-b-items" name="finds.${index}.name" value="${escape(name)}" placeholder="Item">
        <input type="number" min="1" max="99" name="finds.${index}.weight" value="${escape(weight)}" title="Weight">
        <button type="button" class="gp-rw-iconbtn" data-cb="remove-find" data-index="${index}" title="Remove"><i class="fas fa-xmark"></i></button></div>`).join("")}</div>` : '<p class="cp-bd-none">None: the GM picks if a great result calls for one.</p>'}
      <button type="button" class="gp-hub-ghost cp-b-add" data-cb="add-find"><i class="fas fa-plus"></i> Add find</button></section>
    ${draft.kind === "contact" ? `<section><h4>Limits</h4><div class="cp-b-grid">
      <label class="gp-field"><span>Task can be done</span><span class="cp-b-inline"><input type="number" name="limit.count" min="1" max="99" value="${escape(data.limit?.count ?? 1)}"> × <select name="limit.per">${Object.entries(PER).map(([value, label]) => option(value, label, data.limit?.per ?? "longRest")).join("")}</select></span></label></div></section>` : ""}
    <datalist id="cp-b-items">${Array.from(game.items ?? []).map(item => item.name).sort().map(name => `<option value="${escape(name)}"></option>`).join("")}</datalist>
    <footer class="cp-bd-actions"><button type="button" class="gp-hub-primary" data-cb="save"><i class="fas fa-floppy-disk"></i> Save ${draft.kind}</button><button type="button" class="gp-hub-ghost" data-cb="cancel">Cancel</button></footer>
  </div>`;
}

/** Read the editor form back into the draft. */
export function readEditor(root, draft) {
  const value = name => root.querySelector(`[name="${name}"]`)?.value;
  const body = draft.kind === "contact" ? draft.data.task : draft.data;
  const readGear = choice => Array.from(root.querySelectorAll(`[name^="${choice}.gear."][name$=".name"]`)).map((_input, index) => ({
    name: value(`${choice}.gear.${index}.name`) ?? "", quantity: Number(value(`${choice}.gear.${index}.quantity`)), mode: value(`${choice}.gear.${index}.mode`), reason: value(`${choice}.gear.${index}.reason`) ?? "" }));
  if (draft.kind === "contact") {
    draft.data.name = value("name") ?? draft.data.name;
    draft.data.text = value("text") ?? draft.data.text;
    draft.data.limit = { count: Number(value("limit.count")) || 1, per: value("limit.per") ?? "longRest" };
  } else {
    draft.data.town = value("town") ?? draft.data.town;
    draft.data.target = value("target") ?? draft.data.target;
  }
  draft.data.tier = Number(value("tier")) || draft.data.tier;
  body.tier = draft.data.tier;
  body.title = value("title") ?? body.title;
  body.brief = value("brief") ?? body.brief;
  body.days = Number(value("days")) || 0;
  for (const choice of ["kill", "alive"]) {
    if (!root.querySelector(`[name="${choice}.gold"]`)) continue;
    const raw = value(`${choice}.gold`);
    body[choice] = { gold: raw === "" ? null : Number(raw), gear: readGear(choice) };
  }
  body.finds = Array.from(root.querySelectorAll('[name^="finds."][name$=".name"]')).map((_input, index) => [value(`finds.${index}.name`) ?? "", Number(value(`finds.${index}.weight`)) || 1]);
  const type = value("type");
  if (type && type !== body.type) {
    body.type = type;
    for (const choice of type === "either" ? ["kill", "alive"] : [type]) body[choice] ??= { gold: 0, gear: [] };
  }
  return draft;
}

/* ---------------------------------------------------------------------- */
/* Section                                                                 */
/* ---------------------------------------------------------------------- */

const selectedEntry = () => (view.tab === "contacts" ? contacts() : contracts()).find(entry => entry.id === view.selected) ?? null;

export function renderBounties() {
  const towns = [...new Set(contracts().map(entry => entry.town))].sort();
  const isContracts = view.tab === "contracts";
  const selected = selectedEntry();
  const panel = editing ? editorHtml(editing)
    : selected ? detailHtml(isContracts ? "contract" : "contact", selected)
    : `<div class="cp-bd cp-bd-placeholder"><i class="fas ${isContracts ? "fa-file-signature" : "fa-address-book"}"></i>
        <p>Select a ${isContracts ? "contract" : "contact"} to see its details, grant it to a character, or edit it.</p>
        <p class="cp-bd-none">${isContracts ? "Players get contracts by asking around, from a wanted notice, or a grant." : "Contacts give repeatable tasks; players meet them by asking around, from a contact letter, or a grant."}</p></div>`;
  return `<div class="cp-gm-window cp-bounties">
    <div class="cp-b-bar">
      <div class="cp-b-switch">
        <button type="button" class="${isContracts ? "active" : ""}" data-cb="tab" data-tab="contracts"><i class="fas fa-file-signature"></i> Contracts <small>${contracts().length}</small></button>
        <button type="button" class="${isContracts ? "" : "active"}" data-cb="tab" data-tab="contacts"><i class="fas fa-address-book"></i> Contacts <small>${contacts().length}</small></button></div>
      <input type="search" class="cp-b-search" data-cb-filter="search" value="${escape(view.search)}" placeholder="Search ${isContracts ? "title, quarry, town" : "name, task"}…">
      <select data-cb-filter="tier" aria-label="Tier">${option("", "All tiers", view.tier)}${TIERS.map(tier => option(tier, `Tier ${tier}`, view.tier)).join("")}</select>
      ${isContracts ? `<select data-cb-filter="town" aria-label="Town">${option("", "All towns", view.town)}${towns.map(town => option(town, town, view.town)).join("")}</select>
        <label class="cp-b-check"><input type="checkbox" data-cb-filter="hideDone" ${view.hideDone ? "checked" : ""}> Hide completed</label>` : ""}
      <span class="cp-b-spacer"></span>
      <button type="button" class="gp-hub-ghost" data-cb="${isContracts ? "new-contract" : "new-contact"}"><i class="fas fa-plus"></i> New</button>
    </div>
    ${isContracts ? `<div class="cp-b-gen"><i class="fas fa-dice"></i> Generate a contract:
        <select data-cb-gen="tier" aria-label="Tier">${TIERS.map(tier => option(tier, `Tier ${tier}`, generator.tier)).join("")}</select>
        <input type="text" data-cb-gen="town" list="cp-b-towns" value="${escape(generator.town)}" placeholder="Town">
        <datalist id="cp-b-towns">${towns.map(town => `<option value="${escape(town)}"></option>`).join("")}</datalist>
        <button type="button" class="gp-hub-primary" data-cb="generate"><i class="fas fa-dice"></i> Generate</button>
        <small>Opens in the panel to edit before saving.</small></div>`
      : `<div class="cp-b-gen"><small>The module's 15 starting contacts can be restored at any time.</small><span class="cp-b-spacer"></span>
        <button type="button" class="gp-hub-ghost" data-cb="reset-contacts" title="Restore the module's 15 contacts (your edits and new contacts are lost)"><i class="fas fa-rotate-left"></i> Reset contacts</button></div>`}
    <div class="cp-b-split">
      <nav class="cp-b-list">${listHtml()}</nav>
      <section class="cp-b-panel">${panel}</section>
    </div>
  </div>`;
}

const blankWork = tier => ({ tier, title: "", brief: "", type: "alive", days: 1, alive: { gold: 0, gear: [{ name: "Manacles", quantity: 1, mode: "kept", reason: "" }] }, finds: [] });
const DialogV2 = () => foundry.applications.api.DialogV2;
const confirm = (title, content) => DialogV2().confirm({ window: { title }, classes: ["gathering-professions-ui", "gp-dialog"], content, rejectClose: false });

export async function handleBountyClick(event, root, rerender) {
  const button = event.target.closest?.("[data-cb]");
  if (!button) return;
  event.preventDefault();
  const act = button.dataset.cb;
  if (editing && root.querySelector(".cp-b-editor")) readEditor(root, editing);
  generator = { tier: Number(root.querySelector('[data-cb-gen="tier"]')?.value) || generator.tier, town: root.querySelector('[data-cb-gen="town"]')?.value?.trim() ?? generator.town };
  const kind = view.tab === "contacts" ? "contact" : "contract";
  const entry = selectedEntry();
  if (act === "tab") { view = { ...view, tab: button.dataset.tab, selected: null, tier: "", town: "" }; editing = null; return rerender(); }
  if (act === "select") {
    if (editing && !(await confirm("Discard changes?", "<p>Leave the editor without saving?</p>"))) return;
    editing = null; view.selected = button.dataset.id; return rerender();
  }
  if (act === "generate") {
    if (!generator.town) throw new Error("Enter the town for the new contract.");
    editing = { kind: "contract", id: null, data: generateContract(generator.tier, generator.town) };
    return rerender();
  }
  if (act === "new-contract") { editing = { kind: "contract", id: null, data: { town: generator.town || view.town, target: "", ...blankWork(Number(view.tier) || 1) } }; return rerender(); }
  if (act === "new-contact") { editing = { kind: "contact", id: null, data: { tier: Number(view.tier) || 1, name: "", text: "", img: "icons/environment/people/commoner.webp", limit: { per: "longRest", count: 1 }, task: blankWork(Number(view.tier) || 1) } }; return rerender(); }
  if (act === "edit" && entry) { editing = { kind, id: entry.id, data: structuredClone(entry) }; return rerender(); }
  if (act === "duplicate" && entry) {
    const data = structuredClone(entry);
    if (kind === "contact") data.name = `${data.name} (copy)`; else data.title = `${data.title} (copy)`;
    delete data.id;
    editing = { kind, id: null, data };
    return rerender();
  }
  if (act === "cancel") { editing = null; return rerender(); }
  if (act === "save") {
    const saved = editing.kind === "contact" ? await saveContact(editing.data, editing.id) : await saveContract(editing.data, editing.id);
    ui.notifications.info(`${editing.kind === "contact" ? "Contact" : "Contract"} saved.`);
    view = { ...view, tab: editing.kind === "contact" ? "contacts" : "contracts", selected: saved.id };
    editing = null;
    return rerender();
  }
  const body = editing ? (editing.kind === "contact" ? editing.data.task : editing.data) : null;
  if (act === "add-gear" && body) { (body[button.dataset.choice] ??= { gold: 0, gear: [] }).gear.push({ name: "", quantity: 1, mode: "used", reason: "" }); return rerender(); }
  if (act === "remove-gear" && body) { body[button.dataset.choice].gear.splice(Number(button.dataset.index), 1); return rerender(); }
  if (act === "add-find" && body) { (body.finds ??= []).push(["", 1]); return rerender(); }
  if (act === "remove-find" && body) { body.finds.splice(Number(button.dataset.index), 1); return rerender(); }
  if (!entry) return;
  if (act === "letter") { const item = await makeContactScroll(PROFESSION, entry.id); ui.notifications.info(`Created ${item.name} in the Items sidebar.`); return; }
  if (act === "notice") { const item = await makeWantedNotice(PROFESSION, entry.id); ui.notifications.info(`Created ${item.name} in the Items sidebar.`); return; }
  if (act === "grant") {
    const actor = actorById(root.querySelector("[data-cb-grant]")?.value);
    if (!actor) return;
    await learn(actor, [keyOf(kind, entry.id)]);
    ui.notifications.info(`${actor.name} now has ${kind === "contact" ? entry.name : entry.title}.`);
    return rerender();
  }
  if (act === "revoke") {
    const actor = actorById(button.dataset.actor);
    if (!actor) return;
    await forget(actor, keyOf(kind, entry.id));
    return rerender();
  }
  if (act === "delete") {
    if (!(await confirm("Delete?", `<p>Delete <strong>${escape(kind === "contact" ? entry.name : entry.title)}</strong>? Characters who have it lose it from their Bounties tab.</p>`))) return;
    if (kind === "contact") await deleteContact(entry.id); else await deleteContract(entry.id);
    view.selected = null;
    return rerender();
  }
}

/** Filters, generator inputs and the editor's type select. Bound by the hub's change events. */
export function handleBountyChange(event, root, rerender) {
  const target = event.target;
  if (target?.dataset?.cbChange === "type" && editing) { readEditor(root, editing); return rerender(); }
  const filter = target?.dataset?.cbFilter;
  if (filter) {
    if (editing && root.querySelector(".cp-b-editor")) readEditor(root, editing);
    view = { ...view, [filter]: target.type === "checkbox" ? target.checked : target.value };
    return rerender();
  }
}

/** Test helper: reset the section state. */
export function resetBountyView(next = {}) { view = { tab: "contracts", selected: null, search: "", tier: "", town: "", hideDone: false, ...next }; editing = null; }

/** The GM hub section (group "Crafting Professions", after Cooking). */
export const BOUNTY_HUB_SECTION = Object.freeze({
  id: "bounties", label: "Bounties", group: "Crafting Professions", icon: "fa-crosshairs", order: 12,
  blurb: "Bounty Hunter contracts (one-time, by town) and contacts (repeatable tasks): browse, edit, generate, grant, letters and notices.",
  render: () => renderBounties(),
  onClick: (event, { hub, root }) => handleBountyClick(event, root, () => hub.render()).catch(error => ui.notifications.error(error.message)),
  onChange: (event, { hub, root }) => handleBountyChange(event, root, () => hub.render())
});
