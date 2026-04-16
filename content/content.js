// QR Scanner - Content Script
// Scans page for QR codes in images and viewport, highlights them, and shows decoded content

(function () {
  "use strict";

  // Prevent double initialization
  if (window.__qrScannerInitialized) return;
  window.__qrScannerInitialized = true;

  // State
  let overlays = [];
  let activeTooltip = null;
  let scanResults = [];

  // ---- Scanning Logic ----

  /**
   * Scan a single image element for QR codes
   */
  function scanImageElement(img) {
    const results = [];
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return results;

      // Use natural dimensions for best quality
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (width === 0 || height === 0) return results;

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const code = jsQR(imageData.data, width, height, {
        inversionAttempts: "dontInvert",
      });

      if (code) {
        // Calculate the QR code position relative to the displayed image
        const scaleX = img.clientWidth / width;
        const scaleY = img.clientHeight / height;

        results.push({
          data: code.data,
          source: "image",
          element: img,
          location: {
            x: code.location.topLeftCorner.x * scaleX,
            y: code.location.topLeftCorner.y * scaleY,
            width:
              (code.location.topRightCorner.x -
                code.location.topLeftCorner.x) *
              scaleX,
            height:
              (code.location.bottomLeftCorner.y -
                code.location.topLeftCorner.y) *
              scaleY,
          },
        });
      }

      // Also try with inversion for QR codes on dark backgrounds
      const codeInverted = jsQR(imageData.data, width, height, {
        inversionAttempts: "onlyInvert",
      });

      if (codeInverted && (!code || codeInverted.data !== code.data)) {
        const scaleX = img.clientWidth / width;
        const scaleY = img.clientHeight / height;

        results.push({
          data: codeInverted.data,
          source: "image",
          element: img,
          location: {
            x: codeInverted.location.topLeftCorner.x * scaleX,
            y: codeInverted.location.topLeftCorner.y * scaleY,
            width:
              (codeInverted.location.topRightCorner.x -
                codeInverted.location.topLeftCorner.x) *
              scaleX,
            height:
              (codeInverted.location.bottomLeftCorner.y -
                codeInverted.location.topLeftCorner.y) *
              scaleY,
          },
        });
      }
    } catch (e) {
      // Cross-origin or other canvas errors - silently skip
    }
    return results;
  }

  /**
   * Scan a canvas element for QR codes
   */
  function scanCanvasElement(canvasEl) {
    const results = [];
    try {
      const ctx = canvasEl.getContext("2d", { willReadFrequently: true });
      if (!ctx || canvasEl.width === 0 || canvasEl.height === 0)
        return results;

      const imageData = ctx.getImageData(
        0,
        0,
        canvasEl.width,
        canvasEl.height
      );
      const code = jsQR(imageData.data, canvasEl.width, canvasEl.height);

      if (code) {
        results.push({
          data: code.data,
          source: "canvas",
          element: canvasEl,
          location: {
            x: code.location.topLeftCorner.x,
            y: code.location.topLeftCorner.y,
            width:
              code.location.topRightCorner.x -
              code.location.topLeftCorner.x,
            height:
              code.location.bottomLeftCorner.y -
              code.location.topLeftCorner.y,
          },
        });
      }
    } catch (e) {
      // Skip tainted canvases
    }
    return results;
  }

  /**
   * Scan a viewport screenshot for QR codes
   */
  function scanScreenshot(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const results = [];

        // Scale from screenshot pixels to viewport pixels
        const scaleX = window.innerWidth / img.width;
        const scaleY = window.innerHeight / img.height;

        const code = jsQR(imageData.data, img.width, img.height);
        if (code) {
          results.push({
            data: code.data,
            source: "viewport",
            location: {
              x: code.location.topLeftCorner.x * scaleX,
              y: code.location.topLeftCorner.y * scaleY,
              width:
                (code.location.topRightCorner.x -
                  code.location.topLeftCorner.x) *
                scaleX,
              height:
                (code.location.bottomLeftCorner.y -
                  code.location.topLeftCorner.y) *
                scaleY,
            },
          });
        }

        resolve(results);
      };
      img.onerror = () => resolve([]);
      img.src = dataUrl;
    });
  }

  /**
   * Main scan function - scans all images, canvases, and viewport
   */
  async function scanPage() {
    // Clear previous results
    clearOverlays();
    scanResults = [];

    // Show scanning animation
    showScanLine();

    // 1. Scan all visible <img> elements
    const images = document.querySelectorAll("img");
    for (const img of images) {
      if (!isElementVisible(img)) continue;
      if (!img.complete || img.naturalWidth === 0) continue;
      const results = scanImageElement(img);
      scanResults.push(...results);
    }

    // 2. Scan all visible <canvas> elements
    const canvases = document.querySelectorAll("canvas");
    for (const canvas of canvases) {
      if (!isElementVisible(canvas)) continue;
      const results = scanCanvasElement(canvas);
      scanResults.push(...results);
    }

    // 3. Scan viewport screenshot (catches CSS backgrounds, SVGs, etc.)
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "captureTab" }, resolve);
      });

      if (response && response.dataUrl) {
        const viewportResults = await scanScreenshot(response.dataUrl);

        // Deduplicate: don't add viewport results that overlap with image results
        for (const vr of viewportResults) {
          const isDuplicate = scanResults.some(
            (sr) => sr.data === vr.data
          );
          if (!isDuplicate) {
            scanResults.push(vr);
          }
        }
      }
    } catch (e) {
      // Screenshot capture may fail on some pages (e.g., chrome:// pages)
    }

    // Create overlays for found QR codes
    for (const result of scanResults) {
      createOverlay(result);
    }

    // Show notification
    showNotification(scanResults.length);

    // Send results back to popup
    try {
      chrome.runtime.sendMessage({
        action: "scanResults",
        results: scanResults.map((r) => ({ data: r.data, source: r.source })),
      });
    } catch (e) {
      // Popup may have closed
    }

    return scanResults;
  }

  // ---- UI: Overlays ----

  function createOverlay(result) {
    const overlay = document.createElement("div");
    overlay.className = "qr-scanner-overlay";

    if (result.element) {
      // Position relative to the source element
      const rect = result.element.getBoundingClientRect();
      const loc = result.location;

      overlay.style.position = "absolute";
      overlay.style.left = rect.left + loc.x + window.scrollX - 4 + "px";
      overlay.style.top = rect.top + loc.y + window.scrollY - 4 + "px";
      overlay.style.width = loc.width + 8 + "px";
      overlay.style.height = loc.height + 8 + "px";
    } else if (result.source === "viewport") {
      // Position relative to viewport
      const loc = result.location;
      overlay.style.position = "absolute";
      overlay.style.left = loc.x + window.scrollX - 4 + "px";
      overlay.style.top = loc.y + window.scrollY - 4 + "px";
      overlay.style.width = loc.width + 8 + "px";
      overlay.style.height = loc.height + 8 + "px";
    }

    overlay.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTooltip(result, overlay);
    });

    document.body.appendChild(overlay);
    overlays.push(overlay);
  }

  // ---- UI: Tooltip ----

  function showTooltip(result, anchorEl) {
    // Remove existing tooltip
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }

    const tooltip = document.createElement("div");
    tooltip.className = "qr-scanner-tooltip";

    const type = classifyContent(result.data);
    const contentHtml = formatContent(result.data, type);

    tooltip.innerHTML = `
      <button class="qr-scanner-tooltip-close" title="Close">&times;</button>
      <div class="qr-scanner-tooltip-type">${escapeHtml(type)}</div>
      <div class="qr-scanner-tooltip-content">${contentHtml}</div>
      <div class="qr-scanner-tooltip-actions">
        <button class="qr-scanner-tooltip-btn qr-scanner-tooltip-btn-secondary" data-action="copy">Copy</button>
        ${type === "url" ? '<button class="qr-scanner-tooltip-btn qr-scanner-tooltip-btn-primary" data-action="open">Open Link</button>' : ""}
      </div>
    `;

    // Position tooltip near the overlay
    const rect = anchorEl.getBoundingClientRect();
    tooltip.style.position = "absolute";
    tooltip.style.left = rect.left + window.scrollX + "px";
    tooltip.style.top =
      rect.bottom + window.scrollY + 8 + "px";

    // Event handlers
    tooltip
      .querySelector(".qr-scanner-tooltip-close")
      .addEventListener("click", () => {
        tooltip.remove();
        activeTooltip = null;
      });

    tooltip.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        if (action === "copy") {
          navigator.clipboard.writeText(result.data).then(() => {
            btn.textContent = "Copied!";
            setTimeout(() => {
              btn.textContent = "Copy";
            }, 1500);
          });
        } else if (action === "open") {
          const url = result.data;
          // Basic URL validation to prevent javascript: protocol
          if (/^https?:\/\//i.test(url)) {
            window.open(url, "_blank", "noopener,noreferrer");
          }
        }
      });
    });

    document.body.appendChild(tooltip);
    activeTooltip = tooltip;

    // Adjust position if tooltip goes off-screen
    requestAnimationFrame(() => {
      const tooltipRect = tooltip.getBoundingClientRect();
      if (tooltipRect.right > window.innerWidth) {
        tooltip.style.left =
          window.innerWidth - tooltipRect.width - 16 + window.scrollX + "px";
      }
      if (tooltipRect.bottom > window.innerHeight) {
        tooltip.style.top =
          rect.top + window.scrollY - tooltipRect.height - 8 + "px";
      }
    });
  }

  // ---- UI: Scanning Animation ----

  function showScanLine() {
    const line = document.createElement("div");
    line.className = "qr-scanner-scanning-line";
    document.body.appendChild(line);
    setTimeout(() => line.remove(), 1600);
  }

  // ---- UI: Notification ----

  function showNotification(count) {
    const notification = document.createElement("div");
    notification.className =
      "qr-scanner-notification" + (count > 0 ? " success" : " no-results");

    const iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>`;

    notification.innerHTML = `
      <div class="qr-scanner-notification-icon">${iconSvg}</div>
      <span>${count > 0 ? `Found ${count} QR code${count > 1 ? "s" : ""}! Click to decode.` : "No QR codes found on this page."}</span>
    `;

    document.body.appendChild(notification);
    setTimeout(() => {
      notification.style.transition = "opacity 0.3s";
      notification.style.opacity = "0";
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // ---- Helpers ----

  function clearOverlays() {
    overlays.forEach((o) => o.remove());
    overlays = [];
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  function isElementVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && parseFloat(style.opacity) > 0;
  }

  function classifyContent(text) {
    if (/^https?:\/\//i.test(text)) return "url";
    if (/^mailto:/i.test(text)) return "email";
    if (/^tel:/i.test(text)) return "phone";
    if (/^BEGIN:VCARD/i.test(text)) return "vcard";
    if (/^WIFI:/i.test(text)) return "wifi";
    if (/^smsto:/i.test(text)) return "sms";
    return "text";
  }

  function formatContent(text, type) {
    const escaped = escapeHtml(text);
    if (type === "url") {
      return `<a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a>`;
    }
    if (type === "email") {
      const email = text.replace(/^mailto:/i, "");
      return `<a href="${escaped}">${escapeHtml(email)}</a>`;
    }
    if (type === "wifi") {
      // Parse WIFI:T:WPA;S:MyNetwork;P:MyPassword;;
      const parts = {};
      text.replace(
        /([TSPH]):([^;]*)/g,
        (_, key, val) => (parts[key] = val)
      );
      return `<strong>Network:</strong> ${escapeHtml(parts.S || "Unknown")}<br><strong>Password:</strong> ${escapeHtml(parts.P || "None")}<br><strong>Type:</strong> ${escapeHtml(parts.T || "Open")}`;
    }
    return escaped;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ---- Message Handling ----

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startScan") {
      scanPage().then((results) => {
        sendResponse({
          found: results.length,
          results: results.map((r) => ({
            data: r.data,
            source: r.source,
          })),
        });
      });
      return true; // Async response
    }

    if (message.action === "clearScan") {
      clearOverlays();
      scanResults = [];
      sendResponse({ cleared: true });
    }
  });

  // Close tooltip when clicking outside
  document.addEventListener("click", (e) => {
    if (
      activeTooltip &&
      !activeTooltip.contains(e.target) &&
      !e.target.closest(".qr-scanner-overlay")
    ) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  });
})();
