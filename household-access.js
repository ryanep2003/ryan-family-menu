const ACCESS_KEY = "family-menu-household-key";

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

export async function requireHouseholdSession({ documentObject = document, storage = localStorage, fetchImpl = fetch } = {}) {
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
      setStatus("Opening your household…");
      return finish(await fetchHousehold(savedKey, fetchImpl), savedKey);
    } catch (error) {
      if (error.status === 401) {
        storage.removeItem(ACCESS_KEY);
        setStatus("That saved household key no longer works. Paste a valid key to continue.", true);
      } else {
        setStatus("We could not reach your household. Your saved key is still safe; refresh to try again.", true);
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
      setStatus("Checking your family key…");
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
      setStatus("Setting up your shared kitchen…");
      try {
        const created = await createHousehold({
          name: createForm.elements.householdName.value.trim(),
          creationCode: createForm.elements.creationCode.value.trim(),
        }, fetchImpl);
        documentObject.querySelector("#createdHouseholdKey").value = created.key;
        documentObject.querySelector("#householdKeyReceipt").hidden = false;
        createForm.hidden = true;
        setStatus("Household ready. Save this key before continuing.");
        documentObject.querySelector("#continueToHousehold").onclick = () => resolve(finish(created, created.key));
      } catch (error) {
        setStatus(error.message, true);
        button.disabled = false;
      }
    });
  });
}

export function leaveHousehold(storage = localStorage) {
  storage.removeItem(ACCESS_KEY);
  window.location.reload();
}
