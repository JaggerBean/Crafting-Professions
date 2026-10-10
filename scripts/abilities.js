// Profession abilities (once per long rest, skill check + profession die vs a
// medium DC) with real effects, and talents offered in dnd5e's roll dialog.
import { MODULE_ID, CRAFTING_PROFESSIONS, RANK_DIE } from "./professions.js";
import { actorProfessions, hasProfession, rankOf, pathOf, talentsOf, resetTaskUses } from "./state.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

/** The ability a character uses for a profession (their chosen path). */
export function abilityFor(actor, key) {
  const profession = CRAFTING_PROFESSIONS[key];
  return profession?.abilities?.[pathOf(actor, key)] ?? null;
}

export const abilityUsed = (actor, key) => Boolean(actorProfessions(actor)[key]?.abilityUsed);

/* ---------------------------------------------------------------------- */
/* Gathering-tool durability (Gathering Professions flag)                  */
/* ---------------------------------------------------------------------- */

const GP = "gathering-professions";
function worldDurability() {
  try { return Number(game.settings.get(GP, "rules")?.toolDurability ?? 10); } catch { return 10; }
}
/** {value, max} or null when the item does not wear (not a tool, or max 0). */
export function durabilityOf(item) {
  const saved = item?.getFlag?.(GP, "durability") ?? item?.flags?.[GP]?.durability ?? {};
  const isTool = item?.type === "tool" || Boolean(item?.flags?.[GP]?.defaultTool) || saved.max !== undefined;
  if (!isTool) return null;
  const present = value => value !== null && value !== undefined && value !== "";
  const max = present(saved.max) && Number.isInteger(Number(saved.max)) && Number(saved.max) >= 0 ? Number(saved.max) : worldDurability();
  if (!max) return null;
  const value = present(saved.value) && Number.isInteger(Number(saved.value)) ? Math.min(max, Math.max(0, Number(saved.value))) : max;
  return { value, max };
}

/** Items the ability can work on: weapons, armour/shields, and tools. */
export function workableItems(actor) {
  return Array.from(actor?.items ?? []).filter(item => item.type === "weapon" || item.type === "tool"
    || (item.type === "equipment" && Number(item.system?.armor?.value) > 0));
}

/* ---------------------------------------------------------------------- */
/* Effects                                                                 */
/* ---------------------------------------------------------------------- */

/** Temper and True: tools fully repaired; weapons and armour tempered until a long rest. */
export async function applyTemper(actor, items) {
  const lines = [];
  for (const item of items) {
    const durability = durabilityOf(item);
    if (durability) {
      await item.setFlag(GP, "durability", { max: durability.max, value: durability.max });
      lines.push(`${item.name}: durability ${durability.max}/${durability.max}${durability.value === 0 ? " (repaired)" : ""}`);
    } else {
      await item.setFlag(MODULE_ID, "tempered", true);
      lines.push(`${item.name}: tempered, cannot be broken by mundane means until the next long rest`);
    }
  }
  return lines;
}

/** Cold Forge: one broken item works again (a gathering tool returns to half durability). */
export async function applyColdForge(actor, item) {
  const durability = durabilityOf(item);
  if (durability) {
    if (durability.value > 0) throw new Error("Cold Forge only repairs broken tools.");
    const value = Math.max(1, Math.ceil(durability.max / 2));
    await item.setFlag(GP, "durability", { max: durability.max, value });
    return [`${item.name}: field-repaired, durability ${value}/${durability.max}`];
  }
  await item.setFlag(MODULE_ID, "fieldRepaired", true);
  return [`${item.name}: field-repaired, works until it next breaks`];
}

