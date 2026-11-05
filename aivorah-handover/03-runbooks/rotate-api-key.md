# Runbook: rotate an API key or secret

Do this when a key leaks, expires, runs out of credit, or the account behind it changes owner. Order matters: **create new → update every service → check → delete old**. Deleting first causes an outage.

## Steps
1. **Create the new key** in the provider's console (logged in with the company account).
2. **Find every service that uses it** (table below, as of 2 Nov 2026). To re-check: Render → each service → **Environment**, or ask the team to search env names in the Render dashboard.
3. **Update each service:** Render → service → **Environment** → edit the value → **Save, rebuild, and deploy**. Repeat for all services in the row.
4. **Local `.env` files:** update your own copies; never commit them.
5. **Check:** each service's `/health`, then use one feature that needs the key (e.g. upload a photo for Cloudinary, send an invite for Resend). Render → **Logs**: no auth errors (401/403).
6. **Delete or revoke the old key** in the provider's console.
7. **Never write the key value** anywhere outside the provider and Render.

## Which services use which key
| Env variable | Provider | Render services |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | Supabase (Test project) | 18: ai-coach, assignments, attendance, auth, challenges, daily-habits, leaderboard, learning-paths, messages, parental-controls, platform-admin, profile, schedule, school-admin, students, teacher-dashboard, timetable-resources, world-and-you |
| `FIREBASE_SERVICE_ACCOUNT_B64` | Firebase Admin | 8: attendance, auth, learning-paths, messages, platform-admin, schedule, students, timetable-resources |
| `FIREBASE_API_KEY` | Firebase web key (public, low risk) | auth, platform-admin, school-admin, students |
| `GROQ_API_KEY` (+ `_1`…`_4` on ai-coach) | Groq | 10: ai-coach, assignments, bedtime-stories, help-center, learning-paths, messages, school-admin, students, timetable-resources, world-and-you |
| `CLOUDINARY_API_KEY` + `_SECRET` | Cloudinary | 6: assignments, learning-paths, messages, profile, school-admin, timetable-resources |
| `RESEND_API_KEY` | Resend (email) | 5: auth, platform-admin, profile, school-admin, students |
| `EMAIL_PASS` | Gmail app password (email fallback) | 4: auth, help-center, platform-admin, school-admin |
| `QDRANT_API_KEY` | Qdrant Cloud | 4: ai-coach, assignments, learning-paths, teacher-dashboard |
| `GEMINI_API_KEY` | Google AI Studio | 4: assignments, learning-paths, platform-admin, timetable-resources |
| `ELEVENLABS_API_KEY` | ElevenLabs (voice) | bedtime-stories, learning-paths |
| `OPENROUTER_API_KEY` | OpenRouter | timetable-resources |
| `MISTRAL_API_KEY`, `HF_TOKEN` | Mistral, Hugging Face | assignments |
| `NVIDIA_NIM_API_KEY` | NVIDIA | ai-coach |
| `NEWS_API_KEY` | News API | world-and-you |

## Special cases
- **`ENCRYPTION_KEY` (auth, profile): do NOT rotate.** Stored data is encrypted with it; a new key makes that data unreadable. Changing it needs a planned re-encryption.
- **Supabase service key:** rotating means regenerating the project's JWT secret, which also changes the public anon key the frontend uses. Plan it: update all 18 services and the frontend together.
- **Firebase service account:** create a new key in Firebase → Project settings → Service accounts, base64-encode the JSON, update the 8 services, then delete the old key there.
- **Gmail app password:** Google Account → Security → App passwords → revoke old, create new.

