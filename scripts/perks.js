// Item perks granted by great crafting results. The GM edits the list (world
// setting "perks"); each perk fits item kinds and may change the item's data.
import { MODULE_ID } from "./professions.js";

const perk = (name, fits, description, effects = {}) => Object.freeze({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, fits, description, effects: Object.freeze(effects) });

export const DEFAULT_PERKS = Object.freeze([
  perk("Keen", "weapon", "A wicked, lasting edge: +1 damage.", { damage: 1 }),
  perk("Balanced", "weapon", "Perfectly weighted: +1 to attack rolls (applied by the GM).", {}),
  perk("Reinforced", "armour", "Extra plates and rivets: +1 AC.", { ac: 1 }),
  perk("Light", "any", "Expertly thinned without losing strength: half weight.", { weight: 0.5 }),
  perk("Ornate", "any", "Engraved and inlaid: worth twice as much.", { value: 2 }),
  perk("Durable", "tool", "Hardened and tempered: twice the durability.", { durability: 2 })
]);

export const FITS = Object.freeze({ any: "Any item", weapon: "Weapons", armour: "Armour and shields", tool: "Tools" });

function setting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key) ?? fallback; } catch { return fallback; }
}

/** The world's perk list (setting "perks" = { list }, GM-edited), else the defaults. */
export function perkList() {
  const saved = setting("perks", {});
  return Array.isArray(saved?.list) ? saved.list.map(normalizePerk).filter(Boolean) : DEFAULT_PERKS.map(entry => ({ ...entry, effects: { ...entry.effects } }));
}

const num = (value, min, max) => {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
};

export function normalizePerk(entry) {
  const name = String(entry?.name ?? "").trim();
  if (!name) return null;
  const effects = {};
  const weight = num(entry.effects?.weight, 0.01, 100); if (weight !== undefined && weight !== 1) effects.weight = weight;
  const value = num(entry.effects?.value, 0.01, 1000); if (value !== undefined && value !== 1) effects.value = value;
  const damage = num(entry.effects?.damage, -20, 20); if (damage) effects.damage = Math.trunc(damage);
  const ac = num(entry.effects?.ac, -20, 20); if (ac) effects.ac = Math.trunc(ac);
  const durability = num(entry.effects?.durability, 0.01, 100); if (durability !== undefined && durability !== 1) effects.durability = durability;
  return { id: String(entry.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")), name, fits: FITS[entry.fits] ? entry.fits : "any",
    description: String(entry.description ?? "").trim(), effects };
}

/** GM: save the perk list. */
export async function savePerks(list) {
  if (!game.user.isGM) throw new Error("Only the GM may edit perks.");
  const perks = list.map(normalizePerk).filter(Boolean);
  if (new Set(perks.map(entry => entry.name)).size !== perks.length) throw new Error("Each perk needs a unique name.");
  await game.settings.set(MODULE_ID, "perks", { list: perks });
  return perks;
}

/** "weapon", "armour", "tool", or "other" for item data. */
export function itemKind(data) {
  if (data?.type === "weapon") return "weapon";
  if (data?.type === "equipment" && Number.isFinite(Number(data.system?.armor?.value)) && Number(data.system.armor.value) > 0) return "armour";
  if (data?.type === "tool" || data?.flags?.["gathering-professions"]?.defaultTool) return "tool";
  return "other";
}

export const fitsItem = (entry, data) => entry.fits === "any" || entry.fits === itemKind(data);
export const fittingPerks = data => perkList().filter(entry => fitsItem(entry, data));

/** Item kinds that can be Masterwork or take perks (not stackable goods). */
export const isGear = data => ["weapon", "armour", "tool"].includes(itemKind(data)) || data?.type === "equipment";

/** Apply a perk to item data (in place). */
export function applyPerk(data, entry) {
  const effects = entry.effects ?? {};
  const set = (path, value) => foundry.utils.setProperty(data, path, value);
  const get = path => foundry.utils.getProperty(data, path);
  if (effects.weight && Number.isFinite(Number(get("system.weight.value")))) set("system.weight.value", Math.round(Number(get("system.weight.value")) * effects.weight * 100) / 100);
  if (effects.value && Number.isFinite(Number(get("system.price.value")))) {
    const saved = get("flags.gathering-professions.campaignPrice") ?? {};
    set("flags.gathering-professions.campaignPrice", { ...saved, baseName: saved.baseName ?? data.name.replace(/^Masterwork\s+/, ""), valueMultiplier: (Number(saved.valueMultiplier) || (get(`flags.${MODULE_ID}.masterwork`) ? 2 : 1)) * effects.value });
    set("system.price.value", Math.round(Number(get("system.price.value")) * effects.value * 100) / 100);
  }
  if (effects.damage && data.type === "weapon") {
    const current = String(get("system.damage.base.bonus") ?? "").trim();
    set("system.damage.base.bonus", current ? `${current} + ${effects.damage}` : String(effects.damage));
  }
  if (effects.ac && Number.isFinite(Number(get("system.armor.value")))) set("system.armor.value", Number(get("system.armor.value")) + effects.ac);
  if (effects.durability) {
    // Tools without their own maximum use Gathering Professions' world default.
    const durability = get("flags.gathering-professions.durability") ?? {};
    let worldDefault = 10;
    try { worldDefault = Number(game.settings.get("gathering-professions", "rules")?.toolDurability ?? 10); } catch { worldDefault = 10; }
    const base = Number(durability.max) > 0 ? Number(durability.max) : worldDefault;
    if (base > 0) set("flags.gathering-professions.durability", { max: Math.round(base * effects.durability), value: Math.round(base * effects.durability) });
  }
  data.name = `${data.name} (${entry.name})`;
  const description = get("system.description.value") ?? "";
  set("system.description.value", `<p><strong>${entry.name}.</strong> ${entry.description}</p>${description}`);
  set(`flags.${MODULE_ID}.perks`, [...(get(`flags.${MODULE_ID}.perks`) ?? []), entry.name]);
  return data;
}

/** Make item data Masterwork (in place): name and value. */
export function applyMasterwork(data, valueFactor = 2) {
  const saved = foundry.utils.getProperty(data, "flags.gathering-professions.campaignPrice") ?? {};
  foundry.utils.setProperty(data, "flags.gathering-professions.campaignPrice", { ...saved, baseName: saved.baseName ?? data.name, valueMultiplier: (Number(saved.valueMultiplier) || 1) * valueFactor });
  data.name = `Masterwork ${data.name}`;
  const price = Number(foundry.utils.getProperty(data, "system.price.value"));
  if (Number.isFinite(price)) foundry.utils.setProperty(data, "system.price.value", Math.round(price * valueFactor * 100) / 100);
  const description = foundry.utils.getProperty(data, "system.description.value") ?? "";
  foundry.utils.setProperty(data, "system.description.value", `<p><em>Masterwork: flawless craftsmanship, worth ${valueFactor}× a common one.</em></p>${description}`);
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.masterwork`, true);
  return data;
}
