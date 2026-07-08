# Only network-capable lifecycles are server-driven

Lore will only make a lifecycle point server-driven after verifying that the target agent host can reliably run the Plugin Shell and complete a bounded network request from that lifecycle point. The MVP will not introduce a server-authored local cache for offline or network-hostile lifecycle points; unsupported lifecycle points stay unsupported until the host capability changes or a separate decision accepts the cache complexity.
