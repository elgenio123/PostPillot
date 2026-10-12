# Build context is the repository root, so prompts/ and config/ can be baked into the image
FROM node:alpine AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json* ./
# The npm cache survives failed builds, so a slow connection still makes progress on each retry
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 6 && npm config set fetch-retry-maxtimeout 180000 && npm config set fetch-timeout 900000 && \
    (npm ci --no-audit --no-fund || npm install --no-audit --no-fund)

# Test image (scripts/test.sh): dependencies plus the tools the video tests use
FROM deps AS test
RUN apk add --no-cache ffmpeg fontconfig ttf-dejavu

FROM node:alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM node:alpine
WORKDIR /app
# Fonts so the template image can draw text; ffmpeg converts videos and animates images for video posts
RUN apk add --no-cache fontconfig ttf-dejavu ffmpeg
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    PROMPTS_DIR=/app/prompts CONFIG_DIR=/app/config DATA_DIR=/data
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY prompts ./prompts
COPY config ./config
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
