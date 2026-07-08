# Plugin shell fails open silently

When the Lore Lifecycle Server is unreachable, times out, or returns an unusable response, the Plugin Shell will silently return no effects and allow the agent to continue. This favors low prompt noise and agent continuity over surfacing transient integration failures inside every agent turn; operational visibility belongs in logs, diagnostics, or explicit debug mode rather than default lifecycle output.
