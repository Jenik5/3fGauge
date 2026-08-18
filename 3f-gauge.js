/*
 * 3f Gauge Card
 * A dependency-free Lovelace card for displaying a three-phase quantity.
 */

const CARD_TAG = "three-f-gauge-card";
const EDITOR_TAG = "three-f-gauge-card-editor";
const CARD_VERSION = "2026.08.18.01";

const DEFAULT_COLOR = "var(--primary-color)";
const DEFAULT_PHASE_NAMES = ["L1", "L2", "L3"];
const SCALE_LINEAR = "linear";
const SCALE_LOGARITHMIC = "logarithmic";
const LOG_SCALE_STRENGTH = 9;
const PHASE_BARS_TOTAL_INSET = 16;
const ZERO_ALIGNMENT_TOLERANCE = 1e-6;

class ThreeFGaugeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = undefined;
    this._hass = undefined;
    this._templates = {
      description: createTemplateState(),
      icon: createTemplateState(),
      iconColor: createTemplateState(),
    };
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

  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
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
    this._validateTemplateableValue(config.icon, "icon");
    this._validateTemplateableValue(config.icon_color, "icon_color");

    this._config = structuredClone(config);
    this._syncTemplates();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._syncTemplates();
    this._render();
  }

  connectedCallback() {
    this._syncTemplates();
  }

  disconnectedCallback() {
    this._teardownTemplates();
  }

  getCardSize() {
    return isCompactCardConfig(this._config) ? 1 : 2;
  }

  getGridOptions() {
    const compact = isCompactCardConfig(this._config);
    return {
      rows: compact ? 1 : 2,
      columns: 12,
      min_rows: compact ? 1 : 2,
      min_columns: 6,
    };
  }

  _validateScale(section, name) {
    const min = Number(section?.min);
    const max = Number(section?.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      throw new Error(`3f Gauge: ${name}.min and ${name}.max must be numbers and min must be lower than max.`);
    }

    const scale = section?.scale ?? SCALE_LINEAR;
    if (scale !== SCALE_LINEAR && scale !== SCALE_LOGARITHMIC) {
      throw new Error(`3f Gauge: ${name}.scale must be "linear" or "logarithmic".`);
    }
  }

  _validateTemplateableValue(value, name) {
    if (value == null || typeof value === "string") return;
    if (
      typeof value !== "object"
      || Array.isArray(value)
      || typeof value.template !== "string"
      || !value.template.trim()
    ) {
      throw new Error(`3f Gauge: ${name} must be a string or an object with a non-empty template.`);
    }
  }

  _render() {
    if (!this.shadowRoot || !this._config || !this._hass) return;

    const config = this._config;
    const phaseStates = config.phases.entities.map((entity) => this._entityValue(entity));
    const mainState = config.main ? this._mainValue(config.main, phaseStates) : undefined;
    const name = this._displayName(config, mainState, phaseStates);
    const description = this._description(config.description);
    const showName = config.show_name !== false;
    const showDescription = config.show_description !== false && Boolean(description);
    const icon = templateableValue(config.icon, this._templates.icon.result);
    const iconColor = safeOptionalCssColor(
      templateableValue(config.icon_color, this._templates.iconColor.result),
    );
    const hasIcon = config.show_icon !== false && Boolean(mainState?.stateObject || config.icon);
    const hasMain = Boolean(config.main);
    const hasCardName = hasIcon || showName;
    const hasHeader = hasCardName || hasMain || showDescription;
    const compact = !hasMain && !hasHeader;
    const phaseBarsOffset = hasMain
      ? alignedPhaseBarsOffset(config.main, config.phases)
      : undefined;
    const phaseBarsStyle = phaseBarsOffset == null
      ? ""
      : ` style="--phase-bars-offset:${phaseBarsOffset}px"`;

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
        <div class="card-content ${hasMain ? "" : "without-main"} ${compact ? "compact" : ""}">
          ${hasHeader ? `<header>
            ${hasCardName ? `<div class="card-name">
              ${hasIcon ? `<ha-state-icon class="card-icon"></ha-state-icon>` : ""}
              ${showName ? `<span>${escapeHtml(name)}</span>` : ""}
            </div>` : ""}
            ${mainMarkup}
            ${showDescription ? `<div class="description">${escapeHtml(description)}</div>` : ""}
          </header>` : ""}
          <div class="gauges" role="group" aria-label="${escapeHtml(name)}">
            ${hasMain ? this._barMarkup(mainState, config.main, "main-bar", this._mainEntity(config.main), name) : ""}
            <div class="phase-bars"${phaseBarsStyle}>${phaseBars}</div>
          </div>
          <div class="phase-values">${phaseValues}</div>
        </div>
      </ha-card>
    `;

    const cardIcon = this.shadowRoot.querySelector(".card-icon");
    if (cardIcon) {
      cardIcon.hass = this._hass;
      cardIcon.stateObj = mainState?.stateObject;
      cardIcon.icon = icon || undefined;
      if (iconColor) {
        cardIcon.style.color = iconColor;
        cardIcon.style.setProperty("--state-icon-color", iconColor);
      }
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
    const zero = scaleZeroPosition(min, max) * 100;
    const position = Number.isFinite(value)
      ? scalePosition(value, min, max, scale.scale) * 100
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
    if (descriptionConfig.template != null) return this._templates.description.result;
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
    if (config.name != null) return String(config.name);
    if (config.main?.name != null) return String(config.main.name);
    const stateObject = mainState?.stateObject ?? phaseStates.find((state) => state.stateObject)?.stateObject;
    return stateObject?.attributes?.friendly_name ?? "3-phase gauge";
  }

  _syncTemplates() {
    const showDescription = this._config?.show_description !== false;
    const showIcon = this._config?.show_icon !== false;
    this._syncTemplate("description", showDescription ? this._config?.description : undefined);
    this._syncTemplate("icon", showIcon ? this._config?.icon : undefined);
    this._syncTemplate("iconColor", showIcon ? this._config?.icon_color : undefined);
  }

  _syncTemplate(name, config) {
    const state = this._templates[name];
    const template = config && typeof config === "object" && config.template != null
      ? String(config.template)
      : "";
    const variables = config && typeof config === "object" && config.variables != null
      ? config.variables
      : undefined;
    const connection = this._hass?.connection;
    const key = template ? JSON.stringify([template, variables ?? null]) : undefined;

    if (!template || !connection || !this.isConnected) {
      if (!template) this._teardownTemplate(name);
      return;
    }
    if (key === state.key && connection === state.connection) return;

    this._teardownTemplate(name);
    state.key = key;
    state.connection = connection;
    const subscriptionId = ++state.subscriptionId;

    Promise.resolve().then(() => connection.subscribeMessage((event) => {
      if (subscriptionId !== state.subscriptionId) return;
      state.result = String(event?.result ?? "");
      this._render();
    }, {
      type: "render_template",
      template,
      ...(variables !== undefined ? { variables } : {}),
    })).then((unsubscribe) => {
      if (subscriptionId !== state.subscriptionId) {
        unsubscribe?.();
        return;
      }
      state.unsubscribe = unsubscribe;
    }).catch((error) => {
      if (subscriptionId !== state.subscriptionId) return;
      console.error(`3f Gauge: ${name} template failed`, error);
      state.result = "";
      this._render();
    });
  }

  _teardownTemplates() {
    Object.keys(this._templates).forEach((name) => this._teardownTemplate(name));
  }

  _teardownTemplate(name) {
    const state = this._templates[name];
    state.subscriptionId += 1;
    if (state.unsubscribe) {
      state.unsubscribe();
      state.unsubscribe = undefined;
    }
    state.key = undefined;
    state.connection = undefined;
    state.result = "";
  }

  _phaseName(index) {
    return this._config.phases.names?.[index] ?? DEFAULT_PHASE_NAMES[index];
  }

  _mainEntity(mainConfig) {
    return mainConfig.entity || "";
  }

  _colorForValue(value, section) {
    if (Number.isFinite(value) && Array.isArray(section.color_ranges)) {
      const boundedRange = section.color_ranges.find((candidate) => {
        if (candidate.to == null) return false;
        const from = candidate.from == null ? Number.NEGATIVE_INFINITY : Number(candidate.from);
        const to = Number(candidate.to);
        return value >= from && value <= to;
      });
      if (boundedRange?.color) return safeCssColor(boundedRange.color);

      const thresholdRange = section.color_ranges.reduce((selected, candidate) => {
        if (candidate.to != null || !candidate.color) return selected;
        const from = candidate.from == null ? Number.NEGATIVE_INFINITY : Number(candidate.from);
        if (Number.isNaN(from) || value < from) return selected;
        return !selected || from > selected.from ? { from, candidate } : selected;
      }, undefined)?.candidate;
      if (thresholdRange?.color) return safeCssColor(thresholdRange.color);
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

class ThreeFGaugeCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = undefined;
    this._hass = undefined;
    this._activeTab = "general";
    this._waitingForForm = false;
    this._modes = undefined;
    this._language = "en";
  }

  set hass(hass) {
    const language = editorLanguage(hass);
    const languageChanged = language !== this._language;
    this._hass = hass;
    this._language = language;
    if (languageChanged && this._config && this.isConnected) {
      this._render();
      return;
    }
    this.shadowRoot?.querySelectorAll("ha-form").forEach((form) => {
      form.hass = hass;
    });
  }

  get hass() {
    return this._hass;
  }

  _t(key) {
    return editorTranslate(this._language, key);
  }

  setConfig(config) {
    const firstConfig = !this._config;
    const normalized = normalizeEditorConfig(config);
    if (!firstConfig && configurationsEqual(this._config, normalized)) {
      this._config = normalized;
      return;
    }
    this._config = normalized;
    if (firstConfig) {
      this._modes = {
        icon: templateableMode(this._config.icon),
        iconColor: templateableMode(this._config.icon_color),
        description: descriptionMode(this._config.description),
        mainSource: !this._config.main || this._config.main.calculate === "sum" ? "sum" : "entity",
      };
    }
    this._render();
  }

  connectedCallback() {
    this._ensureHaForm();
    this._render();
  }

  _ensureHaForm() {
    if (customElements.get("ha-form") || this._waitingForForm) return;
    this._waitingForForm = true;
    customElements.get("hui-entities-card")?.getConfigElement?.();
    customElements.get("hui-button-card")?.getConfigElement?.();
    customElements.whenDefined("ha-form").then(() => {
      this._waitingForForm = false;
      if (this.isConnected) this._render();
    });
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;

    if (!customElements.get("ha-form")) {
      this.shadowRoot.innerHTML = `
        <style>${EDITOR_STYLES}</style>
        <div class="loading">${escapeHtml(this._t("loading"))}</div>
      `;
      return;
    }

    this.shadowRoot.innerHTML = `
      <style>${EDITOR_STYLES}</style>
      <div class="tabs" role="tablist" aria-label="${escapeHtml(this._t("settings_aria"))}">
        ${EDITOR_TABS.map(({ id, labelKey }) => `
          <button
            type="button"
            role="tab"
            data-tab="${id}"
            aria-selected="${this._activeTab === id}"
            class="${this._activeTab === id ? "active" : ""}"
          >${escapeHtml(this._t(labelKey))}</button>
        `).join("")}
      </div>
      <div class="form">
        <ha-form class="settings-form"></ha-form>
        ${this._colorRangesMarkup()}
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.tab === this._activeTab) return;
        this._activeTab = button.dataset.tab;
        this._render();
      });
    });

    const form = this.shadowRoot.querySelector(".settings-form");
    form.hass = this._hass;
    form.data = this._formData();
    form.schema = localizedEditorSchema(this._formSchema(), (key) => this._t(key));
    form.computeLabel = (schema) => this._editorLabel(schema);
    form.computeHelper = (schema) => this._editorHelper(schema);
    form.addEventListener("value-changed", (event) => this._valueChanged(event));
    this._setupColorRangesEditor();
  }

  _formData() {
    if (this._activeTab === "main") return this._mainData();
    if (this._activeTab === "phases") return this._phasesData();
    return this._generalData();
  }

  _formSchema() {
    if (this._activeTab === "main") return MAIN_EDITOR_SCHEMA;
    if (this._activeTab === "phases") return PHASES_EDITOR_SCHEMA;
    return GENERAL_EDITOR_SCHEMA;
  }

  _editorLabel(schema) {
    const key = EDITOR_LABEL_KEYS[schema.name];
    return key ? this._t(key) : undefined;
  }

  _editorHelper(schema) {
    const key = EDITOR_HELPER_KEYS[schema.name];
    return key ? this._t(key) : undefined;
  }

  _colorRangesMarkup() {
    const section = this._activeTab === "main"
      ? this._config.main
      : this._activeTab === "phases"
        ? this._config.phases
        : undefined;
    if (!section) return "";

    const ranges = editorColorRanges(section);
    return `
      <section class="color-ranges">
        <h3>${escapeHtml(this._t("segments_title"))}</h3>
        <p>${escapeHtml(this._t("segments_description"))}</p>
        <div class="color-range-list">
          ${ranges.map((_range, index) => `
            <div class="color-range-row">
              <ha-form class="color-range-form" data-range-index="${index}"></ha-form>
              <button class="delete-range" type="button" data-delete-range="${index}">
                <ha-icon icon="mdi:delete"></ha-icon>
                <span>${escapeHtml(this._t("delete_segment"))}</span>
              </button>
            </div>
          `).join("")}
        </div>
        <button class="add-range" type="button">
          <ha-icon icon="mdi:plus"></ha-icon>
          <span>${escapeHtml(this._t("add_segment"))}</span>
        </button>
      </section>
    `;
  }

  _setupColorRangesEditor() {
    const section = this._activeTab === "main"
      ? this._config.main
      : this._activeTab === "phases"
        ? this._config.phases
        : undefined;
    if (!section) return;

    const ranges = editorColorRanges(section);
    this.shadowRoot.querySelectorAll(".color-range-form").forEach((form) => {
      const index = Number(form.dataset.rangeIndex);
      form.hass = this._hass;
      form.data = {
        range_from: ranges[index]?.from,
        range_color: ranges[index]?.color ?? "",
      };
      form.schema = COLOR_RANGE_EDITOR_SCHEMA;
      form.computeLabel = (schema) => this._editorLabel(schema);
      form.computeHelper = (schema) => this._editorHelper(schema);
      form.addEventListener("value-changed", (event) => {
        this._colorRangeChanged(event, index);
      });
    });

    this.shadowRoot.querySelectorAll("[data-delete-range]").forEach((button) => {
      button.addEventListener("click", () => {
        this._deleteColorRange(Number(button.dataset.deleteRange));
      });
    });
    this.shadowRoot.querySelector(".add-range")?.addEventListener("click", () => {
      this._addColorRange();
    });
  }

  _colorRangeChanged(event, index) {
    event.stopPropagation();
    const data = event.detail?.value;
    const sectionKey = this._activeTab === "main" ? "main" : "phases";
    const section = this._config?.[sectionKey];
    if (!data || !section) return;

    const config = structuredClone(this._config);
    const nextSection = { ...config[sectionKey] };
    const ranges = editorColorRanges(nextSection);
    if (!ranges[index]) return;

    const from = data.range_from === "" || data.range_from == null
      ? Number.NaN
      : Number(data.range_from);
    ranges[index] = {
      from: Number.isFinite(from) ? from : ranges[index].from,
      color: stringValue(data.range_color),
    };
    nextSection.color_ranges = ranges;
    config[sectionKey] = nextSection;
    this._emitConfig(config);
  }

  _addColorRange() {
    const sectionKey = this._activeTab === "main" ? "main" : "phases";
    const section = this._config?.[sectionKey];
    if (!section) return;

    const config = structuredClone(this._config);
    const nextSection = { ...config[sectionKey] };
    const ranges = editorColorRanges(nextSection);
    const min = Number(nextSection.min);
    const max = Number(nextSection.max);
    const span = Number.isFinite(min) && Number.isFinite(max) ? max - min : 1;
    const lastFrom = ranges.length ? Number(ranges[ranges.length - 1].from) : min;
    const from = ranges.length
      ? clamp(lastFrom + Math.max(span / 10, 1), min, max)
      : min;
    ranges.push({
      from: Number.isFinite(from) ? from : 0,
      color: stringValue(nextSection.color) || DEFAULT_COLOR,
    });
    nextSection.color_ranges = ranges;
    config[sectionKey] = nextSection;
    this._emitConfig(config);
    this._render();
  }

  _deleteColorRange(index) {
    const sectionKey = this._activeTab === "main" ? "main" : "phases";
    const section = this._config?.[sectionKey];
    if (!section) return;

    const config = structuredClone(this._config);
    const nextSection = { ...config[sectionKey] };
    const ranges = editorColorRanges(nextSection);
    ranges.splice(index, 1);
    if (ranges.length) {
      nextSection.color_ranges = ranges;
    } else {
      delete nextSection.color_ranges;
    }
    config[sectionKey] = nextSection;
    this._emitConfig(config);
    this._render();
  }

  _generalData() {
    const description = this._config.description;
    return {
      show_name: this._config.show_name !== false,
      name: this._config.name ?? "",
      show_icon: this._config.show_icon !== false,
      icon_mode: this._modes.icon,
      icon_value: typeof this._config.icon === "string" ? this._config.icon : "",
      icon_template: templateText(this._config.icon),
      icon_color_mode: this._modes.iconColor,
      icon_color_value: typeof this._config.icon_color === "string" ? this._config.icon_color : "",
      icon_color_template: templateText(this._config.icon_color),
      show_description: this._config.show_description !== false,
      description_mode: this._modes.description,
      description_text: typeof description === "string"
        ? description
        : description?.text ?? "",
      description_entity: description?.entity ?? "",
      description_template: templateText(description),
    };
  }

  _mainData() {
    const main = this._config.main;
    const phases = this._config.phases;
    return {
      main_enabled: Boolean(main),
      main_source: this._modes.mainSource,
      main_entity: main?.entity ?? "",
      main_min: main?.min ?? Number(phases?.min ?? 0) * 3,
      main_max: main?.max ?? Number(phases?.max ?? 5000) * 3,
      main_scale: main?.scale ?? SCALE_LINEAR,
      main_precision: main?.precision,
      main_unit: main?.unit ?? "",
      main_color: main?.color ?? "",
    };
  }

  _phasesData() {
    const phases = this._config.phases ?? {};
    return {
      phase_entity_1: phases.entities?.[0] ?? "",
      phase_entity_2: phases.entities?.[1] ?? "",
      phase_entity_3: phases.entities?.[2] ?? "",
      phase_name_1: phases.names?.[0] ?? DEFAULT_PHASE_NAMES[0],
      phase_name_2: phases.names?.[1] ?? DEFAULT_PHASE_NAMES[1],
      phase_name_3: phases.names?.[2] ?? DEFAULT_PHASE_NAMES[2],
      phases_min: phases.min,
      phases_max: phases.max,
      phases_scale: phases.scale ?? SCALE_LINEAR,
      phases_precision: phases.precision,
      phases_unit: phases.unit ?? "",
      phases_color: phases.color ?? "",
    };
  }

  _valueChanged(event) {
    event.stopPropagation();
    const data = event.detail?.value;
    if (!data || !this._config) return;

    if (this._activeTab === "main") {
      this._updateMain(data);
    } else if (this._activeTab === "phases") {
      this._updatePhases(data);
    } else {
      this._updateGeneral(data);
    }
  }

  _updateGeneral(data) {
    const config = structuredClone(this._config);
    const previousModes = { ...this._modes };
    this._modes.icon = data.icon_mode ?? this._modes.icon;
    this._modes.iconColor = data.icon_color_mode ?? this._modes.iconColor;
    this._modes.description = data.description_mode ?? this._modes.description;

    setDefaultableBoolean(config, "show_name", data.show_name, true);
    setDefaultableBoolean(config, "show_icon", data.show_icon, true);
    setDefaultableBoolean(config, "show_description", data.show_description, true);
    setOptionalString(config, "name", data.name);
    updateTemplateableConfig(
      config,
      "icon",
      this._modes.icon,
      data.icon_value,
      data.icon_template,
      previousModes.icon,
    );
    updateTemplateableConfig(
      config,
      "icon_color",
      this._modes.iconColor,
      data.icon_color_value,
      data.icon_color_template,
      previousModes.iconColor,
    );
    updateDescriptionConfig(config, data, this._modes.description, previousModes.description);
    this._emitConfig(config);
  }

  _updateMain(data) {
    const config = structuredClone(this._config);
    const wasEnabled = Boolean(config.main);
    this._modes.mainSource = data.main_source ?? this._modes.mainSource;

    if (!data.main_enabled) {
      delete config.main;
      this._emitConfig(config);
      if (wasEnabled) this._render();
      return;
    }

    const main = { ...(config.main ?? {}) };
    delete main.name;
    if (this._modes.mainSource === "sum") {
      delete main.entity;
      main.calculate = "sum";
    } else if (stringValue(data.main_entity)) {
      main.entity = stringValue(data.main_entity);
      delete main.calculate;
    } else {
      delete main.entity;
      main.calculate = "sum";
    }

    setFiniteNumber(main, "min", data.main_min, Number(config.phases?.min ?? 0) * 3);
    setFiniteNumber(main, "max", data.main_max, Number(config.phases?.max ?? 5000) * 3);
    setOptionalInteger(main, "precision", data.main_precision);
    setOptionalString(main, "unit", data.main_unit);
    setOptionalString(main, "color", data.main_color);
    setDefaultableString(main, "scale", data.main_scale, SCALE_LINEAR);
    config.main = main;
    this._emitConfig(config);
    if (!wasEnabled) this._render();
  }

  _updatePhases(data) {
    const config = structuredClone(this._config);
    const phases = { ...(config.phases ?? {}) };
    phases.entities = [
      stringValue(data.phase_entity_1),
      stringValue(data.phase_entity_2),
      stringValue(data.phase_entity_3),
    ];

    const names = [
      stringValue(data.phase_name_1) || DEFAULT_PHASE_NAMES[0],
      stringValue(data.phase_name_2) || DEFAULT_PHASE_NAMES[1],
      stringValue(data.phase_name_3) || DEFAULT_PHASE_NAMES[2],
    ];
    if (names.every((name, index) => name === DEFAULT_PHASE_NAMES[index])) {
      delete phases.names;
    } else {
      phases.names = names;
    }

    setFiniteNumber(phases, "min", data.phases_min, Number(phases.min ?? 0));
    setFiniteNumber(phases, "max", data.phases_max, Number(phases.max ?? 5000));
    setOptionalInteger(phases, "precision", data.phases_precision);
    setOptionalString(phases, "unit", data.phases_unit);
    setOptionalString(phases, "color", data.phases_color);
    setDefaultableString(phases, "scale", data.phases_scale, SCALE_LINEAR);
    config.phases = phases;
    this._emitConfig(config);
  }

  _emitConfig(config) {
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", {
      bubbles: true,
      composed: true,
      detail: { config },
    }));
  }
}

