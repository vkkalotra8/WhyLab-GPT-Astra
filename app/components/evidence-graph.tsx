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
  const visible = graph.nodes.filter(
    n =>
      (kind === 'All' || n.kind === kind) &&
      `${n.title} ${n.id} ${n.status}`.toLowerCase().includes(query.toLowerCase())
  );
  const connections = node ? graph.edges.filter(e => e.from === node.id || e.to === node.id) : [];

  function inspect(id: string) {
    setSelected(id);
    requestAnimationFrame(() => detail.current?.focus());
  }

  return (
    <section className="evidence-graph" aria-labelledby={`${uid}-title`}>
      <div className="section-header">
        <span className="eyebrow cyan">DAG TRACEABILITY</span>
        <h3 id={`${uid}-title`}>Evidence graph</h3>
      </div>
      <p className="graph-intro-desc">
        Explore observations → hypotheses → experiments → results → repairs. Connections reflect recorded references;
        an arrow does not establish causation.
      </p>

      <div className="graph-controls">
        <label>
          <span>Find a node</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search title, ID or status"
          />
        </label>
        <label>
          <span>Node type</span>
          <select value={kind} onChange={e => setKind(e.target.value)}>
            <option>All</option>
            {Array.from(new Set(graph.nodes.map(n => n.kind))).map(k => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="graph-filter-reset"
          onClick={() => {
            setQuery('');
            setKind('All');
          }}
        >
          Clear filters
        </button>
      </div>

      <div className="graph-status-bar" role="status">
        <span className="status-count">
          Showing <strong>{visible.length}</strong> of {graph.nodes.length} nodes
        </span>
        <span className="dot-divider">·</span>
        <span className="connection-count">
          <strong>{graph.edges.length}</strong> recorded connections
        </span>
      </div>

      <div className="graph-layout">
        <div className="graph-nodes" aria-label="Evidence graph nodes">
          {visible.length ? (
            visible.map(n => {
              const kindSlug = n.kind.toLowerCase().replace(/\s+/g, '-');
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`graph-node kind-${kindSlug}`}
                  aria-pressed={n.id === node?.id}
                  onClick={() => inspect(n.id)}
                >
                  <div className="node-top-row">
                    <span className={`node-kind-chip chip-${kindSlug}`}>{n.kind}</span>
                    {n.status && <span className="node-status-chip">{n.status}</span>}
                  </div>
                  <strong className="node-title">{n.title}</strong>
                  <code className="node-id">{n.id}</code>
                </button>
              );
            })
          ) : (
            <p className="no-nodes-message">No nodes match these filters.</p>
          )}
        </div>

        <div className="graph-inspector">
          {node ? (
            <>
              <div className="inspector-head">
                <span className={`node-kind-chip chip-${node.kind.toLowerCase().replace(/\s+/g, '-')}`}>
                  {node.kind}
                </span>
                <h4 tabIndex={-1} ref={detail}>
                  {node.kind}: {node.title}
                </h4>
                <div className="node-meta-line">
                  <code>{node.id}</code>
                  {node.status && (
                    <>
                      <span className="dot-divider">·</span>
                      <span className="node-status-text">{node.status}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="inspector-section">
                <h5>Recorded connections ({connections.length})</h5>
                {connections.length ? (
                  <ul className="connection-list">
                    {connections.map(e => {
                      const outgoing = e.from === node.id;
                      const other = graph.nodes.find(n => n.id === (outgoing ? e.to : e.from))!;
                      return (
                        <li key={`${e.from}:${e.to}:${e.relationship}`} className="connection-item">
                          <div className="connection-pill">
                            <span className="arrow-badge">{outgoing ? 'Outgoing →' : 'Incoming ←'}</span>
                            <span className="rel-name">{e.relationship}</span>
                          </div>
                          <button
                            type="button"
                            className="connection-target-btn"
                            onClick={() => inspect(other.id)}
                          >
                            <span className="target-kind">{other.kind}:</span> {other.title}
                          </button>
                          {e.rationale && <p className="connection-rationale">{e.rationale}</p>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="no-connections-text">
                    No connections are recorded. This node has no evidence links to follow.
                  </p>
                )}
              </div>

              <details open className="raw-record-details">
                <summary>Original record: values, tool inputs and provenance</summary>
                <pre>{JSON.stringify(node.record, null, 2)}</pre>
              </details>
            </>
          ) : (
            <div className="inspector-empty">
              <h4 tabIndex={-1} ref={detail}>
                Select a node to trace its evidence
              </h4>
              <p>Click any node in the list to inspect its inputs, outgoing edges, and record provenance.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

