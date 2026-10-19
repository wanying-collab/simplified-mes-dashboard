(function (host) {
  "use strict";
  const SUFFIX = "-毛胚";
  const exactKey = (name) => `product-alias:${JSON.stringify(name)}`;
  function buildCatalog(names, exclusions = new Set()) {
    const counts = new Map();
    for (const name of names) {
      if (typeof name === "string" && name.trim()) counts.set(name, (counts.get(name) || 0) + 1);
    }
    const pairs = [];
    const uses = new Map();
    for (const canonical of counts.keys()) {
      if (!canonical.endsWith(SUFFIX)) continue;
      const base = canonical.slice(0, -SUFFIX.length);
      if (!base || !counts.has(base)) continue;
      pairs.push({ base, canonical, baseCount: counts.get(base), canonicalCount: counts.get(canonical) });
      for (const name of [base, canonical]) uses.set(name, (uses.get(name) || 0) + 1);
    }
    const aliases = new Map();
    for (const pair of pairs) {
      pair.ambiguous = uses.get(pair.base) > 1 || uses.get(pair.canonical) > 1;
      pair.excluded = exclusions.has(pair.base);
      pair.enabled = !pair.ambiguous && !pair.excluded;
      // Exact keys prevent the existing relaxed punctuation normalization merging near-matches.
      for (const name of [pair.base, pair.canonical]) {
        const canonical = pair.enabled ? pair.canonical : name;
        aliases.set(name, { canonical, key: exactKey(canonical) });
      }
    }
    return { aliases, pairs: pairs.sort((a, b) => a.base.localeCompare(b.base, "zh-Hant")) };
  }
  function projectOrder(order, catalog, originalSpecs, normalize) {
    const specs = [...new Set(originalSpecs.filter((name) => typeof name === "string" && name.trim()))];
    if (!specs.some((name) => catalog.aliases.has(name))) return order;
    const resolved = specs.map((name) => catalog.aliases.get(name) || { canonical: name, key: exactKey(name) });
    if (new Set(resolved.map((item) => item.key)).size !== 1) {
      return { ...order, originalProductSpec: order.productSpec, originalProductSpecs: specs,
        productGroupKey: `product-conflict:${JSON.stringify(order.workOrderNo)}`, productClassificationNote: "同製令單存在不同品名，待人工確認，不自動歸類" };
    }
    const { canonical, key } = resolved[0];
    return { ...order, originalProductSpec: order.productSpec, originalProductSpecs: specs,
      productSpec: canonical, normalizedProductSpec: normalize(canonical), productGroupKey: key,
      searchText: `${order.searchText || ""} ${canonical} ${specs.join(" ")}` };
  }
  function exportSettings(exclusions) {
    return { kind: "mes-product-classification", version: 1, excludedBases: [...exclusions].sort() };
  }
  function parseSettings(input) {
    const data = typeof input === "string" ? JSON.parse(input) : input;
    if (!data || data.kind !== "mes-product-classification" || data.version !== 1 || !Array.isArray(data.excludedBases)
      || data.excludedBases.some((name) => typeof name !== "string" || !name.trim() || name.length > 2000)) {
      throw new Error("不是有效的品名歸類排除設定，未取代目前設定。");
    }
    return new Set(data.excludedBases);
  }
  const api = { buildCatalog, projectOrder, exportSettings, parseSettings };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else host.MESProductClassification = api;
})(typeof window !== "undefined" ? window : globalThis);