const EDITOR_TABS = [
  { id: "general", labelKey: "tab_general" },
  { id: "main", labelKey: "tab_main" },
  { id: "phases", labelKey: "tab_phases" },
];

const TEMPLATE_MODE_OPTIONS = [
  { value: "fixed", label: "Fixed value" },
  { value: "template", label: "Template" },
];

const GENERAL_EDITOR_SCHEMA = [
  { name: "show_name", selector: { boolean: {} } },
  {
    name: "name",
    visible: { field: "show_name", value: true },
    selector: { text: {} },
  },
  { name: "show_icon", selector: { boolean: {} } },
  {
    name: "icon_mode",
    visible: { field: "show_icon", value: true },
    selector: { select: { mode: "dropdown", options: TEMPLATE_MODE_OPTIONS } },
  },
  {
    name: "icon_value",
    visible: {
      condition: "and",
      conditions: [
        { field: "show_icon", value: true },
        { field: "icon_mode", value: "fixed" },
      ],
    },
    selector: { icon: {} },
  },
  {
    name: "icon_template",
    visible: {
      condition: "and",
      conditions: [
        { field: "show_icon", value: true },
        { field: "icon_mode", value: "template" },
      ],
    },
    selector: { template: {} },
  },
  {
    name: "icon_color_mode",
    visible: { field: "show_icon", value: true },
    selector: { select: { mode: "dropdown", options: TEMPLATE_MODE_OPTIONS } },
  },
  {
    name: "icon_color_value",
    visible: {
      condition: "and",
      conditions: [
        { field: "show_icon", value: true },
        { field: "icon_color_mode", value: "fixed" },
      ],
    },
    selector: { text: {} },
  },
  {
    name: "icon_color_template",
    visible: {
      condition: "and",
      conditions: [
        { field: "show_icon", value: true },
        { field: "icon_color_mode", value: "template" },
      ],
    },
    selector: { template: {} },
  },
  { name: "show_description", selector: { boolean: {} } },
  {
    name: "description_mode",
    visible: { field: "show_description", value: true },
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "text", label: "Text" },
          { value: "entity", label: "Entity state" },
          { value: "template", label: "Template" },
        ],
      },
    },
  },
  {
    name: "description_text",
    visible: {
      condition: "and",
      conditions: [
        { field: "show_description", value: true },
        { field: "description_mode", value: "text" },
      ],
    },
    selector: { text: { multiline: true } },
  },
  {
    name: "description_entity",
    visible: {
      condition: "and",
      conditions: [
        { field: "show_description", value: true },
        { field: "description_mode", value: "entity" },
      ],
    },
    selector: { entity: {} },
  },
  {
    name: "description_template",
    visible: {
      condition: "and",
      conditions: [
        { field: "show_description", value: true },
        { field: "description_mode", value: "template" },
      ],
    },
    selector: { template: {} },
  },
];

