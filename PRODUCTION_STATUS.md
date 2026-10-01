STATUS: NOT YET SAFE TO LAUNCH

Deployment scaffolding is ready, but the application runtime still uses SQLite from the previous version.
Before public launch:
- migrate all database queries/schema to PostgreSQL using pg
- run migration and seed scripts
- configure secrets
- configure HTTPS
- configure backups and test restore
- connect and verify a lawful payment provider
- run security/smoke tests
