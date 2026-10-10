// Isolated document doubles: no Foundry connection, files, or world mutations.
import assert from "node:assert/strict";

const CP = "crafting-professions";
const GP = "gathering-professions";
let nextId = 1;
const settings = new Map();
const get = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const set = (object, path, value) => {
  const parts = path.split(".");
  const last = parts.pop();
  const target = parts.reduce((value, key) => value[key] ??= {}, object);
  if (last.startsWith("-=")) delete target[last.slice(2)];
  else target[last] = structuredClone(value);
};
const merge = (target, source) => {
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith("-=")) delete target[key.slice(2)];
    else if (value && typeof value === "object" && !Array.isArray(value)) merge(target[key] ??= {}, value);
    else target[key] = structuredClone(value);
  }
  return target;
};

class Document {
  constructor(data, parent = null) {
    Object.assign(this, structuredClone(data));
    this.id = data._id ?? `doc${nextId++}`;
    this.parent = parent;
    this.flags ??= {};
    this.system ??= {};
    this.uuid = parent ? `${parent.uuid}.Item.${this.id}` : `${this.documentName ?? "Item"}.${this.id}`;
    if (this.documentName === "Actor") this.items = [];
  }
  getFlag(scope, key) { return get(this.flags[scope], key); }
  async setFlag(scope, key, value) { return this.update({ [`flags.${scope}.${key}`]: value }); }
  async unsetFlag(scope, key) {
    const parts = key.split(".");
    const last = parts.pop();
    return this.update({ [`flags.${scope}.${parts.length ? `${parts.join(".")}.` : ""}-=${last}`]: null });
  }
  async update(changes) {
    if (this.rejectUpdate?.(changes)) throw new Error("injected Actor update failure");
    // One update is atomic, including cross-module flags and currency.
    const next = { flags: structuredClone(this.flags), system: structuredClone(this.system) };
    for (const [key, value] of Object.entries(changes)) {
      if (!key.includes(".") && value && typeof value === "object") merge(next[key] ??= {}, value);
      else set(next, key, value);
    }
    this.flags = next.flags;
    this.system = next.system;
    return this;
  }
  toObject() {
    return { name: this.name, type: this.type, img: this.img, system: structuredClone(this.system), flags: structuredClone(this.flags) };
  }
  async createEmbeddedDocuments(type, data) {
    assert.equal(type, "Item");
    if (this.rejectCreate) throw new Error("injected Item creation failure");
    const created = data.map(entry => new Document(entry, this));
    this.items.push(...created);
    return created;
  }
  async updateEmbeddedDocuments(type, updates) {
    assert.equal(type, "Item");
    for (const { _id, ...changes } of updates) await this.items.find(item => item.id === _id).update(changes);
  }
  async deleteEmbeddedDocuments(type, ids) {
    assert.equal(type, "Item");
    this.items = this.items.filter(item => !ids.includes(item.id));
  }
  async delete() { this.parent.items = this.parent.items.filter(item => item !== this); }
}

const actors = [];
const worldItems = [];
const rolls = [];
const messages = [];
globalThis.foundry = { utils: { getProperty: get, setProperty: set, randomID: () => `id${nextId++}`, escapeHTML: String } };
globalThis.ui = { notifications: { info() {} } };
globalThis.ChatMessage = { create: async data => messages.push(data), getSpeaker: () => ({}) };
globalThis.Roll = class {
  constructor(formula) { this.formula = formula; }
  async evaluate() {
    const result = rolls.shift();
    assert.ok(result, "Every check must have an explicit test roll");
    this.total = result.total;
    this.dice = [{ total: result.natural ?? 10 }];
    return this;
  }
  async toMessage(data) { messages.push(data); }
};
globalThis.game = {
  user: { id: "gm", isGM: true }, users: [{ id: "gm", isGM: true }],
  actors, items: worldItems, time: { worldTime: 1000 },
  settings: { get: (scope, key) => settings.get(`${scope}.${key}`), set: async (scope, key, value) => settings.set(`${scope}.${key}`, value) },
  modules: new Map()
};

