import { RECIPES, portionFactor, generateWeek, buildShoppingList } from "./planner.mjs";
import { readerImport, readerSearch } from "./recipe-reader.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const DAYS = ["Maanantai", "Tiistai", "Keskiviikko", "Torstai", "Perjantai", "Lauantai", "Sunnuntai"];
const SHORT_DAYS = ["MA", "TI", "KE", "TO", "PE", "LA", "SU"];

const storage = {
  get(key, fallback) {
    try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

const saved = storage.get("ruokaviikko-state", {});
const customRecipes = storage.get("ruokaviikko-custom-recipes", []);
const initialMap = new Map([...RECIPES, ...customRecipes].map((recipe) => [recipe.id, recipe]));
const state = {
  adults: Number(saved.adults) || 2,
  children: Number.isFinite(saved.children) ? saved.children : 2,
  focus: saved.focus || "kaikki",
  days: saved.days === 5 ? 5 : 7,
  plan: Array.isArray(saved.plan) ? saved.plan.map((id) => initialMap.get(id)).filter(Boolean) : [],
  locked: Array.isArray(saved.locked) ? saved.locked : [],
  checked: new Set(storage.get("ruokaviikko-checked", [])),
  customRecipes: Array.isArray(customRecipes) ? customRecipes : [],
  view: "week",
  searchSource: "kruoka",
  searchResults: [],
  pendingRecipe: null,
};

function catalog() {
  return [...new Map([...RECIPES, ...state.customRecipes].map((recipe) => [recipe.id, recipe])).values()];
}

function save() {
  storage.set("ruokaviikko-state", {
    adults: state.adults, children: state.children, focus: state.focus, days: state.days,
    plan: state.plan.map((recipe) => recipe.id), locked: state.locked,
  });
  storage.set("ruokaviikko-custom-recipes", state.customRecipes);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

function formatAmount(amount, unit = "") {
  if (!Number.isFinite(amount)) return "tarpeen mukaan";
  const rounded = Number.isInteger(amount) ? amount : Math.round(amount * 10) / 10;
  return `${String(rounded).replace(".", ",")} ${unit}`.trim();
}

function ingredientParts(ingredient) {
  if (Array.isArray(ingredient)) return { name: ingredient[0], amount: ingredient[1], unit: ingredient[2], raw: null };
  return ingredient;
}

function portionText() {
  const people = state.adults + state.children;
  return `${state.adults} aikuista + ${state.children} lasta · ${people} annosta`;
}

function generate() {
  const lockedRecipes = Array.from({ length: state.days }, (_, index) => state.locked[index] ? state.plan[index] : null);
  state.plan = generateWeek({ days: state.days, focus: state.focus, locked: lockedRecipes, recipes: catalog() });
  state.locked = Array.from({ length: state.days }, (_, index) => Boolean(state.locked[index]));
  state.checked.clear();
  storage.set("ruokaviikko-checked", []);
  save(); render(); toast("Uusi ruokaviikko arvottu");
}

function renderControls() {
  $("#adultsValue").textContent = state.adults;
  $("#childrenValue").textContent = state.children;
  $$("[data-focus]").forEach((button) => button.classList.toggle("active", button.dataset.focus === state.focus));
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
      <div class="meal-main"><div class="meal-visual" aria-hidden="true">${escapeHtml(recipe.emoji || "✦")}</div><div class="meal-copy"><h3>${escapeHtml(recipe.name)}</h3><div class="meta"><span>◷ ${Number(recipe.time) || 30} min</span><span>${scaled}</span><span class="source-pill">${escapeHtml(recipe.source || "Resepti")}</span></div></div></div>
      ${offerMatch ? '<span class="offer-dot" title="Tarjouspainotus"></span>' : "<span></span>"}
      <div class="meal-actions"><button class="icon-button" data-details="${index}" aria-label="Näytä ainekset" title="Näytä ainekset">≡</button><button class="icon-button ${state.locked[index] ? "locked" : ""}" data-lock="${index}" aria-label="${state.locked[index] ? "Poista lukitus" : "Lukitse ruoka"}" title="Lukitse">${state.locked[index] ? "●" : "○"}</button></div>
    </article>`;
  }).join("");
  $$('[data-lock]', list).forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.lock);
    state.locked[index] = !state.locked[index]; save(); renderWeek();
    toast(state.locked[index] ? "Ruoka lukittu" : "Lukitus poistettu");
  }));
  $$('[data-details]', list).forEach((button) => button.addEventListener("click", () => showRecipe(state.plan[Number(button.dataset.details)], false)));
}

function renderShopping() {
  const factor = portionFactor(state.adults, state.children);
  const items = buildShoppingList(state.plan.slice(0, state.days), factor);
  $("#itemCount").textContent = items.length;
  $("#shoppingSummary").textContent = `${items.length} tuotetta · ${portionText()}`;
  $("#shoppingList").innerHTML = items.map((item) => {
    const key = `${item.name}|${item.unit}`;
    return `<label class="shop-item"><input type="checkbox" data-item="${escapeHtml(key)}" ${state.checked.has(key) ? "checked" : ""}><span>${escapeHtml(item.name)}</span><b>${escapeHtml(formatAmount(item.amount, item.unit))}</b></label>`;
  }).join("");
  $$('[data-item]').forEach((checkbox) => checkbox.addEventListener("change", () => {
    checkbox.checked ? state.checked.add(checkbox.dataset.item) : state.checked.delete(checkbox.dataset.item);
    storage.set("ruokaviikko-checked", [...state.checked]);
  }));
}

function renderView() {
  const views = { week: "#weekView", search: "#searchView", shopping: "#shoppingView" };
  Object.entries(views).forEach(([name, selector]) => { $(selector).hidden = state.view !== name; });
  $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
}

function render() { renderControls(); renderWeek(); renderShopping(); renderView(); }

function showRecipe(recipe, canAdd = true) {
  state.pendingRecipe = recipe;
  const people = state.adults + state.children;
  const factor = people / (recipe.servings || 4);
  const ingredients = recipe.ingredients.map(ingredientParts);
  $("#dialogContent").innerHTML = `<div class="dialog-hero"><small>${escapeHtml(recipe.source || "Resepti")}</small><h2>${escapeHtml(recipe.name)}</h2><p>◷ ${Number(recipe.time) || 30} min · ${people} annosta</p></div>
    <div class="ingredient-title"><b>Ainekset</b><span>${ingredients.length} ainesosaa</span></div>
    <ul class="ingredient-list">${ingredients.map((item) => `<li><span>${escapeHtml(item.name)}</span><b>${escapeHtml(formatAmount(Number.isFinite(item.amount) ? item.amount * factor : null, item.unit))}</b></li>`).join("")}</ul>`;
  $("#dialogSource").href = recipe.url;
  $("#addRecipeBtn").hidden = !canAdd;
  const dialog = $("#recipeDialog");
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
}

function normalizeForPlan(recipe) {
  const base = Number(recipe.servings) || 4;
  const scale = 4 / base;
  return {
    ...recipe,
    id: `${recipe.id}-${Math.abs([...recipe.url].reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0))}`,
    servings: 4,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      amount: Number.isFinite(ingredient.amount) ? Math.round(ingredient.amount * scale * 100) / 100 : null,
    })),
  };
}

function addPendingRecipe() {
  if (!state.pendingRecipe) return;
  const recipe = normalizeForPlan(state.pendingRecipe);
  const existing = state.customRecipes.findIndex((item) => item.url === recipe.url);
  if (existing >= 0) state.customRecipes[existing] = recipe; else state.customRecipes.push(recipe);
  const target = Array.from({ length: state.days }, (_, index) => index).find((index) => !state.locked[index]);
  if (target === undefined) { toast("Poista ensin yhden päivän lukitus"); return; }
  state.plan[target] = recipe;
  state.locked[target] = true;
  state.checked.clear(); storage.set("ruokaviikko-checked", []);
  save(); $("#recipeDialog").close(); state.view = "week"; render();
  window.scrollTo({ top: $(".tabs").offsetTop - 12, behavior: "smooth" });
  toast(`${recipe.name} lisätty ${DAYS[target].toLowerCase()}lle`);
}

async function importResult(index, button) {
  const result = state.searchResults[index];
  if (!result) return;
  button.disabled = true; button.classList.add("loading"); button.textContent = "Haetaan";
  try {
    let recipe;
    try {
      const response = await fetch("./api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: result.url }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      recipe = payload.recipe;
    } catch {
      recipe = await readerImport(result.url);
    }
    showRecipe(recipe, true);
  } catch (error) { toast(error.message || "Aineksia ei voitu hakea"); }
  finally { button.disabled = false; button.classList.remove("loading"); button.textContent = "Hae ainekset"; }
}

function renderSearchResults() {
  const container = $("#searchResults");
  container.innerHTML = state.searchResults.map((result, index) => `<article class="result-card"><div><small>${escapeHtml(result.source)}</small><h3>${escapeHtml(result.title)}</h3></div><button data-import="${index}">Hae ainekset</button></article>`).join("");
  $$('[data-import]', container).forEach((button) => button.addEventListener("click", () => importResult(Number(button.dataset.import), button)));
}

async function search(query) {
  const status = $("#searchStatus");
  status.classList.add("loading"); status.textContent = "Haetaan reseptejä"; state.searchResults = []; renderSearchResults();
  try {
    try {
      const response = await fetch(`./api/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(state.searchSource)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      state.searchResults = payload.results || [];
    } catch {
      state.searchResults = await readerSearch(query, state.searchSource);
    }
    status.textContent = state.searchResults.length ? `${state.searchResults.length} reseptiä löytyi` : "Reseptejä ei löytynyt. Kokeile lyhyempää hakusanaa.";
    renderSearchResults();
  } catch (error) { status.textContent = error.message || "Haku epäonnistui. Yritä hetken kuluttua uudelleen."; }
  finally { status.classList.remove("loading"); }
}

