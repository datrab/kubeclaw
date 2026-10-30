import React, { useEffect, useRef, useState } from 'react';
import type { PrismDocument, PrismNode } from '@kubeclaw/prism-contracts-v1';
import type { PrismOperation } from '../domain/index.ts';
import { elements, elementTitle, reorderElement, textProperty } from './element-operations.ts';

type Commit = (operation: PrismOperation) => Promise<void>;
type Save = (operation: PrismOperation | null) => Promise<void>;
type EditorProps = { design: PrismDocument; viewId: string; selectedId: string | null; onSelect: (id: string) => void; onCommit: Commit };
function useSaveOperation(onCommit: Commit) {
  const [pending, setPending] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const saving = useRef(false);
  async function save(operation: PrismOperation | null) {
    if (!operation || saving.current) return;
    saving.current = true; setPending(true); setMessage(''); setError('');
    try { await onCommit(operation); setMessage('Saved to this design.'); }
    catch (failure) { setError(`${failure instanceof Error ? failure.message : String(failure)}. Your change was not confirmed; reload the current design before retrying.`); }
    finally { saving.current = false; setPending(false); }
  }
  return { save, pending, message, error };
}
function usePointerReorder(design: PrismDocument, viewId: string, save: Save) {
  const [dropId, setDropId] = useState<string | null>(null);
  const dragging = useRef<{ id: string; target: string; pointer: number } | null>(null);
  function dragOver(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragging.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    const row = event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-element-id]');
    const target = row?.dataset.elementId;
    if (target && reorderElement(design, viewId, drag.id, target)) { drag.target = target; setDropId(target); }
    else { drag.target = drag.id; setDropId(null); }
  }
  function finishDrag(event: React.PointerEvent<HTMLButtonElement>, cancelled = false) {
    const drag = dragging.current; dragging.current = null; setDropId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && drag?.pointer === event.pointerId) void save(reorderElement(design, viewId, drag.id, drag.target));
  }
  return { dropId, dragging, dragOver, finishDrag };
}
function ElementList({ design, viewId, selectedId, onSelect, pending, save }: Omit<EditorProps, 'onCommit'> & { pending: boolean; save: Save }) {
  const pointer = usePointerReorder(design, viewId, save);
  return <ol className="element-list" aria-label="Design elements">
    {elements(design, viewId).map(({ node, parentId, depth }) => <li key={node.id} data-element-id={node.id} data-drop-target={pointer.dropId === node.id || undefined}>
      <button type="button" className="element-select" aria-pressed={selectedId === node.id} onClick={() => onSelect(node.id)} style={{ paddingInlineStart: `${8 + Math.min(depth, 5) * 8}px` }}>{elementTitle(node)}</button>
      <button type="button" className="element-drag" aria-label={`Move ${elementTitle(node)}`} disabled={pending || !parentId}
        onPointerDown={event => { if (event.button !== 0 || pending) return; onSelect(node.id); pointer.dragging.current = { id: node.id, target: node.id, pointer: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={pointer.dragOver} onPointerUp={event => pointer.finishDrag(event)} onPointerCancel={event => pointer.finishDrag(event, true)}
      >↕</button>
    </li>)}
  </ol>;
}
function ElementText({ node, revision, pending, save }: { node?: PrismNode; revision: number; pending: boolean; save: Save }) {
  const property = node ? textProperty(node) : undefined;
  const savedText = property && node ? String(node.props?.[property]) : '';
  const [draft, setDraft] = useState('');
  useEffect(() => { setDraft(savedText); }, [node?.id, savedText]);
  if (!property || !node) return null;
  return <form onSubmit={event => { event.preventDefault(); void save({ type: 'node.props.set', baseRevision: revision, nodeId: node.id, props: { [property]: draft } }); }}>
    <label>Element text<textarea value={draft} onChange={event => setDraft(event.target.value)} disabled={pending} /></label>
    <button type="submit" disabled={pending || draft === savedText}>{pending ? 'Saving…' : 'Save text'}</button>
  </form>;
}
/** Shared canonical operation controls, reachable by mouse, keyboard and touch. */
export function ElementEditor({ design, viewId, selectedId, onSelect, onCommit }: EditorProps) {
  const positions = elements(design, viewId), state = useSaveOperation(onCommit);
  const selected = positions.find(item => item.node.id === selectedId);
  const siblings = positions.filter(item => selected?.parentId && item.parentId === selected.parentId);
  const index = siblings.findIndex(item => item.node.id === selectedId);
  const canMoveDown = index >= 0 && index < siblings.length - 1;
  function moveBy(offset: number) {
    const target = siblings[index + offset];
    if (selectedId && target) void state.save(reorderElement(design, viewId, selectedId, target.node.id));
  }
  return <section className="element-editor" aria-label="Element editor" aria-busy={state.pending}>
    <p className="quiet">Choose an element. Drag its handle or move it within its group.</p>
    <ElementList design={design} viewId={viewId} selectedId={selectedId} onSelect={onSelect} pending={state.pending} save={state.save} />
    <div className="element-actions">
      <button type="button" disabled={state.pending || index <= 0} onClick={() => moveBy(-1)}>Move up</button>
      <button type="button" disabled={state.pending || !canMoveDown} onClick={() => moveBy(1)}>Move down</button>
    </div>
    <ElementText node={selected?.node} revision={design.meta.revision} pending={state.pending} save={state.save} />
    {state.message && <p role="status">{state.message}</p>}
    {state.error && <p role="alert">{state.error}</p>}
  </section>;
}
