# Mytopia Content Studio

Sanity Studio for editing narrative actors, narrative bundles, missions,
checkpoints, site settings, and custom achievements.

## Setup

```bash
cp .env.example .env
bun install
```

Set your Sanity project ID, dataset, and optional Google Maps API key in `.env`.

## Run

```bash
bun run dev
```

Run against a development dataset:

```bash
bun run dev:dev
```

## Build And Deploy

```bash
bun run build
bun run deploy
```

Deployment uses your Sanity CLI authentication and the project values from env.
