import { useEffect } from 'react';

type KeyHandler = (event: KeyboardEvent) => void;

interface ShortcutMap {
  [key: string]: KeyHandler;
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInput && !event.metaKey && !event.ctrlKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const modifiers = {
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey,
      };

      for (const [shortcut, handler] of Object.entries(shortcuts)) {
        const parts = shortcut.toLowerCase().split('+');
        const shortcutKey = parts[parts.length - 1];
        const hasCtrl = parts.includes('ctrl') || parts.includes('cmd');
        const hasShift = parts.includes('shift');
        const hasAlt = parts.includes('alt');

        const keyMatches = key === shortcutKey;
        const modifiersMatch =
          (!hasCtrl || modifiers.ctrl || modifiers.meta) &&
          (!hasShift || modifiers.shift) &&
          (!hasAlt || modifiers.alt) &&
          (hasCtrl || hasShift || hasAlt || (!modifiers.ctrl && !modifiers.meta && !modifiers.shift && !modifiers.alt));

        if (keyMatches && modifiersMatch) {
          if (hasCtrl && (key === shortcutKey)) {
            const ctrlPressed = modifiers.ctrl || modifiers.meta;
            const shiftPressed = hasShift ? modifiers.shift : !modifiers.shift;
            const altPressed = hasAlt ? modifiers.alt : !modifiers.alt;

            if (ctrlPressed && shiftPressed && altPressed) {
              event.preventDefault();
              handler(event);
              break;
            }
          } else if (!hasCtrl && !hasShift && !hasAlt) {
            if (!modifiers.ctrl && !modifiers.meta && !modifiers.shift && !modifiers.alt && !isInput) {
              event.preventDefault();
              handler(event);
              break;
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
