# ── POS SaaS · production image ─────────────────────────────
# Build:  docker build -t pos-saas .
# The full node_modules is kept in the runtime image on purpose:
# tenant provisioning runs `prisma db push`, and the scripts/ use tsx.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Singapore

# 1) install dependencies (postinstall runs `prisma generate`, so schemas + configs are needed)
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.control.config.ts prisma.tenant.config.ts ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 2) build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prisma:generate && npm run build

# 3) runtime
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
