\set ON_ERROR_STOP on
\getenv role_password PARTICIPATION_DB_PASSWORD

SELECT format('CREATE ROLE participation_app LOGIN PASSWORD %L', :'role_password')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'participation_app'
) \gexec

SELECT 'CREATE DATABASE participation OWNER participation_app'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'participation'
) \gexec

REVOKE ALL ON DATABASE participation FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE participation TO participation_app;