/** Ask which items to work on (up to max). Returns Items or null. */
async function chooseItems(actor, ability) {
  const candidates = workableItems(actor).filter(item => ability.effect !== "coldForge" || !durabilityOf(item) || durabilityOf(item).value === 0);
  if (!candidates.length) return [];
  const DialogV2 = foundry.applications.api.DialogV2;
  const rows = candidates.map(item => {
    const durability = durabilityOf(item);
    const state = durability ? ` (${durability.value === 0 ? "broken" : `${durability.value}/${durability.max}`})` : "";
    return `<label class="cp-pick"><input type="${ability.maxItems > 1 ? "checkbox" : "radio"}" name="item" value="${escape(item.id)}"> <img src="${escape(item.img)}" alt=""> ${escape(item.name)}${escape(state)}</label>`;
  }).join("");
  const picked = await DialogV2.wait({
    window: { title: `${ability.name}: choose ${ability.maxItems > 1 ? `up to ${ability.maxItems} items` : "an item"}` },
    classes: ["gathering-professions-ui", "gp-dialog"],
    content: `<div class="cp-picklist">${rows}</div>`,
    buttons: [{ action: "ok", label: "Work on them", default: true,
      callback: (_event, button) => Array.from(button.form.querySelectorAll('input[name="item"]:checked')).map(input => input.value) }],
    rejectClose: false
  });
  if (!picked) return null;
  if (picked.length > ability.maxItems) throw new Error(`${ability.name} works on at most ${ability.maxItems} item${ability.maxItems === 1 ? "" : "s"}.`);
  return picked.map(id => actor.items.get?.(id) ?? Array.from(actor.items).find(item => item.id === id)).filter(Boolean);
}

/* ---------------------------------------------------------------------- */
/* Using the ability                                                       */
/* ---------------------------------------------------------------------- */

/** Skill total from dnd5e (ability + proficiency + bonuses), else the ability modifier. */
function skillTotal(actor, skill) {
  const data = actor?.system?.skills?.[skill];
  if (Number.isFinite(Number(data?.total))) return Number(data.total);
  const ability = data?.ability ?? globalThis.CONFIG?.DND5E?.skills?.[skill]?.ability ?? "str";
  return Number(actor?.system?.abilities?.[ability]?.mod) || 0;
}

/**
 * Use the profession ability (owner or GM): once per long rest, skill check +
 * profession die vs the ability's DC. On a success, apply its effect to the
 * items chosen (`items` may be passed in to skip the picker).
 */
export async function useAbility(actor, key, options = {}) {
  const ability = readyAbility(actor, key);
  if (isMealAbility(ability)) {
    const diners = options.items ?? await chooseDiners(actor, ability);
    if (!diners?.length) return null;
    if (!game.user.isGM) {
      validatePartyDiners(actor, ability, diners);
      return requestMealAbility(actor, key, diners);
    }
    validateDiners(ability, diners);
    return runPartyAction(actor, diners, () => useAbilityUnlocked(actor, key, { ...options, items: diners }));
  }
  return game.modules.get(GP).api.recipes.runActorAction(actor, () => useAbilityUnlocked(actor, key, options));
}

const isMealAbility = ability => ["hearthcraft", "emptyPot"].includes(ability?.effect);

function readyAbility(actor, key) {
  if (!actor || !(game.user.isGM || actor.isOwner)) throw new Error("Choose a character you own.");
  if (!hasProfession(actor, key)) throw new Error(`${actor.name} is not a ${CRAFTING_PROFESSIONS[key]?.label ?? key}.`);
  const ability = abilityFor(actor, key);
  if (!ability) throw new Error("This profession has no ability.");
  if (abilityUsed(actor, key)) throw new Error(`${actor.name} has used ${ability.name}; it recharges on a long rest.`);
  return ability;
}

