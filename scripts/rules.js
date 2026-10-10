// Crafting rules (world setting "rules"), separate from gathering, edited in
// the Crafting Professions GM window. Every value is validated on read.
import { MODULE_ID } from "./professions.js";

export const DEFAULT_RULES = Object.freeze({
  rankXp: [0, 100, 300, 700, 1500],
  rankDcReduction: [0, 2, 4, 6, 8],
  tierDc: [10, 14, 18, 23, 28],
  tierXp: [5, 10, 20, 35, 60],
  tierMinutes: [60, 120, 240, 480, 1440],
  timed: true,
  rankUpMode: "gm",          // "gm": GM promotes once XP is reached; "auto": at the XP threshold
  knowledgeMode: "character", // "character" or "party"
  outcomes: {
    excellent: { extra: 0, masterwork: true, perk: false },
    masterful: { extra: 0, masterwork: true, perk: true }
  },
  perkPicker: "gm",          // "gm", "player", or "random"
  masterworkValue: 2,
  // Cooking: great results add servings and/or make the dish Exquisite (double effect and value).
  cooking: {
    excellent: { extra: 1, exquisite: false },
    masterful: { extra: 0, exquisite: true },
    exquisiteValue: 2
  },
  // Bounty Hunter: retrieval (alive) is harder and pays more; great results add gold and/or a rare find.
  bounty: {
    aliveDcBonus: 3,
    aliveRewardFactor: 1.5,
    excellent: { bonusGold: 25, find: false },
    masterful: { bonusGold: 25, find: true }
  }
});

export const MAX_MINUTES = 10080;

function saved() {
  try { return globalThis.game?.settings?.get(MODULE_ID, "rules") || {}; } catch { return {}; }
}

const whole = (value, fallback, min = 0, max = Infinity) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};
const tiers = (values, defaults, min, max) => defaults.map((fallback, index) => whole(values?.[index], fallback, min, max));
const outcome = (value, fallback) => ({
  extra: whole(value?.extra, fallback.extra, 0, 99),
  masterwork: typeof value?.masterwork === "boolean" ? value.masterwork : fallback.masterwork,
  perk: typeof value?.perk === "boolean" ? value.perk : fallback.perk
});

function cookingRules(value = {}) {
  const fallback = DEFAULT_RULES.cooking;
  const great = (entry, base) => ({ extra: whole(entry?.extra, base.extra, 0, 99), exquisite: typeof entry?.exquisite === "boolean" ? entry.exquisite : base.exquisite });
  const factor = Number(value?.exquisiteValue);
  return { excellent: great(value?.excellent, fallback.excellent), masterful: great(value?.masterful, fallback.masterful),
    exquisiteValue: Number.isFinite(factor) && factor >= 1 && factor <= 100 ? factor : fallback.exquisiteValue };
}

function bountyRules(value = {}) {
  const fallback = DEFAULT_RULES.bounty;
  const factor = Number(value?.aliveRewardFactor);
  const great = (entry, base) => ({ bonusGold: whole(entry?.bonusGold, base.bonusGold, 0, 1000), find: typeof entry?.find === "boolean" ? entry.find : base.find });
  return {
    aliveDcBonus: whole(value?.aliveDcBonus, fallback.aliveDcBonus, 0, 20),
    aliveRewardFactor: Number.isFinite(factor) && factor >= 1 && factor <= 10 ? factor : fallback.aliveRewardFactor,
    excellent: great(value?.excellent, fallback.excellent),
    masterful: great(value?.masterful, fallback.masterful)
  };
}

export function craftingRules(source = saved()) {
  const rules = {
    rankXp: tiers(source.rankXp, DEFAULT_RULES.rankXp, 0, 10000000),
    rankDcReduction: tiers(source.rankDcReduction, DEFAULT_RULES.rankDcReduction, 0, 100),
    tierDc: tiers(source.tierDc, DEFAULT_RULES.tierDc, 1, 100),
    tierXp: tiers(source.tierXp, DEFAULT_RULES.tierXp, 0, 100000),
    tierMinutes: tiers(source.tierMinutes, DEFAULT_RULES.tierMinutes, 0, MAX_MINUTES),
    timed: source.timed !== false,
    rankUpMode: source.rankUpMode === "auto" ? "auto" : "gm",
    knowledgeMode: source.knowledgeMode === "party" ? "party" : "character",
    outcomes: {
      excellent: outcome(source.outcomes?.excellent, DEFAULT_RULES.outcomes.excellent),
      masterful: outcome(source.outcomes?.masterful, DEFAULT_RULES.outcomes.masterful)
    },
    perkPicker: ["gm", "player", "random"].includes(source.perkPicker) ? source.perkPicker : "gm",
    masterworkValue: Number.isFinite(Number(source.masterworkValue)) && Number(source.masterworkValue) >= 1 && Number(source.masterworkValue) <= 100
      ? Number(source.masterworkValue) : DEFAULT_RULES.masterworkValue,
    bounty: bountyRules(source.bounty),
    cooking: cookingRules(source.cooking)
  };
  rules.rankXp[0] = 0;
  return rules;
}

