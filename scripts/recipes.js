// Crafting recipes: module data per profession, plus the GM's edits and own
// recipes (world settings "recipeEdits" and "customRecipes"). Products and
// ingredients are world Items matched by name; prepareItems() imports them.
import { MODULE_ID, CRAFTING_PROFESSIONS } from "./professions.js";
import { bountyRows, bountyItemNames } from "./contacts.js";
import { CUSTOM_ITEMS, customItemData } from "./customitems.js";

const KCTG = "kctg-5e.kctg-dnd5e";
const PHB = "dnd5e.equipment24";
const slug = text => String(text).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const recipe = (tier, output, quantity, inputs) => Object.freeze({ tier, output, quantity, inputs: Object.freeze(inputs.map(row => Object.freeze(row))) });

export const RECIPES = Object.freeze({
  blacksmith: Object.freeze([
    recipe(1, "Nails", 10, [["Copper Ingot", 1]]),
    recipe(1, "Horseshoe", 2, [["Copper Ingot", 1], ["Coke", 1]]),
    recipe(1, "Caltrops", 1, [["Copper Ingot", 1]]),
    recipe(1, "Dagger", 1, [["Copper Ingot", 1], ["Cured Hide", 1]]),
    recipe(1, "Sickle", 1, [["Copper Ingot", 1], ["Cedar Plank", 1]]),
    recipe(1, "Light Hammer", 1, [["Copper Ingot", 1], ["Pine Plank", 1]]),
    recipe(1, "Handaxe", 1, [["Copper Ingot", 2], ["Cedar Plank", 1]]),
    recipe(1, "Spear", 1, [["Copper Ingot", 1], ["Split Bamboo", 2]]),
    recipe(1, "Arrows", 20, [["Copper Ingot", 1], ["Split Bamboo", 2], ["Fletching Feathers", 1]]),
    recipe(1, "Bolts", 20, [["Copper Ingot", 1], ["Pine Plank", 1], ["Fletching Feathers", 1]]),
    recipe(1, "Miner's Pick", 1, [["Copper Ingot", 2], ["Cedar Plank", 1]]),
    recipe(1, "Herbalism Sickle", 1, [["Copper Ingot", 1], ["Cedar Plank", 1]]),
    recipe(1, "Woodcutter's Axe", 1, [["Copper Ingot", 2], ["Pine Plank", 1]]),
    recipe(1, "Skinning Knife", 1, [["Copper Ingot", 1], ["Cured Hide", 1]]),
    recipe(1, "Chisel", 1, [["Copper Ingot", 1], ["Pine Plank", 1]]),
    recipe(1, "Flat Tongs", 1, [["Copper Ingot", 1], ["Pine Plank", 1]])
  ]),
  // Mostly gathered or refined ingredients (herbalism, skinning, mining, logging);
  // only eggs and potatoes are bought. Effects when eaten: meals.js.
  cook: Object.freeze([
    recipe(1, "Tea", 3, [["Dried Chamomile", 1]]),
    recipe(1, "Tea", 3, [["Dried Wild Mint", 1]]),
    recipe(1, "Nettle Soup", 4, [["Nettle", 2], ["Chicken Bones", 1], ["Rock Salt", 1]]),
    recipe(1, "Jerky", 4, [["Beast Flesh", 2], ["Rock Salt", 1]]),
    recipe(1, "Bone Broth", 4, [["Chicken Bones", 2], ["Dried Clover", 1], ["Rock Salt", 1]]),
    recipe(1, "Green Salad", 2, [["Dandelion", 1], ["Wild Mint", 1]]),
    recipe(1, "Meat Of The Hunt", 2, [["Beast Flesh", 2], ["Dried Wild Mint", 1], ["Rock Salt", 1]]),
    recipe(1, "Skewers", 3, [["Beast Flesh", 1], ["Dandelion", 1], ["Split Bamboo", 1]]),
    recipe(1, "Acorn Bread", 3, [["Acorns", 3], ["Rock Salt", 1], ["Chicken Egg", 1]]),
    recipe(1, "Vegetable Soup", 4, [["Potato", 2], ["Nettle", 1], ["Rock Salt", 1]])
  ])
});

