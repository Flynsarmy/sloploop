FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1 AS runtime
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY docker/bun-server.ts ./bun-server.ts

EXPOSE 80
CMD ["bun", "run", "bun-server.ts"]
