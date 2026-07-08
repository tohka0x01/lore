# Use a single lifecycle event endpoint

Lore will expose a single lifecycle endpoint, `POST /api/lifecycle/event`, for server-driven agent lifecycle events. The event name and host capabilities travel in the request body, keeping Plugin Shell code stable as server behavior evolves and avoiding a new endpoint or client protocol for each lifecycle hook.
