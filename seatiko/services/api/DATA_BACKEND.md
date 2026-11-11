# Seatiko persistence backends
#
# Current default: atomic JSON snapshot (MemoryStore + NewPersistent).
# PostgreSQL for Seatiko application state is planned for production
# scale-out (multiple API replicas). Until then, Twenty CRM already uses
# PostgreSQL via docker-compose service `twenty-db`.
#
# To migrate later:
# 1. Add SEATIKO_DATABASE_URL
# 2. Implement store.PostgresStore with the same methods as MemoryStore
# 3. Switch NewPersistent / NewPostgres based on env
SEATIKO_DATA_BACKEND=json
