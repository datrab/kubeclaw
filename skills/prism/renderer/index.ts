import type { PrismNode } from "@kubeclaw/prism-contracts-v1";
import { prismNodeTypes } from "@kubeclaw/prism-contracts-v1";

const escape = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const text = (value: unknown): string =>
  value && typeof value === "object" && "$data" in value
    ? `{{${escape((value as { $data: unknown }).$data)}}}`
    : escape(value);
const attrs = (node: PrismNode, props: Record<string, unknown>): string =>
  ` data-prism-id="${escape(node.id)}" data-prism-type="${escape(node.type)}"${typeof props.action === "string" ? ` data-prism-action="${escape(props.action)}"` : ""}${props.hidden === true ? " hidden" : ""}${typeof props.accessibilityLabel === "string" && props.accessibilityLabel ? ` aria-label="${escape(props.accessibilityLabel)}"` : ""}`;
const options = (value: unknown): string =>
  Array.isArray(value)
    ? value
        .map((item) => {
          const option = item as { value?: unknown; label?: unknown };
          return `<option value="${escape(option.value)}">${text(option.label)}</option>`;
        })
        .join("")
    : "";
const items = (value: unknown, role = "link"): string =>
  Array.isArray(value)
    ? value
        .map((item) => {
          const entry = item as {
            id?: unknown;
            label?: unknown;
            current?: unknown;
            action?: unknown;
          };
          return `<li${entry.current === true ? ' aria-current="page"' : ""}><button type="button" role="${role}" data-item-id="${escape(entry.id)}"${typeof entry.action === "string" ? ` data-prism-action="${escape(entry.action)}"` : ""}>${text(entry.label)}</button></li>`;
        })
        .join("")
    : "";

type RenderContext = {
  data?: Record<string, unknown>;
  components?: Record<string, unknown>;
  theme?: Record<string, unknown>;
};
const tokenValue = (value: unknown, theme: Record<string, unknown> | undefined): unknown => {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  let current: unknown = theme;
  for (const part of value.slice(1).split("."))
    current = current && typeof current === "object"
      ? (current as Record<string, unknown>)[part]
      : undefined;
  return current;
};
const px = (value: unknown, theme?: Record<string, unknown>): string | undefined => {
  const resolved = tokenValue(value, theme);
  return typeof resolved === "number" && Number.isFinite(resolved) ? `${resolved}px` : undefined;
};
const color = (value: unknown, theme?: Record<string, unknown>): string | undefined => {
  const resolved = tokenValue(value, theme);
  return typeof resolved === "string" && /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|transparent$|currentColor$)/iu.test(resolved)
    ? resolved
    : undefined;
};
const fontName=(value:unknown):string|undefined=>typeof value==="string"&&/^[a-z0-9 _-]{1,80}$/iu.test(value)?value:undefined;
const size = (value: unknown): string | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? `${value}px`
    : value === "fill"
      ? "100%"
      : value === "fit"
        ? "fit-content"
        : value === "auto"
          ? "auto"
          : undefined;
