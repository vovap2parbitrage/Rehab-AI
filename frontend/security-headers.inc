add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "same-origin" always;
# The camera is needed to record exercises; nothing else is.
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
