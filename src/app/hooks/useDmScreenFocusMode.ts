'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

const FOCUS_SHELL_ATTRIBUTE = 'data-app-focus-shell';
const DM_SCREEN_FOCUS_SHELL = 'dm-screen';

export interface DmScreenFocusModeApi {
  focusButtonRef: RefObject<HTMLButtonElement | null>;
  focused: boolean;
  nativeFullscreen: boolean;
  nativeFullscreenAvailable: boolean;
  statusMessage: string | null;
  toggleFocus: () => void;
  enterBrowserFullscreen: () => Promise<void>;
  exitFocus: () => void;
}

/**
 * Owns the transient display state for the DM Screen focus shell.
 *
 * Native fullscreen is deliberately kept separate from CSS focus mode: focus
 * mode still works when the Fullscreen API is unavailable or the browser
 * declines a fullscreen request.
 */
export function useDmScreenFocusMode(
  escapeBlocked: boolean,
): DmScreenFocusModeApi {
  const focusButtonRef = useRef<HTMLButtonElement>(null);
  const focusedRef = useRef(false);
  const disposedRef = useRef(false);
  const ownedFullscreenElementRef = useRef<Element | null>(null);
  const [focused, setFocused] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [nativeFullscreenAvailable, setNativeFullscreenAvailable] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const setCssFocus = useCallback((nextFocused: boolean) => {
    focusedRef.current = nextFocused;
    setFocused(nextFocused);

    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (nextFocused) {
      root.setAttribute(FOCUS_SHELL_ATTRIBUTE, DM_SCREEN_FOCUS_SHELL);
    } else if (root.getAttribute(FOCUS_SHELL_ATTRIBUTE) === DM_SCREEN_FOCUS_SHELL) {
      root.removeAttribute(FOCUS_SHELL_ATTRIBUTE);
    }
  }, []);

  const restoreFocus = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      focusButtonRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const closeCssFocus = useCallback(() => {
    setCssFocus(false);
    setStatusMessage('Focus screen closed.');
    restoreFocus();
  }, [restoreFocus, setCssFocus]);

  const exitFocus = useCallback(() => {
    if (typeof document === 'undefined') return;

    const ownedElement = ownedFullscreenElementRef.current;
    const ownsCurrentFullscreen = ownedElement !== null
      && document.fullscreenElement === ownedElement;

    closeCssFocus();

    if (!ownsCurrentFullscreen || typeof document.exitFullscreen !== 'function') {
      // A different feature may own fullscreen. Never exit it on its behalf.
      ownedFullscreenElementRef.current = null;
      setNativeFullscreen(false);
      return;
    }

    void document.exitFullscreen().catch(() => {
      const stillFullscreen = document.fullscreenElement === ownedElement;
      setNativeFullscreen(stillFullscreen);
      if (stillFullscreen) {
        setCssFocus(true);
        setStatusMessage('Browser fullscreen could not close. Focus screen is still on.');
      }
    });
  }, [closeCssFocus, setCssFocus]);

  const toggleFocus = useCallback(() => {
    if (focusedRef.current) {
      exitFocus();
      return;
    }

    setCssFocus(true);
    setStatusMessage('Focus screen is on.');
  }, [exitFocus, setCssFocus]);

  const enterBrowserFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;

    // Fullscreen enhances focus mode; it is not required for it.
    setCssFocus(true);
    focusButtonRef.current?.focus({ preventScroll: true });
    const root = document.documentElement;
    const fullscreenAvailable = typeof root.requestFullscreen === 'function'
      && typeof document.exitFullscreen === 'function'
      && document.fullscreenEnabled !== false;
    setNativeFullscreenAvailable(fullscreenAvailable);

    if (!fullscreenAvailable) {
      setStatusMessage('Browser fullscreen is unavailable. Focus screen is still on.');
      return;
    }

    if (document.fullscreenElement) {
      setNativeFullscreen(false);
      setStatusMessage('Another view is already using browser fullscreen. Focus screen is still on.');
      return;
    }

    ownedFullscreenElementRef.current = root;
    try {
      await root.requestFullscreen();
      const ownsFullscreen = document.fullscreenElement === root;
      if (disposedRef.current) {
        if (ownsFullscreen && typeof document.exitFullscreen === 'function') {
          await document.exitFullscreen().catch(() => undefined);
        }
        return;
      }
      setNativeFullscreen(ownsFullscreen);
      if (ownsFullscreen) {
        setStatusMessage('Browser fullscreen is on.');
      } else {
        ownedFullscreenElementRef.current = null;
        setStatusMessage('Browser fullscreen did not start. Focus screen is still on.');
      }
    } catch {
      if (disposedRef.current) return;
      ownedFullscreenElementRef.current = null;
      setNativeFullscreen(false);
      setStatusMessage('Browser fullscreen could not start. Focus screen is still on.');
    }
  }, [setCssFocus]);

  useEffect(() => {
    const root = document.documentElement;
    const initializationFrame = window.requestAnimationFrame(() => {
      setNativeFullscreenAvailable(
        typeof root.requestFullscreen === 'function'
          && typeof document.exitFullscreen === 'function'
          && document.fullscreenEnabled !== false,
      );
      setNativeFullscreen(false);
    });

    const handleFullscreenChange = () => {
      const fullscreenElement = document.fullscreenElement;
      const ownedElement = ownedFullscreenElementRef.current;
      setNativeFullscreen(Boolean(ownedElement && fullscreenElement === ownedElement));

      // Escape is handled by the browser in native fullscreen. Once the
      // browser reports that our fullscreen ended, close the CSS shell too.
      if (ownedElement && !fullscreenElement) {
        ownedFullscreenElementRef.current = null;
        closeCssFocus();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.cancelAnimationFrame(initializationFrame);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [closeCssFocus]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape'
        || event.defaultPrevented
        || escapeBlocked
        || !focusedRef.current
        || document.fullscreenElement
      ) return;

      event.preventDefault();
      closeCssFocus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeCssFocus, escapeBlocked]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      const root = document.documentElement;
      if (root.getAttribute(FOCUS_SHELL_ATTRIBUTE) === DM_SCREEN_FOCUS_SHELL) {
        root.removeAttribute(FOCUS_SHELL_ATTRIBUTE);
      }

      const ownedElement = ownedFullscreenElementRef.current;
      if (
        ownedElement
        && document.fullscreenElement === ownedElement
        && typeof document.exitFullscreen === 'function'
      ) {
        void document.exitFullscreen().catch(() => undefined);
      }
      ownedFullscreenElementRef.current = null;
    };
  }, []);

  return {
    focusButtonRef,
    focused,
    nativeFullscreen,
    nativeFullscreenAvailable,
    statusMessage,
    toggleFocus,
    enterBrowserFullscreen,
    exitFocus,
  };
}
