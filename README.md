# Local LLM Mining

**HazardWatch** is a mine environment and hazard monitor. Upload a sensor CSV
(gases, temperatures, ventilation, smoke and fire detection) and get a
rule-based safety status, a guide to every parameter, trends, correlations,
outliers and an AI shift report.

**AI engine (final):** Qwen 2.5 1.5B (`qwen2.5:1.5b`) running locally in
Ollama on your own computer. No cloud AI is used, and nothing leaves the
machine. The GitHub Pages edition uses the same local model when the app is
running; only if it is not can a visitor choose the in-browser build of the
same Qwen model.

It comes in two editions:

- **Local app:** run it on your computer with Ollama. It works fully offline.
- **Web edition:** https://guptaayash18.github.io/Local_LLM_Mining/ (deployed by
  `.github/workflows/pages.yml`). Its AI uses the local app on your computer
  when you start it with `npm run start:with-pages`. Otherwise you can choose
  the in-browser model (about 1 GB download, Chrome or Edge with WebGPU).

Every analysis starts with a rule-based safety status (SAFE, CAUTION or
UNSAFE) from the Coal Mines Regulations 2017 rules. A **parameter guide**
explains all 18 sensor columns with their normal range and warning/critical
levels, set in one easy file:
[`Mine Safety Monitoring/src/config/site-thresholds.json`](./Mine%20Safety%20Monitoring/src/config/site-thresholds.json).
Those starter levels are provisional (CAUTION at most) until you verify them
against your site standard. Charts show a 1-hour moving average. Tuned for
8 GB RAM; see the app README, section 3a.

The app is in [`Mine Safety Monitoring/`](./Mine%20Safety%20Monitoring). See its
[README](./Mine%20Safety%20Monitoring/README.md) for setup (Windows PowerShell
first), configuration, changing the model, and test results.

Quick start on Windows: double-click
`Mine Safety Monitoring/start-windows.bat`. Or by hand:

```powershell
ollama pull qwen2.5:1.5b
cd "Mine Safety Monitoring"
npm ci
npm run build
npm start        # then open http://127.0.0.1:8080
```

## Models trained for HazardWatch

See [`training/`](./training/README.md).

| Model | Data | Status |
| --- | --- | --- |
| Man-down (fall) detector | SisFall: 38 people, 4,505 recordings | Trained: 98.7 % of falls caught, 99.2 % of normal activities without a false alarm (tested on people not used for training) |
| Fire & smoke camera model (YOLO11n) | D-Fire: about 21,500 images | Training on Google Colab ([notebook](./training/dfire/dfire_yolo_colab.ipynb)); results go to Google Drive |

Neither model is wired into the dashboard yet; the gas and temperature
safety rules and the local Qwen report are independent of them.