const style = (type: string, props: Record<string, unknown>, theme?: Record<string, unknown>): string => {
  const declarations: string[] = [];
  const put = (name: string, value: string | undefined) => { if (value) declarations.push(`${name}:${value}`); };
  put("width", size(props.width)); put("height", size(props.height));
  put("min-width", size(props.minWidth)); put("max-width", size(props.maxWidth));
  put("min-height", size(props.minHeight)); put("max-height", size(props.maxHeight));
  put("padding", px(props.padding, theme)); put("background", color(props.background, theme));
  put("color", color(props.foreground, theme)); put("border-radius", px(props.radius, theme));
  const shadow=tokenValue(props.shadow,theme);if(typeof shadow==="string"&&!/[;}]/u.test(shadow))put("box-shadow",shadow);
  if (["text", "heading"].includes(type) && typeof props.style === "string") {
    const typography = tokenValue(props.style, theme) as Record<string, unknown> | undefined;
    if (typography && typeof typography === "object") {
      const families=[typography.family,...(Array.isArray(typography.fallback)?typography.fallback:[])].map(fontName).filter((value):value is string=>Boolean(value));
      if(families.length)put("font-family",families.join(","));
      put("font-size", px(typography.size));
      if (typeof typography.weight === "number" && Number.isInteger(typography.weight) && typography.weight>=100 && typography.weight<=900) put("font-weight", String(typography.weight));
      if (typeof typography.lineHeight === "number") put("line-height", String(typography.lineHeight));
      put("letter-spacing", px(typography.letterSpacing));
    }
  }
  if (typeof props.tone === "string" && props.tone !== "default")
    put("color", color(`$colors.${props.tone === "muted" ? "muted-text" : props.tone}`, theme));
  if (props.border === "none") put("border", "0");
  else if (typeof props.border === "string") put("border", `1px solid ${props.border === "strong" ? "currentColor" : "color-mix(in srgb,currentColor 22%,transparent)"}`);
  if (typeof props.opacity === "number" && props.opacity >= 0 && props.opacity <= 1) put("opacity", String(props.opacity));
  if (type === "stack") {
    put("display", "flex"); put("flex-direction", props.direction === "horizontal" ? "row" : "column");
    put("gap", px(props.gap, theme)); put("align-items", ({ start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as Record<string,string>)[String(props.align)]);
    put("justify-content", ({ start: "flex-start", center: "center", end: "flex-end", "space-between": "space-between" } as Record<string,string>)[String(props.justify)]);
    if (props.wrap === true) put("flex-wrap", "wrap");
  } else if (type === "grid") {
    put("display", "grid"); put("grid-template-columns", `repeat(${Math.max(1, Math.min(12, Number(props.columns) || 1))},minmax(0,1fr))`);
    put("column-gap", px(props.gap, theme)); put("row-gap", px(props.rowGap ?? props.gap, theme));
  } else if (type === "split") {
    const ratios: Record<string,string> = { "1:1": "1fr 1fr", "1:2": "1fr 2fr", "2:1": "2fr 1fr", "1:3": "1fr 3fr", "3:1": "3fr 1fr" };
    put("display", "grid"); put("grid-template-columns", props.direction === "vertical" ? "1fr" : ratios[String(props.ratio)] ?? "1fr 1fr"); put("gap", px(props.gap, theme));
  } else if (type === "scroll") {
    put("overflow-x", ["horizontal", "both"].includes(String(props.direction)) ? "auto" : "hidden");
    put("overflow-y", ["vertical", "both"].includes(String(props.direction)) ? "auto" : "hidden");
  } else if (type === "overlay") { put("display", "grid"); put("place-items", "center"); }
  return declarations.length ? ` style="${escape(declarations.join(";"))}"` : "";
};
const dataValue = (
  value: unknown,
  data: Record<string, unknown> | undefined,
): unknown => {
  if (!value || typeof value !== "object" || !("$data" in value)) return value;
  const path = String((value as { $data: unknown }).$data).split(".");
  let current: unknown = data?.[path.shift() ?? ""];
  if (
    current &&
    typeof current === "object" &&
    "value" in current &&
    "type" in current
  )
    current = (current as { value: unknown }).value;
  for (const part of path)
    current =
      current && typeof current === "object"
        ? (current as Record<string, unknown>)[part]
        : undefined;
  return current;
};
const resolveBindings = (
  value: unknown,
  data: Record<string, unknown> | undefined,
): unknown => {
  const resolved = dataValue(value, data);
  if (resolved !== value) return resolved;
  if (Array.isArray(value))
    return value.map((item) => resolveBindings(item, data));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveBindings(item, data),
      ]),
    );
  return value;
};
const patchedComponent = (
  component: { root?: PrismNode; variants?: Record<string, unknown> },
  variant: unknown,
  overrides: unknown,
): PrismNode => {
  if (!component.root) throw new Error("component root is missing");
  const root = structuredClone(component.root);
  const patches = {
    ...((variant && component.variants?.[String(variant)]) as
      Record<string, Record<string, unknown>> | undefined),
    ...((overrides as Record<string, Record<string, unknown>> | undefined) ??
      {}),
  };
  const visit = (node: PrismNode): void => {
    if (patches[node.id])
      node.props = { ...(node.props ?? {}), ...patches[node.id] };
    node.children?.forEach(visit);
  };
  visit(root);
  return root;
};