const refining = await import("../../gathering-professions/scripts/refining.js");
const actions = await import("../../gathering-professions/scripts/actions.js");
const checks = await import("../../gathering-professions/scripts/checks.js");
const gathering = await import("../../gathering-professions/scripts/gathering.js");
game.modules.set(GP, { api: { recipes: { ...refining, runActorAction: actions.runActorAction,
  rollProfessionCheck: checks.rollProfessionCheck, degree: gathering.getDegreeOfSuccess, naturalMasterful: gathering.naturalMasterful } } });
const craft = await import("../scripts/craft.js");
const state = await import("../scripts/state.js");
const recipes = await import("../scripts/recipes.js");
const row = recipes.findRecipe("bountyhunter:contract.garrick-the-fence:kill");
assert.ok(row);
for (const [name] of row.finds) worldItems.push(new Document({ name, type: "loot", system: { quantity: 1 } }));

function actor(profession = "bountyhunter", xp = 0) {
  const value = new Document({ documentName: "Actor", type: "character", name: "Audit character", isOwner: true, hasPlayerOwner: true,
    system: { currency: { gp: 0 }, abilities: { int: { mod: 3 }, str: { mod: 3 } }, skills: { inv: { total: 5 } } },
    flags: { [CP]: { professions: { [profession]: { rank: 1, xp, path: "wanderer", talents: ["preserved"] } }, known: [row.learnId] } } });
  actors.push(value);
  return value;
}
async function hunter(xp = 0) {
  const value = actor("bountyhunter", xp);
  await value.createEmbeddedDocuments("Item", row.inputs.map(([name, quantity]) => ({ name, type: "loot", system: { quantity } })));
  return value;
}
const successful = () => rolls.push({ total: 12 });
const completed = value => state.completedIds(value).has(row.jobId);
const isQueueCommit = changes => Object.keys(changes).some(key => /^flags\.gathering-professions\.refiningJobs\.[^.]+$/.test(key));

// A rejected reward commit must not leave XP/completion without a reward.
settings.set(`${CP}.rules`, { timed: true });
const rejected = await hunter();
rejected.rejectUpdate = isQueueCommit;
successful();
await assert.rejects(craft.craft(rejected, row.id), /injected Actor/);
assert.equal(completed(rejected), false);
assert.equal(state.xpOf(rejected, "bountyhunter"), 0);
assert.equal(refining.actorJobs(rejected).length, 0);
rejected.rejectUpdate = null;
successful();
const queued = await craft.craft(rejected, row.id);
assert.ok(queued.job);
assert.equal(completed(rejected), true);
assert.equal(state.xpOf(rejected, "bountyhunter"), 5);
assert.equal(rejected.system.currency.gp, 0);
await assert.rejects(craft.craft(rejected, row.id), /already done/);
await refining.deliverDueJobs(rejected, queued.job.ready);
await refining.deliverDueJobs(rejected, queued.job.ready);
assert.equal(rejected.system.currency.gp, row.gold);
assert.equal(state.xpOf(rejected, "bountyhunter"), 5);

// Immediate-payment failure retains a recoverable job; retries never reroll or award XP again.
settings.set(`${CP}.rules`, { timed: false, rankUpMode: "auto" });
const unpaid = await hunter(95);
unpaid.rejectUpdate = changes => "system.currency.gp" in changes;
successful();
await assert.rejects(craft.craft(unpaid, row.id), /injected Actor/);
assert.equal(completed(unpaid), true);
assert.equal(state.xpOf(unpaid, "bountyhunter"), 100);
assert.equal(state.rankOf(unpaid, "bountyhunter"), 2);
assert.deepEqual(state.actorProfessions(unpaid).bountyhunter.talents, ["preserved"]);
assert.equal(state.actorProfessions(unpaid).bountyhunter.path, "wanderer");
assert.equal(refining.actorJobs(unpaid).length, 1);
await assert.rejects(craft.craft(unpaid, row.id), /already done/);
unpaid.rejectUpdate = null;
await Promise.all([refining.deliverDueJobs(unpaid), refining.deliverDueJobs(unpaid)]);
assert.equal(unpaid.system.currency.gp, row.gold);
assert.equal(state.xpOf(unpaid, "bountyhunter"), 100);

