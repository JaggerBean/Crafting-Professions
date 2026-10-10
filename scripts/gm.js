// GM hub section "Rules" (id "crafting"): crafting modes, Excellent/Masterful
// outcomes, bounty rules, ranks and tiers, the perk list, and preparing
// products. Cooking has its own section (cooking-gm.js). Styled with Gathering
// Professions' hub classes.
import { MODULE_ID, CRAFTING_PROFESSIONS, RANK_DIE } from "./professions.js";
import { craftingRules, saveCraftingRules } from "./rules.js";
import { perkList, savePerks, FITS } from "./perks.js";
import { prepareItems } from "./recipes.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const number = (name, value, min, max, step = 1) => `<input type="number" name="${name}" value="${escape(value)}" min="${min}" max="${max}" step="${step}">`;
const option = (value, label, current) => `<option value="${value}" ${String(value) === String(current) ? "selected" : ""}>${escape(label)}</option>`;
const check = (name, on, label) => `<label class="gp-check"><input type="checkbox" name="${name}" ${on ? "checked" : ""}> ${label}</label>`;

/** Pure render of the GM window body (unit tested). */
export function renderGm(rules = craftingRules(), perks = perkList()) {
  const tiers = [0, 1, 2, 3, 4];
  const rankRows = tiers.map(index => `<tr><th>${index + 1}</th>
      <td>${index ? number(`rankXp${index}`, rules.rankXp[index], 1, 10000000) : '<span class="gp-hub-muted">0 XP</span>'}</td>
      <td>${number(`rankDcReduction${index}`, rules.rankDcReduction[index], 0, 100)}</td>
      <td><span class="gp-die-badge">d${RANK_DIE[index]}</span></td></tr>`).join("");
  const tierRows = tiers.map(index => `<tr><th>${index + 1}</th>
      <td>${number(`tierDc${index}`, rules.tierDc[index], 1, 100)}</td>
      <td>${number(`tierXp${index}`, rules.tierXp[index], 0, 100000)}</td>
      <td>${number(`tierMinutes${index}`, rules.tierMinutes[index], 0, 10080)}</td></tr>`).join("");
  const outcome = (degree, label) => `<div class="cp-outcome"><strong>${label}</strong>
      <label class="gp-field"><span>Extra products</span>${number(`${degree}Extra`, rules.outcomes[degree].extra, 0, 99)}</label>
      ${check(`${degree}Masterwork`, rules.outcomes[degree].masterwork, "Masterwork (weapons, armour, tools)")}
      ${check(`${degree}Perk`, rules.outcomes[degree].perk, "A perk (weapons, armour, tools)")}</div>`;
  const perkRows = perks.map((entry, index) => `<tr data-perk-row="${index}">
      <td><input type="text" name="perkName${index}" value="${escape(entry.name)}"></td>
      <td><select name="perkFits${index}">${Object.entries(FITS).map(([key, label]) => option(key, label, entry.fits)).join("")}</select></td>
      <td><input type="text" name="perkDescription${index}" value="${escape(entry.description)}"></td>
      <td>${number(`perkWeight${index}`, entry.effects.weight ?? "", 0.01, 100, 0.01)}</td>
      <td>${number(`perkValue${index}`, entry.effects.value ?? "", 0.01, 1000, 0.01)}</td>
      <td>${number(`perkDamage${index}`, entry.effects.damage ?? "", -20, 20)}</td>
      <td>${number(`perkAc${index}`, entry.effects.ac ?? "", -20, 20)}</td>
      <td>${number(`perkDurability${index}`, entry.effects.durability ?? "", 0.01, 100, 0.01)}</td>
      <td><button type="button" class="gp-rw-iconbtn" data-cp-gm="remove-perk" data-index="${index}" title="Remove perk"><i class="fas fa-xmark"></i></button></td></tr>`).join("");
  return `<div class="cp-gm-window">
    <form class="cp-gm-rules">
      <div class="gp-hub-grid gp-hub-grid-2">
        <section class="gp-hub-card"><div class="gp-hub-card-head"><i class="fas fa-sliders"></i> Modes</div>
          <label class="gp-field"><span>Rank ups</span><select name="rankUpMode">${option("gm", "GM confirms (story goal), XP keeps banking", rules.rankUpMode)}${option("auto", "Automatic at the XP threshold", rules.rankUpMode)}</select></label>
          <label class="gp-field"><span>Learned recipes are known by</span><select name="knowledgeMode">${option("character", "The character who learned them", rules.knowledgeMode)}${option("party", "The whole party", rules.knowledgeMode)}</select></label>
          ${check("timed", rules.timed, "Crafting takes world time")}
        </section>
        <section class="gp-hub-card"><div class="gp-hub-card-head"><i class="fas fa-star"></i> Great results</div>
          ${outcome("excellent", "Excellent (beat the DC by 5–9)")}
          ${outcome("masterful", "Masterful (beat it by 10+, or a natural 20)")}
          <label class="gp-field"><span>Who picks a perk</span><select name="perkPicker">${option("gm", "The GM (whispered choice)", rules.perkPicker)}${option("player", "The crafting player", rules.perkPicker)}${option("random", "Random", rules.perkPicker)}</select></label>
          <label class="gp-field"><span>Masterwork value ×</span>${number("masterworkValue", rules.masterworkValue, 1, 100, 0.5)}</label>
        </section>
      </div>
      <section class="gp-hub-card"><div class="gp-hub-card-head"><i class="fas fa-crosshairs"></i> Bounties</div>
        <div class="gp-hub-grid gp-hub-grid-2">
          <div class="cp-outcome"><strong>Retrieval (alive)</strong>
            <label class="gp-field"><span>DC bonus</span>${number("aliveDcBonus", rules.bounty.aliveDcBonus, 0, 20)}</label>
            <label class="gp-field"><span>Reward × (when the job sets no alive reward)</span>${number("aliveRewardFactor", rules.bounty.aliveRewardFactor, 1, 10, 0.1)}</label></div>
          <div class="cp-outcome"><strong>Excellent hunt</strong>
            <label class="gp-field"><span>Bonus gold %</span>${number("bountyExcellentGold", rules.bounty.excellent.bonusGold, 0, 1000)}</label>
            ${check("bountyExcellentFind", rules.bounty.excellent.find, "A rare find on the quarry")}</div>
          <div class="cp-outcome"><strong>Masterful hunt</strong>
            <label class="gp-field"><span>Bonus gold %</span>${number("bountyMasterfulGold", rules.bounty.masterful.bonusGold, 0, 1000)}</label>
            ${check("bountyMasterfulFind", rules.bounty.masterful.find, "A rare find on the quarry")}</div>
        </div>
        <p class="gp-hub-note">Near miss: the quarry gets away, no gold, half the used-up gear is lost, and the job stays open. Bad failure (by 5+ or a natural 1): all used-up gear and every "at risk" item are lost. Rare finds come from the job's own list; jobs without one ask the GM to pick.</p></section>
      <div class="gp-hub-grid gp-hub-grid-2">
        <section class="gp-hub-card"><div class="gp-hub-card-head"><i class="fas fa-ranking-star"></i> Crafting ranks</div>
          <table class="gp-hub-table"><thead><tr><th>Rank</th><th>Starts at (XP)</th><th>DC reduction</th><th>Die</th></tr></thead><tbody>${rankRows}</tbody></table></section>
        <section class="gp-hub-card"><div class="gp-hub-card-head"><i class="fas fa-hammer"></i> Crafting tiers</div>
          <table class="gp-hub-table"><thead><tr><th>Tier</th><th>Base DC</th><th>XP per unit</th><th>Time per unit (min)</th></tr></thead><tbody>${tierRows}</tbody></table>
          <p class="gp-hub-note">Check: d20 + ability + tool proficiency + profession die vs the tier's DC minus rank reduction. Failing by less than 5 loses half the materials; by 5 or more (or a natural 1) loses them all. A character can craft a recipe only once their rank reaches its tier.</p></section>
      </div>
      <footer class="gp-hub-footer"><button type="button" class="gp-hub-primary" data-cp-gm="save-rules"><i class="fas fa-floppy-disk"></i> Save rules</button></footer>
    </form>
    <form class="cp-gm-perks">
      <section class="gp-hub-card"><div class="gp-hub-card-head"><i class="fas fa-gem"></i> Perks</div>
        <table class="gp-hub-table cp-perk-table"><thead><tr><th>Name</th><th>Fits</th><th>Description</th><th title="Weight multiplier">Weight ×</th><th title="Value multiplier">Value ×</th><th title="Added to a weapon's damage">+Damage</th><th title="Added to armour AC">+AC</th><th title="Tool durability multiplier">Durability ×</th><th></th></tr></thead>
          <tbody>${perkRows}</tbody></table>
        <p class="gp-hub-note">Blank effect = none. Effects change the crafted item itself; anything else (like Balanced's attack bonus) is described for the GM to apply.</p>
        <footer class="gp-hub-footer"><button type="button" class="gp-hub-ghost" data-cp-gm="add-perk"><i class="fas fa-plus"></i> Add perk</button>
          <button type="button" class="gp-hub-primary" data-cp-gm="save-perks"><i class="fas fa-floppy-disk"></i> Save perks</button></footer></section>
    </form>
    <section class="gp-hub-card"><div class="gp-hub-card-head"><i class="fas fa-box-open"></i> Items</div>
      <p class="gp-hub-note">Imports every product (and ${Object.values(CRAFTING_PROFESSIONS).filter(entry => entry.tool).map(entry => escape(entry.tool.name)).join(", ")}) into the world so players can craft them. Done automatically once; use this after adding modules.</p>
      <footer class="gp-hub-footer"><button type="button" class="gp-hub-ghost" data-cp-gm="prepare"><i class="fas fa-box-open"></i> Prepare items</button>
        <button type="button" class="gp-hub-ghost" data-cp-gm="recipes"><i class="fas fa-book-open"></i> Open Recipes</button></footer></section>
  </div>`;
}

