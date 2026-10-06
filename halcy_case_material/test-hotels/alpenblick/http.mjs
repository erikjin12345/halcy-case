// Tiny HTTP helpers shared by both servers.
export function readForm(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(body))));
    req.on('error', reject);
  });
}
export function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
export const html = (res, body, status = 200, headers = {}) => send(res, status, body, undefined, headers);
export const json = (res, obj, status = 200) => send(res, status, JSON.stringify(obj, null, 2), 'application/json; charset=utf-8');
export function redirect(res, location, headers = {}) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...headers });
  res.end();
}
export function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('='))
    .filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
