# Production web: the Vite build (against the real API, no mocks) served by nginx, which also proxies /api (REST +
# WebSocket) to the API container. See deploy/nginx.conf.
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_USE_MOCKS=false
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
