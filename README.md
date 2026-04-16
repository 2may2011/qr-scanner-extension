# QR Scanner Extension

A lightweight browser extension that scans and decodes QR codes on any webpage. Click the extension icon to detect QR codes — they get highlighted with animated overlays. Click any highlighted QR code to reveal and interact with its content.

## Features

- **One-click scan** — Click the extension icon and hit "Scan" to detect all QR codes on the current page
- **Smart detection** — Scans `<img>` elements, `<canvas>` elements, and takes a viewport screenshot to catch QR codes in CSS backgrounds, SVGs, and more
- **Visual highlighting** — Detected QR codes get a pulsing indigo border overlay with a scan animation
- **Click to decode** — Click any highlighted QR code to see a tooltip with the decoded content
- **Content classification** — Automatically identifies URLs, emails, phone numbers, WiFi credentials, vCards, and plain text
- **Quick actions** — Copy decoded content to clipboard, or open URLs directly
- **Inverted QR support** — Detects both regular and inverted (light-on-dark) QR codes
- **Privacy first** — All processing happens locally, no data leaves your browser

## Installation

### Chrome / Edge / Chromium

1. Download or clone this repository
2. Go to `chrome://extensions`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select this extension's folder

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the `manifest.json` file from this extension's folder

## Usage

1. Navigate to any webpage containing QR codes
2. Click the **QR Scanner** extension icon in your toolbar
3. Click the **Scan Page for QR Codes** button
4. QR codes on the page will be highlighted with a pulsing indigo border
5. Click any highlighted QR code to see its decoded content
6. Use the **Copy** button to copy the content, or **Open Link** for URLs

## How It Works

- **Image scanning**: Draws each `<img>` element to an offscreen canvas and runs QR detection on the pixel data
- **Canvas scanning**: Reads pixel data directly from existing `<canvas>` elements on the page
- **Viewport scanning**: Captures a screenshot of the visible area to detect QR codes rendered via CSS, SVG, or other non-standard methods
- **Deduplication**: Results from different scanning methods are deduplicated to avoid showing the same QR code twice
- Uses [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0) for QR code detection

## Privacy

- All data stays local — no external servers, no tracking
- No data collection of any kind
- Only requires `activeTab` and `scripting` permissions

## Project Structure

```
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker (screenshot capture, message routing)
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic
├── content/
│   ├── content.js         # Content script (QR detection + overlay UI)
│   └── content.css        # Overlay and tooltip styles
├── lib/
│   └── jsQR.js            # QR code detection library (vendored)
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Credits

- QR code detection via [jsQR](https://github.com/cozmo/jsQR) by cozmo (Apache-2.0 License)

## License

MIT
