import { useEffect, useCallback, useState, useRef, ReactNode } from 'react';
import {
  Photo,
  SailingClass,
  RegattaDay,
  SAILING_CLASSES,
  SAILING_CLASS_LABELS,
  REGATTA_DAYS,
  REGATTA_DAY_LABELS
} from '@metro/shared';
import { isTouchDevice } from '../lib/device';
import {
  lockAxis,
  dampedOffset,
  resolveGesture,
  DISMISS_DISTANCE,
  type SwipeAxis
} from '../lib/swipe';

/**
 * Phones and tablets get a fullscreen viewer driven by gestures; desktop keeps
 * the framed lightbox with its arrows. Read once: a device does not grow a
 * mouse mid-session, and re-rendering the whole viewer on a resize would
 * interrupt a swipe.
 */
const TOUCH = isTouchDevice();

const ANIM_MS = 220;

interface LightboxProps {
  photo: Photo;
  /** Neighbours, so a swipe can drag the next photo in behind the finger. */
  prevPhoto?: Photo | null;
  nextPhoto?: Photo | null;
  /** 1-based position, shown as "3 / 24" in the fullscreen viewer. */
  index?: number;
  total?: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  /** Admin or editor: can rotate, delete and edit metadata. */
  canEdit: boolean;
  /** Phone: the original goes through the share sheet, so it can reach Fotos. */
  shareMode?: boolean;
  onDownload?: (photoId: string) => Promise<void> | void;
  onRotate?: (photoId: string, direction: 'cw' | 'ccw') => Promise<void> | void;
  onDelete?: (photoId: string) => Promise<void> | void;
  onMetadata?: (photoId: string, updates: { tags?: string[]; sailingClass?: SailingClass | null; day?: RegattaDay | null }) => Promise<void> | void;
}

function photoSrc(photo: Photo): string {
  return photo.urls?.medium ?? photo.urls?.original ?? photo.s3Key;
}

