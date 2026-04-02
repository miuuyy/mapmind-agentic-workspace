# Scripts

This directory contains the small local helpers used to run and reset the public `main` branch.

## Scripts

### `dev.sh`

Bootstraps the local environment and starts both servers.

```bash
./scripts/dev.sh
```

It:

- creates `.venv` if needed
- installs backend dependencies in editable mode
- installs frontend dependencies
- starts FastAPI on `127.0.0.1:8787`
- starts Vite on `127.0.0.1:5178`

### `stop_dev.sh`

Stops local listeners on the known frontend and backend ports.

```bash
./scripts/stop_dev.sh
```

### `reset_db.sh`

Deletes the local SQLite database and recreates the seed workspace.

```bash
./scripts/reset_db.sh
```

## Rule

These scripts exist to keep the local edition easy to run and easy to reset. They should stay small, explicit, and boring.
