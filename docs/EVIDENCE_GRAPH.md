# Evidence graph (Milestone 18)

The reusable evidence explorer appears in completed flagship and Astra investigation results. It projects validated canonical records into nodes and labeled, directed connections. It does not generate hypotheses, metrics, confidence, or causal claims.

## Explore

Run the flagship, then find **Evidence graph** below the repair section. Search by text, ID or status, or filter by node type. Activate a node with the mouse or Enter/Space. Its inspector shows incoming and outgoing connections, relationship rationales and the full original record. Activate a connected node to trace provenance even if that node is outside the current search filter. Clear filters restores the full node list. Keyboard focus moves to the inspector heading on selection.

Source → dataset → tool call → result → observation links expose where a measurement originated and which tool/version/input generated it. Evidence → hypothesis connections preserve supports, weakens and rejects labels and rationales. Hypothesis → experiment → call/result links expose the test, prediction, criterion, outcome and limitations. Evidence and hypotheses link to repairs; comparison nodes distinguish baseline evidence from after evidence. Cost assumptions retain explicit provenance. Diagnosis links identify the recorded primary hypothesis without promoting unassessed alternatives.

The explorer uses an adjacency view: selectable nodes and labeled directional connections rather than a force-directed canvas. This works with native keyboard controls and stacks on mobile. No animation or additional package is required. Filters affect navigation only; they do not hide the selected node's connections or alter investigation data.

## Boundaries and validation

`buildEvidenceGraph` validates its input and creates a deterministic reference projection without modifying the investigation. Original payloads retain measured/undefined metric status, policy values, evidence IDs and limitations. Empty investigations have no fabricated nodes. Failed tool results remain failed records. Missing evidence remains missing; links do not establish causality. Timeline events are not graph nodes in this milestone. Large original tool outputs are inspectable in a scrollable record panel; no browser performance claim is made for maximum-size imported investigations.

Tests cover referential integrity, replay, immutability, the full verification/repair chain, cost assumptions, separate before/after evidence, unsupported alternatives, relationship semantics, empty drafts and rejected dangling references. Browser checks cover keyboard selection/focus, filtering, edge traversal, empty-filter recovery and responsive overflow with the graph visible.
