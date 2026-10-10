// The crafting check and craft, experimenting, and recipe scrolls.
import { MODULE_ID, CRAFTING_PROFESSIONS } from "./professions.js";
import { craftingRules } from "./rules.js";
import { findRecipe, professionRecipes, folderPath, learnIdOf } from "./recipes.js";
import { actorProfessions, xpOf, rankForXp, hasProfession, rankOf, dieOf, knows, knownIds, learn, addXp, completedIds, taskUsesLeft, useTask } from "./state.js";
import { findContact, findContract, CONTACT_PREFIX, CONTRACT_PREFIX } from "./contacts.js";
import { applyMasterwork, applyPerk, fittingPerks, isGear, perkList } from "./perks.js";
import { stampMeal, mealFor } from "./meals.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const gp = () => game.modules.get("gathering-professions").api.recipes;

/* ---------------------------------------------------------------------- */
/* Check                                                                   */
/* ---------------------------------------------------------------------- */

/** The tool Item the profession needs, if the actor carries one. */
export function professionTool(actor, profession) {
  const tool = CRAFTING_PROFESSIONS[profession]?.tool;
  if (!tool) return null;
  return Array.from(actor?.items ?? []).find(item => item.type === "tool" && (item.system?.type?.baseItem === tool.key || item.name === tool.name)) ?? null;
}

/** Proficiency multiplier with the tool (0, 0.5, 1, 2) from dnd5e data. */
function toolMultiplier(actor, profession, toolItem) {
  const key = CRAFTING_PROFESSIONS[profession].tool.key;
  const actorValue = Number(actor?.system?.tools?.[key]?.value);
  if (Number.isFinite(actorValue) && actorValue > 0) return actorValue;
  const itemValue = Number(toolItem?.system?.proficient);
  return Number.isFinite(itemValue) && itemValue > 0 ? itemValue : 0;
}

/** Check numbers for a recipe: d20 + ability + tool proficiency + profession die vs tier DC − rank reduction. */
export function checkFor(actor, row, rules = craftingRules()) {
  const profession = CRAFTING_PROFESSIONS[row.profession];
  const tier = Math.min(5, Math.max(1, Number(row.tier) || 1));
  const rank = rankOf(actor, row.profession);
  const ability = Number(actor?.system?.abilities?.[profession.ability]?.mod) || 0;
  let proficiency;
  if (profession.tool) {
    const multiplier = toolMultiplier(actor, row.profession, professionTool(actor, row.profession));
    proficiency = Math.floor((Number(actor?.system?.attributes?.prof) || 0) * multiplier);
  } else {
    // Skill check (e.g. Investigation): dnd5e's skill total already includes ability and proficiency.
    const total = Number(actor?.system?.skills?.[profession.skill]?.total);
    proficiency = Number.isFinite(total) ? total - ability : 0;
  }
  const die = dieOf(actor, row.profession);
  const reduction = rank ? rules.rankDcReduction[rank - 1] : 0;
  const target = rules.tierDc[tier - 1] - reduction + (Number(row.dcBonus) || 0);
  const modifier = ability + proficiency;
  return { tier, rank, die, modifier, ability, abilityKey: profession.ability, proficiency, target, reduction,
    formula: `1d20 + ${modifier}${die ? ` + 1d${die}` : ""}` };
}

/** Why the actor cannot make this now (profession, rank, tool), or null. */
export function blockedReason(actor, row) {
  const profession = CRAFTING_PROFESSIONS[row.profession];
  if (!hasProfession(actor, row.profession)) return `Needs the ${profession.label} profession`;
  if (rankOf(actor, row.profession) < row.tier) return `Needs ${profession.label} rank ${row.tier}`;
  if (profession.tool && !professionTool(actor, row.profession)) return `Needs ${profession.tool.name}`;
  if (row.source === "contact" && taskUsesLeft(actor, row) < 1) return row.limit?.per === "day" ? "Done for today" : "Done until a long rest";
  return null;
}

export function recipeMinutes(row, rules = craftingRules()) {
  if (row?.minutes !== undefined && row?.minutes !== null && row.minutes !== "" && Number.isInteger(Number(row.minutes))) return Number(row.minutes);
  return rules.tierMinutes[Math.min(5, Math.max(1, Number(row?.tier) || 1)) - 1];
}

