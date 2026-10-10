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
globalThis.Hooks = { on() {}, once() {}, off() {} };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
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

// Even a lost acknowledgement after a successful commit cannot award XP twice.
const acknowledgedLate = await hunter();
const originalUpdate = acknowledgedLate.update.bind(acknowledgedLate);
let loseAcknowledgement = true;
acknowledgedLate.update = async changes => {
  const result = await originalUpdate(changes);
  if (isQueueCommit(changes) && loseAcknowledgement) {
    loseAcknowledgement = false;
    throw new Error("injected lost commit acknowledgement");
  }
  return result;
};
successful();
await assert.rejects(craft.craft(acknowledgedLate, row.id), /lost commit acknowledgement/);
await assert.rejects(craft.craft(acknowledgedLate, row.id), /already done/);
await refining.deliverDueJobs(acknowledgedLate, refining.actorJobs(acknowledgedLate)[0].ready);
assert.equal(state.xpOf(acknowledgedLate, "bountyhunter"), 5);
assert.equal(acknowledgedLate.system.currency.gp, row.gold);

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
await assert.rejects(refining.deliverDueJobs(partial), /GM reconciliation/);
assert.ok(refining.actorJobs(partial)[0].itemDeliveryStarted, "Generic creation errors remain indeterminate");
assert.equal(partial.system.currency.gp, partialJob.gold);
assert.equal(state.xpOf(partial, "bountyhunter"), 100);
// Explicit GM reconciliation of this fixture: the rejected mock created nothing.
await partial.update({ [`flags.${GP}.refiningJobs.${partialJob.id}.itemDeliveryStarted`]: false });
await refining.deliverDueJobs(partial);
assert.equal(partial.system.currency.gp, partialJob.gold);
assert.equal(state.xpOf(partial, "bountyhunter"), 100);
assert.equal(partial.items.filter(item => item.getFlag(GP, "deliveryJob") === partialJob.id).length, 1);

// Creation may commit and be consumed before a rejected acknowledgement reaches the caller.
const uncertain = actor();
const uncertainJob = await refining.queueJob(uncertain, { name: "Uncertain reward", gold: 7, quantity: 1, ready: 0,
  data: { name: "Uncertain reward", type: "consumable", system: {} } });
const createUncertain = uncertain.createEmbeddedDocuments.bind(uncertain);
let uncertainCreations = 0;
uncertain.createEmbeddedDocuments = async (...args) => {
  const created = await createUncertain(...args);
  uncertainCreations++;
  await created[0].delete();
  throw new Error("injected lost creation acknowledgement");
};
await assert.rejects(refining.deliverDueJobs(uncertain), /lost creation acknowledgement/);
assert.ok(refining.actorJobs(uncertain)[0].itemDeliveryStarted);
await assert.rejects(refining.deliverDueJobs(uncertain), /GM reconciliation/);
assert.equal(uncertainCreations, 1, "Indeterminate delivery must never automatically create again");
assert.equal(uncertain.system.currency.gp, 7);
assert.equal(uncertain.items.length, 0);
assert.equal(refining.actorJobs(uncertain)[0].id, uncertainJob.id);

// Rejected reward commits refund exact used gear; persisted commits never refund.
settings.set(`${CP}.bountyContracts`, { list: [{ id: "gear-cost", tier: 1, town: "Audit town", target: "Audit quarry",
  title: "Gear cost", type: "kill", days: 1, kill: { gold: 8, gear: [{ name: "Audit Gear", quantity: 2, mode: "used", reason: "Spent during the hunt" }] }, finds: [] }] });
const gearRow = recipes.findRecipe("bountyhunter:contract.gear-cost:kill");
settings.set(`${CP}.rules`, { timed: true });
for (const quantity of [2, 4]) {
  const owner = actor();
  await owner.createEmbeddedDocuments("Item", [{ name: "Audit Gear", type: "loot", system: { quantity }, flags: { audit: { provenance: "original" } } }]);
  owner.rejectUpdate = isQueueCommit;
  successful();
  await assert.rejects(craft.craft(owner, gearRow.id), /injected Actor/);
  assert.equal(refining.inventoryCount(owner, "Audit Gear"), quantity);
  assert.equal(owner.items[0].getFlag("audit", "provenance"), "original");
  assert.equal(state.xpOf(owner, "bountyhunter"), 0);
  assert.equal(refining.actorJobs(owner).length, 0);
  owner.rejectUpdate = null;
  successful();
  await craft.craft(owner, gearRow.id);
  assert.equal(refining.inventoryCount(owner, "Audit Gear"), quantity - 2);
  assert.equal(state.xpOf(owner, "bountyhunter"), 5);
}
const committedGear = actor();
await committedGear.createEmbeddedDocuments("Item", [{ name: "Audit Gear", type: "loot", system: { quantity: 4 } }]);
const commitGear = committedGear.update.bind(committedGear);
committedGear.update = async changes => {
  const result = await commitGear(changes);
  if (isQueueCommit(changes)) throw new Error("injected lost reward acknowledgement");
  return result;
};
successful();
await assert.rejects(craft.craft(committedGear, gearRow.id), /lost reward acknowledgement/);
assert.equal(refining.inventoryCount(committedGear, "Audit Gear"), 2, "Persisted job/progression forbids a refund");
assert.equal(state.xpOf(committedGear, "bountyhunter"), 5);
assert.equal(refining.actorJobs(committedGear).length, 1);

