import { describe, it, expect } from 'vitest';
import {
  resolveGesture,
  lockAxis,
  dampedOffset,
  GestureInput,
  DISMISS_DISTANCE,
  AXIS_LOCK,
  TAP_MS
} from '../lib/swipe';

const WIDTH = 390; // iPhone 15 logical width

function gesture(overrides: Partial<GestureInput> = {}): GestureInput {
  return {
    axis: 'x',
    dx: 0,
    dy: 0,
    elapsedMs: 200,
    viewportWidth: WIDTH,
    hasPrev: true,
    hasNext: true,
    ...overrides
  };
}

describe('lockAxis', () => {
  it('stays undecided until the finger has moved enough', () => {
    expect(lockAxis(5, 5)).toBeNull();
    expect(lockAxis(AXIS_LOCK - 1, AXIS_LOCK - 1)).toBeNull();
  });

  it('locks to the dominant direction', () => {
    expect(lockAxis(40, 10)).toBe('x');
    expect(lockAxis(-40, 10)).toBe('x');
    expect(lockAxis(10, 40)).toBe('y');
  });
});

describe('dampedOffset', () => {
  it('follows the finger when there is a neighbour', () => {
    expect(dampedOffset(-80, true, true)).toBe(-80);
    expect(dampedOffset(80, true, true)).toBe(80);
  });

  it('resists at the ends instead of sliding into nothing', () => {
    expect(dampedOffset(80, false, true)).toBeCloseTo(24);
    expect(dampedOffset(-80, true, false)).toBeCloseTo(-24);
  });
});

describe('resolveGesture', () => {
  it('reads a short still touch as a tap on the controls', () => {
    expect(resolveGesture(gesture({ axis: null, elapsedMs: 120 }))).toBe('tap');
  });

  it('ignores a long press that never moved', () => {
    expect(resolveGesture(gesture({ axis: null, elapsedMs: TAP_MS + 100 }))).toBe('cancel');
  });

  it('advances when the swipe passes the commit distance', () => {
    expect(resolveGesture(gesture({ dx: -WIDTH * 0.3 }))).toBe('next');
    expect(resolveGesture(gesture({ dx: WIDTH * 0.3 }))).toBe('prev');
  });

  it('springs back on a short slow drag', () => {
    expect(resolveGesture(gesture({ dx: -40, elapsedMs: 600 }))).toBe('cancel');
  });

  it('advances on a quick flick that never travelled far', () => {
    expect(resolveGesture(gesture({ dx: -60, elapsedMs: 80 }))).toBe('next');
  });

  it('does not treat a tiny fast twitch as a flick', () => {
    expect(resolveGesture(gesture({ dx: -20, elapsedMs: 20 }))).toBe('cancel');
  });

  it('refuses to move past either end', () => {
    expect(resolveGesture(gesture({ dx: -WIDTH * 0.5, hasNext: false }))).toBe('cancel');
    expect(resolveGesture(gesture({ dx: WIDTH * 0.5, hasPrev: false }))).toBe('cancel');
  });

  it('closes on a long pull down', () => {
    expect(resolveGesture(gesture({ axis: 'y', dy: DISMISS_DISTANCE + 1 }))).toBe('dismiss');
  });

  it('keeps the photo on a short pull down', () => {
    expect(resolveGesture(gesture({ axis: 'y', dy: DISMISS_DISTANCE - 1 }))).toBe('cancel');
  });

  it('never closes on an upward pull', () => {
    expect(resolveGesture(gesture({ axis: 'y', dy: -300 }))).toBe('cancel');
  });
});
