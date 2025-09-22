# ---- SINGLE-STAGE DOCKERFILE ----
# This approach prioritizes reliability and correctness over image size.
# It builds and runs the application in the same environment, eliminating all
# potential issues from copying files between stages.

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
# This is the standard, reliable method for a bare Ubuntu system.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y --no-install-recommends nodejs
RUN npm install -g pnpm

# 3. Set up the Application Directory
WORKDIR /app

# Copy package manager files
COPY package.json pnpm-lock.yaml ./

# 4. Install Application Dependencies
# This will correctly compile better-sqlite3 inside this unified environment.
RUN pnpm install --frozen-lockfile

# 5. Copy and Build the Application Source Code
COPY . .
RUN pnpm run build

# 6. Final Configuration for Runtime
ENV NODE_ENV=production

# Expose the correct port for your application
EXPOSE 3001

# The command to start the application
CMD ["node", "dist/index.js"]