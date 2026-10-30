# Site thresholds file

The safety panel checks every file against the built-in rules in
`src/config/safety-rules.json` (Coal Mines Regulations, 2017; sources in
[safety-sources.md](safety-sources.md)). A **site thresholds file** adds your
mine's own verified limits, settings and context on top of them.

Load it with **LOAD SITE THRESHOLDS (JSON)** in the safety panel. The app
validates the file and shows a preview (errors, warnings, rules added and
replaced). Nothing changes until you press **APPLY SITE THRESHOLDS**. The
file is saved in that browser only (`localStorage`). **REMOVE SITE FILE**
goes back to the built-in rules. **EXPORT ACTIVE RULES** downloads the rules
in force as a complete `replace` file, which is a good starting template.

An invalid file is rejected with the reasons and never replaces the active
rules. If a file saved earlier stops validating (for example after an app
update), it is ignored and the panel says so.

## Easy format

The quickest way to set limits is the easy format: one entry per CSV column.
The bundled **`src/config/site-thresholds.json`** uses it and is applied by
default (switch it off with **TURN OFF STARTER THRESHOLDS**; a file you load
in the browser takes its place).

```json
{
  "format": "strata-simple-v1",
  "name": "Mine X thresholds rev 1",
  "mine": { "degreeOfGassiness": 2, "samplingIntervalSeconds": 60 },
  "parameters": {
    "CO_ppm": {
      "description": "Carbon monoxide",
      "meaning": "What the reading tells you and what to do (shown in the guide and given to the AI).",
      "normal": [0, 10],
      "warning": 35,
      "critical": 200,
      "worseWhen": "higher",
      "source": "Where the numbers come from"
    },
    "O2_vol_pct": { "description": "Oxygen", "normal": [19.5, 20.95], "warning": 19.5, "critical": 19, "worseWhen": "lower" },
    "YOLO_Flame_Detected": { "description": "Flame seen by camera", "worseWhen": "detected" },
    "Barometric_Pressure_kPa": { "description": "Barometric pressure", "normal": [95, 106], "worseWhen": "watch" }
  }
}
```

| Field | Meaning |
| --- | --- |
| `description` | Short name shown in the guide (required). |
| `meaning` | One or two sentences: what the sensor tells you, what to do. |
| `normal` | `[low, high]` typical range in normal operation. Information only; use `null` for an open end. |
| `warning`, `critical` | Levels that raise a warning / critical result. Either can be left out. |
| `worseWhen` | `higher` (default), `lower`, `detected` (yes/no columns) or `watch` (describe only, no check). |
| `includeLimit` | `true` to count a reading equal to the limit (≥ / ≤ instead of > / <). |
| `unit` | Needed only for a new column; otherwise the column's own unit. |
| `source` | Where the numbers come from (shown in the rule table). |
| `enabled` | `false` to keep the entry but not check it. |
| `verified` | `{ "document", "clause"?, "checkedBy", "checkedOn" }`, only after checking the numbers against your approved standard. Makes the rule **verified_site**, so a critical breach gives UNSAFE. |

How it is applied:

- Without `verified`, every check is **provisional**: CAUTION at most, never
  UNSAFE, and never SAFE by itself (CO stays a required check).
- Numbers equal to a verified regulation rule (for example methane 0.8 / 1.25)
  are not added twice; different numbers become an extra check. A verified
  rule is never replaced or weakened.
- An entry takes over the built-in placeholder for its column (for example
  `co-site-limit`), so the rule table stays tidy.
- Mistakes are explained in the preview (unknown field, wrong order of warning
  and critical, a missing unit for a new column, a misspelled key).

### Starter values (src/config/site-thresholds.json)

| Column | Normal | Warning | Critical | Basis |
| --- | --- | --- | --- | --- |
| CO_ppm | 0-10 | > 35 | > 200 | NIOSH REL 35 ppm TWA, 200 ppm ceiling (IDLH 1200) |
| CH4_vol_pct | 0-0.5 | > 0.8 | > 1.25 | CMR 2017 Reg. 153(2)(c), 169 (verified rule) |
| O2_vol_pct | 19.5-20.95 | < 19.5 | < 19 | MSHA 30 CFR 75.321 (19.5); CMR Reg. 153(2)(b) (19, verified) |
| CO2_vol_pct | 0.03-0.25 | — | > 0.5 | CMR Reg. 153(2)(b) (verified rule) |
| H2_ppm | 0-10 | > 4000 | > 10000 | 10 % / 25 % of LEL (4 % vol) |
| C2H4_ppm | 0 | > 0 | — | CIMFR fire-gas progression |
| C2H2_ppm | 0 | > 0 | > 0.5 | CIMFR fire-gas progression; 0.5 starting value |
| Coal_Seam_Temp_C | 20-40 | > 50 | > 70 | Self-heating runaway from 70-80 °C (NIOSH); 50 starting value |
| Airway_Temp_C | 20-30 | > 30.5 | > 33.5 | CMR Reg. 153(2)(d) wet-bulb limits, applied to dry-bulb (conservative) |
| Thermal_IR_Max_C | 15-45 | > 70 | > 150 | IEC 60079-0 Group I 150 °C surface limit |
| Air_Velocity_m_s | 0.5-4 | < 1 | < 0.5 | CMR Reg. 153(2)(d) (1 m/s), Reg. 160 (30 m/min) |
| Barometric_Pressure_kPa | 95-106 | watch | watch | CMR Reg. 46(1)(o): report unusual change |
| Smoke_Obscuration_pct | 0-1 | > 2 | > 10 | Starting values; use your sensor's alarm settings |
| Grahams_Ratio | 0-0.4 | ≥ 0.5 | ≥ 1 | CIMFR thumb rule (Ray et al. 2004) |
| Trickett_Ratio | 0.4-1.6 | > 1.6 | — | CIMFR fuel ranges; above 1.6 = suspect sample |
| Explosion_Risk_Index | 0 | ≥ 1 | ≥ 2 | ASSUMED 0/1/2 scale; confirm with your system |
| YOLO_Flame/Smoke_Detected | not detected | — | detected | CMR Reg. 138(1) (verified rules) |

