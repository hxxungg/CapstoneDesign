import { useLayoutEffect, useRef } from 'react';
import { Platform } from 'react-native';

function resolveDomNode(ref, fallbackId) {
  const node = ref?.current;
  if (node) {
    if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) return node;
    if (node._nativeNode instanceof HTMLElement) return node._nativeNode;
  }
  if (typeof document !== 'undefined' && fallbackId) {
    return document.getElementById(fallbackId);
  }
  return null;
}

function resetDockStyles(dock) {
  dock.style.position = '';
  dock.style.left = '';
  dock.style.width = '';
  dock.style.bottom = '';
  dock.style.zIndex = '';
  dock.style.boxSizing = '';
  dock.style.paddingLeft = '';
  dock.style.paddingRight = '';
  dock.style.backgroundColor = '';
  dock.style.transition = '';
}

/**
 * Web: 작성창만 visualViewport 하단(키보드 바로 위)에 fixed 고정
 * bottom = innerHeight - offsetTop - viewport.height
 */
export default function useVisualViewportPin(
  dockRef,
  anchorRef,
  { dockId, anchorId, isActiveRef } = {},
) {
  const rafRef = useRef(null);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof window === 'undefined' || !window.visualViewport) return undefined;

    const viewport = window.visualViewport;

    const apply = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const dock = resolveDomNode(dockRef, dockId);
        const anchor = resolveDomNode(anchorRef, anchorId);
        if (!dock || !anchor) return;

        const bottomInset = Math.max(
          0,
          Math.round(window.innerHeight - viewport.offsetTop - viewport.height),
        );
        const rect = anchor.getBoundingClientRect();
        const textarea = dock.querySelector('textarea, input, [contenteditable="true"]');
        const domFocused = textarea && document.activeElement === textarea;
        const active = isActiveRef?.current || domFocused;

        if (bottomInset > 0 && active) {
          dock.style.position = 'fixed';
          dock.style.left = `${rect.left}px`;
          dock.style.width = `${rect.width}px`;
          dock.style.bottom = `${bottomInset}px`;
          dock.style.zIndex = '9999';
          dock.style.boxSizing = 'border-box';
          dock.style.paddingLeft = '14px';
          dock.style.paddingRight = '14px';
          dock.style.backgroundColor = '#F7F4EC';
          dock.style.transition = 'bottom 0.25s ease';
        } else {
          resetDockStyles(dock);
        }
      });
    };

    const scheduleApply = () => {
      apply();
      setTimeout(apply, 80);
      setTimeout(apply, 280);
    };

    scheduleApply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    document.addEventListener('focusin', scheduleApply);
    document.addEventListener('focusout', () => setTimeout(apply, 120));

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      document.removeEventListener('focusin', scheduleApply);
      document.removeEventListener('focusout', apply);
      const dock = resolveDomNode(dockRef, dockId);
      if (dock) resetDockStyles(dock);
    };
  }, [dockRef, anchorRef, dockId, anchorId, isActiveRef]);
}
