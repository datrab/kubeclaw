import assert from "node:assert/strict";
import test from "node:test";
import fixture from "../../../contracts/prism/v1/fixtures/minimal-web.json" with {type:"json"};
import { assertMaterialDirectionDiversity, directionSignature, materialDirectionDistance } from "../directions/index.ts";

test("direction diversity ignores copy-only changes",()=>{
  const copy=structuredClone(fixture);copy.views.home.root.children[0].props.content="Different copy";
  assert.equal(directionSignature(fixture as any),directionSignature(copy as any));
  assert.throws(()=>assertMaterialDirectionDiversity([fixture as any,copy as any]),/materially distinct/);
});
test("direction diversity rejects one cosmetic token change",()=>{
  const visual=structuredClone(fixture);visual.theme.colors.action="#0066ff";
  assert.equal(materialDirectionDistance(fixture as any,visual as any),1);
  assert.throws(()=>assertMaterialDirectionDiversity([fixture as any,visual as any]),/materially distinct/);
});
test("direction diversity accepts a material visual system change",()=>{
  const visual=structuredClone(fixture);visual.theme.colors.action="#0066ff";visual.theme.colors.background="#101820";visual.theme.space.medium=20;
  assert.notEqual(directionSignature(fixture as any),directionSignature(visual as any));
  assert.doesNotThrow(()=>assertMaterialDirectionDiversity([fixture as any,visual as any]));
});
test("direction diversity ignores object key order",()=>{
  const reordered=structuredClone(fixture);
  reordered.theme.colors=Object.fromEntries(Object.entries(reordered.theme.colors).reverse()) as typeof reordered.theme.colors;
  reordered.theme.typography=Object.fromEntries(Object.entries(reordered.theme.typography).reverse()) as typeof reordered.theme.typography;
  assert.equal(directionSignature(fixture as any),directionSignature(reordered as any));
});
