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
    return true;
  }

  if (message.action === "scanPage") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].id) {
        sendResponse({ error: "No active tab found." });
        return;
      }
      
      const tabId = tabs[0].id;

      // Ensure we don't try to scan protected chrome:// or edge:// pages
      if (tabs[0].url && (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('edge://') || tabs[0].url.startsWith('about:'))) {
        sendResponse({ error: "Browser system pages cannot be scanned for security reasons." });
        return;
      }

      // Step 1: Capture screenshot IMMEDIATELY
      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        const screenshotStatus = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
        
        const startMessage = {
          action: "startScan",
          screenshotDataUrl: screenshotStatus ? null : dataUrl,
        };

        // Step 2: Try to communicate with content script
        chrome.tabs.sendMessage(tabId, startMessage, (response) => {
          if (chrome.runtime.lastError) {
            // Content script not loaded - attempt injection
            chrome.scripting.executeScript(
              { target: { tabId }, files: ["lib/jsQR.js", "content/content.js"] },
              () => {
                if (chrome.runtime.lastError) {
                  sendResponse({ error: "Could not inject scanner into this page: " + chrome.runtime.lastError.message });
                  return;
                }
                
                chrome.scripting.insertCSS(
                  { target: { tabId }, files: ["content/content.css"] },
                  () => {
                    // One last check for error before final message
                    if (chrome.runtime.lastError) {
                      sendResponse({ error: "Failed to inject styles: " + chrome.runtime.lastError.message });
                      return;
                    }

                    setTimeout(() => {
                      chrome.tabs.sendMessage(tabId, startMessage, (resp) => {
                        if (chrome.runtime.lastError) {
                          sendResponse({ error: "Scanner initialized but failed to respond." });
                        } else {
                          sendResponse(resp || { success: true, results: [] });
                        }
                      });
                    }, 200);
                  }
                );
              }
            );
          } else {
            // Success! Send results back to popup
            sendResponse(response || { success: true, results: [] });
          }
        });
      });
    });

    return true; // Keep message channel open for async response
  }
});
