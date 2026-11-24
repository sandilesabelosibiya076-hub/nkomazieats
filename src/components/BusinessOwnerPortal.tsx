import { useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Plus, Store, Trash2, Upload, CheckCircle2, PackageCheck, MapPin, MessageSquare, Pencil, X, Clock } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CATEGORY_LABELS,
  NKOMAZI_TOWNS,
  NkomaziTown,
  ORDER_STATUS_META,
  Order,
  OrderStatus,
  Product,
  Shop,
  ShopCategory,
} from '../types/marketplace';
import {
  ELECTRONICS_IMAGE,
  FOOD_IMAGE,
  IPHONE_IMAGE,
  SEED_NKOMAZI_PRODUCTS,
  SEED_NKOMAZI_SHOPS,
} from '../data/seedShops';
import { compressImageFile } from '../utils/imageUpload';
import { NKOMAZI_TOWN_COORDS } from '../utils/geo';
import { dispatchOrderStatusEmail } from '../utils/notifications';
import { playOrderStatusEffectSound } from '../utils/sounds';
import { ResilientImage } from './ResilientImage';

interface BusinessOwnerPortalProps {
  user: User | null;
  ownedShops: Shop[];
  allProductsByShop: Record<string, Product[]>;
  incomingOrders: Order[];
  onNeedAuth: () => void;
  onMessageCustomer: (order: Order) => void;
  onOpenMessages?: () => void;
  messageCount?: number;
}

const DEFAULT_CATEGORY_IMAGES: Record<ShopCategory, string> = {
  food: FOOD_IMAGE,
  iphones: IPHONE_IMAGE,
  electronics: ELECTRONICS_IMAGE,
};

function parseOpeningHours(hours?: string): { open: string; close: string } {
  const match = (hours || '').match(/(\d{1,2}:\d{2})\s*[-–to]+\s*(\d{1,2}:\d{2})/i);
  if (match) {
    const pad = (t: string) => {
      const [h, m] = t.split(':');
      return `${h.padStart(2, '0')}:${m}`;
    };
    return { open: pad(match[1]), close: pad(match[2]) };
  }
  return { open: '08:00', close: '19:00' };
}