/* ---------------------------------------------------------------------- */
/* Craft                                                                   */
/* ---------------------------------------------------------------------- */

const LABELS = Object.freeze({ failed: "Failed", partial: "Near Miss", successful: "Success", excellent: "Excellent", masterful: "Masterful" });

/** Ask the crafting player to pick a perk (player mode). */
async function askPerk(perks, itemName) {
  if (!perks.length) return null;
  const DialogV2 = foundry.applications.api.DialogV2;
  const choice = await DialogV2.wait({
    window: { title: `Choose a perk for ${itemName}` }, classes: ["gathering-professions-ui", "gp-dialog"],
    content: `<p>Your work earned a perk. Choose one:</p>${perks.map((entry, index) => `<label class="cp-perk-choice"><input type="radio" name="perk" value="${index}" ${index ? "" : "checked"}> <strong>${escape(entry.name)}</strong> — ${escape(entry.description)}</label>`).join("")}`,
    buttons: [{ action: "ok", label: "Apply", default: true, callback: (_event, button) => button.form.elements.perk.value }],
    rejectClose: false
  });
  return choice === null || choice === undefined ? null : perks[Number(choice)] ?? null;
}

/** GM whisper with buttons to apply one of the fitting perks to the crafted item. */
async function whisperPerkChoice(actor, itemName, token, perks) {
  const gms = Array.from(game.users ?? []).filter(user => user.isGM).map(user => user.id);
  if (!gms.length || !perks.length) return;
  await ChatMessage.create({
    whisper: gms,
    content: `<div class="cp-perk-card"><p><strong>${escape(actor.name)}</strong> crafted <strong>${escape(itemName)}</strong> and earned a perk. Choose one:</p>
      ${perks.map(entry => `<button type="button" data-cp-perk="${escape(entry.id)}" data-cp-actor="${escape(actor.uuid)}" data-cp-token="${escape(token)}" title="${escape(entry.description)}">${escape(entry.name)}</button>`).join("")}</div>`
  });
}

/** GM: apply a chosen perk to the item (or the queued job) marked with a token. */
export async function applyPendingPerk(actorUuid, token, perkId) {
  if (!game.user.isGM) throw new Error("Only the GM may choose this perk.");
  const actor = await fromUuid(actorUuid);
  return gp().runActorAction(actor, () => applyPendingPerkUnlocked(actor, token, perkId));
}

async function applyPendingPerkUnlocked(actor, token, perkId) {
  const entry = perkList().find(row => row.id === perkId);
  if (!actor || !entry) throw new Error("That item or perk no longer exists.");
  const item = Array.from(actor.items).find(row => row.getFlag(MODULE_ID, "pendingPerk") === token);
  if (item) {
    const data = applyPerk(item.toObject(), entry);
    delete data.flags[MODULE_ID].pendingPerk;
    await item.update({ name: data.name, system: data.system, flags: data.flags });
    await item.unsetFlag(MODULE_ID, "pendingPerk");
    return item.name;
  }
  const jobs = actor.getFlag("gathering-professions", "refiningJobs") ?? {};
  const job = Object.values(jobs).find(row => row?.data?.flags?.[MODULE_ID]?.pendingPerk === token);
  if (!job) throw new Error("That item is no longer pending a perk.");
  const data = applyPerk(structuredClone(job.data), entry);
  delete data.flags[MODULE_ID].pendingPerk;
  await actor.setFlag("gathering-professions", `refiningJobs.${job.id}`, { ...job, name: data.name, data });
  await actor.unsetFlag("gathering-professions", `refiningJobs.${job.id}.data.flags.${MODULE_ID}.pendingPerk`);
  return data.name;
}

/**
 * Craft `batch` times with one check. Near miss (fail by < 5): lose half the
 * materials (rounded up). Fail by 5+ or a natural 1: lose them all. Success:
 * the products, crafting XP per unit, and the GM-configured Excellent /
 * Masterful outcomes (extra products, Masterwork, perk).
 */
