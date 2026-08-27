"""Resource routers.

One module per resource group; each exposes an ``APIRouter`` that
:mod:`app.api.router` aggregates under the versioned prefix. Handlers are
synchronous ``def`` functions (FastAPI runs them in a threadpool), which suits
our blocking SQLAlchemy/psycopg2 and provider calls without blocking the event
loop.
"""
