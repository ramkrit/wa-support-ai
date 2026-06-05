# =============================================================================
# WA Support AI — Multi-stage Docker Build
# =============================================================================

# -------- Stage 1: Build --------
# Install all dependencies and compile TypeScript to JavaScript
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm ci

# Copy source code and build the NestJS project
COPY . .
RUN npm run build

# -------- Stage 2: Runtime --------
# Minimal production image with only what's needed to run
FROM node:20-alpine AS runner
WORKDIR /app

# Set Node to production mode
ENV NODE_ENV=production

# Tell Puppeteer where to find the system Chromium (no bundled download)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install Chromium and required system libraries for whatsapp-web.js
# - chromium: headless browser for WhatsApp Web automation
# - fontconfig, freetype, harfbuzz: font rendering for QR codes and pages
# - nss: TLS/SSL support for Chromium
# - ttf-freefont: basic font set so pages render correctly
RUN apk add --no-cache \
    chromium \
    fontconfig \
    freetype \
    harfbuzz \
    nss \
    ttf-freefont

# Install only production dependencies (skip devDependencies)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the compiled output from the build stage
COPY --from=builder /app/dist ./dist

# Expose the NestJS server port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main.js"]
