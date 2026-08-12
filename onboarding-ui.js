const DISMISSED_KEY = "dinner-quick-guide-dismissed";

export function createOnboardingUi({ $, $$, storage, setView, openInventory }) {
  function isDismissed() {
    try {
      return storage.getItem(DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  }

  function setDismissed() {
    try {
      storage.setItem(DISMISSED_KEY, "true");
    } catch {
      // The guide remains optional when browser storage is unavailable.
    }
  }

  function setOpen(open) {
    $("#quickGuide").hidden = !open;
    $("#quickGuideToggle").setAttribute("aria-expanded", `${open}`);
  }

  function bind() {
    $("#quickGuideToggle").addEventListener("click", () => {
      const opening = $("#quickGuide").hidden;
      if (opening) setView("today");
      setOpen(opening);
    });

    $("#dismissQuickGuide").addEventListener("click", () => {
      setDismissed();
      setOpen(false);
      $("#quickGuideToggle").focus({ preventScroll: true });
    });

    $$('[data-guide-view]').forEach((button) => {
      button.addEventListener("click", () => {
        setDismissed();
        setOpen(false);
        setView(button.dataset.guideView);
        if (button.dataset.guideInventory === "home") openInventory();
      });
    });

    // Keep the first task visible; the guide remains one tap away in the header.
    setOpen(false);
  }

  return { bind, setOpen };
}