const MAIN_EDITOR_SCHEMA = [
  { name: "main_enabled", selector: { boolean: {} } },
  {
    name: "main_source",
    visible: { field: "main_enabled", value: true },
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "entity", label: "Entity" },
          { value: "sum", label: "Sum of phases" },
        ],
      },
    },
  },
  {
    name: "main_entity",
    visible: {
      condition: "and",
      conditions: [
        { field: "main_enabled", value: true },
        { field: "main_source", value: "entity" },
      ],
    },
    selector: { entity: {} },
  },
  {
    type: "grid",
    name: "",
    flatten: true,
    visible: { field: "main_enabled", value: true },
    schema: [
      { name: "main_min", selector: { number: { mode: "box" } } },
      { name: "main_max", selector: { number: { mode: "box" } } },
    ],
  },
  {
    name: "main_scale",
    visible: { field: "main_enabled", value: true },
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: SCALE_LINEAR, label: "Linear" },
          { value: SCALE_LOGARITHMIC, label: "Logarithmic" },
        ],
      },
    },
  },
  {
    type: "grid",
    name: "",
    flatten: true,
    visible: { field: "main_enabled", value: true },
    schema: [
      { name: "main_precision", selector: { number: { mode: "box", min: 0, max: 6 } } },
      { name: "main_unit", selector: { text: {} } },
    ],
  },
  {
    name: "main_color",
    visible: { field: "main_enabled", value: true },
    selector: { text: {} },
  },
];

