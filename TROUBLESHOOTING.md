# Troubleshooting Dharma Development in Codespaces

This document provides solutions to common problems you might encounter while working with the Dharma project in a GitHub Codespaces environment.

## Port Conflicts

**Problem:** A service fails to start, and the logs indicate a "port is already allocated" or "address already in use" error.

**Solution:**

1. **Check for running processes:** Use `ps aux | grep <port_number>` to see if another process is using the required port.
2. **Stop the conflicting process:** If you find a process, you can stop it using `kill <process_id>`.
3. **Restart the services:** Run `make down` and then `make dev` to restart the Docker containers.

## Database Migration Errors

**Problem:** The `api` service fails to start, and the logs show errors related to database migrations (e.g., "relation already exists," "column does not exist").

**Solution:**

1. **Reset the database:**
    * Stop the services: `make down`
    * Remove the Docker volume for Postgres: `docker volume rm dharma-monorepo_postgres_data`
    * Restart the services: `make dev`
2. **Run migrations manually:**
    * Ensure the services are running: `make dev`
    * Run the migrations: `make migrate`

## Frontend Build Issues

**Problem:** The `frontend` service fails to build or start, with errors related to dependencies or build scripts.

**Solution:**

1. **Reinstall dependencies:**
    * Stop the services: `make down`
    * Remove the `node_modules` directory: `rm -rf frontend/node_modules`
    * Reinstall dependencies: `npm install`
    * Restart the services: `make dev`
2. **Check for type errors:** Run `npm run typecheck --workspace=frontend` to check for any TypeScript errors that might be preventing the build from completing.

## Vitest Failures

**Problem:** The `make test` command fails with errors related to resolving Vite plugins.

**Solution:**

This is a known issue with the current Vitest configuration in the monorepo. The tests are temporarily skipped to allow the application to run. This issue should be investigated further.
