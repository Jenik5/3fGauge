"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

global.HTMLElement = class {};
global.customElements = { get: () => true };

const cardSource = fs.readFileSync("3f-gauge.js", "utf8");
vm.runInThisContext(`${cardSource}\n;globalThis.__threeFGaugeTest = {
  CARD_VERSION,
  EDITOR_TABS,
  EDITOR_TRANSLATIONS,
  MAIN_EDITOR_SCHEMA,
  SCALE_LINEAR,
  SCALE_LOGARITHMIC,
  alignedPhaseBarsOffset,
  configurationsEqual,
  editorColorRanges,
  editorLanguage,
  editorTranslate,
  editorSetConfig: ThreeFGaugeCardEditor.prototype.setConfig,
  colorForValue: ThreeFGaugeCard.prototype._colorForValue,
  getGridOptions: ThreeFGaugeCard.prototype.getGridOptions,
  isCompactCardConfig,
  localizedEditorSchema,
  logarithmicFraction,
  normalizeEditorConfig,
  safeOptionalCssColor,
  scalePosition,
  templateableValue,
  updateDescriptionConfig,
  updateTemplateableConfig,
  displayName: ThreeFGaugeCard.prototype._displayName,
  validateScale: ThreeFGaugeCard.prototype._validateScale,
  validateTemplateableValue: ThreeFGaugeCard.prototype._validateTemplateableValue,
};`);

const {
  CARD_VERSION,
  EDITOR_TABS,
  EDITOR_TRANSLATIONS,
  MAIN_EDITOR_SCHEMA,
  SCALE_LINEAR,
  SCALE_LOGARITHMIC,
  alignedPhaseBarsOffset,
  configurationsEqual,
  editorColorRanges,
  editorLanguage,
  editorTranslate,
  editorSetConfig,
  colorForValue,
  getGridOptions,
  isCompactCardConfig,
  localizedEditorSchema,
  logarithmicFraction,
  normalizeEditorConfig,
  safeOptionalCssColor,
  scalePosition,
  templateableValue,
  updateDescriptionConfig,
  updateTemplateableConfig,
  displayName,
  validateScale,
  validateTemplateableValue,
} = global.__threeFGaugeTest;
delete global.__threeFGaugeTest;

