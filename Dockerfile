# ---- Base Image ----
# Use an official Node.js image. Using a specific version is good practice.
# 'bookworm' is the codename for the Debian version, which is stable and common.
FROM node:22-bookworm-slim

# ---- System Dependencies ----
# Install system packages required for the application.
# This replaces the `aptPkgs` from your nixpacks.toml.
# `apt-get clean` and removing cache helps keep the image size small.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    poppler-utils \
    poppler-data \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# ---- Application Setup ----
# Set the working directory inside the container.
WORKDIR /app

# Copy package manager files first. This layer is cached by Docker.
# It will only be re-run if these files change, making subsequent builds faster.
COPY package.json pnpm-lock.yaml ./

# Install pnpm globally within the image
RUN npm install -g pnpm

# Install application dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of your application code into the container
COPY . .

# Build the TypeScript code into JavaScript
RUN pnpm run build

# ---- Production Configuration ----
# Set the Node environment to production
ENV NODE_ENV=production

# Expose the port the application will run on
# This should match the PORT your app listens on.
EXPOSE 3000

# ---- Start Command ----
# The command to run when the container starts.
CMD ["pnpm", "start"]