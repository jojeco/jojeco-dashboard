// Shared Docker client layer — talks to the host Docker daemon over the mounted
// /var/run/docker.sock. Extracted from server.js (Phase 3 backend refactor) so
// every route that touches Docker uses one implementation. Behaviour is
// byte-identical to the original inline helper.
import http from 'http';

export function dockerRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = { socketPath: '/var/run/docker.sock', path, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(options, dres => {
      let data = '';
      dres.on('data', chunk => data += chunk);
      dres.on('end', () => {
        try { resolve({ status: dres.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: dres.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