const PHASES_EDITOR_SCHEMA = [
  { name: "phase_entity_1", selector: { entity: {} } },
  { name: "phase_entity_2", selector: { entity: {} } },
  { name: "phase_entity_3", selector: { entity: {} } },
  {
    type: "grid",
    name: "",
    flatten: true,
    schema: [
      { name: "phase_name_1", selector: { text: {} } },
      { name: "phase_name_2", selector: { text: {} } },
      { name: "phase_name_3", selector: { text: {} } },
    ],
  },
  {
    type: "grid",
    name: "",
    flatten: true,
    schema: [
      { name: "phases_min", selector: { number: { mode: "box" } } },
      { name: "phases_max", selector: { number: { mode: "box" } } },
    ],
  },
  {
    name: "phases_scale",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: SCALE_LINEAR, label: "Linear" },
          { value: SCALE_LOGARITHMIC, label: "Logarithmic" },
        ],
      },
    },
  },
  {
    type: "grid",
    name: "",
    flatten: true,
    schema: [
      { name: "phases_precision", selector: { number: { mode: "box", min: 0, max: 6 } } },
      { name: "phases_unit", selector: { text: {} } },
    ],
  },
  { name: "phases_color", selector: { text: {} } },
];

const COLOR_RANGE_EDITOR_SCHEMA = [
  {
    type: "grid",
    name: "",
    flatten: true,
    column_min_width: "120px",
    schema: [
      { name: "range_from", selector: { number: { mode: "box" } } },
      { name: "range_color", selector: { text: {} } },
    ],
  },
];

