# Send bounded native input snapshot

Lifecycle events will include normalized fields plus a bounded, redacted Native Input Snapshot of the host hook payload. This preserves Plugin Shell thinness by letting the Lifecycle Server learn and use host-specific fields over time without plugin updates, while requiring size limits and redaction so raw lifecycle payloads do not become unbounded transcript or secret uploads.
