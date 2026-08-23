import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validatePrism } from "../src/index.ts";
import { schemaDigest } from "../src/digest.ts";

const fixture = JSON.parse(
  await readFile(
    new URL("../fixtures/minimal-web.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(validatePrism("designDocument", fixture), fixture);
assert.match(schemaDigest(), /^sha256:[a-f0-9]{64}$/);
assert.doesNotThrow(() =>
  validatePrism("designRequest", {
    schema: "prism.design-request.v1",
    projectId: "project-one",
    architecture: {
      artifactId: `artifact:sha256:${"a".repeat(64)}`,
      contentDigest: `sha256:${"a".repeat(64)}`,
      revision: 1,
    },
    architectureContent: { title: "Project one" },
  }),
);
assert.throws(
  () =>
    validatePrism("designRequest", {
      schema: "prism.design-request.v1",
      projectId: "project-one",
      architecture: { artifactId: "provider:item", contentDigest: "bad", revision: 1 },
      architectureContent: {},
    }),
  /pattern/,
);
assert.doesNotThrow(()=>validatePrism("acceptanceCriteria",{schema:"prism.acceptance-criteria.v1",criteria:[{id:"home-visible",category:"visual",requirement:"The home view is visible.",targets:[{view:"home",state:"default"}],priority:"required",verification:["visual","automated"]}]}));
assert.doesNotThrow(()=>validatePrism("previewIndex",{schema:"prism.preview-index.v1",previews:[{id:"home-default-wide",view:"home",state:"default",viewport:"wide",path:"previews/home.png",width:1440,height:1000,digest:`sha256:${"a".repeat(64)}`,fidelity:"intent",ariaPath:"previews/home.aria.txt",ariaDigest:`sha256:${"b".repeat(64)}`,renderer:{name:"chromium"}}]}));
assert.throws(
  () => validatePrism("designDocument", { ...fixture, unknown: true }),
  /additional properties/,
);
assert.throws(()=>validatePrism("designDocument",{...fixture,theme:{...fixture.theme,colors:{...fixture.theme.colors,background:'#fff</style><meta http-equiv="refresh" content="0">'}}}),/invalid color token/);
assert.throws(()=>validatePrism("designDocument",{...fixture,theme:{...fixture.theme,typography:{body:{...fixture.theme.typography.body,weight:"400;position:fixed"}}}}),/must be integer/);
assert.throws(()=>validatePrism("designDocument",{...fixture,views:{Home:fixture.views.home}}),/property name must be valid/);
const unsafeTheme=structuredClone(fixture);
unsafeTheme.theme.typography.body.family="system-ui; background:url(https://unsafe.example)";
assert.throws(()=>validatePrism("designDocument",unsafeTheme),/invalid typography token/);
assert.throws(
  () => validatePrism("designDocument", { ...fixture, views: {} }),
  /must NOT have fewer/,
);
assert.throws(
  () =>
    validatePrism("operation", {
      type: "node.move",
      baseRevision: 1,
      nodeId: "x",
    }),
  /required property/,
);
assert.doesNotThrow(() =>
  validatePrism("operation", {
    type: "node.props.set",
    baseRevision: 1,
    nodeId: "title",
    props: { content: "Hello" },
  }),
);
assert.throws(
  () =>
    validatePrism("designDocument", {
      ...fixture,
      views: {
        ...fixture.views,
        home: {
          ...fixture.views.home,
          root: {
            ...fixture.views.home.root,
            children: [
              {
                id: "bad-node",
                type: "heading",
                props: { content: "Bad", level: 2, customCss: "no" },
              },
            ],
          },
        },
      },
    }),
  /property name|unsupported heading property/,
);
assert.throws(
  () =>
    validatePrism("designDocument", {
      ...fixture,
      views: {
        ...fixture.views,
        home: {
          ...fixture.views.home,
          root: {
            ...fixture.views.home.root,
            children: [{ id: "bad-node", type: "unknown", props: {} }],
          },
        },
      },
    }),
  /allowed values|node type/,
);
assert.throws(
  () =>
    validatePrism("designDocument", {
      ...fixture,
      views: {
        ...fixture.views,
        home: {
          ...fixture.views.home,
          root: {
            ...fixture.views.home.root,
            children: [
              {
                id: "bad-heading",
                type: "heading",
                props: { content: "Bad", level: "not-a-number" },
              },
            ],
          },
        },
      },
    }),
  /invalid heading property/,
);
const componentFixture = structuredClone(fixture);
componentFixture.components = {
  "card-item": {
    title: "Card item",
    root: { id: "card-root", type: "text", props: { content: "Item" } },
    variants: { compact: { "card-root": { content: "Compact" } } },
  },
};
componentFixture.views.home.root.children.push({
  id: "card",
  type: "component",
  props: { component: "card-item", variant: "compact" },
});
assert.doesNotThrow(() => validatePrism("designDocument", componentFixture));
const missingComponent = structuredClone(componentFixture);
missingComponent.views.home.root.children.at(-1).props.component = "missing";
assert.throws(
  () => validatePrism("designDocument", missingComponent),
  /missing component missing/,
);
const cyclicComponent = structuredClone(componentFixture);
cyclicComponent.components["card-item"].variants = {};
cyclicComponent.components["card-item"].root = {
  id: "self",
  type: "component",
  props: { component: "card-item" },
};
assert.throws(
  () => validatePrism("designDocument", cyclicComponent),
  /component cycle/,
);
const recursiveOverride = structuredClone(componentFixture);
recursiveOverride.views.home.root.children.at(-1).props.overrides = {
  "card-root": { component: "card-item" },
};
assert.throws(
  () => validatePrism("designDocument", recursiveOverride),
  /component references cannot change/,
);
const boundAccessibilityLabel = structuredClone(fixture);
boundAccessibilityLabel.views.home.root.props.accessibilityLabel = {
  $data: "user.name",
};
assert.throws(
  () => validatePrism("designDocument", boundAccessibilityLabel),
  /invalid stack property/,
);
const danglingPatch = structuredClone(fixture);
danglingPatch.views.home.states.default.patches.missing = { hidden: true };
assert.throws(
  () => validatePrism("designDocument", danglingPatch),
  /missing patch target home.missing/,
);
console.log("Prism v1 contract fixtures passed");
