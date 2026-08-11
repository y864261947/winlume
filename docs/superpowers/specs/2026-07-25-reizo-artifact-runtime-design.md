# Reizo Artifact Runtime Design

**Date:** 2026-07-25  
**Status:** Proposed - user-approved design, pending written-spec review  
**Scope:** Artifact-first AI workbench experience, scene capability packs, and a dynamic artifact renderer model.

## 1. Product Thesis

Reizo is not a generic multi-model chat application and not a collection of fixed vertical SaaS screens.

> Conversation is the universal intent and control surface. Artifacts are the place where users do the actual work.

The main workbench uses a stable two-pane layout: AI conversation on the left and the active artifact on the right. The right pane changes according to what the artifact contains and what a user can do with it. It is not selected from a fixed domain dashboard.

## 2. Competitive Position

Claude, Codex, and Open Design validate the chat-plus-artifact shape. Reizo differentiates through its deep built-in professional scenarios and its ability to turn them into suitable, high-utility artifact interactions.

The product promise is:

> 200+ professional scenarios drive an AI workbench where every conversation grows into an actionable result.

The durable advantage is not model access. It is the combination of scenario knowledge, structured deliverables, artifact-aware interaction, and gateway-controlled deployment.

## 3. Main Experience

```text
+---------------- AI conversation ----------------+---------------- Active artifact ----------------+
| Project context, messages, source questions,    | A focused, type-appropriate work surface:         |
| agent progress, skills, attachments, composer.  | document, table, comparison, timeline, chart,      |
|                                                 | media view, or sandboxed web preview.              |
+-------------------------------------------------+-----------------------------------------------------+
```

- The left pane is stable. It is where users describe goals, answer clarifying questions, attach data, and ask the AI to revise work.
- The right pane is dynamic. It follows the active artifact produced or modified by the conversation.
- A project can contain many artifacts. The user focuses one at a time and switches through a compact artifact list or top tabs.
- On mobile, the two panes stack while preserving the artifact as the primary work area after creation.

## 4. Projects and Professional Scenarios

Users start with a project rather than a blank conversation. A project groups conversations, data sources, artifacts, versions, and future collaborators around one durable goal.

Users can describe their goal freely or begin from a high-frequency scenario. The home surface should feature a curated set of roughly 8-12 scenarios while keeping the full built-in skills corpus searchable.

A scenario is a capability pack, not a fixed canvas. It may provide:

- the minimum clarifying questions needed to start;
- recommended professional skills and quality checks;
- relevant data input guidance;
- likely artifact structures and renderer suggestions;
- useful next actions after a first artifact is created.

For example, an "opening-location analysis" scenario may suggest market, location, finance, and competitor skills, ask for city and budget, and prefer a comparison-oriented artifact. It must not force every result into a location dashboard: the AI might instead produce a matrix, chart, document, map-oriented result, or a combination.

## 5. Artifact-Driven Interaction

Artifacts choose their interaction from their content, structure, and declared capabilities. Domains influence the quality of generation and recommendations, but never dictate the only UI the user may see.

An artifact has a shared envelope:

