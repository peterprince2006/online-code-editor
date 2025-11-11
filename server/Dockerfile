# Base image
FROM node:22-alpine

# Set work directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest
COPY . .

# Expose port
EXPOSE 5000

# Start server
CMD ["npm", "run", "start"]