export function craft(actor, id, batch = 1) {
  const row = findRecipe(id);
  const resource = row?.kind === "bounty" && !row.repeatable && craftingRules().knowledgeMode === "party" ? "party-bounty" : null;
  return gp().runActorAction(actor, () => craftUnlocked(actor, id, batch), { resource });
}

async function craftUnlocked(actor, id, batch = 1) {
  if (!actor || !(game.user.isGM || actor.isOwner)) throw new Error("Choose a character you own.");
  const row = findRecipe(id);
  if (!row) throw new Error("That recipe no longer exists.");
  if (!game.user.isGM && !knows(actor, learnIdOf(row))) throw new Error(`${actor.name} has not learned this ${row.kind === "bounty" ? "job" : "recipe"}.`);
  const blocked = blockedReason(actor, row);
  if (blocked) throw new Error(`${actor.name}: ${blocked}.`);
  if (row.kind === "bounty") return huntUnlocked(actor, row);
  const count = Math.trunc(Number(batch));
  if (!Number.isInteger(count) || count < 1) throw new Error("Choose how many to make.");
  if (count > gp().maxBatch(actor, row)) throw new Error(`${actor.name} does not have enough materials for ${count}.`);
  const product = Array.from(game.items ?? []).find(item => item.name === row.output);
  if (!product) throw new Error(`${row.output} is not prepared in this world yet. Ask the GM (Crafting Professions → Prepare items).`);
  const rules = craftingRules();
  const check = checkFor(actor, row, rules);
  const roll = await gp().rollProfessionCheck(actor, check, { tool: CRAFTING_PROFESSIONS[row.profession].tool?.key, skill: CRAFTING_PROFESSIONS[row.profession].tool ? undefined : CRAFTING_PROFESSIONS[row.profession].skill });
  const natural = roll.dice?.[0]?.total;
  let degree = gp().degree(roll.total, check.target);
  if (natural === 20) degree = gp().naturalMasterful(degree);
  if (natural === 1 && degree.id !== "failed") degree = { ...degree, id: "failed", natural1: true };
  const success = ["successful", "excellent", "masterful"].includes(degree.id);
  const lost = degree.id === "failed" ? row.inputs.map(([name, quantity]) => [name, quantity * count])
    : degree.id === "partial" ? row.inputs.map(([name, quantity]) => [name, Math.ceil(quantity * count / 2)])
      : row.inputs.map(([name, quantity]) => [name, quantity * count]);
  for (const [name, quantity] of lost) await gp().removeFromInventory(actor, name, quantity);
  let made = 0;
  let data = null;
  const notes = [];
  let pendingToken = null;
  if (success) {
    data = product.toObject();
    foundry.utils.setProperty(data, "flags.gathering-professions.toolSource", product.uuid);
    delete data._id; delete data.folder; delete data.ownership; delete data._stats;
    const cooking = CRAFTING_PROFESSIONS[row.profession]?.kind === "cooking";
    const outcome = cooking ? { ...(rules.cooking[degree.id] ?? { extra: 0, exquisite: false }), masterwork: false, perk: false }
      : rules.outcomes[degree.id] ?? { extra: 0, masterwork: false, perk: false };
    made = row.quantity * count + (outcome.extra ?? 0);
    if (cooking) {
      stampMeal(data, row.output, { exquisite: Boolean(outcome.exquisite), valueFactor: rules.cooking.exquisiteValue });
      if (outcome.exquisite && mealFor(row.output)) notes.push("Exquisite");
    }
    if (outcome.extra) notes.push(`+${outcome.extra} extra${cooking ? " serving" + (outcome.extra === 1 ? "" : "s") : ""}`);
    if (outcome.masterwork && isGear(data)) { applyMasterwork(data, rules.masterworkValue); notes.push("Masterwork"); }
    if (outcome.perk && isGear(data)) {
      const perks = fittingPerks(data);
      if (perks.length) {
        if (rules.perkPicker === "random") {
          const chosen = perks[Math.floor(Math.random() * perks.length)];
          applyPerk(data, chosen); notes.push(`perk: ${chosen.name}`);
        } else if (rules.perkPicker === "player") {
          const chosen = await askPerk(perks, data.name);
          if (chosen) { applyPerk(data, chosen); notes.push(`perk: ${chosen.name}`); }
        } else {
          pendingToken = foundry.utils.randomID();
          foundry.utils.setProperty(data, `flags.${MODULE_ID}.pendingPerk`, pendingToken);
          notes.push("perk: the GM will choose");
        }
      }
    }
    await addXp(actor, row.profession, rules.tierXp[check.tier - 1] * count, rules);
  }
  let job = null;
  if (made) {
    const minutes = rules.timed ? recipeMinutes(row, rules) * count : 0;
    if (minutes) job = await gp().queueJob(actor, { name: data.name, img: data.img, quantity: made, data, ready: (game.time?.worldTime ?? 0) + minutes * 60, recipe: id, minutes });
    else await gp().addToInventory(actor, data, made);
    if (pendingToken) await whisperPerkChoice(actor, data.name, pendingToken, fittingPerks(data));
  }
  const profession = CRAFTING_PROFESSIONS[row.profession];
  const used = row.inputs.map(([name, quantity]) => `${quantity * count} ${escape(name)}`).join(", ");
  const xp = success ? rules.tierXp[check.tier - 1] * count : 0;
  const outcomeText = success ? `${made} ${escape(data.name)}${notes.length ? ` (${escape(notes.join(", "))})` : ""}${job ? `, ready in ${gp().formatMinutes(job.minutes)}` : ""}.`
    : `Ruined: lost ${lost.map(([name, quantity]) => `${quantity} ${escape(name)}`).join(", ")}.`;
  const flavor = `<div class="gathering-professions-chat"><strong>${escape(profession.verb)}: ${escape(row.output)}${count > 1 ? ` ×${count}` : ""}</strong>
    <br>${escape(profession.label)} (${escape(profession.tool.name)}) check, tier ${check.tier} · DC ${check.target} (rank ${check.rank}, d${check.die}) · from ${used}
    <br><strong>${LABELS[degree.id]}</strong>${natural === 20 ? " (natural 20)" : degree.natural1 ? " (natural 1)" : ""}: ${outcomeText}${xp ? ` +${xp} ${escape(profession.label)} XP.` : ""}</div>`;
  try { await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor }); }
  catch (error) { console.error(`${MODULE_ID}: could not post the crafting roll`, error); }
  return { degree: degree.id, made, lost, xp, job, name: data?.name ?? null, pendingPerk: pendingToken };
}