export default function Lightbox({
  photo,
  prevPhoto,
  nextPhoto,
  index,
  total,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  canEdit,
  shareMode = false,
  onDownload,
  onRotate,
  onDelete,
  onMetadata
}: LightboxProps) {
  const [busy, setBusy] = useState<null | 'download' | 'rotate-cw' | 'rotate-ccw' | 'delete' | 'meta'>(null);
  /** Fullscreen only: tapping the photo hides everything but the photo. */
  const [chromeVisible, setChromeVisible] = useState(true);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [animating, setAnimating] = useState(false);

  // The live delta lives on the ref as well as in state: `onTouchEnd` decides
  // from it, and reading state there would mean trusting that the last
  // `touchmove` render already flushed.
  const gesture = useRef<
    { x: number; y: number; t: number; axis: SwipeAxis; dx: number; dy: number } | null
  >(null);
  const commitTimer = useRef<number | null>(null);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft' && hasPrev) onPrev();
    if (e.key === 'ArrowRight' && hasNext) onNext();
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [handleKey]);

  // A new photo always starts centred and untransformed, however it arrived
  // (swipe, arrow key, or a delete pulling the next one into place).
  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setAnimating(false);
  }, [photo.photoId]);

  useEffect(() => () => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
  }, []);

  async function runAction(kind: NonNullable<typeof busy>, fn: () => Promise<void> | void) {
    if (busy) return;
    setBusy(kind);
    try { await fn(); } finally { setBusy(null); }
  }

  async function setClass(cls: SailingClass | null) {
    if (!onMetadata) return;
    await runAction('meta', () => onMetadata(photo.photoId, { sailingClass: cls }));
  }
  async function setDay(day: RegattaDay | null) {
    if (!onMetadata) return;
    await runAction('meta', () => onMetadata(photo.photoId, { day }));
  }

  async function removeTag(tag: string) {
    if (!onMetadata) return;
    const newTags = photo.tags.filter(t => t !== tag);
    await runAction('meta', () => onMetadata(photo.photoId, { tags: newTags }));
  }

  // ── Gestures (fullscreen viewer only) ──────────────────────────────────
  //
  // The track holds prev/current/next side by side and sits at -100%, so the
  // current photo is centred and its neighbours are one screen away. Dragging
  // moves the track with the finger; releasing either animates the neighbour
  // into place and then swaps `photo` (the pixels do not move at the swap), or
  // springs back.

  /**
   * Commits to a neighbour: 1 goes forward, -1 back. Also what the arrow
   * buttons call, so a tap and a swipe animate identically.
   */
  function commitSwipe(direction: 1 | -1) {
    // A second trigger mid-animation would strand the track off-centre.
    if (commitTimer.current !== null) return;
    setAnimating(true);
    setOffset({ x: -direction * window.innerWidth, y: 0 });
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      // Batched with the navigation, so the new photo renders already centred.
      setAnimating(false);
      setOffset({ x: 0, y: 0 });
      if (direction === 1) onNext();
      else onPrev();
    }, ANIM_MS);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1 || commitTimer.current !== null) return;
    const t = e.touches[0];
    gesture.current = { x: t.clientX, y: t.clientY, t: Date.now(), axis: null, dx: 0, dy: 0 };
    setAnimating(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    const g = gesture.current;
    if (!g || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;

    if (g.axis === null) {
      g.axis = lockAxis(dx, dy);
      if (g.axis === null) return;
    }

    if (g.axis === 'x') {
      // Resist at the ends: the photo gives a little, but there is nothing there.
      g.dx = dampedOffset(dx, hasPrev, hasNext);
      g.dy = 0;
    } else {
      // Only downwards dismisses; pulling up just resists.
      g.dx = 0;
      g.dy = dy > 0 ? dy : dy * 0.3;
    }
    setOffset({ x: g.dx, y: g.dy });
  }

  function onTouchEnd() {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;

    const outcome = resolveGesture({
      axis: g.axis,
      dx: g.dx,
      dy: g.dy,
      elapsedMs: Date.now() - g.t,
      viewportWidth: window.innerWidth,
      hasPrev,
      hasNext
    });

    if (outcome === 'next') return commitSwipe(1);
    if (outcome === 'prev') return commitSwipe(-1);
    if (outcome === 'dismiss') return onClose();
    if (outcome === 'tap') setChromeVisible(v => !v);

    setAnimating(true);
    setOffset({ x: 0, y: 0 });
  }

  // ── Shared pieces ──────────────────────────────────────────────────────

  const hasChips = !!(photo.sailingClass || photo.day || photo.tags.length);
  const metadataChips = hasChips ? (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {photo.sailingClass && (
        <span className="inline-flex items-center gap-2 bg-white/10 text-white text-xs px-3 py-1 rounded-full">
          <img
            src={`/classes/${photo.sailingClass}.svg`}
            alt=""
            aria-hidden
            className="h-3.5 w-auto"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          {SAILING_CLASS_LABELS[photo.sailingClass]}
        </span>
      )}
      {photo.day && (
        <span className="bg-white text-cuba-navy text-xs font-semibold px-3 py-1 rounded-full">
          {REGATTA_DAY_LABELS[photo.day]}
        </span>
      )}
      {photo.tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 bg-white/15 text-white text-xs px-2 py-1 rounded-full">
          {tag}
          {canEdit && onMetadata && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => removeTag(tag)}
              aria-label={`Quitar ${tag}`}
              title={`Quitar ${tag}`}
              className="text-white/60 hover:text-white text-sm leading-none disabled:opacity-50"
            >
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  ) : null;

  const hasActions = onDownload || (canEdit && (onRotate || onDelete));
  const actionBar = hasActions ? (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-black/50 rounded-full px-3 py-2">
      {onDownload && (
        <ActionButton
          label={shareMode ? 'Guardar' : 'Descargar'}
          icon={shareMode ? '⇪' : '⬇'}
          disabled={busy !== null}
          loading={busy === 'download'}
          onClick={() => runAction('download', () => onDownload(photo.photoId))}
        />
      )}
      {canEdit && onRotate && (
        <>
          <ActionButton
            label="Rotar ↺"
            icon="↺"
            disabled={busy !== null}
            loading={busy === 'rotate-ccw'}
            onClick={() => runAction('rotate-ccw', () => onRotate(photo.photoId, 'ccw'))}
          />
          <ActionButton
            label="Rotar ↻"
            icon="↻"
            disabled={busy !== null}
            loading={busy === 'rotate-cw'}
            onClick={() => runAction('rotate-cw', () => onRotate(photo.photoId, 'cw'))}
          />
        </>
      )}
      {canEdit && onDelete && (
        <ActionButton
          label="Eliminar"
          icon="🗑"
          danger
          disabled={busy !== null}
          loading={busy === 'delete'}
          onClick={() => {
            if (!window.confirm('¿Eliminar esta foto?')) return;
            return runAction('delete', () => onDelete(photo.photoId));
          }}
        />
      )}
    </div>
  ) : null;

  const metadataEditor = canEdit && onMetadata ? (
    <div className="flex flex-col gap-2 bg-black/60 backdrop-blur rounded-2xl px-4 py-3 max-w-2xl">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-white/60 w-14">Clase</span>
        {SAILING_CLASSES.map(cls => {
          const active = photo.sailingClass === cls;
          return (
            <button
              key={cls}
              disabled={busy !== null}
              onClick={() => setClass(active ? null : cls)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors disabled:opacity-50 ${
                active
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent text-white/85 border-white/25 hover:bg-white/10'
              }`}
            >
              <img
                src={`/classes/${cls}.svg`}
                alt=""
                aria-hidden
                className="h-3 w-auto"
                style={active ? { filter: 'brightness(0)' } : { filter: 'brightness(0) invert(1)' }}
              />
              {SAILING_CLASS_LABELS[cls]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-white/60 w-14">Día</span>
        {REGATTA_DAYS.map(d => {
          const active = photo.day === d;
          return (
            <button
              key={d}
              disabled={busy !== null}
              onClick={() => setDay(active ? null : d)}
              className={`px-2.5 py-1 rounded-full border text-xs transition-colors disabled:opacity-50 ${
                active
                  ? 'bg-white text-cuba-navy border-white'
                  : 'bg-transparent text-white/85 border-white/25 hover:bg-white/10'
              }`}
            >
              {REGATTA_DAY_LABELS[d]}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  // ── Fullscreen viewer (touch) ──────────────────────────────────────────

  if (TOUCH) {
    const dismissProgress = Math.min(Math.max(offset.y, 0) / (DISMISS_DISTANCE * 3), 1);

    return (
      <div className="fixed inset-0 z-50 bg-black overflow-hidden select-none" style={{ height: '100dvh' }}>
        <div
          className="h-full w-full"
          style={{ touchAction: 'none' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div
            className="flex h-full w-full will-change-transform"
            style={{
              transform: `translate3d(calc(-100% + ${offset.x}px), ${offset.y}px, 0) scale(${1 - dismissProgress * 0.15})`,
              transition: animating ? `transform ${ANIM_MS}ms ease-out` : 'none',
              opacity: 1 - dismissProgress * 0.6
            }}
          >
            <Slide photo={prevPhoto} />
            <Slide photo={photo} />
            <Slide photo={nextPhoto} />
          </div>
        </div>

        <Chrome visible={chromeVisible}>
          <div
            className={`${chromeVisible ? 'pointer-events-auto' : ''} absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8`}
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
          >
            <button
              onClick={onClose}
              className="text-white text-2xl w-10 h-10 flex items-center justify-center rounded-full bg-black/40"
              aria-label="Cerrar"
            >
              ✕
            </button>
            {index !== undefined && total !== undefined && (
              <span className="text-white/80 text-sm tabular-nums">
                {index} / {total}
              </span>
            )}
          </div>

          {/*
            Arrows, even with the swipe working: Safari owns the swipe that
            starts at either screen edge (back/forward), so the gesture alone
            is not a dependable way to reach the next photo. Inset from the
            edge, and a 48px target.
          */}
          {hasPrev && (
            <button
              onClick={() => commitSwipe(-1)}
              className={`${chromeVisible ? 'pointer-events-auto' : ''} absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-black/40 text-white text-3xl leading-none`}
              aria-label="Anterior"
            >
              ‹
            </button>
          )}
          {hasNext && (
            <button
              onClick={() => commitSwipe(1)}
              className={`${chromeVisible ? 'pointer-events-auto' : ''} absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-black/40 text-white text-3xl leading-none`}
              aria-label="Siguiente"
            >
              ›
            </button>
          )}

          {(metadataChips || actionBar || metadataEditor) && (
            <div
              className={`${chromeVisible ? 'pointer-events-auto' : ''} absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pt-12 max-h-[55vh] overflow-y-auto`}
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
            >
              {metadataChips}
              {actionBar}
              {metadataEditor}
            </div>
          )}
        </Chrome>
      </div>
    );
  }

  // ── Framed lightbox (desktop) ──────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300 z-10 w-10 h-10 flex items-center justify-center"
        aria-label="Cerrar"
      >
        ✕
      </button>

      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10 w-12 h-12 flex items-center justify-center bg-black/30 rounded-full"
          aria-label="Anterior"
        >
          ‹
        </button>
      )}

      <div
        className="relative max-w-5xl max-h-[90vh] mx-16 flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          key={photoSrc(photo)}
          src={photoSrc(photo)}
          alt={photo.filename}
          className="max-h-[72vh] max-w-full object-contain rounded-lg"
        />

        {metadataChips}
        {actionBar}
        {metadataEditor}
      </div>

      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10 w-12 h-12 flex items-center justify-center bg-black/30 rounded-full"
          aria-label="Siguiente"
        >
          ›
        </button>
      )}
    </div>
  );
}

/** One screen of the swipe track. Neighbours render so they are already decoded. */
function Slide({ photo }: { photo?: Photo | null }) {
  return (
    <div className="h-full w-full shrink-0 flex items-center justify-center">
      {photo && (
        <img
          src={photoSrc(photo)}
          alt={photo.filename}
          draggable={false}
          className="max-h-full max-w-full object-contain pointer-events-none"
        />
      )}
    </div>
  );
}

/**
 * Kept mounted and faded out rather than unmounted: a tap that hides the
 * controls should not also drop the scroll position of the editor below.
 *
 * The layer itself never takes pointer events — the middle of the screen has
 * to stay swipeable — so each bar inside opts back in with `pointer-events-auto`,
 * and drops it again while hidden so an invisible button cannot be tapped.
 */
function Chrome({ visible, children }: { visible: boolean; children: ReactNode }) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
}

function ActionButton({ label, icon, onClick, disabled, loading, danger }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-sm text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
        danger ? 'bg-red-600/80 hover:bg-red-600' : 'bg-white/15 hover:bg-white/25'
      }`}
    >
      <span aria-hidden>{loading ? '…' : icon}</span>
      <span>{label}</span>
    </button>
  );
}
