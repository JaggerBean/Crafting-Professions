// GM hub section "Cooking": the Cook's great results (servings, Exquisite) and
// the meal effect table. Styled with Gathering Professions' hub classes.
import { CRAFTING_PROFESSIONS } from "./professions.js";
import { craftingRules, saveCraftingRules } from "./rules.js";
import { professionRecipes } from "./recipes.js";
import { mealList, saveMeals, resetMeals, refreshCookedMeals, describeMeal, MEAL_KINDS, KIND_FIELDS, ABILITY } from "./meals.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const number = (name, value, min, max, step = 1) => `<input type="number" name="${name}" value="${escape(value)}" min="${min}" max="${max}" step="${step}">`;
const option = (value, label, current) => `<option value="${value}" ${String(value) === String(current) ? "selected" : ""}>${escape(label)}</option>`;
const check = (name, on, label) => `<label class="gp-check"><input type="checkbox" name="${name}" ${on ? "checked" : ""}> ${label}</label>`;

const cookingKeys = () => Object.entries(CRAFTING_PROFESSIONS).filter(([, entry]) => entry.kind === "cooking").map(([key]) => key);

/** Dishes the Cook can make (recipe outputs), for the dish picker. */
function cookingDishes() {
  return [...new Set(cookingKeys().flatMap(key => professionRecipes(key, { includeDisabled: true }).map(row => row.output)))].sort();
}

/** The great-results card (its own form; saves only the cooking rules). */
export function renderCookingRules(rules = craftingRules()) {
  const great = (degree, label) => `<div class="cp-outcome"><strong>${label}</strong>
      <label class="gp-field"><span>Extra servings</span>${number(`cook${degree}Extra`, rules.cooking[degree.toLowerCase()].extra, 0, 99)}</label>
      ${check(`cook${degree}Exquisite`, rules.cooking[degree.toLowerCase()].exquisite, "Exquisite (double effect and value)")}</div>`;
  return `<form class="cp-cook-rules">
    <section class="gp-hub-card"><div class="gp-hub-card-head"><i class="fas fa-star"></i> Great results</div>
      <div class="gp-hub-grid gp-hub-grid-2">
        ${great("Excellent", "Excellent dish (beat the DC by 5–9)")}
        ${great("Masterful", "Masterful dish (beat it by 10+, or a natural 20)")}
        <label class="gp-field"><span>Exquisite value ×</span>${number("exquisiteValue", rules.cooking.exquisiteValue, 1, 100, 0.5)}</label>
      </div>
      <p class="gp-hub-note">Meals are eaten from the inventory (click the dish). Only one meal effect at a time; a new meal replaces the last. Ranks, tiers and the check are shared with every crafting profession (<strong>Rules</strong>).</p>
      <footer class="gp-hub-footer"><button type="button" class="gp-hub-ghost" data-cp-cook="recipes"><i class="fas fa-book-open"></i> Open Cooking recipes</button>
        <button type="button" class="gp-hub-primary" data-cp-cook="save-rules"><i class="fas fa-floppy-disk"></i> Save great results</button></footer></section>
  </form>`;
}

/** The Meal effects card (its own form; kind changes re-render the row's fields). */
export function renderMeals(meals = mealList(), dishes = cookingDishes()) {
  const field = (index, entry, name) => {
    if (!KIND_FIELDS[entry.kind]?.includes(name)) return '<span class="gp-hub-muted">—</span>';
    if (name === "ability") return `<select name="mealAbility${index}">${Object.entries(ABILITY).map(([key, label]) => option(key, label, entry.ability ?? "con")).join("")}</select>`;
    if (name === "formula") return `<input type="text" name="mealFormula${index}" value="${escape(entry.formula ?? "1d4")}" placeholder="1d4">`;
    if (name === "minutes") return number(`mealMinutes${index}`, entry.minutes ?? 60, 1, 10080);
    const [min, max] = { tempHp: [1, 999], speed: [5, 120], exhaustion: [1, 6] }[entry.kind];
    return number(`mealAmount${index}`, entry.amount ?? min, min, max, entry.kind === "speed" ? 5 : 1);
  };
  const preview = entry => { try { return escape(describeMeal(entry)); } catch { return ""; } };
  const rows = meals.map((entry, index) => `<tr data-meal-row="${index}">
      <td><input type="text" name="mealDish${index}" value="${escape(entry.dish)}" list="cp-meal-dishes"></td>
      <td><select name="mealKind${index}" data-cp-meal-kind>${Object.entries(MEAL_KINDS).map(([key, label]) => option(key, label, entry.kind)).join("")}</select></td>
      <td>${field(index, entry, "amount")}</td><td>${field(index, entry, "formula")}</td><td>${field(index, entry, "ability")}</td><td>${field(index, entry, "minutes")}</td>
      <td><input type="checkbox" name="mealTravel${index}" ${entry.travel ? "checked" : ""} title="Travel food (description only)"></td>
      <td class="cp-meal-preview">${preview(entry)}</td>
      <td><button type="button" class="gp-rw-iconbtn" data-cp-cook="remove-meal" data-index="${index}" title="Remove effect"><i class="fas fa-xmark"></i></button></td></tr>`).join("");
  const missing = dishes.filter(dish => !meals.some(entry => entry.dish === dish));
  return `<form class="cp-gm-meals">
    <section class="gp-hub-card"><div class="gp-hub-card-head"><i class="fas fa-bowl-food"></i> Meal effects</div>
      <datalist id="cp-meal-dishes">${dishes.map(dish => `<option value="${escape(dish)}"></option>`).join("")}</datalist>
      <table class="gp-hub-table cp-meal-table"><thead><tr><th>Dish</th><th>Effect</th><th title="Temporary HP, speed in feet, or exhaustion levels">Amount</th><th title="Healing dice">Heal</th><th title="Saving throw with advantage">Save</th><th title="How long the effect lasts">Minutes</th><th title="Travel food (description only)">Travel</th><th>When eaten</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="gp-hub-muted">No meal effects. Cooked dishes are ordinary food.</td></tr>'}</tbody></table>
      <p class="gp-hub-note">The dish name must match the recipe's product. Exquisite dishes double the amount and duration (and roll healing twice). Changes apply to dishes cooked after saving; use <strong>Update cooked dishes</strong> to change ones already made.${missing.length ? ` No effect yet: ${missing.map(escape).join(", ")}.` : ""}</p>
      <footer class="gp-hub-footer"><button type="button" class="gp-hub-ghost" data-cp-cook="add-meal"><i class="fas fa-plus"></i> Add effect</button>
        <button type="button" class="gp-hub-ghost" data-cp-cook="reset-meals"><i class="fas fa-rotate-left"></i> Reset to defaults</button>
        <button type="button" class="gp-hub-ghost" data-cp-cook="refresh-meals"><i class="fas fa-arrows-rotate"></i> Update cooked dishes</button>
        <button type="button" class="gp-hub-primary" data-cp-cook="save-meals"><i class="fas fa-floppy-disk"></i> Save meal effects</button></footer></section>
  </form>`;
}

