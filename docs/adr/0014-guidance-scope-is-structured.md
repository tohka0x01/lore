# Guidance scope is structured

Guidance Configuration scopes will be represented as structured fields — runtime family, lifecycle event, and section — rather than as string keys such as `codex.session.start`. This keeps composition, validation, rollback, and future management UI explicit and avoids encoding behavior in naming conventions.
