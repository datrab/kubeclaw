export const prismNodeTypes = [
  "stack",
  "grid",
  "split",
  "scroll",
  "overlay",
  "text",
  "heading",
  "image",
  "icon",
  "divider",
  "code",
  "button",
  "link",
  "text-input",
  "select",
  "checkbox",
  "list",
  "table",
  "badge",
  "progress",
  "chart",
  "navigation",
  "tabs",
  "breadcrumb",
  "pagination",
  "alert",
  "dialog",
  "toast",
  "tooltip",
  "empty-state",
  "spinner",
  "component",
  "terminal",
  "command",
  "prompt",
  "output",
] as const;

const common = [
  "hidden",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "padding",
  "background",
  "foreground",
  "radius",
  "border",
  "shadow",
  "opacity",
  "accessibilityLabel",
  "accessibilityDescription",
];
const properties: Record<string, readonly string[]> = {
  stack: ["direction", "gap", "align", "justify", "wrap"],
  grid: ["columns", "gap", "rowGap", "align"],
  split: ["direction", "ratio", "gap"],
  scroll: ["direction", "showIndicator"],
  overlay: ["placement", "dismissAction", "modal"],
  text: ["content", "style", "tone", "align", "wrap"],
  heading: ["content", "level", "style", "align"],
  image: ["asset", "fit", "position", "caption"],
  icon: ["asset", "size", "tone", "decorative"],
  divider: ["direction", "tone"],
  code: ["content", "language", "copyAction", "lineNumbers"],
  button: [
    "label",
    "variant",
    "action",
    "disabled",
    "loading",
    "icon",
    "iconPosition",
  ],
  link: ["label", "action", "external"],
  "text-input": [
    "label",
    "value",
    "placeholder",
    "inputType",
    "required",
    "disabled",
    "error",
    "help",
  ],
  select: [
    "label",
    "value",
    "options",
    "required",
    "disabled",
    "error",
    "help",
  ],
  checkbox: ["label", "checked", "action", "disabled", "help"],
  list: ["data", "itemComponent", "emptyText", "ordered"],
  table: ["data", "columns", "emptyText", "rowAction", "selectable", "sort"],
  badge: ["label", "tone", "icon"],
  progress: ["value", "max", "label", "showValue"],
  chart: ["kind", "data", "xField", "yFields", "title", "legend", "stacked"],
  navigation: ["label", "items", "orientation", "active"],
  tabs: ["label", "items", "active"],
  breadcrumb: ["items"],
  pagination: ["page", "pageCount", "previousAction", "nextAction"],
  alert: ["tone", "title", "message", "dismissAction"],
  dialog: ["title", "description", "open", "dismissAction", "modal"],
  toast: ["tone", "message", "duration", "dismissAction"],
  tooltip: ["content", "placement"],
  "empty-state": ["title", "message", "asset", "action", "actionLabel"],
  spinner: ["label", "size"],
  component: ["component", "variant", "overrides"],
  terminal: ["title", "columns", "rows", "theme"],
  command: ["prompt", "content", "copyAction"],
  prompt: ["label", "value", "inputType", "options", "action"],
  output: ["content", "tone", "preserveWhitespace"],
};
const required: Record<string, readonly string[]> = {
  stack: ["direction"],
  grid: ["columns"],
  split: ["direction", "ratio"],
  scroll: ["direction"],
  overlay: ["placement"],
  text: ["content"],
  heading: ["content", "level"],
  image: ["asset"],
  icon: ["asset", "decorative"],
  divider: ["direction"],
  code: ["content"],
  button: ["label", "variant", "action"],
  link: ["label", "action"],
  "text-input": ["label", "inputType"],
  select: ["label", "options"],
  checkbox: ["label", "checked", "action"],
  list: ["data", "itemComponent", "emptyText"],
  table: ["data", "columns", "emptyText"],
  badge: ["label", "tone"],
  progress: ["value", "max", "label"],
  chart: ["kind", "data", "yFields", "title"],
  navigation: ["label", "items", "orientation"],
  tabs: ["label", "items", "active"],
  breadcrumb: ["items"],
  pagination: ["page", "pageCount", "previousAction", "nextAction"],
  alert: ["tone", "message"],
  dialog: ["title", "open", "dismissAction"],
  toast: ["tone", "message"],
  tooltip: ["content"],
  "empty-state": ["title", "message"],
  spinner: ["label", "size"],
  component: ["component"],
  terminal: ["title", "columns", "rows"],
  command: ["prompt", "content"],
  prompt: ["label", "inputType", "action"],
  output: ["content"],
};
const childLimits: Record<string, [number, number]> = {
  split: [2, 2],
  scroll: [1, 1],
  overlay: [2, 2],
  tooltip: [1, 1],
  text: [0, 0],
  heading: [0, 0],
  image: [0, 0],
  icon: [0, 0],
  divider: [0, 0],
  code: [0, 0],
  button: [0, 0],
  link: [0, 0],
  "text-input": [0, 0],
  select: [0, 0],
  checkbox: [0, 0],
  list: [0, 0],
  table: [0, 0],
  badge: [0, 0],
  progress: [0, 0],
  chart: [0, 0],
  breadcrumb: [0, 0],
  pagination: [0, 0],
  toast: [0, 0],
  "empty-state": [0, 0],
  spinner: [0, 0],
  component: [0, 0],
  command: [0, 0],
  prompt: [0, 0],
  output: [0, 0],
};

