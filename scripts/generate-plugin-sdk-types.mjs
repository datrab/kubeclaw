import fs from 'node:fs';
import { compile } from 'json-schema-to-typescript';

const check = process.argv.includes('--check');
const schemaPath = 'skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json';
const outputPath = 'skills/common/plugin-runtime/sdk/src/generated/contracts.ts';
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const names = Object.keys(schema.$defs).filter((name) => ![
  'namespacedId', 'localId', 'opaqueId', 'relativeModulePath',
  'relativeSchemaPath', 'jsonObject', 'reason', 'resultBase',
].includes(name));
const wrapper = {
  ...schema,
  title: 'PluginSystemV2',
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(names.map((name) => [name, { $ref: `#/$defs/${name}` }])),
};
const generated = await compile(wrapper, 'PluginSystemV2', {
  bannerComment: '// Generated from skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json. Do not edit.\n',
  unknownAny: false,
  style: { singleQuote: true },
});
if (check) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== generated) {
    throw new Error(`${outputPath} is stale; run npm run plugin-system:sdk:generate`);
  }
} else {
  fs.mkdirSync(new URL('../skills/common/plugin-runtime/sdk/src/generated/', import.meta.url), { recursive: true });
  fs.writeFileSync(outputPath, generated);
}
