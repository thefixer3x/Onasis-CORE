FROM node:20-alpine AS builder

WORKDIR /app

# Install bun
RUN npm install -g bun@latest

# Install deps without frozen lockfile (staging — lockfile may be stale)
COPY package.json ./
COPY bun.lock* package-lock.json* ./
RUN bun install --no-frozen-lockfile || npm install --legacy-peer-deps

# Build
COPY . .
RUN bun run build 2>/dev/null || npm run build

# Production: serve with nginx
FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

# Minimal nginx config: SPA routing + health endpoint, port from $PORT (default 3000)
COPY --from=builder /app/dist /usr/share/nginx/html
RUN printf 'server {\n\
    listen 3000;\n\
    root /usr/share/nginx/html;\n\
    location /health {\n\
        return 200 "ok";\n\
        add_header Content-Type text/plain;\n\
    }\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
