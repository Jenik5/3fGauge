# 3f Gauge Card

**English** | [Čeština](docs/README_CZ.md)

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](#installation-with-hacs)
[![Release](https://img.shields.io/github/v/release/Jenik5/3fGauge)](https://github.com/Jenik5/3fGauge/releases/latest)
[![HACS validation](https://github.com/Jenik5/3fGauge/actions/workflows/validate.yml/badge.svg)](https://github.com/Jenik5/3fGauge/actions/workflows/validate.yml)
[![Downloads](https://img.shields.io/github/downloads/Jenik5/3fGauge/total)](https://github.com/Jenik5/3fGauge/releases)
[![License](https://img.shields.io/github/license/Jenik5/3fGauge)](LICENSE)

A compact Lovelace card for displaying a three-phase quantity in Home Assistant. It shows an optional total value and the L1, L2, and L3 phase values as numbers and horizontal bars.

Current version: `2026.08.18.01`

![3f Gauge Card](docs/img/3fGaugeCard.png)

## Installation with HACS

1. Open **Custom repositories** in HACS.
2. Add `https://github.com/Jenik5/3fGauge` as a **Dashboard** repository.
3. Find **3f Gauge Card** and select **Download**.

HACS installs the card in `/config/www/community/3fGauge/` and usually registers its JavaScript module automatically. If the resource is not created automatically, add this path under **Settings → Dashboards → Resources**:

```text
/hacsfiles/3fGauge/3f-gauge.js
```

## Manual installation

Download `3f-gauge.js` from the latest repository release to:

```text
/config/www/community/3fGauge/3f-gauge.js
```

Then add the JavaScript module under **Settings → Dashboards → Resources**:

```text
/local/community/3fGauge/3f-gauge.js
```

## Basic configuration

```yaml
type: custom:three-f-gauge-card
name: Active power
main:
  entity: sensor.active_power
  min: -12000
  max: 12000
phases:
  entities:
    - sensor.active_power_l1
    - sensor.active_power_l2
    - sensor.active_power_l3
  min: -5000
  max: 5000
```

For values that are always positive, set `min: 0`. Zero will then be positioned on the left. If `min` is negative and `max` is positive, the card places zero at the corresponding point inside the bar and draws negative values to the left.

## Configuration

| Key | Required | Description |
|---|---:|---|
| `type` | yes | Always `custom:three-f-gauge-card`. |
| `name` | no | Card name. It also works without a main gauge. |
| `main` | no | Main value configuration. |
| `phases` | yes | Configuration for exactly three phases. |
| `description` | no | Additional information shown on the right: text, an entity state, or a Home Assistant template. |
| `icon` | no | A fixed icon or Home Assistant template. The main entity icon is used when this is not set. |
| `icon_color` | no | A fixed CSS icon color or Home Assistant template. |
| `show_name` | no | Shows the name; defaults to `true`. |
| `show_icon` | no | Shows the icon; defaults to `true`. |
| `show_description` | no | Shows the description; defaults to `true`. |

### Visual editor

The card provides a visual editor with three tabs for general settings, the main gauge, and the phase gauges. Color segments can also be added or removed in the main and phase gauge settings.

The editor automatically follows the language selected in the Home Assistant user profile. English (`en`), Czech (`cs`), Slovak (`sk`), German (`de`), and Polish (`pl`) are included. English is used as the fallback for other languages.

<table>
  <tr>
    <th>General</th>
    <th>Main gauge</th>
    <th>Phase gauges</th>
  </tr>
  <tr>
    <td valign="top"><img src="docs/img/GeneralSettings.png" alt="General settings" width="300"></td>
    <td valign="top"><img src="docs/img/MainGaugeSettings.png" alt="Main gauge settings" width="300"></td>
    <td valign="top"><img src="docs/img/PhaseGaugesSettings.png" alt="Phase gauge settings" width="300"></td>
  </tr>
</table>

### Layout in Sections view

The card supports the Home Assistant layout editor. Its minimum width is 6 of 12 columns. A regular card or a card with the main gauge enabled requires at least 2 rows.

When the main gauge is disabled and the name, icon, and description are all hidden, the card can be reduced to 1 row:

```yaml
show_name: false
show_icon: false
show_description: false
phases:
  # ...
```

When a larger height is selected, the card fills all assigned space and the extra height appears as additional space at the bottom. Visibility options only hide their respective elements; they do not delete the configured values.

### Main value

```yaml
name: Active power
main:
  entity: sensor.active_power
  min: -12000
  max: 12000
  precision: 0
  unit: W
  color: var(--primary-color)
```

`name` is a top-level configuration option displayed on the left side of the header. If omitted, the card uses the `friendly_name` of the main entity or the first available phase. The older `main.name` syntax remains supported for backward compatibility.

If there is no total sensor and calculating a sum makes sense for the quantity, the main value can be calculated from the phases:

```yaml
name: Total
main:
  calculate: sum
  min: 0
  max: 15000
```

`entity` takes precedence over `calculate`. Clicking the main value or bar opens the sensor details dialog. The dialog is not available for a calculated sum.

### Icon

The entity icon can be overridden with a fixed icon and color:

```yaml
icon: mdi:transmission-tower
icon_color: "#42a5f5"
```

Both values can use reactive Home Assistant Jinja templates, allowing the icon and its color to change with the direction of energy flow:

```yaml
icon:
  template: >-
    {% set power = states("sensor.active_power") | float(0) %}
    {{ "mdi:transmission-tower-export" if power > 0 else "mdi:transmission-tower-import" }}
icon_color:
  template: >-
    {% set power = states("sensor.active_power") | float(0) %}
    {{ "#66bb6a" if power > 0 else "#ef5350" }}
```

Templates are recalculated automatically when the referenced entities change. As with `description`, optional data can be passed in a `variables` map inside the corresponding object.

### Phases

```yaml
phases:
  entities:
    - sensor.phase_1
    - sensor.phase_2
    - sensor.phase_3
  names: [L1, L2, L3]
  min: 0
  max: 5000
  precision: 1
  unit: W
  color: "#03a9f4"
```

`min` and `max` are shared by all three phases. `names`, `precision`, `unit`, `color`, and `scale` are optional. By default, the unit is read from the sensor attributes.

### Bar scale

The default scale is linear. If a large range makes normal low values almost invisible, a logarithmic scale can be enabled independently for `main` and `phases`:

```yaml
main:
  entity: sensor.active_power
  min: -17000
  max: 4800
  scale: logarithmic
```

`scale: logarithmic` emphasizes changes close to zero while progressively compressing larger values. Zero and both ends of the range remain exact. When the range contains both negative and positive values, each side is transformed independently and the zero position is still determined by the ratio between `min` and `max`. In the example above, zero is therefore located at approximately 78% of the bar width rather than in the center.

Supported `scale` values are:

- `linear` — the default linear scale,
- `logarithmic` — makes changes at low values more visible.

Numeric values, color segments, and clamping outside the range always use the actual sensor value. The logarithmic scale only affects the rendered bar length.

### Color segments

A fixed color can be supplemented with color segments. Each segment starts at its `from` value and applies until the next segment begins. The segment with the highest `from` value less than or equal to the current value is used. The base `color` applies below the first segment.

```yaml
phases:
  entities:
    - sensor.active_power_l1
    - sensor.active_power_l2
    - sensor.active_power_l3
  min: -5000
  max: 5000
  color: var(--primary-color)
  color_ranges:
    - from: -5000
      color: red
    - from: 0
      color: green
    - from: 3500
      color: orange
```

Colors can be written as HEX (`#66bb6a`), `rgb(...)`, a standard CSS color name (`red`, `green`, `orange`, and so on), or a theme variable (`var(--primary-color)`). The same `color` and `color_ranges` options are available in the `main` section.

Older configurations with an explicit `to` value remain supported. The visual editor converts them to the threshold format using only `from` the first time the segments are changed.

### Additional description

Static text:

```yaml
description: Grid consumption
```

Entity state, for example from a Home Assistant template sensor:

```yaml
description:
  entity: sensor.grid_flow_description
```

A directly reactive Home Assistant Jinja template:

```yaml
description:
  template: >-
    {% set power = states("sensor.active_power") | float(0) %}
    {{ "Export" if power > 0 else "Consumption" }}
```

The template is recalculated automatically when the referenced entities change. Optional data can also be passed in a `description.variables` map.

## Notes

- Values outside the configured range are clamped to the minimum or maximum in the bar; the displayed numeric value remains unchanged.
- An unavailable or non-numeric sensor is displayed as `Unavailable`, and its bar is dimmed.

## Versioning

Versions use the `YYYY.MM.DD.NN` format, where the final two digits indicate the release sequence for that day. For example, `2026.08.18.01` is the first release from August 18, 2026.
