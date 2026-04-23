# Build stage - this is optional since we have no build process
# Just using Node runtime to serve static files

FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1

# Start application
CMD ["npm", "start"]


# docker build -t registry-local.flextronassembly.net/q2c/rook-ceph-ui:latest . 

# docker push registry-local.flextronassembly.net/q2c/rook-ceph-ui:latest