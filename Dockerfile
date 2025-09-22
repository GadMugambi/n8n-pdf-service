# ---- Stage 1: The "Builder" ----
# We use the official full Node.js image which contains all necessary build tools.
FROM node:22-bookworm AS builder

# Install system dependencies needed for Poppler
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    poppler-utils \
    poppler-data \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm

# Set the working directory
WORKDIR /app

# Copy the package.json and the lockfile. The package.json now contains the
# critical "pnpm.onlyBuiltDependencies" instruction.
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies. Because of the instruction in package.json,
# pnpm will now correctly run the build script for better-sqlite3.
RUN pnpm install --frozen-lockfile

# Copy the rest of the application source code
COPY . .

# Build the TypeScript code into JavaScript
RUN pnpm run build

# Use pnpm prune to remove devDependencies for a smaller final image
RUN pnpm prune --prod


# ---- Stage 2: The Final "Production" Image ----
# We use a slim image for a smaller, more secure final container.
FROM node:22-bookworm-slim AS production

# Set the working directory
WORKDIR /app

# Set the environment to production
ENV NODE_ENV=production

# Install ONLY the essential runtime system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    poppler-utils \
    poppler-data \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy the pruned, production-only node_modules from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the compiled application code
COPY --from=builder /app/dist ./dist

# Copy package.json for metadata and running scripts if needed
COPY --from=builder /app/package.json ./package.json

# Expose the correct port
EXPOSE 3001

# The final, direct command to run the application
CMD ["node", "dist/index.js"]