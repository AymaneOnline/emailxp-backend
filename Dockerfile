FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "server.js"]