/** Read the meal effect table from its form (raw values; saveMeals validates). */
export function readMeals(form) {
  const value = name => form?.querySelector(`[name="${name}"]`);
  return Array.from(form?.querySelectorAll("[data-meal-row]") ?? []).map(row => {
    const index = row.dataset.mealRow;
    const entry = { dish: value(`mealDish${index}`)?.value ?? "", kind: value(`mealKind${index}`)?.value ?? "", travel: Boolean(value(`mealTravel${index}`)?.checked) };
    for (const [key, name] of [["amount", "mealAmount"], ["formula", "mealFormula"], ["ability", "mealAbility"], ["minutes", "mealMinutes"]]) {
      const input = value(`${name}${index}`);
      if (input) entry[key] = key === "formula" || key === "ability" ? input.value : input.value === "" ? "" : Number(input.value);
    }
    return entry;
  });
}

// Meal rows changed but not yet saved (kept across re-renders).
let draftMeals = null;

/** Pure render of the Cooking section body (unit tested). */
export function renderCooking(rules = craftingRules(), meals = draftMeals ?? mealList()) {
  return `<div class="cp-gm-window cp-cooking-window">${renderCookingRules(rules)}${renderMeals(meals)}</div>`;
}

/** Handle a click inside the section; re-renders through `rerender`. */
export async function handleCookingClick(event, root, rerender) {
  const button = event.target.closest?.("[data-cp-cook]");
  if (!button) return;
  event.preventDefault();
  const act = button.dataset.cpCook;
  const mealForm = root.querySelector(".cp-gm-meals");
  if (act === "save-rules") {
    const form = root.querySelector(".cp-cook-rules");
    const values = Object.fromEntries(Array.from(form.querySelectorAll("[name]")).map(input => [input.name, input.type === "checkbox" ? input.checked : input.value]));
    await saveCraftingRules(values);
    ui.notifications.info("Cooking great results saved.");
    return rerender();
  }
  if (act === "add-meal") { draftMeals = [...readMeals(mealForm), { dish: "", kind: "tempHp", amount: 2 }]; return rerender(); }
  if (act === "remove-meal") { draftMeals = readMeals(mealForm).filter((_entry, index) => index !== Number(button.dataset.index)); return rerender(); }
  if (act === "save-meals") { await saveMeals(readMeals(mealForm)); draftMeals = null; ui.notifications.info("Meal effects saved."); return rerender(); }
  if (act === "reset-meals") {
    const confirmed = await foundry.applications.api.DialogV2.confirm({ window: { title: "Reset meal effects" }, content: "<p>Replace every meal effect with the module's defaults?</p>", rejectClose: false });
    if (!confirmed) return;
    await resetMeals(); draftMeals = null; ui.notifications.info("Meal effects reset to defaults."); return rerender();
  }
  if (act === "refresh-meals") {
    if (draftMeals) return ui.notifications.warn("Save the meal effects first.");
    const count = await refreshCookedMeals();
    return ui.notifications.info(`Updated ${count} cooked dish${count === 1 ? "" : "es"}.`);
  }
  if (act === "recipes") return game.modules.get("gathering-professions").api.openRecipes({ tab: cookingKeys()[0] });
}

/** Changing a meal's effect kind re-renders its row with that kind's fields. */
export function handleCookingChange(event, root, rerender) {
  if (!event.target?.matches?.("[data-cp-meal-kind]")) return;
  draftMeals = readMeals(root.querySelector(".cp-gm-meals"));
  return rerender();
}

/** The GM hub section (Gathering Professions' hub, nav "Cooking"). */
export const COOKING_HUB_SECTION = Object.freeze({
  id: "cooking", label: "Cooking", group: "Crafting Professions", icon: "fa-utensils", order: 11,
  blurb: "The Cook: great results (extra servings, Exquisite dishes) and what each dish does when eaten.",
  render: () => renderCooking(),
  onClick: (event, { hub, root }) => handleCookingClick(event, root, () => hub.render()).catch(error => ui.notifications.error(error.message)),
  onChange: (event, { hub, root }) => handleCookingChange(event, root, () => hub.render())
});
