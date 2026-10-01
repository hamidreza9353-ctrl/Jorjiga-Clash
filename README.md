# Jorjiga Clash v9 — Production Ready Structure

این نسخه برای استقرار واقعی آماده‌سازی شده است:
- PostgreSQL configuration
- production environment template
- HTTPS reverse-proxy configuration
- systemd service template
- PostgreSQL backup script
- security/deployment checklist

توجه: برای مهاجرت کامل runtime از SQLite به PostgreSQL، لایه database فعلی `server.js` باید در مرحله بعد با repository/adapter مبتنی بر `pg` جایگزین شود. فایل‌های deploy آماده‌اند، اما این ZIP را نباید بدون انجام آن migration و تست نهایی مستقیماً production کرد.
