export function createActionRouter(routeHandlers = {}) {
  return async function routeAction(action, payload = {}) {
    const handler = routeHandlers[action];
    if (typeof handler !== "function") {
      const error = new Error(`Invalid action: ${action}`);
      error.code = "INVALID_ACTION";
      throw error;
    }
    return handler(payload);
  };
}