/* ---------------------------------------------------------------------- */
/* Experimenting                                                           */
/* ---------------------------------------------------------------------- */

/**
 * Try a set of item names at the forge. Learns an unknown recipe of the
 * profession (tier ≤ rank) whose ingredients are exactly these items; amounts
 * don't matter and nothing is used. Otherwise a warm or cold hint.
 */
export async function experiment(actor, profession, names) {
  if (!actor) return { learned: null, warm: false, message: "Choose a character first." };
  return gp().runActorAction(actor, () => experimentUnlocked(actor, profession, names));
}

async function experimentUnlocked(actor, profession, names) {
  const label = CRAFTING_PROFESSIONS[profession]?.label ?? profession;
  if (!actor) return { learned: null, warm: false, message: "Choose a character first." };
  if (!hasProfession(actor, profession)) return { learned: null, warm: false, message: `Only a ${label} can experiment here.` };
  const chosen = [...new Set(names)];
  if (!chosen.length) return { learned: null, warm: false, message: "Put something in first." };
  const missing = chosen.filter(name => gp().inventoryCount(actor, name) <= 0);
  if (missing.length) return { learned: null, warm: false, message: `Carry the ingredients first: ${missing.join(", ")}.` };
  const known = knownIds(actor);
  const rank = rankOf(actor, profession);
  const candidates = professionRecipes(profession).filter(row => !known.has(row.id) && row.tier <= rank);
  const same = row => row.inputs.length === chosen.length && row.inputs.every(([name]) => chosen.includes(name));
  const match = candidates.find(same);
  if (match) {
    await learn(actor, [match.id], { locked: true });
    return { learned: match, warm: true, message: `Discovered: ${match.output}! ${actor.name} can now make it.` };
  }
  const warm = candidates.some(row => chosen.every(name => row.inputs.some(([input]) => input === name)));
  return { learned: null, warm, message: warm ? "Something here could work…" : "Nothing comes of it." };
}

