import { OrderStatus } from '../types/marketplace';

const SOUND_PREF_KEY = 'nkomazi_eats_sound_enabled';

let audioCtx: AudioContext | null = null;
let lastNotificationChimeAt = 0;
let listenersAttached = false;

export function isSoundEnabled(): boolean {
  try {
    const stored = window.localStorage.getItem(SOUND_PREF_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, String(enabled));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function initAudioUnlock(): void {
  if (typeof window === 'undefined' || listenersAttached) return;
  listenersAttached = true;
  const unlock = () => {
    getAudioContext();
  };
  window.addEventListener('pointerdown', unlock, { passive: true, once: true });
  window.addEventListener('keydown', unlock, { passive: true, once: true });
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startOffsetSec: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  peakGain = 0.14
): void {
  const now = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/**
 * Crisp upward triad chime played when a user clicks Submit / Place Order.
 */
export function playOrderSubmitSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  playTone(ctx, 523.25, 0, 0.14, 'triangle', 0.13); // C5
  playTone(ctx, 659.25, 0.08, 0.16, 'triangle', 0.13); // E5
  playTone(ctx, 783.99, 0.16, 0.28, 'sine', 0.15); // G5
}

/**
 * Two-note notification bell played when an order notification or new shop order arrives.
 */
export function playOrderNotificationSound(): void {
  if (!isSoundEnabled()) return;
  const nowMs = Date.now();
  if (nowMs - lastNotificationChimeAt < 450) return;
  lastNotificationChimeAt = nowMs;

  const ctx = getAudioContext();
  if (!ctx) return;

  playTone(ctx, 880, 0, 0.18, 'sine', 0.14); // A5
  playTone(ctx, 1174.66, 0.11, 0.34, 'sine', 0.15); // D6
}

/**
 * Tactile audio effect for order status transitions (confirmed, preparing, out for delivery, delivered, cancelled).
 */
export function playOrderStatusEffectSound(status: OrderStatus): void {
  if (!isSoundEnabled()) return;
  const nowMs = Date.now();
  if (nowMs - lastNotificationChimeAt < 450) return;
  lastNotificationChimeAt = nowMs;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (status === 'cancelled') {
    playTone(ctx, 440, 0, 0.14, 'triangle', 0.11);
    playTone(ctx, 329.63, 0.1, 0.24, 'triangle', 0.1);
    return;
  }

  if (status === 'delivered') {
    playTone(ctx, 587.33, 0, 0.12, 'sine', 0.13); // D5
    playTone(ctx, 739.99, 0.09, 0.12, 'sine', 0.13); // F#5
    playTone(ctx, 880, 0.18, 0.14, 'sine', 0.14); // A5
    playTone(ctx, 1174.66, 0.27, 0.32, 'sine', 0.15); // D6
    return;
  }

  playTone(ctx, 659.25, 0, 0.15, 'sine', 0.13); // E5
  playTone(ctx, 987.77, 0.09, 0.26, 'sine', 0.14); // B5
}