// Where products come from when the world has no Item with that name. Gathering
// tools are built by Gathering Professions (api.tools.buildDefaults).
export const SOURCES = Object.freeze({
  "Nails": { pack: KCTG }, "Horseshoe": { pack: KCTG }, "Chisel": { pack: KCTG }, "Flat Tongs": { pack: KCTG },
  "Caltrops": { pack: PHB, id: "phbagCaltrops000" }, "Dagger": { pack: PHB, id: "phbwepDagger0000" }, "Sickle": { pack: PHB, id: "phbwepSickle0000" },
  "Light Hammer": { pack: PHB, id: "phbwepLightHamme" }, "Handaxe": { pack: PHB, id: "phbwepHandaxe000" }, "Spear": { pack: PHB, id: "phbwepSpear00000" },
  "Arrows": { pack: PHB, id: "phbamoArrows0000" }, "Bolts": { pack: PHB, id: "phbamoBolts00000" }, "Smith's Tools": { pack: PHB, id: "phbtulSmithsTool" },
  "Miner's Pick": { gatheringTool: true }, "Herbalism Sickle": { gatheringTool: true }, "Woodcutter's Axe": { gatheringTool: true }, "Skinning Knife": { gatheringTool: true },
  // Bounty gear and finds.
  "Manacles": { pack: PHB, id: "phbagManacles000" }, "Rope": { pack: PHB, id: "phbagRope0000000" }, "Hunting Trap": { pack: PHB, id: "phbagHuntingTrap" },
  "Torch": { pack: PHB, id: "phbagTorch000000" }, "Rations": { pack: PHB, id: "phbagRations0000" }, "Sleep Tincture": { pack: KCTG },
  "Gold Key": { pack: KCTG }, "Agate Ring": { pack: KCTG }, "Faded Map": { pack: KCTG }, "Bone Dice": { pack: KCTG }, "Silver Ring": { pack: KCTG },
  "Letter From A Loved One": { pack: KCTG }, "Faction Earrings": { pack: KCTG }, "Unknown Letter": { pack: KCTG }, "Moldavite Ring": { pack: KCTG },
  "Gem Encrusted Polyhedral Dice": { pack: KCTG }, "Boar Head": { pack: KCTG }, "Beast Tusk": { pack: "helianas-harvest-compendium.beast" },
  "Net": { pack: PHB, id: "phbagNet00000000" }, "Chain": { pack: PHB, id: "phbagChain000000" }, "Sack": { pack: PHB, id: "phbagSack0000000" },
  "Alchemist's Fire": { pack: PHB, id: "phbagAlchemistsF" }, "Antitoxin": { pack: PHB, id: "phbagAntitoxin00" }, "Holy Water": { pack: PHB, id: "phbagHolyWater00" },
  "Skull Ring": { pack: KCTG }, "Pearl Earrings": { pack: KCTG }, "Jasper Ring": { pack: KCTG }, "Royal Signet": { pack: KCTG }, "Amethyst": { pack: KCTG },
  "Winged Pharaoh Necklace Piece": { pack: KCTG }, "Darkness Eye": { pack: KCTG }, "Silver Blue Spinel Ring": { pack: KCTG }, "Aquamarine": { pack: KCTG },
  "Topaz": { pack: KCTG }, "Fangs Necklace": { pack: KCTG }, "Opal Earrings": { pack: KCTG }, "Blue-White Diamond": { pack: KCTG }, "Red Topaz": { pack: KCTG },
  "Dragon's Heart": { pack: KCTG },
  // Cooking: Kris dishes and bought ingredients, Cook's Utensils.
  "Cook's Utensils": { pack: PHB, id: "phbtulCooksUtens" }, "Tea": { pack: KCTG }, "Jerky": { pack: KCTG }, "Green Salad": { pack: KCTG },
  "Meat Of The Hunt": { pack: KCTG }, "Skewers": { pack: KCTG }, "Vegetable Soup": { pack: KCTG }, "Potato": { pack: KCTG }, "Chicken Egg": { pack: KCTG },
  "Rock Salt": { pack: KCTG }
});

function setting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key) ?? fallback; } catch { return fallback; }
}
const plain = value => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
export const recipeEdits = () => plain(setting("recipeEdits", {}));
export const customRecipes = () => (Array.isArray(setting("customRecipes", [])) ? setting("customRecipes", []) : []);

const withId = (profession, entry) => ({ ...entry, profession, inputs: entry.inputs.map(([name, quantity]) => [name, quantity]),
  id: `${profession}:${slug(entry.output)}:${entry.inputs.map(([name, quantity]) => `${quantity}-${slug(name)}`).join("+")}` });

function applyEdit(row, edit) {
  if (!edit) return row;
  const next = { ...row, edited: true };
  for (const key of ["tier", "output", "quantity", "minutes"]) if (edit[key] !== undefined) next[key] = edit[key];
  if (Array.isArray(edit.inputs)) next.inputs = edit.inputs.map(([name, quantity]) => [name, quantity]);
  if (edit.disabled) next.disabled = true;
  return next;
}

