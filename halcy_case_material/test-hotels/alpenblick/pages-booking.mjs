// HTML for the booking steps: guest details, payment (with bank pop-up and polling), confirmation.
import { room, rate, quote, chf, esc, fmtDate, nightsLabel, guestsLabel, holdSentence, KURTAXE, SERVICE } from './rules.mjs';
import { layout } from './pages.mjs';

const stay = (res) => `<p><strong>${room(res.roomId).name}</strong>, Tarif «${rate(res.rateId).name}»<br>
Anreise ${fmtDate(res.arrival)} · Abreise ${fmtDate(res.departure)} · ${nightsLabel(res.naechte)} · ${guestsLabel(res.gaeste)}</p>`;
const hold = (res) => `<p class="hold">${holdSentence(res.expiresAt)}</p>`;
const row = (label, amount, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="r">${chf(amount)}</td></tr>`;

export function totals(res) {
  const q = quote({ roomId: res.roomId, rateId: res.rateId, nights: res.naechte, guests: res.gaeste, service: res.service });
  return `<table>${row(`Zimmer (${nightsLabel(res.naechte)}, Tarif «${rate(res.rateId).name}»)`, q.room)}
${q.service ? row('Servicepauschale', q.service) : ''}
${row(`Kurtaxe (${guestsLabel(res.gaeste)} × ${nightsLabel(res.naechte)} × ${chf(KURTAXE)}), zahlbar im Hotel`, q.kurtaxe)}
${row('Gesamtbetrag', q.total, 'sum')}${row('Heute fällig', q.dueNow)}${row('Im Hotel fällig', q.dueAtHotel)}</table>`;
}

const field = (name, label, v, type = 'text', extra = '') =>
  `<label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(v)}" ${extra}>`;

export function details(res, errors = [], v = res.guest || {}) {
  const q = quote({ roomId: res.roomId, rateId: res.rateId, nights: res.naechte, guests: res.gaeste, service: false });
  return layout('Ihre Angaben', `<h1>Ihre Angaben</h1>${hold(res)}${stay(res)}
<p>Zimmerpreis: ${chf(q.room)} · zuzüglich Kurtaxe ${chf(q.kurtaxe)} (im Hotel zahlbar)</p>
${errors.length ? `<div class="err">${errors.map((e) => `<p>${esc(e)}</p>`).join('')}</div>` : ''}
<form method="post" action="/angaben?r=${res.id}" class="card">
${field('vorname', 'Vorname', v.vorname, 'text', 'required autocomplete="given-name"')}
${field('nachname', 'Nachname', v.nachname, 'text', 'required autocomplete="family-name"')}
${field('email', 'E-Mail-Adresse', v.email, 'email', 'required autocomplete="email"')}
${field('telefon', 'Telefonnummer', v.telefon, 'tel', 'required autocomplete="tel"')}
<label for="wuensche">Besondere Wünsche (freiwillig)</label><textarea id="wuensche" name="wuensche" rows="3">${esc(v.wuensche)}</textarea>
<label><input type="checkbox" name="service" value="1"${res.service ? ' checked' : ''}> Servicepauschale ${chf(SERVICE)} pro Aufenthalt (Gepäckservice und Willkommensgetränk, freiwillig)</label>
<p><button type="submit">Weiter zur Zahlung</button></p></form>`);
}

