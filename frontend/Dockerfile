# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies deterministically from lockfile, then pin+rebuild esbuild
RUN npm ci \
    && npm install -D esbuild@0.25.9 \
    && npm rebuild esbuild

# Bundle app source
COPY . .

# Make port 5173 available to the world outside this container
EXPOSE 5173

# Run the app when the container launches
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
