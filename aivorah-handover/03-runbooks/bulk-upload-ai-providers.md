# Runbook — Teacher Bulk Upload / worksheet → quiz

Owner repo: `aivorah24/aivorah-assignments-service` (Render, aivorah24 workspace, service `srv-d9uvv1u417fc7399o59g`, **free plan, 512 MB**).
Frontend: Teacher → Assignments → Bulk Upload (`aivorah-frontend`, `src/screens/teacher/assignments/hooks/useBulkUpload.ts`).

## How an upload works
1. Word files: `POST /assignments/docx-to-pdf` (mammoth → headless Chrome → PDF).
2. Each file: `POST /quiz/generate` (PDF) or `/quiz/generate-image` (image). The frontend sends files **one at a time**.
3. Inside `/quiz/generate` (`services/quizVision.js → generateQuizFromDocument`):
   1. **Document model** (local, no AI): text layer + page images (headless Chrome) + Tesseract OCR. Max `DOCUMENT_MAX_PAGES` pages (default 3).
   2. **Gemini** reads the whole PDF (models from `GEMINI_MODEL`, tried in order).
   3. If Gemini fails: **Mistral** vision on the page images, then **Hugging Face (Qwen)**.
   4. Last resort: OCR transcript → **Groq** text model.

## Configuration on Render (names only — values live in Render)
| Variable | Value / meaning |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key (main provider) |
| `GEMINI_MODEL` | `gemini-3.6-flash,gemini-3.5-flash` — `gemini-2.5-flash` is closed to new keys |
| `GEMINI_VISION_TIMEOUT_MS` | `90000` |
| `GEMINI_TIMEOUT_WITH_FALLBACK_MS` | `90000` (Gemini's time budget is the **smaller** of these two) |
| `DOCUMENT_MAX_PAGES` | not set → default 3 (PR #18). Do not raise above 3 on the 512 MB plan |
| `MISTRAL_API_KEY` | Mistral fallback; needs an active Mistral plan to answer |
| `HF_TOKEN` | Hugging Face fallback; uses the account's monthly credit |
| `GROQ_API_KEY` | Groq, the last-resort text model |
| `POC_FALLBACK_ENABLED` | `true` — test-only `/poc` routes, not used by Bulk Upload |

## How it behaves
- **Speed:** a few seconds when Gemini answers; 2–3 minutes when it falls back to OCR + the other providers.
- **Fallbacks:** each provider is tried in order until one answers. Which one answered shows in Render → Logs.
- **Pages:** the first 3 pages (`DOCUMENT_MAX_PAGES`) go through local OCR; Gemini reads every page.
- **Memory:** 512 MB on the current plan. One Chrome instance and one OCR worker run at a time, and the page cap keeps big PDFs within memory.
- **Very thin worksheets** (almost no text) can produce a quiz with 0 tasks; ask the teacher for a clearer scan or a PDF with real text.

## Troubleshooting
| Symptom | Likely cause | Check / fix |
|---|---|---|
| Browser says "blocked by CORS" / "Failed to fetch" | Service crashed (OOM) mid-request; crash page has no CORS headers | Render → Events: `server_failed` with `oomKilled`. Lower `DOCUMENT_MAX_PAGES` or move to a 2 GB instance |
| `docx-to-pdf` 500, "Timed out … WS endpoint" | Chrome couldn't start (no memory) | Same as above |
| Every upload takes 2–3 min | Gemini failing → OCR + Groq | Render logs: `[gemini] … unavailable`, `[vision-provider] gemini: …`. Check key/billing at aistudio.google.com |
| Logs: `402 … prepayment credits are depleted` | Gemini key out of credit | New key in AI Studio, or add billing; update `GEMINI_API_KEY` |
| Logs: `models/… is no longer available` | Model retired for this key | List models (`GET https://generativelanguage.googleapis.com/v1beta/models` with the key) and update `GEMINI_MODEL` |
| Logs: `Mistral … 429` | Mistral plan inactive / rate limit | console.mistral.ai → activate "Experiment" plan or add billing |
| Logs: `HF router 402` | Hugging Face credit used up | Buy credit or HF PRO; resets monthly (small) |

## When an AI provider stops answering
1. Render → assignments service → **Logs**: find the provider error (402 / 429 / 503 / "no longer available").
2. Fix the account (top up, new key, activate plan) on the provider's site.
3. Render → **Environment** (`https://dashboard.render.com/web/srv-d9uvv1u417fc7399o59g/env`) → update the variable → **Save, rebuild, and deploy**. (Not "New Environment Group".)
4. Re-test (below).

## How to test
```bash
# Word → PDF
node -e "require('fs').writeFileSync('d.json',JSON.stringify({fileBase64:require('fs').readFileSync('tests/fixtures/tables.docx').toString('base64')}))"
curl -s -H "Content-Type: application/json" --data @d.json https://aivorah-assignments-service.onrender.com/assignments/docx-to-pdf | head -c 100
# PDF → quiz (field name is "pdf")
curl -s -F "pdf=@tests/fixtures/b02-ib-pyp-worksheet.pdf;type=application/pdf" -F "grade=Grade 4" -F "subject=Mathematics" -F "school=" https://aivorah-assignments-service.onrender.com/quiz/generate | head -c 300
```
Then Render → **Events** (no `server_failed`) and **Logs** (which provider answered).

## Ideas to improve
- Skip a provider for a while after quota or overload errors, instead of trying it on every upload.
- Show "couldn't read this worksheet" in the app when a quiz comes back with 0 tasks.
- Store the teacher's chosen language on the assignment (today the typing language is inferred).
- Put the AI providers on company-owned paid plans for steady speed.