async function useAbilityUnlocked(actor, key, { items = null, quarry = null } = {}) {
  const ability = readyAbility(actor, key);
  // Information abilities (Hunter's Pursuit, Fresh Trail): name the quarry first.
  if (ability.effect === "intel") {
    quarry ??= await askQuarry(ability);
    if (!quarry) return null;
  }
  // Meal abilities (Hearthcraft, The Empty Pot) target diners; the rest target inventory items.
  const mealAbility = ability.effect === "hearthcraft" || ability.effect === "emptyPot";
  const chosen = ability.effect === "intel" ? [] : items ?? await (mealAbility ? chooseDiners(actor, ability) : chooseItems(actor, ability));
  if (ability.effect !== "intel" && !chosen?.length) return null;
  if (mealAbility) {
    validateDiners(ability, chosen);
  } else if (chosen.length > ability.maxItems || chosen.some(item => !workableItems(actor).includes(item))) throw new Error("Choose eligible items from this character's inventory.");
  if (ability.effect === "coldForge" && chosen.some(item => durabilityOf(item)?.value > 0)) throw new Error("Cold Forge only repairs broken tools.");
  const die = RANK_DIE[rankOf(actor, key) - 1];
  const modifier = skillTotal(actor, ability.skill);
  const roll = await game.modules.get(GP).api.recipes.rollProfessionCheck(actor,
    { modifier, formula: `1d20 + ${modifier} + 1d${die}` }, { skill: ability.skill });
  const success = roll.total >= ability.dc;
  const previousUsed = actorProfessions(actor)[key]?.abilityUsed;
  await actor.setFlag(MODULE_ID, `professions.${key}.abilityUsed`, true);
  let lines = [];
  if (success && mealAbility) {
    try { lines = await applyMealAbilityUnlocked(ability, chosen); }
    catch (error) {
      if (error.mealRollbackComplete) {
        try {
          if (previousUsed === undefined) await actor.unsetFlag(MODULE_ID, `professions.${key}.abilityUsed`);
          else await actor.setFlag(MODULE_ID, `professions.${key}.abilityUsed`, previousUsed);
        } catch (recoveryError) {
          // A failed readiness restore must never permit an automatic retry.
          await actor.setFlag(MODULE_ID, `professions.${key}.abilityUsed`, true).catch(() => {});
          throw new Error(`Meal effects were restored, but ability readiness recovery failed. GM reconciliation required before retrying: ${recoveryError.message}`);
        }
      }
      throw error;
    }
  }
  else if (success && ability.effect !== "intel") {
    if (chosen?.length) lines = ability.effect === "temper" ? await applyTemper(actor, chosen) : await applyColdForge(actor, chosen[0]);
  }
  if (ability.effect === "intel") {
    lines = [success ? `${actor.name} picks up the trail of ${quarry}. The GM will tell you what you learn.` : `The trail of ${quarry} goes cold. Find new evidence before trying again.`];
    const gms = Array.from(game.users ?? []).filter(user => user.isGM).map(user => user.id);
    if (gms.length) await ChatMessage.create({ whisper: gms, content: `<div class="cp-perk-card"><p><strong>${escape(actor.name)}</strong> used <strong>${escape(ability.name)}</strong> on <strong>${escape(quarry)}</strong>: <strong>${success ? "success" : "failure"}</strong> (${roll.total} vs DC ${ability.dc}).</p>
      ${success ? `<p>${ability.name === "Fresh Trail" ? "Tell them whether the quarry passed through this settlement in the last two weeks; if so, when, which way they left, who they spoke to, and one detail about their condition or purpose." : "Tell them the quarry's direction of travel, recent activity, and likely next destination within the next 24 hours."}</p>` : "<p>They can't try again on this quarry until they find new evidence.</p>"}</div>` });
  }
  const skillLabel = globalThis.CONFIG?.DND5E?.skills?.[ability.skill]?.label ?? ability.skill;
  const flavor = `<div class="gathering-professions-chat"><strong>${escape(ability.name)}</strong> (${escape(CRAFTING_PROFESSIONS[key].label)})
    <br>${escape(skillLabel)} + d${die} vs DC ${ability.dc}: <strong>${success ? "Success" : "Failure"}</strong>
    ${lines.length ? `<ul>${lines.map(line => `<li>${escape(line)}</li>`).join("")}</ul>` : success ? "<br>No items were chosen." : "<br>It can be tried again after a long rest."}</div>`;
  try { await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor }); }
  catch (error) { console.error(`${MODULE_ID}: could not post the ability roll`, error); }
  return { success, total: roll.total, lines };
}

const isPartyActor = entry => entry?.type === "character" && Boolean(entry.hasPlayerOwner);
const canFeed = entry => game.user.isGM || entry?.isOwner;
const worldActor = id => game.actors?.get?.(id) ?? Array.from(game.actors ?? []).find(entry => entry.id === id);

