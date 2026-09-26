document
  .getElementById("openMap")
  .addEventListener("click", () => {
    chrome.tabs.create({
      url: "https://example.com"
    });
  });