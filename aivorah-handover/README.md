# Aivorah — Handover

Single place for the Aivorah engineering handover: system overview, access, runbooks and open work.

| | |
|---|---|
| **Handing over** | Saimohan R |
| **Receiving** | Maheswar, Teja |
| **Started** | 2026-10-14 |
| **Status** | 🟡 KT in progress: architecture, access, runbooks and repo READMEs in place; access transfer on 4–5 Nov |

> **No secrets in this repo.** Only *where* a secret lives and *who* can grant it. See [02-access](02-access/access-inventory.md).

## Contents

| Folder | What's in it | Status |
|---|---|---|
| [01-overview](01-overview/) | System overview, repos and where they deploy, feature → service map, notifications, Qdrant | ✅ v1 |
| [02-access](02-access/) | Every account/platform, owner, what must be transferred | ✅ v1 |
| [03-runbooks](03-runbooks/) | Deploy backend/frontend, DB migrations, key rotation, service down, bulk upload | ✅ v1 |
| [04-open-work](04-open-work/) | What to pick up next: decisions, security hardening, improvements, housekeeping | ✅ v1 |

## Handover checklist

- [x] System overview written
- [x] Access inventory written
- [ ] Access transferred / granted to receiver (per platform, see access inventory)
- [x] Monolith repo moved to the `aivorah24` GitHub account
- [ ] Runbooks written and dry-run by receiver
- [ ] Open work list reviewed together
- [ ] KT sessions completed
- [ ] Receiver deploys one change end-to-end unaided
