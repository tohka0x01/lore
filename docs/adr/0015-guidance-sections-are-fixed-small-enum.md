# Guidance sections are a fixed small enum

Guidance Scopes will use a small fixed section enum from the start: `instruction`, `formatter`, and `diagnostic`. This separates agent-facing natural language from host-output assembly and debug visibility without creating an overly granular prompt-fragment system.
