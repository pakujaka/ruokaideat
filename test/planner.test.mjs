import test from "node:test";
import assert from "node:assert/strict";
import { portionFactor, generateWeek, buildShoppingList, RECIPES } from "../planner.mjs";

test("default family of two adults and two children uses recipe base quantities", () => {
  assert.equal(portionFactor(2, 2), 1);
});

test("portion factor scales recipes to the selected people count", () => {
  assert.equal(portionFactor(3, 2), 1.25);
  assert.equal(portionFactor(1, 1), 0.5);
});

test("weekly plan contains unique recipes and preserves locked days", () => {
  const first = generateWeek({ days: 7, focus: "kana", locked: [] });
  assert.equal(first.length, 7);
  assert.equal(new Set(first.map((recipe) => recipe.id)).size, 7);

  const second = generateWeek({ days: 7, focus: "kana", locked: [first[0], null, null, null, null, null, null] });
  assert.equal(second[0].id, first[0].id);
  assert.ok(second.filter((recipe) => recipe.tags.includes("kana")).length >= 2);
});

test("shopping list aggregates matching ingredients and scales quantities", () => {
  const pastaRecipes = RECIPES.filter((recipe) => ["makaronilaatikko", "kanamakaronilaatikko"].includes(recipe.id));
  const list = buildShoppingList(pastaRecipes, 1);
  const makaroni = list.find((item) => item.name === "makaroni");
  assert.equal(makaroni.amount, 800);
  assert.equal(makaroni.unit, "g");
});
