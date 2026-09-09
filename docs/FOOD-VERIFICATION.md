# Food and drink verification

The meal ledger records explicit `food:` / `drink:` captures through web and mobile.
Use the global capture box or Today → Food & drink on the native companion. Add
portions or places in the description. Like/dislike is optional; Remove log hides
an incorrect report from counts and feedback, and Restore reverses that removal.
To correct a description, remove its entry and capture the corrected version.

Daily totals use `TYLEROS_TIME_ZONE` (default America/Phoenix). History and explicit
feedback cover the latest 100 logs. Records remain in PostgreSQL beyond that window;
there is no older-history browser yet. A log does not alter kitchen stock. There is
no nutrition calculation, automatic restaurant recommendation or ordering action.

## Isolated verification

Apply migration 0012 only to a development database before testing. The dedicated
browser test refuses a database other than local `tyleros_operations_test`.

```sh
pnpm exec vitest run src/domain/consumption/consumption.test.ts tests/integration/consumption.test.ts
DATABASE_URL=postgresql://tyleros_local@127.0.0.1:55432/tyleros_operations_test pnpm exec playwright test --config playwright.food.config.ts
```

The browser flow signs in, captures food, changes feedback, removes/restores it,
replays a mobile drink capture, compares Today counters and checks phone width.
The native `testFoodCaptureFeedbackAndRestore` uses the private local fixture
configuration described in ios/README.md. It verifies quick-mode draft text,
authenticated capture, feedback, removal/restoration and persistence after relaunch.
No external AI, production records or paid APIs are needed by these tests.

Release requires the additive migration before serving the new app. The native
Today contract is additive: clients tolerate old backends, and older clients ignore
the new summary. This document is a verification guide, not release authorization.
