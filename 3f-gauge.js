/*
 * 3f Gauge Card
 * A dependency-free Lovelace card for displaying a three-phase quantity.
 */

const CARD_TAG = "three-f-gauge-card";
const CARD_VERSION = "0.2.3";

const DEFAULT_COLOR = "var(--primary-color)";
const DEFAULT_PHASE_NAMES = ["L1", "L2", "L3"];

class ThreeFGaugeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = undefined;
    this._hass = undefined;
    this._templateResult = "";
    this._templateKey = undefined;
    this._templateConnection = undefined;
    this._templateUnsubscribe = undefined;
    this._templateSubscriptionId = 0;
  }

  static getStubConfig() {
    return {
      main: {
        entity: "sensor.active_power",
        min: 0,
        max: 10000,
      },
      phases: {
        entities: [
          "sensor.active_power_l1",
          "sensor.active_power_l2",
          "sensor.active_power_l3",
        ],
        min: 0,
        max: 5000,
      },
    };
  }

  setConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("3f Gauge: configuration is required.");
    }

    const phaseEntities = config.phases?.entities;
    if (!Array.isArray(phaseEntities) || phaseEntities.length !== 3) {
      throw new Error("3f Gauge: phases.entities must contain exactly three entities.");
    }
    if (phaseEntities.some((entity) => typeof entity !== "string" || !entity.trim())) {
      throw new Error("3f Gauge: every phase entity must be a non-empty string.");
    }

    this._validateScale(config.phases, "phases");
    if (config.main) {
      const hasEntity = typeof config.main.entity === "string" && config.main.entity.trim();
      const calculatesSum = config.main.calculate === "sum";
      if (!hasEntity && !calculatesSum) {
        throw new Error('3f Gauge: main must define entity or calculate: "sum".');
      }
      this._validateScale(config.main, "main");
    }

    this._config = structuredClone(config);
    this._syncDescriptionTemplate();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._syncDescriptionTemplate();
    this._render();
  }

  connectedCallback() {
    this._syncDescriptionTemplate();
  }

  disconnectedCallback() {
    this._teardownDescriptionTemplate();
  }

  getCardSize() {
    return 2;
  }

  _validateScale(section, name) {
    const min = Number(section?.min);
    const max = Number(section?.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      throw new Error(`3f Gauge: ${name}.min and ${name}.max must be numbers and min must be lower than max.`);
    }
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;

    const config = this._config;
    const phaseStates = config.phases.entities.map((entity) => this._entityValue(entity));
    const mainState = config.main ? this._mainValue(config.main, phaseStates) : undefined;
    const name = this._displayName(config, mainState, phaseStates);
    const description = this._description(config.description);
    const hasMain = Boolean(config.main);

    const mainMarkup = hasMain
      ? this._mainMarkup(config.main, mainState)
      : "";
    const phaseBars = phaseStates
      .map((state, index) => this._phaseBarMarkup(state, index, !hasMain))
      .join("");
    const phaseValues = phaseStates
      .map((state, index) => this._phaseValueMarkup(state, index))
      .join("");

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        <div class="card-content ${hasMain ? "" : "without-main"}">
          <header>
            <div class="card-name">
              ${mainState?.stateObject ? `<ha-state-icon class="card-icon"></ha-state-icon>` : ""}
              <span>${escapeHtml(name)}</span>
            </div>
            ${mainMarkup}
            ${description ? `<div class="description">${escapeHtml(description)}</div>` : ""}
          </header>
          <div class="gauges" role="group" aria-label="${escapeHtml(name)}">
            ${hasMain ? this._barMarkup(mainState, config.main, "main-bar", this._mainEntity(config.main), name) : ""}
            <div class="phase-bars">${phaseBars}</div>
          </div>
          <div class="phase-values">${phaseValues}</div>
        </div>
      </ha-card>
    `;

    const cardIcon = this.shadowRoot.querySelector(".card-icon");
    if (cardIcon) {
      cardIcon.hass = this._hass;
      cardIcon.stateObj = mainState.stateObject;
    }

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((element) => {
      element.addEventListener("click", () => this._showMoreInfo(element.dataset.entity));
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this._showMoreInfo(element.dataset.entity);
        }
      });
    });
  }

  _mainMarkup(mainConfig, state) {
    const entity = this._mainEntity(mainConfig);
    const value = this._formattedValue(state, mainConfig);
    return `
      <div class="main-value ${entity ? "interactive" : ""}" ${entityAttributes(entity)}>
        <span class="main-number">${escapeHtml(value.text)}</span>
        ${value.unit ? `<span class="main-unit">${escapeHtml(value.unit)}</span>` : ""}
      </div>
    `;
  }

  _phaseBarMarkup(state, index, expanded) {
    const phaseConfig = this._config.phases;
    const name = this._phaseName(index);
    return this._barMarkup(
      state,
      phaseConfig,
      `phase-bar ${expanded ? "expanded" : ""}`,
      phaseConfig.entities[index],
      name,
    );
  }

  _phaseValueMarkup(state, index) {
    const config = this._config.phases;
    const entity = config.entities[index];
    const value = this._formattedValue(state, config);
    return `
      <div class="phase-value interactive" ${entityAttributes(entity)}>
        <span class="phase-name">${escapeHtml(this._phaseName(index))}</span>
        <span class="phase-number">${escapeHtml(value.text)}</span>
        ${value.unit ? `<span class="phase-unit">${escapeHtml(value.unit)}</span>` : ""}
      </div>
    `;
  }

  _barMarkup(state, scale, className, entity, label) {
    const value = state?.value;
    const min = Number(scale.min);
    const max = Number(scale.max);
    const zero = clamp((0 - min) / (max - min), 0, 1) * 100;
    const position = Number.isFinite(value)
      ? clamp((value - min) / (max - min), 0, 1) * 100
      : zero;
    const left = Math.min(zero, position);
    const width = Math.abs(position - zero);
    const color = this._colorForValue(value, scale);
    const mixedScale = min < 0 && max > 0;
    const formatted = this._formattedValue(state, scale);
    const ariaValue = formatted.unit ? `${formatted.text} ${formatted.unit}` : formatted.text;
    const interactiveClass = entity ? "interactive" : "";

    return `
      <div class="bar-row ${interactiveClass}" ${entityAttributes(entity)}
        role="${entity ? "button" : "img"}" aria-label="${escapeHtml(`${label}: ${ariaValue}`)}">
        <div class="bar-track ${className} ${state?.available ? "" : "unavailable"}">
          <div class="bar-fill" style="left:${left}%;width:${width}%;background:${color}"></div>
          ${mixedScale ? `<div class="zero" style="left:${zero}%"></div>` : ""}
        </div>
      </div>
    `;
  }

  _mainValue(mainConfig, phaseStates) {
    if (mainConfig.entity) return this._entityValue(mainConfig.entity);
    if (mainConfig.calculate === "sum" && phaseStates.every((state) => state.available)) {
      return {
        value: phaseStates.reduce((sum, state) => sum + state.value, 0),
        unit: mainConfig.unit ?? phaseStates.find((state) => state.unit)?.unit ?? "",
        available: true,
      };
    }
    return { value: undefined, unit: mainConfig.unit ?? "", available: false };
  }

  _entityValue(entityId) {
    const stateObject = this._hass.states[entityId];
    const value = stateObject ? Number(stateObject.state) : Number.NaN;
    return {
      value: Number.isFinite(value) ? value : undefined,
      unit: stateObject?.attributes?.unit_of_measurement ?? "",
      available: Number.isFinite(value),
      stateObject,
    };
  }

  _formattedValue(state, section) {
    if (!state?.available || !Number.isFinite(state.value)) {
      return { text: this._hass.localize?.("state.default.unavailable") ?? "Unavailable", unit: "" };
    }

    const precision = Number.isInteger(section.precision)
      ? clamp(section.precision, 0, 6)
      : this._suggestedPrecision(state.value);
    let text;
    try {
      text = new Intl.NumberFormat(this._hass.locale?.language, {
        minimumFractionDigits: 0,
        maximumFractionDigits: precision,
      }).format(state.value);
    } catch (_error) {
      text = state.value.toFixed(precision);
    }
    return { text, unit: section.unit ?? state.unit ?? "" };
  }

  _suggestedPrecision(value) {
    return Number.isInteger(value) ? 0 : 2;
  }

  _description(descriptionConfig) {
    if (!descriptionConfig) return "";
    if (typeof descriptionConfig === "string") return descriptionConfig;
    if (descriptionConfig.template != null) return this._templateResult;
    if (descriptionConfig.text != null) return String(descriptionConfig.text);
    if (!descriptionConfig.entity) return "";

    const stateObject = this._hass.states[descriptionConfig.entity];
    if (!stateObject) return this._hass.localize?.("state.default.unavailable") ?? "Unavailable";
    if (typeof this._hass.formatEntityState === "function") {
      return this._hass.formatEntityState(stateObject);
    }
    return stateObject.state;
  }

  _displayName(config, mainState, phaseStates) {
    if (config.main?.name != null) return String(config.main.name);
    const stateObject = mainState?.stateObject ?? phaseStates.find((state) => state.stateObject)?.stateObject;
    return stateObject?.attributes?.friendly_name ?? "3-phase gauge";
  }

  _syncDescriptionTemplate() {
    const description = this._config?.description;
    const template = description && typeof description === "object" && description.template != null
      ? String(description.template)
      : "";
    const variables = description && typeof description === "object" && description.variables
      ? description.variables
      : undefined;
    const connection = this._hass?.connection;
    const key = template ? JSON.stringify([template, variables ?? null]) : undefined;

    if (!template || !connection || !this.isConnected) {
      if (!template) this._teardownDescriptionTemplate();
      return;
    }
    if (key === this._templateKey && connection === this._templateConnection) return;

    this._teardownDescriptionTemplate();
    this._templateKey = key;
    this._templateConnection = connection;
    this._templateResult = "";
    const subscriptionId = ++this._templateSubscriptionId;

    Promise.resolve().then(() => connection.subscribeMessage((event) => {
      if (subscriptionId !== this._templateSubscriptionId) return;
      this._templateResult = String(event?.result ?? "");
      this._render();
    }, {
      type: "render_template",
      template,
      ...(variables ? { variables } : {}),
    })).then((unsubscribe) => {
      if (subscriptionId !== this._templateSubscriptionId) {
        unsubscribe?.();
        return;
      }
      this._templateUnsubscribe = unsubscribe;
    }).catch((error) => {
      if (subscriptionId !== this._templateSubscriptionId) return;
      console.error("3f Gauge: description template failed", error);
      this._templateResult = "";
      this._render();
    });
  }

  _teardownDescriptionTemplate() {
    this._templateSubscriptionId += 1;
    if (this._templateUnsubscribe) {
      this._templateUnsubscribe();
      this._templateUnsubscribe = undefined;
    }
    this._templateKey = undefined;
    this._templateConnection = undefined;
  }

  _phaseName(index) {
    return this._config.phases.names?.[index] ?? DEFAULT_PHASE_NAMES[index];
  }

  _mainEntity(mainConfig) {
    return mainConfig.entity || "";
  }

  _colorForValue(value, section) {
    if (Number.isFinite(value) && Array.isArray(section.color_ranges)) {
      const range = section.color_ranges.find((candidate) => {
        const from = candidate.from == null ? Number.NEGATIVE_INFINITY : Number(candidate.from);
        const to = candidate.to == null ? Number.POSITIVE_INFINITY : Number(candidate.to);
        return value >= from && value <= to;
      });
      if (range?.color) return safeCssColor(range.color);
    }
    return safeCssColor(section.color ?? DEFAULT_COLOR);
  }

  _showMoreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId },
    }));
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeCssColor(value) {
  const color = String(value ?? DEFAULT_COLOR).trim();
  return /[;{}<>"']/.test(color) ? DEFAULT_COLOR : color;
}

function entityAttributes(entity) {
  return entity
    ? `data-entity="${escapeHtml(entity)}" tabindex="0"`
    : "";
}

const STYLES = `
  :host {
    display: block;
  }

  ha-card {
    overflow: hidden;
  }

  .card-content {
    padding: 11px 16px 6px;
  }

  header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .card-name {
    align-items: center;
    color: var(--secondary-text-color);
    display: flex;
    gap: 9px;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.2;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .card-icon {
    --state-icon-color: var(--secondary-text-color);
    color: var(--secondary-text-color);
    flex: 0 0 18px;
    height: 18px;
    transform: translateY(-1px);
    width: 18px;
  }

  .description {
    color: var(--secondary-text-color);
    font-size: 16px;
    font-weight: 500;
    grid-column: 3;
    line-height: 1.2;
    overflow-wrap: anywhere;
    text-align: right;
  }

  .main-value {
    color: var(--primary-text-color);
    flex: 0 0 auto;
    grid-column: 2;
    line-height: 1;
    text-align: center;
  }

  .main-number {
    font-size: 21px;
    font-weight: 500;
    letter-spacing: -0.02em;
  }

  .main-unit {
    color: var(--secondary-text-color);
    font-size: 12px;
    margin-left: 3px;
  }

  .gauges {
    margin-top: 5px;
  }

  .bar-row {
    border-radius: 999px;
    outline: none;
  }

  .bar-track {
    background: color-mix(in srgb, var(--secondary-text-color) 13%, transparent);
    border-radius: 999px;
    overflow: hidden;
    position: relative;
  }

  .main-bar {
    height: 14px;
  }

  .phase-bars {
    display: grid;
    gap: 2px;
    margin: 2px auto 0;
    width: calc(100% - 16px);
  }

  .phase-bar {
    height: 8px;
  }

  .phase-bar.expanded {
    height: 10px;
  }

  .without-main .phase-bars {
    gap: 2px;
    margin-top: 0;
    width: 100%;
  }

  .bar-fill {
    border-radius: 999px;
    height: 100%;
    min-width: 0;
    position: absolute;
    transition: left 300ms ease, width 300ms ease, background-color 300ms ease;
  }

  .zero {
    background: color-mix(in srgb, var(--primary-text-color) 38%, transparent);
    height: 100%;
    position: absolute;
    top: 0;
    transform: translateX(-0.5px);
    width: 1px;
  }

  .unavailable {
    opacity: 0.45;
  }

  .phase-values {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 3px;
  }

  .phase-value {
    align-items: baseline;
    display: flex;
    gap: 5px;
    justify-content: center;
    min-width: 0;
    outline: none;
    padding: 1px 7px;
    text-align: center;
  }

  .phase-value + .phase-value {
    border-left: 1px solid var(--divider-color);
  }

  .phase-name {
    color: var(--secondary-text-color);
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .phase-number {
    color: var(--primary-text-color);
    font-size: 15px;
    font-weight: 500;
  }

  .phase-unit {
    color: var(--secondary-text-color);
    font-size: 11px;
    margin-left: 2px;
  }

  .interactive {
    cursor: pointer;
  }

  .interactive:focus-visible {
    box-shadow: 0 0 0 2px var(--primary-color);
  }

  @media (prefers-reduced-motion: reduce) {
    .bar-fill {
      transition: none;
    }
  }
`;

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, ThreeFGaugeCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_TAG,
    name: "3f Gauge Card",
    description: "A compact three-phase gauge for Home Assistant.",
    preview: true,
  });
  console.info(`%c 3F-GAUGE %c v${CARD_VERSION} `, "color: white; background: #03a9f4; font-weight: 700;", "color: #03a9f4; background: white;");
}
