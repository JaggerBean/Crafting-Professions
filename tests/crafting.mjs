// Crafting Professions with in-memory document doubles and Gathering
// Professions' real crafting helpers.
import assert from "node:assert/strict";

let nextId = 1;
const settings = {};
const getProperty = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const setProperty = (object, path, value) => {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((current, key) => current[key] ??= {}, object)[last] = value;
};
const merge = (target, source) => {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) target[key] = merge(target[key] ?? {}, value);
    else target[key] = value;
  }
  return target;
};

class Doc {
  constructor(data, parent = null, kind = "Item") {
    Object.assign(this, structuredClone(data));
    this.id = `${kind}${nextId++}`;
    this.documentName = kind;
    this.parent = parent;
    this.uuid = parent ? `${parent.uuid}.${kind}.${this.id}` : `${kind}.${this.id}`;
    this.flags ??= {};
    this.system ??= {};
    if (kind === "Actor") this.items = (data.items ?? []).map(item => new Doc(item, this));
  }
  getFlag(scope, key) { return getProperty(this.flags[scope] ?? {}, key); }
  async setFlag(scope, key, value) {
    this.flags[scope] ??= {}; setProperty(this.flags[scope], key, structuredClone(value));
    if (scope === "gathering-professions" && key === "actionRequest") {
      const sender = game.user;
      game.user = { id: "gm", isGM: true };
      const handled = actions.handleActionRequest(this, value, sender);
      game.user = sender;
      await handled;
    }
  }
  testUserPermission(user) { return user.isGM || this.isOwner; }
  async unsetFlag(scope, key) { const path = key.split("."); const last = path.pop(); const target = path.reduce((current, part) => current?.[part], this.flags[scope] ?? {}); if (target) delete target[last]; }
  async update(changes) {
    for (const [key, value] of Object.entries(changes)) {
      if (key.split(".").at(-1).startsWith("-=")) {
        const path = key.split("."); const last = path.pop().slice(2);
        const target = path.reduce((current, part) => current?.[part], this);
        if (target) delete target[last];
      } else if (key.includes(".")) setProperty(this, key, structuredClone(value));
      else if (value && typeof value === "object" && !Array.isArray(value)) this[key] = merge(this[key] ?? {}, structuredClone(value));
      else this[key] = value;
    }
    return this;
  }
  async delete() { const list = this.parent ? this.parent.items : items; list.splice(list.indexOf(this), 1); }
  toObject() { const { parent, items: _items, ...rest } = this; return structuredClone(rest); }
  async createEmbeddedDocuments(type, list) {
    const created = list.map(data => new Doc(data, this, type === "ActiveEffect" ? "ActiveEffect" : "Item"));
    (type === "ActiveEffect" ? (this.effects ??= []) : this.items).push(...created);
    return created;
  }
  async updateEmbeddedDocuments(_type, updates) { for (const { _id, ...changes } of updates) await this.items.find(doc => doc.id === _id).update(changes); }
  async deleteEmbeddedDocuments(type, ids) { const list = type === "ActiveEffect" ? (this.effects ??= []) : this.items; for (const id of ids) list.splice(list.findIndex(doc => doc.id === id), 1); }
}

const items = [];
const actors = [];
const folders = [];
const chat = [];
const rolls = [];
globalThis.foundry = { utils: { getProperty, setProperty, mergeObject: merge, randomID: () => `r${nextId++}`, escapeHTML: value => String(value) },
  applications: { api: { ApplicationV2: class {}, DialogV2: { wait: async () => "0" } } } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 } };
const hooks = new Map();
globalThis.Hooks = { on(name, callback) { hooks.set(name, callback); }, once(name, callback) { hooks.set(name, callback); }, off() {}, callAll() {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error(message) { throw new Error(message); } } };
globalThis.ChatMessage = { create: async data => { chat.push(data); return data; }, getSpeaker: () => ({}) };
globalThis.Roll = class { constructor(formula) { this.formula = formula; }
  async evaluate() { const [d20, total] = rolls.shift(); this.total = total; this.dice = [{ total: d20 }]; return this; }
  async toMessage(data) { chat.push(data); return data; } };
globalThis.Item = { implementation: { create: async list => { const created = list.map(data => new Doc(data)); items.push(...created); return created; } } };
globalThis.Folder = { implementation: { create: async data => { const folder = { id: `Folder${nextId++}`, ...data }; folders.push(folder); return folder; } } };
globalThis.fromUuid = async uuid => [...actors, ...items].find(doc => doc.uuid === uuid) ?? null;
globalThis.fromUuidSync = uuid => [...actors, ...items].find(doc => doc.uuid === uuid) ?? null;

const refining = await import("../../gathering-professions/scripts/refining.js");
const gathering = await import("../../gathering-professions/scripts/gathering.js");
const actions = await import("../../gathering-professions/scripts/actions.js");
const checks = await import("../../gathering-professions/scripts/checks.js");
const recipesHelpers = {
  runActorAction: actions.runActorAction, rollProfessionCheck: checks.rollProfessionCheck,
  inventoryCount: refining.inventoryCount, maxBatch: refining.maxBatch, removeFromInventory: refining.removeFromInventory,
  addToInventory: refining.addToInventory, addGold: refining.addGold, queueJob: refining.queueJob, formatMinutes: refining.formatMinutes, itemPickerGroups: refining.itemPickerGroups,
  degree: gathering.getDegreeOfSuccess, naturalMasterful: gathering.naturalMasterful
};
globalThis.game = {
  user: { isGM: true, id: "gm" }, users: [{ id: "gm", isGM: true }], time: { worldTime: 1000 },
  settings: { get: (_module, key) => settings[key], set: async (_module, key, value) => { settings[key] = structuredClone(value); return value; } },
  modules: new Map([["gathering-professions", { active: true, api: { recipes: recipesHelpers, refining: { recipes: () => [] } } }], ["crafting-professions", {}]]),
  items, actors, folders, packs: new Map()
};
game.users.activeGM = game.users[0];

const { CRAFTING_PROFESSIONS } = await import("../scripts/professions.js");
const rulesLib = await import("../scripts/rules.js");
const recipes = await import("../scripts/recipes.js");
const state = await import("../scripts/state.js");
const craftLib = await import("../scripts/craft.js");
const perks = await import("../scripts/perks.js");
const { craftingProvider } = await import("../scripts/provider.js");
const { craftingSectionHtml } = await import("../scripts/menu.js");
const { renderGm, HUB_SECTION } = await import("../scripts/gm.js");
const abilities = await import("../scripts/abilities.js");
const bountyLib = await import("../scripts/contacts.js");
const bountyGm = await import("../scripts/bounty-gm.js");
const ask = await import("../scripts/askaround.js");
const meals = await import("../scripts/meals.js");

// World Items the recipes use.
const worldItem = (name, type = "loot", system = {}) => Item.implementation.create([{ name, type, img: `${name}.webp`, system: { quantity: 1, price: { value: 1, denomination: "gp" }, ...system }, flags: {} }]);
for (const name of ["Copper Ingot", "Coke", "Cured Hide", "Cedar Plank", "Pine Plank", "Split Bamboo", "Fletching Feathers", "Nails", "Horseshoe", "Caltrops", "Chisel", "Flat Tongs", "Arrows", "Bolts"]) await worldItem(name);
for (const name of ["Dagger", "Sickle", "Light Hammer", "Handaxe", "Spear"]) await worldItem(name, "weapon", { damage: { base: { bonus: "" } }, weight: { value: 2 }, price: { value: 2, denomination: "gp" } });
for (const name of ["Miner's Pick", "Herbalism Sickle", "Woodcutter's Axe", "Skinning Knife"]) await worldItem(name, "tool");

// Rules: defaults and validation.
const defaults = rulesLib.craftingRules();
assert.deepEqual([defaults.tierDc, defaults.tierMinutes, defaults.rankUpMode, defaults.knowledgeMode, defaults.perkPicker], [[10, 14, 18, 23, 28], [60, 120, 240, 480, 1440], "gm", "character", "gm"]);
assert.deepEqual(defaults.outcomes, { excellent: { extra: 0, masterwork: true, perk: false }, masterful: { extra: 0, masterwork: true, perk: true } });
await assert.rejects(rulesLib.saveCraftingRules({ rankXp1: "50", rankXp2: "40" }), /more XP than the one before/);
await assert.rejects(rulesLib.saveCraftingRules({ excellentExtra: "-1" }), /Extra products/);

