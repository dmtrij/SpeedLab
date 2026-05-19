(function exposeSpeedLabApi() {
  function createApiClient({ requestFailedMessage = "Request failed" } = {}) {
    async function requestJson(url, options = {}) {
      const response = await fetch(url, options);
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : { error: await response.text() };

      if (!response.ok) {
        throw new Error(payload.error || requestFailedMessage);
      }

      return payload;
    }

    return Object.freeze({
      requestJson
    });
  }

  window.SpeedLabApi = Object.freeze({
    createApiClient
  });
})();