/** Read the perk table from a form. */
export function readPerks(form, count) {
  const value = name => form.querySelector(`[name="${name}"]`)?.value ?? "";
  return Array.from({ length: count }, (_, index) => ({
    name: value(`perkName${index}`), fits: value(`perkFits${index}`), description: value(`perkDescription${index}`),
    effects: { weight: value(`perkWeight${index}`), value: value(`perkValue${index}`), damage: value(`perkDamage${index}`), ac: value(`perkAc${index}`), durability: value(`perkDurability${index}`) }
  })).filter(entry => String(entry.name).trim());
}

// Perk rows added or removed but not yet saved (kept across re-renders).
let draftPerks = null;

/** Handle a click inside the section; re-renders through `rerender`. */
export async function handleGmClick(event, root, rerender) {
  const button = event.target.closest?.("[data-cp-gm]");
  if (!button) return;
  event.preventDefault();
  const act = button.dataset.cpGm;
  const perkForm = root.querySelector(".cp-gm-perks");
  const perkCount = perkForm?.querySelectorAll("[data-perk-row]").length ?? 0;
  if (act === "save-rules") {
    const form = root.querySelector(".cp-gm-rules");
    const values = Object.fromEntries(Array.from(form.querySelectorAll("[name]")).map(input => [input.name, input.type === "checkbox" ? input.checked : input.value]));
    await saveCraftingRules(values);
    ui.notifications.info("Crafting rules saved.");
    return rerender();
  }
  if (act === "add-perk") { draftPerks = [...readPerks(perkForm, perkCount), { name: "New perk", fits: "any", description: "", effects: {} }]; return rerender(); }
  if (act === "remove-perk") {
    const name = perkForm.querySelector(`[name="perkName${button.dataset.index}"]`)?.value;
    draftPerks = readPerks(perkForm, perkCount).filter(entry => entry.name !== name);
    return rerender();
  }
  if (act === "save-perks") { await savePerks(readPerks(perkForm, perkCount)); draftPerks = null; ui.notifications.info("Perks saved."); return rerender(); }
  if (act === "prepare") {
    const result = await prepareItems();
    ui.notifications.info(`Crafting items: ${result.imported} imported, ${result.shared} made visible to players${result.missing.length ? `. Not found: ${result.missing.join(", ")}` : ""}.`);
    return;
  }
  if (act === "recipes") return game.modules.get("gathering-professions").api.openRecipes({ tab: Object.keys(CRAFTING_PROFESSIONS)[0] });
}

/** The GM hub section (Gathering Professions' hub, nav "Rules"; id kept as "crafting" for existing links). */
export const HUB_SECTION = Object.freeze({
  id: "crafting", label: "Rules", group: "Crafting Professions", icon: "fa-scale-balanced", order: 10,
  blurb: "Rules for every crafting profession: rank-up and knowledge modes, great results, bounty outcomes, ranks and tiers, perks, and items.",
  render: () => renderGm(craftingRules(), draftPerks ?? perkList()),
  onClick: (event, { hub, root }) => handleGmClick(event, root, () => hub.render()).catch(error => ui.notifications.error(error.message))
});

/** Open the GM hub on the crafting Rules section. */
export async function openGmWindow() {
  if (!game.user.isGM) return null;
  return game.modules.get("gathering-professions")?.api?.hub?.open("crafting");
}