// Recipes.
const smithing = recipes.professionRecipes("blacksmith");
assert.equal(smithing.length, 16);
assert.equal(new Set(smithing.map(row => row.id)).size, 16, "Unique recipe ids");
assert.deepEqual(recipes.starterIds("blacksmith").map(id => recipes.findRecipe(id).output).sort(), ["Caltrops", "Horseshoe", "Nails"]);
const daggerId = smithing.find(row => row.output === "Dagger").id;

// Choosing the profession: rank 1 and the starter recipes.
const smith = new Doc({ name: "Brann", type: "character", hasPlayerOwner: true, isOwner: true,
  system: { abilities: { str: { mod: 3 } }, attributes: { prof: 2 }, tools: { smith: { value: 1 } } }, items: [] }, null, "Actor");
actors.push(smith);
await state.chooseProfession(smith, "blacksmith");
assert.deepEqual([state.rankOf(smith, "blacksmith"), state.dieOf(smith, "blacksmith")], [1, 4]);
assert.ok(state.knows(smith, recipes.starterIds("blacksmith")[0]) && !state.knows(smith, daggerId), "Starters known, the rest not");
game.user.isGM = false;
await assert.rejects(state.chooseProfession(smith, "blacksmith"), /already a Blacksmith/);
game.user.isGM = true;

// Party knowledge mode.
const ally = new Doc({ name: "Ally", type: "character", hasPlayerOwner: true, isOwner: true, system: {}, items: [] }, null, "Actor");
actors.push(ally);
assert.equal(state.knows(ally, recipes.starterIds("blacksmith")[0]), false, "Character mode: only the learner knows");
settings.rules = { knowledgeMode: "party" };
assert.equal(state.knows(ally, recipes.starterIds("blacksmith")[0]), true, "Party mode: everyone knows");
settings.rules = {};

// Check and blocked reasons.
const daggerRow = recipes.findRecipe(daggerId);
assert.equal(craftLib.blockedReason(smith, daggerRow), "Needs Smith's Tools");
await smith.createEmbeddedDocuments("Item", [{ name: "Smith's Tools", type: "tool", system: { type: { baseItem: "smith" }, quantity: 1 } }]);
assert.equal(craftLib.blockedReason(smith, daggerRow), null);
assert.equal(craftLib.blockedReason(ally, daggerRow), "Needs the Blacksmith profession");
const check = craftLib.checkFor(smith, daggerRow);
assert.deepEqual([check.modifier, check.die, check.target, check.formula], [5, 4, 10, "1d20 + 5 + 1d4"], "Strength 3 + proficiency 2 + d4 vs DC 10");
const tierTwo = { ...daggerRow, tier: 2 };
assert.equal(craftLib.blockedReason(smith, tierTwo), "Needs Blacksmith rank 2");

// Crafting.
const count = name => smith.items.filter(item => item.name === name).reduce((sum, item) => sum + (item.system.quantity ?? 0), 0);
await smith.createEmbeddedDocuments("Item", [{ name: "Copper Ingot", type: "loot", system: { quantity: 12 } }, { name: "Cured Hide", type: "loot", system: { quantity: 8 } }]);
settings.rules = { timed: false };
game.user.isGM = false;
await assert.rejects(craftLib.craft(smith, daggerId, 1), /has not learned/);
game.user.isGM = true;
await state.learn(smith, [daggerId]);
rolls.push([10, 12]);
let result = await craftLib.craft(smith, daggerId, 2);
assert.deepEqual([result.degree, result.made, result.name, count("Copper Ingot"), count("Cured Hide")], ["successful", 2, "Dagger", 10, 6]);
assert.equal(state.xpOf(smith, "blacksmith"), 10, "5 XP per unit");
rolls.push([7, 8]);
result = await craftLib.craft(smith, daggerId, 2);
assert.deepEqual([result.degree, count("Copper Ingot"), count("Cured Hide")], ["partial", 9, 5], "Near miss: half of 2 lost (rounded up)");
rolls.push([2, 4]);
result = await craftLib.craft(smith, daggerId, 1);
assert.deepEqual([result.degree, count("Copper Ingot"), count("Cured Hide")], ["failed", 8, 4], "Fail by 5+: all lost");
rolls.push([14, 16]);
result = await craftLib.craft(smith, daggerId, 1);
const masterwork = smith.items.find(item => item.name === "Masterwork Dagger");
assert.deepEqual([result.degree, Boolean(masterwork), masterwork?.system.price.value, masterwork?.flags["crafting-professions"].masterwork], ["excellent", true, 4, true], "Excellent: Masterwork, double value");
settings.rules = { timed: false, perkPicker: "random" };
rolls.push([20, 9]);
result = await craftLib.craft(smith, daggerId, 1);
assert.equal(result.degree, "masterful");
assert.match(result.name, /^Masterwork Dagger \((Keen|Balanced|Light|Ornate)\)$/, "Masterful: Masterwork + a fitting perk");
// GM picks the perk: the item waits with a token; the whisper card applies it.
settings.rules = { timed: true, perkPicker: "gm" };
chat.length = 0;
rolls.push([20, 25]);
result = await craftLib.craft(smith, daggerId, 1);
assert.ok(result.pendingPerk && result.job, "Timed: queued with a pending perk");
const card = chat.find(message => String(message.content).includes("data-cp-perk"));
assert.ok(card && card.whisper.includes("gm"), "GM gets a perk choice");
await craftLib.applyPendingPerk(smith.uuid, result.pendingPerk, "keen");
const job = refining.actorJobs(smith).find(entry => entry.data.flags["crafting-professions"].perks);
assert.deepEqual([job.data.name, job.data.system.damage.base.bonus], ["Masterwork Dagger (Keen)", "1"], "Perk applied to the queued item");
const keenBefore = count("Masterwork Dagger (Keen)");
await refining.deliverDueJobs(smith, game.time.worldTime + 3600);
assert.equal(count("Masterwork Dagger (Keen)"), keenBefore + 1, "Delivered after an hour");
settings.rules = {};

// Rank ups: GM confirms (whisper at the threshold) or automatic.
chat.length = 0;
await state.addXp(smith, "blacksmith", 100);
assert.equal(state.readyForRank(smith, "blacksmith"), 2);
assert.ok(chat.some(message => String(message.content).includes("rank 2")), "GM is told");
assert.equal(state.rankOf(smith, "blacksmith"), 1, "GM mode does not promote by itself");
assert.match(craftingSectionHtml(smith, true), /Ready for Rank 2/);
assert.match(craftingSectionHtml(smith, true), /data-cp-act="promote"/);
await state.setRank(smith, "blacksmith", 2);
settings.rules = { rankUpMode: "auto" };
await state.addXp(smith, "blacksmith", 200);
assert.equal(state.rankOf(smith, "blacksmith"), 3, "Automatic mode promotes at 300 XP");
settings.rules = {};

// Experimenting: exact items (any amounts), warm and cold hints, nothing used.
const handaxe = smithing.find(row => row.output === "Handaxe");
assert.equal(state.knows(smith, handaxe.id), false);
const warm = await craftLib.experiment(smith, "blacksmith", ["Cedar Plank"]);
assert.deepEqual([warm.learned, warm.warm, warm.message], [null, true, "Something here could work…"]);
const cold = await craftLib.experiment(smith, "blacksmith", ["Nails"]);
assert.deepEqual([cold.warm, cold.message], [false, "Nothing comes of it."]);
const found = await craftLib.experiment(smith, "blacksmith", ["Cedar Plank", "Copper Ingot"]);
assert.ok(found.learned && ["Sickle", "Handaxe", "Miner's Pick", "Herbalism Sickle"].includes(found.learned.output), "Learned a matching recipe");
assert.ok(state.knows(smith, found.learned.id));
assert.equal((await craftLib.experiment(ally, "blacksmith", ["Copper Ingot"])).message, "Only a Blacksmith can experiment here.");

