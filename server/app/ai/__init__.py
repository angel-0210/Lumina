"""AI orchestration package: provider abstractions and the RAG pipeline.

Layout:
    base.py            -> result dataclasses shared across providers
    prompts.py         -> server-side system prompts (never exposed to clients)
    gemini_provider.py -> Gemini generate + embed (synchronous httpx.Client)
    embedding_service  -> 1536-dim embedding helper (matches the DB vector column)
    veo_provider.py    -> VEO video generation (synchronous long-running op polling)
    ai_service.py      -> high-level orchestration used by the service layer
    rag/               -> extract -> clean -> chunk -> embed -> retrieve -> assemble
"""
