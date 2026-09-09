import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Puck, type Config } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "./studio.css";
import type { PrismDocument, PrismNode } from "@kubeclaw/prism-contracts-v1";
import {
  applyOperation,
  type PrismOperation,
  type Viewport,
} from "../domain/index.ts";
import { puckChangeToOperation } from "./puck-adapter.ts";
import { project, type Props } from "./projection.ts";
import { loadPreviewAssets, type PreviewAssets } from "./preview-assets.ts";
import { previewDocument } from "./preview.ts";

const nodeTypes = [
  "grid",
  "split",
  "scroll",
  "overlay",
  "image",
  "icon",
  "divider",
  "code",
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
];
const config: Config<Props> = {
  components: {
    Stack: {
      fields: {
        gap: { type: "number", min: 0, max: 48 },
        content: { type: "slot" },
      },
      defaultProps: { gap: 16, content: [] },
      render: ({ gap, content: Content }) => (
        <section className="canvas-stack" style={{ gap }}>
          <Content />
        </section>
      ),
    },
    Heading: {
      fields: { text: { type: "text", contentEditable: true } },
      defaultProps: { text: "Heading" },
      render: ({ text }) => <h2>{text}</h2>,
    },
    Text: {
      fields: { text: { type: "textarea", contentEditable: true } },
      defaultProps: { text: "Text" },
      render: ({ text }) => <p>{text}</p>,
    },
    Button: {
      fields: { label: { type: "text", contentEditable: true } },
      defaultProps: { label: "Continue" },
      render: ({ label }) => (
        <button type="button" className="preview-button">
          {label}
        </button>
      ),
    },
    PrismBlock: {
      fields: {
        nodeType: {
          type: "select",
          options: nodeTypes.map((value) => ({ label: value, value })),
        },
        label: { type: "text", contentEditable: true },
        text: { type: "textarea" },
        action: { type: "text" },
        tone: {
          type: "select",
          options: [
            "default",
            "muted",
            "info",
            "success",
            "warning",
            "danger",
          ].map((value) => ({ label: value, value })),
        },
        content: { type: "slot" },
      },
      defaultProps: {
        nodeType: "alert",
        label: "",
        text: "Describe this item",
        action: "",
        tone: "default",
        content: [],
      },
      render: ({ nodeType, label, text, content: Content }) => (
        <section data-prism-type={nodeType} className="generic-block">
          <strong>{label || nodeType}</strong>
          {text ? <p>{text}</p> : null}
          <Content />
        </section>
      ),
    },
  },
};