type Node = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: Node[];
};
const textValue = (value: unknown): boolean =>
  typeof value === "string" ||
  (Boolean(value) &&
    typeof value === "object" &&
    Object.keys(value as object).length === 1 &&
    typeof (value as { $data?: unknown }).$data === "string" &&
    /^[a-z][a-z0-9-]*(?:\.[a-zA-Z0-9_-]+)*$/u.test(
      (value as { $data: string }).$data,
    ));
const booleanProperties = new Set([
  "hidden",
  "wrap",
  "showIndicator",
  "modal",
  "decorative",
  "lineNumbers",
  "disabled",
  "loading",
  "external",
  "required",
  "ordered",
  "selectable",
  "showValue",
  "legend",
  "stacked",
  "open",
  "preserveWhitespace",
]);
const textProperties = new Set([
  "content",
  "label",
  "placeholder",
  "error",
  "help",
  "caption",
  "title",
  "description",
  "message",
  "emptyText",
  "actionLabel",
  "prompt",
]);
const idProperties = new Set([
  "action",
  "dismissAction",
  "copyAction",
  "rowAction",
  "previousAction",
  "nextAction",
  "asset",
  "icon",
  "itemComponent",
  "component",
  "variant",
  "active",
  "language",
  "xField",
]);
const enums: Record<string, readonly string[]> = {
  "stack.direction": ["horizontal", "vertical"],
  "split.direction": ["horizontal", "vertical"],
  "scroll.direction": ["horizontal", "vertical", "both"],
  "divider.direction": ["horizontal", "vertical"],
  "overlay.placement": ["top", "right", "bottom", "left", "center"],
  "tooltip.placement": ["top", "right", "bottom", "left"],
  "image.fit": ["contain", "cover", "fill", "none"],
  "image.position": ["top", "right", "bottom", "left", "center"],
  "button.variant": ["primary", "secondary", "quiet", "danger"],
  "button.iconPosition": ["start", "end"],
  "text-input.inputType": ["text", "email", "password", "search", "url", "tel"],
  "chart.kind": ["line", "bar", "area", "pie", "donut"],
  "navigation.orientation": ["horizontal", "vertical"],
  "spinner.size": ["small", "medium", "large"],
  "terminal.theme": ["dark", "light"],
  "prompt.inputType": ["text", "password", "choice", "confirm"],
};
const sharedEnums: Record<string, readonly string[]> = {
  tone: ["default", "muted", "info", "success", "warning", "danger"],
  align: ["start", "center", "end", "stretch"],
  justify: ["start", "center", "end", "stretch", "space-between"],
  border: ["none", "subtle", "default", "strong", "focus"],
};
const assertPropertyValue = (
  type: string,
  key: string,
  value: unknown,
  path: string,
): void => {
  const invalid = () => {
    throw new Error(
      `PRISM_INPUT_INVALID: invalid ${type} property at ${path}: ${key}`,
    );
  };
  const allowedEnum = enums[`${type}.${key}`] ?? sharedEnums[key];
  if (
    ["accessibilityLabel", "accessibilityDescription"].includes(key) &&
    (typeof value !== "string" || value.trim().length === 0)
  )
    invalid();
  if (allowedEnum && !allowedEnum.includes(String(value))) invalid();
  if (booleanProperties.has(key) && typeof value !== "boolean") invalid();
  if (textProperties.has(key) && !textValue(value)) invalid();
  if (
    idProperties.has(key) &&
    (typeof value !== "string" || !/^[a-z][a-z0-9-]{1,79}$/u.test(value))
  )
    invalid();
  if (
    ["level", "page", "pageCount", "rows"].includes(key) ||
    (key === "columns" && ["grid", "terminal"].includes(type))
  ) {
    if (!Number.isSafeInteger(value) || Number(value) < 1) invalid();
    if (key === "level" && Number(value) > 6) invalid();
    if (key === "columns" && type === "grid" && Number(value) > 12) invalid();
    if (key === "rows" && (Number(value) < 10 || Number(value) > 100))
      invalid();
  }
  if (
    key === "opacity" &&
    (typeof value !== "number" || value < 0 || value > 1)
  )
    invalid();
  if (
    key === "shadow" &&
    (typeof value !== "string" || !/^\$shadow\.[a-z][a-z0-9-]*$/u.test(value))
  )
    invalid();
  if (
    ["gap", "rowGap", "padding", "radius"].includes(key) ||
    (key === "size" && type === "icon")
  ) {
    if (
      !(typeof value === "number" && value >= 0) &&
      !(
        typeof value === "string" &&
        /^\$(?:space|radius)\.[a-z][a-z0-9-]*$/u.test(value)
      )
    )
      invalid();
  }
  if (
    [
      "width",
      "height",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
    ].includes(key) &&
    !(typeof value === "number" && value >= 0) &&
    !["auto", "fill", "fit"].includes(String(value))
  )
    invalid();
  if (
    key === "ratio" &&
    !["1:1", "1:2", "2:1", "1:3", "3:1"].includes(String(value))
  )
    invalid();
  if (
    key === "duration" &&
    (!Number.isFinite(value) || Number(value) < 1000 || Number(value) > 30000)
  )
    invalid();
  if (
    key === "max" &&
    (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
  )
    invalid();
  if (
    key === "columns" &&
    type === "terminal" &&
    (Number(value) < 40 || Number(value) > 240)
  )
    invalid();
  if (key === "checked" && typeof value !== "boolean" && !textValue(value))
    invalid();
  if (key === "value") {
    if (type === "progress") {
      if (
        !(typeof value === "number" && Number.isFinite(value)) &&
        !textValue(value)
      )
        invalid();
    } else if (!textValue(value)) invalid();
  }
  if (key === "data" && !textValue(value)) invalid();
  if (
    ["options", "items", "columns", "yFields"].includes(key) &&
    type !== "grid" &&
    type !== "terminal" &&
    !Array.isArray(value)
  )
    invalid();
  if (
    key === "overrides" &&
    (!value || typeof value !== "object" || Array.isArray(value))
  )
    invalid();
};
export function validateNodeCatalog(node: Node, path = "root"): void {
  if (!prismNodeTypes.includes(node.type as (typeof prismNodeTypes)[number]))
    throw new Error(
      `PRISM_INPUT_INVALID: unsupported node type at ${path}: ${node.type}`,
    );
  const props = node.props ?? {};
  const allowed = new Set([...common, ...(properties[node.type] ?? [])]);
  for (const key of Object.keys(props))
    if (!allowed.has(key))
      throw new Error(
        `PRISM_INPUT_INVALID: unsupported ${node.type} property at ${path}: ${key}`,
      );
    else assertPropertyValue(node.type, key, props[key], path);
  for (const key of required[node.type] ?? [])
    if (!(key in props))
      throw new Error(
        `PRISM_INPUT_INVALID: missing ${node.type} property at ${path}: ${key}`,
      );
  const children = node.children ?? [];
  const limits = childLimits[node.type];
  if (limits && (children.length < limits[0] || children.length > limits[1]))
    throw new Error(`PRISM_INPUT_INVALID: invalid child count at ${path}`);
  children.forEach((child, index) =>
    validateNodeCatalog(child, `${path}.children[${index}]`),
  );
}
