# ---- Stage 1: The "Builder" Stage ----
# Use the full Node.js image which includes all necessary build tools
FROM node:22-bookworm AS builder

# Install system dependencies required for native addons and poppler
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    poppler-utils \
    poppler-data \
    build-essential \
    python3 \
    pkg-config \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package manager files
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies (including devDependencies) to build the project
# This will correctly compile better-sqlite3
RUN pnpm install --frozen-lockfile

# Copy the rest of your application source code
# .dockerignore will prevent local node_modules from being copied
COPY . .

# Build the TypeScript code into JavaScript
RUN pnpm run build

# OPTIMIZATION: Remove devDependencies to create a clean, production-only node_modules folder
RUN pnpm prune --prod


# ---- Stage 2: The Final "Production" Stage ----
# Use the slim Node.js image for a smaller and more secure final image
FROM node:22-bookworm-slim AS production

# Install ONLY the runtime system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    poppler-utils \
    poppler-data \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Set the environment to production
ENV NODE_ENV=production

# Copy the compiled application code from the builder stage
COPY --from=builder /app/dist ./dist

# Copy the pruned, production-only node_modules from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the package.json to have access to the "start" script, etc.
COPY --from=builder /app/package.json ./package.json

# Expose the port the application will run on
EXPOSE 3000

# The command to run when the container starts.
# We run the built JavaScript file directly with node.
CMD ["node", "dist/index.js"]