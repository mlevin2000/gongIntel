FROM oven/bun:1 AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json bunfig.toml bun.lock ./
COPY apps/api/package.json apps/api/package.json

# Install dependencies
RUN bun install --frozen-lockfile

# Copy API source
COPY apps/api/ apps/api/

# Build
WORKDIR /app/apps/api
RUN bun build src/index.ts --outdir dist --target bun

# Production image
FROM oven/bun:1-slim

WORKDIR /app

# Copy built output and node_modules
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/apps/api/node_modules apps/api/node_modules
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/package.json apps/api/package.json

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["bun", "run", "dist/index.js"]
