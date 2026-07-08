# Guidance uses revisions from MVP

Guidance Configuration will use a revision-based publication model from the first implementation rather than a mutable key-value store. Each Guidance Layer has immutable revisions with states such as draft, active, and archived; rollback is performed by activating an earlier revision, which avoids prompt-configuration drift and makes lifecycle output traceable to a guidance version.
