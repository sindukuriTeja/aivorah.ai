# Qdrant collections

What is stored in Qdrant (the vector database), who uses it, and what to watch out for. Checked against the live cluster on 2026-11-02.

## The cluster
| | |
|---|---|
| Name | `ai-mentor` (Qdrant Cloud, **Free** tier) |
| Region / version | AWS `us-west-1`, Qdrant v1.17, 1 node, 1 GiB RAM, 4 GiB disk |
| Console | cloud.qdrant.io → account "Base Account" → Clusters → `ai-mentor` |
| Connection | `QDRANT_URL` + `QDRANT_API_KEY` env vars (values live in Render, never in git) |
| Used by (live) | `ai-coach`, `assignments`, `learning-paths`, `teacher-dashboard` services. `leaderboard` has Qdrant code but no Qdrant env set on Render |

Free clusters can be paused after a period of inactivity, and automatic backups are a paid feature. Take a snapshot before any bulk change (see the end of this page).

## Summary
| Collection | Points | What it holds | Written by | Read by |
|---|---|---|---|---|
| `aivorah_curriculum_chunks_v1` | 68,124 | NCERT textbook chunks, Grades 1–12 | `ai-mentor/backend` (Python NCERT pipeline) | learning-paths, ai-coach, assignments, teacher-dashboard |
| `aivorah_curriculum_vault_v1` (alias `aivorah_curriculum`) | 20,223 | Newer, richer NCERT "vault" (hybrid dense + sparse search) | `learning-paths` script on branch `feat/literature-listen-and-vault` (not merged) | Nothing on `main` yet |
| `cisce_curriculum_v1` | 8,834 | Official CISCE (ICSE/ISC) syllabus, Preschool–Class XII | `learning-paths` CISCE indexer | learning-paths |
| `ai_mentor_content` | 4,420 | Original mixed content: IB, Cambridge, CBSE, NCERT and publisher topics | `ai-mentor` seed scripts + teacher uploads | learning-paths, ai-coach, assignments, teacher-dashboard |
| `school_quizzes` | 79 | Interactive quizzes teachers created, saved for reuse by other teachers | `assignments` and `learning-paths` services (auto-save) | assignments, learning-paths |

All vectors are 384-dimensional, cosine distance. Every collection except the vault uses `Xenova/all-MiniLM-L6-v2`. The vault uses `intfloat/multilingual-e5-small`: same size, **different model**. Never mix vectors from the two models in one search.

---

## `aivorah_curriculum_chunks_v1`: NCERT textbooks
The main NCERT content behind lessons, AI Coach answers and NCERT topic counts.

- **Curriculum:** `NCERT` only (CBSE students are mapped to NCERT in code; see `toQdrantCurriculum()` in learning-paths `services/qdrant.js`).
- **Grades:** stored as an **integer** 1–12 (unlike other collections). Most content is in 6, 8, 11 and 12.
- **Subjects:** 30, led by Mathematics (14k), Social Science (8.8k), Science (6.2k), English (4.8k).
- **Content type:** `explanation` 40.8k, `semantic_chunk` 22.8k, `image` 4.5k.
- **Main fields:** `curriculum`, `grade`, `subject`, `topic`, `content_type`, `content` / `text`, `source` (PDF path), `learning_objective`, `difficulty`, `bloom_taxonomy`, `image_url`, `key_terms`.
- **Indexed (fast filters):** `curriculum`, `grade` (integer), `subject`, `topic`, `content_type`, `difficulty`, `bloom_taxonomy`.
- **Watch out:** some `topic` values are book file codes (e.g. `heky106`), not readable titles. Subject names overlap (`Fine Art` vs `Fine Arts`, `Evs` vs `Environmental Studies`).

## `aivorah_curriculum_vault_v1` (alias `aivorah_curriculum`): NCERT vault
A cleaner rebuild of the NCERT content with a structured schema and hybrid search. Planned to replace `aivorah_curriculum_chunks_v1`, but **no code on `main` reads it yet**.

