# ---- SINGLE-STAGE DOCKERFILE - FINAL ATTEMPT ----
# This approach uses a targeted command to force the recompilation of the problematic package.

# Use the Ubuntu 24.04 base image, as you have consistently requested.
FROM ubuntu:24.04

# Prevent interactive prompts from apt during the build
ENV DEBIAN_FRONTEND=noninteractive

# 1. Install ALL Dependencies at Once
# This includes runtime dependencies (curl, poppler) and build-time dependencies
# (build-essential, python) needed to compile better-sqlite3.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    build-essential \
    python3 \
    pkg-config \
    poppler-utils \
    poppler-data \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 2. Install Node.js and pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y --no-install-recommends nodejs
RUN npm install -g pnpm

# 3. Set up the Application Directory
WORKDIR /app

# Copy package manager files
COPY package.json pnpm-lock.yaml ./

# 4. Install Application Dependencies
RUN pnpm install --frozen-lockfile

# 5. TARGETED FIX: Force Rebuild of the Native Addon
# This command explicitly tells pnpm to re-run the C++ compilation for
# better-sqlite3 inside the container. This is a direct attempt to fix
# the "Could not locate the bindings file" error.
RUN pnpm rebuild better-sqlite3

# 6. Copy and Build the Application Source Code
COPY . .
RUN pnpm run build

# 7. Final Configuration for Runtime
ENV NODE_ENV=production

# Expose the correct port for your application
EXPOSE 3001

# The command to start the application
CMD ["node", "dist/index.js"]