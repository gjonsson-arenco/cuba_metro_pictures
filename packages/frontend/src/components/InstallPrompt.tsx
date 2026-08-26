import { useEffect, useState } from 'react';
import { isTouchDevice } from '../lib/device';
import { BeforeInstallPromptEvent, isIOS, isInstalled } from '../lib/pwa';

const DISMISS_KEY = 'metro.installDismissed';

/** El glifo de Compartir de iOS: el cuadrado con la flecha para arriba. */
function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 inline-block align-text-bottom" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M4 13v6a2 2 0 002 2h12a2 2 0 002-2v-6" />
    </svg>
  );
}

/**
 * Convite a instalar la app, sólo en teléfonos y sólo si todavía no lo está.
 *
 * En Android el navegador nos pasa el evento `beforeinstallprompt` y el botón
 * abre el diálogo nativo. En iOS no hay nada equivalente — Safari no
 * implementa ese evento y no existe forma de disparar la instalación desde la
 * página — así que lo único que se puede hacer es mostrar el gesto manual.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      // Modo privado: que no poder recordar la decisión no rompa la galería.
      return false;
    }
  });

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      // Sin el preventDefault, Chrome muestra su propio cartel cuando quiere.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDeferred(null);
      setDismissed(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* sin localStorage vuelve a aparecer en la próxima visita, y está bien */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // El evento es de un solo uso: si lo rechaza, el navegador nos dará otro
    // más adelante si corresponde.
    setDeferred(null);
    if (outcome === 'accepted') setDismissed(true);
  }

  const ios = isIOS();

  if (dismissed || !isTouchDevice() || isInstalled()) return null;
  // En Android sin evento no hay nada que ofrecer: o ya está instalada, o el
  // navegador todavía no la considera instalable.
  if (!ios && !deferred) return null;

  return (
    <div className="card p-4 mb-6 border-l-4 border-l-cuba-navy">
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" aria-hidden className="h-10 w-10 rounded-lg shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-bold text-cuba-navy">
            Tené la galería a mano
          </h2>
          <p className="text-sm text-cuba-navy/70 mt-0.5">
            Instalala en tu teléfono y se abre como una app, sin la barra del navegador.
          </p>

          {showSteps && (
            <ol className="text-sm text-cuba-navy/80 mt-3 space-y-1.5 list-decimal list-inside">
              <li>
                Tocá <ShareGlyph /> <strong>Compartir</strong>, abajo en la barra de Safari.
              </li>
              <li>
                Deslizá y elegí <strong>Agregar a inicio</strong>.
              </li>
              <li>
                Confirmá con <strong>Agregar</strong>.
              </li>
              <li className="list-none pt-1 text-xs text-cuba-navy/55">
                ¿No ves la opción? Estás dentro de otra app (Instagram, WhatsApp).
                Abrí <strong>metrocuba.org</strong> en Safari y probá de nuevo.
              </li>
            </ol>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {ios ? (
              <button
                onClick={() => setShowSteps(v => !v)}
                className="btn-primary text-sm py-1.5 px-3"
                aria-expanded={showSteps}
              >
                {showSteps ? 'Listo' : 'Cómo se instala'}
              </button>
            ) : (
              <button onClick={install} className="btn-primary text-sm py-1.5 px-3">
                Instalar
              </button>
            )}
            <button onClick={dismiss} className="btn-secondary text-sm py-1.5 px-3">
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
