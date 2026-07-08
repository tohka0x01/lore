# Unknown runtimes no-op by default

Lifecycle events from an unrecognized `runtime_id` or missing `runtime_family` will not receive prompt context or other Host-Ready Output by default. Unknown runtimes may be logged for diagnostics, but server-driven behavior is enabled only after Lore verifies the runtime's lifecycle input, output format, and network-capable lifecycle points.
