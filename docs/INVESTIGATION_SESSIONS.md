# Durable investigation snapshots

WhyLab can persist a validated final Astra investigation for 24 hours in an
Upstash-compatible Redis REST store. This supports restoring the diagnosis,
evidence graph, review and downloaded report after a browser reload or server
instance change.

Set `WHYLAB_SESSION_REST_URL` and `WHYLAB_SESSION_REST_TOKEN` to use a dedicated
store. When they are omitted, WhyLab reuses `WHYLAB_QUOTA_REST_URL` and
`WHYLAB_QUOTA_REST_TOKEN`. The restore route requires the configured deployment
access token and returns no-store responses.

Snapshots contain only the validated canonical investigation; they do not keep
the access token, consent state, raw upload bytes, file handles, or an active
provider request. A restored report therefore cannot run linked repair until the
matching CSV is uploaded again. This is durable completed-result recovery, not a
background job queue or a way to resume an interrupted provider call.
