# Aivorah Attendance Service

Standalone microservice for class **Attendance**: the class teacher marks each
student present / absent / late for a day; parents (and the student) read the
summary and history. Also serves the teacher's class list (`/classes/mine`).

Replaces `/attendance/*` and `/classes/mine` in the monolith (`ai-mentor/server`),
which kept attendance in a JSON file on its own disk (lost on every redeploy)
with no sign-in checks. Data now lives in `attendance_records`
(aivorah-db migration `0009_attendance_records.sql`, unique per student + date).

## Sign-in

Every route except `/health` needs `Authorization: Bearer <Firebase ID token>`.
The user's role, school and class are loaded from `users` by the token's email.

## Routes

| Route | Who |
|---|---|
| `GET /classes/mine` | teacher: classes they are class teacher of (`schools.academic_structure` `classTeacherEmail`); parent: children's classes; student: own class |
| `GET /attendance/class?grade=&section=&date=YYYY-MM-DD` | the class teacher, or a school admin — roster `{date, students:[{id,name,email,photoUrl,status}]}` |
| `POST /attendance/save` `{date, grade, section, records:{studentId: present\|absent\|late}}` | the class teacher, or a school admin; every student must be in that class |
| `GET /attendance/student/:id/summary` | the student, their parent, their class teacher, or a school admin — `{summary:{present,absent,late,total,ratePct}, history:[{date,status}]}` (newest first, last 30) |

`ratePct = round((present + late × 0.5) / total × 100)` (same as the monolith),
or `null` when nothing is recorded (the monolith showed 100%).

## Import old data

```
node scripts/import-attendance-json.cjs <attendance.json>          # dry run report
node scripts/import-attendance-json.cjs <attendance.json> --write  # upsert
```

## Run

```
cp .env.example .env   # fill in
npm install
npm run dev            # http://localhost:3022
npm test               # unit + integration
ATTENDANCE_API_TESTS=1 ATTENDANCE_API_ENV=<env file with the Dev Supabase> npx jest tests/api
```

The API tests refuse to run unless `SUPABASE_URL` is the Dev project; they seed
and delete their own school and users.

Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `FIREBASE_SERVICE_ACCOUNT_B64`.
