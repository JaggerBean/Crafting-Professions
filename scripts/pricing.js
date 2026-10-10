// Campaign prices for Crafting Professions' items, added to Gathering
// Professions' repricer (api.pricing.registerContributor):
//   Standard items (tools, bounty gear, bought ingredients): half book price.
//   Blacksmith goods: half book price, but never below ingredients + 25%.
//   Dishes (and goods with no book price): ingredients + 50% per serving.
//   Bounty rare finds: the rare-find band of the lowest tier job that lists them.
//   Recipe scrolls: 2 / 5 / 15 / 40 / 100 gp by tier.
import { MODULE_ID, CRAFTING_PROFESSIONS } from "./professions.js";
import { professionRecipes, findRecipe } from "./recipes.js";
import { contacts, contracts } from "./contacts.js";
import { RARE_BANDS, spreadInBand, recipeCosts, approvedPrice, tidyPrice, priceInGp as gpOf } from "../../gathering-professions/scripts/pricing.js";

export const SCROLL_PRICE = Object.freeze([2, 5, 15, 40, 100]);
export const CRAFT_MARGIN = 1.25;
export const DISH_MARGIN = 1.5;
const BOUGHT = Object.freeze(["Potato", "Chicken Egg"]);

/** Every job body (contact tasks and contracts) with its tier. */
const jobBodies = () => [...contacts().map(entry => ({ ...entry.task, tier: entry.tier })), ...contracts()];

/** @returns {Promise<Map<string, number>>} name → gp */
export async function craftingPrices(prices, { bookPrice, priceInGp, campaignPrice }) {
  const out = new Map();
  const items = Array.from(game.items ?? []);
  const byName = name => items.find(item => item.name === name) ?? null;
  const halfBook = async name => {
    const item = byName(name);
    const book = item ? await bookPrice(item) : null;
    return book && priceInGp(book) ? priceInGp(campaignPrice(book)) : null;
  };
  const crafting = Object.entries(CRAFTING_PROFESSIONS).filter(([, profession]) => profession.kind !== "bounty");
  const outputs = new Set(crafting.flatMap(([key]) => professionRecipes(key).map(row => row.output)));
  // Standard items: tools, bounty gear, bought ingredients.
  const gear = jobBodies().flatMap(body => [...(body.kill?.gear ?? []), ...(body.alive?.gear ?? [])].map(row => row.name));
  const standard = new Set([...Object.values(CRAFTING_PROFESSIONS).map(profession => profession.tool?.name).filter(Boolean), ...gear, ...BOUGHT]);
  for (const name of standard) {
    if (outputs.has(name) || prices.has(name)) continue;
    const value = await halfBook(name);
    if (value !== null) out.set(name, value);
  }
  // Crafted goods, from ingredient costs.
  const known = new Map([...prices, ...out]);
  for (const item of items) {
    const approved = approvedPrice(item);
    if (approved !== null) known.set(item.name, approved);
    else if (!known.has(item.name) && outputs.has(item.name)) known.set(item.name, priceInGp(item.system?.price));
  }
  for (const [key, profession] of crafting) {
    const rows = professionRecipes(key).map(row => ({ output: row.output, quantity: row.quantity, inputs: row.inputs }));
    const dishes = profession.kind === "cooking";
    const costs = recipeCosts(rows, known, dishes ? DISH_MARGIN : CRAFT_MARGIN);
    for (const [name, cost] of costs) {
      // Ammunition's PHB price is a bundle price, not the price of one arrow.
      const book = dishes || approvedPrice(byName(name)) !== null || ["Arrows", "Bolts"].includes(name) ? null : await halfBook(name);
      const floor = known.get(name) ?? 0;
      const value = Math.max(book ?? 0, cost, floor);
      out.set(name, gpOf(tidyPrice(value)));
      known.set(name, out.get(name));
    }
  }
  // Bounty rare finds: rare band of the lowest tier that lists them.
  const findTier = new Map();
  for (const body of jobBodies()) for (const [name] of body.finds ?? []) findTier.set(name, Math.min(findTier.get(name) ?? 5, Math.max(1, Number(body.tier) || 1)));
  const groups = new Map();
  for (const [name, tier] of findTier) {
    if (prices.has(name) || out.has(name) || !byName(name)) continue;
    const basis = Number(byName(name).getFlag?.("gathering-professions", "campaignPrice")?.basis);
    (groups.get(tier) ?? groups.set(tier, []).get(tier)).push({ key: name, old: Number.isFinite(basis) ? basis : priceInGp(byName(name).system?.price) });
  }
  for (const [tier, members] of groups) for (const [name, gp] of spreadInBand(members, RARE_BANDS[tier - 1])) out.set(name, gp);
  // Recipe scrolls.
  for (const item of items) {
    const id = item.getFlag?.(MODULE_ID, "recipe");
    const tier = id ? findRecipe(id, { includeDisabled: true })?.tier : null;
    if (tier) out.set(item.name, SCROLL_PRICE[Math.min(5, Math.max(1, tier)) - 1]);
  }
  return out;
}
