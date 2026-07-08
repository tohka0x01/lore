# Lore

Lore is a long-term memory system for AI agents. This context names the concepts used to keep agent-runtime integration thin while server-side Lore owns memory lifecycle behavior.

## Language

**Lifecycle Contract**:
A server-owned event/effect language that describes agent lifecycle moments such as session start, prompt submission, tool use, and turn stop. Runtime-specific hook names are translated into this contract before Lore decides what should happen.
_Avoid_: Plugin API, hook format, adapter protocol

**Plugin Shell**:
A minimal runtime-installed plugin whose job is to receive native lifecycle hooks and forward them to Lore. It should not own durable prompts, memory rules, recall formatting, or client-specific behavior policy.
_Avoid_: Plugin brain, integration logic, memory plugin

**Runtime Adapter**:
The thin translation layer between an agent host's native lifecycle surface and Lore's Lifecycle Contract. It owns host-specific input/output shape, not Lore behavior.
_Avoid_: Backend bridge, plugin implementation

**Lifecycle Server**:
The Lore server role that receives lifecycle events and returns host-ready effects such as context injection, blocking decisions, diagnostics, or no-op responses.
_Avoid_: Hook script, plugin runtime

**Adapter Generator**:
A build-time tool that can generate Plugin Shell artifacts for specific agent hosts. It is optional and replaceable; it does not own the Lifecycle Contract.
_Avoid_: Lifecycle framework, source of truth

**Silent Degradation**:
The Plugin Shell behavior when the Lifecycle Server is unavailable: it returns no lifecycle effects and lets the agent continue normally. Visibility for this condition belongs in diagnostics or debug mode, not in the default agent prompt.
_Avoid_: Error injection, warning prompt, hard failure

**Server-Originated Guidance**:
Prompt guidance, memory rules, recall formatting, and lifecycle behavior text returned by the Lifecycle Server rather than stored in the Plugin Shell. If the server is unavailable, no replacement guidance is injected by default.
_Avoid_: Bundled prompt, fallback guidance, static plugin rules

**Network-Capable Lifecycle**:
A lifecycle point where the target agent host can reliably run the Plugin Shell and complete a bounded request to the Lifecycle Server. Lore only treats these lifecycle points as server-driven.
_Avoid_: Assumed hook support, offline lifecycle

**MVP Lifecycle Surface**:
The first supported server-driven lifecycle set: session start and prompt submission. Other lifecycle points remain outside the initial contract until each target runtime's network capability and host output semantics are verified.
_Avoid_: Full lifecycle coverage, all hooks

**Lifecycle Event Endpoint**:
The single server endpoint that receives all Network-Capable Lifecycle events using the Lifecycle Contract. Event name, runtime identity, capabilities, and native input travel in the request instead of being encoded into separate URLs.
_Avoid_: Per-hook endpoint, startup endpoint, recall endpoint

**Host-Ready Output**:
The Lifecycle Server response shape that is already formatted for the target agent host, such as Codex hook JSON or Claude Code hook text. The Plugin Shell writes this output through without translating Lore effects.
_Avoid_: Abstract effect, client-side renderer, plugin-side formatter

**Runtime Identity**:
The extensible identity reported by a Plugin Shell for the host it is running inside. It separates a raw `runtime_id` string from a known `runtime_family` so new hosts can be observed without being allowed to masquerade as existing host families.
_Avoid_: client_type-only identity, unchecked host string

**Known Runtime Family**:
A runtime family whose lifecycle input, host output format, and network-capable lifecycle points have been verified by Lore. Only known families may receive Host-Ready Output by default.
_Avoid_: Supported string, trusted client type

**Guidance Seed**:
Version-controlled default guidance shipped with the Lore server so a fresh installation can initialize usable server-originated behavior. It is not the runtime source of truth once editable guidance state exists.
_Avoid_: Plugin guidance, hardcoded active prompt

**Server-Managed Guidance**:
Server-owned guidance used by the Lifecycle Server to produce Host-Ready Output. It is moved out of Plugin Shell artifacts to reduce plugin update frequency, not primarily to make the guidance user-editable.
_Avoid_: Plugin guidance, user memory, bundled prompt