// Gold can succeed before a find fails. The component receipt prevents a second payment.
settings.set(`${CP}.rules`, { timed: false });
const partial = await hunter(95);
partial.rejectCreate = true;
rolls.push({ total: 25, natural: 20 });
await assert.rejects(craft.craft(partial, row.id), /injected Item/);
const partialJob = refining.actorJobs(partial)[0];
assert.ok(partialJob.goldDelivered);
assert.equal(state.actorProfessions(partial).bountyhunter.readyNotified, 2);
partial.rejectCreate = false;
await refining.deliverDueJobs(partial);
assert.equal(partial.system.currency.gp, partialJob.gold);
assert.equal(state.xpOf(partial, "bountyhunter"), 100);
assert.equal(partial.items.filter(item => item.getFlag(GP, "deliveryJob") === partialJob.id).length, 1);

// Persist the item receipt before removing a job, then consume or transfer the reward.
for (const transfer of [false, true]) {
  const recipient = actor();
  const job = await refining.queueJob(recipient, { name: "Receipt meal", gold: 7, quantity: 1, ready: 0,
    data: { name: "Receipt meal", type: "consumable", system: {} } });
  recipient.rejectUpdate = changes => `flags.${GP}.refiningJobs.-=${job.id}` in changes;
  await assert.rejects(refining.deliverDueJobs(recipient), /injected Actor/);
  assert.ok(refining.actorJobs(recipient)[0].itemDelivered);
  const reward = recipient.items[0];
  if (transfer) {
    const other = actor();
    other.items.push(new Document(reward.toObject(), other));
  }
  await reward.delete();
  recipient.rejectUpdate = null;
  await refining.deliverDueJobs(recipient);
  assert.equal(recipient.items.length, 0, "Receipt survives an absent reward item");
  assert.equal(recipient.system.currency.gp, 7);
  assert.equal(refining.actorJobs(recipient).length, 0);
}

// Failed receipt persistence is recoverable while the item exists, and fails closed if consumed.
for (const consume of [false, true]) {
  const recipient = actor();
  const job = await refining.queueJob(recipient, { name: "Interrupted receipt", quantity: 1, ready: 0,
    data: { name: "Interrupted receipt", type: "loot", system: {} } });
  recipient.rejectUpdate = changes => `flags.${GP}.refiningJobs.${job.id}.itemDelivered` in changes;
  await assert.rejects(refining.deliverDueJobs(recipient), /injected Actor/);
  recipient.rejectUpdate = null;
  if (consume) {
    await recipient.items[0].delete();
    await assert.rejects(refining.deliverDueJobs(recipient), /GM reconciliation/);
    assert.equal(recipient.items.length, 0);
    assert.equal(refining.actorJobs(recipient).length, 1, "Ambiguous job remains for reconciliation");
  } else {
    await refining.deliverDueJobs(recipient);
    assert.equal(recipient.items.length, 1);
  }
}

// Experiments require every carried type with positive quantity, never the recipe's full quantities.
const smith = actor("blacksmith");
smith.flags[CP].known = [];
assert.equal((await craft.experiment(smith, "blacksmith", ["Copper Ingot", "Cured Hide"])).learned, null);
await smith.createEmbeddedDocuments("Item", [{ name: "Copper Ingot", type: "loot", system: { quantity: 0 } },
  { name: "Cured Hide", type: "loot", system: { quantity: 1 } }]);
assert.equal((await craft.experiment(smith, "blacksmith", ["Copper Ingot", "Cured Hide"])).learned, null);
smith.items[0].system.quantity = 1;
const before = smith.items.map(item => item.toObject());
const discovery = await craft.experiment(smith, "blacksmith", ["Copper Ingot", "Cured Hide"]);
assert.equal(discovery.learned.output, "Dagger");
assert.deepEqual(smith.items.map(item => item.toObject()), before);
await smith.createEmbeddedDocuments("Item", [{ name: "Cedar Plank", type: "loot", system: { quantity: 1 } }]);
await state.learn(smith, recipes.professionRecipes("blacksmith").filter(entry => entry.output !== "Handaxe").map(entry => entry.id));
const handaxe = await craft.experiment(smith, "blacksmith", ["Copper Ingot", "Cedar Plank"]);
assert.equal(handaxe.learned.output, "Handaxe", "One ingot suffices to experiment with a two-ingot recipe");
assert.equal(refining.inventoryCount(smith, "Copper Ingot"), 1);
assert.equal(rolls.length, 0);
console.log("PASS: audit transactions — atomic bounty progression/rewards, payment retries, durable receipts, interrupted-receipt recovery, and carried-only non-consuming experiments.");
