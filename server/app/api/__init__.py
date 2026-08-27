"""HTTP + WebSocket entrypoints.

This package is intentionally thin: routers translate between the transport
(request parsing, auth, pagination, rate limiting, response envelopes) and the
service layer, which owns all business logic. No SQL, no provider calls and no
ownership decisions live here — those belong to ``app.services`` /
``app.repositories``.

    deps.py          -> shared FastAPI dependencies (auth, db, pagination,
                        per-tier rate limiting, RBAC)
    router.py        -> the versioned aggregate router (mounted under
                        ``settings.api_v1_prefix``)
    routes/          -> one module per resource group
"""
