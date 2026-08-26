/**
 * A coarse pointer means a finger, not a mouse: phone or tablet.
 *
 * Two features hang off this — the share sheet (the only way an image reaches
 * the iOS Photos app) and the fullscreen swipeable viewer — and both should
 * leave desktop exactly as it was.
 */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}
