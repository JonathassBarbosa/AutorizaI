/**
 * Push via OneSignal (gratuito). O App ID vem do Apps Script (propriedade ONESIGNAL_APP_ID).
 * Sem App ID configurado, o app funciona normalmente só com as notificações internas.
 */
let iniciado = false;

function carregarSdk() {
  if (window.OneSignalDeferred) return;
  window.OneSignalDeferred = [];
  const s = document.createElement('script');
  s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  s.defer = true;
  document.head.appendChild(s);
}

function comOneSignal(fn) {
  return new Promise((resolve, reject) => {
    window.OneSignalDeferred.push(async OneSignal => {
      try { resolve(await fn(OneSignal)); } catch (e) { reject(e); }
    });
  });
}

export function pushDisponivel() {
  return 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
}

export async function iniciarPush(appId, usuario) {
  if (!appId || !usuario || !pushDisponivel()) return false;
  carregarSdk();
  const base = location.pathname.replace(/[^/]*$/, '');
  await comOneSignal(async OneSignal => {
    if (!iniciado) {
      await OneSignal.init({
        appId,
        serviceWorkerPath: base.replace(/^\//, '') + 'sw.js',
        serviceWorkerParam: { scope: base },
        allowLocalhostAsSecureOrigin: true,
        notifyButton: { enable: false },
      });
      iniciado = true;
    }
    await OneSignal.login(usuario.id); // liga o aparelho ao usuário (external_id)
  });
  return true;
}

export async function statusPush() {
  if (!pushDisponivel()) return 'indisponivel';
  if (!window.OneSignalDeferred || !iniciado) return 'nao-configurado';
  if (Notification.permission === 'denied') return 'bloqueado';
  return comOneSignal(OneSignal => (OneSignal.User.PushSubscription.optedIn ? 'ativo' : 'inativo'));
}

export async function ativarPush() {
  if (!iniciado) throw new Error('O push ainda não foi configurado pelo administrador (OneSignal).');
  return comOneSignal(async OneSignal => {
    await OneSignal.Notifications.requestPermission();
    await OneSignal.User.PushSubscription.optIn();
    return OneSignal.User.PushSubscription.optedIn;
  });
}

export async function desativarPush() {
  if (!iniciado) return;
  await comOneSignal(OneSignal => OneSignal.User.PushSubscription.optOut());
}

export async function sairPush() {
  if (!iniciado) return;
  try { await comOneSignal(OneSignal => OneSignal.logout()); } catch { /* ignora */ }
}