- **Curriculum:** `NCERT` only, Grades 1–12 (most in 11–12).
- **Vectors:** named `dense` (384) + `sparse` (keyword/BM25-style, IDF), so it supports hybrid search.
- **Schema (nested):** `id`/`_urn` (e.g. `urn:aivorah:curriculum:ncert:9:english:the-pot-maker:0028`), `academic_level{grade_numeric, tier}`, `subject_canonical` / `subject_label`, `hierarchy{unit_no, unit, chapter_title, section, subtopic}`, `curriculum_context{book_code, book_title}`, `content{child_text, parent_context}`, `visuals[]`, `provenance{source_pdf, page_numbers, edition_year}`, `pedagogy{chunk_type}`, `schema_version`.
- **Chunk types:** `text` 18.8k, `activity` 774, `exercise` 543, `example` 146.
- **Builder:** `scripts/vault/ingest_ncert_vault.py` on learning-paths branch `feat/literature-listen-and-vault`.

## `cisce_curriculum_v1`: CISCE official syllabus
The official CISCE outline (ICSE Class IX–X, ISC Class XI–XII, plus primary/preschool frameworks). Shown in the app as "Coming soon" content.

- **Programmes:** ISC 4.6k, ICSE 3.0k, Upper Primary 532, Primary 501, Preschool 119.
- **Levels:** `TOPIC` 4,952, `UNIT` 2,159, `FRAMEWORK_SECTION` 1,723.
- **Subjects:** ~60 (Accountancy, Physics, Chemistry, Legal Studies, Robotics, AI, ...).
- **Provenance:** `VERIFIED_OFFICIAL` 6,248, `OFFICIAL_PARTIAL` 2,586. Every point keeps `source_url` (cisce.org PDF), `source_sha256` and page numbers.
- **Main fields:** `curriculum_id` (`cisce`), `board`, `programme`, `version` (e.g. `isc-2027`), `grade_label` (`Class XI`), `grade_number`, `student_grade` (`Grade 11`), `subject`, `level`, `unit_*`, `topic_*`, `path`, `text`.
- **Safety:** the indexer refuses to write anywhere except this collection (`PROTECTED_COLLECTIONS` in `services/cisce/constants.js`).

## `ai_mentor_content`: original mixed content
The first collection, from the monolith days. Still used for IB, Cambridge and other non-NCERT curricula, and for teacher-uploaded material.

- **Curricula:** IB_PYP 1.6k, NCERT 894, IB MYP 475, Cambridge 411, IB DP 308, ICSE 174, CBSE 138, and 80 each for Arrow, Hodder, Oxford, Pearson and Singapore MOE.
- **Content type:** `explanation` 2.0k, `syllabus_topic` 1.1k, `semantic_reference` 560, `text` 285, `image` 240.
- **`school_id`:** `demo` 1.7k, `default` 1.1k (school-specific uploads carry their own id).
- **Main fields:** `curriculum`, `grade`, `subject`, `topic`, `content_type`, `text` / `content`, `textbook`, `chapter`, `source`, `school_id`, `uploaded_by`.
- **Watch out:** labels are inconsistent. IB PYP is stored as `IB_PYP` (and 2 points as `IB PYP`); grades mix `Grade 3`, `Class 3`, `Class I`. Code handles the IB PYP case; check before adding new filters.

## `school_quizzes`: teacher quizzes
Interactive quizzes teachers create are auto-saved here so other teachers can find and reuse them. The collection is created automatically if missing.

- **Fields:** `title`, `subject`, `grade`, `curriculum`, `school_id`, `teacher_id`, `teacher_name`, `assignment_id`, `status`, `created_at`, `quiz_data` (full quiz JSON).
- **Mix:** mostly Mathematics; schools TSRA, Vethathiri, TASARA.
- **Watch out:** contains test data (`ZZ-TEST` curriculum, `ZZ` grade, 21 points with empty `school_id`).

---

## Safe handling
- **Snapshot before bulk changes:** `POST {QDRANT_URL}/collections/<name>/snapshots` (header `api-key`). Download it from the cluster UI or the snapshots API.
- **Don't delete or recreate** `ai_mentor_content`, `aivorah_curriculum_chunks_v1` or `school_quizzes`. Live features depend on them and they are slow to rebuild.
- **Changing the key:** create a new key in the Qdrant console, update `QDRANT_API_KEY` on the 4 Render services, redeploy, then delete the old key.
- **Quick look:** the cluster web UI (`<QDRANT_URL>/dashboard`) shows collections, points and lets you run searches.
