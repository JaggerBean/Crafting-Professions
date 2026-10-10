// The "Crafting" section of Gathering Professions' profession menu (hammer
// button): choose a crafting profession, see rank and the next story goal,
// and (GM) promote, demote, set XP, add, or remove professions.
import { CRAFTING_PROFESSIONS, RANK_DIE } from "./professions.js";
import { craftingRules } from "./rules.js";
import { actorProfessions, rankOf, xpOf, readyForRank, chooseProfession, removeProfession, setRank, setXp, pathOf, talentsOf, talentSlots, chooseTalent, removeTalent, setPath } from "./state.js";
import { abilityFor, abilityUsed, useAbility } from "./abilities.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function abilityHtml(actor, key, canEdit) {
  const ability = abilityFor(actor, key);
  if (!ability) return "";
  const used = abilityUsed(actor, key);
  const profession = CRAFTING_PROFESSIONS[key];
  const pathSelect = canEdit && profession.abilities?.wanderer ? `<select data-cp-path="${key}" title="Standard or Wanderer ability">
      <option value="standard" ${pathOf(actor, key) === "standard" ? "selected" : ""}>${escape(profession.abilities.standard.name)}</option>
      <option value="wanderer" ${pathOf(actor, key) === "wanderer" ? "selected" : ""}>${escape(profession.abilities.wanderer.name)} (Wanderer)</option></select>` : "";
  return `<div class="cp-ability"><div><i class="fas fa-bolt"></i> <strong>${escape(ability.name)}</strong>${pathOf(actor, key) === "wanderer" ? " <small>(Wanderer)</small>" : ""}
      <button type="button" data-cp-act="ability" data-cp-key="${key}" ${used ? "disabled" : ""} title="${used ? "Used: recharges on a long rest" : "1 hour; DC " + ability.dc}"><i class="fas fa-dice-d20"></i> ${used ? "Used" : "Use"}</button>${pathSelect}</div>
      <small>${escape(ability.text)}</small></div>`;
}

function talentsHtml(actor, key, canEdit) {
  const profession = CRAFTING_PROFESSIONS[key];
  if (!profession.talents?.length) return "";
  const owned = talentsOf(actor, key).map(id => profession.talents.find(row => row.id === id)).filter(Boolean);
  const slots = talentSlots(actor, key);
  const free = profession.talents.filter(row => !owned.includes(row));
  const canPick = free.length && (canEdit || slots > 0);
  return `<div class="cp-talents-list"><div><i class="fas fa-star-half-stroke"></i> <strong>Talents</strong>${slots > 0 ? ` <span class="cp-ready-inline">${slots} to choose</span>` : ""}</div>
      ${owned.map(row => `<div class="cp-talent" title="${escape(row.text)}"><strong>${escape(row.name)}</strong> <small>${escape(row.text)}</small>
        ${canEdit ? `<button type="button" class="gp-rw-iconbtn" data-cp-act="remove-talent" data-cp-key="${key}" data-cp-talent="${row.id}" title="Remove talent"><i class="fas fa-xmark"></i></button>` : ""}</div>`).join("") || '<small>None yet.</small>'}
      ${canPick ? `<div class="cp-choose"><select data-cp-talent-choice="${key}">${free.map(row => `<option value="${row.id}" title="${escape(row.text)}">${escape(row.name)}: ${escape(row.text)}</option>`).join("")}</select>
        <button type="button" data-cp-act="talent" data-cp-key="${key}"><i class="fas fa-plus"></i> ${slots > 0 ? "Choose talent" : "Add talent (GM)"}</button></div>` : ""}
    </div>`;
}

/** Ask which ability path to take (standard or Wanderer). */
async function askPath(key) {
  const profession = CRAFTING_PROFESSIONS[key];
  if (!profession.abilities?.wanderer) return "standard";
  const { standard, wanderer } = profession.abilities;
  return foundry.applications.api.DialogV2.wait({
    window: { title: `${profession.label}: choose your ability` }, classes: ["gathering-professions-ui", "gp-dialog"],
    content: `<p>Choose once (the GM can change it later):</p>
      <p><strong>${escape(standard.name)}</strong> (needs a forge): ${escape(standard.text)}</p>
      <p><strong>${escape(wanderer.name)}</strong> (Wanderer, on the road): ${escape(wanderer.text)}</p>`,
    buttons: [{ action: "standard", label: standard.name, default: true }, { action: "wanderer", label: `${wanderer.name} (Wanderer)` }],
    rejectClose: false
  });
}

