import test from "node:test";
import assert from "node:assert/strict";
import { parseReaderSearchMarkdown, extractReaderRecipe } from "../recipe-reader.mjs";

test("parses allowed recipe results from Jina DuckDuckGo markdown", () => {
  const markdown = `## [Lohikeitto | K-Ruoka](http://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.k-ruoka.fi%2Freseptit%2Flohikeitto&rut=x)\n\n## [Video](http://duckduckgo.com/l/?uddg=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Dx&rut=y)`;
  const results = parseReaderSearchMarkdown(markdown);
  assert.equal(results.length, 1);
  assert.equal(results[0].source, "K-Ruoka");
  assert.equal(results[0].url, "https://www.k-ruoka.fi/reseptit/lohikeitto");
});

test("extracts structured ingredients from Jina HTML", () => {
  const html = `<script type="application/ld+json">{"@type":"Recipe","name":"Lohikeitto","recipeYield":"4 annosta","totalTime":"PT35M","recipeIngredient":["400 g lohta","2 dl kermaa"]}</script>`;
  const recipe = extractReaderRecipe(html, "https://www.k-ruoka.fi/reseptit/lohikeitto");
  assert.equal(recipe.name, "Lohikeitto");
  assert.equal(recipe.ingredients.length, 2);
  assert.deepEqual(recipe.ingredients[0], { name: "lohta", amount: 400, unit: "g", raw: "400 g lohta" });
});
