(() => {
  if (window.ArkadiXHudFrames) {
    window.ArkadiXHudFrames.refresh();
    return;
  }

  const FRAME_ASSET_ROOT = "./images/cadre";
  const VIEWPORT_REFERENCE = 1080;
  const SAFE_WIDTH_WITH_CENTERS = 633;
  const SAFE_WIDTH_WITHOUT_CENTERS = 368;
  const SAFE_HEIGHT = 389;
  const FRAME_PROFILES = Object.freeze({
    result: { scale: 0.25, minScale: 0.16, centers: false },
    lore: { scale: 0.22, minScale: 0.16, centers: false },
    observation: { scale: 0.18, minScale: 0.12, centers: false },
    control: { scale: 0.18, minScale: 0.12, centers: false },
  });
  const observedFrames = new Set();
  const contentObservers = new WeakMap();
  const frameStates = new WeakMap();

  function decorativeImage(className, fileName) {
    const image = document.createElement("img");
    image.className = className;
    image.src = `${FRAME_ASSET_ROOT}/${fileName}`;
    image.alt = "";
    image.draggable = false;
    image.setAttribute("aria-hidden", "true");
    return image;
  }

  function createGraphics() {
    const graphics = document.createElement("div");
    graphics.className = "hud-frame__graphics";
    graphics.setAttribute("aria-hidden", "true");

    for (const segment of ["full", "start", "end"]) {
      const edge = document.createElement("div");
      edge.className = `hud-edge hud-edge-top hud-edge-top--${segment}`;
      graphics.append(edge);
    }

    for (const segment of ["start", "end"]) {
      const edge = document.createElement("div");
      edge.className = `hud-edge hud-edge-bottom hud-edge-bottom--${segment}`;
      graphics.append(edge);
    }

    for (const side of ["left", "right"]) {
      const edge = document.createElement("div");
      edge.className = `hud-edge hud-edge-${side}`;
      graphics.append(edge);
    }

    graphics.append(
      decorativeImage("hud-corner hud-corner-tl", "corner_tl.png"),
      decorativeImage("hud-corner hud-corner-tr", "corner_tr.png"),
      decorativeImage("hud-corner hud-corner-bl", "corner_bl.png"),
      decorativeImage("hud-corner hud-corner-br", "corner_br.png"),
      decorativeImage("hud-center hud-center-top", "center_top.png"),
      decorativeImage("hud-center hud-center-bottom", "center_bottom.png"),
    );

    return graphics;
  }

  function captureFrameState(frame) {
    const style = getComputedStyle(frame);
    const basePaddingX = style.getPropertyValue("--hud-frame-base-padding-x").trim();
    const basePaddingY = style.getPropertyValue("--hud-frame-base-padding-y").trim();
    const sides = [
      ["top", "paddingTop", basePaddingY],
      ["right", "paddingRight", basePaddingX],
      ["bottom", "paddingBottom", basePaddingY],
      ["left", "paddingLeft", basePaddingX],
    ];

    for (const [side, property, axisFallback] of sides) {
      const variable = `--hud-frame-base-padding-${side}`;
      const explicitValue = style.getPropertyValue(variable).trim();
      if (!explicitValue && !axisFallback) {
        frame.style.setProperty(variable, style[property]);
      }
    }

    frameStates.set(frame, {
      background: style.background,
      borderTop: style.borderTop,
      borderRight: style.borderRight,
      borderBottom: style.borderBottom,
      borderLeft: style.borderLeft,
      borderRadius: style.borderRadius,
    });
  }

  function createWindow(frame) {
    const state = frameStates.get(frame);
    const windowLayer = document.createElement("div");
    windowLayer.className = "hud-frame__window";
    windowLayer.setAttribute("aria-hidden", "true");
    if (state) {
      windowLayer.style.background = state.background;
      windowLayer.style.borderTop = state.borderTop;
      windowLayer.style.borderRight = state.borderRight;
      windowLayer.style.borderBottom = state.borderBottom;
      windowLayer.style.borderLeft = state.borderLeft;
      windowLayer.style.borderRadius = state.borderRadius;
    }
    return windowLayer;
  }

  function ensureWindow(frame) {
    if (frame.querySelector(":scope > .hud-frame__window")) {
      return;
    }
    frame.append(createWindow(frame));
  }

  function ensureGraphics(frame) {
    if (frame.querySelector(":scope > .hud-frame__graphics")) {
      return;
    }
    frame.append(createGraphics());
  }

  function numericData(frame, name, fallback) {
    const value = Number(frame.dataset[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function applyProfile(frame) {
    const profile = FRAME_PROFILES[frame.dataset.hudFrameProfile];
    if (!profile) return;
    if (!frame.dataset.hudFrameScale) frame.dataset.hudFrameScale = String(profile.scale);
    if (!frame.dataset.hudFrameMinScale) frame.dataset.hudFrameMinScale = String(profile.minScale);
    if (!frame.dataset.hudFrameCenters && profile.centers === false) frame.dataset.hudFrameCenters = "false";
  }

  function updateScale(frame) {
    const fixedScale = Number(frame.dataset.hudFrameFixedScale);
    if (Number.isFinite(fixedScale) && fixedScale > 0) {
      frame.style.setProperty("--frame-scale", fixedScale.toFixed(4));
      return;
    }

    const width = frame.clientWidth;
    const height = frame.clientHeight;
    const requestedScale = numericData(frame, "hudFrameScale", 0.4);
    const minimumScale = numericData(frame, "hudFrameMinScale", 0.16);
    const maximumScale = numericData(frame, "hudFrameMaxScale", 1.5);
    const viewportShortSide = Math.min(
      window.innerWidth,
      window.innerHeight,
    );
    const viewportScale = requestedScale *
      (viewportShortSide / VIEWPORT_REFERENCE);
    const preferredScale = Math.max(minimumScale, viewportScale);

    if (width <= 0 || height <= 0) {
      frame.style.setProperty(
        "--frame-scale",
        Math.max(0.08, Math.min(maximumScale, preferredScale)).toFixed(4),
      );
      return;
    }

    const centersEnabled = frame.dataset.hudFrameCenters !== "false";
    const safeNativeWidth = centersEnabled
      ? SAFE_WIDTH_WITH_CENTERS
      : SAFE_WIDTH_WITHOUT_CENTERS;
    const widthLimit = width / safeNativeWidth;
    const heightLimit = height / SAFE_HEIGHT;
    const dimensionLimit = Math.min(
      widthLimit,
      heightLimit,
      maximumScale,
    );
    const scale = Math.max(
      0.08,
      Math.min(
        dimensionLimit,
        preferredScale,
      ),
    );

    frame.style.setProperty("--frame-scale", scale.toFixed(4));
  }

  function prepareFrame(frame) {
    applyProfile(frame);
    if (!frameStates.has(frame)) {
      captureFrameState(frame);
    }
    frame.classList.add("hud-frame", "hud-frame--overlay");
    frame.classList.toggle(
      "hud-frame--no-centers",
      frame.dataset.hudFrameCenters === "false",
    );
    ensureWindow(frame);
    ensureGraphics(frame);
    updateScale(frame);

    if (!contentObservers.has(frame)) {
      const contentObserver = new MutationObserver(() => {
        ensureWindow(frame);
        ensureGraphics(frame);
        updateScale(frame);
      });
      contentObserver.observe(frame, { childList: true });
      contentObservers.set(frame, contentObserver);
    }
  }

  const resizeObserver = "ResizeObserver" in window
    ? new ResizeObserver((entries) => {
        entries.forEach((entry) => updateScale(entry.target));
      })
    : null;

  function refresh() {
    const frames = document.querySelectorAll("[data-hud-frame]");
    frames.forEach((frame) => {
      prepareFrame(frame);
      if (!observedFrames.has(frame)) {
        observedFrames.add(frame);
        resizeObserver?.observe(frame);
      }
    });
  }

  function updateAll() {
    for (const frame of [...observedFrames]) {
      if (!frame.isConnected) {
        release(frame);
        continue;
      }
      updateScale(frame);
    }
  }

  function release(frame) {
    if (!frame) {
      return;
    }
    resizeObserver?.unobserve(frame);
    contentObservers.get(frame)?.disconnect();
    contentObservers.delete(frame);
    observedFrames.delete(frame);
    frameStates.delete(frame);
  }

  window.addEventListener("resize", updateAll, { passive: true });
  window.ArkadiXHudFrames = {
    refresh,
    update: updateScale,
    updateAll,
    release,
  };
  refresh();
})();
