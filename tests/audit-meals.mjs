import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scope = "crafting-professions";
const getProperty = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const setProperty = (object, path, value) => {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((value, key) => value[key] ??= {}, object)[last] = value;
};
const hooks = new Map();
globalThis.Hooks = { on: (name, callback) => hooks.set(name, callback) };
globalThis.foundry = { utils: { getProperty, setProperty } };
let messages = 0;
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async () => { messages++; } };
globalThis.Roll = class {
  static validate() { return true; }
  constructor(formula) { this.formula = formula; }
  async evaluate() { this.total = 4; return this; }
};
// Same actor serialization contract as Gathering Professions, without remote timers.
const queues = new Map();
const runActorAction = (actor, task) => {
  const next = (queues.get(actor) ?? Promise.resolve()).catch(() => {}).then(task);
  queues.set(actor, next);
  return next;
};
let rolls = 0;
globalThis.game = {
  user: { isGM: true }, actors: [], settings: { get: () => undefined },
  modules: new Map([["gathering-professions", { api: { recipes: {
    runActorAction, rollProfessionCheck: async () => { rolls++; return { total: 20, toMessage: async () => {} }; }
  } } }]])
};
let id = 0;
class Effect {
  constructor(data) { Object.assign(this, structuredClone(data)); this.id = data._id ?? `e${++id}`; }
  getFlag(module, key) { return getProperty(this.flags?.[module], key); }
  toObject() { return { ...structuredClone(this), _id: this.id }; }
}
function actor() {
  return {
    documentName: "Actor", name: "Cook", isOwner: true, type: "character", hasPlayerOwner: true,
    flags: { [scope]: { professions: { cook: { rank: 1, path: "standard", talents: [] } } } },
    items: [], effects: [], system: { attributes: { hp: { value: 5, max: 20, temp: 0 }, exhaustion: 2 } },
    getFlag(module, key) { return getProperty(this.flags[module], key); },
    async setFlag(module, key, value) { setProperty(this.flags[module], key, value); },
    async update(changes) {
      if (this.failUpdate) { this.failUpdate = false; throw new Error("benefit failed"); }
      for (const [key, value] of Object.entries(changes)) setProperty(this, key, value);
    },
    async createEmbeddedDocuments(type, data) {
      assert.equal(type, "ActiveEffect");
      if (this.failCreate) { this.failCreate = false; throw new Error("create failed"); }
      const result = data.map(row => new Effect(row)); this.effects.push(...result); return result;
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "ActiveEffect");
      this.effects = this.effects.filter(effect => !ids.includes(effect.id));
      if (this.failDeleteEffects) { this.failDeleteEffects = false; throw new Error("delete failed"); }
    }
  };
}
function item(owner, meal, quantity = 1) {
  const doc = {
    id: `i${++id}`, parent: owner, name: "Meal", flags: { [scope]: { meal } }, system: { quantity },
    getFlag(module, key) { return this.flags[module]?.[key]; },
    async update(changes) {
      if (this.failConsume) { this.failConsume = false; throw new Error("consume failed"); }
      for (const [key, value] of Object.entries(changes)) setProperty(this, key, value);
    },
    async delete() {
      if (this.failDelete) throw new Error("cleanup failed");
      owner.items = owner.items.filter(entry => entry !== this);
    }
  };
  owner.items.push(doc); return doc;
}
const meals = await import("../scripts/meals.js");
const abilities = await import("../scripts/abilities.js");
const heal = { kind: "heal", formula: "1d4" };
const speed = { kind: "speed", amount: 5, minutes: 60 };
const advantage = { kind: "advantage", ability: "wis", minutes: 60 };

