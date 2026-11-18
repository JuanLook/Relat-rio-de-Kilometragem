# Security Specification — Controle Corporativo de Quilometragem V1 & UP

## 1. Data Invariants

1. **Verified Identity Gate**: Every read and write operation requires `request.auth != null` AND `request.auth.token.email_verified == true`. Unverified accounts or anonymous users are strictly denied.
2. **Master Gate Membership**: Sub-resources under `/workspaces/{workspaceId}` (`months`, `weeks`, `entries`) require the caller's UID to exist in `/workspaces/{workspaceId}/members/{request.auth.uid}` via `exists()`. Revoking a member document immediately revokes `get`, `create`, `update`, and `delete` privileges across all workspace subcollections.
3. **Atomic Workspace Initialization**: Creating `/workspaces/{workspaceId}` requires `existsAfter(/databases/$(database)/documents/workspaces/$(workspaceId)/members/$(request.auth.uid))` in the same atomic batch, preventing orphaned workspaces without an owner member record.
4. **Invite-Gated Collaborator Onboarding**: Joining `/workspaces/{workspaceId}/members/{request.auth.uid}` as `'editor'` requires `incoming().inviteCodeUsed` to match `get(/databases/$(database)/documents/workspaces/$(workspaceId)).data.inviteCode`. Self-assigning `'owner'` on an existing workspace is forbidden.
5. **Zero PII Exposure**: No email addresses, phone numbers, or physical addresses are stored in any Firestore collection. `/userSettings/{userId}` is strictly isolated to `request.auth.uid == userId`.
6. **Mathematical Mileage Integrity**: On every `MileageEntry` create and update, `kmStart >= 0`, `kmEnd >= kmStart`, and `kmResult == kmEnd - kmStart`.
7. **Closed-Week Lock (Terminal State Protection)**: Entries belonging to a week where `/weeks/{weekId}.data.isLocked == true` cannot be created, edited (except `memberUids` synchronization), or deleted until the week is explicitly reopened (`isLocked == false`).
8. **Secure List Queries Without Cost Explosion**: `allow list` exists only on `members` and `entries` and enforces `request.auth.uid in resource.data.memberUids` with zero `get()` or `exists()` lookups.
9. **Temporal & Immutable Field Integrity**: `createdAt == request.time` on creation (immutable thereafter), `updatedAt == request.time` on all writes, and identity/relational keys (`ownerId`, `createdBy`, `workspaceId`, `monthId`, `weekId`, `userId`) are immutable on update.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Unverified Email Spoof**: Authenticated user with `email_verified: false` attempting `create` on `/userSettings/{uid}`.
2. **Shadow Field Injection**: Member updating `/workspaces/{wsId}` with extra key `{"isAdmin": true}` alongside `spreadsheetId`.
3. **ID Poisoning (2KB Path ID)**: Creating `/workspaces/{2000_char_id}` or `/entries/{bad$id!}` bypassing `isValidId()`.
4. **Self-Assigned Owner Escalation**: Non-owner creating `/workspaces/{wsId}/members/{attackerUid}` with `role: "owner"` on an existing workspace.
5. **Wrong Invite Code Brute Join**: User creating `/workspaces/{wsId}/members/{attackerUid}` with `role: "editor"` and mismatched `inviteCodeUsed: "WRONG123"`.
6. **Orphaned Workspace Write**: Creating `/workspaces/{wsId}` without atomically creating `/workspaces/{wsId}/members/{ownerUid}` in the same batch.
7. **Negative / Inverted Mileage Manipulation**: Creating `MileageEntry` where `kmStart: 500`, `kmEnd: 450`, or `kmResult: 9999` (`kmResult != kmEnd - kmStart`).
8. **Closed Week Tampering**: Updating `kmEnd` or deleting a `MileageEntry` whose parent `/weeks/W1` has `isLocked == true`.
9. **Cross-User Settings Snooping**: Authenticated user `uid_B` attempting `get` on `/userSettings/uid_A`.
10. **Blanket List Scraping**: Authenticated non-member querying `collection(db, 'workspaces/ws_1/months/2026_11/entries')` without `memberUids` authorization.
11. **Immutable Author Rewrite**: Workspace editor updating `createdBy` or `createdAt` on another member's `MileageEntry`.
12. **Denial-of-Wallet Oversized Array / String**: Submitting `description` with 10,000 characters or `memberUids` with 50 elements.
