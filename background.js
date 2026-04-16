// Background service worker for QR Scanner extension
// Handles screenshot capture and message routing

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureTab") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === "scanPage") {
    // Inject content script if not already present and trigger scan
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ error: "No active tab" });
        return;
      }
      const tabId = tabs[0].id;

      chrome.tabs.sendMessage(tabId, { action: "startScan" }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not loaded yet, inject it
          chrome.scripting.executeScript(
            {
              target: { tabId },
              files: ["lib/jsQR.js", "content/content.js"],
            },
            () => {
              if (chrome.runtime.lastError) {
                sendResponse({
                  error: chrome.runtime.lastError.message,
                });
                return;
              }
              chrome.scripting.insertCSS(
                {
                  target: { tabId },
                  files: ["content/content.css"],
                },
                () => {
                  // Give scripts a moment to initialize
                  setTimeout(() => {
                    chrome.tabs.sendMessage(
                      tabId,
                      { action: "startScan" },
                      (resp) => {
                        sendResponse(resp || { started: true });
                      }
                    );
                  }, 100);
                }
              );
            }
          );
        } else {
          sendResponse(response);
        }
      });
    });
    return true;
  }
});
