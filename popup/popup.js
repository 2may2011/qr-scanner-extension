// QR Scanner popup script

const scanBtn = document.getElementById("scanBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const resultCountEl = document.getElementById("resultCount");
const resultListEl = document.getElementById("resultList");

scanBtn.addEventListener("click", () => {
  statusEl.textContent = "Scanning page for QR codes...";
  statusEl.className = "status scanning";
  scanBtn.disabled = true;
  resultsEl.classList.add("hidden");
  resultListEl.innerHTML = "";

  chrome.runtime.sendMessage({ action: "scanPage" }, (response) => {
    scanBtn.disabled = false;

    if (chrome.runtime.lastError) {
      statusEl.textContent = "Error: " + chrome.runtime.lastError.message;
      statusEl.className = "status error";
      return;
    }

    if (response && response.error) {
      statusEl.textContent = "Error: " + response.error;
      statusEl.className = "status error";
      return;
    }

    // Listen for scan results from content script
    statusEl.textContent = "Scan triggered! Results will appear shortly...";
    statusEl.className = "status scanning";
  });

  // Listen for results from content script via background
  const listener = (message) => {
    if (message.action === "scanResults") {
      chrome.runtime.onMessage.removeListener(listener);
      displayResults(message.results);
    }
  };
  chrome.runtime.onMessage.addListener(listener);

  // Timeout after 8 seconds
  setTimeout(() => {
    chrome.runtime.onMessage.removeListener(listener);
    if (scanBtn.disabled) {
      scanBtn.disabled = false;
    }
  }, 8000);
});

function classifyContent(text) {
  if (/^https?:\/\//i.test(text)) return "url";
  if (/^mailto:/i.test(text)) return "email";
  if (/^tel:/i.test(text)) return "phone";
  if (/^BEGIN:VCARD/i.test(text)) return "vcard";
  if (/^WIFI:/i.test(text)) return "wifi";
  if (/^smsto:/i.test(text)) return "sms";
  return "text";
}

function displayResults(results) {
  if (!results || results.length === 0) {
    statusEl.textContent = "No QR codes found on this page.";
    statusEl.className = "status";
    resultsEl.classList.add("hidden");
    return;
  }

  statusEl.textContent = `Found ${results.length} QR code(s)! They are highlighted on the page.`;
  statusEl.className = "status success";
  resultCountEl.textContent = results.length;
  resultsEl.classList.remove("hidden");
  resultListEl.innerHTML = "";

  results.forEach((result, index) => {
    const type = classifyContent(result.data);
    const item = document.createElement("div");
    item.className = "result-item";
    item.innerHTML = `
      <div class="result-type">${type}</div>
      <div class="result-text">${escapeHtml(result.data)}</div>
    `;
    item.title = "Click to copy";
    item.addEventListener("click", () => {
      navigator.clipboard.writeText(result.data).then(() => {
        item.style.background = "#1a3a2a";
        setTimeout(() => {
          item.style.background = "";
        }, 500);
      });
    });
    resultListEl.appendChild(item);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
