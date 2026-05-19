(function exposeSpeedLabCustomSelect() {
  const SELECT_ROOT = "[data-custom-select]";
  const SELECT_BUTTON = "[data-custom-select-button]";
  const SELECT_MENU = "[data-custom-select-menu]";
  const SELECT_OPTION = "[data-custom-select-option]";

  let documentEventsBound = false;

  function escapeText(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getOptionParts(option) {
    if (option?.dataset?.parts) {
      try {
        const parts = JSON.parse(option.dataset.parts);
        if (Array.isArray(parts) && parts.length) {
          return parts.map(String);
        }
      } catch {
      }
    }

    return [option?.textContent?.trim() || ""];
  }

  function renderLabel(parts) {
    return `
      <span class="custom-select-option-label">
        ${parts.map((part) => `<span>${escapeText(part)}</span>`).join("")}
      </span>
    `;
  }

  function closeMenus(exceptMenu = null) {
    document.querySelectorAll(SELECT_MENU).forEach((menu) => {
      if (menu !== exceptMenu) {
        menu.classList.add("is-hidden");
      }
    });

    document.querySelectorAll(SELECT_BUTTON).forEach((button) => {
      const menu = button.closest(SELECT_ROOT)?.querySelector(SELECT_MENU);
      button.setAttribute("aria-expanded", String(menu && !menu.classList.contains("is-hidden")));
    });
  }

  function bindDocumentEvents() {
    if (documentEventsBound) {
      return;
    }

    documentEventsBound = true;
    document.addEventListener("click", (event) => {
      if (!event.target?.closest?.(SELECT_ROOT)) {
        closeMenus();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenus();
      }
    });
  }

  function bindRenderedSelects(root = document, onChange = null) {
    bindDocumentEvents();

    root.querySelectorAll(SELECT_ROOT).forEach((selectRoot) => {
      if (selectRoot.dataset.customSelectBound === "1") {
        return;
      }

      const button = selectRoot.querySelector(SELECT_BUTTON);
      const menu = selectRoot.querySelector(SELECT_MENU);
      if (!button || !menu) {
        return;
      }

      selectRoot.dataset.customSelectBound = "1";
      button.addEventListener("click", () => {
        if (button.disabled) {
          return;
        }

        closeMenus(menu);
        const isHidden = menu.classList.toggle("is-hidden");
        button.setAttribute("aria-expanded", String(!isHidden));
      });

      selectRoot.querySelectorAll(SELECT_OPTION).forEach((option) => {
        option.addEventListener("click", () => {
          const value = option.getAttribute("data-value") || "";
          menu.classList.add("is-hidden");
          button.setAttribute("aria-expanded", "false");

          if (typeof onChange === "function") {
            onChange({
              action: selectRoot.getAttribute("data-select-action") || "",
              option,
              selectRoot,
              value
            });
          }
        });
      });
    });
  }

  function syncNativeSelect(select, customRoot) {
    const button = customRoot.querySelector(SELECT_BUTTON);
    const buttonText = button?.querySelector("[data-custom-select-value]");
    const menu = customRoot.querySelector(SELECT_MENU);
    const selectedOption = select.options[select.selectedIndex];
    const selectedLabel = selectedOption?.textContent || "";

    if (buttonText) {
      buttonText.textContent = selectedLabel;
    }
    if (button) {
      button.disabled = select.disabled;
    }
    customRoot.classList.toggle("is-disabled", select.disabled);
    menu?.querySelectorAll(SELECT_OPTION).forEach((item) => {
      item.classList.toggle("is-selected", item.dataset.value === select.value);
    });
  }

  function enhanceNativeSelects(root = document) {
    root.querySelectorAll("select").forEach((select) => {
      if (select.dataset.customSelectBound === "1") {
        return;
      }

      select.dataset.customSelectBound = "1";
      select.classList.add("native-select-hidden");

      const customRoot = document.createElement("div");
      const button = document.createElement("button");
      const buttonText = document.createElement("span");
      const menu = document.createElement("div");

      customRoot.className = "custom-select form-custom-select";
      customRoot.dataset.customSelect = "";
      customRoot.dataset.nativeSelectName = select.name || "";
      button.className = "custom-select-button";
      button.type = "button";
      button.setAttribute("data-custom-select-button", "");
      button.setAttribute("aria-expanded", "false");
      buttonText.setAttribute("data-custom-select-value", "");
      button.append(buttonText);
      menu.className = "custom-select-menu is-hidden";
      menu.setAttribute("data-custom-select-menu", "");

      Array.from(select.options).forEach((option) => {
        const item = document.createElement("button");
        item.className = "custom-select-option";
        item.type = "button";
        item.dataset.value = option.value;
        item.setAttribute("data-custom-select-option", "");
        item.innerHTML = renderLabel(getOptionParts(option));
        item.addEventListener("click", () => {
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          menu.classList.add("is-hidden");
          button.setAttribute("aria-expanded", "false");
        });
        menu.append(item);
      });

      select.addEventListener("change", () => syncNativeSelect(select, customRoot));
      customRoot.append(button, menu);
      select.insertAdjacentElement("afterend", customRoot);
      syncNativeSelect(select, customRoot);
    });

    bindRenderedSelects(root);
  }

  window.SpeedLabCustomSelect = Object.freeze({
    bindRenderedSelects,
    closeMenus,
    enhanceNativeSelects
  });
})();
