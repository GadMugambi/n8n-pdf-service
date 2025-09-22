# ---- Stage 1: The "Builder" - Replicating the successful Nixpacks environment ----
# As requested, we start from a clean Ubuntu 24.04 image, just like Nixpacks did.
FROM ubuntu:24.04 AS builder

# Prevent interactive prompts from apt during the build
ENV DEBIAN_FRONTEND=noninteractive

# Set SHELL to bash with pipefail, mimicking Nixpacks
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# 1. Install Core System Dependencies
# This matches the initial layers of the Nixpacks build.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    sudo \
    locales \
    curl \
    git \
    pkg-config \
    ca-certificates \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 2. Install the Nix Package Manager
# This is the critical step from the Nixpacks build history.
RUN curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install linux --no-confirm --init none

# 3. Use Nix to Install Build Tools and a Precise Node.js Environment
# This is far more reliable than apt for dev tools. This layer includes Node, npm, and pnpm.
# We also include build-essential (g++ etc.) and poppler-utils here.
RUN . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh && \
    nix-env -iA nixpkgs.nodejs-22_x nixpkgs.pnpm nixpkgs.gnumake nixpkgs.gcc nixpkgs.python3 nixpkgs.pkg-config nixpkgs.poppler_utils

# Set the working directory for the application
WORKDIR /app

# --- Application Build Steps ---

# Copy package manager files
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies using the Nix-provided pnpm
# This will correctly compile better-sqlite3 within the Nix environment.
RUN . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh && \
    pnpm install --frozen-lockfile

# Copy the rest of the application source code
COPY . .

# Build the TypeScript code into JavaScript
RUN . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh && \
    pnpm run build


# ---- Stage 2: The Final "Production" Image ----
# We use a slim Debian image for the final stage to keep it small and secure.
FROM debian:bookworm-slim AS production

# Install ONLY the essential runtime dependencies (Node.js and Poppler)
# We will use the more standard NodeSource installation here for simplicity,
# since we are just running the app, not building it.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    poppler-utils \
    poppler-data \
    ca-certificates \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs

# Set the working directory
WORKDIR /app

# Set the environment to production
ENV NODE_ENV=production

# Copy the compiled application code from the builder stage
COPY --from=builder /app/dist ./dist

# Copy the fully-built node_modules directory from the builder stage.
# This contains the correctly compiled better-sqlite3 native addon.
COPY --from=builder /app/node_modules ./node_modules

# Copy package.json (needed for the start command)
COPY --from=builder /app/package.json ./package.json

# Expose the correct port
EXPOSE 3001

# The final, direct command to run the application.
CMD ["node", "dist/index.js"]