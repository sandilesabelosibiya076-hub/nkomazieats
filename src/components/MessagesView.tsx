import { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ArrowLeft, MessageSquare, Send, ShieldAlert } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ChatMessage, Conversation } from '../types/marketplace';

export interface ChatTargetDraft {
  shopId: string;
  shopName: string;
  shopOwnerId: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  orderId?: string;
}

interface MessagesViewProps {
  user: User | null;
  conversations: Conversation[];
  activeDraft: ChatTargetDraft | null;
  onClearDraft: () => void;
  onNeedAuth: () => void;
}

export function buildConversationId(shopId: string, customerId: string): string {
  return `conv_${shopId}_${customerId}`.slice(0, 128);
}

function getTimestampMillis(ts: unknown, pendingFallback: number): number {
  if (!ts) return pendingFallback;
  if (typeof (ts as { toMillis?: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  const seconds = (ts as { seconds?: number }).seconds;
  if (typeof seconds === 'number') {
    return seconds * 1000;
  }
  return pendingFallback;
}

function formatMessageTime(ts: unknown): string {
  if (!ts) return 'Sending...';
  const ms = getTimestampMillis(ts, 0);
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function MessagesView({
  user,
  conversations,
  activeDraft,
  onClearDraft,
  onNeedAuth,
}: MessagesViewProps) {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftText, setDraftText] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);
  const hasAutoSelectedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  if (fatalError) {
    throw fatalError;
  }

  const isAdminUser =
    Boolean(user?.emailVerified) &&
    user?.email?.toLowerCase() === 'sandilesabelosibiya076@gmail.com';

  // Select conversation matching activeDraft, or auto-select the latest once on initial load
  useEffect(() => {
    if (activeDraft) {
      const targetId = buildConversationId(activeDraft.shopId, activeDraft.customerId);
      setSelectedConvId(targetId);
      hasAutoSelectedRef.current = true;
      return;
    }

    if (!hasAutoSelectedRef.current && conversations.length > 0) {
      setSelectedConvId(conversations[0].id);
      hasAutoSelectedRef.current = true;
    }
  }, [activeDraft, conversations]);

  // Clear activeDraft only after the live conversation appears in conversations
  useEffect(() => {
    if (!activeDraft) return;
    const draftConvId = buildConversationId(activeDraft.shopId, activeDraft.customerId);
    if (conversations.some((c) => c.id === draftConvId)) {
      onClearDraft();
    }
  }, [activeDraft, conversations, onClearDraft]);

  const activeConversation =
    conversations.find((c) => c.id === selectedConvId) || null;

  const activeConvId = activeConversation?.id || null;
  const activeCustomerId = activeConversation?.customerId || null;
  const activeShopOwnerId = activeConversation?.shopOwnerId || null;

  // Live messages subscription for active conversation (keyed on primitive IDs to avoid flicker)
  useEffect(() => {
    if (!user || !activeConvId || !activeCustomerId || !activeShopOwnerId) {
      setMessages([]);
      return;
    }

    const msgCollection = collection(db, 'conversations', activeConvId, 'messages');
    const msgQuery =
      activeCustomerId === user.uid
        ? query(msgCollection, where('customerId', '==', user.uid))
        : activeShopOwnerId === user.uid
          ? query(msgCollection, where('shopOwnerId', '==', user.uid))
          : isAdminUser
            ? msgCollection
            : null;

    if (!msgQuery) {
      setMessages([]);
      return;
    }

    const unsub = onSnapshot(
      msgQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<ChatMessage, 'id'>),
          id: d.id,
        }));
        list.sort((a, b) => {
          const ta = getTimestampMillis(a.createdAt, Number.MAX_SAFE_INTEGER);
          const tb = getTimestampMillis(b.createdAt, Number.MAX_SAFE_INTEGER);
          return ta - tb;
        });
        setMessages(list);
      },
      (err) => {
        try {
          handleFirestoreError(
            err,
            OperationType.LIST,
            `conversations/${activeConvId}/messages`
          );
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );

    return () => unsub();
  }, [user?.uid, activeConvId, activeCustomerId, activeShopOwnerId, isAdminUser]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeConvId]);

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 space-y-4">
          <MessageSquare className="w-8 h-8 text-[#D94E1F] mx-auto" />
          <h1 className="font-display text-2xl font-bold text-[#141413]">
            Messages with Nkomazi Shops
          </h1>
          <p className="text-sm text-stone-600">
            Sign in with your email or Google account to ask questions, arrange deliveries, or chat directly with shop owners and customers.
          </p>
          <button
            type="button"
            onClick={onNeedAuth}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#D94E1F] text-white text-sm font-semibold hover:bg-[#BF4117] cursor-pointer"
          >
            Sign In to Message
          </button>
        </div>
      </div>
    );
  }

  // Determine current thread header (either existing conversation or new draft)
  const currentThread = activeConversation
    ? {
        id: activeConversation.id,
        shopId: activeConversation.shopId,
        shopName: activeConversation.shopName,
        shopOwnerId: activeConversation.shopOwnerId,
        customerId: activeConversation.customerId,
        customerName: activeConversation.customerName,
        customerEmail: activeConversation.customerEmail,
        orderId: activeConversation.lastOrderId,
      }
    : activeDraft
      ? {
          id: buildConversationId(activeDraft.shopId, activeDraft.customerId),
          ...activeDraft,
        }
      : null;

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !currentThread) return;

    if (!user.emailVerified) {
      setErrorMsg('Please verify your email in the Account tab before sending messages.');
      return;
    }

    const cleanText = draftText.trim().slice(0, 800);
    if (!cleanText) return;

    setErrorMsg(null);
    setSending(true);

    const convId = currentThread.id;
    const isSenderCustomer = currentThread.customerId === user.uid;
    const senderRole: 'customer' | 'owner' = isSenderCustomer ? 'customer' : 'owner';
    const cleanCustomerName =
      (currentThread.customerName || user.displayName || user.email?.split('@')[0] || 'Customer')
        .trim()
        .slice(0, 80) || 'Customer';
    const cleanShopName = (currentThread.shopName || 'Nkomazi Shop').trim().slice(0, 80) || 'Nkomazi Shop';
    const senderName = isSenderCustomer ? cleanCustomerName : cleanShopName;

    try {
      const convRef = doc(db, 'conversations', convId);
      let convExists = Boolean(activeConversation);

      if (!convExists) {
        const convSnap = await getDoc(convRef);
        convExists = convSnap.exists();
      }

      if (!convExists) {
        const convPayload: Record<string, unknown> = {
          shopId: currentThread.shopId,
          shopName: cleanShopName,
          shopOwnerId: currentThread.shopOwnerId,
          customerId: currentThread.customerId,
          customerName: cleanCustomerName,
          lastMessage: cleanText.slice(0, 240),
          lastSenderRole: senderRole,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (currentThread.customerEmail) {
          convPayload.customerEmail = currentThread.customerEmail.slice(0, 160);
        }
        if (currentThread.orderId) {
          convPayload.lastOrderId = currentThread.orderId;
        }
        await setDoc(convRef, convPayload);
      } else {
        const updatePayload: Record<string, unknown> = {
          lastMessage: cleanText.slice(0, 240),
          lastSenderRole: senderRole,
          updatedAt: serverTimestamp(),
        };
        if (currentThread.orderId) {
          updatePayload.lastOrderId = currentThread.orderId;
        }
        await updateDoc(convRef, updatePayload);
      }

      const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const msgPayload: Record<string, unknown> = {
        conversationId: convId,
        customerId: currentThread.customerId,
        shopOwnerId: currentThread.shopOwnerId,
        senderId: user.uid,
        senderName,
        senderRole,
        text: cleanText,
        createdAt: serverTimestamp(),
      };
      if (currentThread.orderId) {
        msgPayload.orderId = currentThread.orderId;
      }

      await setDoc(doc(collection(db, 'conversations', convId, 'messages'), msgId), msgPayload);

      setDraftText('');
      setSelectedConvId(convId);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      if (rawMessage.toLowerCase().includes('permission') || rawMessage.toLowerCase().includes('insufficient')) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `conversations/${convId}`);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      } else {
        setErrorMsg(rawMessage || 'Could not send message. Please try again.');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#141413]">
          Customer &amp; Shop Messages
        </h1>
        <p className="text-sm text-stone-600">
          Real-time two-way chat between Nkomazi shoppers and local business owners.
        </p>
      </div>

      {!user.emailVerified && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              Verify your email address ({user.email}) in your Account tab before sending messages.
            </span>
          </div>
          <button
            type="button"
            onClick={onNeedAuth}
            className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#141413] text-white text-xs font-semibold cursor-pointer"
          >
            Open Account
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[480px] max-h-[640px]">
        {/* Conversation List */}
        <aside
          className={`md:col-span-4 border-b md:border-b-0 md:border-r border-stone-200 flex flex-col overflow-hidden ${
            currentThread ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="px-4 py-3 border-b border-stone-100 text-xs font-semibold text-stone-500">
            Conversations ({conversations.length})
          </div>

          <div className="divide-y divide-stone-100 overflow-y-auto flex-1">
            {conversations.length === 0 && !activeDraft ? (
              <div className="p-6 text-center text-xs text-stone-500">
                No conversations yet. Open any Nkomazi shop or order and tap &ldquo;Message Shop&rdquo; to start chatting.
              </div>
            ) : (
              conversations.map((conv) => {
                const isCustomerViewer = conv.customerId === user.uid;
                const title = isCustomerViewer ? conv.shopName : conv.customerName;
                const subtitle = isCustomerViewer
                  ? 'Shop'
                  : `Customer · ${conv.shopName}`;
                const isSelected = currentThread?.id === conv.id;
                const repliedByOther =
                  (isCustomerViewer && conv.lastSenderRole === 'owner') ||
                  (!isCustomerViewer && conv.lastSenderRole === 'customer');

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => {
                      onClearDraft();
                      setSelectedConvId(conv.id);
                    }}
                    className={`w-full text-left p-4 transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#FAF9F6]' : 'hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-[#D94E1F] truncate">
                        {subtitle}
                      </p>
                      {repliedByOther && (
                        <span className="text-[10px] font-semibold text-[#166534] shrink-0">
                          New reply
                        </span>
                      )}
                    </div>
                    <p className="font-display text-sm font-bold text-[#141413] truncate">
                      {title}
                    </p>
                    <p className="text-xs text-stone-500 truncate mt-0.5">
                      {conv.lastMessage || 'Start conversation...'}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Active Chat Thread */}
        <section
          className={`md:col-span-8 flex flex-col overflow-hidden ${
            currentThread ? 'flex' : 'hidden md:flex'
          }`}
        >
          {!currentThread ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-sm text-stone-500">
              <MessageSquare className="w-7 h-7 text-stone-300 mb-2" />
              <p>Select a conversation or message any Nkomazi shop to begin.</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between gap-3 bg-[#FAF9F6]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      onClearDraft();
                      setSelectedConvId(null);
                    }}
                    className="md:hidden min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 cursor-pointer"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="font-display text-sm sm:text-base font-bold text-[#141413] truncate">
                      {currentThread.customerId === user.uid
                        ? currentThread.shopName
                        : `${currentThread.customerName} (${currentThread.shopName})`}
                    </h2>
                    <p className="text-xs text-stone-500 truncate">
                      {currentThread.orderId
                        ? `Linked to Order #${currentThread.orderId.slice(-6).toUpperCase()}`
                        : 'Direct Nkomazi Shop Chat'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                {messages.length === 0 ? (
                  <div className="py-10 text-center text-xs text-stone-500">
                    Send your first message below—replies appear live in real time.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.senderId === user.uid;
                    const timeLabel = formatMessageTime(msg.createdAt);
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <span className="text-[11px] text-stone-400 mb-1 px-1">
                          {isMine ? 'You' : msg.senderName}
                          {timeLabel ? ` · ${timeLabel}` : ''}
                        </span>
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                            isMine
                              ? 'bg-[#141413] text-white rounded-br-sm'
                              : 'bg-[#F3EFE8] text-[#141413] rounded-bl-sm'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <form
                onSubmit={handleSendMessage}
                className="p-3 border-t border-stone-200 bg-white flex items-center gap-2"
              >
                <input
                  type="text"
                  maxLength={800}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Write a message..."
                  className="flex-1 min-h-[44px] px-4 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                />
                <button
                  type="submit"
                  disabled={sending || !draftText.trim()}
                  className="min-h-[44px] px-4 rounded-xl bg-[#D94E1F] text-white text-xs sm:text-sm font-semibold hover:bg-[#BF4117] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{sending ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
