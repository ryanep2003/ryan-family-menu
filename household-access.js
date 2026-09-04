const ACCESS_KEY = "family-menu-household-key";
const PROFILE_KEY = "family-menu-household-profile";

export function createHouseholdStorage(storage, householdId) {
  const prefix = `family-menu:${householdId}:`;
  return {
    getItem(key) {
      return storage.getItem(`${prefix}${key}`);
    },
    setItem(key, value) {
      storage.setItem(`${prefix}${key}`, value);
    },
    removeItem(key) {
      storage.removeItem(`${prefix}${key}`);
    },
  };
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Could not open this household.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function fetchHousehold(key, fetchImpl = fetch) {
  const response = await fetchImpl("/.netlify/functions/households", {
    headers: { accept: "application/json", "x-household-key": key },
  });
  return parseResponse(response);
}

export async function createHousehold({ name, creationCode }, fetchImpl = fetch) {
  const response = await fetchImpl("/.netlify/functions/households", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-household-creation-code": creationCode,
    },
    body: JSON.stringify({ name }),
  });
  return parseResponse(response);
}

export async function requireHouseholdSession({ documentObject = document, storage = localStorage, fetchImpl = fetch, t = (key) => key } = {}) {
  const gate = documentObject.querySelector("#householdGate");
  const joinForm = documentObject.querySelector("#joinHouseholdForm");
  const createForm = documentObject.querySelector("#createHouseholdForm");
  const status = documentObject.querySelector("#householdGateStatus");
  const showCreate = documentObject.querySelector("#showCreateHousehold");
  const showJoin = documentObject.querySelector("#showJoinHousehold");

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.dataset.state = isError ? "error" : "pending";
  }

  function finish(data, key) {
    storage.setItem(ACCESS_KEY, key);
    storage.setItem(PROFILE_KEY, JSON.stringify({ id: data.household.id, name: data.household.name }));
    storage.setItem("family-menu-active-household-id", data.household.id);
    gate.hidden = true;
    documentObject.body.classList.remove("household-locked");
    documentObject.querySelector("#householdName").textContent = data.household.name;
    return { ...data.household, key };
  }

  function selectPanel(panel) {
    const creating = panel === "create";
    createForm.hidden = !creating;
    joinForm.hidden = creating;
    showCreate.setAttribute("aria-pressed", `${creating}`);
    showJoin.setAttribute("aria-pressed", `${!creating}`);
    status.textContent = "";
  }

  showCreate.addEventListener("click", () => selectPanel("create"));
  showJoin.addEventListener("click", () => selectPanel("join"));

  const savedKey = storage.getItem(ACCESS_KEY) || "";
  if (savedKey) {
    try {
      setStatus(t("householdOpening"));
      return finish(await fetchHousehold(savedKey, fetchImpl), savedKey);
    } catch (error) {
      if (error.status === 401) {
        storage.removeItem(ACCESS_KEY);
        storage.removeItem(PROFILE_KEY);
        setStatus(t("householdKeyInvalid"), true);
      } else {
        let cachedProfile = null;
        try {
          const parsed = JSON.parse(storage.getItem(PROFILE_KEY) || "null");
          if (parsed?.id && parsed?.name) cachedProfile = parsed;
        } catch {
          storage.removeItem(PROFILE_KEY);
        }
        if (cachedProfile) {
          setStatus(t("householdOfflineCopy"));
          gate.hidden = true;
          documentObject.body.classList.remove("household-locked");
          documentObject.querySelector("#householdName").textContent = cachedProfile.name;
          return { ...cachedProfile, key: savedKey, offline: true };
        }
        setStatus(t("householdUnreachable"), true);
      }
    }
  }

  gate.hidden = false;
  documentObject.body.classList.add("household-locked");

  return new Promise((resolve) => {
    joinForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = joinForm.querySelector("button[type=submit]");
      const key = joinForm.elements.householdKey.value.trim();
      button.disabled = true;
      setStatus(t("householdCheckingKey"));
      try {
        resolve(finish(await fetchHousehold(key, fetchImpl), key));
      } catch (error) {
        setStatus(error.message, true);
        button.disabled = false;
      }
    });

    createForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = createForm.querySelector("button[type=submit]");
      button.disabled = true;
      setStatus(t("householdCreating"));
      try {
        const created = await createHousehold({
          name: createForm.elements.householdName.value.trim(),
          creationCode: createForm.elements.creationCode.value.trim(),
        }, fetchImpl);
        documentObject.querySelector("#createdHouseholdKey").value = created.key;
        documentObject.querySelector("#householdKeyReceipt").hidden = false;
        createForm.hidden = true;
        setStatus(t("householdReadySaveKey"));
        documentObject.querySelector("#continueToHousehold").onclick = () => resolve(finish(created, created.key));
      } catch (error) {
        setStatus(error.message, true);
        button.disabled = false;
      }
    });
  });
}

export function leaveHousehold(storage = localStorage) {
  const householdId = storage.getItem("family-menu-active-household-id");
  if (householdId) {
    const prefix = `family-menu:${householdId}:`;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) storage.removeItem(key);
    }
  }
  storage.removeItem(ACCESS_KEY);
  storage.removeItem(PROFILE_KEY);
  storage.removeItem("family-menu-active-household-id");
  window.location.reload();
}
