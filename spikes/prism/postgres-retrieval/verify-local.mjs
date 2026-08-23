import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const rowCount = Number(process.env.PRISM_SPIKE_ROWS ?? 10000);
const categories = ["authentication", "dashboard", "onboarding", "commerce", "settings"];
const vocabulary = {
  authentication: "sign in password recovery identity secure error",
  dashboard: "dense technical operations status filtering monitoring",
  onboarding: "welcome setup progress guidance first use",
  commerce: "catalog product cart checkout payment",
  settings: "account preferences permissions configuration",
};
const vectorFor = (category, variant = 0) => {
  const categoryIndex = categories.indexOf(category);
  return `[${Array.from({ length: 16 }, (_, index) => {
    const base = index === categoryIndex ? 1 : 0.02;
    return Number((base + (((variant + 1) * (index + 3)) % 17) / 10000).toFixed(6));
  }).join(",")}]`;
};
const percentile = (values, ratio) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * ratio))];

const db = new PGlite({ extensions: { vector } });
await db.exec(await fs.readFile(new URL("./schema.sql", import.meta.url), "utf8"));
for (let start = 1; start <= rowCount; start += 250) {
  await db.transaction(async (transaction) => {
    for (let id = start; id < Math.min(start + 250, rowCount + 1); id += 1) {
      const category = categories[id % categories.length];
      const status = id % 97 === 0 ? "restricted" : id % 131 === 0 ? "removed" : "active";
      await transaction.query(`INSERT INTO prism_spike.corpus_revision
        (id, product_family, source_family, category, status, allow_design_use, searchable_text, embedding)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector)`, [id, `product-${id % 23}`, `source-${id % 17}`,
        category, status, id % 89 !== 0, `${vocabulary[category]} example ${id}`, vectorFor(category, id)]);
    }
  });
}

const cases = [
  ["password recovery secure error", "authentication"],
  ["dense operations monitoring status", "dashboard"],
  ["guided first use setup", "onboarding"],
  ["checkout cart payment", "commerce"],
  ["account permissions configuration", "settings"],
];
const durations = [];
let relevant = 0;
let returned = 0;
const orders = new Map();
for (let iteration = 0; iteration < 10; iteration += 1) {
  for (const [text, category] of cases) {
    const started = performance.now();
    const result = await db.query("SELECT * FROM prism_spike.search_corpus_v1($1, $2::vector, $3, 20, 100)",
      [text, vectorFor(category), category]);
    durations.push(performance.now() - started);
    const order = result.rows.map((row) => row.id).join(",");
    const previous = orders.get(category);
    if (previous && previous !== order) throw new Error(`non-deterministic order for ${category}`);
    orders.set(category, order);
    for (const row of result.rows.slice(0, 10)) {
      returned += 1;
      if (row.category === category) relevant += 1;
    }
    if (new Set(result.rows.slice(0, 10).map((row) => row.product_family)).size < 4) {
      throw new Error(`diversity failure for ${category}`);
    }
  }
}
const leak = await db.query(`SELECT count(*)::int AS count FROM (
  SELECT s.id FROM prism_spike.search_corpus_v1($1, $2::vector, NULL, 1000, 2000) s
  JOIN prism_spike.corpus_revision c USING (id)
  WHERE c.status <> 'active' OR NOT c.allow_design_use
) q`, ["status", vectorFor("dashboard")]);
const report = {
  engine: "PGlite PostgreSQL WASM with pgvector",
  rows: rowCount,
  falseInclusions: leak.rows[0].count,
  precisionAt10: relevant / returned,
  p50Ms: Number(percentile(durations, 0.5).toFixed(2)),
  p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
  reproducible: orders.size === cases.length,
};
console.log(JSON.stringify(report, null, 2));
if (Number(report.falseInclusions) !== 0 || report.precisionAt10 < 0.7 || report.p95Ms > 300 || !report.reproducible) {
  process.exitCode = 1;
}
await db.close();
