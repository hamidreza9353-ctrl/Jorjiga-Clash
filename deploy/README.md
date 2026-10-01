# Production deployment checklist

Architecture:
Browser → HTTPS reverse proxy → Node.js API
                         ↘ PostgreSQL

1. Provision a Linux server or managed Node/PostgreSQL environment.
2. Point the domain DNS records to the server.
3. Create a PostgreSQL production database and a dedicated application user.
4. Store DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD_HASH and CORS_ORIGIN in environment secrets.
5. Install dependencies with `npm ci`.
6. Run the Node API as a service using `jorjiga-clash.service`.
7. Serve the frontend through the reverse proxy.
8. Install a CA-issued TLS certificate and redirect HTTP to HTTPS.
9. Enable PostgreSQL TLS if the DB is remote; PostgreSQL supports SSL/TLS connections.
10. Schedule `backup.sh` and periodically test restoration.
11. Before launch, connect the payment provider and verify webhook signatures.
12. Run a smoke test for registration, login, order creation, checkout, admin login and order status.

Never commit `.env`, private keys, database passwords, JWT secrets or payment credentials to Git.
