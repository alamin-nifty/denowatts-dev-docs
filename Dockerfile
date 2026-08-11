FROM node:22-alpine

WORKDIR /app

# Install mcp server dependencies (minimal — no Vite/React/etc.)
COPY mcp/package.json ./mcp/
RUN cd mcp && npm install --production

# Copy server and everything it reads at runtime
COPY mcp/server.mjs          ./mcp/
COPY scripts/drift-check.mjs ./scripts/
COPY flows/                  ./flows/
COPY src/data/repos.json     ./src/data/repos.json

# drift-state.json is optional — if absent, check_drift defaults to last 7 days
# To persist baselines across deploys, mount a volume at /app/scripts/

WORKDIR /app/mcp
EXPOSE 3100
ENV MCP_HTTP_PORT=3100

CMD ["node", "server.mjs"]
