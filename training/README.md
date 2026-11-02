# Training

| Model | Data | Status | Results |
| --- | --- | --- | --- |
| Fire & smoke camera model (YOLO11n) | D-Fire (17,221 train / 4,302 val images; class 0 = smoke, 1 = fire) | **Trained** — 39 epochs on Google Colab T4 | mAP50 **76.8%**, mAP50-95 44.3%, P 77.5%, R 70.1% |
| Man-down fall detector (HistGradientBoosting) | SisFall (accelerometer + gyroscope; 38 people, 4,505 recordings) | **Trained** — subject-wise cross-validation | Sensitivity **98.7%**, Specificity 99.2% |

## Fire & smoke detector (D-Fire / YOLO11n)

Results: [`dfire/results.json`](./dfire/results.json) · Branch: [`dfire-training`](https://github.com/guptaayash18/Local_LLM_Mining/tree/dfire-training)

Weights (`best.pt`): `MyDrive/Hazardwatch/dfire/train/weights/best.pt` in Google Drive.
ONNX export: run the export cell in `dfire/dfire_yolo_colab.ipynb` to generate `best.onnx`.

Open the D-Fire notebook in Colab:
https://colab.research.google.com/github/guptaayash18/Local_LLM_Mining/blob/main/training/dfire/dfire_yolo_colab.ipynb

## Man-down fall detector (SisFall / HistGradientBoosting)

Results: [`sisfall/results.json`](./sisfall/results.json) · Trained model: [`sisfall/fall_detector.joblib`](./sisfall/fall_detector.joblib) · Branch: [`sisfall-integration`](https://github.com/guptaayash18/Local_LLM_Mining/tree/sisfall-integration)

Run detection on a CSV with accelerometer/gyroscope columns:
```bash
python training/sisfall/detect_falls.py --input your_data.csv
# Demo mode (synthetic fall injected):
python training/sisfall/detect_falls.py --demo
```

> The dashboard integration for `Worker_Fall_Detected` is on the `sisfall-integration` branch.
> Whether to surface fall events alongside environmental parameters is still being evaluated.
