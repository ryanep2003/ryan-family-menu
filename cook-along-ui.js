function durationSeconds(text = "") {
  const match = `${text}`.match(/(?:for\s+)?(\d+)\s*(minutes?|mins?|hours?|hrs?)/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  return /hour|hr/i.test(match[2]) ? amount * 3600 : amount * 60;
}

export { durationSeconds, formatTimer };

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${`${remainder}`.padStart(2, "0")}`;
}

export function createCookAlongUi({ $, t, localize, escapeHtml, getLang = () => "en", saveSession }) {
  let recipe = null;
  let stepIndex = 0;
  let timerSeconds = 0;
  let timerHandle = null;
  let session = { servings: "", leftovers: "", note: "", outcome: "made" };

  function clearTimer() {
    if (timerHandle) window.clearTimeout(timerHandle);
    timerHandle = null;
  }

  function scheduleTimer() {
    clearTimer();
    if (timerSeconds <= 0) return;
    timerHandle = window.setTimeout(() => {
      timerSeconds = Math.max(0, timerSeconds - 1);
      render();
      scheduleTimer();
    }, 1000);
  }

  function render() {
    const panel = $("#cookAlongPanel");
    if (!panel) return;
    if (!recipe) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    panel.hidden = false;
    const steps = recipe.steps?.[getLang()] || recipe.steps?.[getLang() === "es" ? "en" : "es"] || recipe.steps || [];
    const currentStep = steps[stepIndex] || "";
    const complete = stepIndex >= steps.length;
    panel.innerHTML = complete ? `
      <div class="cook-along-heading">
        <div><p class="section-label">${t("cookAlongLabel")}</p><h3>${t("cookAlongComplete")}</h3></div>
        <button class="text-button" type="button" data-cook-close>${t("close")}</button>
      </div>
      <p class="cook-along-helper">${t("cookAlongFinishHelper")}</p>
      <form class="cook-along-finish" data-cook-finish>
        <label><span>${t("cookAlongServings")}</span><input name="servings" type="number" min="0.5" max="100" step="0.5" inputmode="decimal" value="${escapeHtml(session.servings)}" /></label>
        <label><span>${t("cookAlongLeftovers")}</span><input name="leftovers" type="number" min="0" max="100" step="0.5" inputmode="decimal" value="${escapeHtml(session.leftovers)}" /></label>
        <label class="cook-along-note"><span>${t("cookAlongNote")}</span><textarea name="note" rows="3" maxlength="500">${escapeHtml(session.note)}</textarea></label>
        <fieldset><legend>${t("cookAlongOutcome")}</legend><div class="cook-along-outcomes">
          ${[["loved", "cookAlongLoved"], ["made", "cookAlongMade"], ["mixed", "cookAlongMixed"], ["skip", "cookAlongSkip"]].map(([value, label]) => `<button type="button" class="${session.outcome === value ? "selected" : ""}" data-cook-outcome="${value}" aria-pressed="${session.outcome === value}">${t(label)}</button>`).join("")}
        </div></fieldset>
        <button class="primary-action" type="submit">${t("cookAlongSave")}</button>
      </form>
    ` : `
      <div class="cook-along-heading">
        <div><p class="section-label">${t("cookAlongLabel")}</p><h3>${escapeHtml(localize(recipe.name))}</h3></div>
        <button class="text-button" type="button" data-cook-close>${t("close")}</button>
      </div>
      <p class="cook-along-progress">${t("cookAlongStep").replace("{current}", stepIndex + 1).replace("{total}", steps.length)}</p>
      <article class="cook-along-step"><p>${escapeHtml(localize(currentStep))}</p></article>
      <div class="cook-along-actions">
        ${durationSeconds(localize(currentStep)) ? `<button class="ghost-button" type="button" data-cook-timer>${timerSeconds ? t("cookAlongTimerRunning").replace("{time}", formatTimer(timerSeconds)) : t("cookAlongStartTimer")}</button>` : ""}
        <button class="ghost-button" type="button" data-cook-voice>${t("cookAlongVoice")}</button>
        <button class="primary-action" type="button" data-cook-next>${stepIndex === steps.length - 1 ? t("cookAlongFinish") : t("cookAlongNext")}</button>
      </div>
      <p class="cook-along-status" role="status" aria-live="polite"></p>
    `;
    bind();
  }

  function bind() {
    $("#cookAlongPanel")?.querySelector?.("[data-cook-close]")?.addEventListener("click", stop);
    $("#cookAlongPanel")?.querySelector?.("[data-cook-next]")?.addEventListener("click", () => {
      const steps = recipe.steps?.[getLang()] || recipe.steps?.[getLang() === "es" ? "en" : "es"] || recipe.steps || [];
      stepIndex += 1;
      timerSeconds = 0;
      clearTimer();
      render();
      if (stepIndex >= steps.length) $("#cookAlongPanel")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
    $("#cookAlongPanel")?.querySelector?.("[data-cook-timer]")?.addEventListener("click", () => {
      if (timerSeconds) return;
      const steps = recipe.steps?.[getLang()] || recipe.steps?.[getLang() === "es" ? "en" : "es"] || recipe.steps || [];
      timerSeconds = durationSeconds(localize(steps[stepIndex]));
      render();
      scheduleTimer();
    });
    $("#cookAlongPanel")?.querySelector?.("[data-cook-voice]")?.addEventListener("click", () => {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const status = $("#cookAlongPanel")?.querySelector?.(".cook-along-status");
      if (!Recognition) {
        if (status) status.textContent = t("cookAlongVoiceUnavailable");
        return;
      }
      const recognition = new Recognition();
      recognition.lang = document.documentElement.lang || "en-US";
      recognition.onresult = () => { stepIndex += 1; render(); };
      recognition.onerror = () => { if (status) status.textContent = t("cookAlongVoiceUnavailable"); };
      recognition.start();
      if (status) status.textContent = t("cookAlongListening");
    });
    $("#cookAlongPanel")?.querySelectorAll?.("[data-cook-outcome]").forEach((button) => button.addEventListener("click", () => {
      session.outcome = button.dataset.cookOutcome;
      render();
    }));
    $("#cookAlongPanel")?.querySelector?.("[data-cook-finish]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      session = { ...session, servings: form.get("servings"), leftovers: form.get("leftovers"), note: form.get("note") };
      const button = event.currentTarget.querySelector("[type=submit]");
      button.disabled = true;
      try {
        await saveSession({ ...session, recipe });
        stop();
      } catch {
        button.disabled = false;
        const status = $("#cookAlongPanel")?.querySelector?.(".cook-along-status");
        if (status) status.textContent = t("saveFailed");
      }
    });
  }

  function start(nextRecipe) {
    clearTimer();
    recipe = nextRecipe;
    stepIndex = 0;
    timerSeconds = 0;
    session = { servings: "", leftovers: "", note: "", outcome: "made" };
    render();
    $("#cookAlongPanel")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function stop() {
    clearTimer();
    recipe = null;
    render();
  }

  return { start, stop, render };
}
