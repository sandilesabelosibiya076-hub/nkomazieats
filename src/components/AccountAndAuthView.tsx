import { useEffect, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CheckCircle2, LogOut, Mail, RefreshCw, ShieldAlert } from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { NKOMAZI_TOWNS, UserProfile } from '../types/marketplace';

interface AccountAndAuthViewProps {
  user: User | null;
  profile: UserProfile | null;
  onProfileSaved: (profile: UserProfile) => void;
  compactHeader?: string;
}

export function AccountAndAuthView({
  user,
  profile,
  onProfileSaved,
  compactHeader,
}: AccountAndAuthViewProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accountType, setAccountType] = useState<'customer' | 'owner'>('customer');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Profile fields when signed in
  const [profName, setProfName] = useState('');
  const [profPhone, setProfPhone] = useState('');
  const [profTown, setProfTown] = useState<string>('Malalane');
  const [profAddress, setProfAddress] = useState('');
  const [profRole, setProfRole] = useState<'customer' | 'owner'>('customer');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (profile) {
      setProfName(profile.displayName || user?.displayName || '');
      setProfPhone(profile.phone || '');
      setProfTown(profile.defaultTown || 'Malalane');
      setProfAddress(profile.defaultAddress || '');
      setProfRole(profile.role || 'customer');
    } else if (user) {
      setProfName(user.displayName || user.email?.split('@')[0] || '');
    }
  }, [profile, user]);

  function mapAuthError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('auth/operation-not-allowed')) {
      return 'Email/Password sign-in is not yet enabled in Firebase Console. Open Firebase Console -> Authentication -> Sign-in method -> Enable "Email/Password", or use Google Sign-In below right now.';
    }
    if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
      return 'Incorrect email or password. Please check your details and try again.';
    }
    if (msg.includes('auth/user-not-found')) {
      return 'No account found for that email. Switch to Create Account to register.';
    }
    if (msg.includes('auth/email-already-in-use')) {
      return 'An account with this email already exists. Switch to Sign In.';
    }
    if (msg.includes('auth/weak-password')) {
      return 'Password should be at least 6 characters long.';
    }
    if (msg.includes('auth/popup-closed-by-user')) {
      return 'Sign-in window was closed before completing.';
    }
    return msg;
  }

  async function handleGoogleSignIn() {
    setAuthError(null);
    setAuthNotice(null);
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const u = cred.user;
      const userRef = doc(db, 'users', u.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        const newProfile: UserProfile = {
          uid: u.uid,
          email: u.email || '',
          displayName: u.displayName || u.email?.split('@')[0] || 'Nkomazi User',
          role: accountType,
        };
        try {
          await setDoc(userRef, {
            ...newProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          onProfileSaved(newProfile);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${u.uid}`);
        }
      }
    } catch (err) {
      setAuthError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    setBusy(true);
    try {
      const cleanEmail = email.trim();
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, cleanEmail);
        setAuthNotice(`Password reset instructions sent to ${cleanEmail}.`);
        setMode('signin');
        return;
      }

      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const cleanName = displayName.trim() || cleanEmail.split('@')[0];
        await updateProfile(cred.user, { displayName: cleanName });
        await sendEmailVerification(cred.user);
        setAuthNotice(
          `Account created! We sent a verification link to ${cleanEmail}. Verify your email to place orders or list a business.`
        );
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      }
    } catch (err) {
      setAuthError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshVerification() {
    if (!user) return;
    setBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified) {
        setAuthNotice('Email verified! You can now place orders and publish shops.');
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const initial: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || user.email?.split('@')[0] || 'Nkomazi User',
            role: accountType,
          };
          await setDoc(userRef, {
            ...initial,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          onProfileSaved(initial);
        }
      } else {
        setAuthNotice('Still waiting for email verification. Please click the link sent to your inbox.');
      }
    } catch (err) {
      setAuthError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResendVerification() {
    if (!user) return;
    setBusy(true);
    setAuthError(null);
    try {
      await sendEmailVerification(user);
      setAuthNotice(`Verification email resent to ${user.email}.`);
    } catch (err) {
      setAuthError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!user.emailVerified) {
      setAuthError('Please verify your email address before saving profile changes.');
      return;
    }
    setSavingProfile(true);
    setAuthError(null);
    setAuthNotice(null);
    const path = `users/${user.uid}`;
    try {
      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      const nextProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: profName.trim().slice(0, 80) || 'Nkomazi User',
        role: profRole,
        phone: profPhone.trim().slice(0, 24),
        defaultTown: profTown,
        defaultAddress: profAddress.trim().slice(0, 160),
      };

      if (!snap.exists()) {
        await setDoc(ref, {
          ...nextProfile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(
          ref,
          {
            ...nextProfile,
            createdAt: snap.data().createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: false }
        );
      }
      onProfileSaved(nextProfile);
      setAuthNotice('Profile and delivery defaults saved.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setSavingProfile(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-8 px-4">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#141413]">
              {compactHeader || 'Sign in to Nkomazi Eats'}
            </h1>
            <p className="text-sm text-stone-600">
              Use your email or Google account to order from Nkomazi shops, track deliveries, or manage your business.
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleGoogleSignIn}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#141413] text-white text-sm font-semibold hover:bg-stone-800 transition-colors flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
          >
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-stone-200" />
            <span className="px-3 text-xs text-stone-500">or use email</span>
            <div className="flex-grow border-t border-stone-200" />
          </div>

          <div className="flex gap-1 p-1 bg-stone-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setAuthError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'signin'
                  ? 'bg-white text-[#141413] shadow-sm'
                  : 'text-stone-600 hover:text-[#141413]'
              }`}
            >
              Email Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setAuthError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white text-[#141413] shadow-sm'
                  : 'text-stone-600 hover:text-[#141413]'
              }`}
            >
              Create Account
            </button>
          </div>

          {authError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 leading-relaxed flex gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {authNotice && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 leading-relaxed flex gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authNotice}</span>
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Sipho Nkosi"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    I am signing up as
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAccountType('customer')}
                      className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        accountType === 'customer'
                          ? 'border-[#D94E1F] bg-[#D94E1F]/5 text-[#D94E1F]'
                          : 'border-stone-200 text-stone-600'
                      }`}
                    >
                      Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountType('owner')}
                      className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        accountType === 'owner'
                          ? 'border-[#D94E1F] bg-[#D94E1F]/5 text-[#D94E1F]'
                          : 'border-stone-200 text-stone-600'
                      }`}
                    >
                      Business Owner
                    </button>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              />
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-stone-700">
                    Password
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => setMode('reset')}
                      className="text-xs text-[#D94E1F] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#D94E1F] text-white text-sm font-semibold hover:bg-[#BF4117] transition-colors cursor-pointer disabled:opacity-60"
            >
              {busy
                ? 'Please wait...'
                : mode === 'signup'
                  ? 'Create Email Account'
                  : mode === 'reset'
                    ? 'Send Reset Link'
                    : 'Sign In with Email'}
            </button>

            {mode === 'reset' && (
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="w-full text-xs text-stone-600 hover:text-[#141413] py-1 cursor-pointer"
              >
                Back to sign in
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold text-[#141413]">
              {user.displayName || profName || 'Your Nkomazi Account'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
              <Mail className="w-3.5 h-3.5" />
              <span>{user.email}</span>
              <span aria-hidden="true">·</span>
              <span className={user.emailVerified ? 'text-[#166534] font-semibold' : 'text-amber-700 font-semibold'}>
                {user.emailVerified ? 'Email Verified' : 'Verification Pending'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => signOut(auth)}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        {!user.emailVerified && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
            <p className="text-xs text-amber-900 leading-relaxed">
              Please verify your email address ({user.email}) using the link in your inbox before placing orders or uploading a business.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleRefreshVerification}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#141413] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>I Verified My Email</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleResendVerification}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-amber-300 bg-white text-amber-900 text-xs font-semibold cursor-pointer"
              >
                Resend Verification Link
              </button>
            </div>
          </div>
        )}

        {authError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
            {authError}
          </div>
        )}
        {authNotice && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            {authNotice}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-4 pt-2 border-t border-stone-100">
          <h2 className="text-sm font-bold text-[#141413]">Delivery &amp; Account Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                required
                value={profName}
                onChange={(e) => setProfName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Phone / WhatsApp Number
              </label>
              <input
                type="tel"
                value={profPhone}
                onChange={(e) => setProfPhone(e.target.value)}
                placeholder="e.g. 072 123 4567"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Default Nkomazi Town
              </label>
              <select
                value={profTown}
                onChange={(e) => setProfTown(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              >
                {NKOMAZI_TOWNS.map((town) => (
                  <option key={town} value={town}>
                    {town}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Account Role
              </label>
              <select
                value={profRole}
                onChange={(e) => setProfRole(e.target.value as 'customer' | 'owner')}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
              >
                <option value="customer">Customer</option>
                <option value="owner">Business Owner</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Default Street / Stand Address
            </label>
            <input
              type="text"
              value={profAddress}
              onChange={(e) => setProfAddress(e.target.value)}
              placeholder="e.g. Stand 412, Near Tonga Mall"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#D94E1F]"
            />
          </div>

          <button
            type="submit"
            disabled={savingProfile || !user.emailVerified}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#D94E1F] text-white text-sm font-semibold hover:bg-[#BF4117] transition-colors cursor-pointer disabled:opacity-50"
          >
            {savingProfile ? 'Saving...' : 'Save Account Details'}
          </button>
        </form>
      </div>
    </div>
  );
}
