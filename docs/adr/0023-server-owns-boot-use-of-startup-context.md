# Server owns boot use of startup context

Thin Forwarders may report Startup Context Facts, but they must not decide boot behavior, startup recall queries, guidance inclusion, or memory selection. The Lifecycle Server owns how session-start facts are interpreted and combined with boot memory and Guidance Configuration; Plugin Shells only pass available local facts through the Lifecycle Contract.
