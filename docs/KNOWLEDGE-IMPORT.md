# Source-linked personal knowledge

Notion remains the canonical Second Brain. `/knowledge` and the mobile Knowledge screen read the same recoverable snapshot. This is a read cache for supported personal context, never a competing source of truth or a live balance, inventory, policy grant, or task board. Each entry has its canonical URL, source edit time, import time, review date, freshness, sensitivity and content hash. Original source exports remain unchanged outside Git.

## Import

Save complete Notion `fetch` tool JSON responses outside the repository. Only active Second Brain records are accepted. The importer rejects Sensitive records, incomplete fetches, unsafe source links and duplicate IDs. Review source contents before importing; no employer-confidential data or credentials belong here.

```
pnpm exec tsx scripts/import-knowledge.mts /private/knowledge.json /private/source1.json /private/source2.json
```

Set server-only `TYLEROS_KNOWLEDGE_PATH` to that absolute file. For serverless deployment, set encrypted `TYLEROS_KNOWLEDGE_JSON` to the validated file contents instead; stay within the host's environment-size limit. Never prefix with NEXT_PUBLIC. Personal content is not bundled into the iOS application or committed to Git.

Identical imports are no-ops. Changed source IDs replace their cached revision and back up the entire prior snapshot beside the destination. Roll back by restoring the dated backup atomically, or clear the snapshot environment variable to remove all imported content. These operations never edit the original Notion pages. Source snapshots are personal and should have restricted filesystem access; backups need the same protection.

The snapshot date is not a claim of current truth. Open the canonical source before relying on changing facts. The application does not yet automatically refresh Notion snapshots or mutate shared Work Board tasks. Personal captures continue through the existing Item/Note services in Postgres. A runtime request remains an execution record rather than a task-board clone.

## Shared Work Board read cache

The same pattern supports shared tasks without copying them into Postgres items. Save a complete Notion view export (has_more=false), then run:

```
pnpm exec tsx scripts/import-work-board.mts /private/work-board.json /private/work-board-export.json
```

Set server-only TYLEROS_WORK_BOARD_PATH or encrypted TYLEROS_WORK_BOARD_JSON. Identical revisions are no-ops; replacements retain a backup. Completed/dropped tasks are excluded from the active display, not removed from Notion. A needs-Tyler flag is not an executable approval. Only existing runtime approval records can authorize their exact proposed action.
