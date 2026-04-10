const video = document.getElementById('video');
const openmvImage = document.getElementById('openmvImage');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const countList = document.getElementById('countList');
const statusText = document.getElementById('statusText');
const cameraMeta = document.getElementById('cameraMeta');
const perfMeta = document.getElementById('perfMeta');
const modelMeta = document.getElementById('modelMeta');
const cameraType = document.getElementById('cameraType');
const openmvPanel = document.getElementById('openmvPanel');
const openmvConnStatus = document.getElementById('openmvConnStatus');

let stream = null;
let timer = null;
let frameTimer = null;
let durationTimer = null;
let durationBaseSeconds = 0;
let durationBaseAt = Date.now();
let durationCameraOn = false;
let configSyncPausedUntil = 0;

function stopLocalStream() {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

function isConfigEditing() {
  const ids = [
    'cfgResolution', 'cfgFps', 'cfgExposure', 'cfgGain', 'cfgBaudrate', 'cfgTimeout',
    'cfgAwb', 'cfgFlipH', 'cfgFlipV', 'cameraType',
  ];
  return ids.some((id) => document.activeElement === document.getElementById(id));
}

async function postApi(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : null,
  });
  const data = await res.json().catch(() => ({ ok: false, message: '接口返回异常' }));
  if (!res.ok) return { ok: false, message: data.message || `请求失败(${res.status})` };
  return data;
}

