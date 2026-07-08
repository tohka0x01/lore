# Server returns host-ready output

The Lifecycle Server will return host-ready output rather than abstract lifecycle effects for the Plugin Shell to render. This keeps host-specific output formats, prompt injection shapes, and future behavior changes centralized on the server; the Plugin Shell only writes through the returned stdout JSON/text or emits nothing.

**Consequences**

The server must know each supported `client_type` output format. That is intentional: runtime-specific behavior belongs in the server-side Runtime Adapter, not in plugin-installed hook scripts.
