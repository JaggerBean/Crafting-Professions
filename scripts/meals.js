// Meals: cooked dishes carry an effect (flags.crafting-professions.meal) that
// applies when a character eats one from their inventory. Only one meal effect
// at a time: a new meal replaces the old one. Exquisite meals (Masterful
// cooking) double the effect and the value. The GM edits the effect table in
// the hub (world setting "mealEffects" = { list }, else the defaults).
import { MODULE_ID } from "./professions.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// Effect kinds: tempHp { amount }, heal { formula }, advantage { ability, minutes },
// speed { amount, minutes }, exhaustion { amount }. travel: flavour (never spoils).
export const DEFAULT_MEALS = Object.freeze({
  "Tea": { kind: "advantage", ability: "wis", minutes: 60 },
  "Nettle Soup": { kind: "tempHp", amount: 3 },
  "Jerky": { kind: "tempHp", amount: 2, travel: true },
  "Bone Broth": { kind: "heal", formula: "1d4" },
  "Green Salad": { kind: "advantage", ability: "con", minutes: 60 },
  "Meat Of The Hunt": { kind: "tempHp", amount: 5 },
  "Skewers": { kind: "speed", amount: 5, minutes: 60 },
  "Acorn Bread": { kind: "tempHp", amount: 2, travel: true },
  "Vegetable Soup": { kind: "tempHp", amount: 3 }
});

export const MEAL_KINDS = Object.freeze({ tempHp: "Temporary hit points", heal: "Heal", advantage: "Advantage on a save", speed: "Speed bonus", exhaustion: "Remove exhaustion" });
export const ABILITY = Object.freeze({ str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" });
// Fields each kind uses (the editor shows only these).
export const KIND_FIELDS = Object.freeze({ tempHp: ["amount"], heal: ["formula"], advantage: ["ability", "minutes"], speed: ["amount", "minutes"], exhaustion: ["amount"] });
const AMOUNT_RANGE = { tempHp: [1, 999], speed: [5, 120], exhaustion: [1, 6] };
const MAX_MINUTES = 10080;

function setting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key) ?? fallback; } catch { return fallback; }
}

const validFormula = formula => {
  if (!/^[\d\sd+\-*/()]+$/i.test(formula) || !/\d/.test(formula)) return false;
  try { return globalThis.Roll?.validate ? Roll.validate(formula) : true; } catch { return false; }
};

/**
 * Validate one effect row ({ dish, kind, amount, formula, ability, minutes, travel }).
 * Returns { dish, ...meal } or throws with a message naming the dish.
 */
