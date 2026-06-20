from __future__ import annotations

import argparse
import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
os.environ.setdefault("YOLO_CONFIG_DIR", str(BASE_DIR / ".runtime" / "ultralytics"))

from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser(description="Export YOLOv8 best.pt to OpenVINO IR.")
    parser.add_argument("--weights", type=Path, default=BASE_DIR / "models" / "best.pt")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--fp32", action="store_true", help="Disable FP16 weight compression.")
    args = parser.parse_args()

    weights = args.weights.resolve()
    if not weights.exists():
        raise FileNotFoundError(f"Weight file not found: {weights}")

    model = YOLO(str(weights), task="detect")
    output = model.export(
        format="openvino",
        imgsz=args.imgsz,
        half=not args.fp32,
        dynamic=False,
        batch=1,
    )
    print(f"OpenVINO model exported to: {Path(output).resolve()}")


if __name__ == "__main__":
    main()
