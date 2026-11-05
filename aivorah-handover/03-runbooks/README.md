# Runbooks

Step-by-step instructions for routine jobs and emergencies. Each one says what to do, how to check it worked, and how to undo it.

| Runbook | Use it when |
|---|---|
| [deploy-backend-service.md](deploy-backend-service.md) | Shipping a change to any `aivorah-*-service` on Render |
| [deploy-frontend.md](deploy-frontend.md) | Shipping a change to `aivorah-frontend` on Vercel |
| [apply-db-migration.md](apply-db-migration.md) | Changing the database schema (`aivorah-db`); Dev and Test are fully in sync |
| [rotate-api-key.md](rotate-api-key.md) | A key leaked, expired, ran out of credit, or an account changes owner |
| [service-down.md](service-down.md) | A service is down, slow, crashing or returning errors |
| [bulk-upload-ai-providers.md](bulk-upload-ai-providers.md) | Teacher bulk upload / worksheet → quiz is slow or failing |

Where things are: dashboards and accounts in [02-access/access-inventory.md](../02-access/access-inventory.md); repos and services in [01-overview/repositories.md](../01-overview/repositories.md).
