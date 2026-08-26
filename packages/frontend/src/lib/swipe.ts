/**
 * The decision half of the fullscreen viewer's gestures, kept pure so it can be
 * tested without a touchscreen. `Lightbox` owns the touch events and the
 * animation; this only answers "what did that gesture mean?".
 */

/** Fraction of the screen width that commits to the next photo. */
export const SWIPE_COMMIT_RATIO = 0.22;
/** A quick flick counts even if it never travelled that far (px per ms). */
export const SWIPE_VELOCITY = 0.45;
/** How far down the photo is pulled before the viewer closes. */
export const DISMISS_DISTANCE = 110;
/** Movement before the gesture is locked to an axis, so a swipe never wobbles. */
export const AXIS_LOCK = 12;
/** A touch shorter and stiller than this is a tap, not a drag. */
export const TAP_MS = 300;

export type SwipeAxis = 'x' | 'y' | null;

export interface GestureInput {
  axis: SwipeAxis;
  /** Horizontal travel: negative goes forward, the way a carousel reads. */
  dx: number;
  /** Vertical travel: positive is downwards. */
  dy: number;
  elapsedMs: number;
  viewportWidth: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * `tap` toggles the controls, `cancel` springs back to centre, and the rest
 * name the navigation to run.
 */
export type GestureResult = 'next' | 'prev' | 'dismiss' | 'tap' | 'cancel';

/** Which way to lock once the finger has moved far enough to tell. */
export function lockAxis(dx: number, dy: number): SwipeAxis {
  if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/** How far the track follows the finger, damped when there is nothing to reach. */
export function dampedOffset(dx: number, hasPrev: boolean, hasNext: boolean): number {
  const blocked = (dx > 0 && !hasPrev) || (dx < 0 && !hasNext);
  return blocked ? dx * 0.3 : dx;
}

export function resolveGesture(input: GestureInput): GestureResult {
  const { axis, dx, dy, elapsedMs, viewportWidth, hasPrev, hasNext } = input;

  if (axis === null) {
    return elapsedMs < TAP_MS ? 'tap' : 'cancel';
  }

  if (axis === 'x') {
    const distance = Math.abs(dx);
    const flick = distance / Math.max(elapsedMs, 1) > SWIPE_VELOCITY && distance > AXIS_LOCK * 2;
    const past = distance > viewportWidth * SWIPE_COMMIT_RATIO;
    if (!past && !flick) return 'cancel';
    if (dx < 0) return hasNext ? 'next' : 'cancel';
    if (dx > 0) return hasPrev ? 'prev' : 'cancel';
    return 'cancel';
  }

  return dy > DISMISS_DISTANCE ? 'dismiss' : 'cancel';
}
