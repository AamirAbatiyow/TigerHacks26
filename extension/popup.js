const openMapButton =
  document.getElementById(
    "openMap"
  );

const viewDetailsButton =
  document.getElementById(
    "viewDetails"
  );

function openVisualization() {
  const visualizationUrl =
    chrome.runtime.getURL(
      "visualization/index.html"
    );

  chrome.tabs.create({
    url: visualizationUrl,
  });
}

openMapButton.addEventListener(
  "click",
  openVisualization
);

viewDetailsButton.addEventListener(
  "click",
  openVisualization
);