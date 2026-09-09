# TylerOS feature coverage

Engineering evidence, not personal state. Updated 2026-09-09.
Authority: [North Star](https://app.notion.com/p/3d17f32d40758186baf4fc9561ae34e3)
and the September 9 comprehensive goal. Shared tasks and policies remain in
[HQ](https://app.notion.com/p/3d07f32d407581e3974afff5b88a024a).

Status distinguishes existing implementation from verification in this milestone.
No domain is complete just because a specialist role name exists.

| Capability                             | Current evidence / gap                                                                  | Next integrated work or dependency                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Morning briefing                       | Released deterministic briefing with operations and previous-day consumption counts     | Richer sourced domain context and measured daily usefulness                                     |
| Capture, tasks, routines               | Released capture, recurrence, Today and cross-device item conflict protection           | Add completion history and integrated routines                                                  |
| Email                                  | Existing bot Google helpers not revalidated here                                        | Verify scopes and provider-supported access; draft/approval integration before external actions |
| Calendar                               | Existing Google helpers not revalidated here                                            | Read events/conflicts, explicit scheduling policy                                               |
| Finance                                | Ledger role and separate Worthlane project exist; finance integration not verified here | Authorized data source, freshness and approval-gated actions                                    |
| Career                                 | Archer and canonical policy exist                                                       | Audit current bot workflow and assigned opportunities; preserve assignment/submission gates     |
| eBay / Marketplace                     | Mercury ownership and inventory authority documented in HQ                              | Verify actual inventory and provider access; no invented listings or sales                      |
| Household                              | Kitchen inventory, shopping bridge, recurrence exist                                    | Bring routines and completion outcomes into briefings                                           |
| Food/drink tracking                    | Released structured log, daily counts and explicit feedback; native Simulator verified  | Native physical voice verification, canonical preference sync, recommendations and ordering     |
| Preferences / restaurants / ordering   | Durable context in Notion; no verified ordering flow                                    | Confidence and recent-meal evidence; authorized merchant, budget and ordering mechanism         |
| Sports / gaming / entertainment / news | Role/context only in this audit                                                         | Current sources and preferences, useful changes only                                            |
| Second brain                           | Notes/search; independent source health and review timing implemented                   | Source health released; live Notion sync and automatic reviews remain open                      |
| Autonomous project development         | Existing workflow/bot code; local implementation and tests work                         | Audit actual worker execution, resumable milestones, measured outcomes                          |
| Provider independence                  | Roles distinct from runtimes, explicit profiles                                         | Supported subscription execution adapters; no subscription-to-API assumption                    |
| Quota / cost                           | Capacity ledger, usage accounting; automatic selection absent                           | Deterministic eligibility, fresh quota evidence, approved cost ceiling                          |
| Native mobile / voice                  | Released native source; current installed phone version unverified                      | Signed package; physical production login, voice and notification verification                  |
| Coordinated devices                    | Runtime instance/grant model exists                                                     | Verify host availability and failover; no assumed always-on Windows node                        |
| Game-style world                       | No verified implementation in this audit                                                | Render real job/role/health state; no synthetic activity                                        |
| Smart home                             | Future scope                                                                            | Hardware, local control and explicit authority prerequisites                                    |
| AI advancement monitoring              | Scout role exists                                                                       | Source-backed capability changes, bounded evaluations with approved compute                     |
| Tested self-improvement                | Tests and review gates exist                                                            | Capture before/after outcome/cost evidence and gate adoption                                    |

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

## Food/drink milestone (locally verified)

Explicit `food:`/`drink:` captures share persistent web and native history and Today
counts. Native quick capture reuses the existing dictation surface. Likes/dislikes
remain explicit evidence from recent logs; removing/restoring an entry adjusts both
counts and evidence. No stock mutation or invented nutrition. Migration 0012 has
only been applied to the isolated local fixture database. No release authorized.

1,027 repository tests and authenticated PostgreSQL/Chromium/mobile HTTP flow pass.
13 native unit tests and the authenticated capture/feedback/restore/relaunch UI
flow pass. Web and native screenshots inspected. Physical microphone
verification, historical backdating, canonical Notion preference integration,
restaurant recommendations and authorized ordering remain incomplete.

### Consumption in morning briefings

Runtime Today context now includes yesterday's non-removed food/drink counts in
Tyler's configured calendar zone. It contains no consumption descriptions or
preference prose. The deterministic Python worker renders nonempty counts beside
its existing briefing material; counts alone do not trigger a scheduled briefing.
Database coverage checks December/January boundaries and absence of private meal
text. Worker tests cover valid counts, legacy/invalid input and quiet scheduling.
This is local integration, not a deployment or restaurant recommendation engine.

## Cumulative release receipt · 2026-09-09

User approved the exact cumulative release. App PR12 merged as `a5e9065` after
GitHub CI passed; production deployment `dpl_5VUEC1eMuDFHAwwoPqYqWwcVjshv` is READY
on the existing domain. Staged production migration0012/build succeeded before
primary-domain traffic moved. Authenticated staged and primary runtime checks
return the previous-day consumption summary. No synthetic production log added.

Worker PR89 merged as `cb67a93`; a rebase resolved the prior-squash conflict with
an identical source tree and 30 passing tests. Approved worker bytes installed
at a verified idle point with config/helper/interval unchanged. Post-restart
server logs show HTTP200 polls. Source health, web draft protection, food/drink
tracking and consumption briefing totals are now released on web/runtime. Native
source is merged and Simulator verified; the installed physical phone version
is not verified or updated by this release. The earlier signed package remains
the morning-operations version. Restaurant recommendations, ordering and durable
Notion preference synchronization remain incomplete.

## Food-history retrieval (local follow-through)

Universal search now includes a separate Food & drink history group. Queries match
all literal words in any order, escape SQL wildcard characters, and exclude removed
logs. Search reaches beyond the latest100 history window; direct authenticated
entry pages show date/kind/explicit feedback and allow remove/restore. Mobile search
returns the same links to the existing native web-results view. This does not add
meal prose to model context or mutate canonical Notion preferences.

### Native package follow-through

Build2 IPA from released `a5e9065` has been archived/exported with the existing
personal team/profile and its exported signature verified. It includes the released
food/source-health/morning interfaces. The paired phone remains unavailable; no
physical installation or voice verification is claimed. Installation instructions,
source/profile metadata and checksum are delivered outside source control.

## Saved Palate preferences (local follow-through)

Food now displays active Food & Drink / Preference records stewarded by Palate
from the saved Second Brain import, selected by canonical metadata. Importer
retains these properties and upgrades legacy entries even when the content hash
has not changed; repeated imports are idempotent. The profile retains original
review dates, displays import age and review status, and links to Notion. Missing
or unreadable imports show an explicit dependency without hiding the food ledger.
Meal feedback remains separate evidence and does not rewrite canonical preferences.

Full check: 1,034 tests across 76 files, including real PostgreSQL race checks.
Browser tests cover capture/search/feedback plus profile selection, unreadable
import and recovery. Synthetic fixtures only; no personal preference prose in
source. This is local, not released. Production needs a refreshed metadata-bearing
snapshot as well as a future approved release. Live canonical synchronization, recommendations and ordering remain incomplete.
Explicit Archived imports now retain revision identity with an empty body and
are excluded from knowledge search and the taste profile. Older source revisions
are rejected atomically; a newer Active revision restores visibility. Tests cover
archive, idempotency, backup, stale replay rejection and reactivation.
