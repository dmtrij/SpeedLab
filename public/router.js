(function exposeSpeedLabRouter() {
  function createRouter({ render, beforeNavigate = () => {} } = {}) {
    if (typeof render !== "function") {
      throw new Error("SpeedLab router requires a render function.");
    }

    function renderCurrentRoute() {
      render();
    }

    function navigate(path) {
      beforeNavigate();
      history.pushState({}, "", path);
      renderCurrentRoute();
    }

    function bindLinkDelegation() {
      document.addEventListener("click", (event) => {
        const link = event.target.closest("[data-link]");
        if (!link) {
          return;
        }

        const href = link.getAttribute("href");
        if (!href) {
          return;
        }

        event.preventDefault();
        navigate(href);
      });
    }

    function start() {
      bindLinkDelegation();
      window.addEventListener("popstate", renderCurrentRoute);
      document.addEventListener("DOMContentLoaded", renderCurrentRoute);
    }

    return Object.freeze({
      navigate,
      start
    });
  }

  window.SpeedLabRouter = Object.freeze({
    createRouter
  });
})();
