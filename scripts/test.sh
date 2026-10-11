#!/bin/sh
# Runs the type check and API tests in Docker against a throwaway PostgreSQL, so nothing is installed on the host.
cd "$(dirname "$0")/.." || exit 1
NET=postpilot-test
docker network create "$NET" >/dev/null 2>&1 || true
docker rm -f postpilot-test-db >/dev/null 2>&1 || true
docker run -d --rm --name postpilot-test-db --network "$NET" \
  -e POSTGRES_USER=postpilot -e POSTGRES_PASSWORD=test -e POSTGRES_DB=postpilot_test postgres:17 >/dev/null
trap 'docker rm -f postpilot-test-db >/dev/null 2>&1; docker network rm "$NET" >/dev/null 2>&1' EXIT
until docker exec postpilot-test-db pg_isready -U postpilot -d postpilot_test >/dev/null 2>&1; do sleep 1; done

docker build -q --target deps -f web/Dockerfile -t postpilot-web-deps . >/dev/null || exit 1
docker run --rm --network "$NET" \
  -e TEST_DATABASE_URL=postgres://postpilot:test@postpilot-test-db:5432/postpilot_test \
  -v "$PWD/web/src":/app/src:ro -v "$PWD/web/tests":/app/tests:ro \
  -v "$PWD/web/vitest.config.ts":/app/vitest.config.ts:ro -v "$PWD/web/tsconfig.json":/app/tsconfig.json:ro \
  -v "$PWD/prompts":/prompts:ro -v "$PWD/config":/config:ro \
  postpilot-web-deps sh -c "npx tsc --noEmit && npx vitest run"