/* ---------------------------------------------------------------------- */
/* Recipe scrolls                                                          */
/* ---------------------------------------------------------------------- */

/* ---------------------------------------------------------------------- */
/* Bounties                                                                */
/* ---------------------------------------------------------------------- */

/** A weighted pick from [[name, weight], ...]. */
export function pickFind(finds, random = Math.random) {
  const total = finds.reduce((sum, [, weight]) => sum + Math.max(0, Number(weight) || 0), 0);
  if (!total) return null;
  let roll = random() * total;
  for (const [name, weight] of finds) { roll -= Math.max(0, Number(weight) || 0); if (roll < 0) return name; }
  return finds.at(-1)?.[0] ?? null;
}

/**
 * Take a contract. Near miss: the quarry gets away, half the used-up gear lost,
 * the job stays open. Bad failure: all used-up gear and every at-risk item
 * lost. Success: gold (+ bonus on great results), XP, maybe a rare find; a
 * one-time job is then completed. With timed crafting, payment arrives after the hunt.
 */
export function hunt(actor, row) {
  return craft(actor, typeof row === "string" ? row : row?.id, 1);
}

async function huntUnlocked(actor, row) {
  const rules = craftingRules();
  if (!row.repeatable && completedIds(actor, rules).has(row.jobId)) throw new Error("This job is already done.");
  if (gp().maxBatch(actor, row) < 1) throw new Error(`${actor.name} does not have the gear this job needs.`);
  const check = checkFor(actor, row, rules);
  if (row.source === "contact") await useTask(actor, row);
  const roll = await gp().rollProfessionCheck(actor, check, { skill: CRAFTING_PROFESSIONS[row.profession].skill });
  const natural = roll.dice?.[0]?.total;
  let degree = gp().degree(roll.total, check.target);
  if (natural === 20) degree = gp().naturalMasterful(degree);
  if (natural === 1 && degree.id !== "failed") degree = { ...degree, id: "failed", natural1: true };
  const success = ["successful", "excellent", "masterful"].includes(degree.id);
  const lost = [];
  row.inputs.forEach(([name, quantity], index) => {
    const mode = row.inputMeta?.[index]?.mode ?? "used";
    let amount = 0;
    if (mode === "used") amount = success || degree.id === "failed" ? quantity : degree.id === "partial" ? Math.ceil(quantity / 2) : 0;
    if (mode === "risk" && degree.id === "failed") amount = quantity;
    if (amount) lost.push([name, amount]);
  });
  for (const [name, amount] of lost) await gp().removeFromInventory(actor, name, amount);
  let gold = 0;
  let find = null;
  let askGm = false;
  if (success) {
    const great = degree.id === "excellent" ? rules.bounty.excellent : degree.id === "masterful" ? rules.bounty.masterful : null;
    gold = Math.round(row.gold * (1 + (great?.bonusGold ?? 0) / 100));
    if (great?.find) {
      const name = row.finds?.length ? pickFind(row.finds) : null;
      find = name ? Array.from(game.items ?? []).find(item => item.name === name) ?? null : null;
      askGm = !find;
    }
  }
  let job = null;
  if (success) {
    const data = find ? (() => { const copy = find.toObject(); delete copy._id; delete copy.folder; delete copy.ownership; delete copy._stats; return copy; })() : null;
    const minutes = rules.timed ? Math.max(0, Number(row.minutes) || 0) : 0;
    const progress = bountyProgress(actor, row, rules.tierXp[check.tier - 1], rules);
    const record = await gp().queueJob(actor, { name: row.output, img: data?.img ?? row.groupImg, quantity: 1, gold, data,
      ready: (game.time?.worldTime ?? 0) + minutes * 60, recipe: row.id, minutes }, { updates: progress.updates, deliver: !minutes });
    job = minutes ? record : null;
    await progress.notify();
    if (askGm) {
      const gms = Array.from(game.users ?? []).filter(user => user.isGM).map(user => user.id);
      if (gms.length) await ChatMessage.create({ whisper: gms, content: `<p><strong>${escape(actor.name)}</strong> found something valuable on the quarry of <strong>${escape(row.output)}</strong>. Give them a rare find of your choice.</p>` });
    }
  }
  const LABEL = { failed: "Bounty failed", partial: "The quarry got away", successful: "Success", excellent: "Excellent", masterful: "Masterful" };
  const outcome = success
    ? `${gold} gp${find ? `, and ${escape(find.name)} found on the quarry` : askGm ? ", and a rare find (the GM picks)" : ""}${job ? `; paid in ${gp().formatMinutes(job.minutes)}` : ""}.`
    : degree.id === "partial" ? `No pay; the job stays open.${lost.length ? ` Lost ${lost.map(([name, amount]) => `${amount} ${escape(name)}`).join(", ")}.` : ""}`
      : `No pay.${lost.length ? ` Lost ${lost.map(([name, amount]) => `${amount} ${escape(name)}`).join(", ")}.` : ""}`;
  const flavor = `<div class="gathering-professions-chat"><strong>Bounty: ${escape(row.title ?? row.output)}</strong>
    <br>Investigation check, tier ${check.tier} · DC ${check.target} (rank ${check.rank}, d${check.die})
    <br><strong>${LABEL[degree.id]}</strong>${natural === 20 ? " (natural 20)" : degree.natural1 ? " (natural 1)" : ""}: ${outcome}${success ? ` +${rules.tierXp[check.tier - 1]} Bounty Hunter XP.` : ""}</div>`;
  try { await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor }); }
  catch (error) { console.error(`${MODULE_ID}: could not post the bounty roll`, error); }
  return { degree: degree.id, gold, find: find?.name ?? null, askGm, lost, job };
}

