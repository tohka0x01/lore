# Cut over without legacy bridge compatibility

The lifecycle migration will not preserve `/api/bridge/startup` and `/api/bridge/recall` as compatibility shims. Server and plugin integrations will cut over to `POST /api/lifecycle/event` together so Lore has a single lifecycle path to maintain and does not carry duplicate bridge behavior.
