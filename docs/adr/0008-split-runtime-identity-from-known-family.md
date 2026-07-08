# Split runtime identity from known family

The Lifecycle Contract will distinguish an extensible `runtime_id` from a recognized `runtime_family`. Existing `client_type` values remain for compatibility, but lifecycle events should not rely on a fixed enum alone; unknown runtimes may be observed and handled conservatively without being merged into known-host boot, policy, or output-format behavior.
