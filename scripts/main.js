// Crafting Professions: registers crafting professions with Gathering
// Professions (Recipes window tabs, profession menu section) and adds recipe
// scrolls, perk choices, and the GM window.
import { MODULE_ID, GP_ID, CRAFTING_PROFESSIONS } from "./professions.js";
import { craftingRules, saveCraftingRules } from "./rules.js";
import { professionRecipes, prepareItems, findRecipe } from "./recipes.js";
import { actorProfessions, chooseProfession, removeProfession, setRank, setXp, addXp, learn, forget, knows, knownIds, rankOf, setPath, chooseTalent, removeTalent } from "./state.js";
import { useAbility, longRest, injectTalents, talentsForRoll } from "./abilities.js";
import { eatMeal, mealOf, mealList, saveMeals, resetMeals, refreshCookedMeals } from "./meals.js";
import { registerAskAround, requestAskAround, handleAskRequest, askOptions } from "./askaround.js";
import { hunt, makeContactScroll, makeWantedNotice } from "./craft.js";
import { contacts, contracts, saveContact, saveContract, deleteContact, deleteContract, generateContract, resetContacts } from "./contacts.js";
import { BOUNTY_HUB_SECTION } from "./bounty-gm.js";
import { COOKING_HUB_SECTION } from "./cooking-gm.js";
import { checkFor, blockedReason, craft, experiment, makeScroll, learnFromScroll, scrollRecipe, scrollTeaches, applyPendingPerk, carriedScrolls } from "./craft.js";
import { perkList, savePerks, applyPerk, applyMasterwork } from "./perks.js";
import { craftingProvider } from "./provider.js";
import { registerMenu } from "./menu.js";
import { openGmWindow, HUB_SECTION } from "./gm.js";

// Bump when products change: the GM prepares items again on the next load.
const ITEMS_VERSION = 4;

Hooks.once("init", () => {
  for (const [key, type, fallback] of [["rules", Object, {}], ["recipeEdits", Object, {}], ["customRecipes", Array, []], ["perks", Object, {}], ["itemsVersion", Number, 0], ["bountyContacts", Object, null], ["bountyContracts", Object, null], ["lastTown", String, ""], ["mealEffects", Object, null]]) {
    game.settings.register(MODULE_ID, key, { scope: "world", config: false, type, default: fallback });
  }
  game.settings.registerMenu(MODULE_ID, "gm", {
    name: "Crafting Professions", label: "Open crafting settings", hint: "Opens the GM hub on the Crafting Professions Rules section: modes, great-result outcomes, perks, and items. Cooking and Bounties have their own sections.",
    icon: "fas fa-hammer", restricted: true,
    type: class extends foundry.applications.api.ApplicationV2 { async render() { await openGmWindow(); return this; } }
  });
});

const isActiveGM = () => game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
let ready = false;

function setUp(gpApi) {
  if (ready || !gpApi?.recipes) return;
  ready = true;
  for (const key of Object.keys(CRAFTING_PROFESSIONS)) gpApi.recipes.register(craftingProvider(key, gpApi.recipes));
  registerMenu(gpApi);
  registerAskAround(isActiveGM);
  void gpApi.hub?.registerSection(HUB_SECTION);
  void gpApi.hub?.registerSection(COOKING_HUB_SECTION);
  void gpApi.hub?.registerSection(BOUNTY_HUB_SECTION);
  game.modules.get(MODULE_ID).api = {
    professions: CRAFTING_PROFESSIONS,
    rules: () => craftingRules(), saveRules: values => saveCraftingRules(values),
    recipes: (profession, options) => professionRecipes(profession, options), findRecipe,
    actorProfessions, chooseProfession, removeProfession, setRank, setXp, addXp, rankOf,
    learn, forget, knows, knownIds,
    check: checkFor, blocked: blockedReason, craft, experiment,
    makeScroll, learnFromScroll, carriedScrolls,
    perks: () => perkList(), savePerks, applyPerk, applyMasterwork,
    prepareItems, openGm: () => openGmWindow(),
    useAbility, setPath, chooseTalent, removeTalent, talentsForRoll,
    meals: { list: () => mealList(), eat: eatMeal, save: saveMeals, reset: resetMeals, refreshCooked: refreshCookedMeals },
    bounties: { contacts, contracts, saveContact, saveContract, deleteContact, deleteContract, generateContract, resetContacts, hunt,
      makeContactScroll, makeWantedNotice, askAround: requestAskAround, decideAskAround: handleAskRequest, askOptions }
  };
  if (isActiveGM() && (game.settings.get(MODULE_ID, "itemsVersion") ?? 0) < ITEMS_VERSION) {
    void prepareItems().then(async result => {
      await game.settings.set(MODULE_ID, "itemsVersion", ITEMS_VERSION);
      if (result.imported) ui.notifications.info(`Crafting Professions: ${result.imported} items imported.`);
      if (result.missing.length) console.warn(`${MODULE_ID}: products not found: ${result.missing.join(", ")}`);
    }).catch(error => console.error(`${MODULE_ID}: could not prepare items`, error));
  }
  console.info(`${MODULE_ID}: ${Object.keys(CRAFTING_PROFESSIONS).length} crafting profession(s) registered.`);
}

