# Production n8n image with the PostPilot bootstrap and workflows baked in.
# Build context is the repository root. Locally, docker-compose.yml mounts the same files instead.
ARG N8N_VERSION=2.42.6
FROM n8nio/n8n:${N8N_VERSION}
COPY --chown=node:node n8n/entrypoint.sh n8n/setup-owner.mjs /bootstrap/
COPY --chown=node:node n8n/workflows /bootstrap/workflows
ENTRYPOINT ["/bin/sh", "/bootstrap/entrypoint.sh"]
