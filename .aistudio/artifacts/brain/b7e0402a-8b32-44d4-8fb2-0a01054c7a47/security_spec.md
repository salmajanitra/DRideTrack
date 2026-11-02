# Firestore Security Specification — Dhefin Ride Track GPS

## 1. Data Invariants
1. **Strict Ownership & Verified Gmail Identity**: Every document in `/users/{userId}` and `/users/{userId}/activities/{activityId}` can only be read or mutated by an authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **Master Gate Relational Integrity**: No `/users/{userId}/activities/{activityId}` write or single-document read is valid unless the parent `/users/{userId}` document exists and its `id` matches `request.auth.uid`.
3. **Strict Schema & Shadow-Field Prevention**: Both `UserProfile` and `ActivityRecord` enforce `hasAll` and `hasOnly` on document keys during creation and `isValid[Entity](incoming())` + `affectedKeys().hasOnly(...)` during updates.
4. **Temporal Integrity**: `createdAt` and `updatedAt` must equal server `request.time` on creation; `createdAt` is immutable on updates while `updatedAt` must equal `request.time`.
5. **Volumetric & ID Poisoning Guards**: All path IDs (`userId`, `activityId`) match `^[a-zA-Z0-9_\-]+$` with length `1..128`. Every string and list (`points <= 1800`, `splits <= 500`, `interruptions <= 100`, `deletedActivityIds <= 200`) is strictly bounded.
6. **Secure List Queries**: `allow list` on `/users/{userId}/activities/{activityId}` explicitly enforces `isOwner(userId) && resource.data.userId == request.auth.uid` without O(n) `get()` calls.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Identity Spoofing on User Create**: `{ "id": "victim_uid", "email": "attacker@gmail.com", ... }` at `/users/victim_uid` by `attacker_uid`.
2. **Unverified Email Spoofing**: Request with `request.auth.token.email == "achmadkholis2@gmail.com"` and `email_verified == false`.
3. **Shadow Field Injection on Create**: Valid `ActivityRecord` plus `{ "isAdmin": true }`.
4. **Update-Gap Value Poisoning**: `updateDoc` on allowed field `title` with a boolean `true` or 50,000-char string.
5. **Immutable Field Tampering**: `updateDoc` changing `userId`, `id`, `startTime`, or `createdAt` on an existing `ActivityRecord`.
6. **Client Timestamp Forgery**: `create` or `update` passing `Timestamp.fromMillis(1000000)` instead of `serverTimestamp()` (`request.time`).
7. **Orphaned Subcollection Write**: Creating `/users/{uid}/activities/{actId}` when `/users/{uid}` does not exist.
8. **ID Poisoning Attack**: Creating `/users/{uid}/activities/act$bad!id` or a 500-character ID string.
9. **Denial-of-Wallet Unbounded Array**: Creating an `ActivityRecord` with 5,000 `points` (> 1,800 limit) or `UserProfile` with 500 `deletedActivityIds` (> 200 limit).
10. **PII Cross-User Read**: Authenticated User B attempting `getDoc(/users/userA)`.
11. **Unscoped List Scraping**: Authenticated User A querying `collection(db, 'users', userB, 'activities')` or omitting `where('userId', '==', uid)`.
12. **Invalid Enum Injection**: Setting `sportType: "flying"` instead of `"cycling"` or `"running"`.

## 3. Red Team Audit & Conflict Report
- **Collection `/users/{userId}`**:
  - Identity Spoofing: PASS (`isOwner(userId)` + `data.id == request.auth.uid` + `data.email == request.auth.token.email` + `email_verified == true`).
  - PII Blanket Test: PASS (`allow get` restricted strictly to `isOwner(userId)`, `allow list: if false`).
  - Shadow Update / Value Poisoning: PASS (`isValidUserProfile(incoming(), userId)` wraps `allow update` + `affectedKeys().hasOnly(...)`).
  - Resource Poisoning: PASS (`isValidId`, bounded strings, `deletedActivityIds.size() <= 200`).
- **Collection `/users/{userId}/activities/{activityId}`**:
  - Identity Spoofing: PASS (`isOwner(userId)` + `data.userId == request.auth.uid` + immutable `userId` and `id`).
  - Query Trust Test: PASS (`allow list` enforces `isOwner(userId) && resource.data.userId == request.auth.uid`, zero `get()` inside `list`).
  - Shadow Update / Value Poisoning: PASS (`isValidActivityRecord(incoming(), userId, activityId)` wraps `allow update` + `affectedKeys().hasOnly(...)`).
  - Resource Poisoning: PASS (`points.size() <= 1800`, `splits.size() <= 500`, `interruptions.size() <= 100`, all strings bounded).