export function payment(res, error = '') {
  const rt = rate(res.rateId), p = res.payment;
  const pending = p && p.status === 'pending';
  const declined = p && p.status === 'declined';
  const msg = error || (declined ? 'Ihre Karte wurde abgelehnt. Bitte versuchen Sie es mit einer anderen Karte.' : '');
  const button = rt.payNow ? 'Zahlungspflichtig buchen' : 'Karte hinterlegen';
  return layout('Zahlung', `<h1>Überprüfen und bezahlen</h1>${hold(res)}${stay(res)}
<p>Gast: ${esc(res.guest.vorname)} ${esc(res.guest.nachname)} · <a href="/angaben?r=${res.id}">Angaben ändern</a></p>
<div class="card">${totals(res)}</div>
<p>${rt.payNow ? 'Der heute fällige Betrag wird sofort von Ihrer Karte abgebucht.'
    : 'Heute wird nichts abgebucht. Ihre Karte dient nur als Garantie; Sie bezahlen im Hotel.'}</p>
<div id="status">${msg ? `<p class="err">${esc(msg)}</p>` : ''}${pending ? waiting(p.verifyUrl) : ''}</div>
<form id="zahlung" method="post" action="/zahlung/karte?r=${res.id}" class="card"${pending ? ' hidden' : ''}>
<h2>Kartenangaben</h2>
${field('karte', 'Kartennummer', '', 'text', 'required inputmode="numeric" autocomplete="cc-number"')}
${field('ablauf', 'Gültig bis (MM/JJ)', '', 'text', 'required placeholder="MM/JJ" autocomplete="cc-exp"')}
${field('cvc', 'Prüfnummer (CVC)', '', 'text', 'required inputmode="numeric" autocomplete="cc-csc"')}
${field('inhaber', 'Karteninhaber', '', 'text', 'required autocomplete="cc-name"')}
<label><input type="checkbox" name="agb" value="1" required> Ich akzeptiere die Buchungsbedingungen</label>
<p class="small"><a href="/bedingungen" target="_blank">Buchungsbedingungen lesen</a></p>
<p><button type="submit">${button}</button></p></form>
<script>${script(res.id, pending)}</script>`);
}

function waiting(url) {
  return `<div class="hold"><p>Bitte bestätigen Sie die Zahlung im Fenster Ihrer Bank (ZahlBar). Den Bestätigungscode erhalten Sie per SMS.</p>
<p>Kein Fenster geöffnet? <a href="${esc(url)}" target="_blank" rel="opener">Bankbestätigung in neuem Tab öffnen</a></p></div>`;
}

function script(id, pending) {
  return `const f=document.getElementById('zahlung'),st=document.getElementById('status');let t=null;
function err(m){const p=document.createElement('p');p.className='err';p.textContent=m;st.replaceChildren(p);f.hidden=false;}
function wait(u){st.innerHTML=${JSON.stringify(waiting('URL'))}.replace('URL',u);f.hidden=true;}
function poll(){clearInterval(t);t=setInterval(async()=>{try{const j=await (await fetch('/zahlung/status?r=${id}')).json();
if(j.status==='approved'){clearInterval(t);location.href='/bestaetigung?r=${id}';}
else if(j.status==='declined'){clearInterval(t);err('Ihre Karte wurde abgelehnt. Bitte versuchen Sie es mit einer anderen Karte.');}
else if(j.status==='expired'||j.status==='notfound'){clearInterval(t);location.reload();}}catch(e){}},2000);}
f.addEventListener('submit',async(e)=>{e.preventDefault();const w=window.open('','zahlbar');
try{const r=await fetch(f.action,{method:'POST',headers:{'Accept':'application/json'},body:new URLSearchParams(new FormData(f))});
const j=await r.json();if(!j.ok){if(w)w.close();if(j.reload)location.reload();else err(j.error);return;}
if(w)w.location.href=j.verifyUrl;wait(j.verifyUrl);poll();}catch(x){if(w)w.close();err('Verbindungsfehler. Bitte versuchen Sie es erneut.');}});
${pending ? 'poll();' : ''}`;
}

export function confirmation(res) {
  const b = res.booking, rt = rate(res.rateId);
  const card = rt.payNow ? `Bezahlt mit Karte •••• ${b.last4}` : `Karte •••• ${b.last4} als Garantie hinterlegt`;
  return layout('Buchung bestätigt', `<h1>Vielen Dank, ${esc(res.guest.vorname)}. Ihre Buchung ist bestätigt.</h1>
<p class="ok">Buchungsnummer: <strong>${b.ref}</strong></p>${stay(res)}
<p>Gast: ${esc(res.guest.vorname)} ${esc(res.guest.nachname)} · ${esc(res.guest.email)}</p>
<div class="card">${totals(res)}</div><p>${card}</p>
<p>Eine Bestätigung wurde an ${esc(res.guest.email)} gesendet. Wir freuen uns auf Ihren Besuch in Interlaken!</p>
<p><a href="/anfahrt">Anfahrt</a> · <a href="/bedingungen">Buchungsbedingungen</a></p>`);
}