/** HTML for the section. Pure apart from game lookups; unit tested. */
export function craftingSectionHtml(actor, canEdit, rules = craftingRules()) {
  const owned = actorProfessions(actor);
  const keys = Object.keys(owned).filter(key => CRAFTING_PROFESSIONS[key]);
  const cards = keys.map(key => {
    const profession = CRAFTING_PROFESSIONS[key];
    const rank = rankOf(actor, key);
    const xp = xpOf(actor, key);
    const next = rank < 5 ? rules.rankXp[rank] : null;
    const ready = rules.rankUpMode === "gm" ? readyForRank(actor, key, rules) : null;
    const goal = rank < 5 ? profession.ranks[rank - 1]?.goal : "";
    return `<div class="cp-card">
      <div class="cp-card-head"><i class="fas ${escape(profession.icon)}"></i> <strong>${escape(profession.label)}</strong>
        <span class="cp-title">Rank ${rank} · ${escape(profession.ranks[rank - 1]?.title ?? "")}</span> <span class="gp-die-badge">d${RANK_DIE[rank - 1]}</span></div>
      <div class="cp-xp">${xp} XP${next !== null ? ` · next rank at ${next}` : " · highest rank"}</div>
      ${goal ? `<div class="cp-goal" title="Story goal for the next rank"><i class="fas fa-flag"></i> ${escape(goal)}</div>` : ""}
      ${ready ? `<div class="cp-ready"><i class="fas fa-star"></i> Ready for Rank ${ready}${rules.rankUpMode === "gm" ? " once the GM confirms the story goal" : ""}.</div>` : ""}
      ${abilityHtml(actor, key, canEdit)}
      ${talentsHtml(actor, key, canEdit)}
      ${canEdit ? `<div class="cp-gm">
        ${rank < 5 ? `<button type="button" data-cp-act="promote" data-cp-key="${key}"><i class="fas fa-arrow-up"></i> Promote</button>` : ""}
        ${rank > 1 ? `<button type="button" data-cp-act="demote" data-cp-key="${key}"><i class="fas fa-arrow-down"></i> Demote</button>` : ""}
        <label>XP <input type="number" min="0" step="1" value="${xp}" data-cp-xp="${key}"></label><button type="button" data-cp-act="set-xp" data-cp-key="${key}">Set</button>
        <button type="button" data-cp-act="remove" data-cp-key="${key}" title="Remove this crafting profession (XP is kept if it returns)"><i class="fas fa-trash"></i></button>
      </div>` : ""}
    </div>`;
  }).join("");
  const available = Object.values(CRAFTING_PROFESSIONS).filter(entry => !owned[entry.key]);
  const canChoose = available.length && (canEdit || !keys.length);
  const chooser = canChoose ? `<div class="cp-choose"><select data-cp-choice>${available.map(entry => `<option value="${entry.key}">${escape(entry.label)}</option>`).join("")}</select>
      <button type="button" data-cp-act="choose"><i class="fas fa-plus"></i> ${canEdit ? "Add crafting profession" : "Choose crafting profession"}</button></div>
      ${canEdit ? "" : '<p class="hint">You can choose one crafting profession. Another takes a story arc: ask the GM.</p>'}` : "";
  return `<h3><i class="fas fa-hammer"></i> Crafting professions</h3>${cards || '<p class="hint">No crafting profession yet.</p>'}${chooser}`;
}

export function registerMenu(gpApi) {
  Hooks.on("gatheringProfessions.menuSections", ({ actor, canEdit, sections }) => {
    sections.push({ html: craftingSectionHtml(actor, canEdit) });
  });
  Hooks.on("gatheringProfessions.menuRender", ({ actor, element, dialog }) => {
    element.querySelectorAll("[data-cp-path]").forEach(select => select.addEventListener("change", async () => {
      try { await setPath(actor, select.dataset.cpPath, select.value); ui.notifications.info("Ability changed."); }
      catch (error) { ui.notifications.error(error.message); }
    }));
    element.querySelectorAll("[data-cp-act]").forEach(button => button.addEventListener("click", async event => {
      event.preventDefault();
      const key = button.dataset.cpKey;
      try {
        const act = button.dataset.cpAct;
        if (act === "choose") {
          const choice = element.querySelector("[data-cp-choice]")?.value;
          const path = await askPath(choice);
          if (!path) return;
          await chooseProfession(actor, choice, { path });
          ui.notifications.info(`${actor.name} became a ${CRAFTING_PROFESSIONS[choice].label}.`);
        }
        if (act === "promote") await setRank(actor, key, rankOf(actor, key) + 1);
        if (act === "demote") await setRank(actor, key, rankOf(actor, key) - 1);
        if (act === "set-xp") await setXp(actor, key, Number(element.querySelector(`[data-cp-xp="${key}"]`)?.value));
        if (act === "remove") await removeProfession(actor, key);
        if (act === "talent") await chooseTalent(actor, key, element.querySelector(`[data-cp-talent-choice="${key}"]`)?.value);
        if (act === "remove-talent") await removeTalent(actor, key, button.dataset.cpTalent);
        if (act === "ability") { await dialog.close(); await useAbility(actor, key); return; }
        // Reopen so the section shows the change.
        await dialog.close();
        await gpApi.openProgressEditor(actor);
      } catch (error) {
        console.error("crafting-professions:", error);
        ui.notifications.error(error.message || "That did not work.");
      }
    }));
  });
}