export function BusinessOwnerPortal({
  user,
  ownedShops,
  allProductsByShop,
  incomingOrders,
  onNeedAuth,
  onMessageCustomer,
  onOpenMessages,
  messageCount = 0,
}: BusinessOwnerPortalProps) {
  const [portalTab, setPortalTab] = useState<'shops' | 'add_shop' | 'orders'>(
    ownedShops.length > 0 ? 'shops' : 'add_shop'
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add Shop Form
  const [shopName, setShopName] = useState('');
  const [shopCategory, setShopCategory] = useState<ShopCategory>('food');
  const [shopTown, setShopTown] = useState<NkomaziTown>('Malalane');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopOpenTime, setShopOpenTime] = useState('08:00');
  const [shopCloseTime, setShopCloseTime] = useState('19:00');
  const [shopFee, setShopFee] = useState('25');
  const [shopEta, setShopEta] = useState('25-40 min');
  const [shopDesc, setShopDesc] = useState('');
  const [shopImage, setShopImage] = useState('');
  const [pinnedCoords, setPinnedCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Edit Existing Shop Form
  const [editingShopId, setEditingShopId] = useState<string | null>(null);
  const [editShopName, setEditShopName] = useState('');
  const [editShopCategory, setEditShopCategory] = useState<ShopCategory>('food');
  const [editShopTown, setEditShopTown] = useState<NkomaziTown>('Malalane');
  const [editShopAddress, setEditShopAddress] = useState('');
  const [editShopPhone, setEditShopPhone] = useState('');
  const [editShopOpenTime, setEditShopOpenTime] = useState('08:00');
  const [editShopCloseTime, setEditShopCloseTime] = useState('19:00');
  const [editShopFee, setEditShopFee] = useState('25');
  const [editShopEta, setEditShopEta] = useState('25-40 min');
  const [editShopDesc, setEditShopDesc] = useState('');
  const [editShopIsOpen, setEditShopIsOpen] = useState(true);
  const [editShopImage, setEditShopImage] = useState('');
  const [editPinnedCoords, setEditPinnedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [savingShopEdit, setSavingShopEdit] = useState(false);

  // Add Product Form (inside selected shop)
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodSpecs, setProdSpecs] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodImage, setProdImage] = useState('');

  // Edit Existing Product Form
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editSpecs, setEditSpecs] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState<ShopCategory>('food');
  const [editInStock, setEditInStock] = useState(true);
  const [editImage, setEditImage] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  if (fatalError) {
    throw fatalError;
  }

  const isAdminUser =
    Boolean(user?.emailVerified) &&
    user?.email?.toLowerCase() === 'sandilesabelosibiya076@gmail.com';

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 space-y-4">
          <Store className="w-8 h-8 text-[#D94E1F] mx-auto" />
          <h1 className="font-display text-2xl font-bold text-[#141413]">
            List Your Nkomazi Business
          </h1>
          <p className="text-sm text-stone-600">
            Sign in with your email or Google account to upload your Nkomazi shop, add food, iPhones, or electronics, and manage customer orders.
          </p>
          <button
            type="button"
            onClick={onNeedAuth}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#D94E1F] text-white text-sm font-semibold hover:bg-[#BF4117] cursor-pointer"
          >
            Sign In to List Business
          </button>
        </div>
      </div>
    );
  }

  async function handleShopImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const dataUrl = await compressImageFile(file);
      setShopImage(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not process image.');
    }
  }

  async function handleProductImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const dataUrl = await compressImageFile(file);
      setProdImage(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not process image.');
    }
  }

  async function handleCreateShop(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!user.emailVerified) {
      setErrorMsg('Please verify your email in the Account tab before publishing a business.');
      return;
    }

    setErrorMsg(null);
    setNotice(null);
    setSaving(true);

    const shopId = `shop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const path = `shops/${shopId}`;

    try {
      const feeNum = Math.min(500, Math.max(0, Number(shopFee) || 0));
      const townCoords = NKOMAZI_TOWN_COORDS[shopTown];
      const lat = pinnedCoords?.lat ?? townCoords.lat;
      const lng = pinnedCoords?.lng ?? townCoords.lng;

      await setDoc(doc(db, 'shops', shopId), {
        ownerId: user.uid,
        name: shopName.trim().slice(0, 80),
        category: shopCategory,
        town: shopTown,
        address: shopAddress.trim().slice(0, 160),
        contactPhone: shopPhone.trim().slice(0, 24),
        openingHours: `${shopOpenTime || '08:00'} - ${shopCloseTime || '19:00'}`.slice(0, 60),
        description: shopDesc.trim().slice(0, 400),
        deliveryFee: feeNum,
        etaMinutes: shopEta.trim().slice(0, 30) || '30-45 min',
        isOpen: true,
        imageUrl: shopImage || DEFAULT_CATEGORY_IMAGES[shopCategory],
        latitude: lat,
        longitude: lng,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setShopName('');
      setShopAddress('');
      setShopPhone('');
      setShopDesc('');
      setShopImage('');
      setPinnedCoords(null);
      setSelectedShopId(shopId);
      setPortalTab('shops');
      setNotice('Your Nkomazi business is now live! Add products to your shop below.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddProduct(e: React.FormEvent, shop: Shop) {
    e.preventDefault();
    if (!user || !user.emailVerified) {
      setErrorMsg('Please verify your email first.');
      return;
    }

    setErrorMsg(null);
    setNotice(null);
    setSaving(true);

    const productId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const path = `shops/${shop.id}/products/${productId}`;

    try {
      const priceNum = Math.min(250000, Math.max(1, Number(prodPrice) || 1));
      const payload: Record<string, unknown> = {
        shopId: shop.id,
        ownerId: shop.ownerId,
        name: prodName.trim().slice(0, 100),
        category: shop.category,
        price: priceNum,
        description: prodDesc.trim().slice(0, 320),
        inStock: true,
        imageUrl: prodImage || DEFAULT_CATEGORY_IMAGES[shop.category],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (prodSpecs.trim().length > 0) {
        payload.specs = prodSpecs.trim().slice(0, 120);
      }

      await setDoc(doc(collection(db, 'shops', shop.id, 'products'), productId), payload);
      setProdName('');
      setProdPrice('');
      setProdSpecs('');
      setProdDesc('');
      setProdImage('');
      setNotice(`Added "${prodName.trim()}" to ${shop.name}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleShopOpen(shop: Shop) {
    if (!user?.emailVerified) return;
    const path = `shops/${shop.id}`;
    const nextOpen = !shop.isOpen;
    try {
      await updateDoc(doc(db, 'shops', shop.id), {
        isOpen: nextOpen,
        updatedAt: serverTimestamp(),
      });
      if (editingShopId === shop.id) {
        setEditShopIsOpen(nextOpen);
      }
      setNotice(`"${shop.name}" is now marked as ${nextOpen ? 'Open' : 'Closed'}.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, path);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  }

  function startEditingShop(shop: Shop) {
    setErrorMsg(null);
    setNotice(null);
    const parsed = parseOpeningHours(shop.openingHours);
    setEditingShopId(shop.id);
    setEditShopName(shop.name);
    setEditShopCategory(shop.category);
    setEditShopTown(shop.town);
    setEditShopAddress(shop.address);
    setEditShopPhone(shop.contactPhone);
    setEditShopOpenTime(parsed.open);
    setEditShopCloseTime(parsed.close);
    setEditShopFee(String(shop.deliveryFee));
    setEditShopEta(shop.etaMinutes);
    setEditShopDesc(shop.description);
    setEditShopIsOpen(shop.isOpen);
    setEditShopImage(shop.imageUrl);
    setEditPinnedCoords(
      typeof shop.latitude === 'number' && typeof shop.longitude === 'number'
        ? { lat: shop.latitude, lng: shop.longitude }
        : null
    );
  }

  async function handleEditShopImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const dataUrl = await compressImageFile(file);
      setEditShopImage(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not process image.');
    }
  }

  async function handleSaveShopEdit(e: React.FormEvent, shop: Shop) {
    e.preventDefault();
    if (!user) return;
    if (!user.emailVerified) {
      setErrorMsg('Please verify your email first before updating your shop.');
      return;
    }

    const cleanName = editShopName.trim().slice(0, 80);
    const cleanAddress = editShopAddress.trim().slice(0, 160);
    const cleanPhone = editShopPhone.trim().slice(0, 24);
    const cleanDesc = editShopDesc.trim().slice(0, 400);
    const cleanEta = editShopEta.trim().slice(0, 30) || '30-45 min';
    const feeNum = Math.min(500, Math.max(0, Number(editShopFee) || 0));
    const formattedHours = `${editShopOpenTime || '08:00'} - ${editShopCloseTime || '19:00'}`.slice(0, 60);

    if (cleanName.length < 2 || cleanAddress.length < 4 || cleanPhone.length < 7 || cleanDesc.length < 10) {
      setErrorMsg('Please enter valid business name, address, phone number, and description (min 10 chars).');
      return;
    }

    setErrorMsg(null);
    setNotice(null);
    setSavingShopEdit(true);
    const path = `shops/${shop.id}`;

    try {
      const townCoords = NKOMAZI_TOWN_COORDS[editShopTown];
      const lat = editPinnedCoords?.lat ?? townCoords.lat;
      const lng = editPinnedCoords?.lng ?? townCoords.lng;

      await updateDoc(doc(db, 'shops', shop.id), {
        name: cleanName,
        category: editShopCategory,
        town: editShopTown,
        address: cleanAddress,
        contactPhone: cleanPhone,
        openingHours: formattedHours,
        description: cleanDesc,
        deliveryFee: feeNum,
        etaMinutes: cleanEta,
        isOpen: editShopIsOpen,
        imageUrl: editShopImage || DEFAULT_CATEGORY_IMAGES[editShopCategory],
        latitude: lat,
        longitude: lng,
        updatedAt: serverTimestamp(),
      });
      setEditingShopId(null);
      setNotice(`Saved changes for "${cleanName}" (${editShopIsOpen ? 'Open' : 'Closed'} · ${formattedHours}).`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, path);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    } finally {
      setSavingShopEdit(false);
    }
  }

  function startEditingProduct(item: Product) {
    setErrorMsg(null);
    setNotice(null);
    setEditingProductId(item.id);
    setEditName(item.name);
    setEditPrice(String(item.price));
    setEditSpecs(item.specs || '');
    setEditDesc(item.description);
    setEditCategory(item.category);
    setEditInStock(item.inStock);
    setEditImage(item.imageUrl);
  }

  function cancelEditingProduct() {
    setEditingProductId(null);
  }

  async function handleEditProductImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const dataUrl = await compressImageFile(file);
      setEditImage(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not process image.');
    }
  }

  async function handleSaveProductEdit(e: React.FormEvent, shopId: string) {
    e.preventDefault();
    if (!user || !editingProductId) return;
    if (!user.emailVerified) {
      setErrorMsg('Please verify your email first before editing products.');
      return;
    }

    const cleanName = editName.trim().slice(0, 100);
    const cleanDesc = editDesc.trim().slice(0, 320);
    const cleanSpecs = editSpecs.trim().slice(0, 120);
    const priceNum = Math.min(250000, Math.max(1, Number(editPrice) || 1));

    if (cleanName.length < 2 || cleanDesc.length < 4) {
      setErrorMsg('Product name must be at least 2 characters and description at least 4 characters.');
      return;
    }

    setErrorMsg(null);
    setNotice(null);
    setSavingEdit(true);
    const path = `shops/${shopId}/products/${editingProductId}`;

    try {
      await updateDoc(doc(db, 'shops', shopId, 'products', editingProductId), {
        name: cleanName,
        category: editCategory,
        price: priceNum,
        specs: cleanSpecs,
        description: cleanDesc,
        inStock: editInStock,
        imageUrl: editImage || DEFAULT_CATEGORY_IMAGES[editCategory],
        updatedAt: serverTimestamp(),
      });
      setEditingProductId(null);
      setNotice(`Saved changes to "${cleanName}".`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, path);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleProductStock(shopId: string, item: Product) {
    if (!user?.emailVerified) {
      setErrorMsg('Please verify your email first.');
      return;
    }
    const path = `shops/${shopId}/products/${item.id}`;
    try {
      await updateDoc(doc(db, 'shops', shopId, 'products', item.id), {
        inStock: !item.inStock,
        updatedAt: serverTimestamp(),
      });
      setNotice(`"${item.name}" marked as ${!item.inStock ? 'In Stock' : 'Sold Out'}.`);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, path);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  }

  async function handleDeleteProduct(shopId: string, productId: string) {
    if (!user?.emailVerified) return;
    const path = `shops/${shopId}/products/${productId}`;
    try {
      await deleteDoc(doc(db, 'shops', shopId, 'products', productId));
      if (editingProductId === productId) {
        setEditingProductId(null);
      }
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, path);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  }

  async function handleAdvanceOrder(order: Order, nextStatus: OrderStatus) {
    if (!user?.emailVerified) return;
    setUpdatingOrderId(order.id);
    setNotice(null);
    const path = `orders/${order.id}`;
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      playOrderStatusEffectSound(nextStatus);

      const emailRes = await dispatchOrderStatusEmail({
        currentUser: user,
        recipientUserId: order.customerId,
        recipientEmail: order.customerEmail,
        customerName: order.customerName,
        orderId: order.id,
        shopName: order.shopName,
        status: nextStatus,
        deliveryTown: order.deliveryTown,
        total: order.total,
      });

      setNotice(
        emailRes.emailSent
          ? `Order #${order.id.slice(-6).toUpperCase()} marked "${ORDER_STATUS_META[nextStatus].label}" and emailed to ${order.customerEmail}.`
          : `Order #${order.id.slice(-6).toUpperCase()} marked "${ORDER_STATUS_META[nextStatus].label}" and alert sent to customer inbox (${order.customerEmail}).`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function handleSyncStarterDirectory() {
    if (!user || !isAdminUser) return;
    setSeeding(true);
    setErrorMsg(null);
    setNotice(null);
    try {
      for (const s of SEED_NKOMAZI_SHOPS) {
        await setDoc(doc(db, 'shops', s.id), {
          ownerId: user.uid,
          name: s.name,
          category: s.category,
          town: s.town,
          address: s.address,
          contactPhone: s.contactPhone,
          openingHours: s.openingHours || '08:00 - 18:00',
          description: s.description,
          deliveryFee: s.deliveryFee,
          etaMinutes: s.etaMinutes,
          isOpen: s.isOpen,
          imageUrl: s.imageUrl,
          latitude: s.latitude ?? NKOMAZI_TOWN_COORDS[s.town].lat,
          longitude: s.longitude ?? NKOMAZI_TOWN_COORDS[s.town].lng,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const p of SEED_NKOMAZI_PRODUCTS) {
        await setDoc(doc(db, 'shops', p.shopId, 'products', p.id), {
          shopId: p.shopId,
          ownerId: user.uid,
          name: p.name,
          category: p.category,
          price: p.price,
          description: p.description,
          specs: p.specs || '',
          inStock: p.inStock,
          imageUrl: p.imageUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setNotice('Synced all 14 Nkomazi local directory shops and products to your live Firestore database.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'shops');
    } finally {
      setSeeding(false);
    }
  }

  const activeShop =
    ownedShops.find((s) => s.id === selectedShopId) || ownedShops[0] || null;

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#141413]">
            Business Owner Studio
          </h1>
          <p className="text-sm text-stone-600">
            Upload your Nkomazi shop info, manage products, and send customer order updates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 rounded-xl">
          <button
            type="button"
            onClick={() => setPortalTab('shops')}
            className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
              portalTab === 'shops'
                ? 'bg-white text-[#141413] shadow-sm'
                : 'text-stone-600'
            }`}
          >
            My Shops ({ownedShops.length})
          </button>
          <button
            type="button"
            onClick={() => setPortalTab('add_shop')}
            className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
              portalTab === 'add_shop'
                ? 'bg-white text-[#141413] shadow-sm'
                : 'text-stone-600'
            }`}
          >
            Upload New Shop
          </button>
          <button
            type="button"
            onClick={() => setPortalTab('orders')}
            className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
              portalTab === 'orders'
                ? 'bg-white text-[#141413] shadow-sm'
                : 'text-stone-600'
            }`}
          >
            Shop Orders ({incomingOrders.length})
          </button>
          {onOpenMessages && (
            <button
              type="button"
              onClick={onOpenMessages}
              className="min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg text-[#D94E1F] hover:bg-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Messages ({messageCount})</span>
            </button>
          )}
        </div>
      </div>

      {isAdminUser && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-stone-600">
            <strong className="text-[#141413]">Admin Tool:</strong> Publish the pre-loaded Nkomazi directory shops directly into your live Firestore database so you can manage them here.
          </div>
          <button
            type="button"
            disabled={seeding}
            onClick={handleSyncStarterDirectory}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#141413] text-white text-xs font-semibold hover:bg-stone-800 cursor-pointer disabled:opacity-50"
          >
            {seeding ? 'Syncing...' : 'Sync Starter Nkomazi Shops'}
          </button>
        </div>
      )}

      {notice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {portalTab === 'add_shop' && (
        <form
          onSubmit={handleCreateShop}
          className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 space-y-5"
        >
          <h2 className="font-display text-lg font-bold text-[#141413]">
            Upload Business Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Business / Shop Name
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g. Malalane Kota & iPhone Hub"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Category
              </label>
              <select
                value={shopCategory}
                onChange={(e) => setShopCategory(e.target.value as ShopCategory)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              >
                <option value="food">Food &amp; Takeaways</option>
                <option value="iphones">iPhones</option>
                <option value="electronics">Other Electronics</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Nkomazi Town / Village
              </label>
              <select
                value={shopTown}
                onChange={(e) => setShopTown(e.target.value as NkomaziTown)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              >
                {NKOMAZI_TOWNS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Street Address / Complex
              </label>
              <input
                type="text"
                required
                minLength={4}
                maxLength={160}
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="e.g. Shop 4, Nkomazi Plaza"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Contact Phone / WhatsApp
              </label>
              <input
                type="tel"
                required
                minLength={7}
                maxLength={24}
                value={shopPhone}
                onChange={(e) => setShopPhone(e.target.value)}
                placeholder="e.g. 072 555 0199"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Opening &amp; Closing Time
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  aria-label="Opening Time"
                  value={shopOpenTime}
                  onChange={(e) => setShopOpenTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                />
                <input
                  type="time"
                  aria-label="Closing Time"
                  value={shopCloseTime}
                  onChange={(e) => setShopCloseTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Delivery Fee (ZAR)
              </label>
              <input
                type="number"
                min={0}
                max={500}
                required
                value={shopFee}
                onChange={(e) => setShopFee(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Estimated Delivery Time
              </label>
              <input
                type="text"
                required
                maxLength={30}
                value={shopEta}
                onChange={(e) => setShopEta(e.target.value)}
                placeholder="25-40 min"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              About Your Shop &amp; What You Sell
            </label>
            <textarea
              required
              minLength={10}
              maxLength={400}
              rows={3}
              value={shopDesc}
              onChange={(e) => setShopDesc(e.target.value)}
              placeholder="Describe your food menu, iPhone models, or electronics..."
              className="w-full p-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>{shopImage ? 'Change Uploaded Photo' : 'Upload Business Photo'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleShopImageUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                if (!navigator.geolocation) {
                  setErrorMsg('Browser GPS unavailable; your shop will pin to the selected town center.');
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    const lat = Number(pos.coords.latitude.toFixed(5));
                    const lng = Number(pos.coords.longitude.toFixed(5));
                    if (lat >= -26.5 && lat <= -24.5 && lng >= 31.0 && lng <= 32.5) {
                      setPinnedCoords({ lat, lng });
                      setNotice(`Pinned exact GPS coordinates (${lat}, ${lng}).`);
                    } else {
                      const townPt = NKOMAZI_TOWN_COORDS[shopTown];
                      setPinnedCoords({ lat: townPt.lat, lng: townPt.lng });
                      setNotice(`Your current device GPS is outside Nkomazi; pinned to ${shopTown} center instead.`);
                    }
                  },
                  () => {
                    setErrorMsg('Location access denied; your shop will pin to the selected town center.');
                  }
                );
              }}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
            >
              <MapPin className="w-4 h-4" />
              <span>
                {pinnedCoords
                  ? `Pinned (${pinnedCoords.lat.toFixed(3)}, ${pinnedCoords.lng.toFixed(3)})`
                  : `Pin GPS Location (defaults to ${shopTown})`}
              </span>
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="min-h-[48px] px-6 py-3 rounded-xl bg-[#D94E1F] text-white text-sm font-bold hover:bg-[#BF4117] transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Publishing Shop...' : 'Publish Nkomazi Shop'}
          </button>
        </form>
      )}

      {portalTab === 'shops' && (
        <div className="space-y-6">
          {ownedShops.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-[#141413]">
                You haven&apos;t uploaded a business yet
              </p>
              <button
                type="button"
                onClick={() => setPortalTab('add_shop')}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#D94E1F] text-white text-xs font-semibold cursor-pointer"
              >
                Upload Your Business Info
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {ownedShops.map((shop) => (
                  <button
                    key={shop.id}
                    type="button"
                    onClick={() => {
                      setSelectedShopId(shop.id);
                      setEditingShopId(null);
                      setEditingProductId(null);
                    }}
                    className={`min-h-[40px] px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                      activeShop?.id === shop.id
                        ? 'bg-[#141413] text-white border-[#141413]'
                        : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {shop.name} · {shop.town}
                  </button>
                ))}
              </div>

              {activeShop && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Shop Overview, Edit Shop & Add Product */}
                  <div className="lg:col-span-5 bg-white border border-stone-200 rounded-2xl p-5 space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-[#D94E1F] font-semibold">
                          {CATEGORY_LABELS[activeShop.category]}
                        </p>
                        <h3 className="font-display text-lg font-bold text-[#141413] truncate">
                          {activeShop.name}
                        </h3>
                        <p className="text-xs text-stone-500">
                          {activeShop.town} · {activeShop.address}
                        </p>
                        <p className="text-xs text-stone-600 mt-1 inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          <span>Hours: {activeShop.openingHours || '08:00 - 19:00'}</span>
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleShopOpen(activeShop)}
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                            activeShop.isOpen
                              ? 'bg-emerald-50 text-[#166534] border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {activeShop.isOpen ? 'Open' : 'Closed'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            editingShopId === activeShop.id
                              ? setEditingShopId(null)
                              : startEditingShop(activeShop)
                          }
                          className="min-h-[34px] px-2.5 rounded-lg border border-stone-200 text-xs font-semibold text-[#141413] hover:bg-stone-50 inline-flex items-center gap-1 cursor-pointer"
                        >
                          {editingShopId === activeShop.id ? (
                            <>
                              <X className="w-3.5 h-3.5" />
                              <span>Close Edit</span>
                            </>
                          ) : (
                            <>
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit Shop</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {editingShopId === activeShop.id && (
                      <form
                        onSubmit={(e) => handleSaveShopEdit(e, activeShop)}
                        className="space-y-3 pt-4 border-t border-stone-100"
                      >
                        <h4 className="text-sm font-bold text-[#141413]">
                          Update Business Info &amp; Hours
                        </h4>

                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Business Name
                          </label>
                          <input
                            type="text"
                            required
                            minLength={2}
                            maxLength={80}
                            value={editShopName}
                            onChange={(e) => setEditShopName(e.target.value)}
                            className="w-full min-h-[40px] px-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs font-semibold text-stone-700 mb-1">
                              Opening Time
                            </label>
                            <input
                              type="time"
                              required
                              value={editShopOpenTime}
                              onChange={(e) => setEditShopOpenTime(e.target.value)}
                              className="w-full min-h-[40px] px-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-stone-700 mb-1">
                              Closing Time
                            </label>
                            <input
                              type="time"
                              required
                              value={editShopCloseTime}
                              onChange={(e) => setEditShopCloseTime(e.target.value)}
                              className="w-full min-h-[40px] px-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs font-semibold text-stone-700 mb-1">
                              Category
                            </label>
                            <select
                              value={editShopCategory}
                              onChange={(e) => setEditShopCategory(e.target.value as ShopCategory)}
                              className="w-full min-h-[40px] px-2.5 rounded-xl border border-stone-300 text-sm bg-white"
                            >
                              <option value="food">Food &amp; Takeaways</option>
                              <option value="iphones">iPhones</option>
                              <option value="electronics">Other Electronics</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-stone-700 mb-1">
                              Town
                            </label>
                            <select
                              value={editShopTown}
                              onChange={(e) => setEditShopTown(e.target.value as NkomaziTown)}
                              className="w-full min-h-[40px] px-2.5 rounded-xl border border-stone-300 text-sm bg-white"
                            >
                              {NKOMAZI_TOWNS.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Street Address
                          </label>
                          <input
                            type="text"
                            required
                            minLength={4}
                            maxLength={160}
                            value={editShopAddress}
                            onChange={(e) => setEditShopAddress(e.target.value)}
                            className="w-full min-h-[40px] px-3 rounded-xl border border-stone-300 text-sm"
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-1">
                            <label className="block text-xs font-semibold text-stone-700 mb-1">
                              Fee (R)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={500}
                              required
                              value={editShopFee}
                              onChange={(e) => setEditShopFee(e.target.value)}
                              className="w-full min-h-[40px] px-2.5 rounded-xl border border-stone-300 text-sm"
                            />
                          </div>
                          <div className="col-span-1">
                            <label className="block text-xs font-semibold text-stone-700 mb-1">
                              ETA
                            </label>
                            <input
                              type="text"
                              required
                              maxLength={30}
                              value={editShopEta}
                              onChange={(e) => setEditShopEta(e.target.value)}
                              className="w-full min-h-[40px] px-2.5 rounded-xl border border-stone-300 text-sm"
                            />
                          </div>
                          <div className="col-span-1">
                            <label className="block text-xs font-semibold text-stone-700 mb-1">
                              Status
                            </label>
                            <button
                              type="button"
                              onClick={() => setEditShopIsOpen((prev) => !prev)}
                              className={`w-full min-h-[40px] px-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                                editShopIsOpen
                                  ? 'bg-emerald-50 text-[#166534] border-emerald-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }`}
                            >
                              {editShopIsOpen ? 'Open' : 'Closed'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Contact Phone / WhatsApp
                          </label>
                          <input
                            type="tel"
                            required
                            minLength={7}
                            maxLength={24}
                            value={editShopPhone}
                            onChange={(e) => setEditShopPhone(e.target.value)}
                            className="w-full min-h-[40px] px-3 rounded-xl border border-stone-300 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Description
                          </label>
                          <textarea
                            required
                            minLength={10}
                            maxLength={400}
                            rows={2}
                            value={editShopDesc}
                            onChange={(e) => setEditShopDesc(e.target.value)}
                            className="w-full p-2.5 rounded-xl border border-stone-300 text-sm"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <label className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Change Photo</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleEditShopImageUpload}
                              className="hidden"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              setErrorMsg(null);
                              if (!navigator.geolocation) return;
                              navigator.geolocation.getCurrentPosition(
                                (pos) => {
                                  const lat = Number(pos.coords.latitude.toFixed(5));
                                  const lng = Number(pos.coords.longitude.toFixed(5));
                                  if (lat >= -26.5 && lat <= -24.5 && lng >= 31.0 && lng <= 32.5) {
                                    setEditPinnedCoords({ lat, lng });
                                    setNotice(`Updated GPS coordinates (${lat}, ${lng}).`);
                                  } else {
                                    const pt = NKOMAZI_TOWN_COORDS[editShopTown];
                                    setEditPinnedCoords({ lat: pt.lat, lng: pt.lng });
                                    setNotice(`Device GPS is outside Nkomazi; pinned to ${editShopTown} center.`);
                                  }
                                },
                                () => {
                                  setErrorMsg('Location access denied.');
                                }
                              );
                            }}
                            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>Update GPS</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingShopId(null)}
                            className="min-h-[40px] px-4 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={savingShopEdit}
                            className="min-h-[40px] px-4 rounded-xl bg-[#D94E1F] text-white text-xs font-semibold hover:bg-[#BF4117] cursor-pointer disabled:opacity-50"
                          >
                            {savingShopEdit ? 'Saving...' : 'Save Shop Changes'}
                          </button>
                        </div>
                      </form>
                    )}

                    <form
                      onSubmit={(e) => handleAddProduct(e, activeShop)}
                      className="space-y-3 pt-4 border-t border-stone-100"
                    >
                      <h4 className="text-sm font-bold text-[#141413]">Add Product / Menu Item</h4>
                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={100}
                        value={prodName}
                        onChange={(e) => setProdName(e.target.value)}
                        placeholder="Item name (e.g. iPhone 15 128GB or Quarter Chicken)"
                        className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2.5">
                        <input
                          type="number"
                          required
                          min={1}
                          max={250000}
                          value={prodPrice}
                          onChange={(e) => setProdPrice(e.target.value)}
                          placeholder="Price (ZAR)"
                          className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm"
                        />
                        <input
                          type="text"
                          maxLength={120}
                          value={prodSpecs}
                          onChange={(e) => setProdSpecs(e.target.value)}
                          placeholder="Specs / Portion"
                          className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm"
                        />
                      </div>
                      <textarea
                        required
                        minLength={4}
                        maxLength={320}
                        rows={2}
                        value={prodDesc}
                        onChange={(e) => setProdDesc(e.target.value)}
                        placeholder="Short description..."
                        className="w-full p-3 rounded-xl border border-stone-300 text-sm"
                      />
                      <label className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{prodImage ? 'Photo Ready' : 'Upload Item Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProductImageUpload}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={saving}
                        className="w-full min-h-[44px] rounded-xl bg-[#141413] text-white text-xs font-bold hover:bg-stone-800 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{saving ? 'Adding...' : 'Add to Shop Catalog'}</span>
                      </button>
                    </form>
                  </div>

                  {/* Product List */}
                  <div className="lg:col-span-7 space-y-3">
                    <h4 className="text-sm font-bold text-[#141413]">
                      Listed Items ({(allProductsByShop[activeShop.id] || []).length})
                    </h4>
                    {(allProductsByShop[activeShop.id] || []).length === 0 ? (
                      <div className="bg-white border border-stone-200 rounded-2xl p-6 text-xs text-stone-500">
                        No items listed yet for {activeShop.name}. Use the form to add your first item.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(allProductsByShop[activeShop.id] || []).map((item) => {
                          const isEditing = editingProductId === item.id;
                          return (
                            <div
                              key={item.id}
                              className="bg-white border border-stone-200 rounded-2xl p-3.5 sm:p-4 space-y-3"
                            >
                              {isEditing ? (
                                <form
                                  onSubmit={(e) => handleSaveProductEdit(e, activeShop.id)}
                                  className="space-y-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-[#D94E1F]">
                                      Editing Item
                                    </span>
                                    <button
                                      type="button"
                                      onClick={cancelEditingProduct}
                                      aria-label="Cancel editing"
                                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 cursor-pointer"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <input
                                      type="text"
                                      required
                                      minLength={2}
                                      maxLength={100}
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      placeholder="Product name"
                                      className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                                    />
                                    <select
                                      value={editCategory}
                                      onChange={(e) => setEditCategory(e.target.value as ShopCategory)}
                                      className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                                    >
                                      <option value="food">Food &amp; Takeaways</option>
                                      <option value="iphones">iPhones</option>
                                      <option value="electronics">Other Electronics</option>
                                    </select>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2.5">
                                    <input
                                      type="number"
                                      required
                                      min={1}
                                      max={250000}
                                      value={editPrice}
                                      onChange={(e) => setEditPrice(e.target.value)}
                                      placeholder="Price (ZAR)"
                                      className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                                    />
                                    <input
                                      type="text"
                                      maxLength={120}
                                      value={editSpecs}
                                      onChange={(e) => setEditSpecs(e.target.value)}
                                      placeholder="Specs / Portion"
                                      className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                                    />
                                  </div>

                                  <textarea
                                    required
                                    minLength={4}
                                    maxLength={320}
                                    rows={2}
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    placeholder="Product description..."
                                    className="w-full p-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                                  />

                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                      <label className="min-h-[38px] inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer">
                                        <Upload className="w-3.5 h-3.5" />
                                        <span>Change Photo</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={handleEditProductImageUpload}
                                          className="hidden"
                                        />
                                      </label>

                                      <button
                                        type="button"
                                        onClick={() => setEditInStock((prev) => !prev)}
                                        className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                                          editInStock
                                            ? 'border-emerald-200 bg-emerald-50 text-[#166534]'
                                            : 'border-stone-200 bg-stone-100 text-stone-600'
                                        }`}
                                      >
                                        {editInStock ? 'In Stock' : 'Sold Out'}
                                      </button>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={cancelEditingProduct}
                                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="submit"
                                        disabled={savingEdit}
                                        className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#D94E1F] text-white text-xs font-semibold hover:bg-[#BF4117] cursor-pointer disabled:opacity-50"
                                      >
                                        {savingEdit ? 'Saving...' : 'Save Changes'}
                                      </button>
                                    </div>
                                  </div>
                                </form>
                              ) : (
                                <div className="flex flex-wrap sm:flex-nowrap items-center gap-3.5">
                                  <div className="w-20 h-16 rounded-xl overflow-hidden bg-stone-100 shrink-0">
                                    <ResilientImage
                                      src={item.imageUrl}
                                      alt={item.name}
                                      category={item.category}
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-bold text-[#141413] truncate">
                                        {item.name}
                                      </p>
                                      {!item.inStock && (
                                        <span className="text-[11px] font-semibold text-stone-500 shrink-0">
                                          · Sold Out
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-stone-500 truncate">
                                      {item.specs || item.description}
                                    </p>
                                    <p className="text-xs font-mono font-semibold text-[#D94E1F] tabular-nums mt-0.5">
                                      R{item.price.toLocaleString('en-ZA')}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleProductStock(activeShop.id, item)}
                                      className={`min-h-[36px] px-2.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                                        item.inStock
                                          ? 'border-emerald-200 bg-emerald-50 text-[#166534]'
                                          : 'border-stone-200 bg-stone-100 text-stone-600'
                                      }`}
                                    >
                                      {item.inStock ? 'In Stock' : 'Sold Out'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => startEditingProduct(item)}
                                      aria-label={`Edit ${item.name}`}
                                      className="min-h-[38px] px-2.5 flex items-center gap-1 rounded-xl border border-stone-200 text-xs font-semibold text-[#141413] hover:bg-stone-50 cursor-pointer"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteProduct(activeShop.id, item.id)}
                                      aria-label={`Remove ${item.name}`}
                                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {portalTab === 'orders' && (
        <div className="space-y-4">
          {incomingOrders.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center space-y-2">
              <PackageCheck className="w-7 h-7 text-stone-400 mx-auto" />
              <p className="text-sm font-semibold text-[#141413]">No incoming shop orders yet</p>
              <p className="text-xs text-stone-500">
                When customers order from your Nkomazi shop, you can update their status and trigger email alerts here.
              </p>
            </div>
          ) : (
            incomingOrders.map((order) => {
              const nextActions: Array<{ status: OrderStatus; label: string }> = [];
              if (order.status === 'pending') {
                nextActions.push({ status: 'confirmed', label: 'Confirm & Notify Email' });
                nextActions.push({ status: 'cancelled', label: 'Cancel' });
              } else if (order.status === 'confirmed') {
                nextActions.push({ status: 'preparing', label: 'Mark Preparing' });
              } else if (order.status === 'preparing') {
                nextActions.push({ status: 'out_for_delivery', label: 'Out for Delivery' });
              } else if (order.status === 'out_for_delivery') {
                nextActions.push({ status: 'delivered', label: 'Mark Delivered' });
              }

              return (
                <article
                  key={order.id}
                  className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-stone-500">
                        Order #{order.id.slice(-6).toUpperCase()} · {order.shopName}
                      </p>
                      <h3 className="text-base font-bold text-[#141413]">
                        {order.customerName} · {order.deliveryTown}
                      </h3>
                      <p className="text-xs text-stone-600">
                        {order.customerEmail} · {order.customerPhone}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-base font-bold text-[#141413] tabular-nums">
                        R{order.total.toLocaleString('en-ZA')}
                      </p>
                      <p className="text-xs font-semibold text-[#D94E1F]">
                        {ORDER_STATUS_META[order.status].label}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-stone-600">
                    Items: {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                  </p>
                  <p className="text-xs text-stone-500">Address: {order.deliveryAddress}</p>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => onMessageCustomer(order)}
                      className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-[#141413] hover:bg-stone-50 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#D94E1F]" />
                      <span>Message Customer</span>
                    </button>

                    {nextActions.map((act) => (
                      <button
                        key={act.status}
                        type="button"
                        disabled={updatingOrderId === order.id}
                        onClick={() => handleAdvanceOrder(order, act.status)}
                        className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                          act.status === 'cancelled'
                            ? 'border border-stone-200 text-stone-700 hover:bg-stone-50'
                            : 'bg-[#D94E1F] text-white hover:bg-[#BF4117]'
                        }`}
                      >
                        {updatingOrderId === order.id ? 'Updating...' : act.label}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
