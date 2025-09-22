# ---- Stage 1: The "Builder" ----
# This stage has all the tools needed to compile everything.
# We are using Ubuntu 24.04 as you suggested.
FROM ubuntu:24.04 AS builder

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install curl, git, and build tools required for Node.js and native addons
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    curl \
    git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js and pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs
RUN npm install -g pnpm

# Set the working directory
WORKDIR /app

# Copy package manager files
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies (including devDependencies) to build everything
# This will compile better-sqlite3 correctly because all build tools are present.
RUN pnpm install --frozen-lockfile

# Copy the rest of the application source code
COPY . .

# Build the TypeScript code into JavaScript
RUN pnpm run build


# ---- Stage 2: The Final "Production" Image ----
# This stage is lean and only contains what's needed to run the app.
FROM ubuntu:24.04 AS production

ENV DEBIAN_FRONTEND=noninteractive

# Install ONLY the runtime system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    poppler-utils \
    poppler-data \
    nodejs \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Install pnpm for running the application
RUN npm install -g pnpm

# Copy the package.json and pnpm-lock.yaml to know which are production dependencies
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./

# Install ONLY production dependencies. This step is fast because it doesn't need to build anything.
RUN pnpm install --prod --frozen-lockfile

# CRITICAL STEP: Copy the pre-compiled node_modules from the builder stage.
# This replaces the modules from the previous step with the fully-built ones,
# including the correctly compiled better-sqlite3.node file.
COPY --from=builder /app/node_modules ./node_modules

# Copy the compiled application code from the builder stage
COPY --from=builder /app/dist ./dist

# Set Node environment to production
ENV NODE_ENV=production

# Expose the port
EXPOSE 3000

# The command to run when the container starts
CMD ["pnpm", "start"]