# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# lms_api — multi-stage production image
# -----------------------------------------------------------------------------

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY scripts ./scripts/
COPY src ./src/
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache dumb-init \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs lms

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p uploads/courses logs \
    && chown -R lms:nodejs /app

USER lms
EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/app.js"]
