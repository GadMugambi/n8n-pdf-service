# ---- Base Image ----
# Use the full bookworm image, which is more robust for builds with native addons.
FROM node:22-bookworm

# ---- System Dependencies ----
# Install system packages required for the application.
# CRITICAL: Add 'build-essential', 'python3', and 'pkg-config' which are required
# to compile native C++ addons like better-sqlite3.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    poppler-utils \
    poppler-data \
    build-essential \
    python3 \
    pkg-config \
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

# Install application dependencies. With the build tools now installed,
# this command will successfully compile better-sqlite3.
RUN pnpm install --frozen-lockfile

# Copy the rest of your application code into the container.
# The .dockerignore file will ensure local node_modules are NOT copied.
COPY . .

# Build the TypeScript code into JavaScript
RUN pnpm run build

# ---- Production Configuration ----
# Set the Node environment to production
ENV NODE_ENV=production

# Expose the port the application will run on
EXPOSE 3000

# ---- Start Command ----
# The command to run when the container starts.
CMD ["pnpm", "start"]