/** Stage progression for the same Actor update that persists bounty rewards. */
function bountyProgress(actor, row, amount, rules) {
  const key = row.profession;
  const profession = CRAFTING_PROFESSIONS[key];
  const entry = { ...actorProfessions(actor)[key], xp: xpOf(actor, key) + amount };
  const oldRank = rankOf(actor, key);
  if (rules.rankUpMode === "auto") entry.rank = Math.max(oldRank, rankForXp(entry.xp, rules));
  const ready = rules.rankUpMode === "gm" && oldRank < 5 && entry.xp >= rules.rankXp[oldRank] ? oldRank + 1 : null;
  const announceReady = ready && entry.readyNotified !== ready;
  if (announceReady) entry.readyNotified = ready;
  const updates = { [`flags.${MODULE_ID}.professions.${key}`]: entry };
  if (!row.repeatable) updates[`flags.${MODULE_ID}.completed`] = [...new Set([...(actor.getFlag(MODULE_ID, "completed") ?? []), row.jobId])];
  return { updates, async notify() {
    // Notifications must not turn a committed reward into a failed action.
    try {
      if (entry.rank > oldRank) ui.notifications.info(`${actor.name} reached ${profession.label} rank ${entry.rank}: ${profession.ranks[entry.rank - 1].title}!`);
      if (announceReady) {
        const gms = Array.from(game.users ?? []).filter(user => user.isGM).map(user => user.id);
        const goal = profession.ranks[ready - 2]?.goal ?? "";
        if (gms.length) await ChatMessage.create({ whisper: gms, content: `<p><strong>${escape(actor.name)}</strong> has the XP for <strong>${escape(profession.label)} rank ${ready}</strong>${goal ? `. Story goal: <em>${escape(goal)}</em>` : ""}. Promote them in their Professions menu when it is met.</p>` });
      }
    } catch (error) { console.error(`${MODULE_ID}: could not announce bounty progress`, error); }
  } };
}

/* ---------------------------------------------------------------------- */
/* Recipe and contact scrolls                                              */
/* ---------------------------------------------------------------------- */

export { SCROLL_PRICE } from "./pricing.js";
import { SCROLL_PRICE } from "./pricing.js";
const SCROLL_ICON = "icons/sundries/scrolls/scroll-bound-brown-tan.webp";
const CONTACT_ICON = "icons/sundries/documents/document-letter-blue.webp";