function approximatelyEqual(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

assert.equal(CARD_VERSION, "2026.08.18.01");
assert.deepEqual(EDITOR_TABS.map((tab) => tab.id), ["general", "main", "phases"]);
const englishTranslationKeys = Object.keys(EDITOR_TRANSLATIONS.en).sort();
for (const language of ["cs", "sk", "de", "pl"]) {
  assert.deepEqual(Object.keys(EDITOR_TRANSLATIONS[language]).sort(), englishTranslationKeys);
}
assert.equal(editorLanguage({ locale: { language: "cs-CZ" } }), "cs");
assert.equal(editorLanguage({ locale: { language: "de_DE" } }), "de");
assert.equal(editorLanguage({ locale: { language: "fr-FR" } }), "en");
assert.equal(editorLanguage({ language: "pl" }), "pl");
assert.equal(editorTranslate("sk", "add_segment"), "Pridať segment");
assert.equal(editorTranslate("unsupported", "add_segment"), "Add segment");

const czechMainSchema = localizedEditorSchema(
  MAIN_EDITOR_SCHEMA,
  (key) => editorTranslate("cs", key),
);
const mainSourceOptions = czechMainSchema
  .find((field) => field.name === "main_source")
  .selector.select.options;
assert.deepEqual(mainSourceOptions.map((option) => option.label), ["Entita", "Součet fází"]);
assert.equal(configurationsEqual({ name: "Grid" }, { name: "Grid" }), true);
assert.equal(configurationsEqual({ name: "Grid" }, { name: "Other" }), false);
assert.equal(configurationsEqual(
  { name: "Grid", phases: { min: 0, max: 1 } },
  { phases: { max: 1, min: 0 }, name: "Grid" },
), true);

const unchangedEditor = {
  _config: { name: "Grid", phases: { entities: ["a", "b", "c"], min: 0, max: 1 } },
  renderCount: 0,
  _render() {
    this.renderCount += 1;
  },
};
editorSetConfig.call(unchangedEditor, structuredClone(unchangedEditor._config));
assert.equal(unchangedEditor.renderCount, 0);

const compactConfig = {
  show_name: false,
  phases: { entities: ["a", "b", "c"], min: 0, max: 1 },
};
assert.equal(isCompactCardConfig(compactConfig), true);
assert.equal(isCompactCardConfig({ ...compactConfig, description: "Flow" }), false);
assert.equal(isCompactCardConfig({
  ...compactConfig,
  description: "Flow",
  show_description: false,
}), true);
assert.equal(isCompactCardConfig({ ...compactConfig, icon: "mdi:flash" }), false);
assert.equal(isCompactCardConfig({
  ...compactConfig,
  icon: "mdi:flash",
  show_icon: false,
}), true);
assert.equal(isCompactCardConfig({
  ...compactConfig,
  main: { calculate: "sum", min: 0, max: 3 },
}), false);
assert.deepEqual(getGridOptions.call({ _config: compactConfig }), {
  rows: 1,
  columns: 12,
  min_rows: 1,
  min_columns: 6,
});
assert.deepEqual(getGridOptions.call({ _config: {
  ...compactConfig,
  main: { calculate: "sum", min: 0, max: 3 },
} }), {
  rows: 2,
  columns: 12,
  min_rows: 2,
  min_columns: 6,
});

approximatelyEqual(scalePosition(-17000, -17000, 4800, SCALE_LINEAR), 0);
approximatelyEqual(scalePosition(0, -17000, 4800, SCALE_LINEAR), 17000 / 21800);
approximatelyEqual(scalePosition(4800, -17000, 4800, SCALE_LINEAR), 1);

const asymmetricZero = 17000 / 21800;
approximatelyEqual(scalePosition(-17000, -17000, 4800, SCALE_LOGARITHMIC), 0);
approximatelyEqual(scalePosition(0, -17000, 4800, SCALE_LOGARITHMIC), asymmetricZero);
approximatelyEqual(scalePosition(4800, -17000, 4800, SCALE_LOGARITHMIC), 1);

const tenPercent = logarithmicFraction(0.1);
assert.ok(tenPercent > 0.1);
approximatelyEqual(
  scalePosition(-1700, -17000, 4800, SCALE_LOGARITHMIC),
  asymmetricZero * (1 - tenPercent),
);
approximatelyEqual(
  scalePosition(480, -17000, 4800, SCALE_LOGARITHMIC),
  asymmetricZero + (1 - asymmetricZero) * tenPercent,
);

assert.ok(logarithmicFraction(0.2) - logarithmicFraction(0.1)
  > logarithmicFraction(0.9) - logarithmicFraction(0.8));

approximatelyEqual(scalePosition(100, 0, 1000, SCALE_LOGARITHMIC), tenPercent);
approximatelyEqual(scalePosition(-100, -1000, 0, SCALE_LOGARITHMIC), 1 - tenPercent);
approximatelyEqual(scalePosition(-2000, -1000, 0, SCALE_LOGARITHMIC), 0);
approximatelyEqual(scalePosition(2000, 0, 1000, SCALE_LOGARITHMIC), 1);

approximatelyEqual(
  alignedPhaseBarsOffset(
    { min: -17000, max: 4800 },
    { min: -1700, max: 480 },
  ),
  asymmetricZero * 16,
);
approximatelyEqual(
  alignedPhaseBarsOffset(
    { min: -1000, max: 1000 },
    { min: -100, max: 100 },
  ),
  8,
);
assert.equal(
  alignedPhaseBarsOffset(
    { min: -17000, max: 4800 },
    { min: -1000, max: 1000 },
  ),
  undefined,
);

assert.doesNotThrow(() => validateScale.call({}, { min: 0, max: 1 }, "phases"));
assert.doesNotThrow(() => validateScale.call({}, {
  min: -1,
  max: 1,
  scale: SCALE_LOGARITHMIC,
}, "phases"));
assert.throws(
  () => validateScale.call({}, { min: 0, max: 1, scale: "square-root" }, "phases"),
  /must be "linear" or "logarithmic"/,
);

assert.equal(templateableValue(" mdi:flash ", ""), "mdi:flash");
assert.equal(
  templateableValue({ template: "{{ icon }}" }, " mdi:transmission-tower-export \n"),
  "mdi:transmission-tower-export",
);
assert.equal(templateableValue(undefined, "mdi:flash"), "");
assert.equal(safeOptionalCssColor(" var(--primary-color) "), "var(--primary-color)");
assert.equal(safeOptionalCssColor("green"), "green");
assert.equal(safeOptionalCssColor("rgb(12, 34, 56)"), "rgb(12, 34, 56)");
assert.equal(safeOptionalCssColor("red; display: none"), "");

const thresholdColors = {
  color: "gray",
  color_ranges: [
    { from: 0, color: "green" },
    { from: 1000, color: "orange" },
    { from: -5000, color: "red" },
  ],
};
assert.equal(colorForValue.call({}, -6000, thresholdColors), "gray");
assert.equal(colorForValue.call({}, -100, thresholdColors), "red");
assert.equal(colorForValue.call({}, 500, thresholdColors), "green");
assert.equal(colorForValue.call({}, 1500, thresholdColors), "orange");

const legacyColors = {
  min: -5000,
  color_ranges: [
    { to: -0.01, color: "red" },
    { from: 0, to: 999.99, color: "green" },
    { from: 1000, color: "orange" },
  ],
};
assert.equal(colorForValue.call({}, -100, legacyColors), "red");
assert.equal(colorForValue.call({}, 500, legacyColors), "green");
assert.equal(colorForValue.call({}, 1500, legacyColors), "orange");
assert.deepEqual(editorColorRanges(legacyColors), [
  { from: -5000, color: "red" },
  { from: 0, color: "green" },
  { from: 1000, color: "orange" },
]);

assert.doesNotThrow(() => validateTemplateableValue.call({}, "mdi:flash", "icon"));
assert.doesNotThrow(() => validateTemplateableValue.call({}, {
  template: "{{ 'mdi:flash' }}",
}, "icon"));
assert.throws(
  () => validateTemplateableValue.call({}, { template: "" }, "icon"),
  /must be a string or an object with a non-empty template/,
);
assert.throws(
  () => validateTemplateableValue.call({}, 42, "icon_color"),
  /must be a string or an object with a non-empty template/,
);

const migratedConfig = normalizeEditorConfig({
  type: "custom:three-f-gauge-card",
  main: { name: "Legacy name", entity: "sensor.total", min: 0, max: 10 },
  phases: { entities: ["sensor.l1", "sensor.l2", "sensor.l3"], min: 0, max: 10 },
});
assert.equal(migratedConfig.name, "Legacy name");
assert.equal(Object.hasOwn(migratedConfig.main, "name"), false);
assert.equal(displayName.call({}, { name: "Card name", main: { name: "Legacy" } }, {}, []), "Card name");
assert.equal(displayName.call({}, { main: { name: "Legacy" } }, {}, []), "Legacy");

const editorConfig = { icon: "mdi:flash", icon_color: "blue", description: "Static" };
updateTemplateableConfig(
  editorConfig,
  "icon",
  "template",
  "",
  "{{ 'mdi:flash-alert' }}",
  "template",
);
assert.deepEqual(editorConfig.icon, { template: "{{ 'mdi:flash-alert' }}" });
updateDescriptionConfig(editorConfig, {
  description_template: "{{ states('sensor.total') }}",
}, "template", "template");
assert.deepEqual(editorConfig.description, { template: "{{ states('sensor.total') }}" });

console.log("Card tests passed.");
