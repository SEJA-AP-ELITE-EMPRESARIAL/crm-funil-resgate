# Frontend React do CRM — build com Node, serve com nginx.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Sem VITE_API_URL: em produção o front chama /api relativo (mesma origem),
# e o nginx do container faz proxy para o backend.
RUN npm run build

FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/conecta-crm.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
