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
globalThis.foundry = { utils: { getProperty, setProperty, randomID: () => `request${++id}` } };
let messages = 0;
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async () => { messages++; } };
globalThis.Roll = class {
  static validate() { return true; }
  constructor(formula) { this.formula = formula; }
  async evaluate() { this.total = 4; return this; }
};
// Same actor serialization contract as Gathering Professions, without remote timers.
const queues = new Map();
const lockEntries = [];
const runActorAction = (actor, task) => {
  const next = (queues.get(actor) ?? Promise.resolve()).catch(() => {}).then(async () => {
    lockEntries.push(actor.id);
    return task();
  });
  queues.set(actor, next);
  return next;
};
let rolls = 0;
globalThis.game = {
  user: { id: "gm", isGM: true }, users: [], actors: [], settings: { get: () => undefined },
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
  const doc = {
    id: `actor${++id}`, owners: ["player"],
    documentName: "Actor", name: "Cook", isOwner: true, type: "character", hasPlayerOwner: true,
    flags: { [scope]: { professions: { cook: { rank: 1, path: "standard", talents: [] } } } },
    items: [], effects: [], system: { attributes: { hp: { value: 5, max: 20, temp: 0 }, exhaustion: 2 } },
    getFlag(module, key) { return getProperty(this.flags[module], key); },
    testUserPermission(user, level) { assert.equal(level, "OWNER"); return user.isGM || this.owners.includes(user.id); },
    async setFlag(module, key, value) { setProperty(this.flags[module], key, value); },
    async unsetFlag(module, key) {
      const keys = key.split("."); const last = keys.pop();
      const parent = keys.reduce((value, part) => value?.[part], this.flags[module]);
      if (parent) delete parent[last];
    },
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
  game.actors.push(doc);
  return doc;
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
function prepareSave(owner, ability, rolls = [{ _evaluated: true }]) {
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
  finishSave(owner, "wis", prepareSave(owner, "wis", [{ _evaluated: false }]));
  assert.equal(owner.effects.length, 1, "unevaluated roll keeps benefit");
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
  owner.effects[0].disabled = false; owner.effects[0].duration.remaining = -1;
  finishSave(owner, "wis", prepareSave(owner, "wis"));
  assert.equal(owner.effects.length, 1, "expired effects were not used");
}
{
  const owner = actor(); const legacy = new Effect(meals.mealEffectData(advantage, "Tea"));
  delete legacy.flags[scope].mealSave; owner.effects.push(legacy);
  finishSave(owner, "wis", prepareSave(owner, "wis"));
  assert.equal(owner.effects.length, 0, "legacy meal flags expire on matching save");
}
{
  const owner = actor(); const meal = item(owner, heal);
  const error = console.error; console.error = () => {};
  const create = ChatMessage.create; ChatMessage.create = async () => { throw new Error("chat failed"); };
  try { await meals.eatMeal(meal); } finally { ChatMessage.create = create; console.error = error; }
  assert.equal(owner.system.attributes.hp.value, 9);
  await assert.rejects(meals.eatMeal(meal), /no longer/);
}
{
  const owner = actor(); const meal = item(owner, speed);
  owner.failCreate = true;
  owner.update = async () => { throw new Error("recovery failed"); };
  // Recovery of timed benefits does not need an Actor update; force refund failure.
  const update = meal.update;
  meal.update = async changes => {
    if (changes["system.quantity"] === 1) throw new Error("refund failed");
    return update.call(meal, changes);
  };
  const error = console.error; console.error = () => {};
  try { await assert.rejects(meals.eatMeal(meal), /recovery was incomplete/); } finally { console.error = error; }
  assert.equal(meal.system.quantity, 0); assert.equal(owner.effects.length, 0);
}
{
  const owner = actor(); const other = actor(); other.isOwner = false;
  game.user.isGM = false;
  const before = rolls;
  await assert.rejects(abilities.useAbility(owner, "cook", { items: [owner, other] }), /active GM is required/);
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
  const owner = actor();
  owner.flags[scope].professions = { blacksmith: { rank: 1, talents: ["hearty-stomach"] } };
  let inputs = 0;
  const element = { querySelector() { inputs++; return null; } };
  abilities.injectTalents({ config: { subject: owner, ability: "con", hookNames: ["AbilityCheck", "d20Test"] } }, element);
  assert.equal(inputs, 1, "plain checks still offer fitting talents");
  abilities.injectTalents({ config: { subject: owner, ability: "con", hookNames: ["AbilityCheck", "SavingThrow"] } }, element);
  assert.equal(inputs, 1, "save hooks veto check talents");
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

// Two-client transport double: only the GM handles authenticated actor updates.
// Private User receipts survive actor-flag tampering and a change of active GM.
const makeUser = (id, isGM) => ({
  id, isGM, active: true, flags: {},
  getFlag(module, key) { return getProperty(this.flags[module], key); },
  async setFlag(module, key, value) {
    assert.equal(game.user.id, this.id, "only authority writes its private receipts");
    assert.ok(game.user.isGM);
    this.flags[module] ??= {}; setProperty(this.flags[module], key, structuredClone(value));
  }
});
const gm = makeUser("gm", true);
const player = makeUser("player", false);
const intruder = makeUser("intruder", false);
game.users = [gm, player, intruder]; game.users.activeGM = gm;
game.user = gm;
abilities.registerAbilityHooks();
const updateHook = hooks.get("updateActor");
abilities.registerAbilityHooks(); assert.equal(hooks.get("updateActor"), updateHook, "registration idempotent");

function guardedActor() {
  const doc = actor();
  const update = doc.update; const create = doc.createEmbeddedDocuments; const remove = doc.deleteEmbeddedDocuments;
  doc.update = async changes => { assert.ok(game.user.isGM || doc.isOwner, "no cross-owner player writes"); return update.call(doc, changes); };
  doc.createEmbeddedDocuments = async (...args) => { assert.ok(game.user.isGM || doc.isOwner, "no cross-owner player effects"); return create.apply(doc, args); };
  doc.deleteEmbeddedDocuments = async (...args) => { assert.ok(game.user.isGM || doc.isOwner); return remove.apply(doc, args); };
  return doc;
}
function connectTransport(doc) {
  const setFlag = doc.setFlag;
  doc.setFlag = async (module, key, value) => {
    await setFlag.call(doc, module, key, structuredClone(value));
    if (module !== scope || key !== "mealAbilityRequest" || game.user.isGM) return;
    const sender = game.user;
    game.user = game.users.activeGM;
    try {
      updateHook(doc, { [`flags.${scope}.mealAbilityRequest`]: value }, {}, sender.id);
      // All diner locks may precede the cook's lock. Wait for the hook's
      // receipt, not whichever actor queue happened to exist on entry.
      for (let tick = 0; tick < 100 && !doc.getFlag(scope, `mealAbilityResponses.${value.requestId}`); tick++) {
        await new Promise(resolve => setImmediate(resolve));
      }
      assert.ok(doc.getFlag(scope, `mealAbilityResponses.${value.requestId}`), "GM hook produced its receipt");
    } finally { game.user = sender; }
  };
}
const request = (owner, diners, requestId) => ({ requestId, key: "cook", path: owner.getFlag(scope, "professions.cook.path"), diners: diners.map(doc => doc.id) });
{
  const owner = guardedActor(); const other = guardedActor(); other.isOwner = false; other.owners = ["otherplayer"];
  connectTransport(owner); game.user = player;
  const before = rolls;
  const result = await abilities.useAbility(owner, "cook", { items: [owner, other] });
  assert.equal(result.success, true); assert.equal(rolls, before + 1);
  assert.equal(owner.effects.length, 1); assert.equal(other.effects.length, 1, "normal player feeds a cross-owner party");
  assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), true);
  const sent = owner.getFlag(scope, "mealAbilityRequest");
  game.user = gm;
  await abilities.handleMealAbilityRequest(owner, sent, player);
  assert.equal(rolls, before + 1, "replay cannot reroll");
  owner.flags[scope].mealAbilityResponses = {};
  owner.flags[scope].professions.cook.abilityUsed = false;
  const replay = await abilities.handleMealAbilityRequest(owner, { ...sent, diners: [owner.id], effect: "emptyPot", dc: -100 }, player);
  assert.equal(replay.success, true); assert.equal(rolls, before + 1, "actor flag tampering and rest never reuse ID");
  const gm2 = makeUser("gm2", true); game.users.push(gm2); game.users.activeGM = gm2; game.user = gm2;
  await abilities.handleMealAbilityRequest(owner, sent, player);
  assert.equal(rolls, before + 1, "new active GM reads earlier authority receipts");
  game.users.activeGM = gm; game.user = gm;
}
{
  const owner = guardedActor(); const other = guardedActor(); other.isOwner = false;
  const before = rolls;
  const data = request(owner, [other], "unauthorized");
  assert.equal(await abilities.handleMealAbilityRequest(owner, { ...data, sender: player.id }, intruder), null);
  updateHook(owner, { flags: { [scope]: { mealAbilityRequest: data } } }, {}, intruder.id);
  await Promise.resolve();
  assert.equal(rolls, before); assert.equal(other.effects.length, 0);
  game.user = player;
  assert.equal(await abilities.handleMealAbilityRequest(owner, data, player), null, "players cannot execute GM handler");
  game.user = gm;
  const backup = makeUser("backup", true); game.users.push(backup); game.user = backup;
  assert.equal(await abilities.handleMealAbilityRequest(owner, data, player), null, "inactive GM cannot execute");
  game.user = gm;
}
{
  const owner = guardedActor(); const other = guardedActor(); other.isOwner = false;
  owner.flags[scope].professions.cook.path = "wanderer";
  const data = request(owner, [owner, other], "concurrent");
  const before = rolls;
  await Promise.all([abilities.handleMealAbilityRequest(owner, data, player), abilities.handleMealAbilityRequest(owner, data, player)]);
  assert.equal(rolls, before + 1); assert.equal(other.system.attributes.exhaustion, 1, "Empty Pot applies exactly once");
  assert.equal(owner.system.attributes.exhaustion, 1);
}
{
  const owner = guardedActor(); const outsider = guardedActor(); outsider.hasPlayerOwner = false;
  const before = rolls;
  await abilities.handleMealAbilityRequest(owner, request(owner, [outsider], "notparty"), player);
  assert.match(owner.getFlag(scope, "mealAbilityResponses.notparty.error"), /party characters/);
  assert.equal(rolls, before); assert.equal(outsider.effects.length, 0);
  const changed = request(owner, [owner], "stalePath"); owner.flags[scope].professions.cook.path = "wanderer";
  await abilities.handleMealAbilityRequest(owner, changed, player);
  assert.match(owner.getFlag(scope, "mealAbilityResponses.stalePath.error"), /changed/);
  assert.equal(rolls, before);
  const duplicate = request(owner, [owner, owner], "duplicate");
  assert.equal(await abilities.handleMealAbilityRequest(owner, duplicate, player), null);
  assert.equal(await abilities.handleMealAbilityRequest(owner, { ...changed, requestId: "bad.id" }, player), null);
}
{
  const owner = guardedActor(); const other = guardedActor(); other.isOwner = false;
  connectTransport(owner);
  foundry.applications = { api: { DialogV2: { wait: async data => {
    assert.ok(data.content.includes(`value="${other.id}"`), "player picker includes other owners' characters");
    return [owner.id, other.id];
  } } } };
  game.user = player;
  assert.equal((await abilities.useAbility(owner, "cook")).success, true);
  game.user = gm;
  const before = rolls;
  await abilities.handleMealAbilityRequest(owner, request(owner, [other], "alreadyUsed"), player);
  assert.equal(rolls, before); assert.match(owner.getFlag(scope, "mealAbilityResponses.alreadyUsed.error"), /has used/);
}
{
  const owner = guardedActor(); const other = guardedActor(); other.isOwner = false;
  other.failCreate = true;
  const data = { ...request(owner, [owner, other], "partialFailure"), effect: "emptyPot", dc: -100, amount: 999 };
  const before = rolls;
  await abilities.handleMealAbilityRequest(owner, data, player);
  assert.match(owner.getFlag(scope, "mealAbilityResponses.partialFailure.error"), /create failed/);
  assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), undefined, "recovered operational failure restores readiness");
  assert.equal(owner.system.attributes.exhaustion, 2, "injected effect data ignored");
  await abilities.handleMealAbilityRequest(owner, data, player);
  assert.equal(rolls, before + 1, "failed request cannot repeat partial benefits");
  assert.equal(owner.effects.length, 0); assert.equal(other.effects.length, 0);
}
{
  const owner = guardedActor(); const other = guardedActor(); other.isOwner = false;
  const data = request(owner, [other], "reservationFailure");
  const setFlag = gm.setFlag;
  gm.setFlag = async () => { throw new Error("receipt unavailable"); };
  const before = rolls;
  try { await assert.rejects(abilities.handleMealAbilityRequest(owner, data, player), /receipt unavailable/); }
  finally { gm.setFlag = setFlag; }
  assert.equal(rolls, before); assert.equal(other.effects.length, 0, "receipt reservation failure grants no benefits");
  await gm.setFlag(scope, `mealAbilityReceipts.${owner.id}.${data.requestId}`, { requestId: data.requestId, sender: player.id, status: "pending" });
  await abilities.handleMealAbilityRequest(owner, data, player);
  assert.equal(rolls, before); assert.match(owner.getFlag(scope, `mealAbilityResponses.${data.requestId}.error`), /already started/);
}
const hearthEffect = (name = "Previous Hearth-fed") => new Effect({ name, changes: [],
  duration: { seconds: 321, startTime: 123 }, flags: { [scope]: { hearthFed: true, preserved: "original" } } });
