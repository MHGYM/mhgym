import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

// ── Service Worker registratie ────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[SW] Geregistreerd:', reg.scope);

      // Luister naar navigatieboodschappen van de SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'NAVIGATE' && event.data?.url) {
          window.location.href = event.data.url;
        }
      });
    }).catch((err) => {
      console.warn('[SW] Registratie mislukt:', err);
    });
  });
}

// ── Push notificatie setup helper (gebruikt door app) ─────────────────────────
export async function subscribeToPush(apiInstance) {
  if (!('PushManager' in window)) return null;

  try {
    const vapidRes   = await apiInstance.get('/pt/vapid-key');
    const publicKey  = vapidRes.data.publicKey;
    if (!publicKey) return null;

    const reg        = await navigator.serviceWorker.ready;
    const existing   = await reg.pushManager.getSubscription();
    if (existing) {
      await apiInstance.post('/pt/push/subscribe', existing.toJSON());
      return existing;
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await apiInstance.post('/pt/push/subscribe', subscription.toJSON());
    console.log('[Push] Abonnement opgeslagen.');
    return subscription;
  } catch (err) {
    console.warn('[Push] Mislukt:', err.message);
    return null;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
