# Training

| Model | Data | Where it trains | Output |
| --- | --- | --- | --- |
| Man-down (fall) detector | SisFall (38 people, 4,505 recordings, 200 Hz accel + gyro) | CPU, about 1 minute: `python sisfall/train_fall_detector.py <SisFall_dataset> sisfall/` | `sisfall/fall_detector.joblib`, `sisfall/results.json` |
| Fire & smoke camera model (YOLO11n) | D-Fire (about 21,000 images; class 0 = smoke, 1 = fire) | Google Colab T4: open `dfire/dfire_yolo_colab.ipynb` | `best.pt`, `best.onnx`, `results.json` in `MyDrive/HazardWatch/dfire/` |

Open the D-Fire notebook in Colab:
https://colab.research.google.com/github/guptaayash18/Local_LLM_Mining/blob/main/training/dfire/dfire_yolo_colab.ipynb

SisFall results (people never seen in training, 5-fold by person): 98.7 % of
falls caught, 99.2 % of normal activities without a false alarm. A simple
"peak > 2.5 g then still" rule: 96.4 % and 83.9 %.
