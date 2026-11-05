// Opt-in: lets a local run send some of the app's backend calls to locally
// running services (e.g. an unmerged service branch) while everything else
// keeps hitting the deployed services the frontend build points at.
//
// E2E_SERVICE_OVERRIDES='{"https://live-host.onrender.com":"http://localhost:3020"}'
//
// Unset (CI / deployed runs) → no-op.
export async function applyServiceOverrides(context) {
  const raw = process.env.E2E_SERVICE_OVERRIDES;
  if (!raw) return;
  const map = JSON.parse(raw);
  for (const [from, to] of Object.entries(map)) {
    await context.route(`${from}/**`, async (route) => {
      try {
        const response = await route.fetch({ url: to + route.request().url().slice(from.length) });
        await route.fulfill({ response });
      } catch {
        // Test/context already closed while a poll was in flight.
        await route.abort().catch(() => {});
      }
    });
  }
}
