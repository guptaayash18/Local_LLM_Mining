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
| Fire & smoke camera model (YOLO11n) | D-Fire: 17,221 train / 4,302 val images | **Trained** — 39 epochs on Colab T4. mAP50 **76.8%**, mAP50-95 44.3%. `best.pt` in Google Drive (`MyDrive/Hazardwatch/dfire/train/weights/`). ([notebook](./training/dfire/dfire_yolo_colab.ipynb), [results](./training/dfire/results.json)) |

A man-down (fall) detector trained on SisFall is kept on the
[`sisfall-integration`](https://github.com/guptaayash18/Local_LLM_Mining/tree/sisfall-integration)
branch, separate from the main application, while we evaluate it.
