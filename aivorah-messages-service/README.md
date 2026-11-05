# aivorah-messages-service

Direct messages, class/family channels, in-app notifications, push notifications and realtime (WebSocket) delivery. Also hosts the Aivorah bot reply.

**Called by:** frontend Messages and Notifications screens for every persona. Other services create notifications through the shared `notify_event` DB function.

## Endpoints
| Route | What it does |
|---|---|
| `/messages/*` | DMs: conversations, thread, contacts, send, edit, delete, react, file upload, unread count, mark read, `aivorah-reply` (bot) |
| `/channels/*` | Channels: list, messages, members, read state, create class/family channels, people pickers |
| `/notifications/*` | Notification feed: list, unread count, mark one / all read |
| `POST /messages/test-notification, /cleanup-system-notifs` | Admin-only, need `INTERNAL_API_KEY` |
| `GET /health` | Health check |

## Run locally
```bash
npm ci
cp .env.example .env   # fill in values; see table below
npm run dev            # nodemon, port 3020
```

## Environment variables
| Variable | Purpose |
|---|---|
| `PORT` | Listen port (default `3020`) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase project and service-role key (server-only, never expose) |
| `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_SERVICE_ACCOUNT_B64` | Firebase Admin credentials (JSON, or base64 of the JSON) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | File/image uploads |
| `GROQ_API_KEY` | AI model for the Aivorah bot reply |
| `INTERNAL_API_KEY` | Key for admin-only endpoints. Unset = those endpoints refuse every call |
| `NOTIFICATION_DEBUG` | `true` = verbose notification logs |
| `NODE_ENV` | `test` during jest |

## Tests
```bash
npm test
```

## Deploy
- **Render** web service `aivorah-messages-service` → https://aivorah-messages-service.onrender.com
- Auto-deploys from `main`. Build `npm install`, start `npm start`.
- CI: `.circleci/config.yml` runs the tests
- After a merge, check the live commit on Render matches the branch head.

## Auth
`/notifications` and routes behind the Firebase middleware verify the Firebase ID token. Some older `/messages` routes still take the email from the request. See the auth audit in `aivorah-handover`.

## Folder layout
| Path | Why it exists |
|---|---|
| `index.js` | Express app: middleware, route mounting, `/health`, listen |
| `routes/` | `messages.js`, `channels.js`, `notifications.js` |
| `middleware/` | `firebaseAuth.js`: verifies the Firebase ID token |
| `services/` | Notifications, Expo push, realtime WebSocket hub, class access rules, academic structure, Supabase/Firebase clients |
| `tests/` | Jest unit + integration tests |
