"""
Run the trained man-down detector on worker motion data and add a
`Worker_Fall_Detected` column (0/1 per row) to a HazardWatch sensor CSV.

Usage
-----
  # Real data: one motion CSV (200 Hz) with columns
  #   Timestamp, [Location], acc_x_g, acc_y_g, acc_z_g, gyro_x_dps, gyro_y_dps, gyro_z_dps
  python detect_falls.py motion.csv sensors.csv sensors_with_falls.csv

  # Demo: build one hour of worker motion per grid point from SisFall
  # recordings (walking, stairs, bending; the worker at P3 faints and falls
  # at 12:40) and add the column to the sample grid file.
  python detect_falls.py --demo <SisFall_dataset> sensors.csv out.csv

How it works: every jolt above 1.5 g wakes the detector; a 4 s window around
it (1 s before, 3 s after) is scored by the model trained in
train_fall_detector.py. A row gets 1 when a fall was detected between its
timestamp and the next one, and stays 1 for the rest of the file (a
man-down alarm stays on until someone clears it). Per Location in grid files.
"""
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from train_fall_detector import FS, POST, PRE, features, load  # noqa: E402

TRIGGER_G = 1.5  # 99 % of SisFall falls peak above 2.1 g; the model decides
MODEL = Path(__file__).parent / "fall_detector.joblib"


def detect(acc, gyr, bundle):
    """Return (sample index, probability) of each detected fall in a stream."""
    model, names = bundle["model"], bundle["features"]
    mag = np.linalg.norm(acc, axis=1)
    falls, i = [], PRE
    while i < len(mag) - POST:
        if mag[i] >= TRIGGER_G and mag[i] == mag[max(0, i - FS // 2): i + FS // 2].max():
            f = features(acc[i - PRE: i + POST], gyr[i - PRE: i + POST], PRE)
            p = model.predict_proba(pd.DataFrame([f])[names])[0, 1]
            if p >= 0.5:
                falls.append((i, float(p)))
            i += POST  # one decision per event
        else:
            i += 1
    return falls


def mark(sensors, fall_times, location=None):
    """Latch: 1 from the row containing the fall to the end of the file.

    A man-down alarm stays on until a person clears it; the model cannot tell
    that the worker got up again.
    """
    t = pd.to_datetime(sensors["Timestamp"])
    rows = sensors.index if location is None else sensors.index[sensors["Location"] == location]
    times = t[rows].sort_values()
    for ft in fall_times:
        before = times[times <= ft]
        if len(before):
            sensors.loc[times.index[times >= before.iloc[-1]], "Worker_Fall_Detected"] = 1


def demo_stream(root, start, minutes, fall_at_min=None, seed=0):
    """Concatenate SisFall activity recordings into one worker's stream."""
    rng = np.random.default_rng(seed)
    adl = sorted(p for c in ("D01", "D02", "D05", "D06", "D15", "D16")
                 for p in Path(root).glob(f"SA*/{c}_SA*_R*.txt"))
    parts, n = [], 0
    target = minutes * 60 * FS
    fall_sample = None if fall_at_min is None else fall_at_min * 60 * FS
    while n < target:
        if fall_sample is not None and n >= fall_sample:
            a, g = load(Path(root) / "SA05" / "F06_SA05_R01.txt")  # faints, vertical fall
            fall_sample = None
        else:
            a, g = load(adl[rng.integers(len(adl))])
        parts.append((a, g)); n += len(a)
    acc = np.vstack([p[0] for p in parts])[:target]
    gyr = np.vstack([p[1] for p in parts])[:target]
    return acc, gyr, pd.Timestamp(start)


def main(argv):
    bundle = joblib.load(MODEL)
    if argv[0] == "--demo":
        root, sensors_in, out = argv[1:4]
        sensors = pd.read_csv(sensors_in)
        sensors["Worker_Fall_Detected"] = 0
        start = pd.to_datetime(sensors["Timestamp"]).min()
        minutes = int((pd.to_datetime(sensors["Timestamp"]).max() - start).total_seconds() // 60) + 1
        for k, loc in enumerate(sorted(sensors["Location"].unique())):
            acc, gyr, t0 = demo_stream(root, start, minutes, fall_at_min=40 if loc == "P3" else None, seed=k)
            falls = detect(acc, gyr, bundle)
            times = [t0 + pd.Timedelta(seconds=i / FS) for i, _ in falls]
            print(f"{loc}: {len(falls)} fall(s) detected", [f"{t:%H:%M:%S} p={p:.2f}" for t, (_, p) in zip(times, falls)])
            mark(sensors, times, loc)
    else:
        motion_in, sensors_in, out = argv[:3]
        motion = pd.read_csv(motion_in)
        sensors = pd.read_csv(sensors_in)
        sensors["Worker_Fall_Detected"] = 0
        groups = motion.groupby("Location") if "Location" in motion else [(None, motion)]
        for loc, m in groups:
            acc = m[["acc_x_g", "acc_y_g", "acc_z_g"]].to_numpy(float)
            gyr = m[["gyro_x_dps", "gyro_y_dps", "gyro_z_dps"]].to_numpy(float)
            ts = pd.to_datetime(m["Timestamp"]).to_numpy()
            falls = detect(acc, gyr, bundle)
            print(f"{loc or 'worker'}: {len(falls)} fall(s) detected")
            mark(sensors, [pd.Timestamp(ts[i]) for i, _ in falls], loc)
    sensors.to_csv(out, index=False)
    print("wrote", out)


if __name__ == "__main__":
    main(sys.argv[1:])
