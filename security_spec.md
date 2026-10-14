# Firestore Security Specification

## 1. Data Invariants
- **Global Data Integrity:** The `global_data` document contains critical staff and records. Only authenticated users can write, but they must provide a valid `updatedAt` and `lastUpdatedBy`.
- **Outlet Isolation:** Data for specific outlets (dashboards) is stored in the `dashboards` collection. Verified users can update this data.
- **Identity Integrity:**
  - `presence` records MUST match the `request.auth.uid`.
  - `chat_messages` MUST match the sender's email from the auth token.
- **Temporal Integrity:** All `updatedAt` or `timestamp` (server-side) fields MUST match `request.time`.
- **Size Constraints:** All string fields have strict size limits to prevent resource exhaustion attacks.

## 2. The Dirty Dozen Payloads (Rejection Tests)

### Payload 1: Identity Spoofing (Presence)
**Target:** `/presence/somebody-else-uid`
**Data:** `{ "uid": "my-uid", "email": "spoof@hack.com", "lastSeen": "...", "timestamp": "request.time", "outlet": "..." }`
**Reason:** User attempting to update someone else's presence.

### Payload 2: Admin Privilege Escalation
**Target:** `/admins/my-uid`
**Data:** `{ "uid": "my-uid", "email": "me@hack.com" }`
**Reason:** Regular user attempting to make themselves an admin.

### Payload 3: Field Injection (Dashboard)
**Target:** `/dashboards/SH_CIPETE`
**Data:** `{ "monthlyData": {}, "updatedAt": "request.time", "lastUpdatedBy": "me@hack.com", "isVerified": true }`
**Reason:** Injecting a `isVerified` field not in the schema.

### Payload 4: Invalid ID Poisoning
**Target:** `/dashboards/invalid%20id%20with%20huge%20size%20.....................`
**Data:** `{ ...valid data... }`
**Reason:** Document ID exceeds size or contains invalid characters.

### Payload 5: Chat Email Spoofing
**Target:** `/chat_messages/msg1`
**Data:** `{ "text": "Hacked!", "senderEmail": "admin@barn.com", "senderName": "Admin", "timestamp": "...", "serverTime": "request.time", "outlet": "..." }`
**Reason:** User trying to send a message as an admin.

### Payload 6: Resource Exhaustion (Huge Message)
**Target:** `/chat_messages/msg1`
**Data:** `{ "text": "A".repeat(10001), ... }`
**Reason:** Message text exceeds 1024 characters.

### Payload 7: Orphaned Global Update
**Target:** `/system_data/global_data`
**Data:** `{ "staffList": [], "lastUpdatedBy": "hacker@hack.com" }`
**Reason:** Missing `updatedAt` field.

### Payload 8: Future Timestamp Attack
**Target:** `/notifications/notif1`
**Data:** `{ "user": "...", "outlet": "...", "message": "...", "timestamp": "2099-01-01T00:00:00Z" }`
**Reason:** Providing a client-side future timestamp instead of `serverTimestamp()`.

### Payload 9: Anonymous Write
**Target:** `/dashboards/SH_CIPETE`
**Context:** No auth token.
**Reason:** Writing to dashboards without signing in.

### Payload 10: Status Override (Legacy Check)
**Target:** `/dashboards/SH_CIPETE`
**Data:** `{ "monthlyData": { "0": { "status": "LOCKED" } }, ... }`
**Reason:** Overriding a terminal or locked state (if implemented in logic).

### Payload 11: PII Leak Attempt
**Target:** `/presence/somebody-uid` (GET request)
**Reason:** Unauthorized user trying to read private user information (if restricted).

### Payload 12: Junk Key Injection
**Target:** `/system_data/global_data`
**Data:** `{ "updatedAt": "request.time", "lastUpdatedBy": "...", "maliciousKey": "payload" }`
**Reason:** Injecting keys not defined in the `GlobalSystemData` schema.

## 3. Test Runner Concept
The `firestore.rules.test.ts` file will use `@firebase/rules-unit-testing` to verify these payloads are blocked.
(Note: Actual test execution is simulated via code review and linting in this environment).
