// Asking around (Bounty Hunter): the player asks; the active GM gets a pop-up
// to Allow or Deny and sets the skill, the DC, the town, and the result: an
// unmet contact, a contract the hunter doesn't have, a newly generated
// contract, or nothing. The request travels as an actor flag (no socket); the
// GM's client rolls and posts the result.
import { MODULE_ID, CRAFTING_PROFESSIONS, RANK_DIE } from "./professions.js";
import { rankOf, knownIds, learn, completedIds } from "./state.js";
import { contacts, contracts, generateContract, saveContract, CONTACT_PREFIX, CONTRACT_PREFIX } from "./contacts.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const ASK_SKILLS = Object.freeze(["inv", "per", "itm", "ins", "dec", "prc", "sur", "his"]);
const skillLabel = key => globalThis.CONFIG?.DND5E?.skills?.[key]?.label ?? key;

export const pendingAsk = actor => actor?.getFlag?.(MODULE_ID, "askRequest") ?? null;

/** Contacts the hunter hasn't met and contracts they don't have (tier ≤ rank; contracts not completed). */
export function askOptions(actor, profession = "bountyhunter") {
  const known = knownIds(actor);
  const done = completedIds(actor);
  const rank = Math.max(1, rankOf(actor, profession));
  return {
    contacts: contacts().filter(entry => entry.tier <= rank && !known.has(`${CONTACT_PREFIX}${entry.id}`)),
    contracts: contracts().filter(entry => entry.tier <= rank && !known.has(`${CONTRACT_PREFIX}${entry.id}`) && !done.has(`${CONTRACT_PREFIX}${entry.id}`)),
    rank
  };
}

/** Pre-selected result: an open contract in this town, else an unmet contact, else nothing. */
export function suggestResult(options, town = "") {
  const here = options.contracts.find(entry => entry.town.toLowerCase() === String(town).trim().toLowerCase());
  if (here) return `contract:${here.id}`;
  if (options.contacts.length) return `contact:${options.contacts[0].id}`;
  return "";
}

function lastTown() {
  try { return game.settings.get(MODULE_ID, "lastTown") || globalThis.canvas?.scene?.name || ""; } catch { return ""; }
}

/** Owner: ask around for work (waits for the GM's approval). */
export async function requestAskAround(actor, profession = "bountyhunter") {
  if (!actor || !(game.user.isGM || actor.isOwner)) throw new Error("Choose a character you own.");
  if (!rankOf(actor, profession)) throw new Error(`Only a ${CRAFTING_PROFESSIONS[profession].label} can ask around for work.`);
  if (pendingAsk(actor)) throw new Error("You are already waiting for the GM.");
  await actor.setFlag(MODULE_ID, "askRequest", { id: foundry.utils.randomID(), profession, by: game.user.id, at: Date.now() });
  if (!game.users?.activeGM) ui.notifications.info("Your request will reach the GM when they are online.");
  else ui.notifications.info("You ask around. Waiting for the GM…");
}

/** HTML for the GM's approval dialog (pure; unit tested). */
export function approvalHtml(actor, profession, options, town = "") {
  const suggestion = suggestResult(options, town);
  const sorted = [...options.contracts].sort((a, b) => (b.town.toLowerCase() === town.toLowerCase()) - (a.town.toLowerCase() === town.toLowerCase()) || a.town.localeCompare(b.town) || a.tier - b.tier);
  const opt = (value, label) => `<option value="${escape(value)}" ${value === suggestion ? "selected" : ""}>${escape(label)}</option>`;
  return `<p><strong>${escape(actor.name)}</strong> wants to ask around for ${escape(CRAFTING_PROFESSIONS[profession].label.toLowerCase())} work (skill + d${RANK_DIE[options.rank - 1]}).</p>
    <div class="form-group"><label>Skill</label><select name="skill">${ASK_SKILLS.map(key => `<option value="${key}" ${key === "inv" ? "selected" : ""}>${escape(skillLabel(key))}</option>`).join("")}</select></div>
    <div class="form-group"><label>DC</label><input type="number" name="dc" value="15" min="1" max="40"></div>
    <div class="form-group"><label>Town</label><input type="text" name="town" value="${escape(town)}" placeholder="Where they are asking"></div>
    <div class="form-group"><label>On a success they get</label><select name="result">
      ${options.contacts.length ? `<optgroup label="Contacts (repeatable work)">${options.contacts.map(entry => opt(`contact:${entry.id}`, `${entry.name}: ${entry.task.title} (tier ${entry.tier})`)).join("")}</optgroup>` : ""}
      ${sorted.length ? `<optgroup label="Contracts (one time)">${sorted.map(entry => opt(`contract:${entry.id}`, `${entry.town}: ${entry.title} (tier ${entry.tier})`)).join("")}</optgroup>` : ""}
      <optgroup label="New contract in this town">${Array.from({ length: options.rank }, (_, index) => opt(`generate:${index + 1}`, `Generate a tier ${index + 1} contract`)).join("")}</optgroup>
      ${opt("", "Nothing useful")}</select></div>
    <p class="hint">A generated contract is saved to the GM hub's Bounties section, where you can edit it.</p>`;
}

