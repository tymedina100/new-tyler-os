# TylerOS feature coverage

Engineering evidence, not personal state. Updated 2026-09-09.
Authority: [North Star](https://app.notion.com/p/3d17f32d40758186baf4fc9561ae34e3)
and the September 9 comprehensive goal. Shared tasks and policies remain in
[HQ](https://app.notion.com/p/3d07f32d407581e3974afff5b88a024a).

Status distinguishes existing implementation from verification in this milestone.
No domain is complete just because a specialist role name exists.

| Capability                             | Current evidence / gap                                                                    | Next integrated work or dependency                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Morning briefing                       | Existing deterministic/explicit AI jobs; new canonical operations counts verified locally | Release web and Python changes under approval; richer sourced domain context                            |
| Capture, tasks, routines               | Capture, recurrence, Today; cross-device item conflicts locally verified                  | Release version checks; add completion history                                                          |
| Email                                  | Existing bot Google helpers not revalidated here                                          | Verify scopes and provider-supported access; draft/approval integration before external actions         |
| Calendar                               | Existing Google helpers not revalidated here                                              | Read events/conflicts, explicit scheduling policy                                                       |
| Finance                                | Ledger role and separate Worthlane project exist; finance integration not verified here   | Authorized data source, freshness and approval-gated actions                                            |
| Career                                 | Archer and canonical policy exist                                                         | Audit current bot workflow and assigned opportunities; preserve assignment/submission gates             |
| eBay / Marketplace                     | Mercury ownership and inventory authority documented in HQ                                | Verify actual inventory and provider access; no invented listings or sales                              |
| Household                              | Kitchen inventory, shopping bridge, recurrence exist                                      | Bring routines and completion outcomes into briefings                                                   |
| Food/drink tracking                    | Palate exists; kitchen is stock, not a meal log                                           | Structured consumption and feedback linked to second brain                                              |
| Preferences / restaurants / ordering   | Durable context in Notion; no verified ordering flow                                      | Confidence and recent-meal evidence; authorized merchant, budget and ordering mechanism                 |
| Sports / gaming / entertainment / news | Role/context only in this audit                                                           | Current sources and preferences, useful changes only                                                    |
| Second brain                           | Notes/search; independent source health and review timing implemented                     | Source-health locally verified; release and live Notion sync remain open                                |
| Autonomous project development         | Existing workflow/bot code; local implementation and tests work                           | Audit actual worker execution, resumable milestones, measured outcomes                                  |
| Provider independence                  | Roles distinct from runtimes, explicit profiles                                           | Supported subscription execution adapters; no subscription-to-API assumption                            |
| Quota / cost                           | Capacity ledger, usage accounting; automatic selection absent                             | Deterministic eligibility, fresh quota evidence, approved cost ceiling                                  |
| Native mobile / voice                  | Canonical iOS source; prior release record says physical install completed                | Native operations verified in Simulator; physical production login, voice and notification verification |
| Coordinated devices                    | Runtime instance/grant model exists                                                       | Verify host availability and failover; no assumed always-on Windows node                                |
| Game-style world                       | No verified implementation in this audit                                                  | Render real job/role/health state; no synthetic activity                                                |
| Smart home                             | Future scope                                                                              | Hardware, local control and explicit authority prerequisites                                            |
| AI advancement monitoring              | Scout role exists                                                                         | Source-backed capability changes, bounded evaluations with approved compute                             |
| Tested self-improvement                | Tests and review gates exist                                                              | Capture before/after outcome/cost evidence and gate adoption                                            |

## Current milestone evidence

- `tests/integration/operations.test.ts`: persistent outcomes, old pending decisions,
  failure deduplication and time window, no draft/dismissed/quiet false completions,
  and reachability of pending decisions beyond 50 newer jobs.
- `src/domain/runtime/operations-summary.test.ts`: attention versus activity,
  preserved context, no self-triggering briefing loop.
- `e2e/operations.spec.ts` with `playwright.operations.config.ts`: isolated real
  PostgreSQL + authenticated Chromium + actual sibling Python worker. Proposal on
  Today → approved note → mobile aggregate → next briefing, phone-width layout.
- Python tests/test_tyleros_operations.py: real-count rendering, invalid/legacy
  context, no recursive generation. Run in the sibling worker checkout.

Native verification: 11 unit tests plus full authenticated Simulator UI flow,
including canonical operations and Miles navigation. Busy-decision regression
covered. Web and Python worker released through app PR #11 and worker PR #88.
Native UI is verified in Simulator; this release did not install an updated phone binary.

## Release and operating dependencies

Protected-branch merges and deployments require explicit approval. Tyler approved
the morning-operations release on September 9; web and worker rollout completed.
Later local editor changes remain outside that approval.
No paid inference, purchases, messages or other external actions were performed.
Plugin Management search/suggestion capabilities were not callable in this
session after tool discovery; installed connectors remain usable individually.
Account availability is not inferred from the installed plugin catalog.

Physical device verification and individual account connections do not block
independent local engineering. Existing production behavior is not changed by
these local branches.

## Cross-device item draft evidence

The full browser editor and native item API now use the same locked version
check. Database tests cover stale web drafts after phone edits, relation rollback,
refreshed saves and stale phone drafts after web edits. A two-connection PostgreSQL
race proves exactly one concurrent draft commits. The authenticated Chromium
editor suite covers failed-save preservation, normalized clean saves, sequential
saves, typing during an in-flight save, and stale web draft rejection/recovery
after a real mobile API edit. This is local verification, release pending; it does
not claim offline sync or conflict protection for notes and other entity types.

## Morning operations release receipt · 2026-09-09

- App PR #11 merged as `b754b88`; GitHub CI passed. Vercel production deployment
  `dpl_FotLoyFzB4qznZprU49PkkJDhSyF` is READY at the existing production domain.
- Worker PR #88 merged as `b14898c`. Approved worker bytes installed in the existing
  Mac LaunchAgent; credentials, helper, polling interval and authority unchanged.
- Authenticated production runtime context includes canonical operations; worker
  polls return HTTP 200 after restart. No synthetic production task or note added.
- Native changes are in main and locally tested, but no new phone binary installed.
- Post-release runtime log view showed zero warnings/errors/fatal entries. One
  verification request omitted its role header and received the expected 400;
  corrected requests passed. No log drains are configured; no paid monitoring added.

## Source-health milestone

Knowledge and shared-task imports now report not-configured, unavailable or
available independently. Each knowledge entry shows its own import age and review
due date from recorded cadence; an import batch never resets old reviews. Web and
native display the same server-calculated metadata. Local tests corrupt and repair
one source while continuing to read the other and canonical app records. This
remains a read-only snapshot system; live Notion sync and automated reviews are
separate missing capabilities. Release is not authorized by the earlier approval.

Verification: 1,018 repository tests and full gate passed; authenticated browser
source-failure/recovery flow passed; 12 native unit tests and source-recovery UI
flow passed. Web and native screenshots inspected. No production changes.
