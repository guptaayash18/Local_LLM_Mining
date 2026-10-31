# Training

| Model | Data | Where it trains | Output |
| --- | --- | --- | --- |
| Fire & smoke camera model (YOLO11n) | D-Fire (about 21,000 images; class 0 = smoke, 1 = fire) | Google Colab T4: open `dfire/dfire_yolo_colab.ipynb` | `best.pt`, `best.onnx`, `results.json` in `MyDrive/<HazardWatch folder>/dfire/` |

Open the D-Fire notebook in Colab:
https://colab.research.google.com/github/guptaayash18/Local_LLM_Mining/blob/main/training/dfire/dfire_yolo_colab.ipynb

The man-down (fall) detector trained on SisFall, and its connection to the
dashboard, are on the `sisfall-integration` branch while we evaluate whether
worker-motion data belongs with the environmental parameters.
