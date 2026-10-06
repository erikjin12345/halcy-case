// HTML for the public pages: layout, search, room list, conditions, directions, errors.
import { HOTEL, ROOMS, RATES, KURTAXE, chf, eur, esc, monthOptions, roomTotal, fmtDate, nightsLabel, guestsLabel, HOLD_MINUTES } from './rules.mjs';

const CSS = `body{font-family:Georgia,serif;margin:0;background:#f6f3ec;color:#2b2b2b}
header{background:#2f4f3a;color:#fff;padding:14px 20px}header a{color:#fff;margin-right:16px}
main{max-width:860px;margin:0 auto;padding:20px}.card{background:#fff;border:1px solid #d8d2c4;border-radius:6px;padding:16px;margin:14px 0}
.err{background:#fbe3e3;border:1px solid #c44;padding:10px;border-radius:4px}.ok{background:#e4f3e6;border:1px solid #4a8;padding:10px;border-radius:4px}
.hold{background:#fff6d6;border:1px solid #d9b84a;padding:10px;border-radius:4px}.small{font-size:13px;color:#555}
label{display:block;margin:10px 0 4px}input,select,textarea{font-size:16px;padding:6px}button,.btn{background:#2f4f3a;color:#fff;border:0;padding:10px 16px;border-radius:4px;font-size:16px;cursor:pointer;text-decoration:none}
dialog{border:1px solid #888;border-radius:8px;max-width:560px;width:90%}dialog::backdrop{background:rgba(0,0,0,.45)}
table{border-collapse:collapse;width:100%}td{padding:4px 0}td.r{text-align:right}tr.sum td{border-top:1px solid #999;font-weight:bold}`;

export function layout(title, body) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} – ${HOTEL}</title><style>${CSS}</style></head><body>
<header><strong>${HOTEL}</strong> · Interlaken<br><nav><a href="/">Startseite</a><a href="/anfahrt">Anfahrt</a><a href="/bedingungen">Buchungsbedingungen</a></nav></header>
<main>${body}</main><footer class="small" style="text-align:center;padding:20px">${HOTEL} · Höheweg 12 · 3800 Interlaken · Schweiz · +41 33 000 00 00</footer></body></html>`;
}

const opts = (items, selected) => items.map(([v, l]) =>
  `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(l)}</option>`).join('');
const range = (a, b, f) => Array.from({ length: b - a + 1 }, (_, i) => [a + i, f(a + i)]);

export function searchForm(q = {}, now = new Date()) {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const months = monthOptions(now);
  const tag = q.tag ?? tomorrow.getDate();
  const monat = q.monat ?? months.find((m) => m.value.endsWith(String(tomorrow.getMonth() + 1).padStart(2, '0')))?.value;
  return `<form method="get" action="/zimmer" class="card"><h2>Verfügbarkeit prüfen</h2>
<label for="tag">Anreisetag</label><select id="tag" name="tag">${opts(range(1, 31, (d) => `${d}.`), tag)}</select>
<label for="monat">Anreisemonat</label><select id="monat" name="monat">${opts(months.map((m) => [m.value, m.label]), monat)}</select>
<label for="naechte">Anzahl Nächte</label><select id="naechte" name="naechte">${opts(range(1, 14, nightsLabel), q.naechte ?? 2)}</select>
<label for="gaeste">Anzahl Gäste</label><select id="gaeste" name="gaeste">${opts(range(1, 4, guestsLabel), q.gaeste ?? 2)}</select>
<p><button type="submit">Zimmer anzeigen</button></p></form>`;
}

export function home(now) {
  return layout('Willkommen', `<h1>Grüezi und willkommen im ${HOTEL}</h1>
<p>Unser familiengeführter Gasthof liegt zwischen Thunersee und Brienzersee, mitten in Interlaken, mit Blick auf Eiger, Mönch und Jungfrau.
Drei Zimmerkategorien, Frühstück mit Produkten aus der Region inklusive.</p>
${searchForm({}, now)}
<p><a href="/anfahrt">Anfahrt und Lage</a> · <a href="/bedingungen">Buchungsbedingungen</a></p>`);
}

function rateDialog(rm, s) {
  const rows = RATES.map((rt) => {
    const total = roomTotal(rm, rt, s.naechte);
    return `<div class="card"><h3>${rt.name}</h3><p>${rt.desc}</p>
<p><strong>${chf(total)}</strong> für ${nightsLabel(s.naechte)}* <span class="small">(${eur(total)}, unverbindlicher Richtwert)</span></p>
<form method="post" action="/reservieren">
<input type="hidden" name="zimmer" value="${rm.id}"><input type="hidden" name="tarif" value="${rt.id}">
<input type="hidden" name="tag" value="${s.tag}"><input type="hidden" name="monat" value="${s.monat}">
<input type="hidden" name="naechte" value="${s.naechte}"><input type="hidden" name="gaeste" value="${s.gaeste}">
<button type="submit">Auswählen</button></form></div>`;
  }).join('');
  return `<dialog id="tarife-${rm.id}" aria-label="Tarife für ${rm.name}"><h2>${rm.name}: Tarife</h2>${rows}