These are starting points from published references, not your mine's
approved limits. Check each against your site standard, DGMS circulars and
the sensor makers' alarm settings before relying on them.

## Merge policy

| `mergePolicy` | Effect |
| --- | --- |
| `"merge"` (default) | A rule with the same `id` as a built-in rule **replaces** it. New ids are **added**. All other built-in rules are **kept**. `mineContext` and `dataQuality` values you give override the built-in ones; values you leave out are kept. |
| `"replace"` | Only the rules in your file apply. The built-in rules are **removed**. The file must contain at least one enabled verified rule. |

After merging, the combined rules are validated again. A site rule that
duplicates a built-in check (same parameter, operator, unit, thresholds and
context) under a different id is rejected; use the built-in id to replace it.

## Example: add a verified CO limit (merge)

CMR 2017 sets no numeric CO limit, so the built-in `co-site-limit` rule has
`requires_verification` and the app shows CAUTION until a site supplies one.
Replace it by using the same id. The numbers below are placeholders: take
yours from your approved site standard.

```json
{
  "schemaVersion": 1,
  "name": "Mine X ventilation standard rev 4",
  "mineContext": { "degreeOfGassiness": 2 },
  "dataQuality": { "expectedSamplingIntervalSeconds": 60, "staleAfterMinutes": 10 },
  "rules": [
    {
      "id": "co-site-limit",
      "parameter": "CO_ppm",
      "unit": "ppm",
      "operator": "greater_than",
      "warningThreshold": 0,
      "criticalThreshold": 0,
      "severity": "critical",
      "verificationStatus": "verified_site",
      "enabled": true,
      "requiredForSafe": true,
      "source": {
        "document": "Mine X Ventilation Standard, rev 4 (approved 2026-05-01)",
        "clause": "Section 6.2, CO action levels",
        "localReference": "DMS-VENT-004",
        "verification": {
          "method": "Checked against the signed controlled copy",
          "checkedOn": "2026-10-28",
          "officialCopyChecked": true,
          "amendmentsChecked": true,
          "approvedBy": "Ventilation Officer, J. Doe"
        }
      },
      "explanation": "Site CO action level from the approved standard."
    }
  ]
}
```

(Replace both `0` values: as written, the warning is not below the critical
threshold, so the validator would reject this file. That stops a template
being applied by accident.)

## Rule fields

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Lowercase letters, digits and dashes. Unique. |
| `parameter` | yes | An existing field name (see below) or one declared under `parameters`. |
| `unit` | yes | Unit of the thresholds. One of `ppm`, `%vol`, `%`, `°C`, `m/s`, `m/min`, `kPa`, `ratio`, `index`, `boolean`. It may differ from the field's unit only if it can be converted (`%vol`↔`ppm`, `m/s`↔`m/min`). |
| `operator` | yes | `greater_than`, `greater_than_or_equal`, `less_than`, `less_than_or_equal`, `is_true` (yes/no detections only), `steady_increase` (needs `consecutiveIncreases`, no thresholds). |
| `warningThreshold`, `criticalThreshold` | — | Numbers or `null`. For "higher is worse" operators, warning must be below critical; for "lower is worse", above it. Both must be inside the field's valid range. |
| `severity` | yes | `critical` (needs `criticalThreshold` when enabled), `warning` (no `criticalThreshold`), or `monitoring`. |
| `context` | — | `location` (default `any_place`), `gassinessDegree` (1–3: applies only when `mineContext.degreeOfGassiness` matches), `measurement`, `note`. |
| `verificationStatus` | yes | See below. |
| `enabled` | yes | Disabled rules are listed but never checked. |
| `requiredForSafe` | — | If `true`, SAFE is impossible unless this rule is enabled, verified and checked. |
| `consecutiveIncreases` | for `steady_increase` | Number of successive rises that count as "steady" (2–50). |
| `source` | yes | `document`, `clause`, and for verified rules `url` or `localReference` plus `verification` (`method`, `checkedOn`, `officialCopyChecked`, `amendmentsChecked`, optional `approvedBy`). |
| `explanation` | yes | Plain-language reason, shown in the rule table. |

