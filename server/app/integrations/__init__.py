"""Integrations with external services (server-side only).

Every client here uses **server-side credentials** (Supabase service-role key,
Cloudinary API secret) and must never be exposed to or reachable from the
browser. Route handlers call these via the service layer; the frontend only ever
sees generated URLs / signed results, never the secrets themselves.
"""
