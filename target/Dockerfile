FROM nginx:alpine

# Custom nginx config with logging and status endpoint
COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html /usr/share/nginx/html/index.html

# Enable stub_status for monitoring
EXPOSE 80
