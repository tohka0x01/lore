# Thin forwarders do minimal normalization

Thin Forwarders will only read local connection config, receive native hook input, extract required Normalized Lifecycle Fields, attach Runtime Identity and allowlisted Native Input Snapshot fields, call the Lifecycle Event Endpoint, and write through Host-Ready Output. They must not own recall strategy, guidance inclusion, startup query construction, or host-output formatting.
