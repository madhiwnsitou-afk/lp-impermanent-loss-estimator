FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY client ./client
COPY public ./public
ENV NODE_ENV=production PORT=4021
USER node
EXPOSE 4021
CMD ["npm", "start"]