$$("[data-counter]").forEach((button) => button.addEventListener("click", () => {
  const key = button.dataset.counter; const min = key === "adults" ? 1 : 0;
  state[key] = Math.max(min, Math.min(8, state[key] + Number(button.dataset.delta))); save(); render();
}));
$$("[data-focus]").forEach((button) => button.addEventListener("click", () => { state.focus = button.dataset.focus; save(); renderControls(); }));
$$("[data-days]").forEach((button) => button.addEventListener("click", () => {
  state.days = Number(button.dataset.days); state.locked = state.locked.slice(0, state.days);
  if (state.plan.length < state.days) generate(); else { save(); render(); }
}));
$$("[data-view]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; renderView(); }));
$$("[data-search-source]").forEach((button) => button.addEventListener("click", () => {
  state.searchSource = button.dataset.searchSource;
  $$("[data-search-source]").forEach((item) => item.classList.toggle("active", item === button));
}));
$$("[data-query]").forEach((button) => button.addEventListener("click", () => { $("#searchInput").value = button.dataset.query; search(button.dataset.query); }));
$("#searchForm").addEventListener("submit", (event) => { event.preventDefault(); search($("#searchInput").value.trim()); });
$("#generateBtn").addEventListener("click", generate);
$("#clearChecks").addEventListener("click", () => { state.checked.clear(); storage.set("ruokaviikko-checked", []); renderShopping(); toast("Valinnat tyhjennetty"); });
$("#addRecipeBtn").addEventListener("click", addPendingRecipe);
$("[data-close-dialog]").addEventListener("click", () => $("#recipeDialog").close());
$("#recipeDialog").addEventListener("click", (event) => { if (event.target === $("#recipeDialog")) $("#recipeDialog").close(); });

if (state.plan.length < state.days) generate(); else render();