function App() {
  const [document, setDocument] = useState<PrismDocument | null>(null);
  const [previewAssets, setPreviewAssets] = useState<{ document: PrismDocument; assets: PreviewAssets } | null>(null);
  const [previewAssetError, setPreviewAssetError] = useState<string | null>(null);
  useEffect(() => {
    if (!document) return;
    const controller = new AbortController();
    setPreviewAssets(null); setPreviewAssetError(null);
    void loadPreviewAssets(document, controller.signal).then(
      (assets) => { if (!controller.signal.aborted) setPreviewAssets({ document, assets }); },
      (error: unknown) => { if (!controller.signal.aborted) setPreviewAssetError(error instanceof Error ? error.message : String(error)); },
    );
    return () => controller.abort();
  }, [document]);
  const [csrf, setCsrf] = useState("");
  const [userId, setUserId] = useState("");
  const [failure, setFailure] = useState("");
  const [approvalMessage, setApprovalMessage] = useState("");
  const [quality, setQuality] = useState<{
    status: string;
    findings: Array<{
      id: string;
      level: string;
      message: string;
      target?: string;
    }>;
  } | null>(null);
  const [acceptedWarnings, setAcceptedWarnings] = useState<string[]>([]);
  const [viewport, setViewport] = useState<Viewport>("wide");
  const [viewId, setViewId] = useState("home");
  const [viewState, setViewState] = useState("default");
  const [instruction, setInstruction] = useState("");
  const [working, setWorking] = useState(false);
  const [learned, setLearned] = useState<Record<string, unknown>>({});
  const [preferenceEvents, setPreferenceEvents] = useState<
    Array<{ eventId: string; action: string; retractsEventId?: string }>
  >([]);
  const [directions, setDirections] = useState<
    Array<{ id: string; title: string; summary: string; state: string; evidence?:{thesis?:string;tradeoffs?:string[];references?:Array<{id?:string;summary?:string}>} }>
  >([]);
  const [brief,setBrief]=useState<Record<string,unknown>|null>(null);
  const [projects,setProjects]=useState<Array<{id:string;external_id:string;name:string;document_id:string|null;direction_count:number}>>([]);
  const [revisions, setRevisions] = useState<
    Array<{ id: string; revision: number; createdAt: string }>
  >([]);
  const [panel, setPanel] = useState<"navigate" | "insert" | "prism" | null>(
    null,
  );
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const previewRef=useRef<HTMLIFrameElement>(null);
  const [selectedNodeId,setSelectedNodeId]=useState<string|null>(null);
  const selectedNode=useMemo(()=>{if(!document||!selectedNodeId)return undefined;const visit=(node:PrismNode):PrismNode|undefined=>node.id===selectedNodeId?node:node.children?.map(visit).find(Boolean);return visit(document.views[viewId]?.root as PrismNode);},[document,selectedNodeId,viewId]);
  useEffect(()=>{
    const root=document?.views[viewId]?.root as PrismNode|undefined;
    if(!root){setSelectedNodeId(null);return;}
    const firstEditable=(node:PrismNode):PrismNode=>node.children?.map(firstEditable)[0]??node;
    setSelectedNodeId((current)=>{
      const contains=(node:PrismNode):boolean=>node.id===current||Boolean(node.children?.some(contains));
      return current&&contains(root)?current:firstEditable(root).id;
    });
  },[document,viewId]);
  useEffect(()=>{const receive=(event:MessageEvent)=>{
    if(event.source!==previewRef.current?.contentWindow||!event.data)return;
    if(event.data.schema==="prism.selection.v1"&&typeof event.data.nodeId==="string")setSelectedNodeId(event.data.nodeId);
    if(event.data.schema==="prism.action.v1"&&typeof event.data.action==="string"&&document){
      const transition=Object.values(document.flows).flatMap((flow)=>flow.transitions).find((item)=>item.from.view===viewId&&item.from.state===viewState&&item.trigger.action===event.data.action&&(!item.trigger.node||item.trigger.node===event.data.nodeId));
      if(transition){setViewId(transition.to.view);setViewState(transition.to.state);}
    }
  };addEventListener("message",receive);return()=>removeEventListener("message",receive);},[document,viewId,viewState]);
  useEffect(() => {
    if (import.meta.env.DEV) {
      void import("./dev-fixture.ts").then(({ developmentDocument }) =>
        setDocument(developmentDocument),
      );
      return;
    }
    void (async () => {
      const session = await fetch("/v1/session", { method: "POST" });
      if (!session.ok) throw new Error("Prism session could not start");
      const sessionData = (await session.json()) as {
        csrf: string;
        userId: string;
      };
      setCsrf(sessionData.csrf);
      setUserId(sessionData.userId);
      const id = new URLSearchParams(location.search).get("document");
      if (!id) {
        const projectsResponse=await fetch("/v1/projects");
        if(projectsResponse.ok)setProjects(((await projectsResponse.json()) as {items:Array<{id:string;external_id:string;name:string;document_id:string|null;direction_count:number}>}).items);
        return;
      }
      const loaded = await fetch(`/v1/documents/${encodeURIComponent(id)}`);
      if (!loaded.ok) throw new Error("Design document could not load");
      setDocument(
        ((await loaded.json()) as { document: PrismDocument }).document,
      );
      const projectId = new URLSearchParams(location.search).get("project");
      if (projectId) {
        const briefResponse=await fetch(`/v1/projects/${encodeURIComponent(projectId)}/brief`);
        if(briefResponse.ok)setBrief(((await briefResponse.json()) as {request?:Record<string,unknown>}).request??null);
        for(let attempt=0;attempt<300;attempt++){
          const result=await fetch(`/v1/projects/${encodeURIComponent(projectId)}/directions`);
          if(result.ok){const items=((await result.json()) as {items:Array<{id:string;title:string;summary:string;state:string;evidence?:{thesis?:string;tradeoffs?:string[];references?:Array<{id?:string;summary?:string}>}}>}).items;if(items.length){setDirections(items);break;}}
          await new Promise((resolve)=>setTimeout(resolve,2000));
        }
      }
    })().catch((error) =>
      setFailure(error instanceof Error ? error.message : String(error)),
    );
  }, []);
  useEffect(() => {
    if (document && !document.views[viewId])
      setViewId(Object.keys(document.views)[0] ?? "home");
  }, [document, viewId]);
  const data = useMemo(
    () =>
      document
        ? project(document, viewId)
        : { root: { props: {} }, content: [] },
    [document, viewId],
  );
  const commit = async (operation: PrismOperation) => {
    if (!document) return;
    if (import.meta.env.DEV) {
      setDocument(applyOperation(document, operation));
      setQuality(null);
      setAcceptedWarnings([]);
      return;
    }
    const id = new URLSearchParams(location.search).get("document");
    if (!id) throw new Error("Document ID is missing");
    const saved = await fetch(
      `/v1/documents/${encodeURIComponent(id)}/operations`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-prism-csrf": csrf },
        body: JSON.stringify(operation),
      },
    );
    const payload = (await saved.json()) as PrismDocument & { error?: string };
    if (!saved.ok) throw new Error(payload.error ?? "Design update failed");
    setDocument(payload);
    setQuality(null);
    setAcceptedWarnings([]);
  };
  const propose = async () => {
    if (!document || !instruction.trim()) return;
    const id = new URLSearchParams(location.search).get("document");
    if (!id) throw new Error("Document ID is missing");
    setWorking(true);
    try {
      const response = await fetch(
        `/v1/documents/${encodeURIComponent(id)}/engine`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-prism-csrf": csrf },
          body: JSON.stringify({
            operation: "generate",
            baseRevision: document.meta.revision,
            input: { instruction: instruction.trim(), mode: "refine" },
            idempotencyKey: `studio:${document.meta.revision}:${crypto.randomUUID()}`,
          }),
        },
      );
      const value = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) throw new Error(value.error ?? "Prism proposal failed");
      for (let attempt = 0; attempt < 300; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const loaded = await fetch(`/v1/documents/${encodeURIComponent(id)}`);
        if (!loaded.ok) continue;
        const next = ((await loaded.json()) as { document: PrismDocument }).document;
        if (next.meta.revision > document.meta.revision) { setDocument(next); break; }
        if (attempt === 299) throw new Error("Prism accepted the request, but the OpenClaw revision is still running");
      }
      setQuality(null);
      setAcceptedWarnings([]);
      setInstruction("");
    } finally {
      setWorking(false);
    }
  };
  const loadLearned = async () => {
    const projectId = document?.meta.projectId;
    if (!projectId) return;
    const response = await fetch(
      `/v1/preferences?project=${encodeURIComponent(projectId)}`,
    );
    if (response.ok) {
      const value = (await response.json()) as {
        learned: Record<string, unknown>;
        events: Array<{
          eventId: string;
          action: string;
          retractsEventId?: string;
        }>;
      };
      setLearned(value.learned);
      setPreferenceEvents(value.events);
    }
  };
  const loadRevisions = async () => {
    const id = new URLSearchParams(location.search).get("document");
    if (!id) return;
    const response = await fetch(
      `/v1/documents/${encodeURIComponent(id)}/revisions`,
    );
    if (response.ok)
      setRevisions(
        (
          (await response.json()) as {
            items: Array<{ id: string; revision: number; createdAt: string }>;
          }
        ).items,
      );
  };
  const restoreRevision = async (revisionId: string) => {
    const id = new URLSearchParams(location.search).get("document");
    if (!id) return;
    const response = await fetch(
      `/v1/documents/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revisionId)}/restore`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-prism-csrf": csrf },
        body: "{}",
      },
    );
    const value = (await response.json()) as PrismDocument & { error?: string };
    if (!response.ok) throw new Error(value.error ?? "Revision restore failed");
    setDocument(value);
    setQuality(null);
    setAcceptedWarnings([]);
    await loadRevisions();
  };
  const retractPreference = async (eventId: string) => {
    if (!document || !userId) return;
    const event = {
      schema: "prism.preference-event.v1",
      eventId: `event-${crypto.randomUUID()}`,
      userId,
      projectId: document.meta.projectId,
      action: "retracted",
      target: { eventId },
      traits: [],
      context: { surface: "studio" },
      source: "explicit",
      learningScope: "project",
      retractsEventId: eventId,
      occurredAt: new Date().toISOString(),
    };
    const response = await fetch("/v1/preferences", {
      method: "POST",
      headers: { "content-type": "application/json", "x-prism-csrf": csrf },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      const value = (await response.json()) as { error?: string };
      throw new Error(value.error ?? "Preference retraction failed");
    }
    await loadLearned();
  };
  const pendingDirectionKeys = useRef(new Map<string, string>());
  const directionRequest = (route: string, payload: object) => {
    const body = JSON.stringify(payload);
    const identity = JSON.stringify([route, body]);
    const key = pendingDirectionKeys.current.get(identity) ?? crypto.randomUUID();
    pendingDirectionKeys.current.set(identity, key);
    return { identity, options: { method: "POST", headers: { "content-type": "application/json", "x-prism-csrf": csrf, "Idempotency-Key": key }, body } };
  };
  const selectDirection = async (directionId: string) => {
    const documentId = new URLSearchParams(location.search).get("document");
    if (!documentId) throw new Error("Document ID is missing");
    const route = `/v1/directions/${encodeURIComponent(directionId)}/select`;
    const mutation = directionRequest(route, {documentId});
    const response = await fetch(route, mutation.options);
    const result = (await response.json()) as {
      document?: PrismDocument;
      documentId?: string;
      error?: string;
    };
    if (!response.ok || !result.document)
      throw new Error(result.error ?? "Direction selection failed");
    pendingDirectionKeys.current.delete(mutation.identity);
    setDocument(result.document);
    if(result.documentId){
      const query=new URLSearchParams(location.search);query.set("document",result.documentId);
      history.replaceState(null,"",`?${query.toString()}`);
    }
    setQuality(null);
    setAcceptedWarnings([]);
    setDirections((items) =>
      items.map((item) => ({
        ...item,
        state: item.id === directionId ? "selected" : "rejected",
      })),
    );
  };
  const recordDirectionFeedback = async (
    directionId: string,
    action: "rejected" | "liked" | "disliked" | "preserved",
  ) => {
    const route = `/v1/directions/${encodeURIComponent(directionId)}/feedback`;
    const mutation = directionRequest(route, {action});
    const response = await fetch(route, mutation.options);
    const result = (await response.json()) as { error?: string; eventId?: string; state?: string };
    if (!response.ok || !result.eventId || result.state !== (action === "rejected" ? "rejected" : "recorded"))
      throw new Error(result.error ?? "Direction feedback failed");
    pendingDirectionKeys.current.delete(mutation.identity);
    if (action === "rejected")
      setDirections((items) =>
        items.map((item) =>
          item.id === directionId ? { ...item, state: "rejected" } : item,
        ),
      );
    await loadLearned();
  };
  const approve = async () => {
    if (!document) return;
    const query = new URLSearchParams(location.search);
    const projectId = query.get("project");
    const documentId = query.get("document");
    if (!projectId || !documentId)
      throw new Error("Project identity is missing");
    const report = quality ?? (await evaluateDesign());
    if (report.status === "blocked")
      throw new Error("Resolve all blocking design findings before approval");
    const warnings = report.findings
      .filter((finding) => finding.level === "review")
      .map((finding) => finding.id);
    if (warnings.some((id) => !acceptedWarnings.includes(id)))
      throw new Error("Review and accept each design warning before approval");
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const approval = await fetch("/v1/approvals", {
      method: "POST",
      headers: { "content-type": "application/json", "x-prism-csrf": csrf },
      body: JSON.stringify({
        projectId,
        documentId,
        designDigest: `sha256:${hash}`,
        acceptedWarningIds: acceptedWarnings,
      }),
    });
    const approvalBody = (await approval.json()) as {
      id?: string;
      error?: string;
    };
    if (!approval.ok || !approvalBody.id)
      throw new Error(approvalBody.error ?? "Approval failed");
    const baseline = await fetch("/v1/baselines", {
      method: "POST",
      headers: { "content-type": "application/json", "x-prism-csrf": csrf },
      body: JSON.stringify({
        projectId,
        documentId,
        approvalId: approvalBody.id,
      }),
    });
    const baselineBody = (await baseline.json()) as {
      bundleDigest?: string;
      error?: string;
    };
    if (!baseline.ok || !baselineBody.bundleDigest)
      throw new Error(baselineBody.error ?? "Baseline publication failed");
    setApprovalMessage(
      `Published ${baselineBody.bundleDigest}. Approval ID: ${approvalBody.id}`,
    );
  };
  const evaluateDesign = async () => {
    if (!document) throw new Error("Design is not loaded");
    const documentId = new URLSearchParams(location.search).get("document");
    if (!documentId) throw new Error("Document ID is missing");
    const response = await fetch(
      `/v1/documents/${encodeURIComponent(documentId)}/engine`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-prism-csrf": csrf },
        body: JSON.stringify({
          operation: "evaluate",
          baseRevision: document.meta.revision,
          idempotencyKey: `studio-evaluate-${document.meta.documentId}-${document.meta.revision}`,
          input: {},
        }),
      },
    );
    const body = (await response.json()) as {
      specialistResult?: {
        values?: {
          status: string;
          findings: Array<{
            id: string;
            level: string;
            message: string;
            target?: string;
          }>;
        };
      };
      error?: string;
    };
    if (!response.ok || !body.specialistResult?.values)
      throw new Error(body.error ?? "Design evaluation failed");
    setQuality(body.specialistResult.values);
    setAcceptedWarnings([]);
    return body.specialistResult.values;
  };
  const updateTitle = () => {
    if (!document) return;
    const current = document;
    const title = selectedNode;
    if (!title) return;
    void commit({
      type: "node.props.set",
      baseRevision: current.meta.revision,
      nodeId: title.id,
      props: {
        ...(title.type==="button"
          ? {label:String(title.props?.label??"Action")==="Action"?"Continue":"Action"}
          : {content:String(title.props?.content??"")==="Services"?"Deployments":"Services"}),
      },
    }).catch((error) => setFailure(String(error)));
  };
  const insert = () => {
    if (!document) return;
    const current = document;
    void commit({
      type: "node.insert",
      baseRevision: current.meta.revision,
      parentId: current.views[viewId]?.root.id ?? `${viewId}-root`,
      index: current.views[viewId]?.root.children?.length ?? 0,
      node: {
        id: `action-${current.meta.revision}`,
        type: "button",
        props: {
          label: "Inspect",
          variant: "primary",
          action: "preview-action",
        },
      },
    }).catch((error) => setFailure(String(error)));
  };
  const move = () => {
    if (!document) return;
    const current = document;
    const last = current.views[viewId]?.root.children?.at(-1);
    if (!last) return;
    void commit({
      type: "node.move",
      baseRevision: current.meta.revision,
      nodeId: last.id,
      parentId: current.views[viewId]?.root.id ?? `${viewId}-root`,
      index: 0,
    }).catch((error) => setFailure(String(error)));
  };
  if (failure)
    return (
      <main className="studio">
        <section className="start-panel">
          <h1>Prism cannot open</h1>
          <p>{failure}</p>
        </section>
      </main>
    );
  if (!document)
    return (
      <main className="studio">
        <section className="start-panel">
          <h1>Prism Studio</h1>
          {projects.length === 0 ? (
            <>
              <p>No design requests yet.</p>
              <p>Projects appear here after Nova sends an architecture to Prism.</p>
            </>
          ) : (
            <section aria-label="Prism projects">
              <h2>Projects from Nova</h2>
              {projects.map((project) => (
                <article key={project.id}>
                  <strong>{project.name}</strong>
                  {project.document_id ? (
                    <>
                      <p>{project.direction_count} design directions</p>
                      <a href={`?project=${encodeURIComponent(project.id)}&document=${encodeURIComponent(project.document_id)}`}>Open designs</a>
                    </>
                  ) : (
                    <p>Design generation pending.</p>
                  )}
                </article>
              ))}
            </section>
          )}
          <button onClick={() => location.reload()}>Refresh</button>
        </section>
      </main>
    );
  return (
    <main className="studio">
      <header>
        <div className="brand">
          <span className="mark">P</span>
          <strong>Prism</strong>
          <span className="quiet">{document.meta.title}</span>
        </div>
        <div className="top-actions">
          <span data-testid="revision">Revision {document.meta.revision}</span>
          <select
            aria-label="Viewport"
            value={viewport}
            onChange={(event) => setViewport(event.target.value as Viewport)}
          >
            <option value="compact">Compact</option>
            <option value="regular">Regular</option>
            <option value="wide">Wide</option>
          </select>
          <button onClick={() => setMode(mode === "edit" ? "preview" : "edit")}>
            {mode === "edit" ? "Preview" : "Edit"}
          </button>
          <button
            onClick={() =>
              void evaluateDesign().catch((error) => setFailure(String(error)))
            }
          >
            Check design
          </button>
          <button
            className="approve"
            onClick={() =>
              void approve().catch((error) => setFailure(String(error)))
            }
          >
            Approve
          </button>
        </div>
      </header>
      {approvalMessage && (
        <p role="status" className="approval-status">
          {approvalMessage}
        </p>
      )}
      {brief&&<section aria-label="Design brief" className="brief"><h2>Brief</h2><p>Prism imported the approved Nova architecture and uses it as the design boundary.</p><dl>{Object.entries((brief.architectureContent&&typeof brief.architectureContent==="object"?brief.architectureContent:brief) as Record<string,unknown>).slice(0,12).map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{typeof value==="string"?value:JSON.stringify(value)}</dd></React.Fragment>)}</dl></section>}
      {quality && (
        <section aria-label="Design quality">
          <h2>Design quality: {quality.status}</h2>
          {quality.findings.length === 0 ? (
            <p>No findings.</p>
          ) : (
            quality.findings.map((finding) => (
              <label key={finding.id}>
                <input
                  type="checkbox"
                  disabled={finding.level !== "review"}
                  checked={
                    finding.level === "review" &&
                    acceptedWarnings.includes(finding.id)
                  }
                  onChange={(event) =>
                    setAcceptedWarnings((current) =>
                      event.target.checked
                        ? [...current, finding.id]
                        : current.filter((id) => id !== finding.id),
                    )
                  }
                />
                <strong>{finding.level}</strong> {finding.message}
                {finding.target ? ` (${finding.target})` : ""}
              </label>
            ))
          )}
        </section>
      )}
      <aside className="navigator">
        <p className="eyebrow">Experience</p>
        {directions.length > 0 && (
          <>
            <h2>Directions</h2>
            {directions.map((direction) => (
              <article key={direction.id} className="direction">
                <strong>{direction.title}</strong>
                <p>{direction.summary}</p>
                {direction.evidence?.tradeoffs?.length?<><small>Trade-offs</small><ul>{direction.evidence.tradeoffs.map((item)=><li key={item}>{item}</li>)}</ul></>:null}
                {direction.evidence?.references?.length?<p className="quiet">Grounded in {direction.evidence.references.length} approved corpus references.</p>:<p className="quiet">No approved corpus reference matched this brief.</p>}
                <button
                  disabled={direction.state === "selected"}
                  onClick={() =>
                    void selectDirection(direction.id).catch((error) =>
                      setFailure(String(error)),
                    )
                  }
                >
                  {direction.state === "selected" ? "Selected" : "Choose"}
                </button>
                <button disabled={direction.state !== "proposed"} onClick={()=>void recordDirectionFeedback(direction.id,"rejected").catch((error)=>setFailure(String(error)))}>Reject</button>
                <button onClick={()=>void recordDirectionFeedback(direction.id,"liked").catch((error)=>setFailure(String(error)))}>More like this</button>
                <button onClick={()=>void recordDirectionFeedback(direction.id,"disliked").catch((error)=>setFailure(String(error)))}>Less like this</button>
                <button onClick={()=>void recordDirectionFeedback(direction.id,"preserved").catch((error)=>setFailure(String(error)))}>Keep this detail</button>
              </article>
            ))}
          </>
        )}
        <h2>Screens</h2>
        {Object.entries(document.views).map(([id, view]) => (
          <div key={id}>
            <button
              className={`nav-item ${id === viewId ? "active" : ""}`}
              onClick={() => {
                setViewId(id);
                setViewState(view.initialState ?? "default");
              }}
            >
              {view.title}
              <span>{Object.keys(view.states).length} states</span>
            </button>
            {id === viewId && (
              <select
                aria-label="View state"
                value={viewState}
                onChange={(event) => setViewState(event.target.value)}
              >
                {Object.keys(view.states).map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            )}
          </div>
        ))}
        <h2>Flows</h2>
        {Object.entries(document.flows).map(([id, flow]) => (
          <button
            key={id}
            className="nav-item"
            onClick={() => {
              const start = (
                flow as { start?: { view: string; state: string } }
              ).start;
              if (start) {
                setViewId(start.view);
                setViewState(start.state);
              }
            }}
          >
            {(flow as { title?: string }).title ?? id}
            <span>
              {((flow as { transitions?: unknown[] }).transitions ?? []).length}{" "}
              steps
            </span>
          </button>
        ))}
      </aside>
      <section className="workspace">
        <div className="workspace-label">
          <span>{viewport}</span>
          <span>{mode}</span>
        </div>
        <div className={`device device-${viewport}`}>
          {mode === "edit" ? (
            <Puck
              config={config}
              data={data}
              onChange={(next) => {
                const operation = puckChangeToOperation(document, next, viewId);
                if (operation)
                  void commit(operation).catch((error) =>
                    setFailure(String(error)),
                  );
              }}
              onPublish={() => undefined}
              viewports={[
                {
                  width:
                    viewport === "compact"
                      ? 390
                      : viewport === "regular"
                        ? 768
                        : 1280,
                  height: "auto",
                  label: viewport,
                },
              ]}
              permissions={{
                drag: true,
                duplicate: true,
                delete: true,
                edit: true,
                insert: true,
              }}
            />
          ) : (
            <>
            {previewAssetError && <p role="alert">Preview asset failed: {previewAssetError}</p>}
            <iframe
              ref={previewRef}
              className="plain-preview"
              title="Isolated prototype preview"
              sandbox="allow-scripts"
              srcDoc={previewDocument(document, viewId, viewState, viewport, previewAssets?.document === document ? previewAssets.assets : {})}
            />
            </>
          )}
        </div>
      </section>
      <aside className="inspector">
        <p className="eyebrow">Selected element</p>
        <h2>
          {selectedNode?`${selectedNode.type} · ${selectedNode.id}`:"No selection"}
        </h2>
        <p className="quiet">
          {selectedNode?"Edit this typed Design Document node.":"Select an element in Preview mode."}
        </p>
        <label>
          Content
          <input
            value={String(
              selectedNode?.props?.content??selectedNode?.props?.label??"",
            )}
            readOnly
          />
        </label>
        <button
          onClick={updateTitle}
          disabled={!selectedNode}
        >
          Edit text
        </button>
        <button onClick={insert}>Insert action</button>
        <button
          onClick={move}
          disabled={(document.views[viewId]?.root.children?.length ?? 0) < 2}
        >
          Move last to top
        </button>
        <hr />
        <p className="eyebrow">Ask Prism</p>
        <textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Describe the change you want…"
        />
        <button
          className="primary"
          disabled={working || !instruction.trim()}
          onClick={() =>
            void propose().catch((error) => setFailure(String(error)))
          }
        >
          {working ? "Working…" : "Propose change"}
        </button>
        <button onClick={() => void loadLearned()}>What Prism learned</button>
        {Object.entries(learned).map(([key, value]) => (
          <details key={key}>
            <summary>{key}</summary>
            <pre>{JSON.stringify(value, null, 2)}</pre>
          </details>
        ))}
        {preferenceEvents
          .filter(
            (event) =>
              event.action !== "retracted" &&
              !preferenceEvents.some(
                (candidate) => candidate.retractsEventId === event.eventId,
              ),
          )
          .map((event) => (
            <button
              key={event.eventId}
              onClick={() =>
                void retractPreference(event.eventId).catch((error) =>
                  setFailure(String(error)),
                )
              }
            >
              Forget {event.action}
            </button>
          ))}
        <button onClick={() => void loadRevisions()}>Revision history</button>
        {revisions.map((revision, index) => (
          <div key={revision.id} className="revision-entry">
            <span>Revision {revision.revision}</span>
            <button
              disabled={index === 0}
              onClick={() =>
                void restoreRevision(revision.id).catch((error) =>
                  setFailure(String(error)),
                )
              }
            >
              {index === 1 ? "Undo" : "Restore"}
            </button>
          </div>
        ))}
      </aside>
      <nav className="mobile-nav">
        <button
          onClick={() => setPanel(panel === "navigate" ? null : "navigate")}
        >
          Navigate
        </button>
        <button onClick={() => setPanel(panel === "insert" ? null : "insert")}>
          Insert
        </button>
        <button onClick={() => setPanel(panel === "prism" ? null : "prism")}>
          Prism
        </button>
      </nav>
      {panel && (
        <section className="sheet">
          <button className="sheet-close" onClick={() => setPanel(null)}>
            Close
          </button>
          <h2>
            {panel === "navigate"
              ? "Screens and flows"
              : panel === "insert"
                ? "Insert component"
                : "Ask Prism"}
          </h2>
          {panel === "insert" && (
            <button onClick={insert}>Insert action</button>
          )}
          {panel === "navigate" &&
            Object.entries(document.views).map(([id, view]) => (
              <button
                key={id}
                onClick={() => {
                  setViewId(id);
                  setPanel(null);
                }}
              >
                {view.title}
              </button>
            ))}
          {panel === "prism" && (
            <>
              <textarea
                aria-label="Prism instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="Describe the change you want…"
              />
              <button
                className="primary"
                disabled={working || !instruction.trim()}
                onClick={() =>
                  void propose().catch((error) => setFailure(String(error)))
                }
              >
                Propose change
              </button>
            </>
          )}
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
