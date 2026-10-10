// A character's crafting professions, XP, ranks, and known recipes.
// Actor flags (crafting-professions):
//   professions: { [key]: { xp, rank, readyNotified?, path: "standard"|"wanderer", talents: [ids], abilityUsed? } }
//   known: [recipeId, ...]
import { MODULE_ID, CRAFTING_PROFESSIONS, RANK_DIE } from "./professions.js";
import { craftingRules } from "./rules.js";
import { starterIds } from "./recipes.js";

export const actorProfessions = actor => ({ ...(actor?.getFlag?.(MODULE_ID, "professions") ?? {}) });
export const hasProfession = (actor, key) => Boolean(actorProfessions(actor)[key]);
export const xpOf = (actor, key) => Math.max(0, Number(actorProfessions(actor)[key]?.xp) || 0);
export const rankOf = (actor, key) => (hasProfession(actor, key) ? Math.min(5, Math.max(1, Number(actorProfessions(actor)[key]?.rank) || 1)) : 0);
export const dieOf = (actor, key) => (rankOf(actor, key) ? RANK_DIE[rankOf(actor, key) - 1] : null);

/** Highest rank the XP allows. */
export function rankForXp(xp, rules = craftingRules()) {
  let rank = 1;
  for (let index = 1; index < 5; index++) if (xp >= rules.rankXp[index]) rank = index + 1;
  return rank;
}

/** Next rank the character qualifies for by XP (GM-confirm mode), or null. */
export function readyForRank(actor, key, rules = craftingRules()) {
  const rank = rankOf(actor, key);
  if (!rank || rank >= 5) return null;
  return xpOf(actor, key) >= rules.rankXp[rank] ? rank + 1 : null;
}

const isPartyActor = actor => actor?.type === "character" && Boolean(actor.hasPlayerOwner);

/** Recipes this character knows (party mode: every player character's). */
export function knownIds(actor, rules = craftingRules()) {
  if (rules.knowledgeMode === "party") return new Set(Array.from(game.actors ?? []).filter(isPartyActor).flatMap(entry => entry.getFlag?.(MODULE_ID, "known") ?? []));
  return new Set(actor?.getFlag?.(MODULE_ID, "known") ?? []);
}

export const knows = (actor, id) => knownIds(actor).has(id);

/** One-time jobs this character (or, in party mode, the party) has completed. */
export function completedIds(actor, rules = craftingRules()) {
  if (rules.knowledgeMode === "party") return new Set(Array.from(game.actors ?? []).filter(isPartyActor).flatMap(entry => entry.getFlag?.(MODULE_ID, "completed") ?? []));
  return new Set(actor?.getFlag?.(MODULE_ID, "completed") ?? []);
}

/* Contacts' task limits: actor flag taskUses { [contactId]: { count, day } }. */
const dayOf = () => Math.floor((game.time?.worldTime ?? 0) / 86400);

/** Uses left of a contact's task now (Infinity when unlimited). */
export function taskUsesLeft(actor, row) {
  const limit = row?.limit ?? { per: "longRest", count: 1 };
  if (limit.per === "none") return Infinity;
  const used = actor?.getFlag?.(MODULE_ID, `taskUses.${row.contactId}`) ?? {};
  const count = limit.per === "day" && used.day !== dayOf() ? 0 : Number(used.count) || 0;
  return Math.max(0, (Number(limit.count) || 1) - count);
}

/** Count one attempt at a contact's task. */
export async function useTask(actor, row) {
  const limit = row?.limit ?? { per: "longRest", count: 1 };
  if (limit.per === "none") return;
  const used = actor.getFlag(MODULE_ID, `taskUses.${row.contactId}`) ?? {};
  const fresh = limit.per === "day" && used.day !== dayOf();
  await actor.setFlag(MODULE_ID, `taskUses.${row.contactId}`, { count: (fresh ? 0 : Number(used.count) || 0) + 1, day: dayOf(), per: limit.per });
}

