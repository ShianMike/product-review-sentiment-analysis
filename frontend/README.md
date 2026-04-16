# ReviewLens Frontend

React dashboard UI for upload, sentiment overview, aspect analysis, themes, and model diagnostics.

## Development

1. Install dependencies:

```bash
npm install
```

2. Start dev server (default in this project is port 4200):

```bash
set PORT=4200 && npm start
```

3. Open:

`http://localhost:4200`

The app proxies API requests to `http://localhost:5000` via `proxy` in `package.json`.

## Scripts

- `npm start` - run development server
- `npm test -- --watchAll=false` - run tests once
- `npm run build` - build production assets to `build/`

## Notes

- The combined launcher at repository root (`start-dev.bat`) starts backend + frontend together.
- If you use a different backend host, set `REACT_APP_API_URL` before starting.
