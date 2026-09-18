const HOSTS = new Map([
  ["www.k-ruoka.fi", "K-Ruoka"], ["k-ruoka.fi", "K-Ruoka"],
  ["www.valio.fi", "Valio"], ["valio.fi", "Valio"],
  ["www.yhteishyva.fi", "Yhteishyvä"], ["yhteishyva.fi", "Yhteishyvä"],
  ["www.kotikokki.net", "Kotikokki"], ["kotikokki.net", "Kotikokki"],
  ["www.martat.fi", "Martat"], ["martat.fi", "Martat"],
]);

function sourceFor(url) {
  try { return HOSTS.get(new URL(url).hostname.toLowerCase()) || null; }
  catch { return null; }
}

function clean(value = "") {
  return String(value).replace(/<[^>]*>/g, " ").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
}

function resultUrl(link) {
  try {
    const url = new URL(link.replace(/^http:/, "https:"));
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch { return ""; }
}

export function parseReaderSearchMarkdown(markdown = "") {
  const results = [];
  const seen = new Set();
  const pattern = /^##\s+\[([^\]]+)]\((https?:\/\/duckduckgo\.com\/l\/\?[^)]+)\)/gm;
  for (const match of markdown.matchAll(pattern)) {
    const url = resultUrl(match[2]);
    const source = sourceFor(url);
    if (!source || seen.has(url)) continue;
    seen.add(url);
    results.push({ title: clean(match[1]), url, source });
    if (results.length >= 10) break;
  }
  return results;
}

function recipeNode(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = recipeNode(item); if (found) return found; }
    return null;
  }
  if (typeof value !== "object") return null;
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.some((type) => String(type).toLowerCase() === "recipe")) return value;
  return recipeNode(value["@graph"]);
}

function duration(value = "") {
  const match = String(value).match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  return match ? Number(match[1] || 0) * 60 + Number(match[2] || 0) : 30;
}

function normalize(rawValue) {
  const raw = clean(String(rawValue).replace(/^[-*]\s*/, ""));
  const value = raw.replace(/^n\.\s*/i, "");
  const match = value.match(/^(\d+(?:[.,]\d+)?|[¼½¾])\s*(kg|g|l|dl|ml|rkl|tl|kpl|ps|pkt|prk|tlk|rs|ruukku)?\s*(.*)$/i);
  if (!match) return { name: raw, amount: null, unit: "", raw };
  const fractions = { "¼": .25, "½": .5, "¾": .75 };
  return {
    name: match[3].trim().replace(/^\([^)]*\)\s*/, "") || raw,
    amount: fractions[match[1]] ?? Number(match[1].replace(",", ".")),
    unit: (match[2] || "kpl").toLowerCase(), raw,
  };
}

function imageUrl(image) {
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return imageUrl(image[0]);
  return image?.url || image?.contentUrl || "";
}

export function extractReaderRecipe(html, url) {
  let node = null;
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { node = recipeNode(JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))); }
    catch { continue; }
    if (node) break;
  }
  if (!node || !Array.isArray(node.recipeIngredient) || !node.recipeIngredient.length) throw new Error("Reseptin ainesosia ei löytynyt.");
  const servings = String(node.recipeYield || "").match(/\d+/);
  return {
    id: `web-${new URL(url).pathname.split("/").filter(Boolean).pop() || Date.now()}`,
    name: clean(node.name || "Verkkoresepti"), emoji: "✦", time: duration(node.totalTime || node.prepTime || node.cookTime),
    tags: [sourceFor(url) === "K-Ruoka" ? "k-ruoka" : "verkko"], source: sourceFor(url), url,
    image: imageUrl(node.image), servings: servings ? Number(servings[0]) : 4,
    ingredients: node.recipeIngredient.map(normalize),
  };
}

export async function readerSearch(query, source = "kruoka") {
  const domain = source === "kruoka"
    ? "site:k-ruoka.fi/reseptit"
    : "(site:valio.fi/reseptit OR site:yhteishyva.fi/reseptit OR site:kotikokki.net/reseptit OR site:martat.fi/reseptit)";
  const target = `http://html.duckduckgo.com/html/?q=${encodeURIComponent(`${domain} ${String(query).slice(0, 80)} resepti`)}`;
  const response = await fetch(`https://r.jina.ai/${target}`, { headers: { "X-Return-Format": "markdown" } });
  if (!response.ok) throw new Error("Reseptihaku ei vastannut.");
  const results = parseReaderSearchMarkdown(await response.text());
  return source === "kruoka" ? results.filter((item) => item.source === "K-Ruoka") : results;
}

export async function readerImport(urlValue) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || !sourceFor(url.toString())) throw new Error("Reseptilähde ei ole tuettu.");
  const response = await fetch(`https://r.jina.ai/http://${url.host}${url.pathname}${url.search}`, { headers: { "X-Return-Format": "html" } });
  if (!response.ok) throw new Error("Reseptisivua ei voitu lukea.");
  return extractReaderRecipe(await response.text(), url.toString());
}
