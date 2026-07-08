# Start with current fact set

The MVP Lifecycle Contract will only require the facts already used by current integrations and needed for startup/recall behavior: runtime identity, session identity when available, prompt text for `prompt.submit`, and best-effort project directory/repository names for `session.start`. Additional host metadata such as remote URL host, sandbox mode, model name, or full cwd is deferred until a concrete server behavior needs it.
