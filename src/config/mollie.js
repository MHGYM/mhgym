const { createMollieClient } = require('@mollie/api-client');

// Lazily initialise the Mollie client so the server boots even when
// MOLLIE_API_KEY is not configured (e.g. Railway deploy without payment keys).
// The client is created once on the first actual payment call.
let _client = null;

function getClient() {
  if (!_client) {
    const key = process.env.MOLLIE_API_KEY;
    if (!key) {
      throw new Error(
        'MOLLIE_API_KEY is not set — payments are unavailable. ' +
        'Configure the env var to enable payment processing.'
      );
    }
    _client = createMollieClient({ apiKey: key });
  }
  return _client;
}

// Transparent proxy: consumers use `mollieClient.payments.create(...)` as
// before; the real client is only instantiated when first accessed.
module.exports = new Proxy({}, {
  get(_, prop) {
    return getClient()[prop];
  },
});