/**
 * GM: create an Item that teaches: "Recipe: <product>" for crafting recipes;
 * for bounties, "Contact: <name>" (a contact's repeatable task) or
 * "Wanted: <target>" (a one-time contract).
 */
export async function makeScroll(id) {
  if (!game.user.isGM) throw new Error("Only the GM may make recipe scrolls.");
  const row = findRecipe(id, { includeDisabled: true });
  if (!row) throw new Error("That recipe no longer exists.");
  const profession = CRAFTING_PROFESSIONS[row.profession];
  if (row.source === "contact") return makeContactScroll(row.profession, row.contactId);
  if (row.source === "contract") return makeWantedNotice(row.profession, row.contractId);
  const folder = await folderPath(["Crafting", "Recipe Scrolls"]);
  const inputs = row.inputs.map(([name, quantity]) => `${quantity} ${escape(name)}`).join(", ");
  const [item] = await Item.implementation.create([{
    name: `Recipe: ${row.output}`, type: "loot", img: SCROLL_ICON, folder: folder.id,
    system: {
      description: { value: `<p>A ${escape(profession.label.toLowerCase())}'s recipe for <strong>${escape(row.output)}</strong> (tier ${row.tier}): ${inputs}.</p><p><em>A ${escape(profession.label)} learns the recipe by using this scroll (click it in the inventory) or with Learn in the Recipes window. The scroll is used up.</em></p>` },
      price: { value: SCROLL_PRICE[row.tier - 1] ?? 10, denomination: "gp" }, quantity: 1, weight: { value: 0, units: "lb" }, type: { value: "treasure" }
    },
    flags: { [MODULE_ID]: { recipe: id } }
  }]);
  return item;
}

const LETTER_PRICE = Object.freeze([2, 5, 20, 100, 500]);

/** GM: a "Contact: <name>" letter that introduces a contact (their repeatable task). */
export async function makeContactScroll(profession, contactId) {
  if (!game.user.isGM) throw new Error("Only the GM may make contact letters.");
  const info = findContact(contactId);
  if (!info) throw new Error("That contact no longer exists.");
  const folder = await folderPath(["Crafting", "Contact Letters"]);
  const [item] = await Item.implementation.create([{
    name: `Contact: ${info.name}`, type: "loot", img: CONTACT_ICON, folder: folder.id,
    system: {
      description: { value: `<p>A letter of introduction to <strong>${escape(info.name)}</strong> (tier ${info.tier}). ${escape(info.text)}</p><p>Work on offer: <strong>${escape(info.task.title)}</strong>. ${escape(info.task.brief)}</p><p><em>A ${escape(CRAFTING_PROFESSIONS[profession].label)} makes the contact by using this letter (click it in the inventory) or with Make contact in the Recipes window. The letter is used up.</em></p>` },
      price: { value: LETTER_PRICE[info.tier - 1] ?? 2, denomination: "gp" }, quantity: 1, weight: { value: 0, units: "lb" }, type: { value: "treasure" }
    },
    flags: { [MODULE_ID]: { contact: { profession, id: contactId } } }
  }]);
  return item;
}

/** GM: a "Wanted: <target>" notice that gives a one-time contract. */
export async function makeWantedNotice(profession, contractId) {
  if (!game.user.isGM) throw new Error("Only the GM may make wanted notices.");
  const info = findContract(contractId);
  if (!info) throw new Error("That contract no longer exists.");
  const folder = await folderPath(["Crafting", "Wanted Notices"]);
  const [item] = await Item.implementation.create([{
    name: `Wanted: ${info.target}`, type: "loot", img: "icons/sundries/documents/document-sealed-red-tan.webp", folder: folder.id,
    system: {
      description: { value: `<p><strong>${escape(info.title)}</strong> (${escape(info.town)}, tier ${info.tier}). ${escape(info.brief)}</p><p><em>A ${escape(CRAFTING_PROFESSIONS[profession].label)} takes the contract by using this notice (click it in the inventory) or with Take in the Recipes window. The notice is used up.</em></p>` },
      price: { value: 0, denomination: "gp" }, quantity: 1, weight: { value: 0, units: "lb" }, type: { value: "treasure" }
    },
    flags: { [MODULE_ID]: { contract: { profession, id: contractId } } }
  }]);
  return item;
}

