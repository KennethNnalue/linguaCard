# Epic: Social Sharing (LC-SH)

## Overview

Allow users to share collections and stories with other users via email. Recipients get in-app + push notifications and can accept (one-time copy) or reject. Optional "stay synced" mode propagates sender edits to opted-in receivers. Sender/receiver deletes are independent — deleting a shared resource does not affect the other party.

Secondary: replace `ion-alert` context menus on collection-detail and story pages with `ion-action-sheet`, adding "Share" as a new option.

---

## Domain Model Additions

Add to `libs/shared/domain/src/index.ts`:

```typescript
// ─── SOCIAL SHARING ─────────────────────────────────────────────────────────

export type ShareResourceType = 'collection' | 'story';
export type ShareStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type ShareSyncMode = 'copy' | 'sync';

export interface ShareRecord {
  id: string;
  senderUserId: string;
  senderName: string;
  senderEmail: string;
  recipientUserId: string;
  recipientEmail: string;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  resourceEmoji: string | null;
  syncMode: ShareSyncMode;
  status: ShareStatus;
  clonedResourceId: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface CreateShareDto {
  recipientEmail: string;
  resourceType: ShareResourceType;
  resourceId: string;
  syncMode: ShareSyncMode;
}

export interface RespondToShareDto {
  accept: boolean;
}

export interface ShareNotification {
  id: string;
  senderName: string;
  resourceType: ShareResourceType;
  resourceName: string;
  resourceEmoji: string | null;
  syncMode: ShareSyncMode;
  createdAt: string;
}

export interface ShareNotificationList {
  pending: ShareNotification[];
  total: number;
}
```

---

## API Endpoints

| Method | Route | Body / Params | Response | Auth |
|--------|-------|---------------|----------|------|
| `POST` | `/api/v1/shares` | `CreateShareDto` | `ShareRecord` | Yes |
| `GET` | `/api/v1/shares/pending` | — | `ShareNotificationList` | Yes |
| `GET` | `/api/v1/shares/pending/count` | — | `{ count: number }` | Yes |
| `POST` | `/api/v1/shares/:id/respond` | `RespondToShareDto` | `ShareRecord` | Yes |
| `GET` | `/api/v1/shares/sent` | — | `ShareRecord[]` | Yes |
| `DELETE` | `/api/v1/shares/:id` | — | `void` | Yes (sender only) |

---

## Database Schema

### Table: `shares`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `sender_user_id` | `varchar` FK → `users.id` | CASCADE |
| `sender_name` | `varchar` | Denormalized |
| `sender_email` | `varchar` | Denormalized |
| `recipient_user_id` | `varchar` FK → `users.id` | CASCADE; nullable if recipient unregistered |
| `recipient_email` | `varchar` | Lookup key |
| `resource_type` | `varchar(20)` | `'collection'` or `'story'` |
| `resource_id` | `varchar` | Source collection/story ID |
| `resource_name` | `varchar` | Denormalized |
| `resource_emoji` | `varchar` nullable | |
| `sync_mode` | `varchar(10)` | `'copy'` or `'sync'` |
| `status` | `varchar(10)` | `'pending'`, `'accepted'`, `'rejected'`, `'expired'` |
| `cloned_resource_id` | `varchar` nullable | Set on accept |
| `created_at` | `timestamptz` | |
| `responded_at` | `timestamptz` nullable | |

Indexes: `(recipient_user_id, status)`, `(sender_user_id)`

### Table: `share_sync_links` (Phase 5)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `share_id` | `varchar` FK → `shares.id` | CASCADE |
| `source_resource_id` | `varchar` | Sender's resource |
| `target_resource_id` | `varchar` | Recipient's cloned resource |
| `resource_type` | `varchar(20)` | |
| `is_active` | `boolean` | Recipient can unsync |

---

## Tickets

### Phase 1: Backend Foundation

#### LC-SH-01: Create ShareEntity and shares module scaffold
- Create `apps/api/src/shares/` module with entity, service, controller, module
- Entity maps to `shares` table; follows existing TypeORM patterns
- **Files:** `apps/api/src/shares/share.entity.ts`, `shares.module.ts`, `shares.service.ts`, `shares.controller.ts`
- **AC:** Entity compiles, module registers in AppModule, migration creates table

#### LC-SH-02: Add sharing domain types to shared/domain
- Add all types from Domain Model Additions section above
- **Files:** `libs/shared/domain/src/index.ts`
- **AC:** Types compile, exported from barrel

#### LC-SH-03: Implement POST /shares (create share)
- Look up recipient by email in `users` table → 404 if not found
- Validate sender owns the resource → 403 if not
- Prevent self-sharing → 400
- Create share record with `status: 'pending'`
- Send push notification via `PushService.sendToUser()`
- **Files:** `apps/api/src/shares/shares.service.ts`, `shares.controller.ts`
- **AC:** Record persisted, push sent, proper error codes

