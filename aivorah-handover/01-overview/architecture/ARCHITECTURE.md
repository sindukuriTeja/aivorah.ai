# Architecture

The full picture: the app, the 20 backend services, and every data store and outside service they use. Built from the live Render settings and the code on 2026-11-03.

## System diagram

```mermaid
flowchart TB
    users["Students · Parents · Teachers · School admins · Aivorah admins"]
    fe["aivorah-frontend<br/>Expo web + mobile · Vercel"]
    fba["Firebase Auth"]
    mono["ai-mentor (legacy)<br/>aivorah.ai"]
    e2e["aivorah-e2e-tests"]
    users --> fe
    fe -- "sign in" --> fba
    fe -. "older calls" .-> mono
    e2e -. "tests previews" .-> fe
    fe -- "HTTPS + Firebase token" --> svcs

    subgraph svcs["20 backend services · Node/Express · Render"]
        direction TB
        auth["auth"]
        profile["profile"]
        students["students"]
        parental_controls["parental-controls"]
        learning_paths["learning-paths"]
        assignments["assignments"]
        ai_coach["ai-coach"]
        challenges["challenges"]
        leaderboard["leaderboard"]
        teacher_dashboard["teacher-dashboard"]
        school_admin["school-admin"]
        attendance["attendance"]
        timetable_resources["timetable-resources"]
        schedule["schedule"]
        messages["messages"]
        daily_habits["daily-habits"]
        bedtime_stories["bedtime-stories"]
        world_and_you["world-and-you"]
        help_center["help-center"]
        platform_admin["platform-admin"]
        auth ~~~ profile ~~~ students ~~~ parental_controls
        learning_paths ~~~ assignments ~~~ ai_coach ~~~ challenges
        leaderboard ~~~ teacher_dashboard ~~~ school_admin ~~~ attendance
        timetable_resources ~~~ schedule ~~~ messages ~~~ daily_habits
        bedtime_stories ~~~ world_and_you ~~~ help_center ~~~ platform_admin
    end

    sb[("Supabase Test DB<br/>Postgres + storage")]
    q[("Qdrant<br/>content vectors")]
    cld["Cloudinary<br/>images, files"]
    mail["Resend / Gmail<br/>email"]
    ai["AI providers<br/>Groq · Gemini · OpenRouter<br/>Mistral · Hugging Face · NVIDIA"]
    voice["ElevenLabs<br/>voice"]
    dbrepo["aivorah-db<br/>migrations"]

    svcs --> sb
    svcs --> cld
    svcs --> mail
    svcs --> ai
    svcs -- "learning-paths, assignments,<br/>ai-coach, teacher-dashboard" --> q
    svcs -- "learning-paths,<br/>bedtime-stories" --> voice
    dbrepo -. "schema" .-> sb
```

Live notifications go from **messages** back to the app over a WebSocket and Expo push.

## What each service uses

From each service's environment settings on Render.

| Service | Supabase | Firebase | Qdrant | Cloudinary | Email | AI and other |
|---|---|---|---|---|---|---|
| auth | ✅ | ✅ | | | Resend, Gmail | |
| profile | ✅ | | | ✅ | Resend | |
| students | ✅ | ✅ | | | Resend | Groq; calls auth, learning-paths |
| parental-controls | ✅ | | | | | |
| learning-paths | ✅ | ✅ | ✅ | ✅ | | Groq, Gemini, ElevenLabs |
| assignments | ✅ | | ✅ | ✅ | | Groq, Gemini, Mistral, Hugging Face |
| ai-coach | ✅ | | ✅ | | | Groq, NVIDIA |
| challenges | ✅ | | | | | |
| leaderboard | ✅ | | | | | |
| teacher-dashboard | ✅ | | ✅ | | | |
| school-admin | ✅ | ✅ | | ✅ | Resend, Gmail | Groq |
| attendance | ✅ | ✅ | | | | |
| timetable-resources | ✅ | ✅ | | ✅ | | Groq, Gemini, OpenRouter |
| schedule | ✅ | ✅ | | | | |
| messages | ✅ | ✅ | | ✅ | | Groq; WebSocket, Expo push |
| daily-habits | ✅ | | | | | |
| bedtime-stories | | | | | | Groq, ElevenLabs |
| world-and-you | ✅ | | | | | Groq, News API |
| help-center | | | | | Gmail | Groq |
| platform-admin | ✅ | ✅ | | | Resend, Gmail | Gemini; calls auth |

Service addresses: [../repositories.md](../repositories.md). Which screens use which service: [FEATURE_SERVICE_MAP.md](FEATURE_SERVICE_MAP.md).