const EDITOR_LABEL_KEYS = {
  show_name: "label_show_name",
  name: "label_name",
  show_icon: "label_show_icon",
  icon_mode: "label_icon_type",
  icon_value: "label_icon",
  icon_template: "label_icon_template",
  icon_color_mode: "label_icon_color_type",
  icon_color_value: "label_icon_color",
  icon_color_template: "label_icon_color_template",
  show_description: "label_show_description",
  description_mode: "label_description_type",
  description_text: "label_description",
  description_entity: "label_description_entity",
  description_template: "label_description_template",
  main_enabled: "label_show_main",
  main_source: "label_main_source",
  main_entity: "label_main_entity",
  main_min: "label_minimum",
  main_max: "label_maximum",
  main_scale: "label_scale",
  main_precision: "label_precision",
  main_unit: "label_unit",
  main_color: "label_color",
  phase_entity_1: "label_l1_entity",
  phase_entity_2: "label_l2_entity",
  phase_entity_3: "label_l3_entity",
  phase_name_1: "label_l1_name",
  phase_name_2: "label_l2_name",
  phase_name_3: "label_l3_name",
  phases_min: "label_minimum",
  phases_max: "label_maximum",
  phases_scale: "label_scale",
  phases_precision: "label_precision",
  phases_unit: "label_unit",
  phases_color: "label_color",
  range_from: "label_from",
  range_color: "label_color",
};

const EDITOR_HELPER_KEYS = {
  icon_color_value: "helper_icon_color",
  main_enabled: "helper_main_enabled",
  main_color: "helper_color",
  phases_color: "helper_color",
};

const EDITOR_OPTION_KEYS = {
  icon_mode: { fixed: "option_fixed", template: "option_template" },
  icon_color_mode: { fixed: "option_fixed", template: "option_template" },
  description_mode: {
    text: "option_text",
    entity: "option_entity_state",
    template: "option_template",
  },
  main_source: { entity: "option_entity", sum: "option_sum" },
  main_scale: { linear: "option_linear", logarithmic: "option_logarithmic" },
  phases_scale: { linear: "option_linear", logarithmic: "option_logarithmic" },
};

