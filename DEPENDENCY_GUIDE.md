# 依赖安装说明（GUI_YOLOv5）


你反馈的报错是对的：之前那版依赖里把 `opencv-python==4.12.0.88` 和 `scipy==1.10.1` 固定在一起，
在 Python 3.9/3.10 下会被 `numpy` 版本约束卡住（`opencv 4.12` 倾向 `numpy>=2`，而 `scipy 1.10` 要 `numpy<1.27`）。

我已经修正为“可解依赖”的版本范围：

- `numpy>=1.23.5,<1.27`
- `opencv-python>=4.8,<4.11`
- `scipy>=1.10,<1.12`

这样可以避免你截图里的 `ResolutionImpossible`。

---

## 文件说明

1. `requirements.txt`：现在是**可安装优先**的推荐清单（已修复版本冲突）。
2. `requirements_zhihuis_pip.txt`：由 `zhihuis.txt` 转出的完整 pip 清单（更像“历史环境快照”）。

## 安装建议（Anaconda 里执行）

### 1) 新建并激活环境（推荐 Python 3.10）
```bash
conda create -n py310_yolov5 python=3.10 -y
conda activate py310_yolov5
python -m pip install -U pip setuptools wheel
```

### 2) 安装项目依赖（推荐）

```bash
pip install -r requirements.txt
```


### 3) 如果你要尽量贴近学姐原环境

```bash
pip install -r requirements_zhihuis_pip.txt
```


## 关于你说的 YOLOv8 / alltrack

- 这个仓库是 YOLOv5，通常不需要 YOLOv8 的 `alltrack` 依赖文件。
- 你删掉那个 txt，一般不影响这个项目。

## 如果仍报错

先看是不是你本地还额外指定了 `numpy==2.1.2`（截图里就是这个触发冲突），
如果有，请从你本地 requirements 或安装命令里删掉这个固定版本再装。