// Recipe scrolls.
const scroll = await craftLib.makeScroll(handaxe.id === found.learned.id ? smithing.find(row => row.output === "Spear").id : handaxe.id);
assert.match(scroll.name, /^Recipe: /);
assert.equal(scroll.system.price.value, 2, "Tier 1 scroll: 2 gp (campaign price)");
const [carried] = await ally.createEmbeddedDocuments("Item", [scroll.toObject()]);
await assert.rejects(craftLib.learnFromScroll(carried), /Only a Blacksmith/);
const [mine] = await smith.createEmbeddedDocuments("Item", [scroll.toObject()]);
const listed = craftLib.carriedScrolls(smith, "blacksmith");
assert.deepEqual(listed.map(entry => [entry.name, entry.disabled]), [[mine.name, false]], "The Recipes window lists carried scrolls with Learn");
assert.equal(craftLib.carriedScrolls(ally, "blacksmith")[0].note, "Only a Blacksmith can learn this");
await import("../scripts/main.js");
const dnd5eControls = [];
game.user.isGM = false;
hooks.get("getHeaderControlsItemSheet5e")({ document: mine }, dnd5eControls);
assert.equal(dnd5eControls.find(control => control.action === "cp-learn-recipe")?.label, "Learn Recipe",
  "The dnd5e ItemSheet5e header offers the learn action");
await dnd5eControls.find(control => control.action === "cp-learn-recipe").onClick();
assert.ok(state.knows(smith, craftLib.scrollRecipe(scroll)) && !smith.items.includes(mine), "The header action learns and consumes the scroll");
game.user.isGM = true;
const worldControls = [];
hooks.get("getHeaderControlsItemSheet5e")({ document: scroll }, worldControls);
assert.equal(worldControls.length, 0, "A world Item must be carried before it can be learned");

// Perks.
const shield = { name: "Shield", type: "equipment", system: { armor: { value: 2 }, price: { value: 10 }, weight: { value: 6 }, description: { value: "" } }, flags: {} };
perks.applyPerk(shield, perks.perkList().find(entry => entry.name === "Reinforced"));
assert.deepEqual([shield.system.armor.value, shield.name], [3, "Shield (Reinforced)"]);
assert.ok(perks.fittingPerks({ type: "tool", system: {} }).some(entry => entry.name === "Durable"));
const tool = { name: "Miner's Pick", type: "tool", system: {}, flags: {} };
settings["gathering-professions-rules"] = undefined;
perks.applyPerk(tool, perks.perkList().find(entry => entry.name === "Durable"));
assert.deepEqual(tool.flags["gathering-professions"].durability, { max: 20, value: 20 }, "Durable doubles the world default durability (10)");
await assert.rejects(perks.savePerks([{ name: "A" }, { name: "A" }]), /unique name/);
await perks.savePerks([{ name: "Gilded", fits: "any", description: "Shiny.", effects: { value: 3 } }]);
assert.deepEqual(perks.perkList().map(entry => [entry.name, entry.effects.value]), [["Gilded", 3]]);

// Provider (Recipes window tab).
const provider = craftingProvider("blacksmith", recipesHelpers);
assert.equal(provider.visible(ally, false), false, "Hidden from characters without the profession");
assert.equal(provider.visible(smith, false), true);
assert.equal(provider.perCharacter, true);
settings.rules = { knowledgeMode: "party" };
assert.equal(provider.perCharacter, false, "Party mode switches live");
settings.rules = {};
await provider.setLearned(handaxe.id, "learned", ally);
assert.equal(state.knows(ally, handaxe.id), true, "GM grant to the chosen character");
await provider.setLearned(handaxe.id, "unlearned", ally);
assert.equal(state.knows(ally, handaxe.id), false);
assert.match(renderGm(), /name="rankUpMode"/);
assert.equal(HUB_SECTION.id, "crafting");
assert.equal(HUB_SECTION.group, "Crafting Professions");
assert.match(HUB_SECTION.render(), /data-cp-gm="save-rules"/, "The hub section renders the crafting settings");
assert.match(renderGm(), /name="perkName0" value="Gilded"/);
assert.ok(CRAFTING_PROFESSIONS.blacksmith.ranks.length === 5);

// Step 2: ability path, talents, ability use, long rest.
assert.equal(state.pathOf(smith, "blacksmith"), "standard");
await assert.rejects(state.chooseProfession(ally, "blacksmith", { path: "sideways" }), /standard or the Wanderer/);
await state.chooseProfession(ally, "blacksmith", { path: "wanderer" });
assert.equal(abilities.abilityFor(ally, "blacksmith").name, "Cold Forge");
assert.equal(state.talentSlots(ally, "blacksmith"), 1, "One talent at rank 1");
game.user.isGM = false;
await state.chooseTalent(ally, "blacksmith", "calloused-hands");
await assert.rejects(state.chooseTalent(ally, "blacksmith", "hammer-arm"), /No talent to choose yet/);
game.user.isGM = true;
await state.setRank(ally, "blacksmith", 2);
assert.equal(state.talentSlots(ally, "blacksmith"), 1, "Another at rank 2");
await state.chooseTalent(ally, "blacksmith", "hearty-stomach");
const athletic = abilities.talentsForRoll(ally, { skill: "ath" });
assert.deepEqual(athletic.map(entry => [entry.name, entry.die]), [["Calloused Hands", 6]]);
assert.deepEqual(abilities.talentsForRoll(ally, { ability: "con" }).map(entry => entry.name), ["Hearty Stomach"], "Plain Constitution checks");
assert.deepEqual(abilities.talentsForRoll(ally, { skill: "per" }), []);
assert.equal(abilities.situationalWithTalents("+2", athletic), "+2 + 1d6[Talent: Calloused Hands]");
assert.equal(abilities.situationalWithTalents("+2 + 1d6[Talent: Calloused Hands]", []), "+2", "Unticking removes the talent die");
assert.equal(abilities.situationalWithTalents("", [{ name: "A", die: 4 }, { name: "B", die: 8 }]), "1d8[Talent: A, B]", "Only the highest die, once");
const menuHtml = craftingSectionHtml(ally, true);
assert.match(menuHtml, /Cold Forge/);
assert.match(menuHtml, /data-cp-act="ability"/);
assert.match(menuHtml, /Calloused Hands/);
assert.match(menuHtml, /data-cp-path="blacksmith"/, "GM can switch the ability");
// Temper and True: a broken tool is fully repaired; a weapon is tempered.
const [pick, blade] = await smith.createEmbeddedDocuments("Item", [
  { name: "Miner's Pick", type: "tool", system: { quantity: 1 }, flags: { "gathering-professions": { durability: { max: 10, value: 0 } } } },
  { name: "Longsword", type: "weapon", system: { quantity: 1 } }
]);
rolls.push([12, 18]);
let used = await abilities.useAbility(smith, "blacksmith", { items: [pick, blade] });
assert.equal(used.success, true);
assert.deepEqual(pick.flags["gathering-professions"].durability, { max: 10, value: 10 }, "Broken tool repaired");
assert.equal(blade.flags["crafting-professions"].tempered, true);
await assert.rejects(abilities.useAbility(smith, "blacksmith"), /recharges on a long rest/);
await abilities.longRest(smith);
assert.equal(abilities.abilityUsed(smith, "blacksmith"), false, "Long rest recharges");
assert.equal(blade.flags["crafting-professions"].tempered, undefined, "Tempered wears off");
rolls.push([2, 9]);
used = await abilities.useAbility(smith, "blacksmith", { items: [blade] });
assert.deepEqual([used.success, abilities.abilityUsed(smith, "blacksmith")], [false, true], "A failure still uses the ability");
// Cold Forge: half durability.
await ally.createEmbeddedDocuments("Item", [{ name: "Skinning Knife", type: "tool", system: { quantity: 1 }, flags: { "gathering-professions": { durability: { max: 9, value: 0 } } } }]);
const knife = ally.items.find(item => item.name === "Skinning Knife");
rolls.push([15, 20]);
await abilities.useAbility(ally, "blacksmith", { items: [knife] });
assert.deepEqual(knife.flags["gathering-professions"].durability, { max: 9, value: 5 }, "Cold Forge: half durability, rounded up");