const EDITOR_TRANSLATIONS = {
  en: {
    tab_general: "General",
    tab_main: "Main gauge",
    tab_phases: "Phase gauges",
    option_fixed: "Fixed value",
    option_template: "Template",
    option_text: "Text",
    option_entity_state: "Entity state",
    option_entity: "Entity",
    option_sum: "Sum of phases",
    option_linear: "Linear",
    option_logarithmic: "Logarithmic",
    label_show_name: "Show name",
    label_name: "Name",
    label_show_icon: "Show icon",
    label_icon_type: "Icon type",
    label_icon: "Icon",
    label_icon_template: "Icon template",
    label_icon_color_type: "Icon color type",
    label_icon_color: "Icon color",
    label_icon_color_template: "Icon color template",
    label_show_description: "Show description",
    label_description_type: "Description type",
    label_description: "Description",
    label_description_entity: "Description entity",
    label_description_template: "Description template",
    label_show_main: "Show main gauge",
    label_main_source: "Main value source",
    label_main_entity: "Main entity",
    label_minimum: "Minimum",
    label_maximum: "Maximum",
    label_scale: "Scale",
    label_precision: "Precision",
    label_unit: "Unit",
    label_color: "Color",
    label_l1_entity: "L1 entity",
    label_l2_entity: "L2 entity",
    label_l3_entity: "L3 entity",
    label_l1_name: "L1 name",
    label_l2_name: "L2 name",
    label_l3_name: "L3 name",
    label_from: "From",
    helper_icon_color: "CSS color, for example #42a5f5 or var(--primary-color)",
    helper_main_enabled: "The card name and description remain visible without a main gauge.",
    helper_color: "HEX, rgb(), CSS name such as red, or var(--primary-color)",
    loading: "Loading editor…",
    settings_aria: "3f Gauge settings",
    segments_title: "Color segments",
    segments_description: "Each color applies from its threshold up to the next segment.",
    delete_segment: "Delete segment",
    add_segment: "Add segment",
  },
  cs: {
    tab_general: "Obecné",
    tab_main: "Hlavní ukazatel",
    tab_phases: "Ukazatele fází",
    option_fixed: "Pevná hodnota",
    option_template: "Šablona",
    option_text: "Text",
    option_entity_state: "Stav entity",
    option_entity: "Entita",
    option_sum: "Součet fází",
    option_linear: "Lineární",
    option_logarithmic: "Logaritmická",
    label_show_name: "Zobrazit název",
    label_name: "Název",
    label_show_icon: "Zobrazit ikonu",
    label_icon_type: "Typ ikony",
    label_icon: "Ikona",
    label_icon_template: "Šablona ikony",
    label_icon_color_type: "Typ barvy ikony",
    label_icon_color: "Barva ikony",
    label_icon_color_template: "Šablona barvy ikony",
    label_show_description: "Zobrazit popis",
    label_description_type: "Typ popisu",
    label_description: "Popis",
    label_description_entity: "Entita popisu",
    label_description_template: "Šablona popisu",
    label_show_main: "Zobrazit hlavní ukazatel",
    label_main_source: "Zdroj hlavní hodnoty",
    label_main_entity: "Hlavní entita",
    label_minimum: "Minimum",
    label_maximum: "Maximum",
    label_scale: "Stupnice",
    label_precision: "Přesnost",
    label_unit: "Jednotka",
    label_color: "Barva",
    label_l1_entity: "Entita L1",
    label_l2_entity: "Entita L2",
    label_l3_entity: "Entita L3",
    label_l1_name: "Název L1",
    label_l2_name: "Název L2",
    label_l3_name: "Název L3",
    label_from: "Od",
    helper_icon_color: "CSS barva, například #42a5f5 nebo var(--primary-color)",
    helper_main_enabled: "Název karty a popis zůstanou viditelné i bez hlavního ukazatele.",
    helper_color: "HEX, rgb(), CSS název jako red nebo var(--primary-color)",
    loading: "Načítání editoru…",
    settings_aria: "Nastavení 3f Gauge",
    segments_title: "Barevné segmenty",
    segments_description: "Každá barva platí od svého prahu do dalšího segmentu.",
    delete_segment: "Odstranit segment",
    add_segment: "Přidat segment",
  },
  sk: {
    tab_general: "Všeobecné",
    tab_main: "Hlavný ukazovateľ",
    tab_phases: "Ukazovatele fáz",
    option_fixed: "Pevná hodnota",
    option_template: "Šablóna",
    option_text: "Text",
    option_entity_state: "Stav entity",
    option_entity: "Entita",
    option_sum: "Súčet fáz",
    option_linear: "Lineárna",
    option_logarithmic: "Logaritmická",
    label_show_name: "Zobraziť názov",
    label_name: "Názov",
    label_show_icon: "Zobraziť ikonu",
    label_icon_type: "Typ ikony",
    label_icon: "Ikona",
    label_icon_template: "Šablóna ikony",
    label_icon_color_type: "Typ farby ikony",
    label_icon_color: "Farba ikony",
    label_icon_color_template: "Šablóna farby ikony",
    label_show_description: "Zobraziť popis",
    label_description_type: "Typ popisu",
    label_description: "Popis",
    label_description_entity: "Entita popisu",
    label_description_template: "Šablóna popisu",
    label_show_main: "Zobraziť hlavný ukazovateľ",
    label_main_source: "Zdroj hlavnej hodnoty",
    label_main_entity: "Hlavná entita",
    label_minimum: "Minimum",
    label_maximum: "Maximum",
    label_scale: "Stupnica",
    label_precision: "Presnosť",
    label_unit: "Jednotka",
    label_color: "Farba",
    label_l1_entity: "Entita L1",
    label_l2_entity: "Entita L2",
    label_l3_entity: "Entita L3",
    label_l1_name: "Názov L1",
    label_l2_name: "Názov L2",
    label_l3_name: "Názov L3",
    label_from: "Od",
    helper_icon_color: "CSS farba, napríklad #42a5f5 alebo var(--primary-color)",
    helper_main_enabled: "Názov karty a popis zostanú viditeľné aj bez hlavného ukazovateľa.",
    helper_color: "HEX, rgb(), CSS názov ako red alebo var(--primary-color)",
    loading: "Načítava sa editor…",
    settings_aria: "Nastavenia 3f Gauge",
    segments_title: "Farebné segmenty",
    segments_description: "Každá farba platí od svojho prahu po nasledujúci segment.",
    delete_segment: "Odstrániť segment",
    add_segment: "Pridať segment",
  },
  de: {
    tab_general: "Allgemein",
    tab_main: "Hauptanzeige",
    tab_phases: "Phasenanzeigen",
    option_fixed: "Fester Wert",
    option_template: "Vorlage",
    option_text: "Text",
    option_entity_state: "Entitätszustand",
    option_entity: "Entität",
    option_sum: "Summe der Phasen",
    option_linear: "Linear",
    option_logarithmic: "Logarithmisch",
    label_show_name: "Name anzeigen",
    label_name: "Name",
    label_show_icon: "Symbol anzeigen",
    label_icon_type: "Symboltyp",
    label_icon: "Symbol",
    label_icon_template: "Symbolvorlage",
    label_icon_color_type: "Typ der Symbolfarbe",
    label_icon_color: "Symbolfarbe",
    label_icon_color_template: "Vorlage für Symbolfarbe",
    label_show_description: "Beschreibung anzeigen",
    label_description_type: "Beschreibungstyp",
    label_description: "Beschreibung",
    label_description_entity: "Beschreibungsentität",
    label_description_template: "Beschreibungsvorlage",
    label_show_main: "Hauptanzeige anzeigen",
    label_main_source: "Quelle des Hauptwerts",
    label_main_entity: "Hauptentität",
    label_minimum: "Minimum",
    label_maximum: "Maximum",
    label_scale: "Skala",
    label_precision: "Genauigkeit",
    label_unit: "Einheit",
    label_color: "Farbe",
    label_l1_entity: "L1-Entität",
    label_l2_entity: "L2-Entität",
    label_l3_entity: "L3-Entität",
    label_l1_name: "L1-Name",
    label_l2_name: "L2-Name",
    label_l3_name: "L3-Name",
    label_from: "Ab",
    helper_icon_color: "CSS-Farbe, zum Beispiel #42a5f5 oder var(--primary-color)",
    helper_main_enabled: "Kartenname und Beschreibung bleiben auch ohne Hauptanzeige sichtbar.",
    helper_color: "HEX, rgb(), CSS-Name wie red oder var(--primary-color)",
    loading: "Editor wird geladen…",
    settings_aria: "3f Gauge-Einstellungen",
    segments_title: "Farbsegmente",
    segments_description: "Jede Farbe gilt ab ihrem Schwellenwert bis zum nächsten Segment.",
    delete_segment: "Segment löschen",
    add_segment: "Segment hinzufügen",
  },
  pl: {
    tab_general: "Ogólne",
    tab_main: "Wskaźnik główny",
    tab_phases: "Wskaźniki faz",
    option_fixed: "Stała wartość",
    option_template: "Szablon",
    option_text: "Tekst",
    option_entity_state: "Stan encji",
    option_entity: "Encja",
    option_sum: "Suma faz",
    option_linear: "Liniowa",
    option_logarithmic: "Logarytmiczna",
    label_show_name: "Pokaż nazwę",
    label_name: "Nazwa",
    label_show_icon: "Pokaż ikonę",
    label_icon_type: "Typ ikony",
    label_icon: "Ikona",
    label_icon_template: "Szablon ikony",
    label_icon_color_type: "Typ koloru ikony",
    label_icon_color: "Kolor ikony",
    label_icon_color_template: "Szablon koloru ikony",
    label_show_description: "Pokaż opis",
    label_description_type: "Typ opisu",
    label_description: "Opis",
    label_description_entity: "Encja opisu",
    label_description_template: "Szablon opisu",
    label_show_main: "Pokaż wskaźnik główny",
    label_main_source: "Źródło wartości głównej",
    label_main_entity: "Encja główna",
    label_minimum: "Minimum",
    label_maximum: "Maksimum",
    label_scale: "Skala",
    label_precision: "Precyzja",
    label_unit: "Jednostka",
    label_color: "Kolor",
    label_l1_entity: "Encja L1",
    label_l2_entity: "Encja L2",
    label_l3_entity: "Encja L3",
    label_l1_name: "Nazwa L1",
    label_l2_name: "Nazwa L2",
    label_l3_name: "Nazwa L3",
    label_from: "Od",
    helper_icon_color: "Kolor CSS, na przykład #42a5f5 lub var(--primary-color)",
    helper_main_enabled: "Nazwa karty i opis pozostają widoczne również bez wskaźnika głównego.",
    helper_color: "HEX, rgb(), nazwa CSS, np. red, lub var(--primary-color)",
    loading: "Ładowanie edytora…",
    settings_aria: "Ustawienia 3f Gauge",
    segments_title: "Segmenty kolorów",
    segments_description: "Każdy kolor obowiązuje od swojego progu do następnego segmentu.",
    delete_segment: "Usuń segment",
    add_segment: "Dodaj segment",
  },
};

