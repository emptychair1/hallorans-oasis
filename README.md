# Halloran's Oasis

A standalone, mobile-first 3D space for Piper.

## Bite 1 · Foundation

This commit establishes the application shell only:

- Three.js rendering
- TypeScript
- Vite
- Cloudflare Workers static-asset configuration
- iPhone-safe full-screen viewport handling
- responsive renderer sizing, including `visualViewport`
- conservative device-pixel-ratio cap for mobile GPU load
- a temporary calibration scene proving the 3D pipeline

No approved Oasis assets are imported in this bite. Piper Home is untouched.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Cloudflare deploy

```bash
npm run deploy
```

The final room, furniture, portal, Piper avatar, and FPS arms will be added in later frozen bites after each source asset is verified.
