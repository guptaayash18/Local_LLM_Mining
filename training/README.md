# Training

| Model | Data | Where it trains | Output |
| --- | --- | --- | --- |
| Man-down (fall) detector | SisFall (38 people, 4,505 recordings, 200 Hz accel + gyro) | CPU, about 1 minute: `python sisfall/train_fall_detector.py <SisFall_dataset> sisfall/` | `sisfall/fall_detector.joblib`, `sisfall/results.json` |
| Fire & smoke camera model (YOLO11n) | D-Fire (about 21,000 images; class 0 = smoke, 1 = fire) | Google Colab T4: open `dfire/dfire_yolo_colab.ipynb` | `best.pt`, `best.onnx`, `results.json` in `MyDrive/HazardWatch/dfire/` |

## Man-down detector in HazardWatch

`sisfall/detect_falls.py` runs the trained detector on worker motion data
(200 Hz: `Timestamp, [Location], acc_x_g, acc_y_g, acc_z_g, gyro_x_dps,
gyro_y_dps, gyro_z_dps`) and adds a `Worker_Fall_Detected` column to a
HazardWatch sensor CSV. The flag latches: once a fall is detected it stays 1
for the rest of the file, like a man-down alarm that a person must clear.

```
python sisfall/detect_falls.py motion.csv sensors.csv sensors_with_falls.csv
python sisfall/detect_falls.py --demo <SisFall_dataset> sensors.csv out.csv
```

HazardWatch knows the column from the starter thresholds
(`src/config/site-thresholds.json`): it appears in the parameter guide, the
2×2 grid (COLOUR BY), the next actions ("send someone to check now") and the
AI report. As a provisional rule it raises CAUTION; record your man-down
procedure as verified to make it UNSAFE.

`samples/coal-mine-2x2-grid.csv` was made with `--demo`: one hour of SisFall
walking, stairs and bending per point; the worker at P3 faints at 12:40.
Result: 1 fall detected at P3 (12:40:22), no false alarms at P1, P2, P4. These
recordings were also used to train the model, so this is a demonstration;
the cross-validated scores above are the honest accuracy.

Open the D-Fire notebook in Colab:
https://colab.research.google.com/github/guptaayash18/Local_LLM_Mining/blob/main/training/dfire/dfire_yolo_colab.ipynb

SisFall results (people never seen in training, 5-fold by person): 98.7 % of
falls caught, 99.2 % of normal activities without a false alarm. A simple
"peak > 2.5 g then still" rule: 96.4 % and 83.9 %.