const EDITOR_STYLES = `
  :host {
    display: block;
  }

  .tabs {
    border-bottom: 1px solid var(--divider-color);
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0 0 16px;
  }

  .tabs button {
    appearance: none;
    background: transparent;
    border: 0;
    color: var(--secondary-text-color);
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    min-height: 48px;
    padding: 0 8px;
    position: relative;
  }

  .tabs button::after {
    background: transparent;
    bottom: -1px;
    content: "";
    height: 2px;
    left: 0;
    position: absolute;
    right: 0;
  }

  .tabs button.active {
    color: var(--primary-color);
  }

  .tabs button.active::after {
    background: var(--primary-color);
  }

  .tabs button:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: -2px;
  }

  .form {
    padding: 0 4px 8px;
  }

  ha-form {
    display: block;
  }

  .loading {
    color: var(--secondary-text-color);
    padding: 24px 0;
    text-align: center;
  }

  .color-ranges {
    border-top: 1px solid var(--divider-color);
    margin-top: 24px;
    padding-top: 16px;
  }

  .color-ranges h3 {
    font-size: 16px;
    font-weight: 500;
    margin: 0 0 4px;
  }

  .color-ranges > p {
    color: var(--secondary-text-color);
    font-size: 13px;
    margin: 0 0 16px;
  }

  .color-range-list {
    display: grid;
    gap: 12px;
  }

  .color-range-row {
    align-items: center;
    display: grid;
    gap: 12px;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .color-range-form {
    min-width: 0;
  }

  .add-range,
  .delete-range {
    align-items: center;
    appearance: none;
    background: transparent;
    border: 0;
    border-radius: 999px;
    cursor: pointer;
    display: inline-flex;
    font: inherit;
    font-weight: 500;
    gap: 8px;
    min-height: 40px;
    padding: 0 14px;
  }

  .delete-range {
    color: var(--error-color, #db4437);
    transform: translateY(-2px);
  }

  .add-range {
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    color: var(--primary-color);
    margin-top: 16px;
  }

  .add-range:hover,
  .delete-range:hover {
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  .add-range:focus-visible,
  .delete-range:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  .add-range ha-icon,
  .delete-range ha-icon {
    height: 22px;
    width: 22px;
  }

  @media (max-width: 520px) {
    .color-range-row {
      align-items: start;
      grid-template-columns: minmax(0, 1fr);
    }

    .delete-range {
      justify-self: start;
    }
  }
`;

function editorLanguage(hass) {
  const language = String(hass?.locale?.language ?? hass?.language ?? "en")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .split("-")[0];
  return Object.prototype.hasOwnProperty.call(EDITOR_TRANSLATIONS, language)
    ? language
    : "en";
}

function editorTranslate(language, key) {
  if (!key) return undefined;
  return EDITOR_TRANSLATIONS[language]?.[key]
    ?? EDITOR_TRANSLATIONS.en[key]
    ?? key;
}

function localizedEditorSchema(schema, translate) {
  const localizeItems = (items) => items.map((item) => {
    const localized = { ...item };
    if (Array.isArray(item.schema)) {
      localized.schema = localizeItems(item.schema);
    }

    const options = item.selector?.select?.options;
    const optionKeys = EDITOR_OPTION_KEYS[item.name];
    if (Array.isArray(options) && optionKeys) {
      localized.selector = {
        ...item.selector,
        select: {
          ...item.selector.select,
          options: options.map((option) => ({
            ...option,
            label: editorTranslateOption(optionKeys, option.value, translate, option.label),
          })),
        },
      };
    }
    return localized;
  });
  return localizeItems(schema);
}

function editorTranslateOption(optionKeys, value, translate, fallback) {
  const key = optionKeys[value];
  return key ? translate(key) : fallback;
}

function configurationsEqual(first, second) {
  if (first === second) return true;
  if (!first || !second || typeof first !== "object" || typeof second !== "object") {
    return false;
  }
  if (Array.isArray(first) !== Array.isArray(second)) return false;

  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  if (firstKeys.length !== secondKeys.length) return false;
  return firstKeys.every((key) => (
    Object.prototype.hasOwnProperty.call(second, key)
    && configurationsEqual(first[key], second[key])
  ));
}

function editorColorRanges(section) {
  if (!Array.isArray(section?.color_ranges)) return [];
  const sectionMin = Number(section.min);
  let previousFrom = Number.isFinite(sectionMin) ? sectionMin : 0;
  return section.color_ranges.map((range) => {
    const configuredFrom = range?.from == null ? Number.NaN : Number(range.from);
    const from = Number.isFinite(configuredFrom) ? configuredFrom : previousFrom;
    previousFrom = from;
    return {
      from,
      color: stringValue(range?.color ?? section.color ?? DEFAULT_COLOR),
    };
  });
}

