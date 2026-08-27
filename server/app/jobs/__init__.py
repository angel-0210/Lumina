"""Background job infrastructure.

* :mod:`app.jobs.manager` — the in-process job manager (thread pool + registry)
  that services enqueue work on and that publishes progress/terminal events to
  the owning user over the realtime channel.
* :mod:`app.jobs.workers` — the worker callables it runs (document ingestion,
  scene generation, image/video generation).
"""
