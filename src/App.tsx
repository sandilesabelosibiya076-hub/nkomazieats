import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { ArrowRight, LocateFixed, Map as MapIcon, LayoutGrid, MapPin, Search, Store } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  CATEGORY_LABELS,
  CartItem,
  Conversation,
  EmailNotification,
  GeoPoint,
  NKOMAZI_TOWNS,
  NkomaziTown,
  Order,
  OrderStatus,
  Product,
  Shop,
  ShopCategory,
  UserProfile,
} from './types/marketplace';
import {
  HERO_BANNER_IMAGE,
  SEED_NKOMAZI_PRODUCTS,
  SEED_NKOMAZI_SHOPS,
} from './data/seedShops';
import { AppTab, Header } from './components/Header';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ResilientImage } from './components/ResilientImage';
import { ShopDetailView } from './components/ShopDetailView';
import { CartCheckoutDrawer } from './components/CartCheckoutDrawer';
import { AccountAndAuthView } from './components/AccountAndAuthView';
import { OrdersAndAlertsView } from './components/OrdersAndAlertsView';
import { BusinessOwnerPortal } from './components/BusinessOwnerPortal';
import { ChatTargetDraft, MessagesView } from './components/MessagesView';
import { NkomaziMap } from './components/NkomaziMap';
import {
  NKOMAZI_TOWN_COORDS,
  calculateDistanceKm,
  formatDistanceKm,
  getShopCoordinates,
} from './utils/geo';
import {
  initAudioUnlock,
  playOrderNotificationSound,
  playOrderStatusEffectSound,
} from './utils/sounds';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [activeTab, setActiveTab] = useState<AppTab>('explore');
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  // Filters & Proximity
  const [categoryFilter, setCategoryFilter] = useState<'all' | ShopCategory>('all');
  const [townFilter, setTownFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [highlightedShopId, setHighlightedShopId] = useState<string | null>(null);

  // Live Firestore Data
  const [liveShops, setLiveShops] = useState<Shop[]>([]);
  const [liveProductsByShop, setLiveProductsByShop] = useState<Record<string, Product[]>>({});
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [incomingShopOrders, setIncomingShopOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [customerConvs, setCustomerConvs] = useState<Conversation[]>([]);
  const [ownerConvs, setOwnerConvs] = useState<Conversation[]>([]);
  const [directoryConvs, setDirectoryConvs] = useState<Conversation[]>([]);
  const [chatDraft, setChatDraft] = useState<ChatTargetDraft | null>(null);
  const [pendingMessageShop, setPendingMessageShop] = useState<Shop | null>(null);

  // Cart & UI Feedback
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [shopSwitchWarning, setShopSwitchWarning] = useState<string | null>(null);
  const [orderBannerNotice, setOrderBannerNotice] = useState<string | null>(null);

  // Sound tracking refs (skip initial snapshot load)
  const knownMyOrderStatusRef = useRef<Map<string, OrderStatus> | null>(null);
  const knownIncomingOrderIdsRef = useRef<Set<string> | null>(null);
  const knownNotificationIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    initAudioUnlock();
  }, []);

  // 1. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);

      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            setProfile(snap.data() as UserProfile);
          } else {
            setProfile(null);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setProfile(null);
        setMyOrders([]);
        setIncomingShopOrders([]);
        setNotifications([]);
        setCustomerConvs([]);
        setOwnerConvs([]);
        setDirectoryConvs([]);
        knownMyOrderStatusRef.current = null;
        knownIncomingOrderIdsRef.current = null;
        knownNotificationIdsRef.current = null;
      }
    });
    return () => unsub();
  }, []);

  // Resume pending shop message after signing in
  useEffect(() => {
    if (user && pendingMessageShop) {
      setChatDraft({
        shopId: pendingMessageShop.id,
        shopName: pendingMessageShop.name,
        shopOwnerId: pendingMessageShop.ownerId,
        customerId: user.uid,
        customerName:
          profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Customer',
        customerEmail: user.email || undefined,
      });
      setPendingMessageShop(null);
      setActiveTab('messages');
    }
  }, [user, profile, pendingMessageShop]);

  // 2. Public Nkomazi Shops Listener
  useEffect(() => {
    const shopsQuery = query(
      collection(db, 'shops'),
      where('category', 'in', ['food', 'iphones', 'electronics'])
    );

    const unsub = onSnapshot(
      shopsQuery,
      (snapshot) => {
        const docs: Shop[] = snapshot.docs.map((d) => ({
          ...(d.data() as Omit<Shop, 'id'>),
          id: d.id,
        }));
        setLiveShops(docs);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'shops');
      }
    );

    return () => unsub();
  }, []);

  // Merge live Firestore shops + starter Nkomazi directory shops
  const allShops = useMemo(() => {
    const map = new Map<string, Shop>();
    for (const s of SEED_NKOMAZI_SHOPS) {
      map.set(s.id, s);
    }
    for (const live of liveShops) {
      map.set(live.id, live);
    }
    return Array.from(map.values());
  }, [liveShops]);

  // 3. Load products for currently viewed shop or owned shops
  const shopsToWatchProducts = useMemo(() => {
    const ids = new Set<string>();
    if (selectedShopId) ids.add(selectedShopId);
    if (user) {
      for (const s of liveShops) {
        if (s.ownerId === user.uid) ids.add(s.id);
      }
    }
    return Array.from(ids);
  }, [selectedShopId, liveShops, user]);

  useEffect(() => {
    if (shopsToWatchProducts.length === 0) return;

    const unsubs = shopsToWatchProducts.map((shopId) => {
      const q = query(
        collection(db, 'shops', shopId, 'products'),
        where('category', 'in', ['food', 'iphones', 'electronics'])
      );
      return onSnapshot(
        q,
        (snap) => {
          const prods: Product[] = snap.docs.map((d) => ({
            ...(d.data() as Omit<Product, 'id'>),
            id: d.id,
          }));
          setLiveProductsByShop((prev) => ({ ...prev, [shopId]: prods }));
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, `shops/${shopId}/products`);
        }
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [shopsToWatchProducts]);

  // Merge seed products + live Firestore products per shop
  const productsByShop = useMemo(() => {
    const map: Record<string, Product[]> = {};
    for (const p of SEED_NKOMAZI_PRODUCTS) {
      if (!map[p.shopId]) map[p.shopId] = [];
      map[p.shopId].push(p);
    }
    for (const [shopId, liveProds] of Object.entries(liveProductsByShop)) {
      if (liveProds.length > 0) {
        const merged = new Map<string, Product>();
        for (const sp of map[shopId] || []) {
          merged.set(sp.id, sp);
        }
        for (const lp of liveProds) {
          merged.set(lp.id, lp);
        }
        map[shopId] = Array.from(merged.values());
      }
    }
    return map;
  }, [liveProductsByShop]);

  // 4. Customer Orders & Email Notifications Listeners (when signed in)
  useEffect(() => {
    if (!authReady || !user) return;

    const myOrdersQuery = query(
      collection(db, 'orders'),
      where('customerId', '==', user.uid)
    );
    const unsubOrders = onSnapshot(
      myOrdersQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<Order, 'id'>),
          id: d.id,
        }));
        list.sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          const tb = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          return tb - ta;
        });

        const prevStatuses = knownMyOrderStatusRef.current;
        const nextStatuses = new Map<string, OrderStatus>();
        let changedStatus: OrderStatus | null = null;
        for (const ord of list) {
          nextStatuses.set(ord.id, ord.status);
          if (prevStatuses) {
            const oldStatus = prevStatuses.get(ord.id);
            if (oldStatus && oldStatus !== ord.status) {
              changedStatus = ord.status;
            }
          }
        }
        knownMyOrderStatusRef.current = nextStatuses;
        if (changedStatus) {
          playOrderStatusEffectSound(changedStatus);
        }

        setMyOrders(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
    );

    const shopOrdersQuery = query(
      collection(db, 'orders'),
      where('shopOwnerId', '==', user.uid)
    );
    const unsubShopOrders = onSnapshot(
      shopOrdersQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<Order, 'id'>),
          id: d.id,
        }));
        list.sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          const tb = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          return tb - ta;
        });

        const prevIncoming = knownIncomingOrderIdsRef.current;
        const nextIncoming = new Set<string>(list.map((o) => o.id));
        if (prevIncoming) {
          const hasNewIncoming = list.some((o) => !prevIncoming.has(o.id));
          if (hasNewIncoming) {
            playOrderNotificationSound();
          }
        }
        knownIncomingOrderIdsRef.current = nextIncoming;

        setIncomingShopOrders(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
    );

    const notifQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
    );
    const unsubNotifs = onSnapshot(
      notifQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<EmailNotification, 'id'>),
          id: d.id,
        }));
        list.sort((a, b) => {
          const ta = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          const tb = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          return tb - ta;
        });

        const prevNotifs = knownNotificationIdsRef.current;
        const nextNotifs = new Set<string>(list.map((n) => n.id));
        if (prevNotifs) {
          const hasNewNotif = list.some((n) => !prevNotifs.has(n.id));
          if (hasNewNotif) {
            playOrderNotificationSound();
          }
        }
        knownNotificationIdsRef.current = nextNotifs;

        setNotifications(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'notifications');
      }
    );

    const custConvQuery = query(
      collection(db, 'conversations'),
      where('customerId', '==', user.uid)
    );
    const unsubCustConv = onSnapshot(
      custConvQuery,
      (snap) => {
        setCustomerConvs(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<Conversation, 'id'>),
            id: d.id,
          }))
        );
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'conversations');
      }
    );

    const ownerConvQuery = query(
      collection(db, 'conversations'),
      where('shopOwnerId', '==', user.uid)
    );
    const unsubOwnerConv = onSnapshot(
      ownerConvQuery,
      (snap) => {
        setOwnerConvs(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<Conversation, 'id'>),
            id: d.id,
          }))
        );
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'conversations');
      }
    );

    const isAdminUser =
      Boolean(user.emailVerified) &&
      user.email?.toLowerCase() === 'sandilesabelosibiya076@gmail.com';

    const unsubDirConv = isAdminUser
      ? onSnapshot(
          query(collection(db, 'conversations'), where('shopOwnerId', '==', 'nkomazi_directory')),
          (snap) => {
            setDirectoryConvs(
              snap.docs.map((d) => ({
                ...(d.data() as Omit<Conversation, 'id'>),
                id: d.id,
              }))
            );
          },
          (err) => {
            handleFirestoreError(err, OperationType.LIST, 'conversations');
          }
        )
      : () => {};

    return () => {
      unsubOrders();
      unsubShopOrders();
      unsubNotifs();
      unsubCustConv();
      unsubOwnerConv();
      unsubDirConv();
    };
  }, [authReady, user]);

  // Filtered Shops & Proximity Distance Calculation
  const filteredShopsWithDistance = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = allShops
      .filter((shop) => {
        if (categoryFilter !== 'all' && shop.category !== categoryFilter) return false;
        if (townFilter !== 'all' && shop.town !== townFilter) return false;
        if (!q) return true;
        const shopMatches =
          shop.name.toLowerCase().includes(q) ||
          shop.town.toLowerCase().includes(q) ||
          shop.description.toLowerCase().includes(q) ||
          shop.address.toLowerCase().includes(q);
        if (shopMatches) return true;
        const prods = productsByShop[shop.id] || [];
        return prods.some((p) => p.name.toLowerCase().includes(q));
      })
      .map((shop) => {
        const coords = getShopCoordinates(shop);
        const distanceKm = userLocation
          ? calculateDistanceKm(userLocation.lat, userLocation.lng, coords.lat, coords.lng)
          : null;
        return { shop, distanceKm };
      });

    if (userLocation) {
      list.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    }
    return list;
  }, [allShops, categoryFilter, townFilter, searchQuery, productsByShop, userLocation]);

  const filteredShops = useMemo(
    () => filteredShopsWithDistance.map((entry) => entry.shop),
    [filteredShopsWithDistance]
  );

  const ownedShops = useMemo(() => {
    if (!user) return [];
    return liveShops.filter((s) => s.ownerId === user.uid);
  }, [liveShops, user]);

  const allConversations = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const c of [...customerConvs, ...ownerConvs, ...directoryConvs]) {
      map.set(c.id, c);
    }
    const getUpdatedMs = (c: Conversation) => {
      const ts = c.updatedAt as { toMillis?: () => number; seconds?: number } | null | undefined;
      if (!ts) return Number.MAX_SAFE_INTEGER;
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      return (ts.seconds || 0) * 1000;
    };
    return Array.from(map.values()).sort((a, b) => getUpdatedMs(b) - getUpdatedMs(a));
  }, [customerConvs, ownerConvs, directoryConvs]);

  const unreadMessagesCount = useMemo(() => {
    if (!user) return 0;
    return allConversations.filter((c) => {
      const isCust = c.customerId === user.uid;
      return isCust ? c.lastSenderRole === 'owner' : c.lastSenderRole === 'customer';
    }).length;
  }, [allConversations, user]);

  const activeShop = useMemo(
    () => allShops.find((s) => s.id === selectedShopId) || null,
    [allShops, selectedShopId]
  );

  const cartQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cart) {
      map[item.product.id] = item.quantity;
    }
    return map;
  }, [cart]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function handleAddToCart(product: Product, shop: Shop) {
    setShopSwitchWarning(null);
    setCart((prev) => {
      if (prev.length > 0 && prev[0].shop.id !== shop.id) {
        setShopSwitchWarning(
          `Your bag switched to ${shop.name} so all items deliver together from one shop.`
        );
        return [{ product, shop, quantity: 1 }];
      }
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, shop, quantity: 1 }];
    });
  }

  function handleUpdateCartQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function handleSelectTab(tab: AppTab) {
    setActiveTab(tab);
    if (tab !== 'explore') {
      setSelectedShopId(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleLocateMe() {
    setLocationNotice(null);
    if (!navigator.geolocation) {
      setLocationNotice('GPS is not supported in this browser. Pick your town below to sort closest shops.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng, label: 'Your GPS Location' });
        setViewMode('map');
        setLocationNotice('Showing shops sorted closest to your current location.');
      },
      () => {
        setLocationNotice('Location access was declined. Select your Nkomazi town below to sort by proximity.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#141413] pb-20 md:pb-0">
      <Header
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
        userDisplayName={user?.displayName || profile?.displayName || user?.email || null}
      />

      {shopSwitchWarning && (
        <div className="bg-[#141413] text-white text-xs py-2.5 px-4 text-center flex items-center justify-center gap-3">
          <span>{shopSwitchWarning}</span>
          <button
            type="button"
            onClick={() => setShopSwitchWarning(null)}
            className="underline font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="flex-1">
        {activeTab === 'explore' && activeShop && (
          <ShopDetailView
            shop={activeShop}
            products={productsByShop[activeShop.id] || []}
            onBack={() => setSelectedShopId(null)}
            onAddToCart={handleAddToCart}
            onMessageShop={(shop) => {
              if (!user) {
                setPendingMessageShop(shop);
                handleSelectTab('account');
                return;
              }
              setChatDraft({
                shopId: shop.id,
                shopName: shop.name,
                shopOwnerId: shop.ownerId,
                customerId: user.uid,
                customerName: profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Customer',
                customerEmail: user.email || undefined,
              });
              handleSelectTab('messages');
            }}
            cartQuantities={cartQuantities}
          />
        )}

        {activeTab === 'explore' && !activeShop && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10">
            {/* Section 1: Storefront Hero Split */}
            <section className="bg-white border border-stone-200 rounded-3xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-[#D94E1F]">
                    Nkomazi Local Marketplace · Malalane to Komatipoort &amp; Tonga
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#141413] leading-[1.1] text-balance">
                    Local food, iPhones, and electronics from Nkomazi shops.
                  </h1>
                  <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-xl">
                    Order meals, unlocked iPhones, and everyday electronics directly from verified businesses across Nkomazi—with instant email updates on every order.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href="#nkomazi-directory"
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#D94E1F] text-white text-sm font-semibold hover:bg-[#BF4117] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <span>Browse Local Shops</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('owner')}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl border border-stone-300 bg-white text-[#141413] text-sm font-semibold hover:bg-stone-50 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Store className="w-4 h-4" />
                    <span>Upload Your Business</span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 aspect-[16/10] lg:aspect-auto lg:min-h-[340px] bg-stone-100">
                <ResilientImage
                  src={HERO_BANNER_IMAGE}
                  alt="Nkomazi Eats local grilled food, iPhone, and electronics showcase"
                  category="food"
                  className="w-full h-full object-cover"
                />
              </div>
            </section>

            {/* Section 2: Search, Category & Town Controls + Shop Grid */}
            <section id="nkomazi-directory" className="space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Interactive Category Segmented Filter */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-200/70 rounded-xl w-fit">
                  {(
                    [
                      { id: 'all', label: 'All Shops' },
                      { id: 'food', label: 'Food' },
                      { id: 'iphones', label: 'iPhones' },
                      { id: 'electronics', label: 'Electronics' },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        categoryFilter === cat.id
                          ? 'bg-white text-[#141413] shadow-sm'
                          : 'text-stone-600 hover:text-[#141413]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Search, Nkomazi Town Picker, Locate Me & View Switch */}
                <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full lg:w-auto">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search shop, iPhone, kota..."
                      className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                    />
                  </div>

                  <div className="relative sm:w-44">
                    <MapPin className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      aria-label="Filter by Nkomazi Town"
                      value={townFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTownFilter(val);
                        if (val !== 'all' && val in NKOMAZI_TOWN_COORDS) {
                          const pt = NKOMAZI_TOWN_COORDS[val as NkomaziTown];
                          setUserLocation({ lat: pt.lat, lng: pt.lng, label: `${val} Center` });
                          setLocationNotice(`Showing distance from ${val}.`);
                        }
                      }}
                      className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                    >
                      <option value="all">All Nkomazi Towns</option>
                      {NKOMAZI_TOWNS.map((town) => (
                        <option key={town} value={town}>
                          {town}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleLocateMe}
                    className={`min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      userLocation
                        ? 'border-[#2563EB] bg-[#2563EB]/5 text-[#1D4ED8]'
                        : 'border-stone-300 bg-white text-[#141413] hover:bg-stone-50'
                    }`}
                  >
                    <LocateFixed className="w-4 h-4" />
                    <span>{userLocation ? 'Near Me Active' : 'Nearest to Me'}</span>
                  </button>

                  <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-xl w-fit">
                    <button
                      type="button"
                      onClick={() => setViewMode('grid')}
                      className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                        viewMode === 'grid'
                          ? 'bg-white text-[#141413] shadow-sm'
                          : 'text-stone-600 hover:text-[#141413]'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Grid</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('map')}
                      className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                        viewMode === 'map'
                          ? 'bg-white text-[#141413] shadow-sm'
                          : 'text-stone-600 hover:text-[#141413]'
                      }`}
                    >
                      <MapIcon className="w-3.5 h-3.5" />
                      <span>Map</span>
                    </button>
                  </div>
                </div>
              </div>

              {locationNotice && (
                <div className="p-3 rounded-xl bg-white border border-stone-200 text-xs text-stone-700 flex flex-wrap items-center justify-between gap-2">
                  <span>{locationNotice}</span>
                  {userLocation && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserLocation(null);
                        setLocationNotice(null);
                      }}
                      className="text-[#D94E1F] font-semibold hover:underline cursor-pointer"
                    >
                      Clear Location
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-baseline justify-between border-b border-stone-200 pb-3">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-[#141413]">
                  {userLocation ? 'Closest Nkomazi Shops' : 'Local Nkomazi Shops'}
                </h2>
                <span className="text-xs text-stone-500 tabular-nums">
                  {filteredShops.length} {filteredShops.length === 1 ? 'shop' : 'shops'} available
                </span>
              </div>

              {filteredShops.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center space-y-3">
                  <p className="text-sm font-semibold text-[#141413]">
                    No shops match your current filter
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('all');
                      setTownFilter('all');
                      setSearchQuery('');
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#141413] text-white text-xs font-semibold cursor-pointer"
                  >
                    Show All Nkomazi Shops
                  </button>
                </div>
              ) : viewMode === 'map' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  <div className="lg:col-span-5 bg-white border border-stone-200 rounded-2xl overflow-hidden flex flex-col max-h-[540px]">
                    <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between text-xs text-stone-600">
                      <span className="font-semibold text-[#141413]">
                        {userLocation ? 'Sorted Closest First' : 'Tap a shop to locate on map'}
                      </span>
                      <span className="tabular-nums">{filteredShopsWithDistance.length} pins</span>
                    </div>
                    <div className="divide-y divide-stone-100 overflow-y-auto flex-1">
                      {filteredShopsWithDistance.map(({ shop, distanceKm }) => {
                        const isSelected = highlightedShopId === shop.id;
                        return (
                          <div
                            key={shop.id}
                            className={`p-4 transition-colors flex items-center justify-between gap-3 ${
                              isSelected ? 'bg-[#FAF9F6]' : 'hover:bg-stone-50'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setHighlightedShopId(shop.id)}
                              className="text-left min-w-0 flex-1 space-y-1 cursor-pointer"
                            >
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                                <span className="font-semibold text-[#D94E1F]">
                                  {CATEGORY_LABELS[shop.category]}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{shop.town}</span>
                                <span aria-hidden="true">·</span>
                                <span className={shop.isOpen ? 'text-[#166534] font-semibold' : 'text-red-700 font-semibold'}>
                                  {shop.isOpen ? 'Open' : 'Closed'}
                                </span>
                                {distanceKm !== null && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono font-semibold text-[#141413] tabular-nums">
                                      {formatDistanceKm(distanceKm)}
                                    </span>
                                  </>
                                )}
                              </div>
                              <p className="font-display text-sm font-bold text-[#141413] truncate">
                                {shop.name}
                              </p>
                              <p className="text-xs text-stone-500 truncate">{shop.address}</p>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedShopId(shop.id);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#141413] text-white text-xs font-semibold hover:bg-stone-800 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              View Items
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="lg:col-span-7">
                    <NkomaziMap
                      shops={filteredShops}
                      userLocation={userLocation}
                      highlightedShopId={highlightedShopId}
                      onHighlightShop={(id) => setHighlightedShopId(id)}
                      onOpenShop={(id) => {
                        setSelectedShopId(id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredShopsWithDistance.map(({ shop, distanceKm }) => {
                    const itemCount = (productsByShop[shop.id] || []).length;
                    return (
                      <button
                        key={shop.id}
                        type="button"
                        onClick={() => {
                          setSelectedShopId(shop.id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="text-left bg-white border border-stone-200 rounded-2xl overflow-hidden flex flex-col hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="aspect-[4/3] w-full bg-stone-100 overflow-hidden">
                          <ResilientImage
                            src={shop.imageUrl}
                            alt={shop.name}
                            category={shop.category}
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                          />
                        </div>

                        <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3 w-full">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                              <span className="font-semibold text-[#D94E1F]">
                                {CATEGORY_LABELS[shop.category]}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{shop.town}</span>
                              <span aria-hidden="true">·</span>
                              <span className={shop.isOpen ? 'text-[#166534] font-semibold' : 'text-red-700 font-semibold'}>
                                {shop.isOpen ? 'Open' : 'Closed'}
                              </span>
                              {distanceKm !== null && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono font-semibold text-[#141413] tabular-nums">
                                    {formatDistanceKm(distanceKm)}
                                  </span>
                                </>
                              )}
                            </div>

                            <h3 className="font-display text-base sm:text-lg font-bold text-[#141413] leading-snug">
                              {shop.name}
                            </h3>

                            <p className="text-xs text-stone-600 leading-relaxed line-clamp-2">
                              {shop.description}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600 w-full">
                            <span className="tabular-nums truncate">
                              {shop.openingHours ? `${shop.openingHours} · ` : ''}
                              {shop.etaMinutes} · R{shop.deliveryFee} delivery
                            </span>
                            <span className="font-semibold text-[#141413] tabular-nums shrink-0 ml-2">
                              {itemCount} items
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'orders' && (
          <OrdersAndAlertsView
            user={user}
            orders={myOrders}
            notifications={notifications}
            onNeedAuth={() => handleSelectTab('account')}
            onMessageOrder={(order) => {
              setChatDraft({
                shopId: order.shopId,
                shopName: order.shopName,
                shopOwnerId: order.shopOwnerId,
                customerId: order.customerId,
                customerName: order.customerName,
                customerEmail: order.customerEmail,
                orderId: order.id,
              });
              handleSelectTab('messages');
            }}
            bannerNotice={orderBannerNotice}
          />
        )}

        {activeTab === 'messages' && (
          <MessagesView
            user={user}
            conversations={allConversations}
            activeDraft={chatDraft}
            onClearDraft={() => setChatDraft(null)}
            onNeedAuth={() => handleSelectTab('account')}
          />
        )}

        {activeTab === 'owner' && (
          <BusinessOwnerPortal
            user={user}
            ownedShops={ownedShops}
            allProductsByShop={productsByShop}
            incomingOrders={incomingShopOrders}
            onNeedAuth={() => handleSelectTab('account')}
            onMessageCustomer={(order) => {
              setChatDraft({
                shopId: order.shopId,
                shopName: order.shopName,
                shopOwnerId: order.shopOwnerId,
                customerId: order.customerId,
                customerName: order.customerName,
                customerEmail: order.customerEmail,
                orderId: order.id,
              });
              handleSelectTab('messages');
            }}
            onOpenMessages={() => handleSelectTab('messages')}
            messageCount={allConversations.length}
          />
        )}

        {activeTab === 'account' && (
          <AccountAndAuthView
            user={user}
            profile={profile}
            onProfileSaved={(p) => setProfile(p)}
            compactHeader={
              pendingMessageShop ? `Sign in to message ${pendingMessageShop.name}` : undefined
            }
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-stone-200 bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <p>
            Nkomazi Eats · Serving Malalane, Komatipoort, Tonga, Kamaqhekeza, Naas &amp; Hectorspruit
          </p>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => handleSelectTab('explore')}
              className="hover:text-[#141413] cursor-pointer"
            >
              Shops
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('owner')}
              className="hover:text-[#141413] cursor-pointer"
            >
              List a Business
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('orders')}
              className="hover:text-[#141413] cursor-pointer"
            >
              Order Alerts
            </button>
          </div>
        </div>
      </footer>

      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        unreadAlertsCount={notifications.length}
        unreadMessagesCount={unreadMessagesCount}
      />

      <CartCheckoutDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        onUpdateQty={handleUpdateCartQty}
        onClearCart={() => setCart([])}
        user={user}
        profile={profile}
        onNeedAuth={() => handleSelectTab('account')}
        onOrderPlaced={(_orderId, emailNotice) => {
          setOrderBannerNotice(emailNotice);
          handleSelectTab('orders');
        }}
      />
    </div>
  );
}
