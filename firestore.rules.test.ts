/**
 * Phase 0 Payload-First Security TDD specification for Firestore rules.
 * Verifies the "Dirty Dozen" adversarial payloads must receive PERMISSION_DENIED.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const dirtyDozenSecurityCases: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow field injection on shop creation',
    collectionPath: 'shops/shop_1',
    operation: 'create',
    auth: { uid: 'owner1', email: 'owner1@example.com', email_verified: true },
    payload: {
      ownerId: 'owner1',
      name: 'Malalane Grill',
      category: 'food',
      town: 'Malalane',
      address: '14 Impala Street',
      contactPhone: '0137901234',
      description: 'Flame-grilled chicken and kotas.',
      deliveryFee: 25,
      etaMinutes: '25-35 min',
      isOpen: true,
      imageUrl: '/src/assets/images/cat_nkomazi_food.jpg',
      isVerified: true, // shadow field
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Owner spoofing on shop creation',
    collectionPath: 'shops/shop_2',
    operation: 'create',
    auth: { uid: 'attacker', email: 'attacker@example.com', email_verified: true },
    payload: {
      ownerId: 'victim_uid',
      name: 'Fake Tech',
      category: 'iphones',
      town: 'Tonga',
      address: 'Tonga Mall',
      contactPhone: '0720000000',
      description: 'iPhones and accessories.',
      deliveryFee: 50,
      etaMinutes: '45 min',
      isOpen: true,
      imageUrl: '/src/assets/images/cat_nkomazi_iphones.jpg',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified admin email spoof',
    collectionPath: 'shops/shop_3',
    operation: 'delete',
    auth: { uid: 'spoof', email: 'sandilesabelosibiya076@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Path ID poisoning with oversized/invalid characters',
    collectionPath: `shops/${'x'.repeat(200)}`,
    operation: 'create',
    auth: { uid: 'owner1', email: 'owner1@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphaned product creation under non-existent shop',
    collectionPath: 'shops/missing_shop_999/products/prod_1',
    operation: 'create',
    auth: { uid: 'owner1', email: 'owner1@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Self-assigned admin role in user profile',
    collectionPath: 'users/user1',
    operation: 'create',
    auth: { uid: 'user1', email: 'user1@example.com', email_verified: true },
    payload: {
      uid: 'user1',
      email: 'user1@example.com',
      displayName: 'Test User',
      role: 'admin',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Blanket PII list on users collection',
    collectionPath: 'users',
    operation: 'list',
    auth: { uid: 'user1', email: 'user1@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Customer shortcutting order status directly to delivered',
    collectionPath: 'orders/ord_1',
    operation: 'update',
    auth: { uid: 'customer1', email: 'cust@example.com', email_verified: true },
    payload: { status: 'delivered' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Re-opening a delivered terminal order',
    collectionPath: 'orders/ord_delivered',
    operation: 'update',
    auth: { uid: 'owner1', email: 'owner1@example.com', email_verified: true },
    payload: { status: 'pending' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Order array overflow (>25 items)',
    collectionPath: 'orders/ord_overflow',
    operation: 'create',
    auth: { uid: 'customer1', email: 'cust@example.com', email_verified: true },
    payload: { items: Array.from({ length: 30 }, (_, i) => ({ id: i })) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Client timestamp forgery on order create',
    collectionPath: 'orders/ord_time',
    operation: 'create',
    auth: { uid: 'customer1', email: 'cust@example.com', email_verified: true },
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthorized notification tampering by third party',
    collectionPath: 'notifications/notif_1',
    operation: 'update',
    auth: { uid: 'attacker', email: 'attacker@example.com', email_verified: true },
    payload: { emailSent: true },
    expected: 'PERMISSION_DENIED',
  },
];