/** Active GM: decide a request. decision = { allow, skill, dc, town, result } (or the dialog). */
export async function handleAskRequest(actor, decision = null) {
  const request = pendingAsk(actor);
  if (!request || !game.user.isGM) return null;
  const profession = request.profession ?? "bountyhunter";
  const options = askOptions(actor, profession);
  if (!decision) {
    const DialogV2 = foundry.applications.api.DialogV2;
    decision = await DialogV2.wait({
      window: { title: "Asking around: allow?" }, classes: ["gathering-professions-ui", "gp-dialog"],
      content: approvalHtml(actor, profession, options, lastTown()),
      buttons: [
        { action: "allow", label: "Allow", default: true, callback: (_event, button) => {
          const form = button.form.elements;
          return { allow: true, skill: form.skill.value, dc: Number(form.dc.value), town: form.town.value, result: form.result.value };
        } },
        { action: "deny", label: "Deny", callback: () => ({ allow: false }) }
      ],
      rejectClose: false
    });
    if (!decision) return null; // closed: asked again on the next load
  }
  await actor.unsetFlag(MODULE_ID, "askRequest");
  const town = String(decision.town ?? "").trim();
  if (town) { try { await game.settings.set(MODULE_ID, "lastTown", town); } catch { /* not registered in tests */ } }
  const whisperTo = [...Array.from(game.users ?? []).filter(user => !user.isGM && actor.testUserPermission?.(user, "OWNER")), ...Array.from(game.users ?? []).filter(user => user.isGM)].map(user => user.id);
  if (!decision.allow) {
    await ChatMessage.create({ whisper: whisperTo, speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${escape(actor.name)} asks around, but now isn't the time.</p>` });
    return { allowed: false };
  }
  const skill = ASK_SKILLS.includes(decision.skill) ? decision.skill : "inv";
  const dc = Number.isInteger(decision.dc) && decision.dc > 0 ? decision.dc : 15;
  const total = Number(actor.system?.skills?.[skill]?.total);
  const die = RANK_DIE[options.rank - 1];
    const modifier = Number.isFinite(total) ? total : 0;
    const roll = await game.modules.get("gathering-professions").api.recipes.rollProfessionCheck(actor,
      { modifier, formula: `1d20 + ${modifier} + 1d${die}` }, { skill });
  const success = roll.total >= dc;
  let text = success ? "People talk, but nothing worth chasing." : "Nobody's talking.";
  let gained = null;
  if (success && decision.result) {
    const [kind, value] = String(decision.result).split(":");
    if (kind === "contact") {
      const entry = contacts().find(row => row.id === value);
      if (entry) { await learn(actor, [`${CONTACT_PREFIX}${entry.id}`]); gained = { kind, id: entry.id }; text = `A new contact: <strong>${escape(entry.name)}</strong>, offering ${escape(entry.task.title.toLowerCase())}.`; }
    } else if (kind === "contract") {
      const entry = contracts().find(row => row.id === value);
      if (entry) { await learn(actor, [`${CONTRACT_PREFIX}${entry.id}`]); gained = { kind, id: entry.id }; text = `A contract in ${escape(entry.town)}: <strong>${escape(entry.title)}</strong>.`; }
    } else if (kind === "generate") {
      const entry = await saveContract(generateContract(Number(value), town || "town"));
      await learn(actor, [`${CONTRACT_PREFIX}${entry.id}`]);
      gained = { kind: "contract", id: entry.id, generated: true };
      text = `A contract in ${escape(entry.town)}: <strong>${escape(entry.title)}</strong>.`;
    }
  }
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<div class="gathering-professions-chat"><strong>Asking around</strong>${town ? ` in ${escape(town)}` : ""} (${escape(skillLabel(skill))} + d${die} vs DC ${dc})<br>${text}</div>` });
  return { allowed: true, success, gained, total: roll.total };
}

/** Panel for the Recipes window's Bounties tab. */
export function askPanelHtml(actor) {
  if (!actor) return "";
  const pending = pendingAsk(actor);
  return `<div class="cp-ask"><i class="fas fa-comments"></i> <strong>Ask around</strong>
      <span>Look for contacts and contracts: the GM picks the skill and DC; you roll it plus your Bounty Hunter die.</span>
      <button type="button" data-act="panel" data-panel-act="ask" ${pending ? "disabled" : ""}><i class="fas fa-comment-dots"></i> ${pending ? "Waiting for the GM…" : "Ask around"}</button></div>`;
}

/** Active GM: watch for requests (and handle ones made while offline). */
export function registerAskAround(isActiveGM) {
  const queue = new Set();
  const consider = actor => {
    if (!isActiveGM() || !pendingAsk(actor) || queue.has(actor.id)) return;
    queue.add(actor.id);
    void handleAskRequest(actor).catch(error => console.error(`${MODULE_ID}: asking around`, error)).finally(() => queue.delete(actor.id));
  };
  Hooks.on("updateActor", (actor, changes) => { if (foundry.utils.hasProperty?.(changes, `flags.${MODULE_ID}.askRequest`) ?? changes?.flags?.[MODULE_ID]?.askRequest) consider(actor); });
  for (const actor of Array.from(game.actors ?? [])) consider(actor);
}
