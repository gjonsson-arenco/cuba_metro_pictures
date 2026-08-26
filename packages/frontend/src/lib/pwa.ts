/**
 * Detección para el convite a instalar la app.
 *
 * Los dos caminos son distintos de raíz: en Android el navegador nos entrega un
 * evento y podemos abrir el diálogo nativo, mientras que iOS no expone ninguna
 * API de instalación y lo único posible es explicar el gesto manual.
 */

/** El evento que Chrome/Edge disparan cuando la app es instalable. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * iPadOS 13+ se declara "Macintosh" en el user agent para que le sirvan la web
 * de escritorio, así que el UA por sí solo no alcanza: lo que lo delata es que
 * un Mac de verdad no tiene pantalla táctil.
 */
export function detectIOS(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/**
 * Los navegadores dentro de otra app (Instagram, WhatsApp, Gmail) no ofrecen
 * "Agregar a inicio": hay que abrir el sitio en Safari primero. No hay forma
 * fiable de detectarlos, así que la ayuda lo aclara en texto.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return detectIOS(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** Ya instalada: iOS lo expone en navigator.standalone, el resto en display-mode. */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}
