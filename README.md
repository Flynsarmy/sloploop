# Sloploop

Sloploop is an open source, web-based tool for creating seamless audio loops and clean clips from audio files, designed for game developers and audio producers.

Based on [MubLoop](https://mubdev.itch.io/mubloop)

## Local development

```bash
bun install
bun run dev
```

## Production build

```bash
bun run build
bun run preview
```

## Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```

The app is served at http://localhost:8080.

Build and run without Compose:

```bash
docker build -t sloploop .
docker run --rm -p 8080:80 sloploop
```
