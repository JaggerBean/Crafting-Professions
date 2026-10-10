// Items this module provides itself (no compendium has them).
import { MODULE_ID } from "./professions.js";

const food = (img, price, description) => Object.freeze({ type: "consumable", img, price, description, subtype: "food" });

export const CUSTOM_ITEMS = Object.freeze({
  "Nettle Soup": food("icons/consumables/food/bowl-stew-brown.webp", 0.05, "A green, peppery soup of young nettles simmered in bone stock. Hedge cooks swear it puts iron in the blood."),
  "Bone Broth": food("icons/consumables/food/pot-soup-white.webp", 0.05, "Bones and herbs simmered for hours into a rich, golden broth that soothes the sick and the weary."),
  "Acorn Bread": food("icons/consumables/food/bread-toast-tan.webp", 0.04, "A dense, nutty loaf of leached acorn meal. Bitter-sweet, filling, and it keeps for weeks on the road."),
  "Wanted Poster": Object.freeze({ type: "loot", img: "icons/sundries/documents/document-sealed-red-tan.webp", price: 0.1,
    description: "A handbill with a crude likeness, a name, and a reward. Hunters show it around so townsfolk recognise their quarry." })
});

/** World Item data for a custom item, or null. */
export function customItemData(name, folder = null) {
  const entry = CUSTOM_ITEMS[name];
  if (!entry) return null;
  return { name, type: entry.type, img: entry.img, folder, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
    system: { description: { value: `<p>${entry.description}</p>` }, price: { value: entry.price, denomination: "gp" }, quantity: 1, weight: { value: 0, units: "lb" },
      ...(entry.subtype ? { type: { value: entry.subtype } } : {}) },
    flags: { [MODULE_ID]: { customItem: name } } };
}