/** Validate and save rules from form values; throws a readable Error. */
export async function saveCraftingRules(values) {
  if (!game.user.isGM) throw new Error("Only the GM may change crafting rules.");
  const current = craftingRules();
  const list = (key, min, max, label) => Array.from({ length: 5 }, (_, index) => {
    const raw = values[`${key}${index}`];
    if (raw === undefined) return current[key][index];
    const number = Number(raw);
    if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label} must be whole numbers from ${min} to ${max}.`);
    return number;
  });
  const next = {
    rankXp: list("rankXp", 0, 10000000, "Rank XP"),
    rankDcReduction: list("rankDcReduction", 0, 100, "DC reduction"),
    tierDc: list("tierDc", 1, 100, "Crafting DC"),
    tierXp: list("tierXp", 0, 100000, "Crafting XP"),
    tierMinutes: list("tierMinutes", 0, MAX_MINUTES, "Crafting time"),
    timed: values.timed === undefined ? current.timed : values.timed === true,
    rankUpMode: values.rankUpMode ?? current.rankUpMode,
    knowledgeMode: values.knowledgeMode ?? current.knowledgeMode,
    perkPicker: values.perkPicker ?? current.perkPicker,
    masterworkValue: values.masterworkValue === undefined ? current.masterworkValue : Number(values.masterworkValue),
    outcomes: {}
  };
  next.rankXp[0] = 0;
  if (next.rankXp.some((xp, index) => index && xp <= next.rankXp[index - 1])) throw new Error("Each rank needs more XP than the one before.");
  if (!["gm", "auto"].includes(next.rankUpMode)) throw new Error("Choose how ranks go up.");
  if (!["character", "party"].includes(next.knowledgeMode)) throw new Error("Choose who knows a learned recipe.");
  if (!["gm", "player", "random"].includes(next.perkPicker)) throw new Error("Choose who picks perks.");
  if (!Number.isFinite(next.masterworkValue) || next.masterworkValue < 1 || next.masterworkValue > 100) throw new Error("Masterwork value must be a multiplier from 1 to 100.");
  for (const degree of ["excellent", "masterful"]) {
    const extra = values[`${degree}Extra`] === undefined ? current.outcomes[degree].extra : Number(values[`${degree}Extra`]);
    if (!Number.isInteger(extra) || extra < 0 || extra > 99) throw new Error("Extra products must be a whole number from 0 to 99.");
    next.outcomes[degree] = {
      extra,
      masterwork: values[`${degree}Masterwork`] === undefined ? current.outcomes[degree].masterwork : values[`${degree}Masterwork`] === true,
      perk: values[`${degree}Perk`] === undefined ? current.outcomes[degree].perk : values[`${degree}Perk`] === true
    };
  }
  const bounty = current.bounty;
  const read = (name, fallback) => (values[name] === undefined ? fallback : values[name]);
  next.bounty = {
    aliveDcBonus: Number(read("aliveDcBonus", bounty.aliveDcBonus)),
    aliveRewardFactor: Number(read("aliveRewardFactor", bounty.aliveRewardFactor)),
    excellent: { bonusGold: Number(read("bountyExcellentGold", bounty.excellent.bonusGold)), find: read("bountyExcellentFind", bounty.excellent.find) === true },
    masterful: { bonusGold: Number(read("bountyMasterfulGold", bounty.masterful.bonusGold)), find: read("bountyMasterfulFind", bounty.masterful.find) === true }
  };
  if (!Number.isInteger(next.bounty.aliveDcBonus) || next.bounty.aliveDcBonus < 0 || next.bounty.aliveDcBonus > 20) throw new Error("The alive DC bonus must be a whole number from 0 to 20.");
  if (!Number.isFinite(next.bounty.aliveRewardFactor) || next.bounty.aliveRewardFactor < 1 || next.bounty.aliveRewardFactor > 10) throw new Error("The alive reward multiplier must be from 1 to 10.");
  for (const degree of ["excellent", "masterful"]) {
    const gold = next.bounty[degree].bonusGold;
    if (!Number.isInteger(gold) || gold < 0 || gold > 1000) throw new Error("Bonus gold must be a whole percentage from 0 to 1000.");
  }
  const cooking = current.cooking;
  next.cooking = {
    excellent: { extra: Number(read("cookExcellentExtra", cooking.excellent.extra)), exquisite: read("cookExcellentExquisite", cooking.excellent.exquisite) === true },
    masterful: { extra: Number(read("cookMasterfulExtra", cooking.masterful.extra)), exquisite: read("cookMasterfulExquisite", cooking.masterful.exquisite) === true },
    exquisiteValue: Number(read("exquisiteValue", cooking.exquisiteValue))
  };
  for (const degree of ["excellent", "masterful"]) {
    const extra = next.cooking[degree].extra;
    if (!Number.isInteger(extra) || extra < 0 || extra > 99) throw new Error("Extra servings must be a whole number from 0 to 99.");
  }
  if (!Number.isFinite(next.cooking.exquisiteValue) || next.cooking.exquisiteValue < 1 || next.cooking.exquisiteValue > 100) throw new Error("Exquisite value must be a multiplier from 1 to 100.");
  await game.settings.set(MODULE_ID, "rules", next);
  return craftingRules(next);
}