export function normalizeMeal(entry) {
  const dish = String(entry?.dish ?? "").trim();
  if (!dish) return null;
  const kind = String(entry?.kind ?? "");
  if (!MEAL_KINDS[kind]) throw new Error(`${dish}: choose an effect.`);
  const meal = { kind };
  const whole = (field, min, max, label) => {
    const value = Number(entry?.[field]);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${dish}: ${label} must be a whole number from ${min} to ${max}.`);
    return value;
  };
  if (KIND_FIELDS[kind].includes("amount")) meal.amount = whole("amount", ...AMOUNT_RANGE[kind], kind === "speed" ? "speed (ft)" : kind === "exhaustion" ? "exhaustion levels" : "temporary hit points");
  if (kind === "heal") {
    const formula = String(entry?.formula ?? "").trim();
    if (!validFormula(formula)) throw new Error(`${dish}: healing must be a dice formula such as 1d4 or 2d4+2.`);
    meal.formula = formula;
  }
  if (kind === "advantage") {
    if (!ABILITY[entry?.ability]) throw new Error(`${dish}: choose an ability for the saving throw.`);
    meal.ability = entry.ability;
  }
  if (KIND_FIELDS[kind].includes("minutes")) meal.minutes = whole("minutes", 1, MAX_MINUTES, "duration (minutes)");
  if (entry?.travel === true || entry?.travel === "true" || entry?.travel === "on") meal.travel = true;
  return { dish, ...meal };
}

const defaultList = () => Object.entries(DEFAULT_MEALS).map(([dish, meal]) => ({ dish, ...meal }));

/** The world's meal effect rows (GM-edited), else the defaults. Invalid saved rows are skipped. */
export function mealList() {
  const saved = setting("mealEffects", null);
  if (!Array.isArray(saved?.list)) return defaultList();
  return saved.list.map(entry => { try { return normalizeMeal(entry); } catch { return null; } }).filter(Boolean);
}

/** The effect of a dish by name (null = the dish has no meal effect). */
export function mealFor(name) {
  const row = mealList().find(entry => entry.dish === name);
  if (!row) return null;
  const { dish: _dish, ...meal } = row;
  return meal;
}

/** Live view of the effect table: { dish: meal }. */
export const MEALS = new Proxy({}, {
  get: (_target, name) => typeof name === "string" ? mealFor(name) ?? undefined : undefined,
  has: (_target, name) => Boolean(mealFor(name)),
  ownKeys: () => mealList().map(entry => entry.dish),
  getOwnPropertyDescriptor: (_target, name) => { const meal = mealFor(name); return meal ? { value: meal, enumerable: true, configurable: true } : undefined; }
});

/** GM: save the effect table. */
export async function saveMeals(list) {
  if (!game.user.isGM) throw new Error("Only the GM may edit meal effects.");
  const meals = list.map(normalizeMeal).filter(Boolean);
  if (new Set(meals.map(entry => entry.dish)).size !== meals.length) throw new Error("Each dish may have only one effect.");
  await game.settings.set(MODULE_ID, "mealEffects", { list: meals });
  return meals;
}

/** GM: back to the default effects. */
export async function resetMeals() {
  if (!game.user.isGM) throw new Error("Only the GM may edit meal effects.");
  await game.settings.set(MODULE_ID, "mealEffects", null);
  return defaultList();
}

/** Plain-language description of a meal effect. */
export function describeMeal(meal) {
  if (!meal) return "";
  const time = minutes => (minutes >= 60 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minutes`);
  const text = {
    tempHp: () => `${meal.amount} temporary hit points`,
    heal: () => `regain ${meal.formula} hit points`,
    advantage: () => `advantage on the next ${ABILITY[meal.ability] ?? meal.ability} saving throw within ${time(meal.minutes)}`,
    speed: () => `+${meal.amount} ft speed for ${time(meal.minutes)}`,
    exhaustion: () => `remove ${meal.amount} level${meal.amount === 1 ? "" : "s"} of exhaustion`
  }[meal.kind]?.() ?? "";
  return `${text}${meal.travel ? " (travel food: keeps)" : ""}`;
}

/** Double a meal's effect (Exquisite). */
export function exquisiteMeal(meal) {
  const next = { ...meal, exquisite: true };
  if (next.amount) next.amount *= 2;
  if (next.minutes) next.minutes *= 2;
  if (next.formula) next.formula = `2 * (${next.formula})`.replace(/^2 \* \((\d+)d(\d+)\)$/, "$1d$2 * 2");
  return next;
}

/**
 * Stamp a cooked product's item data (in place): the meal effect, its text,
 * and no activities (eating is handled by this module).
 */
