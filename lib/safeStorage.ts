
// In-memory fallback storage
const memoryStorage: Record<string, string> = {};

/**
 * Safe wrapper for localStorage to prevent "The operation is insecure" errors in iframes
 */
/**
 * Safe wrapper for localStorage and sessionStorage to prevent "The operation is insecure" errors in iframes
 */
const getStorage = (type: 'localStorage' | 'sessionStorage') => {
  try {
    if (typeof window === 'undefined') return null;
    
    // In some restricted environments, just accessing window.localStorage throws a SecurityError
    const storage = window[type];
    
    // Test if it's actually functional
    const testKey = `__storage_test__`;
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    
    return storage;
  } catch (e) {
    return null;
  }
};

const localStorageInstance = getStorage('localStorage');
const sessionStorageInstance = getStorage('sessionStorage');

export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (localStorageInstance) return localStorageInstance.getItem(key);
    } catch (e) {}
    return memoryStorage[key] || null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (localStorageInstance) {
        localStorageInstance.setItem(key, value);
        return;
      }
    } catch (e) {}
    memoryStorage[key] = value;
  },
  removeItem: (key: string): void => {
    try {
      if (localStorageInstance) {
        localStorageInstance.removeItem(key);
        return;
      }
    } catch (e) {}
    delete memoryStorage[key];
  },
  clear: (): void => {
    try {
      if (localStorageInstance) localStorageInstance.clear();
    } catch (e) {}
    Object.keys(memoryStorage).forEach(key => delete memoryStorage[key]);
  }
};

export const safeSessionStorage = {
  getItem: (key: string): string | null => {
    try {
      if (sessionStorageInstance) return sessionStorageInstance.getItem(key);
    } catch (e) {}
    return memoryStorage[`session_${key}`] || null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (sessionStorageInstance) {
        sessionStorageInstance.setItem(key, value);
        return;
      }
    } catch (e) {}
    memoryStorage[`session_${key}`] = value;
  },
  removeItem: (key: string): void => {
    try {
      if (sessionStorageInstance) {
        sessionStorageInstance.removeItem(key);
        return;
      }
    } catch (e) {}
    delete memoryStorage[`session_${key}`];
  }
};

/**
 * Safe wrapper for common window operations
 */
export const safeWindow = {
  scrollTo: function(options?: ScrollToOptions | number, y?: number): void {
    try {
      if (typeof window === 'undefined') return;
      if (typeof options === 'number') {
        window.scrollTo(options, y || 0);
      } else {
        window.scrollTo(options || { top: 0 });
      }
    } catch (e) {}
  },
  open: function(url?: string | URL, target?: string, features?: string): Window | null {
    try {
      if (typeof window === 'undefined') return null;
      return window.open(url, target, features);
    } catch (e) {
      console.warn('[SafeWindow] open failed:', e);
      return null;
    }
  },
  confirm: function(message?: string): boolean {
    try {
      if (typeof window === 'undefined') return false;
      return window.confirm(message);
    } catch (e) {
      return false;
    }
  },
  alert: function(message?: string): void {
    try {
      if (typeof window !== 'undefined') window.alert(message);
    } catch (e) {}
  },
  obj: function(): any {
    try {
      return (typeof window !== 'undefined') ? window : null;
    } catch (e) {
      return null;
    }
  },
  run: function(callback: (win: Window) => void): void {
    try {
      if (typeof window !== 'undefined') {
        callback(window);
      }
    } catch (e) {}
  },
  requestFullscreen: function(element?: HTMLElement): Promise<void> | void {
    try {
      if (typeof window === 'undefined') return;
      const doc = window.document as any;
      const el = element || doc.documentElement;
      
      const requestMethod = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (requestMethod) {
        return requestMethod.call(el);
      }
    } catch (e) {
      console.warn('[SafeWindow] requestFullscreen failed:', e);
    }
  },
  exitFullscreen: function(): Promise<void> | void {
    try {
      if (typeof window === 'undefined') return;
      const doc = window.document as any;
      const exitMethod = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (exitMethod) {
        return exitMethod.call(doc);
      }
    } catch (e) {
      console.warn('[SafeWindow] exitFullscreen failed:', e);
    }
  },
  isFullscreen: function(): boolean {
    try {
      if (typeof window === 'undefined') return false;
      const doc = window.document as any;
      return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
    } catch (e) {
      return false;
    }
  }
};

/**
 * Safe wrapper for navigator operations
 */
export const safeNavigator = {
  share: async (data: ShareData): Promise<boolean> => {
    try {
      if (typeof navigator === 'undefined') return false;
      const nav = navigator as any;
      if (nav.share) {
        await nav.share(data);
        return true;
      }
    } catch (e) {}
    return false;
  },
  userAgent: (): string => {
    try {
      return typeof navigator !== 'undefined' ? navigator.userAgent : '';
    } catch (e) {
      return '';
    }
  }
};


/**
 * Safe wrapper for navigator.clipboard to prevent "The operation is insecure" errors in iframes
 */
export const safeClipboard = {
  writeText: async (text: string): Promise<boolean> => {
    try {
      // Safely check for clipboard availability
      const isClipboardAvailable = !!(
        typeof navigator !== 'undefined' && 
        navigator.clipboard && 
        navigator.clipboard.writeText
      );

      if (isClipboardAvailable) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      console.warn('[SafeClipboard] navigator.clipboard.writeText failed:', e);
    }

    // Fallback to the classic execCommand('copy') method
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      
      // Ensure the textarea is not visible but part of the DOM
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      return successful;
    } catch (err) {
      console.error('[SafeClipboard] All copy methods failed:', err);
      return false;
    }
  }
};
