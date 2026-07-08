# Unify lifecycle contract, not forwarder implementation

Lore will unify agent integrations at the HTTP Lifecycle Contract, not by forcing every Plugin Shell to call a shared CLI or script. Each runtime may implement its own Thin Forwarder in its native language and plugin shape, as long as it sends the same lifecycle request, follows the same silent-degradation rules, and writes through Host-Ready Output without owning server-managed guidance.
