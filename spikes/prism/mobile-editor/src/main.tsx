import React, { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Puck, type Config, type Data, type PuckAction, type Slot, type Viewports } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "./studio.css";

type Props = {
  Stack: { gap: number; content: Slot };
  Heading: { text: string };
  Status: { label: string; tone: "success" | "warning" | "danger" };
  Button: { label: string };
};

const config: Config<Props> = {
  components: {
    Stack: {
      fields: { gap: { type: "number", min: 0, max: 48 }, content: { type: "slot" } },
      defaultProps: { gap: 16, content: [] },
      render: ({ gap, content: Content }) => <section className="stack" style={{ gap }}><Content /></section>,
    },
    Heading: {
      fields: { text: { type: "text", contentEditable: true } },
      defaultProps: { text: "Heading" },
      render: ({ text }) => <h2>{text}</h2>,
    },
    Status: {
      fields: {
        label: { type: "text", contentEditable: true },
        tone: { type: "select", options: [
          { label: "Success", value: "success" }, { label: "Warning", value: "warning" }, { label: "Danger", value: "danger" },
        ] },
      },
      defaultProps: { label: "Ready", tone: "success" },
      render: ({ label, tone }) => <div className={`status status-${tone}`}>{label}</div>,
    },
    Button: {
      fields: { label: { type: "text", contentEditable: true } },
      defaultProps: { label: "Continue" },
      render: ({ label }) => <button type="button">{label}</button>,
    },
  },
};

const initial: Data<Props> = {
  root: { props: { title: "Mobile editor" } },
  content: [
    { type: "Heading", props: { id: "heading", text: "Deployments" } },
    { type: "Status", props: { id: "status", label: "Ready", tone: "success" } },
  ],
};

const storageKey = "prism-mobile-spike";
const load = (): Data<Props> => {
  const stored = localStorage.getItem(storageKey);
  return stored ? JSON.parse(stored) : initial;
};

function App() {
  const [data, setData] = useState<Data<Props>>(load);
  const [revision, setRevision] = useState(1);
  const [compactOnly, setCompactOnly] = useState(false);
  const [actionCount, setActionCount] = useState(0);
  const save = useCallback((next: Data<Props>) => {
    setData(next);
    setRevision((value) => value + 1);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }, []);
  const moveStatus = useCallback((direction: -1 | 1) => {
    const next = structuredClone(data);
    const index = next.content.findIndex((item) => item.props.id === "status");
    const target = Math.max(0, Math.min(next.content.length - 1, index + direction));
    if (index !== target) next.content.splice(target, 0, next.content.splice(index, 1)[0]!);
    save(next);
  }, [data, save]);
  const insert = useCallback(() => {
    const next = structuredClone(data);
    next.content.push({ type: "Button", props: { id: `button-${revision}`, label: "Inspect" } });
    save(next);
  }, [data, revision, save]);
  const duplicate = useCallback(() => {
    const next = structuredClone(data);
    const status = next.content.find((item) => item.type === "Status" && item.props.id === "status");
    if (status?.type === "Status") next.content.push({
      type: "Status",
      props: { id: `status-${revision}`, label: status.props.label, tone: status.props.tone },
    });
    save(next);
  }, [data, revision, save]);
  const removeLast = useCallback(() => {
    if (data.content.length <= 1) return;
    const next = structuredClone(data); next.content.pop(); save(next);
  }, [data, save]);
  const onAction = useCallback((_action: PuckAction) => setActionCount((value) => value + 1), []);
  const viewport = useMemo<Viewports>(() => compactOnly ? [{ width: 390, height: "auto", label: "Compact" }] : [
    { width: 390, height: "auto", label: "Compact" }, { width: 1440, height: "auto", label: "Wide" },
  ], [compactOnly]);
  return <main>
    <header className="mobile-bar">
      <strong>Prism</strong><span data-testid="revision">Revision {revision}</span>
      <button onClick={() => setCompactOnly((value) => !value)}>Viewport: {compactOnly ? "compact only" : "all"}</button>
    </header>
    <nav aria-label="Mobile edit controls" className="mobile-controls">
      <button onClick={insert}>Insert</button><button onClick={duplicate}>Duplicate</button>
      <button onClick={() => moveStatus(-1)}>Move up</button><button onClick={() => moveStatus(1)}>Move down</button>
      <button onClick={removeLast}>Delete last</button>
    </nav>
    <div data-testid="action-count" hidden>{actionCount}</div>
    <Puck config={config} data={data} onChange={save} onAction={onAction} viewports={viewport} iframe={{ enabled: true }}
      permissions={{ drag: true, duplicate: true, delete: true, edit: true, insert: true }} dnd={{ behavior: "static" }} />
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
