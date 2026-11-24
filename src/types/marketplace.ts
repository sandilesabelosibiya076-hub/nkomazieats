export const NKOMAZI_TOWNS = [
  'Malalane',
  'Komatipoort',
  'Tonga',
  'Kamaqhekeza',
  'Naas',
  'Hectorspruit',
  'Schoemansdal',
  'Matsamo',
  'Buffelspruit',
  'Driekoppies',
  'Sibange',
  'Jeppes Reef',
] as const;

export type NkomaziTown = (typeof NKOMAZI_TOWNS)[number];

export type ShopCategory = 'food' | 'iphones' | 'electronics';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface Shop {
  id: string;
  ownerId: string;
  name: string;
  category: ShopCategory;
  town: NkomaziTown;
  address: string;
  contactPhone: string;
  whatsappPhone?: string;
  openingHours?: string;
  description: string;
  deliveryFee: number;
  etaMinutes: string;
  isOpen: boolean;
  imageUrl: string;
  latitude?: number;
  longitude?: number;
  isDirectorySeed?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface Product {
  id: string;
  shopId: string;
  ownerId: string;
  name: string;
  category: ShopCategory;
  price: number;
  description: string;
  specs?: string;
  inStock: boolean;
  imageUrl: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CartItem {
  product: Product;
  shop: Shop;
  quantity: number;
}

export interface OrderItemSummary {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  specs?: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryTown: NkomaziTown;
  deliveryAddress: string;
  shopId: string;
  shopName: string;
  shopOwnerId: string;
  items: OrderItemSummary[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  paymentMethod: 'cash_on_delivery' | 'eft_on_delivery';
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EmailNotification {
  id: string;
  userId: string;
  recipientEmail: string;
  orderId: string;
  shopName: string;
  status: OrderStatus;
  subject: string;
  message: string;
  deliveryChannel: 'smtp' | 'resend' | 'in_app';
  emailSent: boolean;
  createdAt?: unknown;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'customer' | 'owner';
  phone?: string;
  defaultTown?: string;
  defaultAddress?: string;
}

export interface Conversation {
  id: string;
  shopId: string;
  shopName: string;
  shopOwnerId: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  lastOrderId?: string;
  lastMessage: string;
  lastSenderRole: 'customer' | 'owner';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  customerId: string;
  shopOwnerId: string;
  senderId: string;
  senderName: string;
  senderRole: 'customer' | 'owner';
  text: string;
  orderId?: string;
  createdAt?: unknown;
}

export const CATEGORY_LABELS: Record<ShopCategory, string> = {
  food: 'Food & Takeaways',
  iphones: 'iPhones',
  electronics: 'Electronics',
};

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; step: number; hint: string }
> = {
  pending: {
    label: 'Pending',
    step: 1,
    hint: 'Sent to shop — awaiting confirmation',
  },
  confirmed: {
    label: 'Confirmed',
    step: 2,
    hint: 'Shop accepted your order',
  },
  preparing: {
    label: 'Preparing',
    step: 3,
    hint: 'Being freshly prepared or packed',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    step: 4,
    hint: 'On the way to your Nkomazi address',
  },
  delivered: {
    label: 'Delivered',
    step: 5,
    hint: 'Completed and delivered',
  },
  cancelled: {
    label: 'Cancelled',
    step: 0,
    hint: 'Order cancelled',
  },
};
