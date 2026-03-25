FROM node:20-alpine

WORKDIR /app

# Install pnpm/npm dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Expose port
EXPOSE 5000

# Start server
CMD ["npm", "run", "dev"]