const changedGear = actor();
await changedGear.createEmbeddedDocuments("Item", [{ name: "Audit Gear", type: "loot", system: { quantity: 4 } }]);
const changeGear = changedGear.update.bind(changedGear);
changedGear.update = async changes => {
  if (isQueueCommit(changes)) {
    changedGear.items[0].system.quantity = 1;
    throw new Error("injected rejected reward and external gear change");
  }
  return changeGear(changes);
};
successful();
await assert.rejects(craft.craft(changedGear, gearRow.id), /Gear rollback needs GM reconciliation/);
assert.equal(refining.inventoryCount(changedGear, "Audit Gear"), 1, "Rollback must not overwrite another inventory change");
settings.delete(`${CP}.bountyContracts`);

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
smith.items[0].system.quantity = 0.25;
const before = smith.items.map(item => item.toObject());
const discovery = await craft.experiment(smith, "blacksmith", ["Copper Ingot", "Cured Hide"]);
assert.equal(discovery.learned.output, "Dagger");
assert.deepEqual(smith.items.map(item => item.toObject()), before);
smith.items[0].system.quantity = 1;
await smith.createEmbeddedDocuments("Item", [{ name: "Cedar Plank", type: "loot", system: { quantity: 1 } }]);
await state.learn(smith, recipes.professionRecipes("blacksmith").filter(entry => entry.output !== "Handaxe").map(entry => entry.id));
const handaxe = await craft.experiment(smith, "blacksmith", ["Copper Ingot", "Cedar Plank"]);
assert.equal(handaxe.learned.output, "Handaxe", "One ingot suffices to experiment with a two-ingot recipe");
assert.equal(refining.inventoryCount(smith, "Copper Ingot"), 1);

// Reject complete proposed graphs before saving either custom rows or built-in edits.
game.modules.set("kctg-5e", { active: true });
for (const name of ["Audit Raw", "Audit A", "Audit B", "Audit C", "Stone Brick"]) {
  worldItems.push(new Document({ name, type: "loot", ownership: { default: 2 }, system: { quantity: 1 } }));
}
const fields = (output, input) => ({ profession: "mining", tier: 1, output, quantity: 1, inputs: [[input, 1]] });
const first = await refining.createRecipe(fields("Audit A", "Audit Raw"));
await refining.createRecipe(fields("Audit B", "Audit A"));
await refining.createRecipe(fields("Audit C", "Audit B"));
const beforeCreate = structuredClone(settings.get(`${GP}.customRecipes`));
await assert.rejects(refining.createRecipe(fields("Audit A", "Audit C")), /Recipe cycle/);
assert.deepEqual(settings.get(`${GP}.customRecipes`), beforeCreate);
await assert.rejects(refining.updateRecipe(first.id, fields("Audit A", "Audit C")), /Recipe cycle/);
assert.deepEqual(settings.get(`${GP}.customRecipes`), beforeCreate);
await refining.createRecipe(fields("Audit A", "Stone Brick"));
const brick = refining.refiningRecipes("mining").find(entry => !entry.custom && entry.output === "Stone Brick");
const beforeEdits = structuredClone(settings.get(`${GP}.recipeEdits`));
await assert.rejects(refining.updateRecipe(brick.id, fields("Stone Brick", "Audit A")), /Recipe cycle/);
assert.deepEqual(settings.get(`${GP}.recipeEdits`), beforeEdits);
assert.equal(rolls.length, 0);
console.log("PASS: audit transactions — atomic bounty rewards, guarded gear rollback, indeterminate delivery fail-closed handling, durable receipts, carried-only experiments, and recipe cycle rejection.");