export function renderNode(
  node: PrismNode,
  assets: Record<string, unknown> = {},
  context: RenderContext = {},
): string {
  if (!prismNodeTypes.includes(node.type as (typeof prismNodeTypes)[number]))
    throw new Error(`unsupported component: ${node.type}`);
  const p = resolveBindings(node.props ?? {}, context.data) as Record<
    string,
    unknown
  >;
  const children = (node.children ?? [])
    .map((child) => renderNode(child, assets, context))
    .join("");
  const a = `${attrs(node, p)}${style(node.type, p, context.theme)}`;
  switch (node.type) {
    case "stack":
    case "grid":
    case "split":
    case "scroll":
    case "overlay":
      return `<div${a}>${children}</div>`;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(p.level)));
      return `<h${level}${a}>${text(p.content)}</h${level}>`;
    }
    case "text":
      return `<p${a}>${text(p.content)}</p>`;
    case "image": {
      const asset = assets[String(p.asset)] as
        { alt?: unknown; src?: unknown } | undefined;
      if (!asset?.src)
        throw new Error(`missing render asset: ${String(p.asset)}`);
      return `<figure${a}><img data-asset="${escape(p.asset)}" src="${escape(asset.src)}" alt="${escape(asset.alt)}" />${p.caption ? `<figcaption>${text(p.caption)}</figcaption>` : ""}</figure>`;
    }
    case "icon": {
      const asset = assets[String(p.asset)] as
        { alt?: unknown; src?: unknown } | undefined;
      if (!asset?.src)
        throw new Error(`missing render asset: ${String(p.asset)}`);
      return `<img${a} data-asset="${escape(p.asset)}" src="${escape(asset.src)}" alt="${p.decorative === true ? "" : escape(asset.alt)}"${p.decorative === true ? ' aria-hidden="true"' : ""} />`;
    }
    case "divider":
      return `<hr${a} />`;
    case "code":
      return `<pre${a}><code>${text(p.content)}</code></pre>`;
    case "button":
      return `<button type="button"${a}${p.disabled === true ? " disabled" : ""}>${text(p.label)}</button>`;
    case "link":
      return `<button type="button" role="link"${a}>${text(p.label)}</button>`;
    case "text-input":
      return `<label${a}>${text(p.label)}<input type="${escape(p.inputType)}"${p.required === true ? " required" : ""}${p.disabled === true ? " disabled" : ""} /></label>`;
    case "select":
      return `<label${a}>${text(p.label)}<select${p.required === true ? " required" : ""}${p.disabled === true ? " disabled" : ""}>${options(p.options)}</select></label>`;
    case "checkbox":
      return `<label${a}><input type="checkbox"${p.checked === true ? " checked" : ""}${p.disabled === true ? " disabled" : ""} />${text(p.label)}</label>`;
    case "list":
      return `<section${a}>${
        Array.isArray(p.data) && p.data.length
          ? `<${p.ordered === true ? "ol" : "ul"}>${p.data
              .map((item) => {
                const component = context.components?.[
                  String(p.itemComponent)
                ] as
                  | { root?: PrismNode; variants?: Record<string, unknown> }
                  | undefined;
                if (!component)
                  throw new Error(
                    `missing component: ${String(p.itemComponent)}`,
                  );
                return `<li>${renderNode(patchedComponent(component, undefined, undefined), assets, { ...context, data: item as Record<string, unknown> })}</li>`;
              })
              .join("")}</${p.ordered === true ? "ol" : "ul"}>`
          : `<p>${text(p.emptyText)}</p>`
      }</section>`;
    case "table": {
      const columns = Array.isArray(p.columns) ? p.columns : [];
      const rows = Array.isArray(p.data) ? p.data : [];
      return `<table${a}><caption>${text(p.accessibilityLabel ?? p.emptyText)}</caption><thead><tr>${columns.map((column) => `<th>${text((column as { label?: unknown }).label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${text(row && typeof row === "object" ? (row as Record<string, unknown>)[String((column as { field?: unknown }).field)] : "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    case "badge":
      return `<span${a}>${text(p.label)}</span>`;
    case "progress":
      return `<label${a}>${text(p.label)}<progress value="${escape(p.value)}" max="${escape(p.max)}"></progress></label>`;
    case "chart":
      return `<figure${a} role="img"><figcaption>${text(p.title)}</figcaption><div data-chart-kind="${escape(p.kind)}"></div></figure>`;
    case "navigation":
      return `<nav${a}><ul>${items(p.items)}</ul>${children}</nav>`;
    case "tabs":
      return `<div${a} role="tablist">${
        Array.isArray(p.items)
          ? p.items
              .map((item) => {
                const entry = item as { id?: unknown; label?: unknown };
                return `<button type="button" role="tab" aria-selected="${entry.id === p.active}">${text(entry.label)}</button>`;
              })
              .join("")
          : ""
      }${children}</div>`;
    case "breadcrumb":
      return `<nav${a} aria-label="Breadcrumb"><ol>${items(p.items)}</ol></nav>`;
    case "pagination":
      return `<nav${a} aria-label="Pagination"><button type="button">Previous</button><span>${escape(p.page)} / ${escape(p.pageCount)}</span><button type="button">Next</button></nav>`;
    case "alert":
      return `<section role="alert"${a}>${p.title ? `<h2>${text(p.title)}</h2>` : ""}<p>${text(p.message)}</p>${children}</section>`;
    case "dialog":
      return `<section role="dialog" aria-modal="${p.modal !== false}"${p.accessibilityLabel ? "" : ` aria-labelledby="${escape(node.id)}-title"`}${a}><h2 id="${escape(node.id)}-title">${text(p.title)}</h2>${p.description ? `<p>${text(p.description)}</p>` : ""}${children}</section>`;
    case "toast":
      return `<div role="status"${a}>${text(p.message)}</div>`;
    case "tooltip":
      return `<span${a}>${children}<span role="tooltip">${text(p.content)}</span></span>`;
    case "empty-state":
      return `<section${a}><h2>${text(p.title)}</h2><p>${text(p.message)}</p>${p.action ? `<button type="button">${text(p.actionLabel)}</button>` : ""}</section>`;
    case "spinner":
      return `<span role="status"${a}>${text(p.label)}</span>`;
    case "component":
      return `<div${a} data-component="${escape(p.component)}">${renderNode(patchedComponent((context.components?.[String(p.component)] as { root?: PrismNode; variants?: Record<string, unknown> } | undefined) ?? {}, p.variant, p.overrides), assets, context)}</div>`;
    case "terminal":
      return `<section${a} role="application"><h2>${text(p.title)}</h2><pre>${children}</pre></section>`;
    case "command":
      return `<code${a}>${text(p.prompt)} ${text(p.content)}</code>`;
    case "prompt":
      return `<label${a}>${text(p.label)}<input type="${p.inputType === "password" ? "password" : "text"}" /></label>`;
    case "output":
      return `<samp${a}>${text(p.content)}</samp>`;
  }
  throw new Error(`unsupported component: ${node.type}`);
}
