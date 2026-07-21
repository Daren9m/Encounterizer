'use client';

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface DmScreenModalProps {
  open: boolean;
  eyebrow: string;
  title: string;
  description?: string;
  variant: 'spotlight' | 'tray';
  returnFocusRef?: RefObject<HTMLElement | null>;
  suppressReturnFocusRef?: RefObject<boolean>;
  onClose: () => void;
  children: ReactNode;
}

export default function DmScreenModal({
  open,
  eyebrow,
  title,
  description,
  variant,
  returnFocusRef,
  suppressReturnFocusRef,
  onClose,
  children,
}: DmScreenModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const previousBodyOverflow = document.body.style.overflow;
    const returnFocusTarget = returnFocusRef?.current;
    const shellElements = Array.from(document.querySelectorAll<HTMLElement>('[data-app-shell]'));
    const previousInert = shellElements.map((element) => ({ element, inert: element.inert }));
    document.body.style.overflow = 'hidden';
    shellElements.forEach((element) => {
      element.inert = true;
    });
    const focusFrame = window.requestAnimationFrame(() => headingRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      previousInert.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      if (suppressReturnFocusRef?.current) {
        suppressReturnFocusRef.current = false;
      } else {
        window.requestAnimationFrame(() => returnFocusTarget?.focus({ preventScroll: true }));
      }
    };
  }, [open, returnFocusRef, suppressReturnFocusRef]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) {
      event.preventDefault();
      headingRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const activeIsFocusable = active instanceof HTMLElement && focusable.includes(active);
    if (event.shiftKey && (!activeIsFocusable || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!activeIsFocusable || active === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/75 p-2 backdrop-blur-sm print:hidden sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={description ? descriptionId : undefined}
        onKeyDown={handleKeyDown}
        className={`${variant === 'spotlight' ? 'max-w-[96rem]' : 'max-w-3xl'} flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-[var(--steel-700)] bg-[var(--steel-950)] shadow-[var(--shadow-float)]`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--steel-800)] bg-[var(--steel-900)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="micro-label">{eyebrow}</p>
            <h2
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 w-fit break-words rounded text-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bronze)]"
            >{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm text-[var(--text-3)]">{description}</p>}
          </div>
          <button type="button" className="btn-ghost shrink-0 !px-3 text-sm" onClick={onClose}>
            <X size={17} aria-hidden="true" /> Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
