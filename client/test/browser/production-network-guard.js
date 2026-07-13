const PRODUCTION_API_PATTERN = /^https:\/\/(?:api\.liotan\.(?:com|ru)|api-tunnel\.liotan\.com)(?:\/|$)/i;

function installProductionApiGuard(test) {
  let escapedRequests = [];

  test.beforeEach(async ({ context }) => {
    escapedRequests = [];
    await context.route(PRODUCTION_API_PATTERN, route => {
      escapedRequests.push(route.request().url());
      return route.abort("blockedbyclient");
    });
  });

  test.afterEach(() => {
    if (escapedRequests.length) {
      throw new Error(`Production browser test attempted real API access: ${escapedRequests.join(", ")}`);
    }
  });
}

module.exports = { installProductionApiGuard };