<form method="dialog"><button type="submit">Schliessen</button></form></dialog>`;
}

export function roomList(s, now) {
  const cards = ROOMS.map((rm) => {
    const fits = rm.sleeps >= s.gaeste;
    const perNight = `<p><strong>${chf(rm.price)}</strong> pro Nacht* <span class="small">(${eur(rm.price)})</span><br>
${chf(rm.price * s.naechte)} für ${nightsLabel(s.naechte)}* <span class="small">(${eur(rm.price * s.naechte)})</span></p>`;
    return `<div class="card"><h2>${rm.name}</h2><p>${rm.desc}</p><p>Für bis zu ${guestsLabel(rm.sleeps)}.</p>${perNight}
${fits ? `<button type="button" onclick="document.getElementById('tarife-${rm.id}').showModal()">Buchen</button>${rateDialog(rm, s)}`
    : `<p class="err">Für ${guestsLabel(s.gaeste)} leider zu klein.</p>`}</div>`;
  }).join('');
  return layout('Zimmer', `<h1>Verfügbare Zimmer</h1>
<p>Anreise ${fmtDate(s.arrival)}, Abreise ${fmtDate(s.departure)} · ${nightsLabel(s.naechte)} · ${guestsLabel(s.gaeste)}</p>
${cards}
<p class="small">* Zuzüglich Kurtaxe von ${chf(KURTAXE)} pro Person und Nacht, zahlbar im Hotel. Frühstück inbegriffen.
Die Beträge in EUR sind ungefähre, unverbindliche Richtwerte; abgerechnet wird ausschliesslich in CHF.</p>
<details><summary>Suche ändern</summary>${searchForm(s, now)}</details>`);
}

export function searchError(msg, q, now) {
  return layout('Fehler', `<p class="err">${esc(msg)}</p>${searchForm(q, now)}`);
}

export const conditions = () => layout('Buchungsbedingungen', `<h1>Buchungsbedingungen</h1>
<h2>Tarif «Flexibel»</h2><p>Kostenlose Stornierung bis 2 Tage (48 Stunden) vor dem Anreisetag. Bei späterer Stornierung oder Nichterscheinen
wird die erste Nacht belastet. Bezahlung bei Abreise im Hotel; die Kreditkarte dient nur als Garantie.</p>
<h2>Tarif «Spartarif»</h2><p>Rund 12 % günstiger als der Tarif «Flexibel». Der Zimmerpreis und eine gewählte Servicepauschale werden bei der Buchung
vollständig belastet. Keine Stornierung, keine Änderung, keine Rückerstattung.</p>
<h2>Kurtaxe</h2><p>Die Kurtaxe der Gemeinde Interlaken beträgt ${chf(KURTAXE)} pro Person und Nacht und ist obligatorisch. Sie wird im Hotel bezahlt.</p>
<h2>Servicepauschale</h2><p>Die Servicepauschale von CHF 15.00 pro Aufenthalt ist freiwillig. Sie deckt Gepäckservice und Willkommensgetränk.</p>
<h2>Reservierung</h2><p>Nach der Wahl eines Tarifs ist das Zimmer ${HOLD_MINUTES} Minuten für Sie reserviert. Die Buchung muss im selben Browser abgeschlossen werden.</p>
<p>Check-in ab 15:00 Uhr, Check-out bis 11:00 Uhr. Haustiere auf Anfrage.</p>`);

export const directions = () => layout('Anfahrt', `<h1>Anfahrt</h1>
<p>${HOTEL}, Höheweg 12, 3800 Interlaken</p>
<h2>Mit der Bahn</h2><p>Vom Bahnhof Interlaken West sind es 5 Minuten zu Fuss. Vom Bahnhof Interlaken Ost etwa 15 Minuten zu Fuss.</p>
<h2>Mit dem Bus</h2><p>Die Bushaltestelle Interlaken West liegt 3 Minuten zu Fuss entfernt.</p>
<h2>Mit dem Auto</h2><p>Autobahn A8, Ausfahrt Interlaken West. Parkplätze hinter dem Haus, CHF 12.00 pro Tag.</p>`);

export const notFound = () => layout('Reservierung nicht gefunden', `<h1>Reservierung nicht gefunden</h1>
<p class="err">Reservierung nicht gefunden. Bitte schliessen Sie die Buchung im selben Browser ab, in dem Sie den Tarif gewählt haben.</p>
<p><a href="/">Neue Suche starten</a></p>`);

export const expired = () => layout('Reservierung abgelaufen', `<h1>Ihre Reservierung ist abgelaufen</h1>
<p class="err">Ihre Reservierung ist abgelaufen. Das Zimmer war ${HOLD_MINUTES} Minuten für Sie reserviert. Bitte starten Sie eine neue Suche.</p>
<p><a href="/">Neue Suche starten</a></p>`);

export const page404 = () => layout('Seite nicht gefunden', '<h1>Seite nicht gefunden</h1><p><a href="/">Zur Startseite</a></p>');
