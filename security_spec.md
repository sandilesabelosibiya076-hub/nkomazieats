# Security Specification — Nkomazi Eats

## 1. Data Invariants
1. **Local Nkomazi Scope**: Every shop and delivery destination must belong to the allowlisted towns inside Nkomazi Local Municipality and one of the 3 supported categories (`food`, `iphones`, `electronics`).
2. **Owner-Bound Catalogs**: A `Product` inside `/shops/{shopId}/products/{productId}` cannot be created, modified, or deleted unless `/shops/{shopId}` exists and `ownerId` matches `request.auth.uid` (or an explicit verified Admin).
3. **Zero-Trust Identity & Email Verification**: All write operations require an authenticated user (`request.auth != null`) with `request.auth.token.email_verified == true`. No user can spoof another user's `ownerId`, `customerId`, or `uid`.
4. **PII Isolation**: User profiles (`/users/{userId}`), orders (`/orders/{orderId}`), and email notifications (`/notifications/{notificationId}`) are strictly scoped to the owning customer, the fulfilling shop owner (for orders), or verified admins. Blanket listing is forbidden.
5. **Immutable Audit & Terminal State Locking**: Once an order reaches `delivered` or `cancelled`, non-admin transitions are rejected. Notifications are append-only and cannot be altered or deleted.
6. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time`; `createdAt` and `ownerId`/`customerId`/`shopId` are immutable after creation.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on Shop**: Creating a shop with an unexpected `isFeatured: true` or `isVerified: true` field -> rejected by `hasOnly(...)`.
2. **Owner Spoofing on Shop Create**: User A tries creating a shop with `ownerId: "userB"` -> rejected by `incoming().ownerId == request.auth.uid`.
3. **Unverified Email Spoof**: User with `email: "sandilesabelosibiya076@gmail.com"` and `email_verified: false` tries admin mutation -> rejected by `email_verified == true`.
4. **Path ID Poisoning**: Creating a document at `/shops/${'a'.repeat(300)}` or `/shops/invalid$id` -> rejected by `isValidId(shopId)`.
5. **Orphaned Product Creation**: Creating a product under `/shops/nonexistent_shop/products/p1` -> rejected by `exists(/databases/$(database)/documents/shops/$(shopId))`.
6. **Privilege Escalation on User Profile**: User sets `role: "admin"` on `/users/{uid}` -> rejected by `role in ['customer', 'owner']`.
7. **PII Read Scrape**: User A attempts `list` on `/users` or `get` on `/users/userB` -> rejected (`allow list: if false` and `uid == userId`).
8. **Order Status Shortcutting / Self-Delivery**: Customer updates their own order status from `pending` to `delivered` -> rejected (customer can only transition `pending -> cancelled`).
9. **Terminal State Re-opening**: Shop owner updates an already `delivered` order back to `pending` -> rejected by terminal state lock.
10. **Order Items Flood**: Creating an order with 50 items or non-map array element -> rejected by `items.size() <= 25 && items[0] is map`.
11. **Client Timestamp Forgery**: Creating an order with a backdated client `createdAt` timestamp -> rejected by `incoming().createdAt == request.time`.
12. **Cross-User Notification Tampering**: Random User C creates or updates a notification targeting User A -> rejected (only customer or the order's `shopOwnerId` can create, and nobody can update/delete).
