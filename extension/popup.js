const openMapButton = document.getElementById("openMap");

openMapButton.addEventListener("click", () => {
  const visualizationUrl = chrome.runtime.getURL(
    "visualization/index.html"
  );

  chrome.tabs.create({
    url: visualizationUrl,
  });
});