// Gathering Professions announces its API when ready (its ready hook is async).
Hooks.on("gatheringProfessions.ready", setUp);
Hooks.once("ready", () => setUp(game.modules.get(GP_ID)?.api));

// Recipe scrolls: dnd5e uses ItemSheet5e; generic V2 sheets use ItemSheetV2.
const addLearnRecipeControl = (app, controls) => {
  const item = app.document;
  if (scrollTeaches(item) && item.parent?.documentName === "Actor" && (game.user.isGM || item.parent.isOwner)
      && !controls.some(control => control.action === "cp-learn-recipe")) controls.unshift({
    action: "cp-learn-recipe", icon: "fas fa-book-open-reader", label: scrollRecipe(item) ? "Learn Recipe" : "Learn Job",
    onClick: () => learnFromScroll(item).catch(error => ui.notifications.error(error.message))
  });
};
Hooks.on("getHeaderControlsItemSheet5e", addLearnRecipeControl);
Hooks.on("getHeaderControlsItemSheetV2", addLearnRecipeControl);

// Using a recipe scroll from the character sheet (click its image or Use) learns it
// instead of posting the item card. Scrolls have no activities, so dnd5e shows a card.
Hooks.on("dnd5e.preDisplayCard", item => {
  // Meals: clicking a dish eats one.
  if (mealOf(item) && item.parent?.documentName === "Actor" && (game.user.isGM || item.parent.isOwner)) {
    void eatMeal(item).catch(error => ui.notifications.warn(error.message));
    return false;
  }
  if (!scrollTeaches(item) || item.parent?.documentName !== "Actor") return true;
  if (!(game.user.isGM || item.parent.isOwner)) return true;
  void learnFromScroll(item).catch(error => ui.notifications.warn(error.message));
  return false;
});

// Long rest: profession abilities recharge; Tempered wears off.
Hooks.on("dnd5e.restCompleted", (actor, result) => {
  if (result?.longRest && actor?.isOwner) void longRest(actor).catch(error => console.error(`${MODULE_ID}: long rest`, error));
});

// Talents: dnd5e's roll dialogs (skill, tool, ability checks) offer fitting talents.
for (const hook of ["renderSkillToolRollConfigurationDialog", "renderD20RollConfigurationDialog"]) {
  Hooks.on(hook, (app, element) => {
    try { injectTalents(app, element instanceof HTMLElement ? element : element?.[0] ?? app.element); }
    catch (error) { console.error(`${MODULE_ID}: talents`, error); }
  });
}

// GM perk choice buttons in whispered chat cards.
Hooks.on("renderChatMessageHTML", (_message, html) => {
  html.querySelectorAll?.("[data-cp-perk]").forEach(button => {
    if (!game.user.isGM) { button.disabled = true; return; }
    button.addEventListener("click", async () => {
      try {
        const name = await applyPendingPerk(button.dataset.cpActor, button.dataset.cpToken, button.dataset.cpPerk);
        button.closest(".cp-perk-card")?.querySelectorAll("button").forEach(entry => { entry.disabled = true; });
        ui.notifications.info(`Perk applied: ${name}.`);
      } catch (error) { ui.notifications.error(error.message); }
    });
  });
});
