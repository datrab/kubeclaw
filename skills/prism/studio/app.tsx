import {StudioChat} from './StudioChat.tsx';
import type { ProjectDesignStatus } from '../control/project-status.ts';
import {savedRevision,pendingRevision,submitRevision,waitForRevision,type RevisionClient,type PendingRevision} from './agent-revision-client.ts';
import { savedRound, pendingRound, submitRound, currentDirections, loadRoundDocument, completeRound, waitForRound, type RoundClient, type StudioDirection } from "./design-round-client.ts";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "./studio.css";
import type { PrismDocument, PrismNode } from "@kubeclaw/prism-contracts-v1";
import {
  applyOperation,
  type PrismOperation,
  type Viewport,
} from "../domain/index.ts";
import { puckChangeToOperation } from "./puck-adapter.ts";
import { project } from "./projection.ts";
import { loadPreviewAssets, type PreviewAssets } from "./preview-assets.ts";
import { previewDocument } from "./preview.ts";
import { config } from "./puck-config.tsx";
import { studioFlows, previewActionTarget, previewSelection } from "./flows.ts";
import { ElementEditor } from './element-editor.tsx';
import { elements } from './element-operations.ts';


function App() {
  const [document, setDocument] = useState<PrismDocument | null>(null);
  const flows = useMemo(() => document ? studioFlows(document) : [], [document]);
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
  const [actionError, setActionError] = useState("");
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
  const [viewport, setViewport] = useState<Viewport>(() => matchMedia('(max-width: 800px)').matches ? 'compact' : 'wide');
  const canvasStage = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  useEffect(() => {
    if (!document || !canvasStage.current) return;
    const observer = new ResizeObserver(([entry]) => setCanvasWidth(entry.contentRect.width));
    observer.observe(canvasStage.current); return () => observer.disconnect();
  }, [Boolean(document)]);
  const canvasZoom = viewport === 'compact' || !canvasWidth ? 1 : Math.min(1, canvasWidth / (viewport === 'regular' ? 768 : 1280));
  const [requestedViewId, setViewId] = useState("home");
  const viewId = document && !document.views[requestedViewId] ? Object.keys(document.views)[0] ?? "home" : requestedViewId;
  const [requestedViewState, setViewState] = useState("default");
  const viewState = document?.views[viewId] && !document.views[viewId].states[requestedViewState] ? document.views[viewId].initialState ?? Object.keys(document.views[viewId].states)[0] ?? "default" : requestedViewState;
  const [instruction, setInstruction] = useState("");
  const [working, setWorking] = useState(false);
  const [revisionPending,setRevisionPending]=useState(false);
  const [revisionMessage,setRevisionMessage]=useState("");
  const [directionBusy,setDirectionBusy]=useState(false);
  const [learned, setLearned] = useState<Record<string, unknown>>({});
  const [preferenceEvents, setPreferenceEvents] = useState<
    Array<{ eventId: string; action: string; retractsEventId?: string }>
  >([]);
  const [directions,setDirections]=useState<StudioDirection[]>([]);
  const directionName=(direction:StudioDirection)=>{
    const parts=direction.title.split(/ · | – | — | - /);
    const shared=directions.filter(item=>item.title.split(/ · | – | — | - /)[0]===parts[0]).length>1;
    return shared&&parts.length>1?parts.slice(1).join(' · '):parts[0];
  };
  const [roundMessage,setRoundMessage]=useState("");
  const [roundBusy,setRoundBusy]=useState(false);
  const [roundPending,setRoundPending]=useState(false);
  const [brief,setBrief]=useState<Record<string,unknown>|null>(null);
  const [projectStatus,setProjectStatus]=useState<ProjectDesignStatus|null>(null);
  const [projects,setProjects]=useState<Array<{id:string;external_id:string;name:string;document_id:string|null;direction_count:number}>>([]);
  const [revisions, setRevisions] = useState<
    Array<{ id: string; revision: number; createdAt: string }>
  >([]);
  const [panel, setPanel] = useState<"directions" | "navigate" | "insert" | "prism" | null>(
    null,
  );
  const [mode, setMode] = useState<"edit" | "preview">(() => new URLSearchParams(location.search).get("mode") === "edit" ? "edit" : "preview");
  const previewRef=useRef<HTMLIFrameElement>(null);
  const [selectedNodeId,setSelectedNodeId]=useState<string|null>(null);
  const selectedNode=useMemo(()=>document ? elements(document,viewId).find(item=>item.node.id===selectedNodeId)?.node : undefined,[document,selectedNodeId,viewId]);
  useEffect(()=>{
    const root=document?.views[viewId]?.root as PrismNode|undefined;
    if(!root){setSelectedNodeId(null);return;}
    const firstEditable=(node:PrismNode):PrismNode=>node.children?.map(firstEditable)[0]??node;
    setSelectedNodeId((current)=>{
      const contains=(node:PrismNode):boolean=>node.id===current||Boolean(node.children?.some(contains));
      return current&&contains(root)?current:firstEditable(root).id;
    });
  },[document,viewId]);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== previewRef.current?.contentWindow) return;
      const selection = previewSelection(event.data);
      if (selection) setSelectedNodeId(selection);
      const target = previewActionTarget(flows, { view: viewId, state: viewState }, event.data);
      if (target) { setViewId(target.view); setViewState(target.state); }
    };
    addEventListener("message", receive);
    return () => removeEventListener("message", receive);
  }, [flows, viewId, viewState]);
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
      const query = new URLSearchParams(location.search);
      const id = query.get("document");
      const pendingProject = query.get("project");
      if (!id && pendingProject) {
        const response = await fetch(`/v1/projects/${encodeURIComponent(pendingProject)}/status`);
        if (!response.ok) throw new Error("Project status could not load");
        const status = await response.json() as ProjectDesignStatus;
        if (status.documentId) {
          query.set("document",status.documentId);location.replace(`?${query.toString()}`);return;
        }
        setProjectStatus(status);return;
      }
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
      const revisionClient:RevisionClient={documentId:id,userId:sessionData.userId,csrf:sessionData.csrf,origin:location.origin,storage:sessionStorage};
      const revision=savedRevision(revisionClient);
      if(revision){setRevisionPending(true);setInstruction(revision.input.instruction);setWorking(true);setRevisionMessage("Gespeicherte Änderung wird geprüft…");}
      const projectId = new URLSearchParams(location.search).get("project");
      if (projectId) {
        const client:RoundClient={projectId,userId:sessionData.userId,csrf:sessionData.csrf,origin:location.origin,storage:sessionStorage};
        const pending=savedRound(client);
        if(pending){setRoundPending(true);setRoundMessage("Reconnecting to the same design round…");await submitRound(client,pending);}
        const briefResponse=await fetch(`/v1/projects/${encodeURIComponent(projectId)}/brief`);
        if(briefResponse.ok)setBrief(((await briefResponse.json()) as {request?:Record<string,unknown>}).request??null);
        for(let attempt=0;attempt<300;attempt++){
          const items=await currentDirections(client);
          if(items.length){
            const loadedRound=await loadRoundDocument(client,items,id);setDirections(items);setDocument(loadedRound.document);
            const currentQuery=new URLSearchParams(location.search);currentQuery.set("document",loadedRound.documentId);history.replaceState(null,"",`?${currentQuery.toString()}`);
            const completed=completeRound(client,items);setRoundPending(Boolean(savedRound(client)));
            setRoundMessage(completed ? "New design round ready." : pending ? "Current round loaded; the previous request remains available for retry." : "");
            break;
          }
          await new Promise(resolve=>setTimeout(resolve,2000));
        }
      }
      if(revision)await continueRevision(revisionClient,revision).catch(error=>setActionError(String(error)));
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
  const continueRevision = async (client:RevisionClient,pending:PendingRevision) => {
    setWorking(true);setRevisionPending(true);
    setRevisionMessage(pending.jobId ? "Status deiner Änderung wird geladen…" : "Änderung wird gesendet…");
    try {
      // A known job is resumed by GET, never re-admitted as a fresh change.
      const accepted=pending.jobId ? pending : await submitRevision(client,pending);
      const next=await waitForRevision(client,accepted,status=>setRevisionMessage(status==='accepted'
        ? "Deine Änderung wartet auf Prism…" : status==='running' ? "Prism arbeitet an deiner Änderung…" : "Änderung wird übernommen…"));
      setDocument(next);setRevisionPending(false);setQuality(null);setAcceptedWarnings([]);setInstruction("");
      setRevisionMessage(`Änderung übernommen · Revision ${next.meta.revision}. Du kannst die Vorschau jetzt prüfen.`);
    } catch(error) {
      setRevisionMessage("Die Änderung konnte noch nicht bestätigt werden. Dein Text bleibt gespeichert. Prüfe den Status erneut.");
      throw error;
    } finally {setWorking(false);}
  };
  const propose = async () => {
    if (working || directionBusy || !document || (!instruction.trim() && !revisionPending)) return;
    setActionError("");
    const id = new URLSearchParams(location.search).get("document");
    if (!id) throw new Error("Document ID is missing");
    const client:RevisionClient={documentId:id,userId,csrf,origin:location.origin,storage:sessionStorage};
    const pending=pendingRevision(client,document,instruction.trim());setRevisionPending(true);
    await continueRevision(client,pending);
  };
  const previewDirection = async (direction:StudioDirection) => {
    if(working || revisionPending || directionBusy)return;
    if(!direction.source_document_id)throw new Error("Für diesen Entwurf ist noch keine Vorschau verfügbar.");
    setDirectionBusy(true);setActionError("");
    try {
      const projectId=new URLSearchParams(location.search).get('project');
      if(!projectId)throw new Error("Project ID is missing");
      const loaded=await loadRoundDocument({projectId,userId,csrf,origin:location.origin,storage:sessionStorage},[direction],direction.source_document_id);
      const query=new URLSearchParams(location.search);query.set('document',loaded.documentId);history.replaceState(null,'',`?${query.toString()}`);
      setDocument(loaded.document);setViewId(Object.keys(loaded.document.views)[0]??'home');setMode('preview');setPanel(null);setQuality(null);setRevisionMessage("");
      const client:RevisionClient={documentId:loaded.documentId,userId,csrf,origin:location.origin,storage:sessionStorage};
      const pending=savedRevision(client);
      setInstruction(pending?.input.instruction??"");setRevisionPending(!!pending);
      if(pending)await continueRevision(client,pending);
    } finally {setDirectionBusy(false);}
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
  const findingTarget = (target:string) => {
    const find=(node:PrismNode):PrismNode|undefined=>node.id===target?node:(node.children??[]).map(find).find(Boolean);
    const node=document&&Object.values(document.views).map(view=>find(view.root)).find(Boolean);
    return node ? String(node.props?.label??node.props?.content??node.type).slice(0,100) : target;
  };
  const refreshChatDocument = async () => {
    const id=new URLSearchParams(location.search).get('document');if(!id)return;
    const project=new URLSearchParams(location.search).get('project');
    if(project){const response=await fetch(`/v1/projects/${encodeURIComponent(project)}/directions`);if(!response.ok)throw new Error('Neue Entwürfe konnten nicht geladen werden.');const value=await response.json();if(new URLSearchParams(location.search).get('document')!==id)return;if(value.items?.length){setDirections(value.items);if(!value.items.some((item:{source_document_id:string})=>item.source_document_id===id)){await previewDirection(value.items[0]);return;}}}
    const r=await fetch(`/v1/documents/${encodeURIComponent(id)}`);if(!r.ok)throw new Error('Aktueller Entwurf konnte nicht geladen werden.');
    // viewId and viewState are derived above with existence checks, including renamed/removed views.
    const value=await r.json();if(new URLSearchParams(location.search).get('document')===id){setDocument(value.document);setQuality(null);}
  };
  const saveChatPreference = async (turn:{job_id:string;message:string;created_at?:string}) => {
    if(!document)return;
    const event={schema:'prism.preference-event.v1',eventId:`event-chat-${turn.job_id}`,userId,projectId:document.meta.projectId,action:'preserved',target:{documentId:new URLSearchParams(location.search).get('document'),chatTurnId:turn.job_id},traits:[turn.message],context:{surface:'chat',preferenceType:'project'},source:'explicit',learningScope:'project',occurredAt:new Date(turn.created_at!).toISOString()};
    const r=await fetch('/v1/preferences',{method:'POST',headers:{'content-type':'application/json','x-prism-csrf':csrf},body:JSON.stringify(event)});const value=await r.json();if(!r.ok)throw new Error(value.error??'Vorliebe konnte nicht gespeichert werden.');
  };
  const confirmDirection = async (id:string) => {if(directionBusy||working||revisionPending)return;setDirectionBusy(true);setActionError('');try{await selectDirection(id);}catch(error){setActionError(String(error));}finally{setDirectionBusy(false);}};
  const selectDirection = async (directionId: string) => {
    const documentId = new URLSearchParams(location.search).get("document");
    if (!documentId) throw new Error("Document ID is missing");
    const route = `/v1/directions/${encodeURIComponent(directionId)}/select`;
    const direction=directions.find(item=>item.id===directionId);
    const sourceId=direction?.source_document_id;if(!sourceId)throw new Error("Entwurf nicht verfügbar");
    if(!document||documentId!==sourceId)throw new Error('Öffne zuerst die Vorschau dieses Entwurfs und bestätige dann den angezeigten Stand.');
    const mutation = directionRequest(route, {documentId:sourceId,expectedRevision:document.meta.revision});
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
    setViewId(Object.keys(result.document.views)[0]??'home');setPanel(null);
    setApprovalMessage('Entwurf bestätigt. Deine Auswahl wurde als Vorliebe für dieses Projekt gespeichert. Das ist noch keine Produktionsfreigabe.');
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
  const requestNewRound = async () => {
    const query=new URLSearchParams(location.search);
    const projectId=query.get("project");const documentId=query.get("document");
    if (!projectId || !documentId || !document) throw new Error("Current design identity is missing");
    const client:RoundClient={projectId,userId,csrf,origin:location.origin,storage:sessionStorage};
    const pending=pendingRound(client,{documentId,expectedRevision:document.meta.revision,parentRoundId:directions[0]?.generation_id});
    setRoundPending(true);setRoundBusy(true);setRoundMessage("Requesting the design round…");
    try {
      const accepted=await submitRound(client,pending);
      setRoundMessage("Design round pending. Checking for the three proposals…");
      const ready=await waitForRound(client,accepted);
      if(!ready){setRoundMessage("Still pending. Retry the same round to reconnect without creating another request.");return;}
      setDirections(ready.directions);setDocument(ready.document);setQuality(null);setAcceptedWarnings([]);setApprovalMessage("");setRoundPending(false);setRoundMessage("New design round ready.");
      query.set("document",ready.documentId);history.replaceState(null,"",`?${query.toString()}`);
    } catch(error) {
      setRoundMessage(`Round pending or conflicted: ${error instanceof Error ? error.message : String(error)} The request key is retained; retry does not create a new round.`);
    } finally {setRoundBusy(false);}
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
    }).catch((error) => setActionError(String(error)));
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
          {projectStatus ? (
            <section aria-label="Project status">
              <h2>{projectStatus.name}</h2>
              <p role="status">{projectStatus.summary}</p>
              <p>No design is available to open yet. Refresh checks the existing request; it does not start another design.</p>
              <a href="?">Back to projects</a>
            </section>
          ) : projects.length === 0 ? (
            <>
              <p>No design requests yet.</p>
              <p>Projects appear here after Nova sends an architecture to Prism.</p>
            </>
          ) : (
            <section aria-label="Prism projects">
              <h2>Projects from Nova</h2>
              {projects.map((project) => (
                <article key={project.id}>
                  <strong><a className="project-link" href={`?project=${encodeURIComponent(project.id)}${project.document_id ? `&document=${encodeURIComponent(project.document_id)}` : ""}`}>{project.name}</a></strong>
                  {project.document_id ? (
                    <>
                      <p>{project.direction_count} design directions</p>
                      <a href={`?project=${encodeURIComponent(project.id)}&document=${encodeURIComponent(project.document_id)}`}>Open designs</a>
                    </>
                  ) : (
                    <p>No designs yet. Open the project to see its status.</p>
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
          <button onClick={() => { setMode(mode === "edit" ? "preview" : "edit"); setPanel(null); }}>
            {mode === "edit" ? "Preview" : "Edit"}
          </button>
          <button
            onClick={() =>
              void evaluateDesign().catch((error) => setActionError(String(error)))
            }
          >
            Prototyp prüfen
          </button>
          <button
            className="approve"
            onClick={() =>
              void approve().catch((error) => setActionError(String(error)))
            }
          >
            Approve
          </button>
        </div>
      </header>
      <aside className="navigator" aria-label="Design navigation">
        <p className="eyebrow">Experience</p>
        {roundMessage && <p role="status">{roundMessage}</p>}
        {(roundPending || (directions.length===3 && directions.every(direction=>direction.state==="rejected"))) && <button disabled={roundBusy} onClick={()=>void requestNewRound().catch(error=>setRoundMessage(String(error)))}>{roundBusy ? "Waiting for new round…" : roundPending ? "Retry the same design round" : "Request new design round"}</button>}
        {directions.length > 0 && (
          <>
            <h2>Directions</h2>

            {directions.map((direction) => (
              <article key={direction.id} className="direction">
                <strong>{direction.title}</strong>
                <p>{direction.summary}</p>
                <button disabled={working || revisionPending || directionBusy} onClick={()=>void previewDirection(direction).catch(error=>setActionError(String(error)))}>Vorschau ansehen</button>
                {direction.evidence?.tradeoffs?.length?<><small>Trade-offs</small><ul>{direction.evidence.tradeoffs.map((item)=><li key={item}>{item}</li>)}</ul></>:null}
                {direction.evidence?.references?.length?<p className="quiet">Grounded in {direction.evidence.references.length} approved corpus references.</p>:<p className="quiet">No approved corpus reference matched this brief.</p>}
                <button
                  disabled={direction.state === "selected" || working || revisionPending || directionBusy}
                  onClick={() =>
                    void selectDirection(direction.id).catch((error) =>
                      setActionError(String(error)),
                    )
                  }
                >
                  {direction.state === "selected" ? "Selected" : "Choose"}
                </button>
                <button disabled={direction.state !== "proposed"} onClick={()=>void recordDirectionFeedback(direction.id,"rejected").catch((error)=>setActionError(String(error)))}>Reject</button>
                <button onClick={()=>void recordDirectionFeedback(direction.id,"liked").catch((error)=>setActionError(String(error)))}>More like this</button>
                <button onClick={()=>void recordDirectionFeedback(direction.id,"disliked").catch((error)=>setActionError(String(error)))}>Less like this</button>
                <button onClick={()=>void recordDirectionFeedback(direction.id,"preserved").catch((error)=>setActionError(String(error)))}>Keep this detail</button>
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
        {flows.map((flow) => (
          <button
            key={flow.id}
            className="nav-item"
            onClick={() => {
              setViewId(flow.start.view);
              setViewState(flow.start.state);
            }}
          >
            {flow.title}
            <span>
              {flow.transitions.length}{" "}
              steps
            </span>
          </button>
        ))}
      </aside>
      <section className="workspace">
        {approvalMessage && (
          <p role="status" className="approval-status">
            {approvalMessage}
          </p>
        )}

        {quality && (
          <section aria-label="Design quality">
            <h2>Prototyp-Prüfung: {quality.status==='ready'?'keine offenen Hinweise':quality.status==='blocked'?'Fehler beheben':'Hinweise prüfen'}</h2><p>Prüft Funktionen und Aufbau, nicht deinen gestalterischen Geschmack. Mit „Als geprüft markieren“ bestätigst du nur, dass du einen Hinweis gelesen hast. Das repariert keine Funktion und bestätigt nicht den Entwurf.</p>
            {quality.findings.some(finding=>finding.level==='review') && <p role="status">{quality.findings.filter(finding=>finding.level==='review'&&acceptedWarnings.includes(finding.id)).length} von {quality.findings.filter(finding=>finding.level==='review').length} Hinweisen als geprüft markiert. Nur für diese Prüfung; keine Designauswahl und keine Vorliebe gespeichert.</p>}
            {quality.findings.length>0 && <p>Fehlende Aktionen kannst du im Prism-Chat mit dem Design-Agenten klären. Nach einer Änderung erneut „Prototyp prüfen“ wählen — erst dann wird neu geprüft, ob der Hinweis behoben ist.</p>}
            {quality.findings.length === 0 ? (
              <p>Keine Hinweise.</p>
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
                  <strong>{finding.level==='review'?(acceptedWarnings.includes(finding.id)?'Geprüft — nicht behoben':'Als geprüft markieren'):finding.level==='blocking'?'Fehler':'Hinweis'}</strong> {finding.message==='An interactive action is not connected to a flow.'?'Für dieses Bedienelement ist noch keine Aktion oder Navigation hinterlegt.':finding.message}
                  {finding.target ? ` · ${findingTarget(finding.target)}` : ""}
                </label>
              ))
            )}
          </section>
        )}
        {brief&&<details aria-label="Design brief" className="brief"><summary>Design brief</summary><p>Prism imported the approved Nova architecture and uses it as the design boundary.</p><dl>{Object.entries((brief.architectureContent&&typeof brief.architectureContent==="object"?brief.architectureContent:brief) as Record<string,unknown>).slice(0,12).map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{typeof value==="string"?value:JSON.stringify(value)}</dd></React.Fragment>)}</dl></details>}
        {actionError && <p role="alert">{actionError}</p>}
        {directions.length>0 && <section className="design-comparison" aria-label="Entwürfe vergleichen">
          <div className="comparison-heading"><strong>{directions.length} Entwürfe vergleichen</strong><span>Vorschau ohne Auswahl</span></div>
          <div className="direction-tabs" role="tablist" aria-label="Designrichtungen">
            {directions.map((direction,index)=><button key={direction.id} role="tab" aria-selected={direction.source_document_id===new URLSearchParams(location.search).get('document')} disabled={working || revisionPending || directionBusy} onClick={()=>void previewDirection(direction).catch(error=>setActionError(String(error)))}><span>{index+1}</span>{directionName(direction)}</button>)}
          </div>
        </section>}
        {directions.filter(item=>item.source_document_id===new URLSearchParams(location.search).get('document')).map(item=><section className="design-decision" key={item.id} aria-label="Entwurf bestätigen">
          <strong>{directionName(item)}</strong>
          <button className="primary" disabled={item.state!=='proposed'||working||revisionPending||directionBusy} onClick={()=>void confirmDirection(item.id)}>{item.state==='selected'?'✓ Entwurf bestätigt':item.state==='rejected'?'Entwurf verworfen':'Diesen Entwurf bestätigen'}</button>
          <span>Speichert deine Auswahl für dieses Projekt. Keine Veröffentlichung.</span>
          {item.state==='proposed'&&<button disabled={working||revisionPending||directionBusy} onClick={()=>void recordDirectionFeedback(item.id,'rejected').catch(error=>setActionError(String(error)))}>Diesen Entwurf verwerfen</button>}
        </section>)}
        {revisionMessage && <p className="revision-status" role="status" aria-live="polite">{revisionMessage}</p>}
        <div className="workspace-label">
          <span>{document.views[viewId]?.title ?? viewId} · {viewport === "compact" ? "390" : viewport === "regular" ? "768" : "1280"} px</span>
          <span>{mode === "preview" ? "Interactive preview" : "Design canvas"}</span>
        </div>
        <div className="canvas-stage" ref={canvasStage}><div className={`device device-${viewport}`} style={{transform:`scale(${canvasZoom})`,transformOrigin:"top left"}}>
          {mode === "edit" ? (
            <Puck
              key={`${document.meta.documentId}-${viewId}-${viewport}`}
              config={config}
              data={data}
              onChange={(next) => {
                const operation = puckChangeToOperation(document, next, viewId);
                if (operation)
                  void commit(operation).catch((error) =>
                    setActionError(String(error)),
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
            >
              <div className="design-canvas">
                <details className="layout-tools"><summary>Component and field tools</summary><div className="layout-tools-content"><Puck.Components /><Puck.Fields /></div></details>
                <Puck.Preview />
              </div>
            </Puck>
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
        </div></div>
      </section>
      <aside className="inspector" aria-label="Element properties">
        <p className="eyebrow">Selected element</p>
        <h2>
          {selectedNode?`${selectedNode.type} · ${selectedNode.id}`:"No selection"}
        </h2>
        <p className="quiet">
          {selectedNode?"Edit this typed Design Document node.":"Select an element in Preview mode."}
        </p>
        <ElementEditor design={document} viewId={viewId} selectedId={selectedNodeId} onSelect={setSelectedNodeId} onCommit={commit} />
        <button onClick={insert}>Insert action</button>
        <hr />
        <p className="eyebrow">Ask Prism</p>
        {revisionMessage && <p className="revision-status" role="status" aria-live="polite">{revisionMessage}</p>}
<StudioChat documentId={new URLSearchParams(location.search).get('document')!} title={document.meta.title} userId={userId} csrf={csrf} busy={working||revisionPending||directionBusy} onCompleted={refreshChatDocument} onPreference={saveChatPreference}/>
        {revisionPending && <p className="quiet">Gespeicherter Änderungsauftrag: {instruction}</p>}{revisionPending && <button disabled={working} onClick={()=>void propose().catch(error=>setActionError(String(error)))}>{working ? 'Prism arbeitet…' : 'Status der bisherigen Änderung prüfen'}</button>}
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
                  setActionError(String(error)),
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
                  setActionError(String(error)),
                )
              }
            >
              {index === 1 ? "Undo" : "Restore"}
            </button>
          </div>
        ))}
      </aside>
      <nav className="mobile-nav">
        <button aria-expanded={panel === "directions"} onClick={()=>setPanel(panel === "directions" ? null : "directions")}>Entwürfe{directions.length ? ` (${directions.length})` : ""}</button>
        <button
          aria-expanded={panel === "navigate"} onClick={() => setPanel(panel === "navigate" ? null : "navigate")}
        >
          Navigate
        </button>
        <button aria-expanded={panel === "insert"} onClick={() => setPanel(panel === "insert" ? null : "insert")}>
          Edit elements
        </button>
        <button aria-expanded={panel === "prism"} onClick={() => setPanel(panel === "prism" ? null : "prism")}>
          Prism
        </button>
      </nav>
      {panel && (
        <section className="sheet" aria-label="Mobile tools">
          <button className="sheet-close" onClick={() => setPanel(null)}>
            Close
          </button>
          <h2>
            {panel === "directions" ? "Entwürfe vergleichen" : panel === "navigate"
              ? "Screens and flows"
              : panel === "insert"
                ? "Edit elements"
                : "Ask Prism"}
          </h2>
          {actionError && panel !== 'prism' && <p role="alert">{actionError}</p>}
          {panel === "directions" && <>
            <p className="quiet">Tippe auf einen Entwurf, um sein Layout anzusehen. Dadurch wird noch nichts ausgewählt oder verändert.</p>
            <div className="direction-options">{directions.map((direction,index)=><button key={direction.id} aria-pressed={direction.source_document_id===new URLSearchParams(location.search).get('document')} disabled={working || revisionPending || directionBusy} onClick={()=>void previewDirection(direction).catch(error=>setActionError(String(error)))}><strong>{index+1} · {direction.title}</strong><span>{direction.summary}</span><small>Vorschau ansehen →</small></button>)}</div>
            {!directions.length && <p role="status">Die Entwürfe werden noch vorbereitet.</p>}
            {(working || revisionPending) && <p role="status">Schließe zuerst die laufende Änderung ab. Sie bleibt diesem Entwurf zugeordnet.</p>}
          </>}
          {panel === "insert" && (
            <>
              <ElementEditor design={document} viewId={viewId} selectedId={selectedNodeId} onSelect={setSelectedNodeId} onCommit={commit} />
              <button onClick={insert}>Insert action</button>
            </>
          )}
          {panel === "navigate" &&
            Object.entries(document.views).map(([id, view]) => (
              <button
                key={id}
                onClick={() => {
                  setViewId(id);
                  setViewState(view.initialState ?? "default");
                  setPanel(null);
                }}
              >
                {view.title}
              </button>
            ))}
          {panel === "prism" && (
            <>
              {actionError && <p role="alert">{actionError}</p>}
              {revisionMessage && <p className="revision-status" role="status" aria-live="polite">{revisionMessage}</p>}
              <p className="quiet">Änderung für: {document.meta.title}</p>
<StudioChat documentId={new URLSearchParams(location.search).get('document')!} title={document.meta.title} userId={userId} csrf={csrf} busy={working||revisionPending||directionBusy} onCompleted={refreshChatDocument} onPreference={saveChatPreference}/>
        {revisionPending && <p className="quiet">Gespeicherter Änderungsauftrag: {instruction}</p>}{revisionPending && <button disabled={working} onClick={()=>void propose().catch(error=>setActionError(String(error)))}>{working ? 'Prism arbeitet…' : 'Status der bisherigen Änderung prüfen'}</button>}
            </>
          )}
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
