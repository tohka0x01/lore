# Native input snapshot uses allowlist

Native Input Snapshots will use an explicit allowlist of host fields rather than a blocklist. This reduces the chance of leaking future sensitive fields from host hook payloads; omitted field names may still be reported as diagnostics so Lore can discover useful host fields without uploading their values.
