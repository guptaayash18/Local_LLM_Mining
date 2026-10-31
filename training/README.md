# Training

| Model | Data | Status | Results |
| --- | --- | --- | --- |
| Fire & smoke camera model (YOLO11n) | D-Fire (17,221 train / 4,302 val images; class 0 = smoke, 1 = fire) | **Trained** — 39 epochs on Google Colab T4 | mAP50 **76.8%**, mAP50-95 44.3%, P 77.5%, R 70.1% |

Results detail: [`dfire/results.json`](./dfire/results.json)

Model weights (`best.pt`): `MyDrive/Hazardwatch/dfire/train/weights/best.pt` in Google Drive.
ONNX export: run the export cell in `dfire/dfire_yolo_colab.ipynb` to generate `best.onnx`.

Open the D-Fire notebook in Colab:
https://colab.research.google.com/github/guptaayash18/Local_LLM_Mining/blob/main/training/dfire/dfire_yolo_colab.ipynb

The man-down (fall) detector trained on SisFall, and its connection to the
dashboard, are on the `sisfall-integration` branch while we evaluate whether
worker-motion data belongs with the environmental parameters.
