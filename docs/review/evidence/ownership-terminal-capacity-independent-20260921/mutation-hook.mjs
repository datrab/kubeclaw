import { registerHooks } from "node:module";
const changes = {
  admission: [
    "ownership-store.ts",
    "ownershipTerminalCapacityBytes(state, this.#maximumBytes);",
    "void state;",
    2,
  ],
  observation: [
    "ownership-capacity.ts",
    "finalObservation: record.finalObservation ?? maximumObservation",
    "finalObservation: record.finalObservation",
    1,
  ],
};
const selected = changes[process.env.OWNERSHIP_REVIEW_MUTANT];
if (!selected) throw new Error("independent mutation name required");
registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.endsWith("/worker/" + selected[0])) return loaded;
    const source =
      typeof loaded.source === "string"
        ? loaded.source
        : Buffer.from(loaded.source).toString();
    if (source.split(selected[1]).length - 1 !== selected[3])
      throw new Error("independent mutation site mismatch");
    return { ...loaded, source: source.replaceAll(selected[1], selected[2]) };
  },
});