/** The recipe a scroll teaches, if any. */
export const scrollRecipe = item => item?.getFlag?.(MODULE_ID, "recipe") ?? null;
export const scrollContact = item => item?.getFlag?.(MODULE_ID, "contact") ?? null;
export const scrollContract = item => item?.getFlag?.(MODULE_ID, "contract") ?? null;

/** What a scroll teaches: { profession, ids, label } or null. */
export function scrollTeaches(item) {
  const contactFlag = scrollContact(item);
  if (contactFlag && findContact(contactFlag.id) && CRAFTING_PROFESSIONS[contactFlag.profession]) {
    return { profession: contactFlag.profession, ids: [`${CONTACT_PREFIX}${contactFlag.id}`], label: `a new contact: ${findContact(contactFlag.id).name}` };
  }
  const contractFlag = scrollContract(item);
  if (contractFlag && findContract(contractFlag.id) && CRAFTING_PROFESSIONS[contractFlag.profession]) {
    return { profession: contractFlag.profession, ids: [`${CONTRACT_PREFIX}${contractFlag.id}`], label: `a contract: ${findContract(contractFlag.id).title}` };
  }
  const row = findRecipe(scrollRecipe(item), { includeDisabled: true });
  return row ? { profession: row.profession, ids: [learnIdOf(row)], label: `to make ${row.output}` } : null;
}

/** Why this character cannot learn from the scroll now, or null. */
export function scrollProblem(actor, item) {
  const teaches = scrollTeaches(item);
  if (!teaches) return "This recipe no longer exists";
  const profession = CRAFTING_PROFESSIONS[teaches.profession];
  if (!hasProfession(actor, teaches.profession)) return `Only a ${profession.label} can learn this`;
  if (teaches.ids.every(id => knows(actor, id))) return "Already known";
  if (teaches.ids.every(id => completedIds(actor).has(id))) return "Already completed";
  return null;
}

/** Recipe and contact scrolls a character carries for one profession (Recipes window list). */
export function carriedScrolls(actor, profession) {
  return Array.from(actor?.items ?? []).filter(item => {
    const teaches = scrollTeaches(item);
    return teaches && (!profession || teaches.profession === profession);
  }).map(item => {
    const problem = scrollProblem(actor, item);
    return { id: item.id, name: item.name, img: item.img, note: problem ?? "", disabled: Boolean(problem) };
  });
}

/** Owner: learn from a scroll in a character's inventory (the scroll is used up). */
export async function learnFromScroll(item) {
  return gp().runActorAction(item?.parent, () => learnFromScrollUnlocked(item));
}

async function learnFromScrollUnlocked(item) {
  const actor = item?.parent;
  const teaches = scrollTeaches(item);
  if (!teaches && !scrollRecipe(item) && !scrollContact(item) && !scrollContract(item)) throw new Error("This item does not teach a recipe.");
  if (!actor || actor.documentName !== "Actor") throw new Error("Put the scroll in a character's inventory first.");
  if (!(game.user.isGM || actor.isOwner)) throw new Error("Only the scroll's owner can study it.");
  if (!Array.from(actor.items ?? []).includes(item) || Number(item.system?.quantity) <= 0) throw new Error("This scroll is no longer in the character's inventory.");
  if (!teaches) throw new Error("This recipe no longer exists.");
  const problem = scrollProblem(actor, item);
  if (problem === "Already known") throw new Error(`${actor.name} already knows ${teaches.label.replace(/^to /, "how to ")}.`);
  if (problem) throw new Error(`${problem}.`);
  await learn(actor, teaches.ids, { locked: true });
  const quantity = Math.max(0, Number(item.system?.quantity) || 1);
  if (quantity > 1) await item.update({ "system.quantity": quantity - 1 });
  else await item.delete();
  ui.notifications.info(`${actor.name} learned ${teaches.label}.`);
  return teaches;
}
