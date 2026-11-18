export async function sendOpsAlert(events, url = process.env.OPS_ALERT_URL, request = fetch) {
  if (!url || !events.length) return;
  const destination = new URL(url);
  if (destination.protocol !== 'https:' || destination.username || destination.password || destination.hash) {
    throw Error('invalid alert destination');
  }
  const response = await request(destination, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'sales-coach', events, at: new Date().toISOString() }),
  });
  await response.body?.cancel();
  if (!response.ok) throw Error('alert delivery failed');
}