function isCompactCardConfig(config) {
  if (!config || config.main) return false;
  const showsName = config.show_name !== false;
  const showsIcon = config.show_icon !== false && Boolean(config.icon);
  const showsDescription = config.show_description !== false && Boolean(config.description);
  return !showsName && !showsIcon && !showsDescription;
}

function normalizeEditorConfig(config) {
  const normalized = structuredClone(config ?? {});
  if (normalized.name == null && normalized.main?.name != null) {
    normalized.name = normalized.main.name;
  }
  if (normalized.main && Object.prototype.hasOwnProperty.call(normalized.main, "name")) {
    delete normalized.main.name;
  }
  return normalized;
}

function templateableMode(value) {
  return value && typeof value === "object" && value.template != null
    ? "template"
    : "fixed";
}

function descriptionMode(value) {
  if (value && typeof value === "object" && value.template != null) return "template";
  if (value && typeof value === "object" && value.entity) return "entity";
  return "text";
}

function templateText(value) {
  return value && typeof value === "object" && value.template != null
    ? String(value.template)
    : "";
}

function stringValue(value) {
  return String(value ?? "").trim();
}

function setOptionalString(target, key, value) {
  const normalized = stringValue(value);
  if (normalized) {
    target[key] = normalized;
  } else {
    delete target[key];
  }
}

function setDefaultableBoolean(target, key, value, defaultValue) {
  if (Boolean(value) === defaultValue) {
    delete target[key];
  } else {
    target[key] = Boolean(value);
  }
}

function setFiniteNumber(target, key, value, fallback) {
  const normalized = value === "" || value == null ? Number.NaN : Number(value);
  if (Number.isFinite(normalized)) {
    target[key] = normalized;
  } else if (!Number.isFinite(Number(target[key]))) {
    target[key] = fallback;
  }
}

function setOptionalInteger(target, key, value) {
  if (value !== "" && value != null && Number.isInteger(Number(value))) {
    target[key] = clamp(Number(value), 0, 6);
  } else {
    delete target[key];
  }
}

function setDefaultableString(target, key, value, defaultValue) {
  const normalized = stringValue(value);
  if (!normalized || normalized === defaultValue) {
    delete target[key];
  } else {
    target[key] = normalized;
  }
}

function updateTemplateableConfig(
  config,
  key,
  mode,
  fixedValue,
  templateValue,
  previousMode,
) {
  const previous = config[key];
  const value = stringValue(mode === "template" ? templateValue : fixedValue);
  if (!value) {
    if (mode === previousMode) delete config[key];
    return;
  }

  if (mode === "template") {
    config[key] = {
      ...(previous && typeof previous === "object" ? previous : {}),
      template: value,
    };
  } else {
    config[key] = value;
  }
}

function updateDescriptionConfig(config, data, mode, previousMode) {
  const previous = config.description;
  const value = stringValue(
    mode === "template"
      ? data.description_template
      : mode === "entity"
        ? data.description_entity
        : data.description_text,
  );
  if (!value) {
    if (mode === previousMode) delete config.description;
    return;
  }

  if (mode === "template") {
    config.description = {
      ...(previous && typeof previous === "object" ? previous : {}),
      template: value,
    };
  } else if (mode === "entity") {
    config.description = { entity: value };
  } else {
    config.description = value;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function scalePosition(value, min, max, scale = SCALE_LINEAR) {
  const clampedValue = clamp(value, min, max);
  if (scale !== SCALE_LOGARITHMIC) {
    return (clampedValue - min) / (max - min);
  }

  const zero = scaleZeroPosition(min, max);

  if (min < 0 && max > 0) {
    if (clampedValue < 0) {
      const fraction = Math.abs(clampedValue) / Math.abs(min);
      return zero * (1 - logarithmicFraction(fraction));
    }

    const fraction = clampedValue / max;
    return zero + (1 - zero) * logarithmicFraction(fraction);
  }

  if (min >= 0) {
    const fraction = (clampedValue - min) / (max - min);
    return logarithmicFraction(fraction);
  }

  const fraction = (max - clampedValue) / (max - min);
  return 1 - logarithmicFraction(fraction);
}

function logarithmicFraction(fraction) {
  const normalized = clamp(fraction, 0, 1);
  return Math.log1p(LOG_SCALE_STRENGTH * normalized) / Math.log1p(LOG_SCALE_STRENGTH);
}

function scaleZeroPosition(min, max) {
  return clamp((0 - min) / (max - min), 0, 1);
}

function alignedPhaseBarsOffset(mainScale, phaseScale) {
  const mainZero = scaleZeroPosition(Number(mainScale.min), Number(mainScale.max));
  const phaseZero = scaleZeroPosition(Number(phaseScale.min), Number(phaseScale.max));
  if (Math.abs(mainZero - phaseZero) > ZERO_ALIGNMENT_TOLERANCE) return undefined;
  return phaseZero * PHASE_BARS_TOTAL_INSET;
}

function createTemplateState() {
  return {
    result: "",
    key: undefined,
    connection: undefined,
    unsubscribe: undefined,
    subscriptionId: 0,
  };
}

function templateableValue(config, templateResult) {
  if (typeof config === "string") return config.trim();
  if (config && typeof config === "object" && config.template != null) {
    return String(templateResult ?? "").trim();
  }
  return "";
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
  return safeOptionalCssColor(value) || DEFAULT_COLOR;
}

function safeOptionalCssColor(value) {
  const color = String(value ?? "").trim();
  return /[;{}<>"']/.test(color) ? "" : color;
}

function entityAttributes(entity) {
  return entity
    ? `data-entity="${escapeHtml(entity)}" tabindex="0"`
    : "";
}

const STYLES = `
  :host {
    display: block;
    height: 100%;
  }

  ha-card {
    height: 100%;
    overflow: hidden;
  }

  .card-content {
    box-sizing: border-box;
    min-height: 100%;
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
    margin: 2px 0 0 var(--phase-bars-offset, 8px);
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
    margin-left: 0;
    margin-top: 0;
    width: 100%;
  }

  .compact {
    padding-bottom: 2px;
    padding-top: 4px;
  }

  .compact .gauges {
    margin-top: 0;
  }

  .compact .phase-bars {
    gap: 1px;
  }

  .compact .phase-bar.expanded {
    height: 6px;
  }

  .compact .phase-values {
    margin-top: 1px;
  }

  .compact .phase-value {
    padding-bottom: 0;
    padding-top: 0;
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

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, ThreeFGaugeCardEditor);
}

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
