(() => {
  const lightbox = document.getElementById("site-map-lightbox");
  if (!lightbox) {
    return;
  }

  const openButtons = document.querySelectorAll("[data-map-open]");
  const closeButtons = lightbox.querySelectorAll("[data-map-close]");
  const viewport = lightbox.querySelector("[data-map-viewport]");
  const canvas = lightbox.querySelector("[data-map-canvas]");
  const image = lightbox.querySelector("[data-map-image]");
  const focusSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const mobileQuery = window.matchMedia("(max-width: 760px)");
  let lastTrigger = null;

  if (!(viewport instanceof HTMLElement) || !(canvas instanceof HTMLElement) || !(image instanceof HTMLImageElement)) {
    return;
  }

  const state = {
    scale: 1,
    minScale: 1,
    maxScale: 1,
    translateX: 0,
    translateY: 0,
    imageWidth: 0,
    imageHeight: 0,
  };

  const gesture = {
    mode: null,
    startX: 0,
    startY: 0,
    startTranslateX: 0,
    startTranslateY: 0,
    startScale: 1,
    startDistance: 0,
    anchorImageX: 0,
    anchorImageY: 0,
  };

  const getFocusableElements = () =>
    Array.from(lightbox.querySelectorAll(focusSelector)).filter(
      (element) => !element.hasAttribute("hidden")
    );

  const getDistance = (touchA, touchB) =>
    Math.hypot(touchB.clientX - touchA.clientX, touchB.clientY - touchA.clientY);

  const getMidpoint = (touchA, touchB, rect) => ({
    x: (touchA.clientX + touchB.clientX) / 2 - rect.left,
    y: (touchA.clientY + touchB.clientY) / 2 - rect.top,
  });

  const updateViewportState = () => {
    viewport.classList.toggle("is-zoomable", state.maxScale > state.minScale + 0.01);
    viewport.classList.toggle(
      "is-zoomed",
      state.scale > state.minScale + 0.01 && gesture.mode !== "pan" && gesture.mode !== "mouse-pan"
    );
    viewport.classList.toggle("is-panning", gesture.mode === "pan" || gesture.mode === "mouse-pan");
  };

  const applyTransform = () => {
    canvas.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
    updateViewportState();
  };

  const clampTranslations = () => {
    const rect = viewport.getBoundingClientRect();
    const scaledWidth = state.imageWidth * state.scale;
    const scaledHeight = state.imageHeight * state.scale;

    if (scaledWidth <= rect.width) {
      state.translateX = (rect.width - scaledWidth) / 2;
    } else {
      const minX = rect.width - scaledWidth;
      state.translateX = Math.min(0, Math.max(minX, state.translateX));
    }

    if (scaledHeight <= rect.height) {
      state.translateY = (rect.height - scaledHeight) / 2;
    } else {
      const minY = rect.height - scaledHeight;
      state.translateY = Math.min(0, Math.max(minY, state.translateY));
    }
  };

  const clampScale = (value) => Math.min(state.maxScale, Math.max(state.minScale, value));

  const setZoomAroundPoint = (nextScale, pointX, pointY) => {
    const imageX = (pointX - state.translateX) / state.scale;
    const imageY = (pointY - state.translateY) / state.scale;

    state.scale = clampScale(nextScale);
    state.translateX = pointX - imageX * state.scale;
    state.translateY = pointY - imageY * state.scale;
    clampTranslations();
    applyTransform();
  };

  const syncImageDimensions = () => {
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) {
      return false;
    }

    state.imageWidth = image.naturalWidth;
    state.imageHeight = image.naturalHeight;
    canvas.style.width = `${state.imageWidth}px`;
    canvas.style.height = `${state.imageHeight}px`;
    return true;
  };

  const resetView = () => {
    if (!syncImageDimensions()) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const fitScale = Math.min(rect.width / state.imageWidth, rect.height / state.imageHeight);
    state.minScale = fitScale;
    state.maxScale = Math.max(fitScale * 6, 3);
    state.scale = clampScale(fitScale);
    state.translateX = (rect.width - state.imageWidth * state.scale) / 2;
    state.translateY = (rect.height - state.imageHeight * state.scale) / 2;
    clampTranslations();
    gesture.mode = null;
    applyTransform();
  };

  const closeLightbox = () => {
    lightbox.hidden = true;
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lightbox-open");
    document.removeEventListener("keydown", handleKeydown);
    gesture.mode = null;
    updateViewportState();

    if (lastTrigger instanceof HTMLElement) {
      lastTrigger.focus();
    }
  };

  const openLightbox = (trigger) => {
    lastTrigger = trigger instanceof HTMLElement ? trigger : null;
    lightbox.hidden = false;
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("lightbox-open");
    document.addEventListener("keydown", handleKeydown);

    requestAnimationFrame(() => {
      resetView();
    });

    const closeButton = lightbox.querySelector("[data-map-close]:not(.lightbox__backdrop)");
    if (closeButton instanceof HTMLElement) {
      closeButton.focus();
    }
  };

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements();
    if (!focusableElements.length) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  openButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openLightbox(button);
    });
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeLightbox);
  });

  viewport.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const midpoint = getMidpoint(event.touches[0], event.touches[1], rect);

        gesture.mode = "pinch";
        gesture.startDistance = getDistance(event.touches[0], event.touches[1]);
        gesture.startScale = state.scale;
        gesture.anchorImageX = (midpoint.x - state.translateX) / state.scale;
        gesture.anchorImageY = (midpoint.y - state.translateY) / state.scale;
        updateViewportState();
        return;
      }

      if (event.touches.length === 1 && state.scale > state.minScale + 0.01) {
        event.preventDefault();
        gesture.mode = "pan";
        gesture.startX = event.touches[0].clientX;
        gesture.startY = event.touches[0].clientY;
        gesture.startTranslateX = state.translateX;
        gesture.startTranslateY = state.translateY;
        updateViewportState();
      }
    },
    { passive: false }
  );

  viewport.addEventListener(
    "touchmove",
    (event) => {
      if (gesture.mode === "pinch" && event.touches.length === 2) {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const midpoint = getMidpoint(event.touches[0], event.touches[1], rect);
        const distance = getDistance(event.touches[0], event.touches[1]);
        const nextScale = clampScale((distance / gesture.startDistance) * gesture.startScale);

        state.scale = nextScale;
        state.translateX = midpoint.x - gesture.anchorImageX * state.scale;
        state.translateY = midpoint.y - gesture.anchorImageY * state.scale;
        clampTranslations();
        applyTransform();
        return;
      }

      if (gesture.mode === "pan" && event.touches.length === 1) {
        event.preventDefault();
        state.translateX = gesture.startTranslateX + (event.touches[0].clientX - gesture.startX);
        state.translateY = gesture.startTranslateY + (event.touches[0].clientY - gesture.startY);
        clampTranslations();
        applyTransform();
      }
    },
    { passive: false }
  );

  viewport.addEventListener("touchend", (event) => {
    if (event.touches.length === 1 && state.scale > state.minScale + 0.01) {
      gesture.mode = "pan";
      gesture.startX = event.touches[0].clientX;
      gesture.startY = event.touches[0].clientY;
      gesture.startTranslateX = state.translateX;
      gesture.startTranslateY = state.translateY;
      updateViewportState();
      return;
    }

    gesture.mode = null;
    updateViewportState();
  });

  viewport.addEventListener("mousedown", (event) => {
    if (lightbox.hidden || event.button !== 0 || state.scale <= state.minScale + 0.01) {
      return;
    }

    event.preventDefault();
    gesture.mode = "mouse-pan";
    gesture.startX = event.clientX;
    gesture.startY = event.clientY;
    gesture.startTranslateX = state.translateX;
    gesture.startTranslateY = state.translateY;
    updateViewportState();
  });

  window.addEventListener("mousemove", (event) => {
    if (gesture.mode !== "mouse-pan") {
      return;
    }

    state.translateX = gesture.startTranslateX + (event.clientX - gesture.startX);
    state.translateY = gesture.startTranslateY + (event.clientY - gesture.startY);
    clampTranslations();
    applyTransform();
  });

  window.addEventListener("mouseup", () => {
    if (gesture.mode !== "mouse-pan") {
      return;
    }

    gesture.mode = null;
    updateViewportState();
  });

  viewport.addEventListener(
    "wheel",
    (event) => {
      if (lightbox.hidden) {
        return;
      }

      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const pointX = event.clientX - rect.left;
      const pointY = event.clientY - rect.top;
      const zoomFactor = event.deltaY < 0 ? 1.12 : 0.88;

      setZoomAroundPoint(state.scale * zoomFactor, pointX, pointY);
    },
    { passive: false }
  );

  viewport.addEventListener("dblclick", (event) => {
    const rect = viewport.getBoundingClientRect();
    const pointX = event.clientX - rect.left;
    const pointY = event.clientY - rect.top;

    if (state.scale > state.minScale + 0.01) {
      resetView();
      return;
    }

    setZoomAroundPoint(state.scale * 2, pointX, pointY);
  });

  window.addEventListener("resize", () => {
    if (!lightbox.hidden) {
      resetView();
    }
  });

  if (!image.complete) {
    image.addEventListener("load", resetView);
  } else {
    syncImageDimensions();
  }
})();