/** Long rest: tasks limited per long rest are available again. */
export async function resetTaskUses(actor) {
  const uses = actor.getFlag?.(MODULE_ID, "taskUses") ?? {};
  for (const [id, entry] of Object.entries(uses)) if (entry?.per !== "day") await actor.update({ [`flags.${MODULE_ID}.taskUses.-=${id}`]: null });
}

/** Mark a one-time job done (owner or GM). */
export async function markCompleted(actor, jobId) {
  const current = actor.getFlag(MODULE_ID, "completed") ?? [];
  if (!current.includes(jobId)) await actor.setFlag(MODULE_ID, "completed", [...current, jobId]);
}

/** Teach recipe ids to a character (the owner or GM). Returns the new ids. */
export async function learn(actor, ids) {
  if (!actor || !(game.user.isGM || actor.isOwner)) throw new Error("Choose a character you own.");
  const current = actor.getFlag(MODULE_ID, "known") ?? [];
  const fresh = [...new Set(ids)].filter(id => !current.includes(id));
  if (fresh.length) await actor.setFlag(MODULE_ID, "known", [...current, ...fresh]);
  return fresh;
}

/** GM: forget a recipe (party mode: every player character forgets it). */
export async function forget(actor, id, rules = craftingRules()) {
  if (!game.user.isGM) throw new Error("Only the GM may remove recipes.");
  const targets = rules.knowledgeMode === "party" ? Array.from(game.actors ?? []).filter(isPartyActor) : [actor].filter(Boolean);
  for (const target of targets) {
    const current = target.getFlag(MODULE_ID, "known") ?? [];
    if (current.includes(id)) await target.setFlag(MODULE_ID, "known", current.filter(entry => entry !== id));
  }
}

/**
 * Take up a crafting profession (rank 1, starter recipes). Players may choose
 * one if they have none; the GM may add any.
 */
export async function chooseProfession(actor, key, { path = "standard" } = {}) {
  if (!CRAFTING_PROFESSIONS[key]) throw new Error("Choose a crafting profession.");
  if (!actor || !(game.user.isGM || actor.isOwner)) throw new Error("Choose a character you own.");
  const current = actorProfessions(actor);
  if (current[key]) throw new Error(`${actor.name} is already a ${CRAFTING_PROFESSIONS[key].label}.`);
  if (!game.user.isGM && Object.keys(current).length) throw new Error("Ask the GM for another crafting profession (it takes a story arc).");
  if (!["standard", "wanderer"].includes(path)) throw new Error("Choose the standard or the Wanderer ability.");
  const retired = actor.getFlag(MODULE_ID, "retired")?.[key];
  await actor.setFlag(MODULE_ID, "professions", { ...current, [key]: retired ? structuredClone(retired) : { xp: 0, rank: 1, path, talents: [] } });
  if (retired) await actor.unsetFlag(MODULE_ID, `retired.${key}`);
  await learn(actor, starterIds(key));
}

/** GM: remove a crafting profession (XP and known recipes are kept in case it returns). */
export async function removeProfession(actor, key) {
  if (!game.user.isGM) throw new Error("Only the GM may remove a crafting profession.");
  const current = actorProfessions(actor);
  if (!current[key]) return;
  await actor.setFlag(MODULE_ID, "retired", { ...(actor.getFlag(MODULE_ID, "retired") ?? {}), [key]: current[key] });
  delete current[key];
  await actor.unsetFlag(MODULE_ID, "professions");
  if (Object.keys(current).length) await actor.setFlag(MODULE_ID, "professions", current);
}

async function whisperGM(content) {
  const gms = Array.from(game.users ?? []).filter(user => user.isGM).map(user => user.id);
  if (gms.length) await ChatMessage.create({ content, whisper: gms });
}

