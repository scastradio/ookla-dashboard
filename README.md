# Ookla Dashboard

SvelteKit web app that fetches speed test data from GaussDB and plots it on an interactive bubble map using [LayerChart](https://layerchart.com).

## Features

- Interactive world bubble map (Natural Earth projection)
- Switch between **Download**, **Upload**, and **Latency** metrics
- Filter by date range
- Bubble size and colour scale proportional to metric value
- Tooltips showing area name, average value, and test count
- Data served from GaussDB via SvelteKit API routes

## Setup

### Prerequisites

- Node.js ≥ 20
- Access to the GaussDB instance

### Install

```bash
npm install
```

### Configure

Copy `.env.example` to `.env` and fill in your credentials:

```
GAUSSUSER=ookla
GAUSSPASS=<password>
GAUSSSERVER=10.20.48.183
GAUSSPORT=8000
GAUSSDB=gaussdb
GAUSSTABLE=ookla
PORT=3000
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Production

```bash
npm run build
npm start          # loads .env automatically
```

Open [http://localhost:3000](http://localhost:3000).

## API

| Endpoint | Params | Description |
|---|---|---|
| `GET /api/speedtests` | `metric`, `from`, `to` | Aggregated points by geo_area |
| `GET /api/dates` | — | Min/max test_date in the table |

Valid `metric` values: `dl_speed_mbps`, `ul_speed_mbps`, `ave_latency_ms`.