const effectState = doc => doc.effects.map(effect => effect.toObject());

// A later diner fails after earlier replacements completed. Preserve exact
// previous effects (IDs, duration, flags) and both actors' temporary HP.
{
  const owner = guardedActor(); const other = guardedActor(); other.isOwner = false;
  owner.flags[scope].professions.cook.abilityUsed = false;
  owner.effects.push(hearthEffect(), new Effect({ name: "Unrelated", flags: {} }));
  other.effects.push(hearthEffect());
  owner.system.attributes.hp.temp = 7; other.system.attributes.hp.temp = 3;
  const beforeEffects = [effectState(owner), effectState(other)];
  const create = owner.createEmbeddedDocuments;
  owner.createEmbeddedDocuments = async (...args) => {
    const created = await create.apply(owner, args);
    if (args[1].some(effect => effect.flags?.[scope]?.mealAbilityTransaction)) owner.system.attributes.hp.temp = 99;
    return created;
  };
  other.failCreate = true;
  const data = request(owner, [owner, other], "laterDinerRollback");
  await abilities.handleMealAbilityRequest(owner, data, player);
  assert.match(owner.getFlag(scope, `mealAbilityResponses.${data.requestId}.error`), /All diners were restored/);
  assert.deepEqual([effectState(owner), effectState(other)], beforeEffects);
  assert.deepEqual([owner.system.attributes.hp.temp, other.system.attributes.hp.temp], [7, 3]);
  assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), false, "exact previous false restored");
  const beforeRolls = rolls;
  await abilities.handleMealAbilityRequest(owner, data, player);
  assert.equal(rolls, beforeRolls, "recovered request ID still spent");
  await abilities.handleMealAbilityRequest(owner, request(owner, [owner, other], "newAfterRecovery"), player);
  assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), true, "new request can use a recovered ability");
}
// Replacement creation fails before deleting the previous Hearth-fed.
{
  const owner = guardedActor(); const old = hearthEffect(); owner.effects.push(old);
  owner.failCreate = true;
  await assert.rejects(abilities.useAbility(owner, "cook", { items: [owner] }), /All diners were restored/);
  assert.equal(owner.effects[0], old, "creation failure never deletes the previous effect");
  assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), undefined);
}
// A delete can succeed and then reject. Restore its removed effect too.
{
  const owner = guardedActor(); owner.effects.push(hearthEffect());
  const previous = effectState(owner); owner.failDeleteEffects = true;
  await assert.rejects(abilities.useAbility(owner, "cook", { items: [owner] }), /All diners were restored/);
  assert.deepEqual(effectState(owner), previous);
  assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), undefined);
}
// Later Empty Pot write fails: restore exhaustion for every diner.
{
  const owner = guardedActor(); const other = guardedActor(); other.isOwner = false;
  owner.flags[scope].professions.cook.path = "wanderer";
  owner.system.attributes.hp.temp = 4; other.system.attributes.hp.temp = 8;
  other.failUpdate = true;
  const data = request(owner, [owner, other], "exhaustionRollback");
  await abilities.handleMealAbilityRequest(owner, data, player);
  assert.deepEqual([owner.system.attributes.exhaustion, other.system.attributes.exhaustion], [2, 2]);
  assert.deepEqual([owner.system.attributes.hp.temp, other.system.attributes.hp.temp], [4, 8]);
  assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), undefined);
  assert.match(owner.getFlag(scope, `mealAbilityResponses.${data.requestId}.error`), /All diners were restored/);
}
// A rejected write may have mutated both attributes before rejecting.
{
  const owner = guardedActor(); owner.flags[scope].professions.cook.path = "wanderer";
  const update = owner.update;
  let failed = false;
  owner.update = async changes => {
    await update.call(owner, changes);
    if (!failed) { failed = true; owner.system.attributes.hp.temp = 55; throw new Error("after write failed"); }
  };
  await assert.rejects(abilities.useAbility(owner, "cook", { items: [owner] }), /All diners were restored/);
  assert.equal(owner.system.attributes.exhaustion, 2); assert.equal(owner.system.attributes.hp.temp, 0);
  assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), undefined);
}
// Rollback failure retains the spent ability and blocks a new request. Other
// diners still recover even when one target cannot be restored.
{
  const owner = guardedActor(); const other = guardedActor(); other.isOwner = false;
  owner.effects.push(hearthEffect()); other.effects.push(hearthEffect());
  const previousOther = effectState(other);
  const remove = owner.deleteEmbeddedDocuments;
  owner.deleteEmbeddedDocuments = async (type, ids) => {
    if (ids.some(id => owner.effects.find(effect => effect.id === id)?.getFlag(scope, "mealAbilityTransaction"))) {
      throw new Error("cannot remove new effect");
    }
    return remove.call(owner, type, ids);
  };
  other.failCreate = true;
  const data = request(owner, [owner, other], "rollbackFailure");
  await abilities.handleMealAbilityRequest(owner, data, player);
  assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), true);
  assert.match(owner.getFlag(scope, `mealAbilityResponses.${data.requestId}.error`), /GM reconciliation required/);
  assert.deepEqual(effectState(other), previousOther, "other diners recover despite one failed rollback");
  const before = rolls;
  await abilities.handleMealAbilityRequest(owner, data, player);
  await abilities.handleMealAbilityRequest(owner, request(owner, [other], "afterFailedRecovery"), player);
  assert.equal(rolls, before);
}
// Restoring readiness itself can fail: retain spent, report reconciliation.
{
  const owner = guardedActor(); owner.failCreate = true;
  owner.unsetFlag = async () => { throw new Error("readiness write failed"); };
  await assert.rejects(abilities.useAbility(owner, "cook", { items: [owner] }), /GM reconciliation required/);
  assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), true);
  assert.equal(owner.effects.length, 0);
}
// A genuine failed check still spends the ability and writes no effects.
{
  const owner = guardedActor(); const check = game.modules.get("gathering-professions").api.recipes.rollProfessionCheck;
  game.modules.get("gathering-professions").api.recipes.rollProfessionCheck = async () => ({ total: 1, toMessage: async () => {} });
  try {
    assert.equal((await abilities.useAbility(owner, "cook", { items: [owner] })).success, false);
    assert.equal(owner.getFlag(scope, "professions.cook.abilityUsed"), true);
    assert.equal(owner.effects.length, 0);
  } finally { game.modules.get("gathering-professions").api.recipes.rollProfessionCheck = check; }
}
// Two cooks feeding each other in reversed diner order must not deadlock.
{
  const first = guardedActor(); const second = guardedActor();
  first.flags[scope].professions.cook.path = "wanderer";
  second.flags[scope].professions.cook.path = "wanderer";
  const offset = lockEntries.length;
  let timer;
  try {
    await Promise.race([
      Promise.all([abilities.useAbility(first, "cook", { items: [first, second] }), abilities.useAbility(second, "cook", { items: [second, first] })]),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("party lock deadlock")), 1000); })
    ]);
  } finally { clearTimeout(timer); }
  assert.equal(first.system.attributes.exhaustion, 0); assert.equal(second.system.attributes.exhaustion, 0);
  const ordered = [first.id, second.id].sort();
  assert.deepEqual(lockEntries.slice(offset), [...ordered, ...ordered], "each cook acquired once, in the same global order");
}
console.log("PASS: audit-meals — serving recovery, save expiry, talents, pricing, authenticated party feeding, replay protection, transactional party rollback and ordered actor locks");