/** Add crafting XP; ranks follow the rank-up mode. */
export async function addXp(actor, key, amount, rules = craftingRules()) {
  if (!amount || !hasProfession(actor, key)) return;
  const entry = { ...actorProfessions(actor)[key] };
  entry.xp = xpOf(actor, key) + amount;
  const label = CRAFTING_PROFESSIONS[key].label;
  if (rules.rankUpMode === "auto") {
    const next = rankForXp(entry.xp, rules);
    if (next > (entry.rank ?? 1)) {
      entry.rank = next;
      ui.notifications.info(`${actor.name} reached ${label} rank ${next}: ${CRAFTING_PROFESSIONS[key].ranks[next - 1].title}!`);
    }
  }
  await actor.setFlag(MODULE_ID, `professions.${key}`, entry);
  const ready = rules.rankUpMode === "gm" ? readyForRank(actor, key, rules) : null;
  if (ready && entry.readyNotified !== ready) {
    await actor.setFlag(MODULE_ID, `professions.${key}.readyNotified`, ready);
    const goal = CRAFTING_PROFESSIONS[key].ranks[ready - 2]?.goal ?? "";
    await whisperGM(`<p><strong>${foundry.utils.escapeHTML?.(actor.name) ?? actor.name}</strong> has the XP for <strong>${label} rank ${ready}</strong>${goal ? `. Story goal: <em>${goal}</em>` : ""}. Promote them in their Professions menu when it is met.</p>`);
  }
}

/** GM: set a rank directly (promote or demote). */
export async function setRank(actor, key, rank) {
  if (!game.user.isGM) throw new Error("Only the GM may change crafting ranks.");
  const value = Number(rank);
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error("Rank must be 1 to 5.");
  if (!hasProfession(actor, key)) throw new Error(`${actor.name} is not a ${CRAFTING_PROFESSIONS[key]?.label ?? key}.`);
  await actor.setFlag(MODULE_ID, `professions.${key}.rank`, value);
}

/** GM: set XP directly. */
export async function setXp(actor, key, xp) {
  if (!game.user.isGM) throw new Error("Only the GM may change crafting XP.");
  const value = Number(xp);
  if (!Number.isInteger(value) || value < 0) throw new Error("XP must be a whole number of 0 or more.");
  if (!hasProfession(actor, key)) return;
  await actor.setFlag(MODULE_ID, `professions.${key}.xp`, value);
}

/* ---------------------------------------------------------------------- */
/* Ability path and talents                                                */
/* ---------------------------------------------------------------------- */

export const pathOf = (actor, key) => (actorProfessions(actor)[key]?.path === "wanderer" ? "wanderer" : "standard");
export const talentsOf = (actor, key) => [...(actorProfessions(actor)[key]?.talents ?? [])];
/** One talent at selection, one more at each rank. */
export const talentSlots = (actor, key) => Math.max(0, rankOf(actor, key) - talentsOf(actor, key).length);

/** GM: switch between the standard and Wanderer ability. */
export async function setPath(actor, key, path) {
  if (!game.user.isGM) throw new Error("Only the GM may change the ability.");
  if (!["standard", "wanderer"].includes(path)) throw new Error("Choose the standard or the Wanderer ability.");
  if (!hasProfession(actor, key)) return;
  await actor.setFlag(MODULE_ID, `professions.${key}.path`, path);
}

/** Pick a talent (owner, while a slot is free; the GM anytime). */
export async function chooseTalent(actor, key, talentId) {
  if (!actor || !(game.user.isGM || actor.isOwner)) throw new Error("Choose a character you own.");
  const entry = CRAFTING_PROFESSIONS[key]?.talents?.find(row => row.id === talentId);
  if (!entry) throw new Error("Choose a talent.");
  const current = talentsOf(actor, key);
  if (current.includes(talentId)) throw new Error(`${actor.name} already has ${entry.name}.`);
  if (!game.user.isGM && talentSlots(actor, key) < 1) throw new Error("No talent to choose yet: you gain one at each rank.");
  await actor.setFlag(MODULE_ID, `professions.${key}.talents`, [...current, talentId]);
}

/** GM: remove a talent (frees its slot). */
export async function removeTalent(actor, key, talentId) {
  if (!game.user.isGM) throw new Error("Only the GM may remove talents.");
  await actor.setFlag(MODULE_ID, `professions.${key}.talents`, talentsOf(actor, key).filter(id => id !== talentId));
}