// Bounty Hunter v2: contacts (repeatable tasks) and contracts (one-time, by town).
settings.rules = { timed: false };
for (const name of ["Manacles", "Rope", "Hunting Trap", "Torch", "Rations", "Sleep Tincture", "Wanted Poster", "Boar Head", "Beast Tusk", "Gold Key", "Agate Ring", "Faded Map",
  "Bone Dice", "Silver Ring", "Skull Ring", "Letter From A Loved One", "Faction Earrings", "Unknown Letter", "Net", "Sack", "Chain", "Antitoxin", "Alchemist's Fire",
  "Pearl Earrings", "Jasper Ring", "Royal Signet", "Moldavite Ring"]) {
  if (!items.some(item => item.name === name)) await worldItem(name);
}
assert.equal(bountyLib.DEFAULT_CONTACTS.length, 15);
assert.deepEqual([1, 2, 3, 4, 5].map(tier => bountyLib.DEFAULT_CONTACTS.filter(entry => entry.tier === tier).length), [3, 3, 3, 3, 3], "3 contacts per tier");
assert.ok(bountyLib.DEFAULT_CONTACTS.filter(entry => entry.tier === 1 && entry.task.title !== "Rats in the Granary").every(entry => entry.task.type === "alive"), "Tier 1 people are brought back alive");
assert.ok(bountyLib.DEFAULT_CONTACTS.filter(entry => entry.tier === 5).every(entry => entry.task.type === "kill"), "Tier 5: kills (heads and trophies)");
const bountyRows = recipes.professionRecipes("bountyhunter");
assert.equal(bountyRows.length, 26, "15 contacts (5 dead-or-alive) + 4 contracts (2 dead-or-alive)");
const watchTask = bountyRows.find(row => row.id === "bountyhunter:contact.harbor-watch:alive");
assert.deepEqual([watchTask.source, watchTask.gold, watchTask.dcBonus, watchTask.repeatable, watchTask.group], ["contact", 3, 3, true, "contact.harbor-watch"]);
assert.match(watchTask.rewardText, /3 gp · once per long rest/);
const garrickKill = bountyRows.find(row => row.id === "bountyhunter:contract.garrick-the-fence:kill");
assert.deepEqual([garrickKill.source, garrickKill.gold, garrickKill.repeatable, garrickKill.group, garrickKill.groupLabel], ["contract", 8, false, "town.Saltmere", "Contracts · Saltmere"]);
const vex = new Doc({ name: "Vex", type: "character", hasPlayerOwner: true, isOwner: true,
  system: { abilities: { int: { mod: 2 } }, skills: { inv: { total: 4 } }, attributes: { prof: 2 }, currency: { gp: 0 } }, items: [] }, null, "Actor");
vex.testUserPermission = () => true;
actors.push(vex);
await state.chooseProfession(vex, "bountyhunter", { path: "standard" });
assert.ok(state.knows(vex, "contact.harbor-watch") && !state.knows(vex, "contract.garrick-the-fence"), "Starts with one contact");
const bountyProvider = craftingProvider("bountyhunter", recipesHelpers);
assert.equal(bountyProvider.isKnown(watchTask, vex), true);
assert.match(bountyProvider.panel(vex), /data-panel-act="ask"/);
const vexCount = name => vex.items.filter(item => item.name === name).reduce((sum, item) => sum + (item.system.quantity ?? 0), 0);
await vex.createEmbeddedDocuments("Item", [{ name: "Manacles", type: "consumable", system: { quantity: 1 } }, { name: "Rope", type: "consumable", system: { quantity: 3 } },
  { name: "Dagger", type: "weapon", system: { quantity: 1 } }, { name: "Hunting Trap", type: "consumable", system: { quantity: 4 } }, { name: "Spear", type: "weapon", system: { quantity: 1 } }]);
