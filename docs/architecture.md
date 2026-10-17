# Architecture and decisions

## Verified platform route

Sites was successfully registered on 2026-10-17 as owner-private. Hosting uses the supported Vinext starter with its `sites()` build integration. The manifest requests D1 as `DB`; ChatGPT identity is provided by Sites dispatch. No external infrastructure is substituted.

GitHub source remote: https://github.com/TacchiJ/ai-news-pages. Visibility and pushes require working local GitHub authentication.

## Costs and unattended execution

Official pricing describes credits as a unit for eligible credit-based usage, separate from API prices, dollars and tokens. The available Sites schedule tool exposes timing and prompts, but no execution credit reservation or hard per-project daily cap. A prompt or an application counter cannot bound a cloud agent's in-flight billed work. On October 17, 2026, the owner explicitly waived the hard 10-credit cap. The approved execution route is a linked Sites cloud task using ChatGPT and the Site MCP tools, with bounded discovery, caching and usage logs. The quiz server makes no model calls and does not introduce a separately billed API. Deployment and fresh cloud writer verification remain pending. Development costs belong to the implementation session, separate from the recurring generation ledger.

Sources checked: https://learn.chatgpt.com/docs/sites, https://learn.chatgpt.com/docs/pricing, https://learn.chatgpt.com/docs/automations.

## Integrity model

D1 constraints and transactional batches arbitrate concurrent requests. The first attempt has a deterministic unique slot per user and edition; subsequent practice attempts have idempotency keys. Topic submissions are immutable paired answers. Server database triggers record completion once and protect score state. Leaderboards derive scores from locked answers plus audited corrections, ordered by score, UTC completion datetime, then attempt ID. No combined track score exists.

Published editions are immutable JSON documents stored in D1. Responses explicitly project public fields and include feedback only for locked topics. Drafts and evidence stay server-side. Schema migrations contain no content.
