/**
 * Is the user typing?
 *
 * Single-key shortcuts are only pleasant if they are impossible to trigger by
 * accident. Every global key handler asks this first, so pressing "a" in the
 * capture bar writes an "a" rather than archiving whatever happens to be
 * selected behind it.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Chords belong to the browser and the operating system. A shortcut that fires
 * on Ctrl+A or Cmd+S has stolen something the user needed more.
 */
export function hasModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}