assert.deepEqual([craftLib.checkFor(vex, watchTask).target, craftLib.checkFor(vex, watchTask).modifier], [13, 4], "Investigation 4 + d4 vs DC 10 + 3 (alive)");
// A contact's task: repeat limit (once per long rest by default).
rolls.push([12, 14]);
let hunted = await craftLib.craft(vex, watchTask.id, 1);
assert.deepEqual([hunted.degree, vex.system.currency.gp, vexCount("Manacles"), vexCount("Rope")], ["successful", 3, 1, 3], "3 gp; kept gear stays");
assert.equal(craftLib.blockedReason(vex, watchTask), "Done until a long rest");
await assert.rejects(craftLib.craft(vex, watchTask.id, 1), /Done until a long rest/);
await abilities.longRest(vex);
assert.equal(craftLib.blockedReason(vex, watchTask), null, "Available again after a long rest");
// Contracts: one time; near miss keeps it open; bad failure loses at-risk gear; Masterful finds.
await state.learn(vex, ["contract.garrick-the-fence", "contract.old-tusk"]);
rolls.push([8, 9]);
hunted = await craftLib.craft(vex, garrickKill.id, 1);
assert.deepEqual([hunted.degree, bountyProvider.isDone(garrickKill, vex)], ["partial", false], "Near miss: the contract stays open");
rolls.push([13, 19]);
hunted = await craftLib.craft(vex, garrickKill.id, 1);
assert.deepEqual([hunted.degree, vex.system.currency.gp], ["excellent", 13], "Excellent: 8 gp + 25% = 10");
assert.equal(bountyProvider.isDone(bountyRows.find(row => row.id === "bountyhunter:contract.garrick-the-fence:alive"), vex), true, "One-time: both rows done");
await assert.rejects(craftLib.craft(vex, garrickKill.id, 1), /already done/);
const tuskKill = bountyRows.find(row => row.id === "bountyhunter:contract.old-tusk:kill");
rolls.push([1, 30]);
hunted = await craftLib.craft(vex, tuskKill.id, 1);
assert.deepEqual([hunted.degree, vexCount("Hunting Trap"), vexCount("Spear")], ["failed", 2, 1], "Natural 1: at-risk traps lost, spear kept");
rolls.push([20, 25]);
hunted = await craftLib.craft(vex, tuskKill.id, 1);
assert.ok(hunted.degree === "masterful" && ["Boar Head", "Beast Tusk"].includes(hunted.find) && vexCount(hunted.find) === 1, "Masterful: a rare find");
assert.equal(vex.system.currency.gp, 13 + 10, "8 gp + 25%");
// Timed pay.
settings.rules = { timed: true };
await abilities.longRest(vex);
rolls.push([12, 14]);
hunted = await craftLib.craft(vex, watchTask.id, 1);
assert.ok(hunted.job && vex.system.currency.gp === 23, "Paid after the hunt");
await refining.deliverDueJobs(vex, game.time.worldTime + 86400);
assert.equal(vex.system.currency.gp, 26, "Delivered with world time");
settings.rules = { timed: false };
// Contact letters and wanted notices.
const letter = await craftLib.makeScroll(bountyRows.find(row => row.id === "bountyhunter:contact.road-warden:kill").id);
assert.equal(letter.name, "Contact: Road Warden of the Mill Road");
const notice = await craftLib.makeScroll(bountyRows.find(row => row.id === "bountyhunter:contract.bellmakers-debt:alive").id);
assert.equal(notice.name, "Wanted: Osric Vane");
const [carriedLetter, carriedNotice] = await vex.createEmbeddedDocuments("Item", [letter.toObject(), notice.toObject()]);
assert.deepEqual(craftLib.carriedScrolls(vex, "bountyhunter").map(entry => entry.name).sort(), ["Contact: Road Warden of the Mill Road", "Wanted: Osric Vane"]);
await craftLib.learnFromScroll(carriedLetter);
await craftLib.learnFromScroll(carriedNotice);
assert.ok(state.knows(vex, "contact.road-warden") && state.knows(vex, "contract.bellmakers-debt"), "Letter → contact; notice → contract");
// Asking around: options, suggestion for the town, a generated contract.
let options = ask.askOptions(vex);
assert.ok(options.contacts.every(entry => entry.tier <= 1) && !options.contacts.some(entry => entry.id === "harbor-watch"), "Unmet contacts of a tier the hunter can take");
assert.deepEqual(options.contracts.map(entry => entry.id), ["north-road-deserter"], "Contracts not had or done");
assert.equal(ask.suggestResult(options, "Millbrook"), "contract:north-road-deserter", "A contract for this town first");
assert.match(ask.suggestResult(options, "Elsewhere"), /^contact:/, "Else an unmet contact");
const approval = ask.approvalHtml(vex, "bountyhunter", options, "Millbrook");
assert.match(approval, /optgroup label="Contacts \(repeatable work\)"/);
assert.match(approval, /value="generate:1"/);
await ask.requestAskAround(vex);
rolls.push([15, 19]);
let decided = await ask.handleAskRequest(vex, { allow: true, skill: "inv", dc: 15, town: "Millbrook", result: "generate:1" });
assert.ok(decided.success && decided.gained.generated, "A contract generated on the spot");
const generated = bountyLib.findContract(decided.gained.id);
assert.deepEqual([generated.town, generated.tier, generated.type, state.knows(vex, `contract.${generated.id}`)], ["Millbrook", 1, "alive", true], "Tier 1: retrieval, granted, saved");
assert.ok(generated.alive.gold >= 5 && generated.alive.gold <= 12, "Tier-1 contract gold 5–12");
await ask.requestAskAround(vex);
rolls.push([15, 19]);
decided = await ask.handleAskRequest(vex, { allow: true, skill: "per", dc: 12, town: "Saltmere", result: "contact:millbrook-reeve" });
assert.ok(state.knows(vex, "contact.millbrook-reeve"), "GM-chosen contact");
await ask.requestAskAround(vex);
assert.deepEqual(await ask.handleAskRequest(vex, { allow: false }), { allowed: false });
// Generator by tier and saving with validation.
let seed = 0.37;
const seeded = () => (seed = (seed * 9301 + 49297) % 233280 / 233280);
const t3 = bountyLib.generateContract(3, "Saltmere", seeded);
assert.equal(t3.type, "either", "Tier 3: dead or alive");
assert.ok(t3.alive.gold === null && t3.target && t3.brief.includes("Dead or alive"), "Generated either contracts use the configurable alive reward fallback");
const savedT3 = await bountyLib.saveContract(t3);
assert.ok(bountyLib.findContract(savedT3.id));
assert.equal(bountyLib.generateContract(5, "Varn", seeded).type, "kill", "Tier 5: kills");
await assert.rejects(bountyLib.saveContract({ ...t3, town: "" }), /Which town/);
await assert.rejects(bountyLib.saveContract({ ...t3, kill: { gold: 5, gear: [{ name: "Unicorn Horn", quantity: 1 }] } }), /no world Item is named "Unicorn Horn"/);
const contact = await bountyLib.saveContact({ name: "Fisher Lou", tier: 1, text: "Knows the river.", limit: { per: "day", count: 2 }, task: { title: "River Rats", type: "alive", days: 1, alive: { gold: 2, gear: [{ name: "Rope", quantity: 1, mode: "kept" }] } } });
assert.deepEqual([bountyLib.contacts().length, contact.limit], [16, { per: "day", count: 2 }]);
const fisherRow = recipes.professionRecipes("bountyhunter").find(row => row.contactId === contact.id);
assert.match(fisherRow.rewardText, /2× per day/);
// GM hub section renders.
bountyGm.resetBountyView();
if (process.env.CP_PREVIEW) {
  const fs = await import("node:fs");
  const css = ["../../gathering-professions/styles/module.css", "../styles/module.css"].map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8")).join(" ");
  const shell = body => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="http://localhost:30000/css/foundry2.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"><style>
    body{margin:0;background:#15121a;color:#efe6d8;font-size:14px}
    :root{--gp-gold:#d4a84a;--gp-ink:#efe6d8;--gp-edge:rgba(212,168,74,.25)} h3,h4,h5{font-family:inherit}
    ${css}</style></head><body class="theme-dark"><div class="gathering-professions-ui" style="width:860px;padding:12px">${body}</div></body></html>`;
  bountyGm.resetBountyView({ selected: bountyLib.contracts()[0].id });
  fs.writeFileSync(`${process.env.CP_PREVIEW}/bounties-contract.html`, shell(bountyGm.renderBounties()));
  bountyGm.resetBountyView({ tab: "contacts", selected: bountyLib.contacts()[0].id });
  fs.writeFileSync(`${process.env.CP_PREVIEW}/bounties-contact.html`, shell(bountyGm.renderBounties()));
  fs.writeFileSync(`${process.env.CP_PREVIEW}/bounties-editor.html`, shell(bountyGm.renderBounties().replace(/<section class="cp-b-panel">[\s\S]*<\/section>\s*<\/div>\s*<\/div>$/, `<section class="cp-b-panel">${bountyGm.editorHtml({ kind: "contract", id: "x", data: structuredClone(bountyLib.contracts().find(entry => entry.type === "either") ?? bountyLib.contracts()[0]) })}</section></div></div>`)));
  bountyGm.resetBountyView();
}
const bountyHtml = bountyGm.renderBounties();
assert.match(bountyHtml, /data-cb="generate"/);
assert.match(bountyHtml, /class="cp-b-split"/, "List and detail panel");
assert.match(bountyHtml, /Select a contract/, "Empty panel until one is picked");
assert.match(bountyHtml, /Saltmere/);
// Search and filters.
assert.ok(bountyGm.filteredEntries({ tab: "contracts", search: "garrick", tier: "", town: "", hideDone: false }).every(entry => /garrick/i.test(entry.title + entry.target)));
assert.ok(bountyGm.filteredEntries({ tab: "contracts", search: "", tier: "", town: "Saltmere", hideDone: false }).every(entry => entry.town === "Saltmere"));
assert.ok(bountyGm.filteredEntries({ tab: "contacts", search: "", tier: "1", town: "", hideDone: false }).every(entry => entry.tier === 1));
assert.deepEqual(bountyGm.filteredEntries({ tab: "contacts", search: "fisher", tier: "", town: "", hideDone: false }).map(entry => entry.name), ["Fisher Lou"]);
// Contacts tab with the new contact selected: details, grant, revoke, duplicate.
bountyGm.resetBountyView({ tab: "contacts", selected: contact.id });
let panelHtml = bountyGm.renderBounties();
assert.match(panelHtml, /Fisher Lou/);
assert.match(panelHtml, /data-cb="grant"/);
assert.match(panelHtml, /2× per day/);
const fakeRoot = (values = {}) => ({ querySelector: selector => { const key = Object.keys(values).find(k => selector.includes(k)); return key ? { value: values[key] } : null; }, querySelectorAll: () => [] });
const clickOn = async (cb, extra = {}, values = {}) => bountyGm.handleBountyClick({ target: { closest: () => ({ dataset: { cb, ...extra } }) }, preventDefault() {} }, fakeRoot(values), async () => {});
await clickOn("grant", {}, { "data-cb-grant": vex.id });
assert.ok((vex.getFlag("crafting-professions", "known") ?? []).includes(`contact.${contact.id}`), "Grant from the hub");
assert.match(bountyGm.renderBounties(), /Remove from Vex/);
await clickOn("revoke", { actor: vex.id });
assert.ok(!(vex.getFlag("crafting-professions", "known") ?? []).includes(`contact.${contact.id}`), "Revoke from the hub");
await clickOn("duplicate");
panelHtml = bountyGm.renderBounties();
assert.match(panelHtml, /New contact/);
assert.match(panelHtml, /value="Fisher Lou \(copy\)"/, "Duplicate opens a copy in the editor");
assert.match(panelHtml, /<h4>Basics<\/h4>[\s\S]*<h4>Reward and gear<\/h4>[\s\S]*<h4>Possible rare finds<\/h4>[\s\S]*<h4>Limits<\/h4>/, "Sectioned editor");
bountyGm.resetBountyView();
assert.match(bountyGm.editorHtml({ kind: "contract", id: null, data: t3 }), /name="kill.gear.0.name"/);
assert.equal(bountyGm.BOUNTY_HUB_SECTION.group, "Crafting Professions");
// Hunter's Pursuit: names the quarry, whispers the GM.
chat.length = 0;
rolls.push([14, 18]);
const pursuit = await abilities.useAbility(vex, "bountyhunter", { quarry: "Osric Vane" });
assert.equal(pursuit.success, true);
assert.ok(chat.some(message => message.whisper?.includes("gm") && String(message.content).includes("Osric Vane")), "GM told to narrate");
settings.rules = {};

// Deep-review regressions: delayed writes, retryable delivery, and real action gates.
const reviewActor = new Doc({ name: "Review Smith", type: "character", isOwner: true, hasPlayerOwner: true,
  system: { abilities: { str: { mod: 3 } }, attributes: { prof: 2 }, currency: { gp: 0 } }, items: [] }, null, "Actor");
actors.push(reviewActor);
await state.chooseProfession(reviewActor, "blacksmith");
await reviewActor.createEmbeddedDocuments("Item", [{ name: "Smith's Tools", type: "tool", system: { quantity: 1, type: { baseItem: "smith" } } },
  { name: "Copper Ingot", type: "loot", system: { quantity: 1 } }]);
settings.rules = { timed: false };
const nailsRow = recipes.professionRecipes("blacksmith").find(row => row.output === "Nails");
rolls.push([10, 12]);
const overlappingCrafts = await Promise.allSettled([craftLib.craft(reviewActor, nailsRow.id), craftLib.craft(reviewActor, nailsRow.id)]);
assert.equal(overlappingCrafts.filter(row => row.status === "fulfilled").length, 1, "Two clicks cannot spend one ingot twice");
assert.match(overlappingCrafts.find(row => row.status === "rejected").reason.message, /enough materials/);

const receipt = await refining.queueJob(reviewActor, { name: "Delivery Test", gold: 7, quantity: 1, ready: 0, data: { name: "Delivery Test", type: "loot", system: {} } });
const createReviewItems = reviewActor.createEmbeddedDocuments.bind(reviewActor);
reviewActor.createEmbeddedDocuments = async () => { throw new Error("injected item delivery failure"); };
await assert.rejects(refining.deliverDueJobs(reviewActor), /injected/);
assert.equal(reviewActor.system.currency.gp, 7);
assert.ok(refining.actorJobs(reviewActor).some(job => job.id === receipt.id), "A failed delivery retains its job");
reviewActor.createEmbeddedDocuments = createReviewItems;
await Promise.all([refining.deliverDueJobs(reviewActor), refining.deliverDueJobs(reviewActor)]);
assert.equal(reviewActor.system.currency.gp, 7, "Retry does not repeat a partially delivered gold reward");
assert.equal(reviewActor.items.filter(item => item.name === "Delivery Test").length, 1, "Concurrent collection delivers once");

const retainedJob = await refining.queueJob(reviewActor, { name: "Receipt Test", quantity: 1, ready: 0, data: { name: "Receipt Test", type: "loot", system: {} } });
const updateReviewActor = reviewActor.update.bind(reviewActor);
reviewActor.update = async changes => {
  if (Object.keys(changes).some(key => key.endsWith(`-=${retainedJob.id}`))) throw new Error("injected job removal failure");
  return updateReviewActor(changes);
};
await assert.rejects(refining.deliverDueJobs(reviewActor), /injected/);
reviewActor.update = updateReviewActor;
await refining.deliverDueJobs(reviewActor);
assert.equal(reviewActor.items.filter(item => item.name === "Receipt Test").length, 1, "Item receipt prevents a duplicate after job deletion fails");

await refining.addToInventory(reviewActor, { name: "Pending Gear", type: "weapon", flags: { "crafting-professions": { pendingPerk: "one" } } }, 1);
await refining.addToInventory(reviewActor, { name: "Pending Gear", type: "weapon", flags: { "crafting-professions": { pendingPerk: "two" } } }, 1);
assert.deepEqual(reviewActor.items.filter(item => item.name === "Pending Gear").map(item => item.flags["crafting-professions"].pendingPerk), ["one", "two"], "Same name cannot discard distinct perk tokens");
const nodes = await import("../../gathering-professions/scripts/nodes.js");
const originalPick = items.find(item => item.name === "Miner's Pick");
const craftedPick = { name: "Masterwork Miner's Pick", flags: { "gathering-professions": { toolSource: originalPick.uuid } } };
assert.equal(nodes.itemMatchesTool(craftedPick, { uuid: originalPick.uuid, name: originalPick.name }), true);
assert.equal(nodes.itemMatchesTool(craftedPick, { name: originalPick.name }), true, "Name-only requirements also recognize a renamed source tool");
originalPick.flags["gathering-professions"] = { defaultTool: "mining" };
assert.equal(nodes.itemMatchesTool({ name: "Legacy Masterwork Pick", flags: { "gathering-professions": { defaultTool: "mining" } } }, { uuid: originalPick.uuid }), true, "Previously crafted default tools retain identity");

const durability = await import("../../gathering-professions/scripts/durability.js");
const blankTool = { type: "tool", flags: { "gathering-professions": { durability: { max: null, value: null } } } };
assert.deepEqual([durability.toolDurability(blankTool).max, durability.toolDurability(blankTool).value], [10, 10]);
assert.deepEqual(abilities.durabilityOf(blankTool), { max: 10, value: 10 });
await assert.rejects(abilities.applyColdForge(smith, pick), /only repairs broken/);
assert.equal(pick.flags["gathering-professions"].durability.value, 10, "Cold Forge never damages a healthy tool");
await abilities.longRest(reviewActor);
const originalPicker = foundry.applications.api.DialogV2.wait;
foundry.applications.api.DialogV2.wait = async () => null;
assert.equal(await abilities.useAbility(reviewActor, "blacksmith"), null);
assert.equal(abilities.abilityUsed(reviewActor, "blacksmith"), false, "Canceled picker spends no ability");
foundry.applications.api.DialogV2.wait = originalPicker;
assert.equal(await abilities.useAbility(reviewActor, "blacksmith", { items: [] }), null, "No target spends no ability");
await state.setRank(reviewActor, "blacksmith", 3);
await state.setXp(reviewActor, "blacksmith", 450);
await state.setPath(reviewActor, "blacksmith", "wanderer");
const savedProfession = structuredClone(state.actorProfessions(reviewActor).blacksmith);
await state.removeProfession(reviewActor, "blacksmith");
await state.chooseProfession(reviewActor, "blacksmith");
assert.deepEqual(state.actorProfessions(reviewActor).blacksmith, savedProfession, "Retaking restores XP, rank, path and talents");

assert.throws(() => bountyLib.normalizeWork({ tier: 1, title: "Duplicate gear", type: "alive", alive: { gold: 1, gear: [
  { name: "Manacles", quantity: 1 }, { name: "Manacles", quantity: 2 }] } }), /duplicate items/);
assert.equal(refining.maxBatch(vex, { inputs: [["Manacles", 1], ["Manacles", 2]] }), 0, "Legacy duplicate requirements are also counted together");
const forbiddenHunter = new Doc({ name: "Untrained", type: "character", isOwner: true, items: [] }, null, "Actor");
await assert.rejects(craftLib.hunt(forbiddenHunter, watchTask), /Needs the Bounty Hunter/);
await assert.rejects(craftLib.hunt(vex, { ...watchTask, id: "forged", gold: 999999 }), /no longer exists/);
game.user.isGM = false;
await assert.rejects(craftLib.hunt(vex, fisherRow), /has not learned/);
game.user.isGM = true;
const aliveRows = bountyLib.bountyRows("bountyhunter", { ...rulesLib.craftingRules(), bounty: { ...rulesLib.craftingRules().bounty, aliveRewardFactor: 2 } });
assert.equal(aliveRows.find(row => row.contractId === savedT3.id && row.choice === "alive").gold, savedT3.kill.gold * 2);
assert.equal(aliveRows.find(row => row.contractId === "garrick-the-fence" && row.choice === "alive").gold, 12, "Explicit rewards remain unchanged");
const concurrentHunter = new Doc({ name: "Concurrent Hunter", type: "character", isOwner: true, items: [],
  system: { currency: { gp: 0 }, abilities: { int: { mod: 2 } }, skills: { inv: { total: 4 } } } }, null, "Actor");
actors.push(concurrentHunter);
await state.chooseProfession(concurrentHunter, "bountyhunter");
const oneTime = bountyRows.find(row => row.contractId === "bellmakers-debt");
await concurrentHunter.createEmbeddedDocuments("Item", oneTime.inputs.map(([name, quantity]) => ({ name, type: "loot", system: { quantity } })));
rolls.push([12, 14]);
const duplicateHunts = await Promise.allSettled([craftLib.hunt(concurrentHunter, oneTime), craftLib.hunt(concurrentHunter, oneTime)]);
assert.equal(duplicateHunts.filter(row => row.status === "fulfilled").length, 1);
assert.match(duplicateHunts.find(row => row.status === "rejected").reason.message, /already done/);
await concurrentHunter.createEmbeddedDocuments("Item", watchTask.inputs.map(([name, quantity]) => ({ name, type: "loot", system: { quantity } })));
rolls.push([12, 14]);
const duplicateTasks = await Promise.allSettled([craftLib.hunt(concurrentHunter, watchTask), craftLib.hunt(concurrentHunter, watchTask)]);
assert.equal(duplicateTasks.filter(row => row.status === "fulfilled").length, 1);
assert.match(duplicateTasks.find(row => row.status === "rejected").reason.message, /Done until a long rest/);
settings.rules = { timed: false, knowledgeMode: "party" };
const sharedContract = await bountyLib.saveContract({ ...t3, id: "party-race", tier: 1, type: "kill", kill: { gold: 5, gear: [{ name: "Dagger", quantity: 1, mode: "kept" }] } });
const sharedRow = bountyLib.bountyRows().find(row => row.contractId === sharedContract.id);
const secondHunter = new Doc({ name: "Second Hunter", type: "character", isOwner: true, hasPlayerOwner: true, items: [],
  system: { abilities: { int: { mod: 2 } }, skills: { inv: { total: 4 } } } }, null, "Actor");
concurrentHunter.hasPlayerOwner = true;
actors.push(secondHunter);
await state.chooseProfession(secondHunter, "bountyhunter");
for (const hunter of [concurrentHunter, secondHunter]) await hunter.createEmbeddedDocuments("Item", [{ name: "Dagger", type: "weapon", system: { quantity: 1 } }]);
rolls.push([12, 14]);
const sharedHunts = await Promise.allSettled([craftLib.hunt(concurrentHunter, sharedRow), craftLib.hunt(secondHunter, sharedRow)]);
assert.equal(sharedHunts.filter(row => row.status === "fulfilled").length, 1, "Party-wide one-time eligibility is locked across different characters");
assert.match(sharedHunts.find(row => row.status === "rejected").reason.message, /already done/);
settings.rules = { timed: false };

const letterActor = new Doc({ name: "Letter Reader", type: "character", isOwner: true, items: [] }, null, "Actor");
actors.push(letterActor);
await state.chooseProfession(letterActor, "bountyhunter");
const [headerLetter, headerNotice] = await letterActor.createEmbeddedDocuments("Item", [letter.toObject(), notice.toObject()]);
const letterControls = [];
hooks.get("getHeaderControlsItemSheet5e")({ document: headerLetter }, letterControls);
assert.equal(letterControls[0].label, "Learn Job");
await letterControls[0].onClick();
assert.ok(state.knows(letterActor, "contact.road-warden") && !letterActor.items.includes(headerLetter));
assert.equal(hooks.get("dnd5e.preDisplayCard")(headerNotice), false, "Using a wanted notice invokes learning, not an item card");
await new Promise(resolve => setTimeout(resolve, 200));
assert.ok(state.knows(letterActor, "contract.bellmakers-debt") && !letterActor.items.includes(headerNotice));
const registry = await import("../../gathering-professions/scripts/recipe-registry.js");
const recipesUi = await import("../../gathering-professions/scripts/recipes-ui.js");
registry.registerRecipeProvider(bountyProvider);
assert.ok(recipesUi.buildRecipesModel(letterActor, { tab: "bountyhunter", isGM: true, search: "Garrick" }).products.length, "Search includes named quarry and bounty titles");
assert.equal(rolls.length, 0, "Every expected roll consumed exactly once");
// Cooking: works like the Blacksmith; products are meals eaten from the inventory.
{
  settings.rules = { timed: false };
  for (const name of ["Tea", "Nettle Soup", "Jerky", "Bone Broth", "Green Salad", "Meat Of The Hunt", "Skewers", "Acorn Bread", "Vegetable Soup",
    "Dried Chamomile", "Dried Wild Mint", "Dried Clover", "Nettle", "Chicken Bones", "Rock Salt", "Beast Flesh", "Dandelion", "Wild Mint", "Split Bamboo", "Acorns", "Chicken Egg", "Potato", "Cook's Utensils"]) {
    if (!items.some(item => item.name === name)) await worldItem(name, "consumable", { activities: { use: { type: "utility" } } });
  }
  const cooking = recipes.professionRecipes("cook");
  assert.equal(cooking.length, 10, "9 dishes; Tea has two recipes");
  const cook = new Doc({ name: "Hilde", type: "character", hasPlayerOwner: true, isOwner: true,
    system: { abilities: { wis: { mod: 3 }, con: { mod: 1 } }, attributes: { prof: 2, hp: { value: 5, max: 12, temp: 0 }, exhaustion: 2 }, tools: { cook: { value: 1 } }, skills: { med: { total: 5 } } }, items: [] }, null, "Actor");
  actors.push(cook);
  await state.chooseProfession(cook, "cook", { path: "standard" });
  const known = cooking.filter(row => state.knows(cook, row.id)).map(row => row.output);
  assert.deepEqual([...new Set(known)].sort(), ["Jerky", "Nettle Soup", "Tea"], "Starters: Tea (both recipes), Nettle Soup, Jerky");
  const teaRow = cooking.find(row => row.output === "Tea" && row.inputs[0][0] === "Dried Chamomile");
  assert.equal(craftLib.blockedReason(cook, teaRow), "Needs Cook's Utensils");
  await cook.createEmbeddedDocuments("Item", [{ name: "Cook's Utensils", type: "tool", system: { type: { baseItem: "cook" }, quantity: 1 } },
    { name: "Dried Chamomile", type: "loot", system: { quantity: 5 } }, { name: "Nettle", type: "loot", system: { quantity: 8 } },
    { name: "Chicken Bones", type: "loot", system: { quantity: 6 } }, { name: "Rock Salt", type: "loot", system: { quantity: 6 } }]);
  assert.deepEqual([craftLib.checkFor(cook, teaRow).modifier, craftLib.checkFor(cook, teaRow).die], [5, 4], "Wisdom 3 + proficiency 2 + d4");
  const cookCount = name => cook.items.filter(item => item.name === name).reduce((sum, item) => sum + (item.system.quantity ?? 0), 0);
  rolls.push([10, 12]);
  let cooked = await craftLib.craft(cook, teaRow.id, 1);
  const tea = cook.items.find(item => item.name === "Tea");
  assert.deepEqual([cooked.made, tea.flags["crafting-professions"].meal.kind, tea.flags["crafting-professions"].meal.ability, tea.system.activities], [3, "advantage", "wis", {}], "3 Tea; advantage on a Wisdom save; no activities");
  rolls.push([12, 16]);
  cooked = await craftLib.craft(cook, teaRow.id, 1);
  assert.equal(cooked.made, 4, "Excellent: +1 serving");
  const soupRow = cooking.find(row => row.output === "Nettle Soup");
  rolls.push([20, 25]);
  cooked = await craftLib.craft(cook, soupRow.id, 1);
  const exquisite = cook.items.find(item => item.name === "Exquisite Nettle Soup");
  assert.deepEqual([cooked.degree, Boolean(exquisite), exquisite?.flags["crafting-professions"].meal.amount, exquisite?.system.price.value], ["masterful", true, 6, 2], "Masterful: Exquisite, double temp HP and value");
  assert.match(exquisite.system.description.value, /When eaten:/);
  // Eating: temp HP, then a timed effect that replaces the previous meal effect.
  await meals.eatMeal(exquisite);
  assert.equal(cook.system.attributes.hp.temp, 6);
  assert.equal(cookCount("Exquisite Nettle Soup"), 3, "One serving eaten");
  await meals.eatMeal(tea);
  assert.equal(cook.effects.length, 1);
  assert.deepEqual(cook.effects[0].changes, [{ key: "system.abilities.wis.save.roll.mode", mode: 2, value: "1" }]);
  const [skewers] = await cook.createEmbeddedDocuments("Item", [meals.stampMeal({ name: "Skewers", type: "consumable", system: { quantity: 1, price: { value: 1 } }, flags: {} }, "Skewers")]);
  await meals.eatMeal(skewers);
  assert.deepEqual([cook.effects.length, cook.effects[0].changes[0].key, cook.effects[0].duration.seconds], [1, "system.attributes.movement.bonus", 3600], "A new meal replaces the old effect");
  const [broth] = await cook.createEmbeddedDocuments("Item", [meals.stampMeal({ name: "Bone Broth", type: "consumable", system: { quantity: 1 }, flags: {} }, "Bone Broth")]);
  rolls.push([3, 3]);
  await meals.eatMeal(broth);
  assert.equal(cook.system.attributes.hp.value, 8, "Bone Broth heals 1d4");
  assert.equal(meals.describeMeal(meals.exquisiteMeal(meals.MEALS["Skewers"])), "+10 ft speed for 2 hours");
  // Hearthcraft and The Empty Pot.
  rolls.push([12, 18]);
  const hearth = await abilities.useAbility(cook, "cook", { items: [cook, vex] });
  assert.ok(hearth.success && vex.effects?.some(effect => effect.name === "Hearth-fed"), "Hearthcraft: Hearth-fed for 24 hours");
  await state.setPath(cook, "cook", "wanderer");
  await abilities.longRest(cook);
  rolls.push([12, 18]);
  await abilities.useAbility(cook, "cook", { items: [cook] });
  assert.equal(cook.system.attributes.exhaustion, 1, "The Empty Pot removes one level of exhaustion");
  await state.chooseTalent(cook, "cook", "subtle-seasoning");
  assert.deepEqual(abilities.talentsForRoll(cook, { skill: "ins" }).map(entry => entry.name), ["Subtle Seasoning"]);
  const cookProvider = craftingProvider("cook", recipesHelpers);
  assert.equal(cookProvider.label, "Cook");
  const cookingGm = await import("../scripts/cooking-gm.js");
  assert.doesNotMatch(renderGm(), /cookMasterfulExquisite|cp-gm-meals/, "Cooking settings left the Rules section");
  assert.deepEqual([HUB_SECTION.label, cookingGm.COOKING_HUB_SECTION.id, cookingGm.COOKING_HUB_SECTION.label, cookingGm.COOKING_HUB_SECTION.group], ["Rules", "cooking", "Cooking", "Crafting Professions"]);
  assert.ok(cookingGm.COOKING_HUB_SECTION.order > HUB_SECTION.order && cookingGm.COOKING_HUB_SECTION.order < bountyGm.BOUNTY_HUB_SECTION.order, "Rules, Cooking, Bounties");
  const cookingHtml = cookingGm.COOKING_HUB_SECTION.render();
  assert.match(cookingHtml, /name="cookMasterfulExquisite"/);
  assert.match(cookingHtml, /class="cp-gm-meals"/);
  assert.match(cookingHtml, /data-cp-cook="save-rules"/);
  // Meal effects editor (GM hub): world setting mealEffects, else the defaults.
  const gmEditor = cookingGm;
  const sender = game.user; game.user = { id: "gm", isGM: true };
  assert.equal(meals.mealList().length, 9, "Defaults until the GM saves");
  assert.throws(() => meals.normalizeMeal({ dish: "Stew", kind: "heal", formula: "rm -rf" }), /dice formula/);
  assert.throws(() => meals.normalizeMeal({ dish: "Stew", kind: "speed", amount: 3, minutes: 60 }), /from 5 to 120/);
  assert.throws(() => meals.normalizeMeal({ dish: "Stew", kind: "advantage", ability: "luck", minutes: 60 }), /choose an ability/);
  assert.deepEqual(meals.normalizeMeal({ dish: " Stew ", kind: "tempHp", amount: "4", formula: "1d4", ability: "wis", minutes: 30 }), { dish: "Stew", kind: "tempHp", amount: 4 }, "Only the kind's own fields are kept");
  const edited = meals.mealList().filter(entry => entry.dish !== "Jerky").map(entry => entry.dish === "Nettle Soup" ? { dish: "Nettle Soup", kind: "speed", amount: 10, minutes: 30 } : entry);
  await assert.rejects(meals.saveMeals([...edited, { dish: "Tea", kind: "tempHp", amount: 1 }]), /only one effect/);
  await meals.saveMeals([...edited, { dish: "Hunter's Stew", kind: "heal", formula: "2d4+2" }]);
  assert.deepEqual([meals.mealFor("Jerky"), meals.mealFor("Nettle Soup"), meals.mealFor("Hunter's Stew")],
    [null, { kind: "speed", amount: 10, minutes: 30 }, { kind: "heal", formula: "2d4+2" }], "Saved effects replace the defaults; removed dishes have none");
  assert.equal(meals.MEALS["Nettle Soup"].kind, "speed", "MEALS is a live view of the table");
  const fresh = meals.stampMeal({ name: "Nettle Soup", system: { description: { value: "<p>Soup.</p>" } }, flags: {} }, "Nettle Soup");
  assert.equal(fresh.flags["crafting-professions"].meal.kind, "speed");
  const plainJerky = meals.stampMeal({ name: "Jerky", system: {}, flags: {} }, "Jerky");
  assert.equal(plainJerky.flags["crafting-professions"], undefined, "A dish without an effect is ordinary food");
  // Already cooked: the Exquisite Nettle Soup keeps Exquisite and gets the new (doubled) effect, one description line.
  const updatedCount = await meals.refreshCookedMeals();
  const cookedSoup = cook.items.find(item => item.name === "Exquisite Nettle Soup");
  assert.ok(updatedCount >= 1);
  assert.deepEqual(cookedSoup.flags["crafting-professions"].meal, { kind: "speed", amount: 20, minutes: 60, exquisite: true, dish: "Nettle Soup" });
  assert.equal(cookedSoup.system.description.value.match(/When eaten:/g).length, 1);
  assert.match(cookedSoup.system.description.value, /\+20 ft speed for 1 hour/);
  assert.equal(await meals.refreshCookedMeals(), 0, "Nothing to change the second time");
  // Hub card: rows, kind-specific fields, read back from the form.
  const html = gmEditor.renderMeals();
  assert.match(html, /name="mealKind0"/);
  assert.match(html, /data-cp-cook="save-meals"/);
  assert.match(html, /No effect yet: Jerky/);
  const soupIndex = meals.mealList().findIndex(entry => entry.dish === "Nettle Soup");
  assert.match(html, new RegExp(`name="mealAmount${soupIndex}" value="10"`));
  assert.doesNotMatch(html, new RegExp(`name="mealFormula${soupIndex}"`), "Speed rows have no healing field");
  const inputs = [...html.matchAll(/<(input|select)[^>]*name="(meal\w+?)(\d+)"[^>]*>/g)].map(([tag, kind, name, index]) => {
    const value = kind === "select" ? (html.slice(html.indexOf(tag)).match(/<option value="([^"]*)" selected/) ?? [])[1] : (tag.match(/value="([^"]*)"/) ?? [])[1];
    return { name: name + index, value: (value ?? "").replace(/&#39;/g, "'"), checked: /checked/.test(tag) };
  });
  const rowIndexes = [...new Set(inputs.map(input => input.name.match(/\d+$/)[0]))];
  const fakeForm = { querySelector: selector => inputs.find(input => selector === `[name="${input.name}"]`) ?? null,
    querySelectorAll: () => rowIndexes.map(index => ({ dataset: { mealRow: index } })) };
  const readBack = gmEditor.readMeals(fakeForm);
  assert.deepEqual(readBack.map(meals.normalizeMeal), meals.mealList(), "The form reads back to the saved table");
  await meals.resetMeals();
  assert.equal(meals.mealFor("Jerky").kind, "tempHp", "Reset restores the defaults");
  game.user = sender;
  settings.rules = {};
}

console.log("PASS: crafting (incl. cooking: recipes, meals, Exquisite, eating, Hearthcraft, The Empty Pot) and deep-review regressions — guarded/concurrent actions, retry-safe delivery, unique gear, tool identity, durability defaults, retirement restore, canceled abilities, duplicate gear, scroll hooks, bounty search and reward fallback.");
