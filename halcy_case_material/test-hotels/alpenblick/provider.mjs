// ZahlBar, the payment provider: payment state, the bank verification page (pop-up) and the guest's phone.
import { randomInt, randomUUID } from 'node:crypto';
import { chf, esc } from './rules.mjs';
import { html, readForm, redirect, send } from './http.mjs';

export const PAY_PORT = Number(process.env.PAY3_PORT || 4601);
export const PAY_ORIGIN = `http://localhost:${PAY_PORT}`;
const MAX_TRIES = 3;
export const payments = new Map();
export const phone = [];

/** Called by the hotel after the card passed its checks. Only the last four digits ever reach here. */
export function createPayment({ resId, last4, outcome, amount, payNow, merchant, onResult }) {
  const id = randomUUID().slice(0, 8);
  const code = String(randomInt(100000, 1000000));
  const p = { id, resId, last4, outcome, code, tries: 0, status: 'pending', amount, payNow, merchant, onResult };
  payments.set(id, p);
  const what = payNow ? `Betrag ${chf(amount)}` : 'Kartenprüfung (Garantie)';
  phone.unshift({ at: new Date(), text: `ZahlBar: Ihr Bestätigungscode lautet ${code}. Händler: ${merchant}, ${what}, Karte •••• ${last4}. Geben Sie diesen Code niemals weiter.` });
  console.log(`[ZahlBar] Bestätigungscode für Zahlung ${id} (Karte •••• ${last4}): ${code}`);
  return { id, verifyUrl: `${PAY_ORIGIN}/verify/${id}` };
}

function settle(p, status) {
  p.status = status;
  p.onResult?.(p);
}

const page = (title, body) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} – ZahlBar</title><style>body{font-family:Arial,sans-serif;background:#eef1f6;margin:0}main{max-width:440px;margin:30px auto;background:#fff;padding:20px;border-radius:8px;border:1px solid #c9d0db}
h1{font-size:20px;color:#1d3c78}.err{color:#a00}.ok{color:#176b2c}input{font-size:20px;padding:6px;letter-spacing:4px;width:10em}button{background:#1d3c78;color:#fff;border:0;padding:10px 16px;border-radius:4px;font-size:16px}</style></head>
<body><main><p><strong>ZahlBar</strong> · Sichere Zahlungsbestätigung</p>${body}</main></body></html>`;

function verifyPage(p, msg = '') {
  const what = p.payNow ? `<p>Betrag: <strong>${chf(p.amount)}</strong></p>`
    : '<p>Kartenprüfung als Garantie. Es wird kein Betrag belastet.</p>';
  const head = `<h1>Zahlung bestätigen</h1><p>Händler: ${esc(p.merchant)}</p>${what}<p>Karte: •••• ${p.last4}</p>`;
  if (p.status === 'approved') {
    return page('Bestätigt', `${head}<p class="ok">Vielen Dank. Ihre Bank hat die Zahlung bestätigt. Sie können dieses Fenster schliessen und zum Hotel zurückkehren.</p>
<script>if(window.opener)setTimeout(()=>window.close(),3000)</script>`);
  }
  if (p.status === 'declined') {
    return page('Abgelehnt', `${head}<p class="err">Die Zahlung wurde von Ihrer Bank abgelehnt. Sie können dieses Fenster schliessen.</p>`);
  }
  return page('Bestätigen', `${head}${msg ? `<p class="err">${esc(msg)}</p>` : ''}
<p>Wir haben Ihnen einen sechsstelligen Bestätigungscode per SMS gesendet.</p>
<form method="post" action="/verify/${p.id}"><label for="code">Bestätigungscode</label><br>
<input id="code" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required>
<p><button type="submit">Bestätigen</button></p></form>`);
}

function phonePage() {
  const items = phone.map((m) => `<li><small>${m.at.toLocaleTimeString('de-CH', { timeZone: 'Europe/Zurich' })}</small><br>${esc(m.text)}</li>`).join('');
  return page('Telefon', `<h1>Mitteilungen</h1><meta http-equiv="refresh" content="5"><ul>${items || '<li>Keine Mitteilungen.</li>'}</ul>`);
}

export async function providerHandler(req, res) {
  const url = new URL(req.url, PAY_ORIGIN);
  const m = /^\/verify\/([\w-]+)$/.exec(url.pathname);
  if (m) {
    const p = payments.get(m[1]);
    if (!p) return html(res, page('Unbekannt', '<p class="err">Diese Zahlung ist unbekannt oder abgelaufen.</p>'), 404);
    if (req.method !== 'POST') return html(res, verifyPage(p));
    const { code = '' } = await readForm(req);
    if (p.status !== 'pending') return redirect(res, `/verify/${p.id}`);
    if (code.trim() === p.code) {
      settle(p, p.outcome === 'approve' ? 'approved' : 'declined');
      return redirect(res, `/verify/${p.id}`);
    }
    p.tries += 1;
    if (p.tries >= MAX_TRIES) { settle(p, 'declined'); return redirect(res, `/verify/${p.id}`); }
    const left = MAX_TRIES - p.tries;
    return html(res, verifyPage(p, `Der Code ist falsch. Sie haben noch ${left} ${left === 1 ? 'Versuch' : 'Versuche'}.`), 400);
  }
  if (url.pathname === '/__phone') return html(res, phonePage());
  if (url.pathname === '/') return html(res, page('ZahlBar', '<h1>ZahlBar</h1><p>Zahlungsdienst für Hotels in der Schweiz.</p>'));
  return send(res, 404, page('Nicht gefunden', '<p>Seite nicht gefunden.</p>'));
}
