import { User } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { NkomaziTown, OrderStatus } from '../types/marketplace';

interface DispatchOrderEmailParams {
  currentUser: User;
  recipientUserId: string;
  recipientEmail: string;
  customerName: string;
  orderId: string;
  shopName: string;
  status: OrderStatus;
  deliveryTown: NkomaziTown;
  total: number;
}

export interface DispatchEmailResult {
  emailSent: boolean;
  deliveryChannel: 'smtp' | 'resend' | 'in_app';
  subject: string;
  message: string;
}

export async function dispatchOrderStatusEmail(
  params: DispatchOrderEmailParams
): Promise<DispatchEmailResult> {
  let result: DispatchEmailResult = {
    emailSent: false,
    deliveryChannel: 'in_app',
    subject: `Nkomazi Eats · Order #${params.orderId.slice(-6).toUpperCase()} (${params.status.replace(/_/g, ' ')})`,
    message: `Order update from ${params.shopName} for ${params.customerName} (${params.deliveryTown}). Total: R${params.total.toFixed(2)}.`,
  };

  try {
    const idToken = await params.currentUser.getIdToken();
    const response = await fetch('/api/notifications/order-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        recipientEmail: params.recipientEmail,
        customerName: params.customerName,
        orderId: params.orderId,
        shopName: params.shopName,
        status: params.status,
        deliveryTown: params.deliveryTown,
        total: params.total,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as Partial<DispatchEmailResult>;
      result = {
        emailSent: Boolean(data.emailSent),
        deliveryChannel:
          data.deliveryChannel === 'smtp' || data.deliveryChannel === 'resend'
            ? data.deliveryChannel
            : 'in_app',
        subject: typeof data.subject === 'string' ? data.subject : result.subject,
        message: typeof data.message === 'string' ? data.message : result.message,
      };
    }
  } catch (err) {
    console.warn('Email transport fallback to in-app notification:', err);
  }

  // Persist notification record in Firestore so customer sees it in Orders & Inbox
  const path = 'notifications';
  try {
    await addDoc(collection(db, path), {
      userId: params.recipientUserId,
      recipientEmail: params.recipientEmail.slice(0, 160),
      orderId: params.orderId,
      shopName: params.shopName.slice(0, 80),
      status: params.status,
      subject: result.subject.slice(0, 140),
      message: result.message.slice(0, 500),
      deliveryChannel: result.deliveryChannel,
      emailSent: result.emailSent,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return result;
}
