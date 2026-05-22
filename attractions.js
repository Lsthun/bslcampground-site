const embeddedAttractionsFeed = window.__ATTRACTIONS_FEED__ && Array.isArray(window.__ATTRACTIONS_FEED__.items)
  ? window.__ATTRACTIONS_FEED__
  : { items: [] };

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const descriptionLimit = 180;
const mobileCalendarBreakpoint = window.matchMedia("(max-width: 760px)");
const reducedMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const refreshStaleDays = 31;

const locationSlugMap = {
  "Bay St. Louis": "bay-st-louis",
  Waveland: "waveland",
  "Gulfport/Biloxi": "gulfport-biloxi"
};

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseGeneratedAt(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getLocationSlug(location) {
  return locationSlugMap[location] || "other";
}

function truncateText(value, maxLength = descriptionLimit) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  const trimmed = lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  return `${trimmed.trimEnd()}...`;
}

function buildSourceLabel(item) {
  if (item.cta && item.cta !== "View Event") {
    return item.cta;
  }

  if (item.source) {
    return `View on ${item.source}`;
  }

  return item.cta || "Open";
}

function buildFeedActionMarkup(item) {
  if (item.hasLiveLink !== false && item.url) {
    return `<a class="attraction-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(buildSourceLabel(item))}</a>`;
  }

  const statusMessage = item.linkNote || "Source event page is unavailable right now.";
  return `<p class="calendar-feed-card__status">${escapeHtml(statusMessage)}</p>`;
}

function buildMonthKeys(items) {
  if (items.length === 0) {
    return [];
  }

  const firstMonth = new Date(items[0].dateObject.getFullYear(), items[0].dateObject.getMonth(), 1);
  const lastMonth = new Date(items[items.length - 1].dateObject.getFullYear(), items[items.length - 1].dateObject.getMonth(), 1);
  const monthKeys = [];

  for (let cursor = new Date(firstMonth); cursor <= lastMonth; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    monthKeys.push(formatMonthKey(cursor));
  }

  return monthKeys;
}

function getMonthBounds(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    first: new Date(year, month - 1, 1),
    last: new Date(year, month, 0)
  };
}

function isSameCalendarDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function clampDate(date, minDate, maxDate) {
  if (date < minDate) {
    return new Date(minDate);
  }

  if (date > maxDate) {
    return new Date(maxDate);
  }

  return new Date(date);
}

function getWeekStart(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

async function loadAttractionsFeed() {
  try {
    const response = await fetch("./attractions-feed.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Feed request failed");
    }

    const data = await response.json();
    if (!Array.isArray(data.items)) {
      throw new Error("Feed shape is invalid");
    }

    return data;
  } catch {
    return embeddedAttractionsFeed;
  }
}

function normalizeItems(rawItems) {
  return rawItems
    .map((item) => ({
      ...item,
      dateObject: parseLocalDate(item.date)
    }))
    .sort((left, right) => left.dateObject - right.dateObject || left.title.localeCompare(right.title));
}