// Acquire every participating actor once, in a deterministic global order.
// Never acquire the cook first and then nest its diners: two cooks feeding
// each other would deadlock. All leases remain held through rollback.
function runPartyAction(actor, diners, task) {
  const actors = [...new Set([actor, ...diners].filter(Boolean))].sort((a, b) => {
    const left = String(a.uuid ?? a.id), right = String(b.uuid ?? b.id);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const lock = index => index === actors.length ? task()
    : game.modules.get(GP).api.recipes.runActorAction(actors[index], () => lock(index + 1));
  return lock(0);
}

function validatePartyDiners(actor, ability, diners) {
  if (!isMealAbility(ability)) throw new Error("Choose a cooking ability.");
  if (!Array.isArray(diners) || !diners.length || diners.length > ability.maxItems) throw new Error(`${ability.name} feeds at most ${ability.maxItems}.`);
  if (new Set(diners.map(entry => entry?.id)).size !== diners.length
    || diners.some(entry => entry?.documentName !== "Actor" || worldActor(entry.id) !== entry || !isPartyActor(entry))) {
    throw new Error("Choose distinct party characters from this world.");
  }
}

const isAbilityAuthority = () => game.user.isGM && game.users?.activeGM?.id === game.user.id;
const validRequestId = id => typeof id === "string" && /^[A-Za-z0-9]{1,64}$/.test(id);
const receiptPath = (actor, requestId) => `mealAbilityReceipts.${actor.id}.${requestId}`;
const responsePath = requestId => `mealAbilityResponses.${requestId}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function requestMealAbility(actor, key, diners) {
  if (!game.users?.activeGM) throw new Error("An active GM is required to feed the party.");
  const requestId = foundry.utils.randomID();
  const request = { requestId, key, path: pathOf(actor, key), diners: diners.map(diner => diner.id) };
  // Do not hold a player lease while waiting: the GM must acquire that lease.
  await actor.setFlag(MODULE_ID, "mealAbilityRequest", request);
  for (let tick = 0; tick < 150; tick++) {
    const receipt = actor.getFlag(MODULE_ID, responsePath(requestId));
    if (receipt?.requestId === requestId && receipt.sender === game.user.id && receipt.status !== "pending") {
      if (receipt.error) throw new Error(receipt.error);
      return receipt.result;
    }
    await sleep(100);
  }
  throw new Error("The GM has not answered the meal request yet. It may still complete; check the ability before trying again.");
}

/** Active GM only. The sender comes from Foundry's updateActor userId, never from request data. */
export async function handleMealAbilityRequest(actor, request, sender) {
  if (!isAbilityAuthority() || !sender?.active || !actor?.id || worldActor(actor.id) !== actor
    || !(sender.isGM || actor.testUserPermission?.(sender, "OWNER")) || !validRequestId(request?.requestId)
    || request.key !== "cook" || !["standard", "wanderer"].includes(request.path)
    || !Array.isArray(request.diners) || request.diners.length < 1 || request.diners.length > 6
    || request.diners.some(id => !validRequestId(id)) || new Set(request.diners).size !== request.diners.length) return null;
  // Copy the bounded payload before waiting on the lease; updates cannot replace it in flight.
  const payload = { requestId: request.requestId, key: request.key, path: request.path, diners: [...request.diners] };
  return runPartyAction(actor, payload.diners.map(worldActor).filter(Boolean), async () => {
    if (!isAbilityAuthority() || !sender.active || !(sender.isGM || actor.testUserPermission?.(sender, "OWNER"))) return null;
    const path = receiptPath(actor, payload.requestId);
    // GM User flags are not writable by players. Keep spent IDs across reloads,
    // rests, and active-GM changes; actor response flags are only transport.
    const prior = Array.from(game.users ?? []).filter(user => user.isGM).map(user => user.getFlag?.(MODULE_ID, path)).find(Boolean);
    if (prior) {
      if (prior.sender !== sender.id) return null;
      await actor.setFlag(MODULE_ID, responsePath(payload.requestId), prior.status === "pending"
        ? { ...prior, status: "error", error: "This meal request was already started. Ask the GM to check its outcome; it will not run again." } : prior);
      return prior.result ?? null;
    }
    let receipt = { requestId: payload.requestId, sender: sender.id, status: "pending" };
    // Reserve the ID durably before any roll or benefit, including failed attempts.
    await game.user.setFlag(MODULE_ID, path, receipt);
    try {
      const ability = readyAbility(actor, payload.key);
      if (!isMealAbility(ability) || pathOf(actor, payload.key) !== payload.path) throw new Error("The cooking ability changed. Choose diners again.");
      const diners = payload.diners.map(worldActor);
      validatePartyDiners(actor, ability, diners);
      const result = await useAbilityUnlocked(actor, payload.key, { items: diners });
      receipt = { ...receipt, status: "complete", result };
    } catch (error) {
      receipt = { ...receipt, status: "error", error: error.message || "The meal ability failed. Ask the GM to check its outcome." };
    }
    await game.user.setFlag(MODULE_ID, path, receipt);
    await actor.setFlag(MODULE_ID, responsePath(payload.requestId), receipt);
    return receipt.result ?? null;
  });
}

let abilityHooksRegistered = false;
export function registerAbilityHooks() {
  if (abilityHooksRegistered) return;
  abilityHooksRegistered = true;
  Hooks.on("updateActor", (actor, changes, _options, userId) => {
    const request = changes.flags?.[MODULE_ID]?.mealAbilityRequest ?? changes[`flags.${MODULE_ID}.mealAbilityRequest`];
    if (!request) return;
    const sender = game.users?.get?.(userId) ?? Array.from(game.users ?? []).find(user => user.id === userId);
    void handleMealAbilityRequest(actor, request, sender).catch(error => console.error(`${MODULE_ID}: meal ability request failed`, error));
  });
  // Never execute flags found on load: only a fresh update has an authenticated sender.
}

function validateDiners(ability, diners) {
  if (!["hearthcraft", "emptyPot"].includes(ability?.effect)) throw new Error("Choose a cooking ability.");
  if (!Array.isArray(diners) || !diners.length || diners.length > ability.maxItems) throw new Error(`${ability.name} feeds at most ${ability.maxItems}.`);
  if (new Set(diners).size !== diners.length || diners.some(entry => entry?.documentName !== "Actor")) throw new Error("Choose distinct characters to feed.");
  if (diners.some(entry => !canFeed(entry))) throw new Error("You may feed only characters you own. Ask the GM to serve the other party members.");
}

/** Ask which party characters eat (up to the ability's limit). */
async function chooseDiners(actor, ability) {
  const party = [...new Set([actor, ...Array.from(game.actors ?? []).filter(isPartyActor)])];
  const DialogV2 = foundry.applications.api.DialogV2;
  const picked = await DialogV2.wait({
    window: { title: `${ability.name}: who eats?` }, classes: ["gathering-professions-ui", "gp-dialog"],
    content: `<div class="cp-picklist">${party.map(entry => `<label class="cp-pick"><input type="checkbox" name="diner" value="${escape(entry.id)}" checked> <img src="${escape(entry.img)}" alt=""> ${escape(entry.name)}</label>`).join("")}</div><p class="hint">Up to ${ability.maxItems}. ${game.user.isGM ? "" : "An active GM serves the meal to the selected party members."}</p>`,
    buttons: [{ action: "ok", label: "Serve", default: true, callback: (_event, button) => Array.from(button.form.querySelectorAll('input[name="diner"]:checked')).map(input => input.value) }],
    rejectClose: false
  });
  if (!picked) return null;
  if (picked.length > ability.maxItems) throw new Error(`${ability.name} feeds at most ${ability.maxItems}.`);
  return picked.map(id => party.find(entry => entry.id === id)).filter(Boolean);
}

/** Hearthcraft: a 24-hour "Hearth-fed" effect. The Empty Pot: remove one level of exhaustion. */
export async function applyMealAbility(ability, diners) {
  validateDiners(ability, diners);
  return runPartyAction(null, diners, () => applyMealAbilityUnlocked(ability, diners));
}

async function applyMealAbilityUnlocked(ability, diners) {
  validateDiners(ability, diners);
  const token = foundry.utils.randomID();
  // Snapshot all targets before the first write. Restore only this ability's
  // effects and changed attributes; unrelated effects remain untouched.
  const snapshots = diners.map(diner => ({ diner,
    effects: Array.from(diner.effects ?? []).filter(effect => effect.getFlag?.(MODULE_ID, "hearthFed"))
      .map(effect => ({ id: effect.id, data: effect.toObject() })),
    tempHp: diner.system?.attributes?.hp?.temp,
    exhaustion: diner.system?.attributes?.exhaustion
  }));
  const touched = [];
  const lines = [];
  try {
    for (const snapshot of snapshots) {
      const { diner } = snapshot;
      touched.push(snapshot);
      if (ability.effect === "emptyPot") {
        const current = Number(diner.system?.attributes?.exhaustion) || 0;
        if (current > 0) await diner.update({ "system.attributes.exhaustion": current - 1 });
        lines.push(`${diner.name}: ${current > 0 ? `exhaustion ${current} → ${current - 1}` : "well fed (no exhaustion to remove)"}`);
      } else {
        const created = await diner.createEmbeddedDocuments("ActiveEffect", [{ name: "Hearth-fed", img: "icons/consumables/food/bowl-stew-brown.webp", changes: [],
          duration: { seconds: 86400 }, description: "Advantage on one saving throw against disease, poison, or fatigue within 24 hours (apply when it comes up). Mundane food sickness or mild poison is cured; a magical one is suppressed.",
          flags: { [MODULE_ID]: { hearthFed: true, mealAbilityTransaction: token } } }]);
        if (created.length !== 1) throw new Error(`Could not create Hearth-fed for ${diner.name}.`);
        // Preserve the previous effect until its replacement exists.
        if (snapshot.effects.length) await diner.deleteEmbeddedDocuments("ActiveEffect", snapshot.effects.map(effect => effect.id));
        lines.push(`${diner.name}: Hearth-fed for 24 hours`);
      }
    }
  } catch (error) {
    const failures = [];
    for (const snapshot of touched.reverse()) {
      const { diner } = snapshot;
      // Attempt every recovery step even if one fails, and every diner even
      // if another cannot be restored. A rejected write may have taken effect.
      const attempt = async task => { try { await task(); } catch (failure) { failures.push(`${diner.name}: ${failure.message}`); } };
      await attempt(async () => {
        const added = Array.from(diner.effects ?? []).filter(effect => effect.getFlag?.(MODULE_ID, "mealAbilityTransaction") === token);
        if (added.length) await diner.deleteEmbeddedDocuments("ActiveEffect", added.map(effect => effect.id));
      });
      await attempt(async () => {
        const missing = snapshot.effects.filter(effect => !Array.from(diner.effects ?? []).some(current => current.id === effect.id));
        if (missing.length) {
          const restored = await diner.createEmbeddedDocuments("ActiveEffect", missing.map(effect => effect.data), { keepId: true });
          if (restored.length !== missing.length) throw new Error("Could not restore prior Hearth-fed effects.");
        }
      });
      await attempt(async () => {
        const changes = {};
        if (diner.system?.attributes?.hp?.temp !== snapshot.tempHp) changes["system.attributes.hp.temp"] = snapshot.tempHp;
        if (diner.system?.attributes?.exhaustion !== snapshot.exhaustion) changes["system.attributes.exhaustion"] = snapshot.exhaustion;
        if (Object.keys(changes).length) await diner.update(changes);
      });
    }
    if (failures.length) throw new Error(`Meal ability failed and rollback was incomplete. Ability remains spent; GM reconciliation required before retrying. ${failures.join("; ")}`);
    const recovered = new Error(`Meal ability failed: ${error.message}. All diners were restored.`);
    recovered.mealRollbackComplete = true;
    throw recovered;
  }
  return lines;
}

/** Ask the player which quarry the ability is used on. */
async function askQuarry(ability) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const value = await DialogV2.wait({
    window: { title: `${ability.name}: who are you tracking?` }, classes: ["gathering-professions-ui", "gp-dialog"],
    content: `<p>${escape(ability.text)}</p><div class="form-group"><label>Quarry</label><input type="text" name="quarry" placeholder="A name or a clear description" autofocus></div>`,
    buttons: [{ action: "ok", label: ability.name, default: true, callback: (_event, button) => button.form.elements.quarry.value.trim() }],
    rejectClose: false
  });
  return value || null;
}

/** Long rest: abilities recharge; Tempered wears off. */
export async function longRest(actor) {
  const professions = actorProfessions(actor);
  for (const key of Object.keys(professions)) if (professions[key]?.abilityUsed) await actor.setFlag(MODULE_ID, `professions.${key}.abilityUsed`, false);
  for (const item of Array.from(actor.items ?? [])) if (item.getFlag?.(MODULE_ID, "tempered")) await item.unsetFlag(MODULE_ID, "tempered");
  await resetTaskUses(actor);
}

/* ---------------------------------------------------------------------- */
/* Talents in dnd5e's roll dialog                                          */
/* ---------------------------------------------------------------------- */

/** Talents of an actor that fit a roll ({ skill, tool, ability }), with their die. */
export function talentsForRoll(actor, { skill = null, tool = null, ability = null } = {}) {
  const result = [];
  for (const key of Object.keys(actorProfessions(actor))) {
    const profession = CRAFTING_PROFESSIONS[key];
    const rank = rankOf(actor, key);
    if (!profession || !rank) continue;
    for (const id of talentsOf(actor, key)) {
      const entry = profession.talents?.find(row => row.id === id);
      if (!entry) continue;
      const fits = skill ? entry.skills.includes(skill) : tool ? entry.tools.includes(tool) : ability ? entry.abilities.includes(ability) : false;
      if (fits) result.push({ ...entry, die: RANK_DIE[rank - 1], profession: profession.label });
    }
  }
  return result;
}

const TALENT_TAG = /\s*\+?\s*1d\d+\[Talent[^\]]*\]/g;
/** The situational bonus with talent dice: only the highest die, once (the doc's rule). */
export function situationalWithTalents(current, talents) {
  const base = String(current ?? "").replace(TALENT_TAG, "").trim();
  if (!talents.length) return base;
  const die = Math.max(...talents.map(entry => entry.die));
  const term = `1d${die}[Talent: ${talents.map(entry => entry.name).join(", ")}]`;
  return base ? `${base} + ${term}` : term;
}

const checked = new WeakMap();

/** Render hook for dnd5e's roll configuration dialogs: offer fitting talents. */
export function injectTalents(app, element) {
  const config = app?.config ?? {};
  // dnd5e 6.0.6 uses hookNames to distinguish ability checks from saves.
  // Both dialogs carry config.ability; only check hooks may offer talents.
  const names = (config.hookNames ?? []).map(name => String(name).toLowerCase());
  if (!names.includes("abilitycheck") || names.some(name => ["savingthrow", "deathsave", "concentration"].includes(name))) return;
  const actor = config.subject;
  if (!actor || actor.documentName !== "Actor") return;
  const isPlain = !config.skill && !config.tool;
  const talents = talentsForRoll(actor, { skill: config.skill ?? null, tool: config.tool ?? null, ability: isPlain ? config.ability ?? null : null });
  if (!talents.length) return;
  const input = element.querySelector('input[name="roll.0.situational"]');
  if (!input) return;
  element.querySelector(".cp-talents")?.remove();
  const state = checked.get(app) ?? new Set();
  checked.set(app, state);
  const box = document.createElement("fieldset");
  box.className = "cp-talents";
  box.innerHTML = `<legend>Talents (add your profession die if it applies)</legend>${talents.map(entry =>
    `<label title="${escape(entry.text)}"><input type="checkbox" data-cp-talent="${escape(entry.id)}" ${state.has(entry.id) ? "checked" : ""}> <strong>${escape(entry.name)}</strong> (+d${entry.die}, ${escape(entry.profession)}) <small>${escape(entry.text)}</small></label>`).join("")}`;
  input.closest(".form-group")?.after(box) ?? input.after(box);
  box.addEventListener("change", event => {
    const id = event.target?.dataset?.cpTalent;
    if (!id) return;
    if (event.target.checked) state.add(id); else state.delete(id);
    input.value = situationalWithTalents(input.value, talents.filter(entry => state.has(entry.id)));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
