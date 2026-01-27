FROM node:18-alpine
WORKDIR /usr/src/app
COPY package.json package.json
RUN npm ci --production
COPY . .
ENV NODE_ENV=production
ENV ENABLE_UNIFIED_ROUTER=true
EXPOSE 4000
CMD ["node", "index.js"]

