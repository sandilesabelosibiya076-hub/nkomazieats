import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Minus, Plus, Trash2, X, Mail, CheckCircle2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { CartItem, NKOMAZI_TOWNS, NkomaziTown, UserProfile } from '../types/marketplace';
import { dispatchOrderStatusEmail } from '../utils/notifications';
import { playOrderSubmitSound } from '../utils/sounds';

interface CartCheckoutDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQty: (productId: string, delta: number) => void;
  onClearCart: () => void;
  user: User | null;
  profile: UserProfile | null;
  onNeedAuth: () => void;
  onOrderPlaced: (orderId: string, emailNotice: string) => void;
}

export function CartCheckoutDrawer({
  isOpen,
  onClose,
  items,
  onUpdateQty,
  onClearCart,
  user,
  profile,
  onNeedAuth,
  onOrderPlaced,
}: CartCheckoutDrawerProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryTown, setDeliveryTown] = useState<NkomaziTown>('Malalane');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'eft_on_delivery'>(
    'cash_on_delivery'
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || profile?.displayName || user.displayName || '');
      setCustomerEmail((prev) => prev || profile?.email || user.email || '');
      setCustomerPhone((prev) => prev || profile?.phone || '');
      if (profile?.defaultTown && NKOMAZI_TOWNS.includes(profile.defaultTown as NkomaziTown)) {
        setDeliveryTown(profile.defaultTown as NkomaziTown);
      }
      setDeliveryAddress((prev) => prev || profile?.defaultAddress || '');
    }
  }, [user, profile]);

  if (!isOpen) return null;

  const activeShop = items[0]?.shop || null;
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const deliveryFee = activeShop ? activeShop.deliveryFee : 0;
  const total = subtotal + deliveryFee;

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!user) {
      onClose();
      onNeedAuth();
      return;
    }

    if (!user.emailVerified) {
      setErrorMsg(
        'Please verify your email address in the Account tab before placing an order.'
      );
      return;
    }

    if (!activeShop || items.length === 0) return;

    const cleanName = customerName.trim().slice(0, 80);
    const cleanEmail = customerEmail.trim().slice(0, 160);
    const cleanPhone = customerPhone.trim().slice(0, 24);
    const cleanAddress = deliveryAddress.trim().slice(0, 200);
    const cleanNotes = notes.trim().slice(0, 250);

    if (cleanName.length < 2 || cleanPhone.length < 7 || cleanAddress.length < 4) {
      setErrorMsg('Please enter your name, phone number, and Nkomazi street/stand address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address for order status updates.');
      return;
    }

    setSubmitting(true);
    playOrderSubmitSound();
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const orderPath = `orders/${orderId}`;

    try {
      const orderPayload: Record<string, unknown> = {
        customerId: user.uid,
        customerName: cleanName,
        customerEmail: cleanEmail,
        customerPhone: cleanPhone,
        deliveryTown,
        deliveryAddress: cleanAddress,
        shopId: activeShop.id,
        shopName: activeShop.name.slice(0, 80),
        shopOwnerId: activeShop.ownerId,
        items: items.slice(0, 25).map((item) => ({
          productId: item.product.id,
          name: item.product.name.slice(0, 100),
          price: item.product.price,
          quantity: item.quantity,
          specs: item.product.specs ? item.product.specs.slice(0, 120) : '',
        })),
        subtotal,
        deliveryFee,
        total,
        status: 'pending',
        paymentMethod,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (cleanNotes.length > 0) {
        orderPayload.notes = cleanNotes;
      }

      await setDoc(doc(db, 'orders', orderId), orderPayload);

      const emailResult = await dispatchOrderStatusEmail({
        currentUser: user,
        recipientUserId: user.uid,
        recipientEmail: cleanEmail,
        customerName: cleanName,
        orderId,
        shopName: activeShop.name,
        status: 'pending',
        deliveryTown,
        total,
      });

      onClearCart();
      onClose();
      onOrderPlaced(
        orderId,
        emailResult.emailSent
          ? `Order placed! Confirmation email sent to ${cleanEmail}.`
          : `Order placed! Status confirmation saved to your Email Alerts inbox for ${cleanEmail}.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, orderPath);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end items-end md:items-stretch bg-black/50 backdrop-blur-sm">
      <div className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-none md:rounded-l-2xl max-h-[92vh] md:max-h-full flex flex-col shadow-2xl overflow-hidden">
        <div className="md:hidden w-10 h-1.5 bg-stone-300 rounded-full mx-auto mt-3 shrink-0" />

        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-display text-lg font-bold text-[#141413]">Your Order Bag</h2>
            {activeShop && (
              <p className="text-xs text-stone-500">
                {activeShop.name} · {activeShop.town}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Bag"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {items.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <p className="text-sm font-semibold text-[#141413]">Your bag is empty</p>
              <p className="text-xs text-stone-500">
                Pick food, an iPhone, or electronics from any local Nkomazi shop.
              </p>
            </div>
          ) : (
            <>
              {/* Itemized List */}
              <div className="divide-y divide-stone-100">
                {items.map((item) => (
                  <div key={item.product.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#141413] truncate">
                        {item.product.name}
                      </p>
                      <p className="text-xs font-mono text-stone-500 tabular-nums">
                        R{item.product.price.toLocaleString('en-ZA')} each
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.product.id, -1)}
                        aria-label="Decrease quantity"
                        className="w-9 h-9 rounded-lg border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-100 cursor-pointer"
                      >
                        {item.quantity === 1 ? (
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        ) : (
                          <Minus className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className="w-7 text-center text-xs font-mono font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.product.id, 1)}
                        aria-label="Increase quantity"
                        className="w-9 h-9 rounded-lg border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-100 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-stone-200 space-y-1.5 text-sm">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">R{subtotal.toLocaleString('en-ZA')}</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>Nkomazi Delivery</span>
                  <span className="font-mono tabular-nums">R{deliveryFee.toLocaleString('en-ZA')}</span>
                </div>
                <div className="flex justify-between font-bold text-[#141413] pt-2 border-t border-stone-200">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">R{total.toLocaleString('en-ZA')}</span>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                  {errorMsg}
                </div>
              )}

              {/* Checkout Form */}
              <form id="nkomazi-checkout-form" onSubmit={handleCheckout} className="space-y-3.5">
                <div className="flex items-center gap-2 text-xs text-[#166534] font-medium">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span>Email updates sent automatically as your order progresses</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Notification Email
                  </label>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Phone / WhatsApp
                    </label>
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="072 000 0000"
                      className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Nkomazi Town
                    </label>
                    <select
                      value={deliveryTown}
                      onChange={(e) => setDeliveryTown(e.target.value as NkomaziTown)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
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
                    Street / Stand Address &amp; Landmark
                  </label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="e.g. Stand 104, Opposite Tonga Clinic"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Payment on Delivery
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash_on_delivery')}
                      className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        paymentMethod === 'cash_on_delivery'
                          ? 'border-[#D94E1F] bg-[#D94E1F]/5 text-[#D94E1F]'
                          : 'border-stone-200 text-stone-600'
                      }`}
                    >
                      Cash on Delivery
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('eft_on_delivery')}
                      className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        paymentMethod === 'eft_on_delivery'
                          ? 'border-[#D94E1F] bg-[#D94E1F]/5 text-[#D94E1F]'
                          : 'border-stone-200 text-stone-600'
                      }`}
                    >
                      Card / EFT on Delivery
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Delivery Note (optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Call at the gate"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                  />
                </div>
              </form>
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 border-t border-stone-200 bg-white shrink-0">
            <button
              type="submit"
              form="nkomazi-checkout-form"
              disabled={submitting}
              className="w-full min-h-[48px] rounded-xl bg-[#D94E1F] text-white text-sm font-bold hover:bg-[#BF4117] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {user
                  ? submitting
                    ? 'Placing Order...'
                    : `Place Order · R${total.toLocaleString('en-ZA')}`
                  : 'Sign In to Place Order'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
