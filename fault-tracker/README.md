# Fault Tracker

A small property-management app: tenants log faults, landlords see them show up in an in-app dashboard with an unread badge.

## Features

- Accounts: tenants and landlords register and log in; each fault is tied to the tenant account that reported it (name and unit come from the account, not free-text input).
- Tenant view: submit a fault (title, description) and see the status of faults you've reported.
- Password reset: "Forgot password?" on the login screen requests a reset link.
- Landlord view: list of all faults with a live unread-count badge, and buttons to move each fault through `new -> acknowledged -> resolved`.
- Data is persisted to local JSON files (`data/users.json`, `data/faults.json`) — no external database needed.

## Auth notes

This is demo-grade auth, scoped to match the rest of the app:

- Passwords are hashed with Node's built-in `crypto.scrypt` (salted, timing-safe compare) — no external crypto dependency.
- Sessions are an in-memory token map, set via an `httpOnly` cookie. They reset on server restart; there's no "remember me" or password reset flow.
- Anyone can self-register as either a tenant or a landlord — there's no invite/approval step, which would matter for a real deployment but is out of scope here.
- No email service is configured, so "sending" a password reset link just logs it to the server console instead. Resetting a password logs the account out everywhere (all sessions are invalidated).

## Getting started

```bash
cd fault-tracker
npm install
npm start
```

Then open http://localhost:3000.

## Running tests

```bash
npm test
```

## API

| Method | Path                      | Description                       |
| ------ | ------------------------- | ---------------------------------- |
| GET    | `/api/faults`              | List all faults, newest first      |
| POST   | `/api/faults`               | Create a fault (`tenantName`, `unit`, `title`, `description`) |
| PATCH  | `/api/faults/:id/status`   | Update a fault's status            |
| GET    | `/api/faults/unread-count` | Count of faults still in `new`     |
