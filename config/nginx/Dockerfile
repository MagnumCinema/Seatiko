FROM nginx:1.27-alpine
# Rendered at start by the image entrypoint (envsubst of defined variables only,
# so nginx's own $host, $remote_addr… stay untouched).
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV SEATIKO_API_UPSTREAM=nest-api:8080
EXPOSE 80