/** A profession's recipes: built-ins with GM edits, then the GM's own. */
export function professionRecipes(profession, { includeDisabled = false } = {}) {
  if (!CRAFTING_PROFESSIONS[profession]) return [];
  // Bounty Hunter: contacts' tasks and contracts (contacts.js; edited in the hub's Bounties section).
  if (CRAFTING_PROFESSIONS[profession].kind === "bounty") return bountyRows(profession);
  const edits = recipeEdits();
  const base = (RECIPES[profession] ?? []).map(row => withId(profession, row)).map(row => applyEdit(row, edits[row.id]));
  const custom = customRecipes().filter(row => row?.profession === profession).map(row => ({ ...row, inputs: row.inputs.map(([name, quantity]) => [name, quantity]), custom: true }));
  return [...base, ...custom].filter(row => includeDisabled || !row.disabled);
}

export function findRecipe(id, options = {}) {
  return professionRecipes(String(id).split(":")[0], options).find(row => row.id === id) ?? null;
}

/** Ids a character learns when taking up the profession (recipe ids, or job ids for bounties). */
export function starterIds(profession) {
  const names = CRAFTING_PROFESSIONS[profession]?.starter ?? [];
  if (CRAFTING_PROFESSIONS[profession]?.kind === "bounty") return [...names];
  return professionRecipes(profession).filter(row => names.includes(row.output)).map(row => row.id);
}

/** The id a recipe is learned under (a bounty job covers its kill and alive rows). */
export const learnIdOf = row => row?.learnId ?? row?.id;

/* GM editing (same rules as Gathering Professions' refining editor) */

const requireGM = () => { if (!game.user.isGM) throw new Error("Only the GM may change recipes."); };
const exists = name => Array.from(game.items ?? []).some(item => item.name === name);

export function normalizeRecipeFields({ profession, tier, output, quantity, inputs, minutes = null }) {
  if (!CRAFTING_PROFESSIONS[profession]) throw new Error("Choose a crafting profession.");
  const level = Number(tier);
  if (!Number.isInteger(level) || level < 1 || level > 5) throw new Error("Tier must be 1 to 5.");
  const product = String(output ?? "").trim();
  if (!product) throw new Error("Choose the product Item.");
  if (!exists(product)) throw new Error(`No world Item is named "${product}". Drag the product from the Items sidebar.`);
  const made = Number(quantity);
  if (!Number.isInteger(made) || made < 1 || made > 99) throw new Error("Product quantity must be a whole number from 1 to 99.");
  const rows = (inputs ?? []).map(([name, count]) => [String(name ?? "").trim(), Number(count)]).filter(([name]) => name);
  if (!rows.length) throw new Error("Add at least one ingredient.");
  if (rows.length > 6) throw new Error("A recipe can have at most 6 ingredients.");
  for (const [name, count] of rows) {
    if (!exists(name)) throw new Error(`No world Item is named "${name}". Drag ingredients from the Items sidebar.`);
    if (!Number.isInteger(count) || count < 1 || count > 99) throw new Error(`${name}: quantity must be a whole number from 1 to 99.`);
  }
  if (new Set(rows.map(([name]) => name)).size !== rows.length) throw new Error("List each ingredient once.");
  if (rows.some(([name]) => name === product)) throw new Error("A recipe cannot use its own product.");
  let time = null;
  if (minutes !== null && minutes !== undefined && String(minutes).trim() !== "") {
    time = Number(minutes);
    if (!Number.isInteger(time) || time < 0 || time > 10080) throw new Error("Time must be whole minutes from 0 to 10080, or blank for the tier default.");
  }
  return { profession, tier: level, output: product, quantity: made, inputs: rows, minutes: time };
}

async function shareProduct(name) {
  const item = Array.from(game.items ?? []).find(entry => entry.name === name);
  const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  if (item && (item.ownership?.default ?? 0) < observer) await item.update({ "ownership.default": observer });
}

export async function createRecipe(fields) {
  requireGM();
  const data = normalizeRecipeFields(fields);
  const row = { id: `${data.profession}:custom-${foundry.utils.randomID()}`, ...data };
  await game.settings.set(MODULE_ID, "customRecipes", [...customRecipes(), row]);
  await shareProduct(data.output);
  return row;
}

export async function updateRecipe(id, fields) {
  requireGM();
  const current = findRecipe(id, { includeDisabled: true });
  if (!current) throw new Error("That recipe no longer exists.");
  const data = normalizeRecipeFields({ ...fields, profession: current.profession });
  if (current.custom) await game.settings.set(MODULE_ID, "customRecipes", customRecipes().map(row => (row.id === id ? { ...row, ...data } : row)));
  else {
    const edits = recipeEdits();
    await game.settings.set(MODULE_ID, "recipeEdits", { ...edits, [id]: { ...(edits[id] ?? {}), tier: data.tier, output: data.output, quantity: data.quantity, inputs: data.inputs, minutes: data.minutes } });
  }
  await shareProduct(data.output);
}

