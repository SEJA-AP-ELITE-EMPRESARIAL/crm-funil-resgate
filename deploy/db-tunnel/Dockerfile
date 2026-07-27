# Tunel SSH persistente conecta-crm -> db-sejaap, para o backend alcancar o
# funil-postgres (5434) sem expor a porta a internet. autossh reconecta sozinho.
FROM alpine:3.20
RUN apk add --no-cache autossh openssh-client
COPY run.sh /run.sh
RUN chmod +x /run.sh
EXPOSE 5434
ENTRYPOINT ["/run.sh"]
