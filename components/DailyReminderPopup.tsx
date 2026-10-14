import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { safeStorage } from '../lib/safeStorage';

const ONE_HOUR_MS = 60 * 60 * 1000; // 1 hour (3,600,000 ms)
const POPUP_DURATION_SEC = 10; // 10 seconds duration
const STORAGE_KEY = 'justus_last_hourly_reminder_timestamp';

interface DailyReminderPopupProps {
  user?: any;
  isOnDashboard?: boolean;
}

export const DailyReminderPopup: React.FC<DailyReminderPopupProps> = ({ user, isOnDashboard = false }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(POPUP_DURATION_SEC);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingTimeRef = useRef<number>(0);

  // Helper to detect if user is currently focused on an input or typing
  const isUserActivelyInputting = useCallback((): boolean => {
    if (typeof document === 'undefined') return false;

    // 1. Check if user typed anything in an input recently (last 3 seconds)
    if (Date.now() - lastTypingTimeRef.current < 3000) {
      return true;
    }

    // 2. Check if activeElement is an input/textarea/select/editable
    const activeEl = document.activeElement;
    if (activeEl) {
      const tagName = activeEl.tagName.toUpperCase();
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return true;
      }
      if (activeEl.getAttribute('contenteditable') === 'true') {
        return true;
      }
    }

    // 3. Check if any input in document has active focus
    const focusedInputs = document.querySelectorAll('input:focus, textarea:focus, select:focus');
    if (focusedInputs.length > 0) {
      return true;
    }

    return false;
  }, []);

  // Track user input/typing events across the window
  useEffect(() => {
    const handleInputActivity = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName ? target.tagName.toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          lastTypingTimeRef.current = Date.now();
        }
      }
    };

    window.addEventListener('input', handleInputActivity, true);
    window.addEventListener('keydown', handleInputActivity, true);
    window.addEventListener('focusin', handleInputActivity, true);

    return () => {
      window.removeEventListener('input', handleInputActivity, true);
      window.removeEventListener('keydown', handleInputActivity, true);
      window.removeEventListener('focusin', handleInputActivity, true);
    };
  }, []);

  // Trigger popup when conditions are met
  const triggerPopup = useCallback(() => {
    setCountdown(POPUP_DURATION_SEC);
    setIsOpen(true);
    safeStorage.setItem(STORAGE_KEY, Date.now().toString());

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsOpen(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Evaluation function: Only trigger if on Dashboard AND not inputting anything
  const evaluateReminder = useCallback(() => {
    // Must be on Dashboard page
    if (!isOnDashboard) return;

    // Must NOT be actively typing or having input focused
    if (isUserActivelyInputting()) return;

    const lastShownStr = safeStorage.getItem(STORAGE_KEY);
    const now = Date.now();

    if (!lastShownStr) {
      // First time opening app: trigger after brief delay
      triggerPopup();
    } else {
      const lastShown = parseInt(lastShownStr, 10);
      if (isNaN(lastShown) || now - lastShown >= ONE_HOUR_MS) {
        triggerPopup();
      }
    }
  }, [isOnDashboard, isUserActivelyInputting, triggerPopup]);

  // Check periodically every 5 seconds (fast check so it appears smoothly when user returns to Dashboard)
  useEffect(() => {
    // Initial evaluation with slight delay on mount
    const initialDelay = setTimeout(() => {
      evaluateReminder();
    }, 1200);

    checkIntervalRef.current = setInterval(() => {
      evaluateReminder();
    }, 5000);

    return () => {
      clearTimeout(initialDelay);
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [evaluateReminder]);

  const handleDismiss = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsOpen(false);
  };

  return (
    <AnimatePresence>
      {isOpen && isOnDashboard && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
          {/* Animated Blinking Card */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="relative w-full max-w-lg bg-gradient-to-b from-slate-900 via-amber-950/40 to-slate-950 text-white rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(245,158,11,0.35)] border-2 border-amber-400 overflow-hidden text-center"
            style={{
              animation: 'pulseBlink 1s infinite alternate ease-in-out'
            }}
          >
            {/* Blinking Ambient Light Header */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none animate-pulse"></div>

            {/* Glowing top progress countdown indicator */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-800">
              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: POPUP_DURATION_SEC, ease: 'linear' }}
                className="h-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 shadow-[0_0_10px_#f59e0b]"
              />
            </div>

            {/* Pulsing Attention Badge */}
            <div className="flex justify-center mb-4 mt-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-bounce">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
                <span className="text-amber-300 font-black text-xs uppercase tracking-widest">
                  Pemberitahuan Penting • {countdown}s
                </span>
              </div>
            </div>

            {/* Center Animated Icon with Blinking / Flashing Effect */}
            <div className="relative my-3 flex justify-center items-center">
              <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border-2 border-amber-400/50 flex items-center justify-center shadow-[0_0_25px_rgba(245,158,11,0.4)] animate-pulse">
                <i className="fas fa-bullhorn text-4xl text-amber-400 animate-wiggle"></i>
              </div>
            </div>

            {/* The Exact User Requested Message */}
            <div className="my-5 px-2">
              <h2 className="text-xl sm:text-2xl font-black text-amber-300 uppercase tracking-tight leading-snug drop-shadow-[0_2px_10px_rgba(245,158,11,0.5)]">
                &ldquo;GUYSS JANGAN LUPA INPUT BELANJA DAN ISI DAILY REVENUE NYA SETIAP HARI YAHH !!!&rdquo;
              </h2>
              <p className="mt-2 text-xs font-semibold text-slate-300 tracking-wide">
                Pastikan data omset harian dan pencatatan belanja outlet selalu terupdate tepat waktu.
              </p>
            </div>

            {/* Action Button to Dismiss or Confirm */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={handleDismiss}
                className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:shadow-[0_0_25px_rgba(245,158,11,0.6)] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <i className="fas fa-check-circle text-sm"></i>
                <span>SIAP, SAYA INPUT SEKARANG ({countdown}s)</span>
              </button>
            </div>

            {/* Custom CSS for Blinking Border Animation */}
            <style>{`
              @keyframes pulseBlink {
                0% {
                  border-color: #f59e0b;
                  box-shadow: 0 0 20px rgba(245, 158, 11, 0.4), inset 0 0 15px rgba(245, 158, 11, 0.2);
                }
                50% {
                  border-color: #fef08a;
                  box-shadow: 0 0 45px rgba(254, 240, 138, 0.8), inset 0 0 25px rgba(254, 240, 138, 0.4);
                }
                100% {
                  border-color: #f59e0b;
                  box-shadow: 0 0 20px rgba(245, 158, 11, 0.4), inset 0 0 15px rgba(245, 158, 11, 0.2);
                }
              }
              @keyframes wiggle {
                0%, 100% { transform: rotate(-5deg); }
                50% { transform: rotate(5deg); }
              }
              .animate-wiggle {
                animation: wiggle 0.6s infinite ease-in-out;
              }
            `}</style>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DailyReminderPopup;