#### LC-SH-04: Implement GET /shares/pending and /shares/pending/count
- Return pending shares for authenticated user (as recipient)
- Count endpoint returns `{ count }` for badge polling
- **Files:** `apps/api/src/shares/shares.service.ts`, `shares.controller.ts`
- **AC:** Only `status='pending'` returned, ordered by `createdAt DESC`

#### LC-SH-05: Implement POST /shares/:id/respond (accept/reject)
- Accept: clone resource using adopt pattern from `PlatformCollectionsService` / `PlatformStoriesService`
  - Collection: deep-copy collection + all cards (with SRS states reset to new)
  - Story: copy story entity with all content
- Set `clonedResourceId` on share record
- Reject: set `status='rejected'`
- Idempotent on repeated calls
- **Files:** `apps/api/src/shares/shares.service.ts`
- **AC:** Accept creates full copy, reject marks rejected, idempotent

#### LC-SH-06: Implement GET /shares/sent and DELETE /shares/:id
- Sender views outgoing shares and cancels pending ones
- **Files:** `apps/api/src/shares/shares.service.ts`, `shares.controller.ts`
- **AC:** Only sender's shares returned, delete only works on `pending`

### Phase 2: Context Menus

#### LC-SH-07: Replace collection-detail alert with ion-action-sheet
- Replace `alertCtrl.create()` in `showMenu()` with `ActionSheetController.create()`
- Buttons: "Share", "Clear All Words" (if cards > 0), "Delete Collection", "Cancel"
- Existing `confirmClearWords()` and `confirmDelete()` flows unchanged
- **Files:** `apps/mobile/src/app/features/vault/pages/collection-detail/collection-detail.page.ts`
- **AC:** Bottom action sheet, all existing actions work, "Share" present (wired in LC-SH-12)

#### LC-SH-08: Replace story-reader/story-library menu with ion-action-sheet
- Identify existing delete alert in stories feature and replace with action sheet
- Buttons: "Share", "Delete Story", "Cancel"
- **Files:** `apps/mobile/src/app/features/stories/pages/story-reader/story-reader.page.ts` (or wherever the current menu is)
- **AC:** Action sheet with share and delete options

### Phase 3: Share Flow (Frontend)

#### LC-SH-09: Create ShareApiService
- Standard API service following project patterns
- Methods: `createShare()`, `getPendingShares()`, `getPendingCount()`, `respondToShare()`, `getSentShares()`, `cancelShare()`
- **Files:** `apps/mobile/src/app/features/sharing/services/share-api.service.ts`
- **AC:** Typed methods, return `Observable<T>`, use `environment.apiUrl`

#### LC-SH-10: Create ShareStore (signalStore)
- State: `pendingShares`, `sentShares`, `pendingCount`, `isLoading`
- Methods: `loadPending()`, `loadSent()`, `refreshCount()`, `acceptShare()`, `rejectShare()`, `createShare()`
- Poll count on init and after each action
- **Files:** `apps/mobile/src/app/features/sharing/store/share.store.ts`
- **AC:** `signalStore()` pattern, `providedIn: 'root'`, `pendingCount` signal for badge

#### LC-SH-11: Create share-sheet component
- Bottom sheet modal with email input field
- Toggle for "Stay synced" (default off)
- Calls `ShareStore.createShare()`
- Success/error toasts, email validation
- All strings via i18n
- **Files:** `apps/mobile/src/app/features/sharing/components/share-sheet/share-sheet.component.ts`, `.html`, `.scss`
- **AC:** Sheet opens, validates email, sync toggle, success/error toasts

#### LC-SH-12: Wire share-sheet to collection-detail and story-reader
- "Share" button in action sheets presents share-sheet modal with correct `resourceType` and `resourceId`
- **Files:** collection-detail.page.ts, story-reader.page.ts
- **AC:** Tapping "Share" opens share sheet, successful share shows toast

### Phase 4: Notifications

#### LC-SH-13: Create notifications page
- New page at `/notifications`
- Lists pending share notifications with sender name, resource type icon, resource name
- Accept/Reject buttons per item
- Empty state when no pending shares
- **Files:** `apps/mobile/src/app/features/sharing/pages/notifications/notifications.page.ts`, `.html`, `.scss`
- **AC:** Lists pending shares, accept clones + toast, reject dismisses with confirmation

#### LC-SH-14: Add notification badge to navigation
- Display `ShareStore.pendingCount()` as badge on Home tab or header bell icon
- Hide when count is 0
- Poll every 60s and on app resume
- Tap navigates to `/notifications`
- **Files:** `apps/mobile/src/app/app.component.ts` or relevant tab/header component
- **AC:** Badge shows correct count, navigates to notifications, hides at 0

