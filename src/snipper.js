/**
 * Lanki In-Page Screen Snipping Tool
 * Injected dynamically into web pages to allow selecting a screen rectangle,
 * capturing/cropping the image, transcribing subtitles/text via Vision API,
 * and presenting a confirmation/editing modal before saving to queue.
 */

(function () {
  const OVERLAY_ID = "lanki-snipper-overlay";
  const MODAL_ID = "lanki-review-modal";

  // Prevent duplicate injections
  if (document.getElementById(OVERLAY_ID) || document.getElementById(MODAL_ID)) {
    return;
  }

  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let selectionBox = null;
  let overlay = null;

  function initSnipper() {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483646",
      cursor: "crosshair",
      background: "rgba(0, 0, 0, 0.4)",
      userSelect: "none",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    });

    // Instructions pill
    const pill = document.createElement("div");
    Object.assign(pill.style, {
      position: "fixed",
      top: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#1e1b4b",
      color: "#e0e7ff",
      border: "1px solid #6366f1",
      borderRadius: "9999px",
      padding: "10px 22px",
      fontSize: "13px",
      fontWeight: "500",
      boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      zIndex: "2147483647"
    });
    pill.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      <span>Drag a box around subtitle or screen context &bull; Press <b>Esc</b> to cancel</span>
    `;
    overlay.appendChild(pill);

    // Selection box element
    selectionBox = document.createElement("div");
    Object.assign(selectionBox.style, {
      position: "fixed",
      display: "none",
      border: "2px solid #818cf8",
      backgroundColor: "rgba(99, 102, 241, 0.15)",
      boxShadow: "0 0 0 99999px rgba(0, 0, 0, 0.5)",
      pointerEvents: "none",
      zIndex: "2147483646"
    });
    overlay.appendChild(selectionBox);

    // Events
    overlay.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);

    document.body.appendChild(overlay);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return; // Only left click
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    Object.assign(selectionBox.style, {
      display: "block",
      left: `${startX}px`,
      top: `${startY}px`,
      width: "0px",
      height: "0px"
    });
  }

  function onMouseMove(e) {
    if (!isDragging) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    Object.assign(selectionBox.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`
    });
  }

  async function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    // If selection is too small, cancel
    if (width < 20 || height < 15) {
      cleanupSnipper();
      return;
    }

    // Capture area coordinates
    const dpr = window.devicePixelRatio || 1;
    const rect = {
      x: left,
      y: top,
      width,
      height,
      dpr
    };

    // 1. Clean up selection overlay immediately so page is unobstructed
    cleanupSnipper();

    // 2. Wait a tick/frame to ensure browser composited the clean page without overlay
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 50);
      });
    });

    // 3. Capture tab screenshot BEFORE displaying any modal or blur backdrop
    let croppedBase64 = null;
    let captureError = null;

    try {
      const response = await chrome.runtime.sendMessage({ action: "CAPTURE_TAB_SCREENSHOT" });
      if (!response?.dataUrl) {
        throw new Error(response?.error || "Could not capture screenshot of active tab.");
      }
      croppedBase64 = await cropImage(response.dataUrl, rect);
    } catch (err) {
      console.error("Lanki Snipper Capture Error:", err);
      captureError = err.message || "Failed to capture screenshot";
    }

    // 4. Now present the review/transcription modal with the clean cropped image
    showReviewModal(croppedBase64, captureError);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      cleanupSnipper();
      cleanupModal();
    }
  }

  function cleanupSnipper() {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("keydown", onKeyDown);
    if (overlay) {
      overlay.style.display = "none";
      overlay.remove();
      overlay = null;
    }
  }

  function cleanupModal() {
    const existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();
  }

  async function showReviewModal(croppedBase64, captureError) {
    cleanupModal();

    const modalHost = document.createElement("div");
    modalHost.id = MODAL_ID;
    Object.assign(modalHost.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(10, 15, 30, 0.75)",
      backdropFilter: "blur(6px)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "#1e1b4b",
      color: "#f8fafc",
      border: "1px solid #4338ca",
      borderRadius: "16px",
      padding: "24px",
      width: "90%",
      maxWidth: "460px",
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    });

    card.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #312e81; padding-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 24px; height: 24px; border-radius: 6px; background: #4f46e5; display: flex; align-items: center; justify-content: center; font-size: 13px;">📷</div>
          <h3 style="margin: 0; font-size: 15px; font-weight: 600; color: #f8fafc;">Capture Screen Context</h3>
        </div>
        <button id="lanki-close-modal-btn" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; line-height: 1;">&times;</button>
      </div>

      <div id="lanki-preview-area" style="text-align: center; background: #0f172a; border-radius: 10px; padding: 8px; border: 1px dashed #334155; min-height: 80px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 12px; color: #94a3b8;">Loading preview...</span>
      </div>

      <div id="lanki-loading-status" style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #a5b4fc;">
        <div style="width: 14px; height: 14px; border: 2px solid #6366f1; border-top-color: transparent; border-radius: 50%; animation: lanki-spin 0.8s linear infinite;"></div>
        <span id="lanki-status-text">Transcribing text (Local PP-OCR / Vision)...</span>
      </div>

      <div id="lanki-form-fields" style="display: flex; flex-direction: column; gap: 12px; opacity: 0.5; pointer-events: none;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #cbd5e1; margin-bottom: 4px;">Target Word / Idiom <span style="color: #ef4444;">*</span></label>
          <input type="text" id="lanki-input-word" placeholder="e.g. get on, put off..." autocomplete="off" style="width: 100%; box-sizing: border-box; padding: 9px 12px; background: #0f172a; border: 1px solid #475569; border-radius: 8px; color: #ffffff; font-size: 14px; outline: none;">
        </div>

        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #cbd5e1; margin-bottom: 4px;">Extracted Context Sentence <span style="font-size: 11px; color: #818cf8;">(Editable)</span></label>
          <textarea id="lanki-input-context" rows="3" placeholder="Context sentence from video/screen..." style="width: 100%; box-sizing: border-box; padding: 9px 12px; background: #0f172a; border: 1px solid #475569; border-radius: 8px; color: #ffffff; font-size: 13px; outline: none; resize: vertical;"></textarea>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px;">
        <button id="lanki-btn-cancel" style="padding: 8px 16px; background: #334155; color: #cbd5e1; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer;">Cancel</button>
        <button id="lanki-btn-confirm" disabled style="padding: 8px 18px; background: #4f46e5; color: #ffffff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: not-allowed; opacity: 0.6; display: flex; align-items: center; gap: 6px;">
          <span>✓ Add to Lanki</span>
        </button>
      </div>
    `;

    // Inject spinner style if not already present
    if (!document.getElementById("lanki-anim-style")) {
      const style = document.createElement("style");
      style.id = "lanki-anim-style";
      style.textContent = `
        @keyframes lanki-spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    modalHost.appendChild(card);
    document.body.appendChild(modalHost);

    // Event listeners
    const closeBtn = card.querySelector("#lanki-close-modal-btn");
    const cancelBtn = card.querySelector("#lanki-btn-cancel");
    const confirmBtn = card.querySelector("#lanki-btn-confirm");
    const wordInput = card.querySelector("#lanki-input-word");
    const contextInput = card.querySelector("#lanki-input-context");
    const previewArea = card.querySelector("#lanki-preview-area");
    const loadingStatus = card.querySelector("#lanki-loading-status");
    const statusText = card.querySelector("#lanki-status-text");
    const formFields = card.querySelector("#lanki-form-fields");

    closeBtn.addEventListener("click", cleanupModal);
    cancelBtn.addEventListener("click", cleanupModal);

    modalHost.addEventListener("click", (e) => {
      if (e.target === modalHost) cleanupModal();
    });

    // Enter key submits if word is filled
    wordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !confirmBtn.disabled) {
        confirmBtn.click();
      }
    });

    // Render thumbnail preview immediately if available
    if (croppedBase64) {
      previewArea.innerHTML = "";
      const thumb = document.createElement("img");
      thumb.src = croppedBase64;
      Object.assign(thumb.style, {
        maxHeight: "100px",
        maxWidth: "100%",
        borderRadius: "6px",
        objectFit: "contain",
        boxShadow: "0 4px 10px rgba(0,0,0,0.3)"
      });
      previewArea.appendChild(thumb);
    }

    // Handle capture errors immediately
    if (captureError || !croppedBase64) {
      statusText.textContent = `Error: ${captureError || "Capture failed"}`;
      statusText.style.color = "#f87171";
      const spinner = loadingStatus.querySelector("div");
      if (spinner) spinner.style.display = "none";

      formFields.style.opacity = "1";
      formFields.style.pointerEvents = "auto";
      confirmBtn.disabled = false;
      confirmBtn.style.cursor = "pointer";
      confirmBtn.style.opacity = "1";
      wordInput.focus();
      return;
    }

    // Submit handler
    confirmBtn.addEventListener("click", async () => {
      const wordVal = wordInput.value.trim();
      if (!wordVal) {
        wordInput.style.borderColor = "#ef4444";
        wordInput.focus();
        return;
      }

      const contextVal = contextInput.value.trim();

      confirmBtn.disabled = true;
      confirmBtn.textContent = "Saving...";

      await chrome.runtime.sendMessage({
        action: "ADD_TO_QUEUE",
        item: {
          word: wordVal,
          context: contextVal
        }
      });

      cleanupModal();
    });

    // Transcribe via background Vision/OCR model
    try {
      const visionRes = await chrome.runtime.sendMessage({
        action: "TRANSCRIBE_SNIPPET",
        imageBase64: croppedBase64
      });

      // Enable form fields
      formFields.style.opacity = "1";
      formFields.style.pointerEvents = "auto";
      loadingStatus.style.display = "none";
      confirmBtn.disabled = false;
      confirmBtn.style.cursor = "pointer";
      confirmBtn.style.opacity = "1";

      if (visionRes?.text) {
        contextInput.value = visionRes.text;
      } else {
        contextInput.value = "";
        contextInput.placeholder = "Could not auto-transcribe. Type context manually...";
      }

      wordInput.focus();
    } catch (err) {
      console.error("Lanki Snipper Transcribe Error:", err);
      statusText.textContent = `Error: ${err.message || "Transcription failed"}`;
      statusText.style.color = "#f87171";
      const spinner = loadingStatus.querySelector("div");
      if (spinner) spinner.style.display = "none";

      formFields.style.opacity = "1";
      formFields.style.pointerEvents = "auto";
      confirmBtn.disabled = false;
      confirmBtn.style.cursor = "pointer";
      confirmBtn.style.opacity = "1";
      wordInput.focus();
    }
  }

  function cropImage(dataUrl, rect) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scaleX = (img.naturalWidth || img.width) / (window.innerWidth || 1);
          const scaleY = (img.naturalHeight || img.height) / (window.innerHeight || 1);

          const sx = Math.max(0, Math.min(img.naturalWidth - 1, Math.round(rect.x * scaleX)));
          const sy = Math.max(0, Math.min(img.naturalHeight - 1, Math.round(rect.y * scaleY)));
          const targetW = Math.max(1, Math.round(rect.width * scaleX));
          const targetH = Math.max(1, Math.round(rect.height * scaleY));
          const sw = Math.max(1, Math.min(targetW, img.naturalWidth - sx));
          const sh = Math.max(1, Math.min(targetH, img.naturalHeight - sy));

          const canvas = document.createElement("canvas");
          canvas.width = sw;
          canvas.height = sh;
          const ctx = canvas.getContext("2d");

          ctx.drawImage(
            img,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            sw,
            sh
          );

          resolve(canvas.toDataURL("image/png"));
        } catch (cropErr) {
          reject(cropErr);
        }
      };
      img.onerror = () => reject(new Error("Failed to load screenshot image for cropping."));
      img.src = dataUrl;
    });
  }

  // Initialize
  initSnipper();
})();
