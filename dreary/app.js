/* Dreary — the weather app that celebrates rain and grey skies. */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const FORECAST_DAYS = 16;
  const MONTH_DAYS = 30;
  const DEFAULT_PLACE = { name: "Seattle", lat: 47.6062, lon: -122.3321 };

  const store = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem("dreary." + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("dreary." + key, JSON.stringify(value)); } catch {}
    },
  };

  const state = {
    place: store.get("place", null),
    unitF: store.get("unitF", /(US|LR|MM)/.test(navigator.language || "")),
    days: [],        // 16-day computed forecast
    current: null,
    swReg: null,
  };

  /* ---------- weather vocabulary ---------- */

  // WMO weather codes → label + how Dreary feels about it
  const WMO = {
    0:  ["Clear sky", "clear"],
    1:  ["Mostly clear", "clear"],
    2:  ["Partly cloudy", "partly"],
    3:  ["Overcast", "overcast"],
    45: ["Fog", "fog"],
    48: ["Icy fog", "fog"],
    51: ["Light drizzle", "drizzle"],
    53: ["Drizzle", "drizzle"],
    55: ["Heavy drizzle", "drizzle"],
    56: ["Freezing drizzle", "drizzle"],
    57: ["Freezing drizzle", "drizzle"],
    61: ["Light rain", "rain"],
    63: ["Rain", "rain"],
    65: ["Heavy rain", "rain"],
    66: ["Freezing rain", "rain"],
    67: ["Freezing rain", "rain"],
    71: ["Light snow", "snow"],
    73: ["Snow", "snow"],
    75: ["Heavy snow", "snow"],
    77: ["Snow grains", "snow"],
    80: ["Rain showers", "rain"],
    81: ["Rain showers", "rain"],
    82: ["Violent rain showers", "rain"],
    85: ["Snow showers", "snow"],
    86: ["Snow showers", "snow"],
    95: ["Thunderstorm", "rain"],
    96: ["Thunderstorm with hail", "rain"],
    99: ["Thunderstorm with hail", "rain"],
  };

  const CELEBRATION = {
    rain:     ["It's raining. Rejoice. ☔", "The sky is delivering. Enjoy every drop."],
    drizzle:  ["A gentle drizzle — perfection.", "Soft rain, big feelings."],
    overcast: ["Gloriously grey out there.", "A proper blanket of cloud. Lovely."],
    fog:      ["Fog! The coziest weather of all.", "The world went soft at the edges."],
    snow:     ["Moody skies with a snowy twist.", "Grey above, white below. Take the win."],
    partly:   ["Some cloud. We'll take it.", "Halfway to dreary — hold on."],
    clear:    ["Alas — sun. Hang in there.", "Bright today. The gloom will return."],
  };

  function condition(code) {
    return WMO[code] || ["Weather", "partly"];
  }

  /* ---------- dreariness model ---------- */

  // 0–100: how celebration-worthy the gloom is.
  // Rain amount 40%, rain chance 30%, cloud cover 30%.
  function drearinessScore(precipMm, probPct, cloudPct) {
    const precip = Math.min((precipMm || 0) / 10, 1) * 40;
    const prob = ((probPct || 0) / 100) * 30;
    const cloud = ((cloudPct || 0) / 100) * 30;
    return Math.round(precip + prob + cloud);
  }

  function isDreary(day) {
    return day.score >= 50 || day.precip >= 1 || (day.prob >= 60 && day.cloud >= 70);
  }

  function scoreWord(score) {
    if (score >= 85) return "Peak gloom";
    if (score >= 65) return "Deliciously drizzly";
    if (score >= 50) return "Properly dreary";
    if (score >= 30) return "Pleasantly grey";
    return "Regrettably bright";
  }

  // Dreariness ramp: low recedes into the night, peak gloom glows bone-violet.
  // Steps validated against surface #16141c (dark-mode ordinal ramp).
  function scoreColor(score) {
    if (score >= 85) return { bg: "#cfc8f2", ink: "#0b0a0f" };
    if (score >= 70) return { bg: "#aca0e4", ink: "#0b0a0f" };
    if (score >= 55) return { bg: "#8b7cd3", ink: "#0b0a0f" };
    if (score >= 40) return { bg: "#6a58bd", ink: "#f2efe7" };
    if (score >= 25) return { bg: "#4a3aa7", ink: "#f2efe7" };
    return { bg: "", ink: "" }; // bright day: stays in the night
  }

  /* ---------- formatting ---------- */

  function parseDay(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function fmtTemp(c) {
    const v = state.unitF ? c * 9 / 5 + 32 : c;
    return Math.round(v);
  }

  function fmtPrecip(mm) {
    if (state.unitF) {
      const inches = mm / 25.4;
      return (inches >= 10 ? Math.round(inches) : inches.toFixed(2).replace(/0$/, "")) + " in";
    }
    return (mm >= 10 ? Math.round(mm) : Math.round(mm * 10) / 10) + " mm";
  }

  function fmtDayName(date, style = "long") {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((date - today) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return date.toLocaleDateString(undefined,
      style === "long" ? { weekday: "long", month: "long", day: "numeric" }
                       : { weekday: "short", month: "short", day: "numeric" });
  }

  /* ---------- data ---------- */

  async function fetchForecast(place) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: place.lat,
      longitude: place.lon,
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,cloud_cover_mean",
      forecast_days: String(FORECAST_DAYS),
      timezone: "auto",
    });
    const res = await fetch(url);
    if (!res.ok) throw new Error("forecast fetch failed: " + res.status);
    const data = await res.json();

    state.current = data.current;
    state.days = data.daily.time.map((iso, i) => {
      const precip = data.daily.precipitation_sum[i] ?? 0;
      const prob = data.daily.precipitation_probability_max[i] ?? 0;
      const cloud = data.daily.cloud_cover_mean[i] ?? 0;
      const day = {
        iso,
        date: parseDay(iso),
        code: data.daily.weather_code[i],
        tmax: data.daily.temperature_2m_max[i],
        tmin: data.daily.temperature_2m_min[i],
        precip, prob, cloud,
        score: drearinessScore(precip, prob, cloud),
      };
      day.dreary = isDreary(day);
      return day;
    });
  }

  function nextDrearyDay() {
    return state.days.find((d) => d.dreary) || null;
  }

  function topDrearyDays(n = 5) {
    return [...state.days]
      .sort((a, b) => b.score - a.score || b.precip - a.precip)
      .slice(0, n)
      .filter((d) => d.score >= 25);
  }

  /* ---------- rendering ---------- */

  function render() {
    renderHero();
    renderNextDreary();
    renderCalendar();
    renderTopDays();
    renderChart();
    renderTable();
    $("status").hidden = true;
  }

  function renderHero() {
    const c = state.current;
    const [label, kind] = condition(c.weather_code);
    const lines = CELEBRATION[kind];
    $("current-temp").textContent = fmtTemp(c.temperature_2m);
    $("current-deg").textContent = state.unitF ? "°F" : "°C";
    $("hero-cond").textContent = label + " — " + lines[Math.floor(Math.random() * lines.length)];
    $("meta-feels").textContent = "Feels " + fmtTemp(c.apparent_temperature) + "°";
    $("meta-cloud").textContent = Math.round(c.cloud_cover) + "% cloud";
    $("meta-humidity").textContent = Math.round(c.relative_humidity_2m) + "% humidity";
    $("hero").hidden = false;
    renderSky(kind);
  }

  function renderSky(kind) {
    const layer = $("sky-layer");
    layer.innerHTML = "";
    if (["overcast", "fog", "rain", "drizzle", "snow"].includes(kind)) {
      const cloud = document.createElement("div");
      cloud.className = "cloudband";
      layer.appendChild(cloud);
    }
    const dropCount = kind === "rain" ? 70 : kind === "drizzle" ? 35 : 0;
    for (let i = 0; i < dropCount; i++) {
      const drop = document.createElement("div");
      drop.className = "drop";
      drop.style.left = Math.random() * 100 + "vw";
      drop.style.animationDuration = 0.7 + Math.random() * 0.8 + "s";
      drop.style.animationDelay = -Math.random() * 2 + "s";
      drop.style.opacity = 0.3 + Math.random() * 0.5;
      layer.appendChild(drop);
    }
  }

  function renderNextDreary() {
    const day = nextDrearyDay();
    const card = $("next-dreary");
    card.hidden = false;
    if (!day) {
      $("next-day-name").textContent = "None in sight";
      $("next-day-detail").textContent =
        "A rare bright spell — no proper gloom in the next " + FORECAST_DAYS +
        " days. Chin up; the rain always comes back.";
      $("add-calendar").hidden = true;
      return;
    }
    $("add-calendar").hidden = false;
    $("next-day-name").textContent = fmtDayName(day.date);
    const bits = [];
    if (day.precip >= 0.2) bits.push(fmtPrecip(day.precip) + " of rain expected");
    if (day.prob) bits.push(day.prob + "% chance");
    bits.push(Math.round(day.cloud) + "% cloud");
    $("next-day-detail").textContent =
      scoreWord(day.score) + " (" + day.score + "/100). " + bits.join(" · ") + ".";
  }

  function renderCalendar() {
    const weekdayRow = $("cal-weekdays");
    weekdayRow.innerHTML = "";
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Week starts on the locale-agnostic simple choice: Sunday.
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 2, 1 + i); // a known Sunday-start week
      const el = document.createElement("span");
      el.textContent = fmt.format(d);
      weekdayRow.appendChild(el);
    }

    const grid = $("cal-grid");
    grid.innerHTML = "";
    const top3 = new Set(topDrearyDays(3).map((d) => d.iso));

    // leading blanks so the grid aligns to weekdays
    for (let i = 0; i < today.getDay(); i++) {
      const blank = document.createElement("span");
      blank.className = "cal-cell is-empty";
      grid.appendChild(blank);
    }

    for (let i = 0; i < MONTH_DAYS; i++) {
      const date = new Date(today); date.setDate(today.getDate() + i);
      const day = state.days[i]; // undefined beyond the 16-day forecast
      const cell = document.createElement("button");
      cell.className = "cal-cell";
      cell.type = "button";
      const num = document.createElement("span");
      num.textContent = date.getDate();
      cell.appendChild(num);

      if (i === 0) cell.classList.add("is-today");

      if (day) {
        const { bg, ink } = scoreColor(day.score);
        if (bg) { cell.style.background = bg; cell.style.color = ink; }
        if (top3.has(day.iso)) {
          const glyph = document.createElement("span");
          glyph.className = "cal-glyph";
          glyph.textContent = "☔";
          cell.appendChild(glyph);
        }
        cell.setAttribute("aria-label",
          fmtDayName(day.date) + ": " + scoreWord(day.score) + ", dreariness " + day.score + " out of 100");
        cell.addEventListener("click", (e) => showDayTooltip(day, e.currentTarget));
      } else {
        cell.classList.add("is-beyond");
        cell.disabled = true;
        cell.setAttribute("aria-label",
          date.toLocaleDateString(undefined, { month: "long", day: "numeric" }) + ": beyond the forecast");
      }
      grid.appendChild(cell);
    }
    $("month-card").hidden = false;
  }

  function renderTopDays() {
    const list = $("top-list");
    list.innerHTML = "";
    const top = topDrearyDays(5);
    if (!top.length) {
      const li = document.createElement("li");
      li.className = "top-item";
      li.textContent = "Nothing rank-worthy — an unusually sunny stretch.";
      list.appendChild(li);
      $("top-card").hidden = false;
      return;
    }
    top.forEach((day, i) => {
      const li = document.createElement("li");
      li.className = "top-item";
      li.innerHTML =
        '<span class="top-rank">' + (i + 1) + "</span>" +
        '<span class="top-main">' +
          '<p class="top-date"></p>' +
          '<p class="top-detail"></p>' +
        "</span>" +
        '<span class="top-meter">' +
          '<span class="top-meter-track"><span class="top-meter-fill"></span></span>' +
          '<span class="top-score"></span>' +
        "</span>";
      li.querySelector(".top-date").textContent = fmtDayName(day.date, "short");
      li.querySelector(".top-detail").textContent =
        fmtPrecip(day.precip) + " · " + day.prob + "% chance · " + scoreWord(day.score);
      li.querySelector(".top-meter-fill").style.width = day.score + "%";
      li.querySelector(".top-score").textContent = day.score + "/100";
      li.addEventListener("click", () => openCalendarSheet(day));
      list.appendChild(li);
    });
    $("top-card").hidden = false;
  }

  /* ---------- precipitation chart (single series, no legend) ---------- */

  function niceMax(v) {
    if (v <= 1) return 1;
    const steps = [2, 4, 5, 10, 15, 20, 30, 40, 50, 80, 100, 150, 200];
    return steps.find((s) => s >= v) || Math.ceil(v / 100) * 100;
  }

  function renderChart() {
    const days = state.days;
    const W = 440, H = 190;
    const pad = { top: 18, right: 6, bottom: 26, left: 34 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const maxMm = niceMax(Math.max(1, ...days.map((d) => d.precip)));
    const slot = plotW / days.length;
    const barW = Math.min(24, slot - 2); // ≥2px surface gap between bars
    const maxIdx = days.reduce((best, d, i) => (d.precip > days[best].precip ? i : best), 0);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Bar chart of daily precipitation for the next 16 days");

    const put = (name, attrs, parent = svg) => {
      const el = document.createElementNS(svgNS, name);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      parent.appendChild(el);
      return el;
    };

    // hairline gridlines + clean ticks
    const tickCount = 4;
    for (let t = 0; t <= tickCount; t++) {
      const val = (maxMm / tickCount) * t;
      const y = pad.top + plotH - (val / maxMm) * plotH;
      put("line", {
        x1: pad.left, x2: W - pad.right, y1: y, y2: y,
        stroke: t === 0 ? "var(--baseline)" : "var(--gridline)",
        "stroke-width": 1,
      });
      const label = put("text", {
        x: pad.left - 6, y: y + 3.5,
        "text-anchor": "end", "font-size": 10.5,
        fill: "var(--text-muted)", "font-variant-numeric": "tabular-nums",
      });
      label.textContent = state.unitF
        ? (Math.round((val / 25.4) * 100) / 100).toString()
        : (Math.round(val * 10) / 10).toString();
    }
    // axis unit
    const unitLabel = put("text", {
      x: pad.left - 6, y: pad.top - 8,
      "text-anchor": "end", "font-size": 10.5, fill: "var(--text-muted)",
    });
    unitLabel.textContent = state.unitF ? "in" : "mm";

    days.forEach((day, i) => {
      const x = pad.left + i * slot + (slot - barW) / 2;
      const h = Math.max(day.precip > 0 ? 2 : 0, (day.precip / maxMm) * plotH);
      const y = pad.top + plotH - h;

      if (h > 0) {
        // 4px rounded data-end, square at the baseline
        const r = Math.min(4, barW / 2, h);
        const bar = put("path", {
          d: `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`,
          fill: "var(--accent)",
          class: "bar",
        });
        attachTooltip(bar, day);
      } else {
        // invisible hit target so dry days still answer to a tap
        const hit = put("rect", {
          x, y: pad.top, width: barW, height: plotH,
          fill: "transparent", class: "bar",
        });
        attachTooltip(hit, day);
      }

      // direct label on the wettest day only
      if (i === maxIdx && day.precip > 0) {
        const lbl = put("text", {
          x: x + barW / 2, y: y - 5,
          "text-anchor": "middle", "font-size": 10.5,
          "font-weight": 600, fill: "var(--text-secondary)",
        });
        lbl.textContent = fmtPrecip(day.precip);
      }

      // x labels: every other day
      if (i % 2 === 0) {
        const xl = put("text", {
          x: x + barW / 2, y: H - 8,
          "text-anchor": "middle", "font-size": 10,
          fill: "var(--text-muted)",
        });
        xl.textContent = day.date.toLocaleDateString(undefined, { day: "numeric" });
      }
    });

    const wrap = $("chart");
    wrap.innerHTML = "";
    wrap.appendChild(svg);
    $("chart-card").hidden = false;
  }

  function renderTable() {
    const tbody = $("chart-table").querySelector("tbody");
    tbody.innerHTML = "";
    state.days.forEach((day) => {
      const tr = document.createElement("tr");
      [fmtDayName(day.date, "short"), fmtPrecip(day.precip), day.prob + "%",
       Math.round(day.cloud) + "%", day.score + "/100"].forEach((v) => {
        const td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  /* ---------- tooltip ---------- */

  let tooltipTimer = null;

  function attachTooltip(el, day) {
    const show = (e) => showDayTooltip(day, null, e);
    el.addEventListener("pointerenter", show);
    el.addEventListener("pointerdown", show);
    el.addEventListener("pointerleave", hideTooltip);
  }

  function showDayTooltip(day, anchorEl, evt) {
    const tip = $("tooltip");
    tip.innerHTML =
      "<strong>" + fmtDayName(day.date, "short") + "</strong><br>" +
      condition(day.code)[0] + "<br>" +
      fmtPrecip(day.precip) + " · " + day.prob + "% chance · " +
      Math.round(day.cloud) + "% cloud<br>" +
      "Dreariness " + day.score + "/100 — " + scoreWord(day.score);
    tip.hidden = false;

    let x, y;
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top;
    } else {
      x = evt.clientX; y = evt.clientY;
    }
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(x - tw / 2, window.innerWidth - tw - 8)) + "px";
    tip.style.top = Math.max(8, y - th - 12) + "px";

    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(hideTooltip, 3500);
  }

  function hideTooltip() {
    clearTimeout(tooltipTimer);
    $("tooltip").hidden = true;
  }

  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".bar") && !e.target.closest(".cal-cell")) hideTooltip();
  });

  /* ---------- calendar export ---------- */

  let sheetDay = null;

  function openCalendarSheet(day) {
    sheetDay = day;
    $("sheet-sub").textContent =
      fmtDayName(day.date) + " — " + scoreWord(day.score) +
      ", " + fmtPrecip(day.precip) + " expected.";
    $("sheet-backdrop").hidden = false;
  }

  function closeSheet() { $("sheet-backdrop").hidden = true; }

  function icsDate(date) {
    return date.getFullYear() +
      String(date.getMonth() + 1).padStart(2, "0") +
      String(date.getDate()).padStart(2, "0");
  }

  function eventText(day) {
    return {
      title: "☔ Dreary Day — savor the gloom",
      details: "Dreary says " + fmtDayName(day.date) + " will be " +
        scoreWord(day.score).toLowerCase() + " (" + day.score + "/100): " +
        fmtPrecip(day.precip) + " of rain, " + day.prob + "% chance, " +
        Math.round(day.cloud) + "% cloud. Plan accordingly: tea, window seat, good book.",
    };
  }

  function downloadIcs(day) {
    const { title, details } = eventText(day);
    const end = new Date(day.date); end.setDate(end.getDate() + 1);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Dreary//Rainy Day//EN",
      "BEGIN:VEVENT",
      "UID:" + day.iso + "@dreary.app",
      "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + icsDate(day.date),
      "DTEND;VALUE=DATE:" + icsDate(end),
      "SUMMARY:" + title,
      "DESCRIPTION:" + details.replace(/,/g, "\\,"),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dreary-day-" + day.iso + ".ics";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openGoogleCalendar(day) {
    const { title, details } = eventText(day);
    const end = new Date(day.date); end.setDate(end.getDate() + 1);
    const url = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(title) +
      "&dates=" + icsDate(day.date) + "/" + icsDate(end) +
      "&details=" + encodeURIComponent(details);
    window.open(url, "_blank", "noopener");
  }

  /* ---------- notifications ---------- */

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setStatus("This browser doesn't support notifications.");
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
    store.set("notify", true);
    $("notify-btn").textContent = "Reminders on ☂";
    notify("Dreary is watching the sky",
      "You'll hear from us when proper gloom approaches.");
    return true;
  }

  function notify(title, body) {
    if (Notification.permission !== "granted") return;
    const opts = { body, icon: "icon.svg", badge: "icon.svg", tag: "dreary" };
    if (state.swReg && state.swReg.showNotification) {
      state.swReg.showNotification(title, opts);
    } else {
      new Notification(title, opts);
    }
  }

  // Local reminders: fired when the app opens (real push needs a server).
  function maybeNotifyGloom() {
    if (!store.get("notify") || Notification.permission !== "granted") return;
    const day = nextDrearyDay();
    if (!day) return;
    const key = day.iso;
    if (store.get("notifiedFor") === key) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((day.date - today) / 86400000);
    if (diff === 0) {
      notify("Today is a dreary day ☔", scoreWord(day.score) + " (" + day.score +
        "/100) with " + fmtPrecip(day.precip) + " of rain. Enjoy it.");
      store.set("notifiedFor", key);
    } else if (diff <= 2) {
      notify("Gloom incoming", fmtDayName(day.date) + " looks " +
        scoreWord(day.score).toLowerCase() + ". " + fmtPrecip(day.precip) + " on the way.");
      store.set("notifiedFor", key);
    }
  }

  /* ---------- onboarding prompts (the app asks) ---------- */

  function showPrompt({ title, body, yesLabel, onYes, onDismiss }) {
    $("prompt-title").textContent = title;
    $("prompt-body").textContent = body;
    $("prompt-yes").textContent = yesLabel;
    $("prompt-card").hidden = false;
    $("prompt-yes").onclick = () => { $("prompt-card").hidden = true; onYes(); };
    $("prompt-no").onclick = () => { $("prompt-card").hidden = true; onDismiss(); };
  }

  function runOnboardingAsks() {
    const day = nextDrearyDay();

    const askNotifications = () => {
      if (store.get("askedNotify") || store.get("notify")) return;
      showPrompt({
        title: "Never miss the gloom",
        body: "Want a nudge from Dreary when a properly dreary day is coming up?",
        yesLabel: "Notify me ☂",
        onYes: () => { store.set("askedNotify", true); enableNotifications(); },
        onDismiss: () => store.set("askedNotify", true),
      });
    };

    if (day && !store.get("askedCalendar")) {
      showPrompt({
        title: "A dreary day approaches",
        body: fmtDayName(day.date) + " looks " + scoreWord(day.score).toLowerCase() +
          ". Shall we save it to your calendar so nothing sunny gets scheduled over it?",
        yesLabel: "Add to calendar",
        onYes: () => { store.set("askedCalendar", true); openCalendarSheet(day); setTimeout(askNotifications, 400); },
        onDismiss: () => { store.set("askedCalendar", true); askNotifications(); },
      });
    } else {
      askNotifications();
    }
  }

  /* ---------- location ---------- */

  function setStatus(msg) {
    const el = $("status");
    el.textContent = msg;
    el.hidden = !msg;
  }

  async function geolocate() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      // Belt and suspenders: some browsers never fire a callback when the
      // permission prompt is dismissed, so resolve null ourselves.
      const bail = setTimeout(() => resolve(null), 9000);
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(bail); resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: "My location" }); },
        () => { clearTimeout(bail); resolve(null); },
        { timeout: 8000, maximumAge: 600000 }
      );
    });
  }

  async function reverseName(place) {
    // Best-effort pretty name for GPS coordinates.
    try {
      const url = "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" +
        place.lat + "&longitude=" + place.lon + "&localityLanguage=en";
      const res = await fetch(url);
      if (!res.ok) return place;
      const d = await res.json();
      const name = d.city || d.locality || d.principalSubdivision;
      if (name) place.name = name;
    } catch {}
    return place;
  }

  async function searchCities(q) {
    const url = "https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&name=" +
      encodeURIComponent(q);
    const res = await fetch(url);
    if (!res.ok) return [];
    const d = await res.json();
    return (d.results || []).map((r) => ({
      name: r.name + (r.admin1 ? ", " + r.admin1 : "") + (r.country_code ? " " + r.country_code : ""),
      shortName: r.name,
      lat: r.latitude,
      lon: r.longitude,
    }));
  }

  async function usePlace(place) {
    state.place = place;
    store.set("place", place);
    $("location-name").textContent = place.name;
    $("search-panel").hidden = true;
    setStatus("Reading the clouds over " + place.name + "…");
    try {
      await fetchForecast(place);
      render();
      runOnboardingAsks();
      maybeNotifyGloom();
    } catch (err) {
      console.error(err);
      setStatus("Couldn't reach the weather service. Pull the window shade and try again.");
    }
  }

  /* ---------- wiring ---------- */

  function wire() {
    $("unit-toggle").textContent = state.unitF ? "°F" : "°C";
    $("unit-toggle").addEventListener("click", () => {
      state.unitF = !state.unitF;
      store.set("unitF", state.unitF);
      $("unit-toggle").textContent = state.unitF ? "°F" : "°C";
      if (state.days.length) render();
    });

    $("location-btn").addEventListener("click", () => {
      const panel = $("search-panel");
      panel.hidden = !panel.hidden;
      if (!panel.hidden) $("search-input").focus();
    });

    let searchTimer = null;
    $("search-input").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      const q = e.target.value.trim();
      if (q.length < 2) { $("search-results").innerHTML = ""; return; }
      searchTimer = setTimeout(async () => {
        const results = await searchCities(q);
        const ul = $("search-results");
        ul.innerHTML = "";
        results.forEach((r) => {
          const li = document.createElement("li");
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = r.name;
          btn.addEventListener("click", () => usePlace({ name: r.shortName, lat: r.lat, lon: r.lon }));
          li.appendChild(btn);
          ul.appendChild(li);
        });
      }, 300);
    });

    $("use-gps").addEventListener("click", async () => {
      setStatus("Finding you beneath the clouds…");
      const place = await geolocate();
      if (place) usePlace(await reverseName(place));
      else setStatus("Couldn't get your location — search for a city instead.");
    });

    $("add-calendar").addEventListener("click", () => {
      const day = nextDrearyDay();
      if (day) openCalendarSheet(day);
    });

    $("notify-btn").addEventListener("click", async () => {
      if (store.get("notify") && Notification.permission === "granted") {
        store.set("notify", false);
        $("notify-btn").textContent = "Remind me";
        return;
      }
      const ok = await enableNotifications();
      if (!ok) setStatus("Notifications are blocked for this site in your browser settings.");
    });

    $("sheet-ics").addEventListener("click", () => { if (sheetDay) downloadIcs(sheetDay); closeSheet(); });
    $("sheet-google").addEventListener("click", () => { if (sheetDay) openGoogleCalendar(sheetDay); closeSheet(); });
    $("sheet-close").addEventListener("click", closeSheet);
    $("sheet-backdrop").addEventListener("click", (e) => {
      if (e.target === $("sheet-backdrop")) closeSheet();
    });

    $("table-toggle").addEventListener("click", () => {
      const wrap = $("chart-table-wrap");
      const chart = $("chart");
      const showTable = wrap.hidden;
      wrap.hidden = !showTable;
      chart.hidden = showTable;
      $("table-toggle").textContent = showTable ? "Chart" : "Table";
    });

    if (store.get("notify") && "Notification" in window && Notification.permission === "granted") {
      $("notify-btn").textContent = "Reminders on ☂";
    }
  }

  async function init() {
    wire();

    if ("serviceWorker" in navigator) {
      try {
        state.swReg = await navigator.serviceWorker.register("sw.js");
      } catch (e) { console.warn("sw registration failed", e); }
    }

    if (state.place) {
      usePlace(state.place);
      return;
    }
    const located = await geolocate();
    if (located) usePlace(await reverseName(located));
    else usePlace(DEFAULT_PLACE); // spiritually appropriate fallback
  }

  init();
})();
