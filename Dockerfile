FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock* ./
COPY patches ./patches
RUN bun install
COPY . .
RUN E2B_API_KEY=build OPENROUTER_API_KEY=build WORKER_URL=build PUBLIC_WORKER_URL=build bun run build

FROM oven/bun:1
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "build/index.js"]
