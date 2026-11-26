"""Turn screencast frames (NNNNN_<timestamp>.jpg, from record-pack.mjs or record-card.mjs) into a 30 fps MP4.

    python scripts/frames-to-mp4.py <frames dir> <out.mp4>

Frames arrive unevenly, so each output frame shows the latest screencast frame at that moment.
"""
import glob
import os
import sys

import cv2

src, out = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(os.path.join(src, "*.jpg")))
stamps = [float(os.path.basename(f).split("_")[1][:-4]) for f in files]
first = cv2.imread(files[0])
h, w = first.shape[:2]
writer = cv2.VideoWriter(out, cv2.VideoWriter_fourcc(*"avc1"), 30, (w, h))
t, i, n = stamps[0], 0, 0
while t <= stamps[-1]:
    while i + 1 < len(files) and stamps[i + 1] <= t:
        i += 1
    frame = cv2.imread(files[i])
    if frame.shape[:2] != (h, w):
        frame = cv2.resize(frame, (w, h))
    writer.write(frame)
    t += 1 / 30
    n += 1
writer.release()
print(f"{n} frames ({n / 30:.1f} s) -> {out}")
