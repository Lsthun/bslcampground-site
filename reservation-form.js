(() => {
  const modal = document.getElementById("reservation-request-modal");
  if (!modal) {
    return;
  }

  const form = document.getElementById("reservation-request-form");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const openButtons = document.querySelectorAll("[data-reservation-open]");
  const closeButtons = modal.querySelectorAll("[data-reservation-close]");
  const statusElement = form.querySelector("[data-reservation-status]");
  const submitButton = form.querySelector('button[type="submit"]');
  const addressField = document.getElementById("reservation-address");
  const addressHint = form.querySelector("[data-address-autocomplete-hint]");
  const startDateField = document.getElementById("reservation-start-date");
  const choiceLabels = Array.from(form.querySelectorAll("[data-choice-label]"));
  const focusSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(", ");

  let lastTrigger = null;

  if (!(statusElement instanceof HTMLElement)) {
    return;
  }

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const webAppPlaceholder = "REPLACE_WITH_GOOGLE_APPS_SCRIPT_WEB_APP_URL";
  const googleMapsApiKeyPlaceholder = "REPLACE_WITH_GOOGLE_MAPS_API_KEY";
  const googleMapsScriptId = "bsl-campground-google-places-script";

  let googleMapsScriptPromise = null;

  const getFocusableElements = () =>
    Array.from(modal.querySelectorAll(focusSelector)).filter(
      (element) =>
        element instanceof HTMLElement &&
        !element.hasAttribute("hidden") &&
        element.tabIndex >= 0 &&
        !(element instanceof HTMLInputElement && element.type === "radio")
    );

  const resolveFocusTarget = (element) => {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    if (element instanceof HTMLInputElement && element.type === "radio") {
      const label = element.closest("[data-choice-label]");
      return label instanceof HTMLElement ? label : null;
    }

    return element;
  };

  const getChoiceInput = (element) => {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const input = element.querySelector('input[type="radio"]');
    return input instanceof HTMLInputElement ? input : null;
  };

  const updateChoiceState = (input) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const groupInputs = Array.from(form.querySelectorAll(`input[type="radio"][name="${CSS.escape(input.name)}"]`));

    groupInputs.forEach((groupInput) => {
      if (!(groupInput instanceof HTMLInputElement)) {
        return;
      }

      const label = groupInput.closest("[data-choice-label]");
      if (!(label instanceof HTMLElement)) {
        return;
      }

      const isChecked = groupInput.checked;
      label.setAttribute("aria-checked", isChecked ? "true" : "false");
    });
  };

  const updateAllChoiceStates = () => {
    const inputs = Array.from(form.querySelectorAll('input[type="radio"]'));
    inputs.forEach((input) => updateChoiceState(input));
  };

  const selectChoiceInput = (input, focusLabel = false) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    if (!input.checked) {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      updateChoiceState(input);
    }

    if (focusLabel) {
      const label = input.closest("[data-choice-label]");
      if (label instanceof HTMLElement) {
        label.focus();
      }
    }
  };

  const getReservationEndpoint = () => {
    const config = window.BSLCampgroundReservationConfig || {};
    const endpoint = typeof config.appsScriptUrl === "string" ? config.appsScriptUrl.trim() : "";

    if (!endpoint || endpoint.includes(webAppPlaceholder)) {
      return "";
    }

    return endpoint;
  };

  const setAddressHint = (message) => {
    if (addressHint instanceof HTMLElement) {
      addressHint.textContent = message;
    }
  };

  const getGoogleMapsApiKey = () => {
    const config = window.BSLCampgroundReservationConfig || {};
    const apiKey = typeof config.googleMapsApiKey === "string" ? config.googleMapsApiKey.trim() : "";

    if (!apiKey || apiKey.includes(googleMapsApiKeyPlaceholder)) {
      return "";
    }

    return apiKey;
  };

  const getGoogleMapsAutocompleteCountry = () => {
    const config = window.BSLCampgroundReservationConfig || {};
    const country = typeof config.googleMapsAutocompleteCountry === "string"
      ? config.googleMapsAutocompleteCountry.trim().toLowerCase()
      : "";

    return country;
  };

  const loadGooglePlacesScript = (apiKey) => {
    if (window.google?.maps?.places?.Autocomplete) {
      return Promise.resolve(window.google);
    }

    if (googleMapsScriptPromise) {
      return googleMapsScriptPromise;
    }

    googleMapsScriptPromise = new Promise((resolve, reject) => {
      const callbackName = "__bslCampgroundGooglePlacesReady";
      const existingScript = document.getElementById(googleMapsScriptId);

      const handleError = () => {
        delete window[callbackName];
        googleMapsScriptPromise = null;
        reject(new Error("Google Places failed to load."));
      };

      window[callbackName] = () => {
        delete window[callbackName];
        resolve(window.google);
      };

      if (existingScript instanceof HTMLScriptElement) {
        existingScript.addEventListener("error", handleError, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = googleMapsScriptId;
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}`;
      script.addEventListener("error", handleError, { once: true });
      document.head.appendChild(script);
    });

    return googleMapsScriptPromise;
  };

  const initializeAddressAutocomplete = async () => {
    if (!(addressField instanceof HTMLInputElement)) {
      return;
    }

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      setAddressHint("Enter your full street address. Add a Google Maps API key in reservation-config.js to turn on address suggestions.");
      return;
    }

    try {
      await loadGooglePlacesScript(apiKey);
    } catch (error) {
      console.error(error);
      setAddressHint("Enter your full street address.");
      return;
    }

    const Autocomplete = window.google?.maps?.places?.Autocomplete;
    if (typeof Autocomplete !== "function" || addressField.dataset.googlePlacesReady === "true") {
      return;
    }

    const options = {
      fields: ["formatted_address", "name"],
      types: ["address"]
    };
    const country = getGoogleMapsAutocompleteCountry();

    if (country) {
      options.componentRestrictions = { country };
    }

    const autocomplete = new Autocomplete(addressField, options);
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const formattedAddress = typeof place?.formatted_address === "string"
        ? place.formatted_address.trim()
        : "";
      const placeName = typeof place?.name === "string"
        ? place.name.trim()
        : "";
      const nextValue = formattedAddress || placeName || addressField.value.trim();

      if (!nextValue) {
        return;
      }

      addressField.value = nextValue;
      addressField.dispatchEvent(new Event("input", { bubbles: true }));
      addressField.dispatchEvent(new Event("change", { bubbles: true }));
    });

    addressField.dataset.googlePlacesReady = "true";
    setAddressHint("Start typing and choose the matching address suggestion.");
  };

  const buildRequestId = () => {
    return String(Math.floor(10000 + Math.random() * 90000));
  };

  const trackEvent = (eventName, params) => {
    if (typeof window.gtag !== "function") {
      return;
    }

    window.gtag("event", eventName, params);
  };

  const setStatus = (message, tone = "") => {
    statusElement.textContent = message;
    statusElement.classList.remove("is-success", "is-error");

    if (tone === "success") {
      statusElement.classList.add("is-success");
    }

    if (tone === "error") {
      statusElement.classList.add("is-error");
    }
  };

  const clearStatus = () => {
    setStatus("");
  };

  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const formatStartDate = (value) => {
    if (!value) {
      return "an unspecified date";
    }

    const parsed = new Date(`${value}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return dateFormatter.format(parsed);
  };

  const buildRequestReference = (requestId) => {
    const rawValue = String(requestId || "").trim();
    if (!rawValue) {
      return "";
    }

    return rawValue.slice(-5);
  };

  const buildSubject = (formData, requestId) => {
    const guestName = String(formData.get("Guest Name") || "").trim() || "Unknown guest";
    const nights = String(formData.get("Number of Nights") || "").trim();
    const startDate = formatStartDate(String(formData.get("Start Date") || ""));
    const nightLabel = nights === "1" ? "night" : "nights";
    const reference = buildRequestReference(requestId);
    const referenceSegment = reference ? ` | Ref ${reference}` : "";

    if (nights) {
      return `New RV reservation request | ${guestName} | ${startDate} | ${nights} ${nightLabel}${referenceSegment}`;
    }

    return `New RV reservation request | ${guestName} | ${startDate}${referenceSegment}`;
  };

  const buildSummary = (formData) => {
    return [
      `Guest: ${String(formData.get("Guest Name") || "").trim()}`,
      `Phone: ${String(formData.get("Guest Phone Number") || "").trim()}`,
      `Email: ${String(formData.get("Guest Email Address") || "").trim()}`,
      `Address: ${String(formData.get("Home Address") || "").trim().replace(/\s+/g, " ")}`,
      `Arrival: ${formatStartDate(String(formData.get("Start Date") || ""))}`,
      `Nights: ${String(formData.get("Number of Nights") || "").trim()}`,
      `RV Length: ${String(formData.get("RV Length in Feet") || "").trim()} ft`,
      `Towing: ${String(formData.get("Are You Towing?") || "").trim()}`,
      `RV Site Type: ${String(formData.get("RV Site Type") || "").trim()}`,
      `Amps Needed: ${String(formData.get("Amps Needed") || "").trim()}`
    ].join(" | ");
  };

  const closeModal = () => {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lightbox-open");
    document.removeEventListener("keydown", handleKeydown);

    if (lastTrigger instanceof HTMLElement) {
      lastTrigger.focus();
    }
  };

  const openModal = (trigger) => {
    lastTrigger = trigger instanceof HTMLElement ? trigger : null;
    clearStatus();
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("lightbox-open");
    document.addEventListener("keydown", handleKeydown);

    requestAnimationFrame(() => {
      const firstField = document.getElementById("reservation-name");
      if (firstField instanceof HTMLElement) {
        firstField.focus();
      }
    });

    trackEvent("booking_request_open", {
      event_category: "engagement",
      page_location: window.location.href,
      section: "contact"
    });
  };

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements();
    if (!focusableElements.length) {
      return;
    }

    const activeElement = resolveFocusTarget(document.activeElement);
    const currentIndex = activeElement ? focusableElements.indexOf(activeElement) : -1;
    const direction = event.shiftKey ? -1 : 1;
    const fallbackIndex = event.shiftKey ? 0 : -1;
    let nextIndex = (currentIndex === -1 ? fallbackIndex : currentIndex) + direction;

    if (nextIndex < 0) {
      nextIndex = focusableElements.length - 1;
    }

    if (nextIndex >= focusableElements.length) {
      nextIndex = 0;
    }

    event.preventDefault();
    focusableElements[nextIndex].focus();
  }

  const setMinimumArrivalDate = () => {
    if (!(startDateField instanceof HTMLInputElement)) {
      return;
    }

    startDateField.min = getLocalDateString();
  };

  openButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openModal(button);
    });
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  choiceLabels.forEach((label) => {
    const input = getChoiceInput(label);
    if (!input) {
      return;
    }

    label.addEventListener("click", () => {
      selectChoiceInput(input);
    });

    label.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        selectChoiceInput(input, true);
        return;
      }

      if (event.key !== "ArrowRight" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowUp") {
        return;
      }

      const groupInputs = Array.from(form.querySelectorAll(`input[type="radio"][name="${CSS.escape(input.name)}"]`));
      const currentIndex = groupInputs.indexOf(input);
      if (currentIndex === -1) {
        return;
      }

      event.preventDefault();

      const nextIndex =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? (currentIndex + 1) % groupInputs.length
          : (currentIndex - 1 + groupInputs.length) % groupInputs.length;

      const nextInput = groupInputs[nextIndex];
      if (nextInput instanceof HTMLInputElement) {
        selectChoiceInput(nextInput, true);
      }
    });
  });

  form.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "radio") {
      updateChoiceState(target);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    const formData = new FormData(form);
    const endpoint = getReservationEndpoint();
    if (!endpoint) {
      setStatus(
        "Booking requests are not fully configured yet. Add the Google Apps Script web app URL in reservation-config.js, then try again.",
        "error"
      );
      return;
    }

    const requestId = buildRequestId();
    const subject = buildSubject(formData, requestId);
    const guestEmail = String(formData.get("Guest Email Address") || "").trim();
    const summary = buildSummary(formData);

    formData.set("request_id", requestId);
    formData.set("request_subject", subject);
    formData.set("reply_to_email", guestEmail);
    formData.set("reservation_summary", summary);

    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        redirect: "follow"
      });

      const responseText = await response.text();
      let payload = null;

      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = null;
        }
      }

      if (!response.ok || (payload && payload.ok === false)) {
        throw new Error(
          (payload && (payload.message || payload.error)) ||
          "Reservation request delivery failed."
        );
      }

      setStatus(
        (payload && payload.message) ||
          "Your booking request was sent to Bay St. Louis Campground. The team will review availability and contact you soon.",
        "success"
      );
      form.reset();
      setMinimumArrivalDate();
      updateAllChoiceStates();
      trackEvent("booking_request_submitted", {
        event_category: "engagement",
        page_location: window.location.href,
        section: "contact"
      });
    } catch (error) {
      console.error(error);
      setStatus(
        "We could not send the request right now. Please call Bay St. Louis Campground at (228) 467-2080.",
        "error"
      );
      trackEvent("booking_request_submit_error", {
        event_category: "engagement",
        page_location: window.location.href,
        section: "contact"
      });
    } finally {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
        submitButton.textContent = "Send Booking Request";
      }
    }
  });

  setMinimumArrivalDate();
  updateAllChoiceStates();
  initializeAddressAutocomplete();
})();