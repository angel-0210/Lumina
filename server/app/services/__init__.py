"""Application/service layer.

Services orchestrate business logic between the API routes and the repositories:
they enforce ownership decisions, manage transactions (via the injected
``Connection``), call the AI layer, enqueue background jobs, and map repository
row dicts into Pydantic response DTOs. Routes stay thin; repositories stay pure.
"""
