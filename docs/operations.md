# Operations

## Hosting and identity

The Site is registered as `appgprj_6ad3fe7390f48191922947a0d94c9de2`. Preserve the exact identity in `.openai/hosting.json`; never create a second Site to retry publishing. The intended origin is https://ai-daily-tacchij.stonyrose1025.chatgpt.site. Registration is not a successful deployment. Consult `validation.md` for actual deployment status.

Keep the Site owner-private during review. Preserve its current audience on every update. Sites provisions `DB` from the manifest and applies the tracked migrations before Worker deployment. Use the Sites skill's source synchronization and artifact packaging flow; the pushed commit and built archive must match exactly. Do not deploy directly through an unrelated Cloudflare account.

Visitor identity comes from Sites dispatch, with every record authorized by stable Site user ID. The browser's email and full name are never saved in profiles, attempts or leaderboards. The chosen display name is public. The development mock identity is loopback-only and excluded from production builds.

## Owner setup

After private deployment, sign in and visit `/api/quiz?identity=1` to obtain **your own Site-specific user ID**. Configure it as the hosted runtime value `OWNER_USER_ID` through Sites environment tools. Do not assume the workspace account ID is interchangeable. Redeploy the saved version to apply environment changes. The Editorial desk link appears only for that configured owner, and every owner API operation independently checks authorization.

Create a high-entropy `PUBLISHER_TOKEN` through a secure secret manager and configure it as a hosted secret. Keep it out of Git, command arguments and logs. This authenticates automated writing separately from visitors. Private service requests additionally require the dispatch service credential supplied by Sites, sent only to this Site in `OAI-Sites-Authorization`. A future cloud task must acquire this credential itself; session memory and a local `.env` are not unattended access.

## Publication without a code deployment

The zero-model-call alternative is a **human-researched, reviewed draft import**. No model service is called by publication, grading or leaderboards. Store drafts and evidence in ignored `private-data/`; never commit real edition content or unpublished answer keys.

The edition contract is defined by `editionSchema` in `lib/domain.ts`. Review the editorial checklist before setting `editorialApproved: true`. The authenticated `POST /api/owner` publisher validates the entire edition, retrieves bounded accessible evidence, verifies the quoted evidence passages, checks cross-edition duplicate histories and commits content plus histories in one D1 batch. A changed edition in an occupied track/date slot is rejected; an exact retry returns the same digest. If evidence verification or publication fails, previous editions remain intact.

For a controlled service import, place a reviewed draft under `private-data/`, supply `SITE_ORIGIN`, `PUBLISHER_TOKEN` and `SITES_SERVICE_TOKEN` securely to the publisher process, then run:

```sh
node scripts/publish-edition.mjs private-data/edition.draft.json
```

The CLI prints only edition identity, digest and readback status. It sends credentials in HTTPS headers, refuses redirects and confirms the persisted digest with an independently authenticated read request. Do not enable scheduling until this exact writer succeeds from a **fresh cloud execution context**, not just this desktop or a browser session. The CLI requires a reviewed import; it does not discover or generate content.

## Scheduling and budget

On October 17, 2026 the owner instructed: **“ignore the cap, I'll address it later if it is a problem.”** The original 10-credit hard cap and its disabled-generation fallback are superseded. Cloud research and generation may use more than 10 ChatGPT/Codex credits. Bounded searches, source caching, bounded retries, idempotent publication and honest usage logs remain. No separately billed API or alternative infrastructure has been authorized.

The approved route is a linked Sites cloud task using ChatGPT and this Site's owner-only MCP tools. Read [cloud generation](cloud-generation.md) for tools, the saved task instructions and activation steps. The server's generation action only records the handoff; it does not perform model calls. It records one generation row per Toronto date and retains unknown credit measurements as null. Serving, grading and rankings require no model calls.

No schedule is currently created or enabled: private deployment, owner configuration and fresh cloud writer/readback verification are still pending. The intended schedule remains Monday–Friday, **07:00 America/Toronto**, both editions ready by 09:00, including weekday holidays. No weekend generation. Use the linked cloud schedule, retain the timezone for DST and inspect existing automations before creating one.

Development usage belongs to the implementation session, separate from recurring generation. ChatGPT credits are not dollars, tokens or API credits. There is no enforced daily spending cap. Record actual usage only from reliable platform measurements; otherwise leave it unknown. Notify the owner on new meaningful failures, delays or required actions; stay quiet on unchanged outcomes. External scheduled notification delivery remains unverified while the schedule is inactive.

## Reports and corrections

Visitors can report either question after starting an edition. Reports are bounded and visible only to the owner/service. The owner records a resolution in the Editorial desk. A grading correction requires the edition, topic, question, corrected choice, source link, explanation and audit reason. Corrections append an immutable audit record, retaining published content and submitted answers.

Scores are derived through `attempt_scores` using the latest correction for each question. Ranked scores, practice scores, leaderboards and personal bests therefore change consistently without a risky partial backfill. Completion timestamps remain untouched. Scores belong to the edition taken, regardless of the date of completion.

## Failure recovery and maintenance

- Missing edition: show unavailable on its real date; use the archive to access earlier content.
- Failed validation/retrieval: correct the private draft and retry; never publish a partial quiz.
- Uncertain publication: use owner readback and digest comparison before retrying. The track/date key makes retries repeat-safe.
- Interrupted attempt: start resumes the first attempt; use the saved attempt URL for a specific practice attempt.
- Concurrent answer conflict: the first paired write wins; reload the server state to see the saved answers.
- Migration failure: confirm applied state before changing migration history. Append migrations; do not rewrite applied SQL or Drizzle metadata.
- Runtime values changed: redeploy the existing saved version through Sites. Never expose secrets in source or browser assets.

Logs use fixed error categories, excluding raw SQL, answers, source contents, credentials and personal data. Never export a production database into a tracked folder. Data backup/retention and deletion require an owner policy before wider sharing; current immutable attempt rules deliberately prevent accidental score resets.
