# ---- Stage 1: The "Builder" using Ubuntu 24.04 ----
# As requested, we start from a clean Ubuntu 24.04 image.
FROM ubuntu:24.04 AS builder

# Prevent interactive prompts from apt during the build
ENV DEBIAN_FRONTEND=noninteractive

# Install essential tools and build dependencies for Node.js and native addons
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    git \
    build-essential \
    python3 \
    pkg-config \
    poppler-utils \
    poppler-data \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js v22 using the official NodeSource repository script
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs

# Install pnpm globally using npm
RUN npm install -g pnpm

# Set the working directory for the application
WORKDIR /app

# Copy package manager files
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies.
# With all build tools present, this will correctly compile better-sqlite3
# inside the Ubuntu environment. We will not prune to ensure integrity.
RUN pnpm install --frozen-lockfile

# Copy the rest of the application source code
COPY . .

# Build the TypeScript code into JavaScript
RUN pnpm run build


# ---- Stage 2: The Final "Production" Image using Ubuntu 24.04 ----
# We use the EXACT same base image to guarantee 100% compatibility.
FROM ubuntu:24.04 AS production

ENV DEBIAN_FRONTEND=noninteractive

# Install ONLY the essential runtime dependencies for Node.js and Poppler
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    poppler-utils \
    poppler-data \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js v22 again for the runtime environment
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs

# Set the working directory
WORKDIR /app

# Set the environment to production
ENV NODE_ENV=production

# Copy the compiled application code from the builder stage
COPY --from=builder /app/dist ./dist

# Copy the entire, fully-functional node_modules directory from the builder stage.
# This is the most reliable way to ensure the compiled native addon is included.
COPY --from=builder /app/node_modules ./node_modules

# Copy the package.json. This is good practice and might be needed by the app.
COPY --from=builder /app/package.json ./package.json

# Expose the port the application will run on
EXPOSE 3001

# The final, direct command to run the application.
CMD ["node", "dist/index.js"]