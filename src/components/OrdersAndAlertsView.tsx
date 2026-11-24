import { useState } from 'react';
import { User } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Mail, Package, CheckCircle2, XCircle, MessageSquare, Volume2, VolumeX } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { EmailNotification, ORDER_STATUS_META, Order } from '../types/marketplace';
import { dispatchOrderStatusEmail } from '../utils/notifications';
import {
  isSoundEnabled,
  playOrderNotificationSound,
  playOrderStatusEffectSound,
  setSoundEnabled,
} from '../utils/sounds';

interface OrdersAndAlertsViewProps {
  user: User | null;
  orders: Order[];
  notifications: EmailNotification[];
  onNeedAuth: () => void;
  onMessageOrder: (order: Order) => void;
  bannerNotice: string | null;
}

const PROGRESS_STEPS = [
  'pending',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
] as const;

export function OrdersAndAlertsView({
  user,
  orders,
  notifications,
  onNeedAuth,
  onMessageOrder,
  bannerNotice,
}: OrdersAndAlertsViewProps) {
  const [subTab, setSubTab] = useState<'orders' | 'alerts'>('orders');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled());

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 space-y-4">
          <Package className="w-8 h-8 text-[#D94E1F] mx-auto" />
          <h1 className="font-display text-2xl font-bold text-[#141413]">
            Track Orders &amp; Email Updates
          </h1>
          <p className="text-sm text-stone-600">
            Sign in with your email or Google account to view live order progress and status notifications.
          </p>
          <button
            type="button"
            onClick={onNeedAuth}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#D94E1F] text-white text-sm font-semibold hover:bg-[#BF4117] cursor-pointer"
          >
            Sign In to Continue
          </button>
        </div>
      </div>
    );
  }

  async function handleCancelOrder(order: Order) {
    if (!user || order.status !== 'pending') return;
    setCancellingId(order.id);
    const path = `orders/${order.id}`;
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      playOrderStatusEffectSound('cancelled');
      await dispatchOrderStatusEmail({
        currentUser: user,
        recipientUserId: order.customerId,
        recipientEmail: order.customerEmail,
        customerName: order.customerName,
        orderId: order.id,
        shopName: order.shopName,
        status: 'cancelled',
        deliveryTown: order.deliveryTown,
        total: order.total,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#141413]">
            Orders &amp; Email Notifications
          </h1>
          <p className="text-sm text-stone-600">
            Live order updates sent to {user.email}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              setSoundEnabled(next);
              if (next) {
                playOrderNotificationSound();
              }
            }}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5 cursor-pointer"
            title={soundOn ? 'Mute order sounds' : 'Enable order sounds'}
          >
            {soundOn ? (
              <Volume2 className="w-3.5 h-3.5 text-[#D94E1F]" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-stone-400" />
            )}
            <span>{soundOn ? 'Sound On' : 'Muted'}</span>
          </button>

          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl">
            <button
              type="button"
              onClick={() => setSubTab('orders')}
              className={`min-h-[40px] px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                subTab === 'orders'
                  ? 'bg-white text-[#141413] shadow-sm'
                  : 'text-stone-600 hover:text-[#141413]'
              }`}
            >
              My Orders ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('alerts')}
              className={`min-h-[40px] px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                subTab === 'alerts'
                  ? 'bg-white text-[#141413] shadow-sm'
                  : 'text-stone-600 hover:text-[#141413]'
              }`}
            >
              Email Alerts ({notifications.length})
            </button>
          </div>
        </div>
      </div>

      {bannerNotice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-900 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{bannerNotice}</span>
        </div>
      )}

      {subTab === 'orders' ? (
        orders.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-[#141413]">No orders yet</p>
            <p className="text-xs text-stone-500">
              Your food, iPhone, and electronics orders from Nkomazi shops will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const meta = ORDER_STATUS_META[order.status];
              return (
                <article
                  key={order.id}
                  className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-stone-500">
                        <span className="font-mono font-semibold text-[#141413]">
                          #{order.id.slice(-6).toUpperCase()}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{order.deliveryTown}</span>
                        <span aria-hidden="true">·</span>
                        <span>{order.customerEmail}</span>
                      </div>
                      <h2 className="font-display text-lg font-bold text-[#141413]">
                        {order.shopName}
                      </h2>
                    </div>

                    <div className="text-right">
                      <p className="font-mono text-base font-bold text-[#141413] tabular-nums">
                        R{order.total.toLocaleString('en-ZA')}
                      </p>
                      <p className="text-xs font-semibold text-[#D94E1F]">{meta.label}</p>
                    </div>
                  </div>

                  {/* Stepper */}
                  {order.status === 'cancelled' ? (
                    <div className="p-3 rounded-xl bg-stone-100 text-xs text-stone-700 flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-stone-500" />
                      <span>This order was cancelled.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-1.5 pt-1">
                      {PROGRESS_STEPS.map((stepKey, idx) => {
                        const active = meta.step >= idx + 1;
                        return (
                          <div key={stepKey} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full transition-colors ${
                                active ? 'bg-[#D94E1F]' : 'bg-stone-200'
                              }`}
                            />
                            <p
                              className={`text-[11px] truncate ${
                                active ? 'text-[#141413] font-semibold' : 'text-stone-400'
                              }`}
                            >
                              {ORDER_STATUS_META[stepKey].label}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="border-t border-stone-100 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-stone-600">
                    <div className="space-y-0.5">
                      <p>
                        {order.items
                          .map((i) => `${i.quantity}x ${i.name}`)
                          .join(', ')}
                      </p>
                      <p className="text-stone-500">Deliver to: {order.deliveryAddress}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onMessageOrder(order)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-stone-200 text-xs font-semibold text-[#141413] hover:bg-stone-50 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[#D94E1F]" />
                        <span>Message Shop</span>
                      </button>

                      {order.status === 'pending' && (
                        <button
                          type="button"
                          disabled={cancellingId === order.id}
                          onClick={() => handleCancelOrder(order)}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                        >
                          {cancellingId === order.id ? 'Cancelling...' : 'Cancel Order'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : notifications.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center space-y-2">
          <Mail className="w-7 h-7 text-stone-400 mx-auto" />
          <p className="text-sm font-semibold text-[#141413]">No email alerts yet</p>
          <p className="text-xs text-stone-500">
            Every order confirmation and status change will appear here and trigger an email update.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((note) => (
            <article
              key={note.id}
              className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                <span className="font-semibold text-[#141413]">{note.recipientEmail}</span>
                <span>
                  {note.emailSent
                    ? `Dispatched via ${note.deliveryChannel.toUpperCase()}`
                    : 'Saved to Email Alerts Inbox'}
                </span>
              </div>
              <h3 className="text-sm font-bold text-[#141413]">{note.subject}</h3>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">{note.message}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
