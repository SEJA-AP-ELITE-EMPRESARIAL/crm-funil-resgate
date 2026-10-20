# Frontend React do CRM — build com Node, serve com nginx.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# Sem VITE_API_URL: em produção o front chama /api relativo (mesma origem),
# e o nginx do container faz proxy para o backend.

# GlitchTip (TSK-1147). O DSN é público (vai no bundle de qualquer jeito); sem ele o
# SDK não liga. O release é o commit do deploy, o mesmo do backend (GIT_COMMIT): o
# docker-compose.yml passa os dois.
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_RELEASE=
ARG VITE_SENTRY_ENVIRONMENT=production
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN} \
    VITE_SENTRY_RELEASE=${VITE_SENTRY_RELEASE} \
    VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}

# Source maps no GlitchTip, OPCIONAL: só com o token (secret de build
# `glitchtip_token`, que não fica em camada nem no histórico da imagem) e com
# release. A regra está em scripts/build-com-sourcemaps.sh, que recebe os ARG
# abaixo pelo ambiente do RUN: sentry-cli oficial (versão e sha256 fixos, os do
# binário Linux x86_64 do GitHub, os mesmos do Conecta), debug IDs, envio e
# confirmação no servidor. Qualquer falha só avisa, e nenhum .map sai deste
# estágio: o build quebra se sobrar algum.
ARG GLITCHTIP_URL=https://erros.sejaap.com.br
ARG GLITCHTIP_ORG=seja-ap
ARG GLITCHTIP_PROJETO=crm
ARG SENTRY_CLI_VERSAO=3.8.0
ARG SENTRY_CLI_SHA256=13f8cb34ae01a6a272d7d7c22e277a105286615b4020de900ea95a8de47cdbb6
# "sim" quando o compose recebeu o token (nunca o token em si): separa no cache a
# camada do build com mapas da do build sem eles.
ARG GLITCHTIP_ENVIA_MAPAS=
RUN --mount=type=secret,id=glitchtip_token sh scripts/build-com-sourcemaps.sh

FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/conecta-crm.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