### Verification status and its effect

| Status | Can be enabled | Effect when triggered |
| --- | --- | --- |
| `verified_regulatory` | yes | critical → **UNSAFE**; warning → CAUTION |
| `verified_site` | yes | critical → **UNSAFE**; warning → CAUTION |
| `provisional` | yes (warned) | critical or warning → **CAUTION only**, never UNSAFE |
| `requires_verification` | **no** | Not checked. If `requiredForSafe`, the status stays CAUTION. |

Never mark a value as verified unless you checked it against the original
document. A value from a search result, an article or an AI answer is not
verified.

### Settings

`mineContext`: `country`, `mineType`, `degreeOfGassiness` (1, 2, 3 or
`null`; enables the matching Reg. 166 methane rules), `applicabilityNote`.

`dataQuality` (defaults in brackets):

- `expectedSamplingIntervalSeconds` [null = inferred from the data]: a
  median gap of more than 2× this value adds a data-quality warning (and prevents SAFE).
- `staleAfterMinutes` [15]: newest reading older than this → STALE → CAUTION.
- `evaluationWindowMinutes` [60]: rules are checked on readings in this window
  ending at the newest timestamp.
- `parameterStaleFactor` [3]: a sensor whose last valid reading is more than
  this many sampling intervals behind the newest row is flagged stale.
- `derivedIndicatorTolerancePct` [5]: a supplied `Grahams_Ratio` or
  `Trickett_Ratio` that differs from the value computed from the gas readings
  by more than this is flagged.

## How the status is decided

1. **UNSAFE** if any enabled, verified rule's critical threshold is breached by
   a valid reading in the window (including a positive flame or smoke
   detection). This holds even on stale data.
2. **CAUTION** if data is missing, invalid, stale, conflicting or inconsistent;
   if a required rule is unverified or could not be checked; or if no
   verified rule could be checked at all.
3. **CAUTION** if a warning threshold, a provisional rule, or an earlier
   critical breach (outside the window) is triggered.
4. **SAFE** only if the data is current and valid, every required rule is
   verified and checked, and every check passed. SAFE is not a certification
   that the mine is safe.

A missing reading is never treated as normal, and no configured thresholds
never gives SAFE.

## Using a new dataset

1. **Column names.** The rules match these field names exactly (a
   case-insensitive match also works, with a note): `CO_ppm`, `CH4_vol_pct`,
   `O2_vol_pct`, `CO2_vol_pct`, `H2_ppm`, `C2H4_ppm`, `C2H2_ppm`,
   `Coal_Seam_Temp_C`, `Airway_Temp_C`, `Thermal_IR_Max_C`,
   `Air_Velocity_m_s`, `Barometric_Pressure_kPa`, `Smoke_Obscuration_pct`,
   `Grahams_Ratio`, `Trickett_Ratio`, `Explosion_Risk_Index`,
   `YOLO_Flame_Detected`, `YOLO_Smoke_Detected`. Rename columns in the CSV
   rather than editing rules.
2. **Units.** Gases in `%vol` must be percent by volume (0.5 = 0.5 %), not
   fractions. `ppm` columns are parts per million. Air velocity is m/s.
   Graham's ratio is a percentage (CIMFR convention); a value that looks like
   a fraction is flagged.
3. **Timestamps.** Put them in one column (ISO 8601 with a time zone, e.g.
   `2026-10-28T09:00:00Z`, is safest). Rows can be in any order. A file
   without a time column can never be SAFE.
4. **Detections.** `1/0`, `true/false`, `yes/no`, `detected/not detected` are
   accepted. Anything else is invalid and flagged.
5. **A new sensor.** Declare it under `parameters` (`name`, `unit`, `type`
   `number` or `boolean`, `description`, optional `min`/`max`), then add rules
   for it. Existing fields' units and types cannot be changed by a site file.
6. **Different location or regime.** Built-in rules with a context (return
   air, wet-bulb temperature, the outbye ventilation connection, degree of
   gassiness) are disabled or conditional, because a single CSV column does not
   say where it was measured. If your sensor is at that location, enable the
   rule by including it in your site file with `"enabled": true`.
7. **Try it first** with synthetic data:
   `node scripts/make-sample-sensor-csv.mjs normal` (also `methane`,
   `low-oxygen`, `smoke`, `stale`, `heating`). These files are invented and
   say so.

## Limits of the built-in rules

- Checked against a reproduction of the Gazette and an independent copy, not
  the official DGMS copy; amendments after 27 Nov 2017 were not checked.
- Applies to Indian coal mines under CMR 2017. Other jurisdictions need their
  own `replace` file.
- No numeric limit is shipped for CO, H2, temperatures (other than wet-bulb),
  pressure, smoke obscuration, Trickett ratio or the Explosion Risk Index.
