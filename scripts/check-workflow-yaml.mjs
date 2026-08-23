import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";

const paths = process.argv.slice(2);
if (paths.length === 0) throw new Error("Pass one or more workflow YAML files");
for (const path of paths) {
  const document = parseDocument(readFileSync(path, "utf8"), { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`${path}: ${document.errors.map((error) => error.message).join("; ")}`);
  }
}
console.log(JSON.stringify({ ok: true, files: paths }));
