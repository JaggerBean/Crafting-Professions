// Registers each crafting profession as a tab in Gathering Professions'
// Recipes window.
import { CRAFTING_PROFESSIONS } from "./professions.js";
import { craftingRules } from "./rules.js";
import { professionRecipes, createRecipe, updateRecipe, setRecipeDisabled, resetRecipe, deleteRecipe, RECIPES, findRecipe, learnIdOf } from "./recipes.js";
import { hasProfession, knows, learn, forget, completedIds } from "./state.js";
import { askPanelHtml, requestAskAround } from "./askaround.js";
import { checkFor, blockedReason, recipeMinutes, craft, experiment, makeScroll, carriedScrolls, learnFromScroll } from "./craft.js";

const isPartyActor = actor => actor?.type === "character" && Boolean(actor.hasPlayerOwner);

export function craftingProvider(key, recipesApi) {
  const profession = CRAFTING_PROFESSIONS[key];
  const bounty = profession.kind === "bounty";
  const learnId = id => learnIdOf(findRecipe(id, { includeDisabled: true })) ?? id;
  const provider = {
    key, label: profession.label, verb: profession.verb, action: profession.action, icon: profession.icon, order: 50,
    // Recipes window group: the Bounty Hunter's work is a service, the rest is crafting.
    category: bounty ? "services" : "crafting",
    rollLabel: profession.tool ? `${profession.label}: ${profession.tool.name} check + profession die`
      : `${profession.label}: ${globalThis.CONFIG?.DND5E?.skills?.[profession.skill]?.label ?? profession.skill} check + profession die`,
    learnOptions: [["learned", "Learned"], ["unlearned", "Unlearned"]],
    get perCharacter() { return craftingRules().knowledgeMode === "character"; },
    get learnHint() { return craftingRules().knowledgeMode === "party" ? "Learned by the whole party" : "Whether the chosen character knows this recipe"; },
    hiddenWord: "unknown",
    hiddenHint: "Learn more from recipe scrolls, by experimenting, or from the GM",
    emptyText: "No recipes known yet. Learn them from recipe scrolls, by experimenting below, or from the GM.",
    get gmHint() {
      return craftingRules().knowledgeMode === "party"
        ? "Eye: whether the party knows it. Scroll: make a recipe scroll Item."
        : "Choose a character to grant or remove recipes. Scroll: make a recipe scroll Item.";
    },
    visible: (actor, isGM) => isGM || hasProfession(actor, key),
    recipes: options => professionRecipes(key, options),
    isKnown: (row, actor) => !row.disabled && knows(actor, learnIdOf(row)),
    learnState: (row, actor) => (knows(actor, learnIdOf(row)) ? "learned" : "unlearned"),
    isDone: (row, actor) => Boolean(row.kind === "bounty" && !row.repeatable && actor && completedIds(actor).has(row.jobId)),
    async setLearned(id, state, actor) {
      if (!game.user.isGM) throw new Error("Only the GM may grant recipes.");
      const party = craftingRules().knowledgeMode === "party";
      const targets = actor ? [actor] : party ? Array.from(game.actors ?? []).filter(isPartyActor) : [];
      if (!targets.length) throw new Error("Choose a character to grant the recipe to.");
      if (state === "learned") for (const target of targets) await learn(target, [learnId(id)]);
      else await forget(actor ?? targets[0], learnId(id));
    },
    check: (actor, row) => checkFor(actor, row),
    blocked: (actor, row) => blockedReason(actor, row),
    minutes: row => recipeMinutes(row),
    defaultMinutes: tier => craftingRules().tierMinutes[Math.min(5, Math.max(1, tier)) - 1],
    craft: (actor, id, batch) => craft(actor, id, batch),
    gm: {
      create: fields => createRecipe({ ...fields, profession: key }),
      update: (id, fields) => updateRecipe(id, fields),
      disable: (id, on) => setRecipeDisabled(id, on),
      reset: id => resetRecipe(id),
      delete: id => deleteRecipe(id),
      scroll: id => makeScroll(id)
    },
    itemGroups(search) {
      const refined = new Set(game.modules.get("gathering-professions").api.refining.recipes(undefined, { includeDisabled: true }).map(row => row.output));
      const crafted = new Set(Object.values(RECIPES).flat().map(row => row.output));
      return recipesApi.itemPickerGroups(search, [
        { label: "Refined goods", filter: item => refined.has(item.name) },
        { label: "Crafted goods", filter: item => crafted.has(item.name) }
      ]);
    },
    experiment: (actor, names) => experiment(actor, key, names),
    carriedLabel: "Recipe scrolls you carry", carriedAction: "Learn",
    carried: actor => carriedScrolls(actor, key),
    useCarried: (actor, itemId) => learnFromScroll(actor.items.get?.(itemId) ?? Array.from(actor.items).find(item => item.id === itemId))
  };
  if (bounty) {
    // Contracts: no batch crafting, editor, or experimenting; contacts and asking around instead.
    Object.assign(provider, {
      hiddenWord: "unknown",
      hiddenHint: "Ask around, use a contact letter or wanted notice, or get work from the GM",
      emptyText: "No contacts or contracts yet. Ask around below, use a contact letter or wanted notice, or get work from the GM.",
      carriedLabel: "Letters and notices you carry", carriedAction: "Use",
      gm: { scroll: id => makeScroll(id) },
      itemGroups: undefined,
      experiment: undefined,
      panel: actor => askPanelHtml(actor),
      onPanel: async (act, _button, actor) => { if (act === "ask") await requestAskAround(actor, key); }
    });
    Object.defineProperty(provider, "gmHint", { configurable: true, get: () => (craftingRules().knowledgeMode === "party"
      ? "Eye: whether the party has it. Scroll: a contact letter (contacts) or a wanted notice (contracts). Edit contacts and contracts in the GM hub's Bounties section."
      : "Choose a character to grant or remove contacts and contracts. Scroll: a contact letter or wanted notice. Edit them in the GM hub's Bounties section.") });
  }
  return provider;
}
