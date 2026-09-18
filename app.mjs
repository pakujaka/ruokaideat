import { RECIPES, portionFactor, generateWeek, buildShoppingList } from "./planner.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const DAYS = ["Maanantai", "Tiistai", "Keskiviikko", "Torstai", "Perjantai", "Lauantai", "Sunnuntai"];
const SHORT_DAYS = ["MA", "TI", "KE", "TO", "PE", "LA", "SU"];
const recipeById = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));

const storage = {
  get(key, fallback) {
    try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

const saved = storage.get("ruokaviikko-state", {});
const state = {
  adults: Number(saved.adults) || 2,
  children: Number.isFinite(saved.children) ? saved.children : 2,
  focus: saved.focus || "kaikki",
  days: saved.days === 5 ? 5 : 7,
  plan: Array.isArray(saved.plan) ? saved.plan.map((id) => recipeById.get(id)).filter(Boolean) : [],
  locked: Array.isArray(saved.locked) ? saved.locked : [],
  checked: new Set(storage.get("ruokaviikko-checked", [])),
  view: "week",
};

function save() {
  storage.set("ruokaviikko-state", {
    adults: state.adults,
    children: state.children,
    focus: state.focus,
    days: state.days,
    plan: state.plan.map((recipe) => recipe.id),
    locked: state.locked,
  });
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 1800);
}

function formatAmount(amount, unit) {
  const rounded = Number.isInteger(amount) ? amount : Math.round(amount * 10) / 10;
  return `${String(rounded).replace(".", ",")} ${unit}`;
}

function portionText() {
  const people = state.adults + state.children;
  return `${state.adults} aikuista + ${state.children} lasta · ${people} annosta`;
}

function generate() {
  const lockedRecipes = Array.from({ length: state.days }, (_, index) => state.locked[index] ? state.plan[index] : null);
  state.plan = generateWeek({ days: state.days, focus: state.focus, locked: lockedRecipes });
  state.locked = Array.from({ length: state.days }, (_, index) => Boolean(state.locked[index]));
  state.checked.clear();
  storage.set("ruokaviikko-checked", []);
  save();
  render();
  toast("Uusi ruokaviikko arvottu");
}

function renderControls() {
  $("#adultsValue").textContent = state.adults;
  $("#childrenValue").textContent = state.children;
  $$("[data-focus]").forEach((button) => {
    const active = button.dataset.focus === state.focus;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  $$("[data-days]").forEach((button) => button.classList.toggle("active", Number(button.dataset.days) === state.days));
  $("#portionSummary").textContent = portionText();
  $("#mealCount").textContent = state.days;
}

function renderWeek() {
  const list = $("#mealList");
  list.innerHTML = state.plan.slice(0, state.days).map((recipe, index) => {
    const offerMatch = state.focus !== "kaikki" && recipe.tags.includes(state.focus);
    const factor = portionFactor(state.adults, state.children);
    const scaled = factor === 1 ? "Perusmäärä" : `${String(factor).replace(".", ",")}× määrä`;
    return `<article class="meal-card" style="--i:${index}">
      <div class="day"><strong>${SHORT_DAYS[index]}</strong><small>${DAYS[index]}</small></div>
      <div class="meal-emoji" aria-hidden="true">${recipe.emoji}</div>
      <div class="meal-copy"><h3>${recipe.name}</h3><div class="meta"><span>◷ ${recipe.time} min</span><span>${scaled}</span><span>${recipe.tags[0]}</span></div></div>
      ${offerMatch ? `<span class="offer-badge">● Tarjousidea</span>` : "<span></span>"}
      <button class="lock ${state.locked[index] ? "locked" : ""}" data-lock="${index}" aria-label="${state.locked[index] ? "Poista lukitus" : "Lukitse ruoka"}" title="${state.locked[index] ? "Lukittu" : "Lukitse"}">${state.locked[index] ? "●" : "○"}</button>
      <a class="recipe-link" href="${recipe.url}" target="_blank" rel="noopener" aria-label="Avaa ${recipe.name} resepti K-Ruoassa" title="Avaa resepti">↗</a>
    </article>`;
  }).join("");
  $$('[data-lock]', list).forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.lock);
    state.locked[index] = !state.locked[index];
    save();
    renderWeek();
    toast(state.locked[index] ? "Ruoka lukittu" : "Lukitus poistettu");
  }));
}

function renderShopping() {
  const factor = portionFactor(state.adults, state.children);
  const items = buildShoppingList(state.plan.slice(0, state.days), factor);
  $("#itemCount").textContent = items.length;
  $("#shoppingSummary").textContent = `${items.length} tuotetta · ${portionText()}`;
  $("#shoppingList").innerHTML = items.map((item) => {
    const key = `${item.name}|${item.unit}`;
    return `<label class="shop-item"><input type="checkbox" data-item="${key}" ${state.checked.has(key) ? "checked" : ""}><span>${item.name}</span><b>${formatAmount(item.amount, item.unit)}</b></label>`;
  }).join("");
  $$('[data-item]').forEach((checkbox) => checkbox.addEventListener("change", () => {
    checkbox.checked ? state.checked.add(checkbox.dataset.item) : state.checked.delete(checkbox.dataset.item);
    storage.set("ruokaviikko-checked", [...state.checked]);
  }));
}

function renderView() {
  const shopping = state.view === "shopping";
  $("#weekView").hidden = shopping;
  $("#shoppingView").hidden = !shopping;
  $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
}

function render() {
  renderControls();
  renderWeek();
  renderShopping();
  renderView();
}

$$("[data-counter]").forEach((button) => button.addEventListener("click", () => {
  const key = button.dataset.counter;
  const min = key === "adults" ? 1 : 0;
  state[key] = Math.max(min, Math.min(8, state[key] + Number(button.dataset.delta)));
  save();
  render();
}));

$$("[data-focus]").forEach((button) => button.addEventListener("click", () => {
  state.focus = button.dataset.focus;
  save();
  renderControls();
}));

$$("[data-days]").forEach((button) => button.addEventListener("click", () => {
  state.days = Number(button.dataset.days);
  state.locked = state.locked.slice(0, state.days);
  if (state.plan.length < state.days) generate(); else { save(); render(); }
}));

$$("[data-view]").forEach((button) => button.addEventListener("click", () => {
  state.view = button.dataset.view;
  renderView();
}));

$("#generateBtn").addEventListener("click", generate);
$("#clearChecks").addEventListener("click", () => {
  state.checked.clear();
  storage.set("ruokaviikko-checked", []);
  renderShopping();
  toast("Valinnat tyhjennetty");
});

if (state.plan.length < state.days) generate(); else render();
