(function (host) {
  "use strict";
  const SUFFIX = "-毛胚";
  const exactKey = (name) => `product-alias:${JSON.stringify(name)}`;
  // Do not normalize dimensions, case, internal spaces or processing-stage suffixes.
  const normalizeName = (name) => name.trim().replace(/，/g, ",").replace(/\s*,\s*/g, ",");
  function setPairEnabled(exclusions, base, enabled) {
    const next = new Set(exclusions);
    if (enabled) {
      for (const name of next) if (normalizeName(name) === normalizeName(base)) next.delete(name);
    } else next.add(base);
    return next;
  }
  function buildCatalog(names, exclusions = new Set()) {
    const counts = new Map();
    const variants = new Map();
    for (const name of names) {
      if (typeof name !== "string" || !name.trim()) continue;
      const key = normalizeName(name);
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!variants.has(key)) variants.set(key, new Set());
      variants.get(key).add(name);
    }
    const excludedKeys = new Set([...exclusions].map(normalizeName));
    const pairs = [];
    const uses = new Map();
    for (const canonical of counts.keys()) {
      if (!canonical.endsWith(SUFFIX)) continue;
      const base = canonical.slice(0, -SUFFIX.length);
      if (!base || !counts.has(base)) continue;
      pairs.push({ base, canonical, baseNames: [...variants.get(base)], canonicalNames: [...variants.get(canonical)],
        baseCount: counts.get(base), canonicalCount: counts.get(canonical) });
      for (const name of [base, canonical]) uses.set(name, (uses.get(name) || 0) + 1);
    }
    const aliases = new Map();
    for (const pair of pairs) {
      pair.ambiguous = uses.get(pair.base) > 1 || uses.get(pair.canonical) > 1;
      pair.excluded = excludedKeys.has(pair.base);
      pair.enabled = !pair.ambiguous && !pair.excluded;
      // Disabled or ambiguous pairs retain raw names and exact grouping keys.
      for (const name of [...pair.baseNames, ...pair.canonicalNames]) {
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
  const api = { buildCatalog, projectOrder, exportSettings, parseSettings, normalizeName, setPairEnabled };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else host.MESProductClassification = api;
})(typeof window !== "undefined" ? window : globalThis);
