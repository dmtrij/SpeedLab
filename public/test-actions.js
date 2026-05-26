(function exposeSpeedLabTestActions() {
  function createTestActions({ loadTestPage, navigate, requestJson } = {}) {
    if (typeof loadTestPage !== "function" || typeof navigate !== "function" || typeof requestJson !== "function") {
      throw new Error("SpeedLab test actions require loadTestPage, navigate, and requestJson.");
    }

    function syncCustomSelectSelection(selectRoot, option) {
      if (!selectRoot || !option) {
        return;
      }

      const button = selectRoot.querySelector("[data-custom-select-button]");
      if (button) {
        button.innerHTML = option.innerHTML;
      }

      selectRoot.querySelectorAll("[data-custom-select-option]").forEach((item) => {
        item.classList.toggle("is-selected", item === option);
      });
    }

    function bindAssetInventoryFilters(root = document) {
      const filter = root.querySelector("[data-asset-inventory-filter]");
      const inventory = root.querySelector("[data-asset-inventory]");

      if (!filter || !inventory) {
        return;
      }

      const totalCounter = filter.querySelector("[data-asset-filter-count]");
      const shortcutButtons = Array.from(root.querySelectorAll("[data-asset-shortcut]"));
      const items = Array.from(inventory.querySelectorAll("[data-asset-item]"));
      const sections = Array.from(inventory.querySelectorAll("[data-asset-section]"));

      function setFilterValue(action, value) {
        if (action === "asset-sort") {
          filter.dataset.assetSortValue = value || "transfer";
        } else if (action === "asset-min-weight") {
          filter.dataset.assetMinWeightValue = value || "0";
        } else if (action === "asset-recommendation") {
          filter.dataset.assetRecommendationValue = value || "all";
        }

        const selectRoot = filter.querySelector(`[data-select-action="${action}"]`);
        const option = Array.from(selectRoot?.querySelectorAll("[data-custom-select-option]") || [])
          .find((item) => item.dataset.value === value);

        if (option) {
          syncCustomSelectSelection(selectRoot, option);
        }
      }

      function numericDataset(item, name, fallback = 0) {
        const value = Number(item.dataset[name]);
        return Number.isFinite(value) ? value : fallback;
      }

      function textDataset(item, name) {
        return String(item.dataset[name] || "").toLowerCase();
      }

      function compareByMode(mode, left, right) {
        switch (mode) {
          case "blocking":
            return (
              (numericDataset(right, "assetBlockingReports") - numericDataset(left, "assetBlockingReports")) ||
              (numericDataset(right, "assetBlocking") - numericDataset(left, "assetBlocking")) ||
              (numericDataset(right, "assetTransfer") - numericDataset(left, "assetTransfer"))
            );
          case "unused":
            return (
              (numericDataset(right, "assetUnused") - numericDataset(left, "assetUnused")) ||
              (numericDataset(right, "assetTransfer") - numericDataset(left, "assetTransfer"))
            );
          case "early":
            return (
              (numericDataset(left, "assetStart", 999999999) - numericDataset(right, "assetStart", 999999999)) ||
              (numericDataset(right, "assetTransfer") - numericDataset(left, "assetTransfer"))
            );
          case "late-heavy":
            return (
              (numericDataset(right, "assetStart", 0) - numericDataset(left, "assetStart", 0)) ||
              (numericDataset(right, "assetTransfer") - numericDataset(left, "assetTransfer"))
            );
          case "source":
            return (
              textDataset(left, "assetSource").localeCompare(textDataset(right, "assetSource")) ||
              (numericDataset(right, "assetTransfer") - numericDataset(left, "assetTransfer"))
            );
          case "transfer":
          default:
            return (
              (numericDataset(right, "assetTransfer") - numericDataset(left, "assetTransfer")) ||
              (numericDataset(right, "assetBlocking") - numericDataset(left, "assetBlocking")) ||
              (numericDataset(right, "assetUnused") - numericDataset(left, "assetUnused"))
            );
        }
      }

      function sortSections() {
        const mode = filter.dataset.assetSortValue || "transfer";

        sections.forEach((section) => {
          const list = section.querySelector(".asset-inventory-list");
          if (!list) {
            return;
          }

          Array.from(list.querySelectorAll("[data-asset-item]"))
            .sort((left, right) =>
              compareByMode(mode, left, right) ||
              textDataset(left, "assetFile").localeCompare(textDataset(right, "assetFile"))
            )
            .forEach((item) => list.appendChild(item));
        });
      }

      function applyFilters() {
        const minKib = Number(filter.dataset.assetMinWeightValue || 0);
        const recommendation = filter.dataset.assetRecommendationValue || "all";
        let shownTotal = 0;

        items.forEach((item) => {
          const itemKib = Number(item.dataset.assetKib || 0);
          const itemRecommendation = item.dataset.assetRecommendation || "";
          const visible = itemKib >= minKib && (recommendation === "all" || itemRecommendation === recommendation);

          item.hidden = !visible;
          if (visible) {
            shownTotal += 1;
          }
        });

        sections.forEach((section) => {
          const sectionItems = Array.from(section.querySelectorAll("[data-asset-item]"));
          const shownInSection = sectionItems.filter((item) => !item.hidden).length;
          const counter = section.querySelector("[data-asset-section-count]");

          if (counter) {
            counter.textContent = `${shownInSection} / ${sectionItems.length} показано`;
          }
        });

        if (totalCounter) {
          totalCounter.textContent = `${shownTotal} / ${items.length} показано`;
        }
      }

      function updateInventory() {
        sortSections();
        applyFilters();
      }

      filter.addEventListener("asset-filter-change", updateInventory);
      shortcutButtons.forEach((button) => {
        button.addEventListener("click", () => {
          if (button.dataset.shortcutSort) {
            setFilterValue("asset-sort", button.dataset.shortcutSort);
          }
          if (button.dataset.shortcutMin) {
            setFilterValue("asset-min-weight", button.dataset.shortcutMin);
          }
          if (button.dataset.shortcutRecommendation) {
            const requestedRecommendation = button.dataset.shortcutRecommendation;
            const recommendationRoot = filter.querySelector('[data-select-action="asset-recommendation"]');
            const hasOption = Array.from(recommendationRoot?.querySelectorAll("[data-custom-select-option]") || [])
              .some((option) => option.dataset.value === requestedRecommendation);

            setFilterValue("asset-recommendation", hasOption ? requestedRecommendation : "all");
          }

          updateInventory();
          inventory.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      updateInventory();
    }

    function bindTestDetailActions(testId) {
      window.SpeedLabCustomSelect.bindRenderedSelects(document, ({ action, option, selectRoot, value }) => {
        if (action === "asset-sort" || action === "asset-min-weight" || action === "asset-recommendation") {
          syncCustomSelectSelection(selectRoot, option);
          const filter = document.querySelector("[data-asset-inventory-filter]");
          if (filter) {
            if (action === "asset-sort") {
              filter.dataset.assetSortValue = value || "transfer";
            } else if (action === "asset-min-weight") {
              filter.dataset.assetMinWeightValue = value || "0";
            } else {
              filter.dataset.assetRecommendationValue = value || "all";
            }
            filter.dispatchEvent(new Event("asset-filter-change"));
          }
          return;
        }

        if (action === "open-test" && value && value !== String(testId)) {
          navigate(`/test/${value}`);
          return;
        }

        if (action === "baseline") {
          const url = new URL(window.location.href);
          if (value) {
            url.searchParams.set("baseline", value);
          } else {
            url.searchParams.delete("baseline");
          }
          history.replaceState({}, "", `${url.pathname}${url.search}`);
          loadTestPage(testId);
        }
      });

      const repeatButton = document.querySelector("[data-repeat-test]");
      if (repeatButton) {
        repeatButton.addEventListener("click", async () => {
          const response = await requestJson(`/api/tests/${testId}/retry`, { method: "POST" });
          navigate(`/test/${response.testId}`);
        });
      }

      const cancelButton = document.querySelector("[data-cancel-test]");
      if (cancelButton) {
        cancelButton.addEventListener("click", async () => {
          if (!window.confirm(`\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0442\u0435\u0441\u0442 #${testId}?`)) {
            return;
          }

          await requestJson(`/api/tests/${testId}/cancel`, { method: "POST" });
          loadTestPage(testId);
        });
      }

      const resetBaselineButton = document.querySelector("[data-reset-baseline]");
      if (resetBaselineButton) {
        resetBaselineButton.addEventListener("click", () => {
          const url = new URL(window.location.href);
          if (!url.searchParams.has("baseline")) {
            return;
          }

          url.searchParams.delete("baseline");
          history.replaceState({}, "", `${url.pathname}${url.search}`);
          loadTestPage(testId);
        });
      }

      bindAssetInventoryFilters(document);
    }

    return Object.freeze({
      bindTestDetailActions
    });
  }

  window.SpeedLabTestActions = Object.freeze({
    createTestActions
  });
})();