```text
Artifact
|- content: text, structured data, files, code, or media
|- structure: blocks, fields, rows, relationships, and versions
|- capabilities: what users may inspect, edit, transform, or export
|- sources: user input, external references, AI inference, and manual edits
|- views: renderer suggestions supported by the workbench
`- metadata: title, project, state, authorship, and sharing policy
```

The first renderer capability set is intentionally cross-domain:

| Capability | Interaction |
|---|---|
| `document` | Structured reading, outline, block editing, local AI edits, citations |
| `structured-data` | Tables, field editing, sorting, filtering, import and export |
| `comparison` | Multi-option matrices, weights, scoring, ranking, and trade-off explanation |
| `time-based` | Timeline, calendar, or board views |
| `quantitative` | Charts, formulas, editable assumptions, and scenario comparison |
| `web-preview` | Sandboxed preview, source view, and publishing controls |
| `media` | Gallery, annotation, prompt and version comparison |
| `source-backed` | Source cards, citation locations, timestamps, and confidence labels |

An artifact may have multiple capabilities. A competitor study can be read as a document, analyzed as a comparison matrix, and audited through its sources without becoming separate artifacts.

## 6. AI Collaboration Contract

The AI must create and update structured artifacts rather than relying on front-end guesses from unstructured Markdown. Internally, each artifact declares its content, capability list, supported views, sources, and editable actions.

This is an implementation contract, not a user-facing schema editor. The UI exposes only supported, safe interactions. The agent can compose known capabilities but cannot execute arbitrary UI code.

Lifecycle:

1. The user states a goal or selects a scenario.
2. The AI asks only the necessary questions and identifies useful skills and inputs.
3. The agent creates a first structured artifact and focuses it in the right pane.
4. The user changes the artifact directly or asks the AI to modify it.
5. Significant AI changes create a new version that can be compared, accepted, or restored.
6. A completed artifact can be exported, shared, or become input to another artifact in the project.

When an artifact is incomplete, malformed, or has no specialized renderer, the workbench must preserve it in a generic document or JSON view. Results must never disappear because a renderer failed.

## 7. Trust and Safety

Artifact-first work needs explicit provenance:

- Distinguish user-provided data, external sources, AI inference, and human edits.
- Show source time and confidence instead of presenting generated claims as facts.
- Preserve raw content and version history for recovery and audit.
- Render HTML and web artifacts in a sandboxed iframe with a restrictive CSP. Previews must not access host sessions, local storage, or project data directly.

The existing header-based identity mechanism is insufficient for production. Before external sharing, team workspaces, or quota-bearing usage, Reizo must derive user identity from a server-validated session or token.

## 8. MVP Scope

The MVP validates one complete loop: scenario or freeform goal -> structured artifact -> dynamic interaction -> iterative AI editing -> version/export/share.

Include:

- project-based, two-pane workbench;
- curated scenario entry plus global skill search;
- artifact creation, selection, versioning, and graceful fallback;
- initial document, structured data, comparison, timeline, chart, and web-preview renderers;
- source/provenance display and sandboxed web preview;
- export and link sharing foundations;
- data model that reserves workspace, membership, and visibility concepts for later team features.

Defer:

- fixed domain dashboards;
- MCP marketplace and general workflow canvas;
- long-running cloud VM agents;
- complex real-time collaboration and full enterprise administration;
- custom renderer execution from arbitrary model-generated code;
- exhaustive bespoke UI for every professional scenario.

## 9. Validation Criteria

The MVP succeeds when:

1. A user can start from a scenario or a freeform goal and reach a useful first artifact quickly.
2. Users continue work in the artifact pane instead of copying chat text elsewhere.
3. Different outputs naturally receive different interactions without users needing to learn models, skill internals, or a separate domain product.
4. A user can understand where important data and conclusions came from.
5. Unsupported output remains accessible and editable through a reliable fallback view.

Testing must cover artifact schema validation, renderer resolution and fallback, version creation, provenance preservation, permission enforcement, and sandbox boundaries. End-to-end tests should verify the left-chat/right-artifact loop for at least one document, one structured comparison, and one web preview.

## 10. Decisions

| Topic | Decision |
|---|---|
| Primary layout | Stable left AI conversation and dynamic right artifact pane |
| Artifact UI | Determined by artifact capabilities, not fixed business domains |
| Professional depth | Scenario capability packs guide AI and interaction without locking the output type |
| First renderer set | Document, structured data, comparison, timeline, chart, web preview |
| Product entry | Projects and user goals, not model selection or a raw skill list |
| Team strategy | Personal-first MVP with workspace/permission primitives reserved in the data model |
| Safety | Validated artifact contract, renderer fallback, provenance, and sandboxed web previews |
