# aivorah-parental-controls-service

Parental screen-time controls: parents set a child's daily limits and allowed hours; the student app asks whether it may be used right now.

**Called by:** frontend parent Controls screen (set limits) and the student app (lock check).

## Endpoints
| Route | What it does |
|---|---|
| `POST /parent/:parentEmail/children/:childId/screen-time` | Save a child's screen-time rules |
| `GET /parent/:parentEmail/children/:childId/screen-time` | Read a child's rules |
| `GET /parent/screen-time-status/:studentEmail` | Is this student allowed to use the app right now |
| `GET /health` | Health check |

## Run locally
```bash
npm ci
# create .env with the variables in the table below
npm run dev            # nodemon, port 3018
```

## Environment variables
| Variable | Purpose |
|---|---|
| `PORT` | Listen port (default `3018`) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase project and service-role key (server-only, never expose) |

## Tests
```bash
npm test
npm run test:coverage
```

## Deploy
- **Render** web service `aivorah-parental-controls-service` → https://aivorah-parental-controls-service-okqy.onrender.com
- Auto-deploys from `main`. Build `npm install`, start `npm start`.
- CI: no CI config yet; run `npm test` before merging
- After a merge, check the live commit on Render matches the branch head.

## Auth
No token check yet: trusts the parent email in the URL.

## Folder layout
| Path | Why it exists |
|---|---|
| `index.js` | Express app: middleware, route mounting, `/health`, listen |
| `routes/` | `parentControls.js` |
| `services/` | `parseHourField.js` (allowed-hours parsing), Supabase client |
| `tests/` | Jest tests |

Note: `aivorah-school-admin-service` also defaults to port 3018. Set `PORT` on one of them to run both locally.