// Check hook signatures against the installed source, not a remembered API.
const source = await readFile(new URL("../../../systems/dnd5e/dnd5e.mjs", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../../../systems/dnd5e/system.json", import.meta.url), "utf8"));
assert.equal(manifest.version, "6.0.6");
assert.ok(source.includes('Hooks.callAll(`dnd5e.roll${name}`, rolls, { ability: config.ability, subject: this })'));
assert.ok(source.includes('Hooks.call(name, rolls, config, dialog, message)'));
assert.ok(source.includes('Hooks.call(`dnd5e.preRoll${hookName.capitalize()}V2`, config, dialog, message)'));

for (const quantity of [0, -1, NaN, undefined, 0.5]) {
  const owner = actor(); const meal = item(owner, heal); meal.system.quantity = quantity;
  await assert.rejects(meals.eatMeal(meal), /no available servings/);
  assert.equal(owner.system.attributes.hp.value, 5);
}
{
  const owner = actor(); const meal = item(owner, heal); owner.items = [];
  await assert.rejects(meals.eatMeal(meal), /no longer/);
  const replacement = item(owner, heal); replacement.id = meal.id;
  await assert.rejects(meals.eatMeal(meal), /no longer/);
}
{
  const owner = actor(); const meal = item(owner, heal);
  const results = await Promise.allSettled([meals.eatMeal(meal), meals.eatMeal(meal)]);
  assert.deepEqual(results.map(result => result.status), ["fulfilled", "rejected"]);
  assert.equal(owner.system.attributes.hp.value, 9);
}
{
  const owner = actor(); const a = item(owner, advantage); const b = item(owner, speed);
  await Promise.all([meals.eatMeal(a), meals.eatMeal(b)]);
  assert.equal(owner.effects.length, 1); assert.equal(owner.effects[0].changes[0].key, "system.attributes.movement.bonus");
}
for (const failure of ["consume", "benefit", "create", "replace"]) {
  const owner = actor(); const old = new Effect(meals.mealEffectData(advantage, "Tea")); owner.effects.push(old);
  const meal = item(owner, failure === "create" ? speed : heal);
  if (failure === "consume") meal.failConsume = true;
  if (failure === "benefit") owner.failUpdate = true;
  if (failure === "create") owner.failCreate = true;
  if (failure === "replace") owner.failDeleteEffects = true;
  await assert.rejects(meals.eatMeal(meal), /failed/);
  assert.equal(meal.system.quantity, 1); assert.equal(owner.system.attributes.hp.value, 5);
  assert.equal(owner.effects.length, 1); assert.equal(owner.effects[0].id, old.id);
}
{
  const owner = actor(); const meal = item(owner, heal); meal.failDelete = true;
  const error = console.error; console.error = () => {};
  try { await meals.eatMeal(meal); } finally { console.error = error; }
  assert.equal(meal.system.quantity, 0);
  await assert.rejects(meals.eatMeal(meal), /no available servings/);
  assert.equal(owner.system.attributes.hp.value, 9);
}
function prepareSave(owner, ability, rolls = [{}]) {
  const config = { subject: owner, ability };
  hooks.get("dnd5e.preRollSavingThrowV2")(config);
  hooks.get("dnd5e.postSavingThrowRollConfiguration")(rolls, config);
  return rolls;
}
function finishSave(owner, ability, rolls) {
  hooks.get("dnd5e.rollSavingThrow")(rolls, { subject: owner, ability });
}
{
  const owner = actor(); await meals.eatMeal(item(owner, advantage));
  finishSave(owner, "con", prepareSave(owner, "con")); assert.equal(owner.effects.length, 1);
  prepareSave(owner, "wis", []); assert.equal(owner.effects.length, 1, "cancelled roll keeps benefit");
  const roll = prepareSave(owner, "wis"); finishSave(owner, "wis", roll);
  assert.equal(owner.effects.length, 0);
  finishSave(owner, "wis", roll); assert.equal(owner.effects.length, 0, "repeat hook harmless");
}
{
  const owner = actor(); await meals.eatMeal(item(owner, advantage));
  const roll = prepareSave(owner, "wis");
  await meals.eatMeal(item(owner, advantage)); finishSave(owner, "wis", roll);
  assert.equal(owner.effects.length, 1, "old roll never removes a replacement meal");
  owner.effects[0].disabled = true; finishSave(owner, "wis", prepareSave(owner, "wis"));
  assert.equal(owner.effects.length, 1, "disabled effects were not used");
}
{
  const owner = actor(); const other = actor(); other.isOwner = false;
  game.user.isGM = false;
  const before = rolls;
  await assert.rejects(abilities.useAbility(owner, "cook", { items: [owner, other] }), /only characters you own/);
  assert.equal(rolls, before); assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), undefined);
  await assert.rejects(abilities.applyMealAbility({ effect: "emptyPot", maxItems: 6 }, [owner, other]), /only characters you own/);
  assert.equal(owner.system.attributes.exhaustion, 2);
  game.user.isGM = true;
  await abilities.useAbility(owner, "cook", { items: [owner, other] });
  assert.equal(owner.effects.length, 1); assert.equal(other.effects.length, 1, "GM can feed party");
}
for (const name of ["SavingThrow", "deathSave", "concentration", "attack", "d20Test"]) {
  abilities.injectTalents({ config: { subject: actor(), ability: "wis", hookNames: [name] } }, {
    querySelector() { throw new Error("save/other roll received talents"); }
  });
}
{
  const data = { name: "Tea", system: { price: { value: 1 } }, flags: {
    "gathering-professions": { campaignPrice: { valueMultiplier: 1.5, source: "approved", approvedValue: 3 } }
  } };
  meals.stampMeal(data, "Tea", { exquisite: true, valueFactor: 3 });
  assert.deepEqual(data.flags["gathering-professions"].campaignPrice,
    { valueMultiplier: 4.5, source: "approved", approvedValue: 3, baseName: "Tea" });
}
assert.ok(messages > 0);
console.log("audit-meals: serving races, rollback, matching save expiry, permissions, talent gates, pricing metadata passed");
