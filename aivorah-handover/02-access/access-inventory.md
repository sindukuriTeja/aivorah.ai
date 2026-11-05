# Access inventory

_Last verified: 2026-11-03. GitHub, Vercel, Render, Supabase and Firebase/Google Cloud ownership checked through each platform's API._

**Rule: no secret values in this repo — ever.** This file says *what* access exists, *where* the secret lives, and *who* grants it. Secrets are handed over through a password manager / direct dashboard invite, never chat or email.

Legend for "Transfer": ✅ under the company account

## Platforms

| Platform | Used for | Account / project | Owner today | Receiver needs | Transfer |
|---|---|---|---|---|---|
| GitHub | All code (26 repos) | Company account `aivorah24` | Company | Collaborator on each repo (write) | ✅ |
| GitHub | Monolith `ai-mentor` | `aivorah24/ai-mentor` | Company | Collaborator (same as above) | ✅ |
| Vercel | Frontend hosting | Account `aivorah24-9470` (Hobby), project `aivorah-frontend` | Company | Team seat (needs Vercel Pro) or the company login | ✅ |
| Render | All 20 services | Workspace "My Workspace" (`tea-d9u4igjm8hqs73egspbg`), login `aivorah24@gmail.com` | Company | Workspace member (needs Render Pro) or the company login; env vars live here | ✅ |
| Supabase | Postgres DB | Org **Aivorah** → Prod `jwlepxmclbkrmfzrumch`; org **Aivorah - Dev and Test DB** → Dev `evlqkcozespsfrnuhevf`, Test `xmwzifxlpmgsrxgxsgan` | Company (`aivorah24@gmail.com` is Owner of both orgs) | Org member | ✅ |
| Firebase | Auth (all users) | Project `ai-learning-platform-c1308` | Company (`aivorah24@gmail.com` is project Owner) | Project Owner/Editor | ✅ |
| Google Cloud | Monolith (Cloud Run), Firebase backing project | Project `ai-learning-platform-c1308` | Company (`aivorah24@gmail.com` is Owner) | IAM Owner/Editor | ✅ |
| Qdrant Cloud | Vector DB (`QDRANT_COLLECTIONS.md`) | Cluster `ai-mentor` in account "Base Account" | Company (moving) | `aivorah24@gmail.com` invited as Admin; set it to Owner once accepted | In progress (4 Nov) |
| CircleCI | Frontend CI | Project `gh/aivorah24/aivorah-frontend` | Company | Org member; billing on a company card | ✅ |
| GitLab | Fallback CI | — | Company | Member | ✅ |
| Resend | Transactional email | API key in `RESEND_API_KEY` | Company | Account member + domain | ✅ |
| Gmail SMTP | Email fallback | `EMAIL_USER` / app password `EMAIL_PASS` | Company | New app password | ✅ |
| Cloudinary | Image/file storage | `CLOUDINARY_*` | Company | Account member | ✅ |
| ElevenLabs | Voice (stories, read aloud) | `ELEVENLABS_API_KEY` | Company | Account member | ✅ |
| LLM providers | AI features | Gemini, Groq, OpenRouter, Cerebras, NVIDIA NIM (monolith also: OpenAI, Anthropic, Mistral, HF, Deepgram) | Keys are set in Render env vars | To use company-owned keys: create them under the company account and swap them in ([rotate-api-key runbook](../03-runbooks/rotate-api-key.md)) | Keys in Render |
| Razorpay | Payments (monolith only) | `RAZORPAY_*` | Company | Account member | ✅ |

> To change any provider key, follow `03-runbooks/rotate-api-key.md`.

## Where secrets live

| Where | What |
|---|---|
| Render → each service → Environment | All backend secrets (live values) |
| Vercel → project → Environment Variables | Frontend build-time vars (Firebase web config is public by design) |
| Local `.env` in each repo (gitignored) | Developer copies — **not** the source of truth |
| `aivorah-auth-service/firebase-service-account.json` (gitignored) | Local Firebase Admin key |

## Env vars per service (names only)

| Service | Variables |
|---|---|
| auth | `SUPABASE_URL` `SUPABASE_SERVICE_KEY` `FIREBASE_API_KEY` `FIREBASE_SERVICE_ACCOUNT(_B64)` `RESEND_API_KEY` `EMAIL_USER` `EMAIL_PASS` `ENCRYPTION_KEY` `DEMO_*_EMAIL` |
| profile | `SUPABASE_*` `CLOUDINARY_*` `ENCRYPTION_KEY` `DEMO_*_EMAIL` |
| leaderboard | `SUPABASE_*` `QDRANT_URL` `QDRANT_API_KEY` |
| learning-paths | `SUPABASE_*` `QDRANT_*` `FIREBASE_SERVICE_ACCOUNT_B64` `CLOUDINARY_*` `ELEVENLABS_*` `EL_VOICE_READALOUD` `GROQ_API_KEY` `CEREBRAS_API_KEY` `NVIDIA_API_KEY` `OPENROUTER_API_KEY` `KNOWLEDGE_LLM_*` `LLM_CHAIN` `QUEUE_DRIVER` `CURRICULUM_MAX_FILE_MB` |
| assignments | `SUPABASE_*` `QDRANT_*` `GROQ_API_KEY` (+ `GEMINI_API_KEY` `GEMINI_MODEL` on Render) |
| challenges / daily-habits / parental-controls | `SUPABASE_*` |
| ai-coach | `SUPABASE_*` `QDRANT_*` `GROQ_API_KEY(_1..4)` `NVIDIA_NIM_API_KEY` |
| schedule / attendance | `SUPABASE_*` `FIREBASE_SERVICE_ACCOUNT_B64` |
| messages | `SUPABASE_*` `FIREBASE_SERVICE_ACCOUNT_B64` `INTERNAL_API_KEY` |
| students | `SUPABASE_*` `FIREBASE_API_KEY` `FIREBASE_SERVICE_ACCOUNT_B64` `RESEND_API_KEY` `LEARNING_PATHS_SERVICE_URL` |
| teacher-dashboard | `SUPABASE_*` `QDRANT_*` |
| timetable-resources | `SUPABASE_*` `FIREBASE_SERVICE_ACCOUNT_B64` `CLOUDINARY_*` `GEMINI_API_KEY` |
| school-admin | `SUPABASE_*` `CLOUDINARY_*` `GROQ_API_KEY` |
| platform-admin | `SUPABASE_*` `FIREBASE_SERVICE_ACCOUNT_B64` `GEMINI_API_KEY` `GEMINI_MODEL` `ADMIN_EMAIL(S)` (+ `RESEND_API_KEY` / `EMAIL_*` for invites) |
| help-center | `GROQ_API_KEY` `EMAIL_USER` `EMAIL_PASS` |
| bedtime-stories | `GROQ_API_KEY` `ELEVENLABS_*` `EL_VOICE_*` |
| world-and-you | `SUPABASE_*` `GROQ_API_KEY` `NEWS_API_KEY` |
| ai-mentor/server (monolith) | `SUPABASE_*` `QDRANT_*` `FIREBASE_API_KEY` `ENCRYPTION_KEY` `RESEND_API_KEY` `EMAIL_*` `CLOUDINARY_*` `ELEVENLABS_*` `GOOGLE_*` (Calendar OAuth) `RAZORPAY_*` `FAST2SMS_API_KEY` `NEWS_API_KEY` + LLM keys (OpenAI, Anthropic, Gemini, Groq, OpenRouter, Mistral, NVIDIA, HF, Deepgram) |

Source: `.env` / `.env.example` names in each repo on 2026-10-14. Render may have extra vars — Render is the source of truth.