export async function setRecipeDisabled(id, disabled = true) {
  requireGM();
  const current = findRecipe(id, { includeDisabled: true });
  if (!current || current.custom) throw new Error("Only built-in recipes can be disabled; delete your own recipes instead.");
  const edits = { ...recipeEdits() };
  const edit = { ...(edits[id] ?? {}) };
  if (disabled) edit.disabled = true; else delete edit.disabled;
  if (Object.keys(edit).length) edits[id] = edit; else delete edits[id];
  await game.settings.set(MODULE_ID, "recipeEdits", edits);
}

export async function resetRecipe(id) {
  requireGM();
  const edits = { ...recipeEdits() };
  delete edits[id];
  await game.settings.set(MODULE_ID, "recipeEdits", edits);
}

export async function deleteRecipe(id) {
  requireGM();
  if (!customRecipes().some(row => row.id === id)) throw new Error("Only your own recipes can be deleted.");
  await game.settings.set(MODULE_ID, "customRecipes", customRecipes().filter(row => row.id !== id));
}

/* World Items */

async function folderPath(names) {
  let parent = null;
  for (const name of names) {
    let folder = Array.from(game.folders ?? []).find(entry => entry.type === "Item" && entry.name === name && (entry.folder?.id ?? entry.folder ?? null) === (parent?.id ?? null));
    folder ??= await Folder.implementation.create({ name, type: "Item", folder: parent?.id ?? null });
    parent = folder;
  }
  return parent;
}

/**
 * GM: make sure every product (and Smith's Tools) exists as a world Item that
 * players can see. Ingredients come from Gathering Professions' refining.
 * @returns {Promise<{imported: number, shared: number, missing: string[]}>}
 */
/** The crafting profession an item belongs to (who makes it, uses it as a tool, or needs it), for its folder. */
export function itemProfession(name) {
  for (const [key, profession] of Object.entries(CRAFTING_PROFESSIONS)) {
    if (profession.kind !== "bounty" && professionRecipes(key, { includeDisabled: true }).some(row => row.output === name)) return profession;
  }
  for (const profession of Object.values(CRAFTING_PROFESSIONS)) if (profession.tool?.name === name) return profession;
  if (bountyItemNames().includes(name)) return Object.values(CRAFTING_PROFESSIONS).find(profession => profession.kind === "bounty") ?? null;
  for (const [key, profession] of Object.entries(CRAFTING_PROFESSIONS)) {
    if (professionRecipes(key, { includeDisabled: true }).some(row => row.inputs.some(([input]) => input === name))) return profession;
  }
  return null;
}

/** Folder path for a crafting item: Crafting / <Profession>. */
export const itemFolderNames = name => ["Crafting", itemProfession(name)?.label ?? "Products"];

export async function prepareItems() {
  if (!game.user.isGM) throw new Error("Only the GM may prepare crafting items.");
  const report = { imported: 0, shared: 0, missing: [] };
  const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  const gp = game.modules.get("gathering-professions")?.api;
  const names = new Set(Object.keys(CRAFTING_PROFESSIONS).filter(key => CRAFTING_PROFESSIONS[key].kind !== "bounty")
    .flatMap(key => professionRecipes(key, { includeDisabled: true }).map(row => row.output)));
  for (const profession of Object.values(CRAFTING_PROFESSIONS)) if (profession.tool) names.add(profession.tool.name);
  for (const name of bountyItemNames()) names.add(name);
  // Bought cooking ingredients (gathered and refined ones come from Gathering Professions).
  for (const name of ["Potato", "Chicken Egg"]) names.add(name);
  if ([...names].some(name => SOURCES[name]?.gatheringTool && !exists(name))) await gp?.tools?.buildDefaults?.();
  for (const name of names) {
    let item = Array.from(game.items ?? []).find(entry => entry.name === name);
    const source = SOURCES[name];
    if (!item && CUSTOM_ITEMS[name]) {
      [item] = await Item.implementation.create([customItemData(name, (await folderPath(itemFolderNames(name))).id)]);
      report.imported++;
    }
    if (!item && source?.pack) {
      const pack = game.packs.get(source.pack);
      const id = source.id ?? Array.from(await pack?.getIndex() ?? []).find(row => row.name === name)?._id;
      const document = id ? await pack?.getDocument(id) : null;
      if (document) {
        const data = document.toObject();
        delete data._id;
        data.folder = (await folderPath(itemFolderNames(name))).id;
        data.ownership = { default: observer };
        foundry.utils.setProperty(data, "_stats.compendiumSource", document.uuid);
        [item] = await Item.implementation.create([data]);
        report.imported++;
      }
    }
    if (!item) { report.missing.push(name); continue; }
    if ((item.ownership?.default ?? 0) < observer) { await item.update({ "ownership.default": observer }); report.shared++; }
  }
  return report;
}

export { folderPath };
