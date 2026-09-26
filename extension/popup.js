const optOutDialog = document.getElementById("optOutDialog");
document.getElementById("closePopup").addEventListener("click", () => window.close());
document.getElementById("optOut").addEventListener("click", () => optOutDialog.showModal());
document.getElementById("viewDetails").addEventListener("click", () => {
  if (globalThis.chrome?.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL("visualization/index.html") });
  } else {
    window.open("http://127.0.0.1:5173/", "_blank", "noopener");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !optOutDialog.open) window.close();
});
