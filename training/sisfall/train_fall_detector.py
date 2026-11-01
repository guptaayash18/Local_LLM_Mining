"""
Man-down (fall) detector trained on SisFall.

Approach (event-triggered, like real wearables): for each recording, find the
strongest acceleration peak, take a 4 s window around it (1 s before, 3 s
after), compute features, and classify fall vs. normal activity.
Evaluation holds out whole people (subject-wise), so the scores reflect
people the model has never seen.

Usage: python train_fall_detector.py <SisFall_dataset folder> <output folder>
Sensors used: ADXL345 accelerometer (cols 1-3) + ITG3200 gyroscope (cols 4-6),
the same pair a phone or wearable has.
"""
import json, re, sys, time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import GroupKFold

FS = 200                      # Hz
ACC_G = (2 * 16) / 2**13      # ADXL345: +-16 g, 13 bit
GYR_DPS = (2 * 2000) / 2**16  # ITG3200: +-2000 deg/s, 16 bit
PRE, POST = 1 * FS, 3 * FS    # window around the peak

def load(path):
    df = pd.read_csv(path, header=None, usecols=range(6), skipinitialspace=True,
                     converters={5: lambda s: s.strip().rstrip(";")})
    a = df.iloc[:, :3].to_numpy(float) * ACC_G
    g = df.iloc[:, 3:6].astype(float).to_numpy() * GYR_DPS
    return a, g

def window(a, g):
    mag = np.linalg.norm(a, axis=1)
    p = int(np.argmax(mag[PRE: len(mag) - POST])) + PRE if len(mag) > PRE + POST else int(np.argmax(mag))
    s, e = max(0, p - PRE), min(len(mag), p + POST)
    return a[s:e], g[s:e], p - s

def features(a, g, peak):
    mag = np.linalg.norm(a, axis=1)
    gmag = np.linalg.norm(g, axis=1)
    pre, post = a[: max(1, peak - FS // 4)], a[min(len(a) - 1, peak + FS):]
    v_pre = pre.mean(0); v_post = post.mean(0) if len(post) else a[-1]
    cosang = np.dot(v_pre, v_post) / (np.linalg.norm(v_pre) * np.linalg.norm(v_post) + 1e-9)
    f = {
        "peak_g": mag.max(), "min_g": mag.min(), "range_g": np.ptp(mag),
        "mean_g": mag.mean(), "std_g": mag.std(),
        "freefall_s": (mag < 0.6).sum() / FS,             # near weightless before impact
        "post_std_g": np.linalg.norm(post, axis=1).std() if len(post) else 0.0,  # lying still after
        "post_mean_g": np.linalg.norm(post, axis=1).mean() if len(post) else 0.0,
        "tilt_change_deg": float(np.degrees(np.arccos(np.clip(cosang, -1, 1)))),
        "gyro_peak_dps": gmag.max(), "gyro_mean_dps": gmag.mean(), "gyro_std_dps": gmag.std(),
        "jerk_peak": np.abs(np.diff(mag)).max() * FS,
    }
    for i, ax in enumerate("xyz"):
        f[f"acc_{ax}_mean"] = a[:, i].mean(); f[f"acc_{ax}_std"] = a[:, i].std()
        f[f"acc_{ax}_post"] = v_post[i]; f[f"gyr_{ax}_std"] = g[:, i].std()
    return f

def main(root, out):
    root, out = Path(root), Path(out); out.mkdir(parents=True, exist_ok=True)
    rows, t0 = [], time.time()
    files = sorted(root.glob("S[AE]*/[DF]*_S*_R*.txt"))
    for i, fp in enumerate(files):
        m = re.match(r"([DF]\d\d)_(S[AE]\d\d)_R(\d\d)", fp.stem)
        if not m: continue
        a, g = load(fp)
        if len(a) < FS: continue
        wa, wg, pk = window(a, g)
        rows.append({"file": fp.name, "activity": m[1], "subject": m[2],
                     "fall": int(m[1][0] == "F"), **features(wa, wg, pk)})
        if i % 500 == 0: print(f"{i}/{len(files)} files, {time.time()-t0:.0f}s", flush=True)
    df = pd.DataFrame(rows); df.to_csv(out / "features.csv", index=False)
    X = df.drop(columns=["file", "activity", "subject", "fall"]); y = df["fall"]; groups = df["subject"]
    print(f"{len(df)} recordings: {y.sum()} falls, {len(y)-y.sum()} normal activities, {groups.nunique()} people")

    # Subject-wise 5-fold cross-validation: test people never appear in training.
    pred = np.zeros(len(df), int); prob = np.zeros(len(df))
    for tr, te in GroupKFold(n_splits=5).split(X, y, groups):
        m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, random_state=0)
        m.fit(X.iloc[tr], y.iloc[tr]); prob[te] = m.predict_proba(X.iloc[te])[:, 1]
    pred = (prob >= 0.5).astype(int)
    tn, fp_, fn, tp = confusion_matrix(y, pred).ravel()
    res = {"recordings": len(df), "falls": int(y.sum()), "normal": int(len(y) - y.sum()), "people": int(groups.nunique()),
           "sensitivity_falls_caught": tp / (tp + fn), "specificity_no_false_alarm": tn / (tn + fp_),
           "accuracy": (tp + tn) / len(y), "missed_falls": int(fn), "false_alarms": int(fp_)}
    df["pred"] = pred
    res["false_alarms_by_activity"] = df[(df.fall == 0) & (df.pred == 1)].activity.value_counts().to_dict()
    res["missed_falls_by_type"] = df[(df.fall == 1) & (df.pred == 0)].activity.value_counts().to_dict()

    # Simple threshold baseline (what many cheap devices do): peak > 2.5 g and lying still after.
    base = ((df.peak_g > 2.5) & (df.post_std_g < 0.15)).astype(int)
    tn2, fp2, fn2, tp2 = confusion_matrix(y, base).ravel()
    res["baseline_threshold"] = {"sensitivity": tp2 / (tp2 + fn2), "specificity": tn2 / (tn2 + fp2)}

    final = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, random_state=0).fit(X, y)
    joblib.dump({"model": final, "features": list(X.columns), "fs_hz": FS,
                 "window_s": [PRE / FS, POST / FS], "sensors": "ADXL345 accel (g) + ITG3200 gyro (deg/s)"},
                out / "fall_detector.joblib")
    (out / "results.json").write_text(json.dumps(res, indent=2, default=float))
    print(json.dumps(res, indent=2, default=float))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
