# Feature → service map

Which backend serves each part of the app, and where the screens live in `aivorah-frontend`. Checked against `src/config/*ServerUrl.ts` and the screens' imports on 2026-11-03.


| Feature | Frontend folder (`src/…`) | Main service |
|---|---|---|
| Login, sign-up, email verify | `screens/auth/`, `context/AuthContext.tsx` | auth |
| Onboarding | `screens/onboarding/` | profile |
| Profile, settings, photo | `screens/*/profile/`, `screens/*/settings/`, `screens/shared/account/` | profile |
| Teacher roster, parent My Kids | `screens/teacher/students/`, `screens/parent/my-kids/` | students |
| Parent dashboard, learning, AI report | `screens/parent/dashboard/`, `learning/`, `ai-progress-report/` | students, leaderboard |
| Assignments | `screens/teacher/assignments/`, `screens/student/assignments/`, `screens/parent/assignments/` | assignments |
| Learning paths and lessons | `screens/student/learning-paths/`, `lesson/`, `screens/teacher/learning-paths/`, `curriculum-learning-path/`, `subject-paths/` | learning-paths |
| AI Coach | `screens/student/ai-coach/`, `components/common/*AIPanel.tsx` | ai-coach |
| Student dashboard, XP, leaderboard | `screens/student/dashboard/`, `leaderboard/`, `progress/` | leaderboard |
| Teacher dashboard and student progress | `screens/teacher/dashboard/`, `student-progress/` | teacher-dashboard |
| Challenges | `screens/*/challenges/` | challenges |
| Messages, channels, notifications | `screens/shared/messages/`, `features/channels/`, `context/NotificationContext.tsx` | messages |
| Schedule | `screens/student/schedule/`, `screens/teacher/schedule/` | schedule |
| Timetable and resources | `screens/shared/timetable/`, `screens/shared/resources/` | timetable-resources |
| Attendance and My Classes | `screens/*/attendance/`, `features/classes/` | attendance |
| School admin | `screens/school-admin/` | school-admin |
| Announcements, class portfolio | `screens/shared/announcements/`, `features/class-portfolio/` | school-admin |
| Aivorah (platform) admin | `screens/aivorah-admin/` | platform-admin |
| Parental controls, screen time | `screens/parent/parental-controls/`, `services/lockStatus.ts` | parental-controls |
| Daily habits, daily tasks | `screens/student/daily-habits/`, `screens/parent/daily-tasks/` | daily-habits |
| Bedtime stories | `screens/student/bedtime-stories/` | bedtime-stories |
| World and You | `screens/student/world-and-you/` | world-and-you |
| Help center | `screens/student/helpCenter/`, `screens/parent/help-center/`, `screens/shared/help-support/` | help-center |

Service addresses and branches: [repositories.md](../repositories.md). Endpoints and env vars: each service's `README.md`.