#### LC-SH-15: Push notification payload for shares
- Push payload routes to `/notifications` on tap
- Body: "[Name] shared a [collection/story] with you"
- **Files:** `apps/api/src/shares/shares.service.ts`
- **AC:** Background push arrives, tap opens app at `/notifications`

#### LC-SH-16: Add sharing i18n keys to all 6 bundles
- Keys under `sharing.*` namespace
- All strings from share sheet, notifications page, toasts, action sheet items, badge, empty states
- **Files:** `apps/mobile/src/assets/i18n/{en,es,tr,uk,ru,ar}.json`
- **AC:** All 6 bundles have identical key sets, no hardcoded English

#### LC-SH-17: Add sharing routes and lazy-load
- Routes for `/notifications` and sharing feature
- Lazy-loaded following existing patterns
- **Files:** `apps/mobile/src/app/features/sharing/sharing.routes.ts`, `apps/mobile/src/app/app.routes.ts`
- **AC:** Routes registered, pages lazy-loaded

### Phase 5: Sync Mode

#### LC-SH-18: Create share_sync_links table and entity
- Entity for tracking active sync relationships
- Created when `syncMode='sync'` share is accepted
- **Files:** `apps/api/src/shares/share-sync-link.entity.ts`
- **AC:** Entity and migration, link created on sync-mode accept

#### LC-SH-19: Implement collection sync propagation
- When sender adds/removes/edits cards in synced collection → propagate to all active sync targets
- Sender deleting collection deactivates sync link, does NOT delete recipient's collection
- **Files:** `apps/api/src/shares/share-sync.service.ts`, `apps/api/src/cards/cards.service.ts`, `apps/api/src/collections/collections.service.ts`
- **AC:** Card changes propagate, sender delete deactivates link only

#### LC-SH-20: Implement story sync propagation
- Sender story edits (body, sentences, keywords, quiz) → propagate to sync targets
- Sender delete deactivates link, does not cascade
- **Files:** `apps/api/src/shares/share-sync.service.ts`, `apps/api/src/stories/stories.service.ts`
- **AC:** Story edits propagated, delete does not cascade

#### LC-SH-21: Unsync action for recipients
- "Unsync" option in context menu for synced received resources
- Calls API to deactivate sync link
- Resource stays but stops receiving updates
- **Files:** collection-detail.page.ts, story-reader.page.ts, shares.controller.ts
- **AC:** Unsync visible only for synced resources, changes stop after unsync

---

## Dependency Graph

```
LC-SH-01 ─┬─ LC-SH-03 ── LC-SH-04 ── LC-SH-05 ── LC-SH-06
           │       │                        │
LC-SH-02 ─┘       │                        │
                   │                        │
LC-SH-07 ─────────┤                        │
LC-SH-08 ─────────┤                        │
                   │                        │
              LC-SH-09 ── LC-SH-10 ────────┤
                   │                        │
              LC-SH-11 ── LC-SH-12         │
                                       LC-SH-13 ── LC-SH-14
                                            │
                                       LC-SH-15
                                       LC-SH-17

LC-SH-16 (parallel with any phase)

LC-SH-18 ── LC-SH-19 ── LC-SH-20 ── LC-SH-21
```

## Phase Summary

| Phase | Tickets | Can start after |
|-------|---------|-----------------|
| **1: Backend Foundation** | LC-SH-01 → LC-SH-06 | Immediately |
| **2: Context Menus** | LC-SH-07, LC-SH-08 | Immediately (no backend dep) |
| **3: Share Flow** | LC-SH-09 → LC-SH-12 | Phase 1 + Phase 2 |
| **4: Notifications** | LC-SH-13 → LC-SH-17 | Phase 1 (LC-SH-05) + Phase 3 (LC-SH-10) |
| **5: Sync** | LC-SH-18 → LC-SH-21 | Phase 4 complete |

## Key Design Decisions

1. **Reuse adopt pattern** — Accept-share clones resources using the same deep-copy logic as `PlatformCollectionsService.adopt()` and `PlatformStoriesService.adopt()`.
2. **Email lookup** — Recipient resolved at creation time via email on `users` table. 404 if not registered (no invite flow in v1).
3. **Push reuse** — `PushService.sendToUser()` handles delivery. Same payload shape with `data.url` → `/notifications`.
4. **Non-destructive** — Sender/receiver deletes are independent. Sync links deactivate on source deletion but never cascade.
5. **Feature-first** — All sharing code under `features/sharing/` with own store, services, components, pages.
6. **Action sheets** — `ActionSheetController` replaces `AlertController` for context menus (idiomatic Ionic).
