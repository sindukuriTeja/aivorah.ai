# Notifications

How the bell, in-app notifications and push notifications work. Checked against the code on 2026-11-03.

## The flow
1. **Something happens** in a service (an assignment is given, a class post is published, an event is scheduled...).
2. **The service records it** by calling the database function `notify_event(event jsonb)`, or by inserting rows into `public.notifications` directly. `notify_event` works out the recipients and writes one row per person.
3. **The messages service delivers it:** `GET /notifications` (list, unread count, mark read) in `aivorah-messages-service/routes/notifications.js`, live updates over a WebSocket (`services/realtime.js`), and phone push through Expo (`services/push.js`).
4. **The app shows it:** `aivorah-frontend/src/context/NotificationContext.tsx` (the bell and the feed) with `src/services/notificationsApi.ts`. `EXPO_PUBLIC_NOTIFICATIONS_V2=false` turns the feed off.

## Who creates notifications
| Service | File | Notifications |
|---|---|---|
| assignments | `services/notify.js` | assignment given, due, teacher feedback |
| challenges | `services/notify.js` | challenge given, due |
| schedule | `services/notify.js` | event scheduled |
| school-admin | `services/classPostNotifications.js`, `services/announcementNotifications.js`, `services/promotionNotify.js` | class post, announcement, account updated (bulk grade change) |
| students | `services/promotionNotify.js` | account updated (teacher promote) |
| platform-admin | `services/adminUsers.js` | account updated |
| messages | `services/notifications.js` | delivery and read state |

## Notification types
Allowed types are listed in the `notifications_type_check` constraint: `account_updated`, `announcement`, `assignment_assigned`, `assignment_due`, `assignment_feedback`, `challenge_assigned`, `challenge_due`, `class_post`, `event_scheduled`.

**Adding a new type:** first add it to the constraint in a new `aivorah-db` migration (copy `0019_notifications_assignment_feedback.sql`) and apply it to Dev and Test. Then add the producer code. Without the migration, the insert is rejected and nothing reaches the bell.

## Database
| Object | Created in |
|---|---|
| `public.notifications` table, `notify_event()` and `notification_event_key()` functions | `0006_notifications_v2.sql` |
| New types added over time | `0010`, `0012`, `0013`, `0014`, `0016`, `0019` |
