# ---- Stage 1: The "Builder" - Using Ubuntu 24.04 as Requested ----
# This stage will build the application in an environment that matches your instructions.
FROM ubuntu:24.04 AS builder

# Prevent interactive prompts from apt during the build
ENV DEBIAN_FRONTEND=noninteractive

# Install all necessary build dependencies for Node.js and native addons
# This includes build-essential (for C++ compilation), python, and curl.
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

# Install Node.js v22 using the official NodeSource repository script.
# This is the standard, reliable method for installing Node.js on a bare Ubuntu system.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y --no-install-recommends nodejs

# Install pnpm globally using npm
RUN npm install -g pnpm

# Set the working directory for the application
WORKDIR /app

# Copy package manager files
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies (including devDependencies).
# This is critical for building the project and compiling better-sqlite3.
RUN pnpm install --frozen-lockfile

# Copy the rest of the application source code.
# The .dockerignore file will prevent local files from interfering.
COPY . .

# Build the TypeScript code into JavaScript.
RUN pnpm run build

# THE KEY STEP: Create a clean, production-ready deployment package.
# `pnpm deploy` is the official command for this. It resolves all symlinks
# and creates a self-contained folder with only production dependencies,
# including the correctly compiled better-sqlite3 native addon.
RUN pnpm deploy --prod /prod


# ---- Stage 2: The Final "Production" Image - Using Ubuntu 24.04 ----
# We use the same base image to guarantee 100% compatibility.
FROM ubuntu:24.04 AS production

ENV DEBIAN_FRONTEND=noninteractive

# Install ONLY the essential runtime dependencies: Node.js and Poppler.
# We do NOT need build-essential, python, etc., in the final image.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    poppler-utils \
    poppler-data \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js v22 again for the runtime environment.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y --no-install-recommends nodejs

# Set the working directory
WORKDIR /app

# Set the environment to production
ENV NODE_ENV=production

# Copy the self-contained, production-ready application from the builder stage.
# This single command safely copies your code, the dist folder, and the
# correctly structured production node_modules folder all at once.
COPY --from=builder /prod .

# Expose the correct port for your application (e.g., 3001)
EXPOSE 3001

# The final, direct command to run the application.
CMD ["node", "dist/index.js"]