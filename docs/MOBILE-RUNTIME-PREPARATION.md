# Optional hosted runtime preparation

When database credentials remain in the host's encrypted environment, run:

```sh
pnpm db:migrate && pnpm exec tsx scripts/prepare-mobile-runtime.mts && pnpm build
```

Scope this command and `TYLEROS_MOBILE_WORKER_CREDENTIAL` to the intended
preview branch. Set that secret to a credential generated with
`generateRuntimeCredential()` (`tylrt_` plus 43 base64url characters from 32
cryptographically random bytes). Store the same value only in the companion
worker's protected environment as `TYLEROS_RUNTIME_CREDENTIAL`. Do not put it in
a command argument, source file, app configuration, screenshots, or build logs.
This does not require exporting the database URL or existing authentication
secrets from the host.

Unset means a successful no-op without opening the database. A present but empty,
malformed, or trivially weak value fails the build. First preparation creates
`mobile-companion-python`, kind `python`, enabled, with only the explicit `miles`
role and `deterministic` capability. Postgres receives only the SHA-256 credential
hash. This uses the existing fleet tables and transaction, adding no migration,
provider configuration, standing authority, scheduler, or billing setting.

Repeated preparation succeeds without mutation only when the supplied active
credential identifies that same enabled instance with exactly those grants and
capabilities. A changed or revoked credential, different owner, changed kind,
disabled instance, or changed grants fails closed. Existing credentials and
grants are never replaced. A unique-constraint conflict rolls back all inserts;
concurrent first builds can fail safely and may be retried after inspection.
Intentional credential rotation is a separate fleet administration operation.

The CLI prints only a fixed identity and create/unchanged/skipped status. It
suppresses driver error details because those may contain bound values or
connection strings. A failed preparation requires checking the encrypted secret
format, database availability/migrations, and existing fleet identity/grants
through trusted administration. Do not dump host environment variables.

Preparation does not start a worker or prove runtime health. Launch the existing
Python companion using this instance credential and verify authenticated claim,
run completion, and approval behavior separately. Its calls retain existing
standing-authority and human-approval boundaries.

Verification: `pnpm exec vitest run tests/integration/mobile-runtime-preparation.test.ts
src/domain/runtime/mobile-runtime-preparation.test.ts` covers hash-only storage,
repeat without mutation, wrong-owner rejection, changed state/grant refusal,
and rollback when a revoked credential collides during creation.