export function stampMeal(data, mealName, { exquisite = false, valueFactor = 2 } = {}) {
  let meal = mealFor(mealName);
  if (!meal) return data;
  if (exquisite) {
    meal = exquisiteMeal(meal);
    const pricing = foundry.utils.getProperty(data, "flags.gathering-professions.campaignPrice") ?? {};
    foundry.utils.setProperty(data, "flags.gathering-professions.campaignPrice", {
      ...pricing, baseName: mealName, valueMultiplier: (Number(pricing.valueMultiplier) || 1) * valueFactor
    });
    data.name = `Exquisite ${data.name}`;
    const price = Number(foundry.utils.getProperty(data, "system.price.value"));
    if (Number.isFinite(price)) foundry.utils.setProperty(data, "system.price.value", Math.round(price * valueFactor * 100) / 100);
  }
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.meal`, { ...meal, dish: mealName });
  if (data.system?.activities) data.system.activities = {};
  const description = foundry.utils.getProperty(data, "system.description.value") ?? "";
  foundry.utils.setProperty(data, "system.description.value", mealText(meal) + stripMealText(description));
  return data;
}

const mealText = meal => `<p class="cp-meal-text"><strong>When eaten:</strong> ${escape(describeMeal(meal))}.${meal.exquisite ? " <em>Exquisite: twice the usual effect.</em>" : ""} <em>Click it in your inventory to eat one.</em></p>`;
const stripMealText = html => String(html ?? "").replace(/^<p(?: class="cp-meal-text")?><strong>When eaten:<\/strong>.*?<\/p>/s, "");

/**
 * GM: give dishes already cooked (in every actor's inventory and the Items
 * sidebar) the current effects. Exquisite dishes stay Exquisite; dishes whose
 * effect was removed keep their old one. Returns the number updated.
 */
export async function refreshCookedMeals() {
  if (!game.user.isGM) throw new Error("Only the GM may update cooked dishes.");
  const owners = [...Array.from(game.actors ?? []).map(actor => actor.items), game.items];
  let updated = 0;
  for (const collection of owners) {
    for (const item of Array.from(collection ?? [])) {
      const old = mealOf(item);
      const base = old?.dish ? mealFor(old.dish) : null;
      if (!base) continue;
      const meal = { ...(old.exquisite ? exquisiteMeal(base) : base), dish: old.dish };
      const same = JSON.stringify({ ...meal }) === JSON.stringify({ ...old });
      if (same) continue;
      await item.update({ [`flags.${MODULE_ID}.-=meal`]: null });
      await item.update({ [`flags.${MODULE_ID}.meal`]: meal, "system.description.value": mealText(meal) + stripMealText(item.system?.description?.value) });
      updated++;
    }
  }
  return updated;
}

export const mealOf = item => item?.getFlag?.(MODULE_ID, "meal") ?? item?.flags?.[MODULE_ID]?.meal ?? null;

/** Active Effect data for timed meal effects (advantage, speed). */
export function mealEffectData(meal, sourceName) {
  const changes = meal.kind === "advantage" ? [{ key: `system.abilities.${meal.ability}.save.roll.mode`, mode: 2, value: "1" }]
    : meal.kind === "speed" ? [{ key: "system.attributes.movement.bonus", mode: 2, value: String(meal.amount) }] : [];
  return { name: `Meal: ${sourceName}`, img: "icons/consumables/food/bowl-stew-brown.webp", changes,
    duration: { seconds: (meal.minutes ?? 60) * 60 }, description: describeMeal(meal),
    flags: { [MODULE_ID]: { meal: true, ...(meal.kind === "advantage" ? { mealSave: meal.ability } : {}) } } };
}

/** Eat one serving: apply the effect to its owner (replacing any earlier meal effect). */
export function eatMeal(item) {
  return game.modules.get("gathering-professions").api.recipes.runActorAction(item?.parent, () => eatMealUnlocked(item));
}

async function eatMealUnlocked(item) {
  const actor = item?.parent;
  const live = actor?.items?.get?.(item?.id) ?? Array.from(actor?.items ?? []).find(entry => entry.id === item?.id);
  if (live !== item) throw new Error("That meal is no longer in this inventory. Reopen the inventory and try again.");
  const meal = mealOf(item);
  if (!meal) throw new Error("That isn't a meal.");
  if (!actor || actor.documentName !== "Actor") throw new Error("Put the meal in a character's inventory first.");
  if (!(game.user.isGM || actor.isOwner)) throw new Error("Only its owner can eat it.");
  const quantity = Number(item.system?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("That meal has no available servings.");
  if (!MEAL_KINDS[meal.kind]) throw new Error("That meal has no valid effect.");
  const old = Array.from(actor.effects ?? []).filter(effect => effect.getFlag?.(MODULE_ID, "meal"));
  const snapshots = old.map(effect => effect.toObject());
  const update = {};
  const restore = {};
  const change = (path, before, after) => { update[path] = after; restore[path] = before; };
  let result = describeMeal(meal);
  if (meal.kind === "tempHp") {
    const current = Number(actor.system?.attributes?.hp?.temp) || 0;
    change("system.attributes.hp.temp", current, Math.max(current, meal.amount));
  } else if (meal.kind === "heal") {
    const roll = await new Roll(meal.formula).evaluate();
    const hp = actor.system?.attributes?.hp ?? {};
    const value = Math.min(Number(hp.max) || Infinity, (Number(hp.value) || 0) + roll.total);
    change("system.attributes.hp.value", Number(hp.value) || 0, value);
    result = `regains ${roll.total} hit points`;
  } else if (meal.kind === "exhaustion") {
    const current = Number(actor.system?.attributes?.exhaustion) || 0;
    change("system.attributes.exhaustion", current, Math.max(0, current - meal.amount));
  }
  // Reserve even the last serving before granting benefits. Keep the document
  // until the benefit succeeds, so a failed operation can restore the serving.
  await item.update({ "system.quantity": quantity - 1 });
  const priorIds = new Set(Array.from(actor.effects ?? []).map(effect => effect.id));
  try {
    if (Object.keys(update).length) await actor.update(update);
    else await actor.createEmbeddedDocuments("ActiveEffect", [mealEffectData(meal, item.name)]);
    if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old.map(effect => effect.id));
  } catch (error) {
    try {
      const added = Array.from(actor.effects ?? []).filter(effect => !priorIds.has(effect.id) && effect.getFlag?.(MODULE_ID, "meal"));
      if (added.length) await actor.deleteEmbeddedDocuments("ActiveEffect", added.map(effect => effect.id));
      if (Object.keys(restore).length) await actor.update(restore);
      const missing = snapshots.filter((_, index) => !Array.from(actor.effects ?? []).some(effect => effect.id === old[index].id));
      if (missing.length) await actor.createEmbeddedDocuments("ActiveEffect", missing, { keepId: true });
      await item.update({ "system.quantity": quantity });
    } catch (recoveryError) {
      console.error(`${MODULE_ID}: meal recovery failed`, recoveryError);
      throw new Error("Meal failed and recovery was incomplete. The serving remains reserved; ask the GM to reconcile it before retrying.");
    }
    throw error;
  }
  // Cleanup and chat failures must never refund an already granted benefit.
  if (quantity === 1) await item.delete().catch(error => console.error(`${MODULE_ID}: could not remove empty meal`, error));
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${escape(actor.name)}</strong> eats ${escape(item.name)}: ${escape(result)}.</p>` })
    .catch(error => console.error(`${MODULE_ID}: could not post meal`, error));
  return result;
}