document.addEventListener("DOMContentLoaded", async () => {
  const monthLabel = document.getElementById("calendar-month-label");
  const calendarGrid = document.getElementById("calendar-grid");
  const calendarAgenda = document.getElementById("calendar-agenda");
  const calendarResults = document.getElementById("calendar-results");
  const calendarShell = calendarGrid ? calendarGrid.closest(".calendar-shell") : null;
  const siteHeader = document.querySelector(".site-header");
  const calendarFeed = document.getElementById("calendar-feed");
  const calendarFeedHeader = document.getElementById("calendar-feed-header");
  const calendarFeedTitle = document.getElementById("calendar-feed-title");
  const calendarRefreshNote = document.getElementById("calendar-refresh-note");
  const zoomCopy = document.getElementById("calendar-zoom-copy");
  const clearDayButton = document.getElementById("calendar-clear-day");
  const weekPicker = document.getElementById("calendar-week-picker");
  const filterButtons = Array.from(document.querySelectorAll("[data-location-filter]"));
  const navButtons = Array.from(document.querySelectorAll("[data-calendar-nav]"));

  if (
    !monthLabel ||
    !calendarGrid ||
    !calendarAgenda ||
    !calendarResults ||
    !calendarFeed ||
    !calendarFeedHeader ||
    !zoomCopy ||
    !clearDayButton ||
    !weekPicker ||
    filterButtons.length === 0 ||
    navButtons.length === 0
  ) {
    return;
  }

  const feed = await loadAttractionsFeed();
  const items = normalizeItems(feed.items || []);
  const today = new Date();
  const todayDate = parseLocalDate(formatDateInputValue(today));
  const upcomingItems = items.filter((item) => item.dateObject >= todayDate);
  const monthKeys = buildMonthKeys(upcomingItems);
  const todayKey = formatMonthKey(today);
  let currentMonthIndex = monthKeys.includes(todayKey) ? monthKeys.indexOf(todayKey) : 0;
  let activeLocation = "All";
  let selectedDate = null;
  let weekAnchorDate = null;

  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
  const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const dayDetailFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
  const refreshFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

  function renderRefreshStatus() {
    if (!calendarRefreshNote) {
      return;
    }

    const generatedAt = parseGeneratedAt(feed.generatedAt);
    const windowEnd = feed.window && feed.window.end ? parseLocalDate(feed.window.end) : null;

    if (!generatedAt) {
      calendarRefreshNote.textContent = "Last refreshed date is unavailable for this feed.";
      calendarRefreshNote.classList.add("is-stale");
      return;
    }

    const ageInDays = Math.floor((Date.now() - generatedAt.getTime()) / 86400000);
    const refreshLabel = refreshFormatter.format(generatedAt);
    const coverageLabel = windowEnd ? ` Coverage currently runs through ${refreshFormatter.format(windowEnd)}.` : "";
    const isStale = ageInDays >= refreshStaleDays;

    calendarRefreshNote.textContent = isStale
      ? `Last refreshed ${refreshLabel}. This feed is more than a month old and may need a rerun.${coverageLabel}`
      : `Last refreshed ${refreshLabel}.${coverageLabel}`;
    calendarRefreshNote.classList.toggle("is-stale", isStale);
  }

  renderRefreshStatus();

  if (monthKeys.length === 0) {
    calendarResults.hidden = false;
    calendarFeed.innerHTML = '<div class="calendar-feed-empty"><p>No upcoming attractions are loaded yet.</p></div>';
    return;
  }

  const firstAvailableDate = upcomingItems[0].dateObject;
  const lastAvailableDate = upcomingItems[upcomingItems.length - 1].dateObject;

  weekPicker.min = formatDateInputValue(firstAvailableDate);
  weekPicker.max = formatDateInputValue(lastAvailableDate);

  function getActiveMonthKey() {
    return monthKeys[currentMonthIndex];
  }

  function getLocationItems() {
    return upcomingItems.filter((item) => activeLocation === "All" || item.location === activeLocation);
  }

  function getMonthItems() {
    const activeMonthKey = getActiveMonthKey();
    return getLocationItems().filter((item) => formatMonthKey(item.dateObject) === activeMonthKey);
  }

  function getMonthDisplayStart() {
    const activeMonthKey = getActiveMonthKey();
    const monthBounds = getMonthBounds(activeMonthKey);

    if (activeMonthKey !== todayKey) {
      return monthBounds.first;
    }

    return clampDate(todayDate, monthBounds.first, monthBounds.last);
  }

  function getVisibleItems() {
    if (!selectedDate) {
      return [];
    }

    return getLocationItems().filter((item) => item.date === selectedDate);
  }

  function getItemsByDay(monthItems) {
    const itemsByDay = new Map();

    monthItems.forEach((item) => {
      const day = item.dateObject.getDate();
      if (!itemsByDay.has(day)) {
        itemsByDay.set(day, []);
      }
      itemsByDay.get(day).push(item);
    });

    return itemsByDay;
  }

  function getItemsByDate(locationItems) {
    const itemsByDate = new Map();

    locationItems.forEach((item) => {
      if (!itemsByDate.has(item.date)) {
        itemsByDate.set(item.date, []);
      }
      itemsByDate.get(item.date).push(item);
    });

    return itemsByDate;
  }

  function syncSelectedDate() {
    if (!selectedDate) {
      return;
    }

    const hasMatch = getLocationItems().some((item) => item.date === selectedDate);
    if (!hasMatch) {
      selectedDate = null;
    }
  }

  function syncWeekAnchor() {
    const activeMonthKey = getActiveMonthKey();
    const monthBounds = getMonthBounds(activeMonthKey);
    const monthItems = getMonthItems();

    if (selectedDate) {
      weekAnchorDate = parseLocalDate(selectedDate);
    } else if (!weekAnchorDate || formatMonthKey(weekAnchorDate) !== activeMonthKey) {
      const fallbackDate = monthItems.length > 0 ? monthItems[0].dateObject : monthBounds.first;
      const preferredDate = formatMonthKey(today) === activeMonthKey ? todayDate : fallbackDate;
      weekAnchorDate = clampDate(preferredDate, monthBounds.first, monthBounds.last);
    } else {
      weekAnchorDate = clampDate(weekAnchorDate, monthBounds.first, monthBounds.last);
    }

    weekPicker.value = formatDateInputValue(weekAnchorDate);
  }

  function renderMonthLabel() {
    const [year, month] = getActiveMonthKey().split("-").map(Number);
    monthLabel.textContent = monthFormatter.format(new Date(year, month - 1, 1));
  }

  function renderNavState() {
    navButtons.forEach((button) => {
      const isPrevious = button.dataset.calendarNav === "prev";
      const isDisabled = isPrevious ? currentMonthIndex === 0 : currentMonthIndex === monthKeys.length - 1;
      button.disabled = isDisabled;
      button.setAttribute("aria-disabled", String(isDisabled));
    });
  }

  function renderGrid() {
    const [year, month] = getActiveMonthKey().split("-").map(Number);
    const lastDay = new Date(year, month, 0);
    const visibleStart = getMonthDisplayStart();
    const monthItems = getMonthItems();
    const itemsByDay = getItemsByDay(monthItems);

    const labelsMarkup = weekdayLabels
      .map((label) => `<div class="calendar-grid__label">${label}</div>`)
      .join("");

    const blanksMarkup = Array.from({ length: visibleStart.getDay() }, () => '<div class="calendar-grid__blank" aria-hidden="true"></div>').join("");

    const daysMarkup = Array.from({ length: lastDay.getDate() - visibleStart.getDate() + 1 }, (_, index) => {
      const dayNumber = visibleStart.getDate() + index;
      const dayItems = itemsByDay.get(dayNumber) || [];
      const dayKey = `${getActiveMonthKey()}-${String(dayNumber).padStart(2, "0")}`;
      const isToday =
        year === today.getFullYear() &&
        month - 1 === today.getMonth() &&
        dayNumber === today.getDate();
      const dayClasses = ["calendar-grid__day"];

      if (isToday) {
        dayClasses.push("is-today");
      }

      if (dayItems.length > 0) {
        dayClasses.push("has-items", "is-clickable");
      }

      if (selectedDate === dayKey) {
        dayClasses.push("is-selected");
      }

      const pills = dayItems
        .slice(0, 2)
        .map((item) => `<span class="calendar-grid__pill" data-city="${escapeHtml(getLocationSlug(item.location))}">${escapeHtml(item.title)}</span>`)
        .join("");

      const more = dayItems.length > 2 ? `<span class="calendar-grid__more">+${dayItems.length - 2} more</span>` : "";

      return `
        <button class="${dayClasses.join(" ")}" type="button" data-day-key="${dayKey}" aria-pressed="${String(selectedDate === dayKey)}" ${dayItems.length === 0 ? "disabled" : ""}>
          <span class="calendar-grid__date">${dayNumber}</span>
          <div class="calendar-grid__items">${pills}${more}</div>
        </button>
      `;
    }).join("");

    calendarGrid.innerHTML = `${labelsMarkup}${blanksMarkup}${daysMarkup}`;
  }

  function renderAgenda() {
    const locationItems = getLocationItems();
    const itemsByDate = getItemsByDate(locationItems);
    const agendaStart = new Date(weekAnchorDate);
    const weekDates = Array.from({ length: 7 }, (_, index) => {
      const nextDate = new Date(agendaStart);
      nextDate.setDate(agendaStart.getDate() + index);
      return nextDate;
    });

    calendarAgenda.innerHTML = weekDates
      .map((date) => {
        const dayKey = formatDateInputValue(date);
        const dayItems = itemsByDate.get(dayKey) || [];
        const isToday = isSameCalendarDay(date, today);
        const isCurrentMonth = formatMonthKey(date) === getActiveMonthKey();
        const dayClasses = ["calendar-agenda__day"];

        if (selectedDate === dayKey) {
          dayClasses.push("is-selected");
        }

        if (isToday) {
          dayClasses.push("is-today");
        }

        if (!isCurrentMonth) {
          dayClasses.push("is-outside-month");
        }

        if (dayItems.length === 0) {
          dayClasses.push("is-empty");
        }

        const previewMarkup = dayItems.length > 0
          ? dayItems
              .slice(0, 2)
              .map(
                (item) =>
                  `<span class="calendar-grid__pill" data-city="${escapeHtml(getLocationSlug(item.location))}">${escapeHtml(item.title)}</span>`
              )
              .join("")
          : '<span class="calendar-grid__more">No events</span>';

        const countLabel = dayItems.length === 0 ? "No events" : `${dayItems.length} ${dayItems.length === 1 ? "event" : "events"}`;

        return `
          <button class="${dayClasses.join(" ")}" type="button" data-day-key="${dayKey}" aria-pressed="${String(selectedDate === dayKey)}" ${dayItems.length === 0 ? "disabled" : ""}>
            <span class="calendar-agenda__day-top">
              <span class="calendar-agenda__date">${escapeHtml(dayDetailFormatter.format(date))}</span>
              <span class="calendar-agenda__count">${countLabel}</span>
            </span>
            <div class="calendar-agenda__items">${previewMarkup}</div>
          </button>
        `;
      })
      .join("");
  }

  function renderZoomState() {
    if (selectedDate) {
      const selectedItems = getVisibleItems();
      const selectedDateObject = parseLocalDate(selectedDate);
      zoomCopy.textContent = `${selectedItems.length} activities on ${dayDetailFormatter.format(selectedDateObject)}.`;
      calendarResults.hidden = false;
      clearDayButton.hidden = false;

      if (calendarFeedTitle) {
        calendarFeedTitle.textContent = `Filtered picks for ${dayDetailFormatter.format(selectedDateObject)}`;
      }

      return;
    }

    const monthItems = getMonthItems();
    const locationLabel = activeLocation === "All" ? "all cities" : activeLocation;
    zoomCopy.textContent = mobileCalendarBreakpoint.matches
      ? `Showing a week at a time for ${locationLabel}. Pick a day with events to reveal the filtered picks.`
      : `Showing ${monthItems.length} activities for ${locationLabel}. Select a day with events to reveal the filtered picks.`;

    calendarResults.hidden = true;
    clearDayButton.hidden = true;
  }

  function renderFeed() {
    if (!selectedDate) {
      calendarFeed.innerHTML = "";
      return;
    }

    const visibleItems = getVisibleItems();

    if (visibleItems.length === 0) {
      calendarFeed.innerHTML = `
        <div class="calendar-feed-empty">
          <p>No sourced community events are loaded for this date yet.</p>
        </div>
      `;
      return;
    }

    calendarFeed.innerHTML = visibleItems
      .map(
        (item) => `
          <article class="calendar-feed-card" data-city="${escapeHtml(getLocationSlug(item.location))}">
            <p class="calendar-feed-card__meta">
              <span>${escapeHtml(dayFormatter.format(item.dateObject))}</span>
              <span data-city="${escapeHtml(getLocationSlug(item.location))}">${escapeHtml(item.location)}</span>
              <span>${escapeHtml(item.category)}</span>
              ${item.timeLabel ? `<span>${escapeHtml(item.timeLabel)}</span>` : ""}
              ${item.source ? `<span>${escapeHtml(item.source)}</span>` : ""}
            </p>
            <h4>${escapeHtml(item.title)}</h4>
            <p class="calendar-feed-card__description">${escapeHtml(truncateText(item.description))}</p>
            <div class="calendar-feed-card__actions">
              ${buildFeedActionMarkup(item)}
            </div>
          </article>
        `
      )
      .join("");
  }

  function render() {
    syncSelectedDate();
    syncWeekAnchor();
    renderMonthLabel();
    renderNavState();
    renderGrid();
    renderAgenda();
    renderZoomState();
    renderFeed();
  }

  function getScrollTopOffset() {
    if (mobileCalendarBreakpoint.matches) {
      return 24;
    }

    if (!siteHeader) {
      return 24;
    }

    const headerStyles = window.getComputedStyle(siteHeader);
    const stickyTop = headerStyles.position === "sticky" ? Number.parseFloat(headerStyles.top) || 0 : 0;
    return siteHeader.getBoundingClientRect().height + stickyTop + 24;
  }

  function scrollWindowTo(top) {
    window.scrollTo({
      top: Math.max(top, 0),
      behavior: reducedMotionPreference.matches ? "auto" : "smooth"
    });
  }

  function scrollElementIntoView(element, additionalGap = 0) {
    if (!element) {
      return;
    }

    window.requestAnimationFrame(() => {
      const nextTop = window.scrollY + element.getBoundingClientRect().top - getScrollTopOffset() - additionalGap;
      scrollWindowTo(nextTop);
    });
  }

  function scrollResultsIntoView() {
    if (!calendarResults || calendarResults.hidden) {
      return;
    }

    scrollElementIntoView(calendarFeedTitle || calendarFeedHeader || calendarResults, mobileCalendarBreakpoint.matches ? 12 : 16);
  }

  function getDesktopWeekTarget(anchorDayKey = null) {
    if (!calendarGrid) {
      return calendarShell;
    }

    const fallbackDayKey = weekAnchorDate ? formatDateInputValue(weekAnchorDate) : null;
    const dayKey = anchorDayKey || fallbackDayKey;
    if (!dayKey) {
      return calendarGrid;
    }

    return calendarGrid.querySelector(`[data-day-key="${dayKey}"]`) || calendarGrid;
  }

  function scrollCalendarIntoView(anchorDayKey = null) {
    if (mobileCalendarBreakpoint.matches) {
      scrollElementIntoView(calendarAgenda || calendarShell, 8);
      return;
    }

    scrollElementIntoView(getDesktopWeekTarget(anchorDayKey), 56);
  }

  function handleDaySelection(nextDayKey) {
    if (selectedDate === nextDayKey) {
      selectedDate = null;
      render();
      return;
    }

    selectedDate = nextDayKey;
    weekAnchorDate = parseLocalDate(nextDayKey);

    const selectedMonthKey = formatMonthKey(weekAnchorDate);
    const selectedMonthIndex = monthKeys.indexOf(selectedMonthKey);
    if (selectedMonthIndex >= 0) {
      currentMonthIndex = selectedMonthIndex;
    }

    render();
    scrollResultsIntoView();
  }

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.dataset.calendarNav === "next" ? 1 : -1;
      const nextIndex = currentMonthIndex + direction;
      if (nextIndex < 0 || nextIndex >= monthKeys.length) {
        return;
      }

      currentMonthIndex = nextIndex;
      selectedDate = null;
      weekAnchorDate = null;
      render();
    });
  });

  calendarGrid.addEventListener("click", (event) => {
    const target = event.target.closest("[data-day-key]");
    if (!target || target.disabled) {
      return;
    }

    handleDaySelection(target.dataset.dayKey);
  });

  calendarAgenda.addEventListener("click", (event) => {
    const target = event.target.closest("[data-day-key]");
    if (!target || target.disabled) {
      return;
    }

    handleDaySelection(target.dataset.dayKey);
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeLocation = button.dataset.locationFilter || "All";
      selectedDate = null;

      filterButtons.forEach((candidate) => {
        const isActive = candidate === button;
        candidate.classList.toggle("is-active", isActive);
        candidate.setAttribute("aria-pressed", String(isActive));
      });

      render();
    });
  });

  clearDayButton.addEventListener("click", () => {
    const activeDayKey = selectedDate;
    selectedDate = null;
    render();
    scrollCalendarIntoView(activeDayKey);
  });

  weekPicker.addEventListener("change", () => {
    if (!weekPicker.value) {
      return;
    }

    const nextDate = parseLocalDate(weekPicker.value);
    const monthKey = formatMonthKey(nextDate);
    const nextMonthIndex = monthKeys.indexOf(monthKey);
    if (nextMonthIndex >= 0) {
      currentMonthIndex = nextMonthIndex;
    }

    weekAnchorDate = clampDate(nextDate, firstAvailableDate, lastAvailableDate);
    selectedDate = null;
    render();
  });

  if (typeof mobileCalendarBreakpoint.addEventListener === "function") {
    mobileCalendarBreakpoint.addEventListener("change", render);
  }

  render();
});