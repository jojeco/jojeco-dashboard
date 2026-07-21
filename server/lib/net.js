// Shared low-level network helper. tcpCheck is used by the failover routes
// (routes/resilience.js) AND by the still-inline host-services health probe in
// server.js, so it lives here as a single shared implementation. Extracted from
// server.js (Phase 4 route split); body byte-identical.

// Resolve true/false for whether a TCP connect to host:port succeeds within
// timeoutMs. Dynamically imports 'net' so this module has no top-level cost.
export async function tcpCheck(host, port, timeoutMs = 3000) {
  const net = await import('net');
  return new Promise(resolve => {
    const sock = new net.default.Socket();
    const done = (ok) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeoutMs);
    sock.connect(port, host, () => done(true));
    sock.on('error', () => done(false));
    sock.on('timeout', () => done(false));
  });
}