// dnd5e 6.0.6 passes config to preRollSavingThrowV2, constructed rolls to
// postSavingThrowRollConfiguration, and (rolls, { subject, ability }) after success.
// Bind effect identities to this roll so an intervening meal is never removed.
const pendingSaves = new WeakMap();
const mealSaves = new WeakMap();
const saveAbility = effect => effect.getFlag?.(MODULE_ID, "mealSave")
  ?? effect.changes?.find(change => /^system\.abilities\.(str|dex|con|int|wis|cha)\.save\.roll\.mode$/.test(change.key))?.key.split(".")[2];

Hooks.on("dnd5e.preRollSavingThrowV2", config => {
  const actor = config.subject;
  if (!actor || !(game.user.isGM || actor.isOwner)) return;
  const effects = Array.from(actor.effects ?? []).filter(effect => effect.getFlag?.(MODULE_ID, "meal")
    && !effect.disabled && !effect.isSuppressed && effect.duration?.remaining !== 0
    && !(effect.duration?.remaining < 0) && saveAbility(effect) === config.ability);
  pendingSaves.set(config, effects);
});
Hooks.on("dnd5e.postSavingThrowRollConfiguration", (rolls, config) => {
  for (const roll of rolls ?? []) mealSaves.set(roll, pendingSaves.get(config) ?? []);
});
Hooks.on("dnd5e.rollSavingThrow", (rolls, { subject, ability }) => {
  const effects = [...new Set((rolls ?? []).filter(roll => roll._evaluated).flatMap(roll => mealSaves.get(roll) ?? []))];
  const ids = effects.filter(effect => saveAbility(effect) === ability && Array.from(subject.effects ?? []).includes(effect)).map(effect => effect.id);
  if (ids.length && (game.user.isGM || subject.isOwner)) {
    void subject.deleteEmbeddedDocuments("ActiveEffect", ids).catch(error => console.error(`${MODULE_ID}: could not expire meal save`, error));
  }
  for (const roll of rolls ?? []) mealSaves.delete(roll);
});
