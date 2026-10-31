# FiberGuard frontend

React 19, TypeScript, Vite, Tailwind CSS, React-Leaflet, Lucide, Recharts, and Framer Motion. The default interface language is Mongolian.

See the repository [README](../README.md) for full installation and backend instructions.

```bash
npm ci
npm run dev        # http://127.0.0.1:5173, /api proxied to Flask on 5001
npm run check      # strict TypeScript
npm run build      # checked production build in dist/
npm run test:e2e   # Playwright; run `npx playwright install chromium` once
```

`../.venv` must exist for Playwright's automatic backend startup. API and graph calculations require Flask. Built assets can be served directly by the Flask application on port 5001.

Optional configuration: copy `.env.example` to `.env.local`. The built application uses same-origin `/api` by default. Map tile provider can be configured with `VITE_TILE_URL`; maintain required provider attribution. No key is required for the default OSM service. Country geometry is bundled locally; remote tile imagery is not downloaded for offline use.
