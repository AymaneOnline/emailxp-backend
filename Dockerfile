FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# Prevent puppeteer (optional dependency) from downloading Chromium during image build
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# Skip optional dependencies which can be heavy (puppeteer, etc.) and increase build time
RUN npm install --production --no-audit --no-fund --no-optional

COPY . .

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "server.js"]