function formatDuration(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function renderDurationTick() {
  const extra = durationCameraOn ? Math.max(0, Math.floor((Date.now() - durationBaseAt) / 1000)) : 0;
  document.getElementById('todayDuration').textContent = formatDuration((durationBaseSeconds + extra) * 1000);
}

function syncDuration(baseSeconds = 0, cameraOn = false) {
  const nextBase = Math.max(0, Number(baseSeconds || 0));
  if (Math.abs(nextBase - durationBaseSeconds) >= 2 || durationCameraOn !== !!cameraOn) {
    durationBaseSeconds = nextBase;
    durationBaseAt = Date.now();
  }
  durationCameraOn = !!cameraOn;
  renderDurationTick();
  if (!durationTimer) durationTimer = setInterval(renderDurationTick, 1000);
}

function drawBoxes(boxes = []) {
  const target = cameraType.value === 'openmv' ? openmvImage : video;
  overlay.width = target.clientWidth || video.clientWidth;
  overlay.height = target.clientHeight || video.clientHeight;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.lineWidth = 2;
  ctx.font = '13px sans-serif';
  boxes.forEach((b) => {
    ctx.strokeStyle = '#00e1ff';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    const text = `${b.label} ${(b.conf * 100).toFixed(0)}%`;
    ctx.fillRect(b.x, b.y - 20, ctx.measureText(text).width + 8, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, b.x + 4, b.y - 6);
  });
}

function renderCounts(counts = {}) {
  countList.innerHTML = '';
  const entries = Object.entries(counts);
  if (!entries.length) {
    countList.innerHTML = '<li class="list-group-item">暂无检测数据</li>';
    return;
  }
  entries.forEach(([k, v]) => {
    const item = document.createElement('li');
    item.className = 'list-group-item d-flex justify-content-between';
    item.innerHTML = `<span>${k}</span><strong>${v}</strong>`;
    countList.appendChild(item);
  });
}

function patchConfigInputs(cfg = {}) {
  document.getElementById('cfgResolution').value = cfg.resolution || '720P';
  document.getElementById('cfgFps').value = cfg.fps || 15;
  document.getElementById('cfgExposure').value = cfg.exposure ?? 50;
  document.getElementById('cfgGain').value = cfg.gain ?? 1;
  document.getElementById('cfgBaudrate').value = cfg.baudrate || 115200;
  document.getElementById('cfgTimeout').value = cfg.serial_timeout || 800;
  document.getElementById('cfgAwb').checked = !!cfg.auto_white_balance;
  document.getElementById('cfgFlipH').checked = !!cfg.flip_horizontal;
  document.getElementById('cfgFlipV').checked = !!cfg.flip_vertical;
}

async function refreshSystem() {
  const data = await fetch('/api/system/status').then((r) => r.json());
  if (!data.ok) return;

  const remoteType = data.camera_type || 'local';
  const shouldSyncConfig = Date.now() >= configSyncPausedUntil && !isConfigEditing();
  if ((data.camera_on || data.openmv_connected) && shouldSyncConfig) {
    cameraType.value = remoteType;
  }
  openmvPanel.classList.toggle('d-none', cameraType.value !== 'openmv');

  const isOnline = data.camera_on && data.camera_state !== '未连接';
  document.getElementById('cameraStateMini').textContent = isOnline ? '在线' : '离线';

  statusText.textContent = `状态：${data.detection_on ? '运行中' : (data.camera_on ? '摄像头已开启' : '待机')}`;
  cameraMeta.textContent = `类型：${data.camera_type || '-'} | 分辨率：${data.openmv_settings?.resolution || '-'} | 帧率：${data.openmv_settings?.fps || '-'}fps`;
  perfMeta.textContent = `推理耗时：${data.last_inference_ms || '-'}ms`;

  modelMeta.textContent = `模型：${data.model_name || '-'}（${data.model_loaded ? '已加载' : '未加载'}）`;


  const cfg = data.openmv_settings || {};
  if (shouldSyncConfig) patchConfigInputs(cfg);
  document.getElementById('cfgMeta1').textContent = `波特率：${cfg.baudrate || '-'} | 曝光：${cfg.exposure || '-'} | 增益：${cfg.gain || '-'}`;
  document.getElementById('cfgMeta2').textContent = `超时：${cfg.serial_timeout || '-'}ms | 自动白平衡：${cfg.auto_white_balance ? '开' : '关'} | 镜像：${cfg.flip_horizontal ? 'H' : '-'}${cfg.flip_vertical ? 'V' : '-'}`;

  syncDuration(data.today_detection_seconds || 0, data.camera_on);
  await ensureCameraPreview(data);
  ensureDetectionPolling(data.camera_on && data.detection_on);
}

async function pollDetection() {
  let payload = null;
  if (cameraType.value === 'local' && stream) {
    const cap = document.createElement('canvas');
    cap.width = video.videoWidth || 640;
    cap.height = video.videoHeight || 480;
    const capCtx = cap.getContext('2d');
    capCtx.drawImage(video, 0, 0, cap.width, cap.height);
    payload = { frame: cap.toDataURL('image/jpeg', 0.72) };
  }
  if (cameraType.value === 'openmv' && openmvImage?.src?.startsWith('data:image')) {
    payload = { frame: openmvImage.src };
  }
  const data = await postApi('/api/detection/frame-data', payload);
  if (!data.ok) {
    statusText.textContent = `状态：${data.message || '错误'}`;
    return;
  }
  drawBoxes(data.boxes);
  renderCounts(data.counts);

  const stat = await fetch('/api/stats/live').then((r) => r.json());
  const cards = stat.cards;
  const running = cards.camera_on && data.detection_on;
  statusText.textContent = `状态：${running ? '运行中' : '待机'}`;
  cameraMeta.textContent = `类型：${cards.camera_type || '-'} | 分辨率：${cards.resolution || '-'} | 帧率：${cards.fps || '-'}fps`;
  perfMeta.textContent = `推理耗时：${Number(cards.inference_ms || 0).toFixed(2)}ms`;
  document.getElementById('onlineUsers').textContent = cards.active_users;
}

async function pollOpenmvFrames() {
  const data = await fetch('/api/openmv/frame').then((r) => r.json()).catch(() => ({ ok: false }));
  if (!data.ok) {
    openmvConnStatus.textContent = `连接状态：未收到视频帧（${data.message || '等待中'}）`;
    document.getElementById('cameraStateMini').textContent = '离线';
    return;
  }
  openmvImage.src = `data:image/jpeg;base64,${data.frame}`;
  const target = document.getElementById('openmvTarget').value.trim() || '-';
  openmvConnStatus.textContent = `连接状态：已连接 | 视频端口：${target} | RX=${data.len}`;
  document.getElementById('cameraStateMini').textContent = '在线';
}

async function ensureCameraPreview(data) {
  if (!data.camera_on) {
    stopLocalStream();
    video.classList.remove('d-none');
    openmvImage.classList.add('d-none');
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
    return;
  }

  if (data.camera_type === 'local') {
    openmvImage.classList.add('d-none');
    video.classList.remove('d-none');
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        video.srcObject = stream;
      } catch (e) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          video.srcObject = stream;
        } catch (fallbackError) {
          statusText.textContent = '状态：无法恢复本地摄像头画面（请检查权限）';
          await postApi('/api/camera/stop');
        }
      }
    }
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
  } else {
    stopLocalStream();
    video.classList.add('d-none');
    openmvImage.classList.remove('d-none');
    if (!frameTimer) frameTimer = setInterval(pollOpenmvFrames, 500);
    pollOpenmvFrames();
  }
}

function ensureDetectionPolling(enabled) {
  if (enabled && !timer) {
    timer = setInterval(pollDetection, 1200);
    pollDetection();
  }
  if (!enabled && timer) {
    clearInterval(timer);
    timer = null;
    drawBoxes([]);
  }
}

cameraType.onchange = () => {
  openmvPanel.classList.toggle('d-none', cameraType.value !== 'openmv');
};

document.getElementById('openmvMode').onchange = (e) => {
  const target = document.getElementById('openmvTarget');
  if (e.target.value === 'network') {
    target.placeholder = 'http://ip:port/snapshot.jpg 或 192.168.1.10:8080';
  } else {
    target.placeholder = '串口号，如 COM3 或 /dev/ttyUSB0';
  }
};

