import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../schemas/prism-v1.schema.json" with { type: "json" };
import engineRequests from "../schemas/engine-requests.v1.json" with { type: "json" };
import engineResults from "../schemas/engine-results.v1.json" with { type: "json" };
import { validateNodeCatalog } from "./node-catalog.ts";
export { prismNodeTypes, validateNodeCatalog } from "./node-catalog.ts";

export const PRISM_CONTRACT_ID = "kubeclaw.prism-design-engine@1";
export const PRISM_SCHEMA_ID = schema.$id;
type Validator = ((value: unknown) => boolean) & {
  errors?: Array<{ instancePath: string; message?: string }> | null;
};
interface AjvInstance {
  addSchema(value: object): void;
  compile(value: object): Validator;
}
const AjvConstructor = Ajv2020 as unknown as new (options: {
  allErrors: boolean;
  strict: boolean;
  strictRequired: boolean;
}) => AjvInstance;
const installFormats = addFormats as unknown as (
  instance: AjvInstance,
) => AjvInstance;
const ajv = new AjvConstructor({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
installFormats(ajv);
ajv.addSchema(schema);

const validators = new Map(
  Object.keys(schema.$defs).map((name) => [
    name,
    ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` }),
  ]),
);

export function validatePrism<T>(
  name:
    | "designRequest"
    | "designDocument"
    | "operation"
    | "baselineManifest"
    | "acceptanceCriteria"
    | "previewIndex"
    | "preferenceEvent"
    | "retrievalQuery",
  value: unknown,
): T {
  const validator = validators.get(name);
  if (!validator || !validator(value)) {
    const details =
      validator?.errors
        ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
        .slice(0, 8)
        .join("; ") ?? "unknown schema";
    throw new Error(`PRISM_INPUT_INVALID: ${name}: ${details}`);
  }
  if (name === "designDocument") {
    const document = value as PrismDocument;
    const cssColor=/^(?:#[0-9a-f]{3,8}|rgba?\([0-9., %]+\)|hsla?\([0-9., %a-z]+\)|transparent|currentColor)$/iu;
    for(const [token,color] of Object.entries(document.theme.colors as Record<string,unknown>))
      if(typeof color!=="string"||!cssColor.test(color))throw new Error(`PRISM_INPUT_INVALID: designDocument: invalid color token ${token}`);
    const fontName=/^[a-z0-9 _-]{1,80}$/iu;
    for(const [token,raw] of Object.entries(document.theme.typography as Record<string,unknown>)){
      const typography=raw as Record<string,unknown>;
      if(typeof typography.family!=="string"||!fontName.test(typography.family))throw new Error(`PRISM_INPUT_INVALID: designDocument: invalid typography token ${token}`);
      if(typography.fallback!==undefined&&(!Array.isArray(typography.fallback)||typography.fallback.some((item)=>typeof item!=="string"||!fontName.test(item))))throw new Error(`PRISM_INPUT_INVALID: designDocument: invalid typography fallback ${token}`);
    }
    for(const [token,shadow] of Object.entries(document.theme.shadow??{}))
      if(typeof shadow!=="string"||/[;}]/u.test(shadow))throw new Error(`PRISM_INPUT_INVALID: designDocument: invalid shadow token ${token}`);
    const components = document.components as Record<
      string,
      {
        root: PrismNode;
        variants?: Record<string, unknown>;
      }
    >;
    const nodeMap = (root: PrismNode): Map<string, PrismNode> => {
      const nodes = new Map<string, PrismNode>();
      const visit = (node: PrismNode) => {
        nodes.set(node.id, node);
        node.children?.forEach(visit);
      };
      visit(root);
      return nodes;
    };
    const validateComponentPatches = (
      componentId: string,
      patches: unknown,
      path: string,
    ) => {
      if (patches === undefined) return;
      if (!patches || typeof patches !== "object" || Array.isArray(patches))
        throw new Error(
          `PRISM_INPUT_INVALID: designDocument: invalid patches at ${path}`,
        );
      const component = components[componentId];
      if (!component)
        throw new Error(
          `PRISM_INPUT_INVALID: designDocument: missing component ${componentId}`,
        );
      const nodes = nodeMap(component.root);
      for (const [nodeId, patch] of Object.entries(patches)) {
        const target = nodes.get(nodeId);
        if (
          !target ||
          !patch ||
          typeof patch !== "object" ||
          Array.isArray(patch)
        )
          throw new Error(
            `PRISM_INPUT_INVALID: designDocument: invalid patch target ${componentId}.${nodeId}`,
          );
        if ("component" in patch || "itemComponent" in patch)
          throw new Error(
            `PRISM_INPUT_INVALID: designDocument: component references cannot change in ${path}`,
          );
        validateNodeCatalog(
          { ...target, props: { ...(target.props ?? {}), ...patch } },
          `${path}.${nodeId}`,
        );
      }
    };
    const referencedComponents = (root: PrismNode): Set<string> => {
      const references = new Set<string>();
      const visit = (node: PrismNode) => {
        const props = node.props ?? {};
        const reference =
          node.type === "component"
            ? props.component
            : node.type === "list"
              ? props.itemComponent
              : undefined;
        if (typeof reference === "string") {
          const component = components[reference];
          if (!component)
            throw new Error(
              `PRISM_INPUT_INVALID: designDocument: missing component ${reference}`,
            );
          if (
            node.type === "component" &&
            typeof props.variant === "string" &&
            !component.variants?.[props.variant]
          )
            throw new Error(
              `PRISM_INPUT_INVALID: designDocument: missing variant ${reference}.${props.variant}`,
            );
          if (node.type === "component")
            validateComponentPatches(
              reference,
              props.overrides,
              `component.${node.id}.overrides`,
            );
          references.add(reference);
        }
        node.children?.forEach(visit);
      };
      visit(root);
      return references;
    };
    for (const [componentId, component] of Object.entries(components)) {
      validateNodeCatalog(component.root, `components.${componentId}.root`);
      for (const [variantId, patches] of Object.entries(
        component.variants ?? {},
      ))
        validateComponentPatches(
          componentId,
          patches,
          `components.${componentId}.variants.${variantId}`,
        );
      referencedComponents(component.root);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const checkComponentCycle = (componentId: string) => {
      if (visiting.has(componentId))
        throw new Error(
          `PRISM_INPUT_INVALID: designDocument: component cycle at ${componentId}`,
        );
      if (visited.has(componentId)) return;
      visiting.add(componentId);
      for (const reference of referencedComponents(
        components[componentId].root,
      ))
        checkComponentCycle(reference);
      visiting.delete(componentId);
      visited.add(componentId);
    };
    Object.keys(components).forEach(checkComponentCycle);
    for (const [viewId, view] of Object.entries(document.views)) {
      validateNodeCatalog(view.root, `views.${viewId}.root`);
      referencedComponents(view.root);
      const nodes = new Map<string, PrismNode>();
      const visit = (node: PrismNode) => {
        nodes.set(node.id, node);
        node.children?.forEach(visit);
      };
      visit(view.root);
      for (const [scope, groups] of [
        ["states", view.states],
        ["responsive", view.responsive],
      ] as const)
        for (const [groupId, group] of Object.entries(groups))
          for (const [nodeId, patch] of Object.entries(group.patches)) {
            const node = nodes.get(nodeId);
            if (!node)
              throw new Error(
                `PRISM_INPUT_INVALID: designDocument: missing patch target ${viewId}.${nodeId}`,
              );
            validateNodeCatalog(
              { ...node, props: { ...(node.props ?? {}), ...patch } },
              `views.${viewId}.${scope}.${groupId}.${nodeId}`,
            );
          }
    }
  }
  return value as T;
}

const requestValidators = new Map(
  Object.entries(engineRequests.$defs).map(([name, value]) => [
    name,
    ajv.compile(value),
  ]),
);
const resultValidators = new Map(
  Object.entries(engineResults.$defs).map(([name, value]) => [
    name,
    ajv.compile(value),
  ]),
);
function validateEngine(
  map: Map<string, Validator>,
  operation: string,
  value: unknown,
  kind: string,
): void {
  const validator = map.get(operation);
  if (!validator || !validator(value)) {
    const details =
      validator?.errors
        ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
        .slice(0, 8)
        .join("; ") ?? "unknown operation";
    throw new Error(`PRISM_${kind}_INVALID: ${operation}: ${details}`);
  }
}
export function validateEngineRequest(operation: string, value: unknown): void {
  validateEngine(requestValidators, operation, value, "ENGINE_REQUEST");
}
export function validateEngineResult(operation: string, value: unknown): void {
  validateEngine(resultValidators, operation, value, "ENGINE_RESULT");
}

export type PrismNode = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: PrismNode[];
};
export type PrismDocument = {
  meta: {
    schema: "prism.design-document.v1";
    documentId: string;
    projectId: string;
    revision: number;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  theme: Record<string, unknown>;
  assets: Record<string, unknown>;
  components: Record<string, unknown>;
  views: Record<
    string,
    {
      title: string;
      surface: string;
      root: PrismNode;
      states: Record<
        string,
        { patches: Record<string, Record<string, unknown>> }
      >;
      responsive: Record<
        string,
        { patches: Record<string, Record<string, unknown>> }
      >;
      mockData?: Record<string, unknown>;
    }
  >;
  flows: Record<string, unknown>;
};