**Guidance Configuration**:
Versioned server-side configuration for fixed product prompts, lifecycle instructions, recall formatting guidance, and runtime-specific instructions. It is managed separately from user memory and supports future page-based editing, validation, and rollback.
_Avoid_: Memory node, plugin rule file, ordinary setting

**Guidance Layer**:
A scope within Guidance Configuration that contributes to final server-managed guidance, such as global guidance, runtime-family overrides, and event-specific templates. Layers are composed by the Lifecycle Server before Host-Ready Output is rendered.
_Avoid_: Monolithic prompt, per-plugin prompt

**Guidance Revision**:
An immutable version of a Guidance Layer with a publication state such as draft, active, or archived. Rollback means activating an earlier revision, not editing history in place.
_Avoid_: Mutable prompt row, current setting

**Guidance Scope**:
The structured address of a Guidance Layer, composed from runtime family, lifecycle event, and section. It is modeled as fields rather than a string key so validation, composition, and management UI do not depend on naming conventions.
_Avoid_: Guidance key, prompt name

**Guidance Section**:
The purpose category inside a Guidance Scope. The initial sections are instruction for agent-facing natural language, formatter for Host-Ready Output assembly, and diagnostic for debug-only visibility.
_Avoid_: Prompt fragment, arbitrary section

**Formatter Configuration**:
A declarative Guidance Section that selects or parameterizes server-owned Host-Ready Output renderers. It must not contain executable code or free-form templates that define rendering logic.
_Avoid_: Template code, JavaScript formatter, hook output script

**Native Input Snapshot**:
A bounded and redacted copy of the original host hook input sent alongside normalized lifecycle fields. It lets the Lifecycle Server learn and use host-specific fields without requiring Plugin Shell updates for every new field.
_Avoid_: Full transcript upload, unbounded raw hook payload

**Snapshot Allowlist**:
The explicit set of native hook fields the Plugin Shell may include in a Native Input Snapshot. Fields outside the allowlist are omitted by default, though their names may be reported separately for diagnostics.
_Avoid_: Secret blocklist, raw payload pass-through

**Normalized Lifecycle Field**:
A first-class field in the Lifecycle Contract required for lifecycle behavior, such as prompt text for prompt submission or session identity for startup. Normalized fields are distinct from the Native Input Snapshot.
_Avoid_: Snapshot field, raw hook field

**Generator Gate**:
The later decision point for adopting an Adapter Generator after the Lore-owned Lifecycle Contract and Plugin Shells are stable. A generator must reduce artifact maintenance without moving server-managed guidance or lifecycle behavior back into generated plugin manifests.
_Avoid_: Mandatory AgentPlugins migration, generator-first architecture

**Thin Forwarder**:
The small runtime-native implementation inside each Plugin Shell that translates a native hook call into a Lifecycle Event Endpoint request and writes Host-Ready Output back to the host. Thin Forwarders share the same contract and design constraints, but not necessarily the same language or source file.
_Avoid_: Shared CLI, sidecar runtime, cross-runtime script

**Forwarder Normalization**:
The minimal extraction a Thin Forwarder performs to populate required Normalized Lifecycle Fields and Snapshot Allowlist fields. It must not decide recall strategy, guidance inclusion, startup queries, or host-output formatting.
_Avoid_: Plugin behavior logic, local lifecycle policy

**Startup Context Facts**:
Local facts a Thin Forwarder may report to the Lifecycle Server during session start, such as current working directory, directory name, or best-effort repository identity. They are inputs to server-owned boot behavior, not local boot logic.
_Avoid_: Startup query, boot decision, plugin-side recall selection

**Current Fact Set**:
The minimal lifecycle facts already used by current integrations and required for MVP behavior: runtime identity, session identity when available, prompt text for prompt submission, and best-effort project directory/repository names for session start.
_Avoid_: Future host metadata, speculative facts

**Lifecycle Cutover**:
The move from legacy bridge endpoints to the Lifecycle Event Endpoint without maintaining compatibility shims. The integration changes together with the server endpoint so there is only one lifecycle path to maintain.
_Avoid_: Legacy bridge compatibility, dual path