document.getElementById('applyCameraCfgBtn').onclick = async () => {
  const payload = {
    camera_type: cameraType.value,
    resolution: document.getElementById('cfgResolution').value,
    fps: Number(document.getElementById('cfgFps').value || 15),
    exposure: Number(document.getElementById('cfgExposure').value || 50),
    gain: Number(document.getElementById('cfgGain').value || 1),
    baudrate: Number(document.getElementById('cfgBaudrate').value || 115200),
    serial_timeout: Number(document.getElementById('cfgTimeout').value || 800),
    auto_white_balance: document.getElementById('cfgAwb').checked,
    flip_horizontal: document.getElementById('cfgFlipH').checked,
    flip_vertical: document.getElementById('cfgFlipV').checked,
  };
  const resp = await postApi('/api/openmv/settings', payload);
  configSyncPausedUntil = Date.now() + 5000;
  if (resp.ok && cameraType.value === 'local' && stream) {
    const track = stream.getVideoTracks()[0];
    if (track?.applyConstraints) {
      const fps = Number(payload.fps || 15);
      const widthMap = { QVGA: 320, VGA: 640, '720P': 1280, '1080P': 1920 };
      const width = widthMap[payload.resolution] || 1280;
      try {
        await track.applyConstraints({ width: { ideal: width }, frameRate: { ideal: fps, max: fps } });
      } catch (e) {
        showToast('本地摄像头不支持该参数，已尽量应用', 'warning');
      }
    }
  }
  showToast(resp.ok ? '摄像头参数已应用' : (resp.message || '参数应用失败'), resp.ok ? 'success' : 'danger');
  await refreshSystem();
};

document.getElementById('scanPortBtn').onclick = async () => {
  const data = await fetch('/api/openmv/ports').then((r) => r.json());
  if (!data.ok || !data.ports.length) {
    showToast('未检测到可用串口，请手动输入。', 'warning');
    return;
  }
  document.getElementById('openmvTarget').value = data.ports[0];
  showToast(`已扫描到 ${data.ports.length} 个串口`, 'info');
};

document.getElementById('connectOpenmvBtn').onclick = async () => {
  const mode = document.getElementById('openmvMode').value;
  const target = document.getElementById('openmvTarget').value.trim();
  const baudrate = Number(document.getElementById('cfgBaudrate').value || 115200);
  await postApi('/api/openmv/settings', { baudrate });
  const data = await postApi('/api/openmv/connect', { mode, target });
  if (!data.ok) {
    openmvConnStatus.textContent = `连接状态：失败（${data.message || '未知错误'}）`;
    showToast(data.message || 'OpenMV 连接失败', 'danger');
    return;
  }
  cameraType.value = 'openmv';
  openmvPanel.classList.remove('d-none');
  openmvConnStatus.textContent = `连接状态：已连接 (${mode} ${target})`;
  showToast('OpenMV 连接成功');
};

document.getElementById('disconnectOpenmvBtn').onclick = async () => {
  await postApi('/api/openmv/disconnect');
  openmvConnStatus.textContent = '连接状态：未连接 | 视频端口：--';
  showToast('OpenMV 已断开', 'secondary');
};

document.getElementById('openCameraBtn').onclick = async () => {
  const resp = await postApi('/api/camera/start', { camera_type: cameraType.value });
  if (!resp.ok) {
    showToast(resp.message || '摄像头开启失败', 'warning');
    return;
  }
  ensureDetectionPolling(!!resp.detection_on);

  showToast('摄像头已开启，同时已开启检测');

  await refreshSystem();
};

document.getElementById('closeCameraBtn').onclick = async () => {
  stopLocalStream();
  await postApi('/api/camera/stop');
  ensureDetectionPolling(false);
  drawBoxes([]);
  renderCounts({});
  statusText.textContent = '状态：摄像头已关闭，检测已停止';
  showToast('摄像头已关闭，检测已停止', 'secondary');
  await refreshSystem();
};

document.getElementById('startDetBtn').onclick = async () => {
  const data = await postApi('/api/detection/start');
  if (!data.ok) {
    statusText.textContent = `状态：${data.message}`;
    showToast(`检测开启失败：${data.message}`, 'warning');
    return;
  }
  ensureDetectionPolling(true);
  statusText.textContent = '状态：运行中';
};

document.getElementById('stopDetBtn').onclick = async () => {
  await postApi('/api/detection/stop');
  ensureDetectionPolling(false);
  statusText.textContent = '状态：检测已停止（摄像头保持开启）';
  showToast('检测已关闭，摄像头保持开启', 'secondary');
};

document.getElementById('fullscreenBtn').onclick = async () => {
  const wrap = document.getElementById('videoWrap');
  const btn = document.getElementById('fullscreenBtn');
  if (!document.fullscreenElement) {
    await wrap.requestFullscreen();
    btn.textContent = '📥';
  } else {
    await document.exitFullscreen();
    btn.textContent = '📤';
  }
};

setInterval(refreshSystem, 2500);
refreshSystem();
renderDurationTick();

window.addEventListener('beforeunload', () => {
  stopLocalStream();
});
