# Fault Tracker

A small property-management app: tenants log faults, landlords see them show up in an in-app dashboard with an unread badge.

## Features

- Tenant view: submit a fault (unit, title, description).
- Landlord view: list of all faults with a live unread-count badge, and buttons to move each fault through `new -> acknowledged -> resolved`.
- Data is persisted to a local JSON file (`data/faults.json`) — no external database needed.

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
