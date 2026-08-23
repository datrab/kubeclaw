import fs from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const connectionString = process.env.PRISM_SPIKE_DATABASE_URL;
if (!connectionString) {
  console.error("Set PRISM_SPIKE_DATABASE_URL to a disposable PostgreSQL database with permission to install pgvector.");
  process.exit(2);
}

const rowCount = Number(process.env.PRISM_SPIKE_ROWS ?? 10000);
const client = new pg.Client({ connectionString, statement_timeout: 30000 });
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
  const values = Array.from({ length: 16 }, (_, index) => {
    const base = index === categoryIndex ? 1 : 0.02;
    return Number((base + (((variant + 1) * (index + 3)) % 17) / 10000).toFixed(6));
  });
  return `[${values.join(",")}]`;
};

const percentile = (values, ratio) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * ratio))];

try {
  await client.connect();
  await client.query(await fs.readFile(new URL("./schema.sql", import.meta.url), "utf8"));
  await client.query("BEGIN");
  for (let start = 1; start <= rowCount; start += 500) {
    const values = [];
    const placeholders = [];
    for (let id = start; id < Math.min(start + 500, rowCount + 1); id += 1) {
      const category = categories[id % categories.length];
      const status = id % 97 === 0 ? "restricted" : id % 131 === 0 ? "removed" : "active";
      const allow = id % 89 !== 0;
      const offset = values.length;
      values.push(id, `product-${id % 23}`, `source-${id % 17}`, category, status, allow,
        `${vocabulary[category]} example ${id}`, vectorFor(category, id));
      placeholders.push(`($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8}::vector)`);
    }
    await client.query(`INSERT INTO prism_spike.corpus_revision
      (id, product_family, source_family, category, status, allow_design_use, searchable_text, embedding)
      VALUES ${placeholders.join(",")}`, values);
  }
  await client.query("COMMIT");

  const queryCases = [
    ["password recovery secure error", "authentication"],
    ["dense operations monitoring status", "dashboard"],
    ["guided first use setup", "onboarding"],
    ["checkout cart payment", "commerce"],
    ["account permissions configuration", "settings"],
  ];
  const durations = [];
  let relevant = 0;
  let returned = 0;
  let recalled = 0;
  let recallTotal = 0;
  const firstOrders = new Map();
  for (let iteration = 0; iteration < 25; iteration += 1) {
    for (const [queryText, category] of queryCases) {
      const gold = await client.query(`SELECT id FROM prism_spike.corpus_revision
        WHERE status = 'active' AND allow_design_use AND category = $1
        ORDER BY embedding <=> $2::vector, id LIMIT 20`, [category, vectorFor(category)]);
      const goldIds = new Set(gold.rows.map((row) => String(row.id)));
      const start = performance.now();
      const result = await client.query(
        "SELECT * FROM prism_spike.search_corpus_v1($1, $2::vector, $3, 20, 100)",
        [queryText, vectorFor(category), category],
      );
      durations.push(performance.now() - start);
      const order = result.rows.map((row) => String(row.id)).join(",");
      if (iteration === 0) firstOrders.set(category, order);
      else if (firstOrders.get(category) !== order) throw new Error(`non-reproducible order for ${category}`);
      for (const row of result.rows.slice(0, 10)) {
        returned += 1;
        if (row.category === category) relevant += 1;
        if (row.status !== undefined || row.allow_design_use !== undefined) throw new Error("private eligibility fields leaked");
      }
      recalled += result.rows.slice(0, 20).filter((row) => goldIds.has(String(row.id))).length;
      recallTotal += goldIds.size;
      const families = new Set(result.rows.slice(0, 10).map((row) => row.product_family));
      if (families.size < 4) throw new Error(`diversity failure for ${category}`);
    }
  }
  const forbidden = await client.query("SELECT count(*)::int AS count FROM prism_spike.corpus_revision WHERE status <> 'active' OR NOT allow_design_use");
  const leaked = await client.query(`SELECT count(*)::int AS count FROM (
    SELECT s.id FROM prism_spike.search_corpus_v1($1, $2::vector, NULL, 1000, 2000) s
    JOIN prism_spike.corpus_revision c USING (id)
    WHERE c.status <> 'active' OR NOT c.allow_design_use
  ) q`, ["status", vectorFor("dashboard")]);
  if (Number(leaked.rows[0].count) !== 0) throw new Error("rights or status filter leaked a forbidden item");
  const precisionAt10 = relevant / returned;
  const recallAt20 = recalled / recallTotal;
  const report = {
    rows: rowCount,
    forbiddenFixtureRows: forbidden.rows[0].count,
    falseInclusions: leaked.rows[0].count,
    precisionAt10,
    recallAt20,
    p50Ms: Number(percentile(durations, 0.5).toFixed(2)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
    reproducible: true,
  };
  console.log(JSON.stringify(report, null, 2));
  if (precisionAt10 < 0.7 || recallAt20 < 0.8 || report.p95Ms > 300) process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
