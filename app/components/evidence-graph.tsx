'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { buildEvidenceGraph } from '../lib/investigation/evidence-graph';
import type { Investigation } from '../lib/investigation/types';

export default function EvidenceGraph({ investigation }: { investigation: Investigation }) {
  const graph = useMemo(() => buildEvidenceGraph(investigation), [investigation]);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('All');
  const detail = useRef<HTMLHeadingElement>(null);
  const uid = useId();
  const node = graph.nodes.find(n => n.id === selected);
  const visible = graph.nodes.filter(n => (kind === 'All' || n.kind === kind) && `${n.title} ${n.id} ${n.status}`.toLowerCase().includes(query.toLowerCase()));
  const connections = node ? graph.edges.filter(e => e.from === node.id || e.to === node.id) : [];
  function inspect(id: string) { setSelected(id); requestAnimationFrame(() => detail.current?.focus()); }
  return <section className="evidence-graph" aria-labelledby={`${uid}-title`}>
    <h3 id={`${uid}-title`}>Evidence graph</h3>
    <p>Explore observations → hypotheses → experiments → results → repairs. Connections come from recorded references; an arrow does not establish causation.</p>
    <div className="graph-controls"><label>Find a node<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title, ID or status" /></label><label>Node type<select value={kind} onChange={e => setKind(e.target.value)}><option>All</option>{Array.from(new Set(graph.nodes.map(n => n.kind))).map(k => <option key={k}>{k}</option>)}</select></label><button onClick={() => { setQuery(''); setKind('All'); }}>Clear filters</button></div>
    <p role="status">{visible.length} of {graph.nodes.length} nodes · {graph.edges.length} recorded connections</p>
    <div className="graph-layout"><div className="graph-nodes" aria-label="Evidence graph nodes">{visible.length ? visible.map(n => <button key={n.id} className="graph-node" aria-pressed={n.id === node?.id} onClick={() => inspect(n.id)}><span>{n.kind} · {n.status || 'recorded'}</span><strong>{n.title}</strong><small>{n.id}</small></button>) : <p>No nodes match these filters.</p>}</div>
      <div className="graph-inspector"><h4 tabIndex={-1} ref={detail}>{node ? `${node.kind}: ${node.title}` : 'Select a node to trace its evidence'}</h4>
        {node && <><p><code>{node.id}</code> · {node.status}</p><h5>Recorded connections</h5>{connections.length ? <ul>{connections.map(e => { const outgoing = e.from === node.id; const other = graph.nodes.find(n => n.id === (outgoing ? e.to : e.from))!; return <li key={`${e.from}:${e.to}:${e.relationship}`}><span>{outgoing ? 'Outgoing →' : 'Incoming ←'} {e.relationship}</span><button onClick={() => inspect(other.id)}>{other.kind}: {other.title}</button>{e.rationale && <p>{e.rationale}</p>}</li>; })}</ul> : <p>No connections are recorded. This node has no evidence links to follow.</p>}<details open><summary>Original record: values, tool inputs and provenance</summary><pre>{JSON.stringify(node.record, null, 2)}</pre></details></>}
      </div></div>
  </section>;
}
