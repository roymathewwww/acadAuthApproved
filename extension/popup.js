const tokenInput = document.getElementById("token");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("save");
const syncBtn = document.getElementById("sync");

function setStatus(text) {
  statusEl.textContent = text;
  statusEl.classList.add("show");
}

chrome.storage.local.get("acadsphere_token").then(({ acadsphere_token }) => {
  if (acadsphere_token) tokenInput.value = acadsphere_token;
});

saveBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus("Paste your sync token first — find it in AcadSphere → Attendance → Connect Extension.");
    return;
  }
  await chrome.storage.local.set({ acadsphere_token: token });
  setStatus("✅ Token saved. Open your CUE attendance page and click Sync Now.");
});

syncBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (token) await chrome.storage.local.set({ acadsphere_token: token });

  setStatus("Looking for an open CUE attendance tab…");

  const tabs = await chrome.tabs.query({ url: "https://cue.christuniversity.in/*" });
  if (tabs.length === 0) {
    setStatus("❌ No CUE tab is open. Log in to cue.christuniversity.in, open your Attendance page, then try again.");
    return;
  }

  const tab = tabs.find((t) => t.active) || tabs[0];
  setStatus("🔄 Syncing…");

  chrome.tabs.sendMessage(tab.id, { type: "ACADSPHERE_SYNC_NOW" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(`❌ ${chrome.runtime.lastError.message}. Try refreshing the CUE tab and syncing again.`);
      return;
    }
    if (response?.ok) {
      setStatus(`✅ ${response.message || "Synced!"}`);
    } else {
      setStatus("❌ Sync failed — check the status widget on the CUE page for details.");
    }
  });
});
