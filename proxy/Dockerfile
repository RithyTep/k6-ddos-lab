FROM alpine:3.19

RUN apk add --no-cache squid

COPY squid.conf /etc/squid/squid.conf

EXPOSE 3128

CMD ["squid", "-N", "-f", "/etc/squid/squid.conf"]
