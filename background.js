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
    let responded = false;
    const safeSendResponse = (data) => {
      if (!responded) {
        responded = true;
        try { sendResponse(data); } catch (e) {}
      }
    };

    // Absolute fallback: if everything hangs for 6 seconds, unfreeze the UI.
    setTimeout(() => {
      safeSendResponse({ error: "Scanner took too long to respond. The page might be incompatible or requires a refresh." });
    }, 6000);

    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
          safeSendResponse({ error: "No active tab found." });
          return;
        }
        
        const tabId = tabs[0].id;

        // Ensure we don't try to scan protected pages
        if (tabs[0].url && (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('edge://') || tabs[0].url.startsWith('brave://') || tabs[0].url.startsWith('about:'))) {
          safeSendResponse({ error: "Browser system pages cannot be scanned for security reasons." });
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
                    safeSendResponse({ error: "Could not inject scanner into this page: " + chrome.runtime.lastError.message });
                    return;
                  }
                  
                  chrome.scripting.insertCSS(
                    { target: { tabId }, files: ["content/content.css"] },
                    () => {
                      if (chrome.runtime.lastError) {
                        safeSendResponse({ error: "Failed to inject styles: " + chrome.runtime.lastError.message });
                        return;
                      }

                      setTimeout(() => {
                        chrome.tabs.sendMessage(tabId, startMessage, (resp) => {
                          if (chrome.runtime.lastError) {
                            safeSendResponse({ error: "Scanner initialized but failed to answer. Please refresh the page." });
                          } else {
                            safeSendResponse(resp || { success: true, results: [] });
                          }
                        });
                      }, 200);
                    }
                  );
                }
              );
            } else {
              // Success! Send results back to popup
              safeSendResponse(response || { success: true, results: [] });
            }
          });
        });
      });
    } catch (err) {
      safeSendResponse({ error: "Critical background error: " + err.message });
    }

    return true; // Keep message channel open for async response
  }
});
