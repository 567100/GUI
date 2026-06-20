const tbody = document.querySelector('#historyTable tbody');
const pageInfo = document.getElementById('pageInfo');
let page = 1;
const pageSize = 20;
let lastTotal = 0;
let activeImageRecord = null;

const categoryNames = { Fissure: '条状缺陷', Crater: '坑状缺陷' };

function displayCategory(name) {
  return categoryNames[name] || name;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getFilters() {
  const keyword = document.getElementById('keyword').value.trim();
  return {
    keyword,
    category: document.getElementById('category').value.trim(),
    note: document.getElementById('note').value.trim(),
    start_time: document.getElementById('startTime').value,
    end_time: document.getElementById('endTime').value,
    page,
    page_size: pageSize,
  };
}

function getExportUrl(format) {
  const f = getFilters();
  return `/api/stats/export?format=${format}&keyword=${encodeURIComponent(f.keyword)}&category=${encodeURIComponent(f.category)}&note=${encodeURIComponent(f.note)}&start_time=${encodeURIComponent(f.start_time)}&end_time=${encodeURIComponent(f.end_time)}`;
}

function drawHistoryBoxes(image, canvas, record) {
  if (!image.complete || !image.naturalWidth || !record.frame_width || !record.frame_height) return;
  const width = image.clientWidth;
  const height = image.clientHeight;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.left = `${image.offsetLeft}px`;
  canvas.style.top = `${image.offsetTop}px`;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  const scaleX = width / record.frame_width;
  const scaleY = height / record.frame_height;
  context.font = '13px "Microsoft YaHei"';
  context.lineWidth = 2;

  (record.boxes || []).forEach((box) => {
    const x = Number(box.x || 0) * scaleX;
    const y = Number(box.y || 0) * scaleY;
    const w = Number(box.w || 0) * scaleX;
    const h = Number(box.h || 0) * scaleY;
    context.strokeStyle = '#00e5ff';
    context.strokeRect(x, y, w, h);
    const text = `${displayCategory(box.label)} ${(Number(box.conf || 0) * 100).toFixed(1)}%`;
    const textWidth = context.measureText(text).width + 10;
    context.fillStyle = 'rgba(0,0,0,.72)';
    context.fillRect(x, Math.max(0, y - 22), textWidth, 22);
    context.fillStyle = '#fff';
    context.fillText(text, x + 5, Math.max(15, y - 7));
  });
}

function openLargeHistoryImage(record) {
  activeImageRecord = record;
  const image = document.getElementById('historyZoomImage');
  const canvas = document.getElementById('historyZoomCanvas');
  image.onload = () => drawHistoryBoxes(image, canvas, record);
  image.src = `${record.image_url}?v=${Date.now()}`;
  new bootstrap.Modal(document.getElementById('historyImageModal')).show();
}

async function showDetail(id) {
  const modalElement = document.getElementById('detailModal');
  const modal = new bootstrap.Modal(modalElement);
  const body = document.getElementById('detailBody');
  body.innerHTML = '加载中...';
  modal.show();
  const data = await fetch(`/api/history/${id}`).then((response) => response.json());
  if (!data.ok) {
    body.innerHTML = '<div class="text-danger">加载失败</div>';
    return;
  }
  const record = data.record;
  activeImageRecord = record;
  const imageHtml = record.has_image
    ? `
      <div class="history-image-stage" id="historyImageStage" title="点击放大查看">
        <img id="historyDetailImage" src="${record.image_url}" alt="检测原图">
        <canvas id="historyDetailCanvas"></canvas>
        <div class="history-image-enlarge-hint">点击图片放大查看</div>
      </div>
    `
    : '<div class="placeholder-panel history-no-image"><strong>该记录没有历史图像</strong><span>旧记录创建时尚未启用图像保存。</span></div>';
  body.innerHTML = `
    <div class="row g-3">
      <div class="col-lg-8">${imageHtml}</div>
      <div class="col-lg-4">
        <div class="history-detail-info">
          <p><b>时间：</b>${escapeHtml(record.time)}</p>
          <p><b>类别：</b>${escapeHtml(displayCategory(record.category))}</p>
          <p><b>数量：</b>${record.count}</p>
          <p><b>操作人：</b>${escapeHtml(record.operator)}</p>
          <p><b>操作类型：</b>${escapeHtml(record.operation_type)}</p>
          <p><b>平均置信度：</b>${(Number(record.confidence || 0) * 100).toFixed(1)}%</p>
          <p><b>检测框数量：</b>${(record.boxes || []).length}</p>
          <p><b>备注：</b>${escapeHtml(record.note || '-')}</p>
        </div>
      </div>
    </div>
  `;
  if (record.has_image) {
    const image = document.getElementById('historyDetailImage');
    const canvas = document.getElementById('historyDetailCanvas');
    image.onload = () => drawHistoryBoxes(image, canvas, record);
    document.getElementById('historyImageStage').onclick = () => openLargeHistoryImage(record);
  }
}

async function removeRecord(id) {
  if (!confirm(`确认删除记录 ID=${id} ?`)) return;
  const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
  const data = await res.json();
  showToast(res.ok ? '记录已删除' : (data.message || '删除失败'), res.ok ? 'warning' : 'danger');
  loadHistory();
}

async function loadHistory() {
  const params = new URLSearchParams(getFilters());
  const res = await fetch(`/api/history?${params.toString()}`);
  const data = await res.json();
  if (!data.ok) return;

  lastTotal = data.total;
  page = data.page;
  tbody.innerHTML = '';
  if (!data.records.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">暂无检测记录，请先进行检测。</td></tr>';
  }

  data.records.forEach((record) => {
    const tr = document.createElement('tr');
    const imageState = record.has_image
      ? '<span class="badge text-bg-success">有图</span>'
      : '<span class="badge text-bg-secondary">无图</span>';
    tr.innerHTML = `<td>${record.id}</td><td>${record.time}</td><td>${escapeHtml(displayCategory(record.category))}</td><td>${record.count}</td><td>${imageState}</td><td>${escapeHtml(record.operator)}</td><td>${escapeHtml(record.operation_type)}</td><td class='d-flex gap-1 flex-wrap'><button class='btn btn-outline-primary uniform-btn btn-sm'>查看</button><button class='btn btn-outline-danger uniform-btn btn-sm'>删除</button></td>`;
    const [detailBtn, deleteBtn] = tr.querySelectorAll('button');
    detailBtn.onclick = () => showDetail(record.id);
    deleteBtn.onclick = () => removeRecord(record.id);
    tbody.appendChild(tr);
  });

  const totalPage = Math.max(1, Math.ceil(lastTotal / pageSize));
  pageInfo.textContent = `共 ${lastTotal} 条，当前第 ${page}/${totalPage} 页，每页 ${pageSize} 条`;
}

document.getElementById('searchBtn').onclick = () => { page = 1; loadHistory(); };
document.getElementById('resetBtn').onclick = () => {
  ['keyword', 'category', 'note', 'startTime', 'endTime'].forEach((id) => (document.getElementById(id).value = ''));
  page = 1;
  loadHistory();
};
document.getElementById('prevPage').onclick = () => { if (page > 1) { page -= 1; loadHistory(); } };
document.getElementById('nextPage').onclick = () => {
  const totalPage = Math.max(1, Math.ceil(lastTotal / pageSize));
  if (page < totalPage) { page += 1; loadHistory(); }
};

document.getElementById('detailModal').addEventListener('shown.bs.modal', () => {
  const image = document.getElementById('historyDetailImage');
  const canvas = document.getElementById('historyDetailCanvas');
  if (image && canvas && activeImageRecord) drawHistoryBoxes(image, canvas, activeImageRecord);
});
document.getElementById('historyImageModal').addEventListener('shown.bs.modal', () => {
  const image = document.getElementById('historyZoomImage');
  if (activeImageRecord) drawHistoryBoxes(image, document.getElementById('historyZoomCanvas'), activeImageRecord);
});
window.addEventListener('resize', () => {
  if (!activeImageRecord) return;
  const detailImage = document.getElementById('historyDetailImage');
  const detailCanvas = document.getElementById('historyDetailCanvas');
  if (detailImage && detailCanvas) drawHistoryBoxes(detailImage, detailCanvas, activeImageRecord);
  const zoomImage = document.getElementById('historyZoomImage');
  const zoomCanvas = document.getElementById('historyZoomCanvas');
  if (zoomImage && zoomCanvas) drawHistoryBoxes(zoomImage, zoomCanvas, activeImageRecord);
});

loadHistory();
document.getElementById('exportCsvBtn').onclick = () => window.open(getExportUrl('csv'));
document.getElementById('exportExcelBtn').onclick = () => window.open(getExportUrl('excel'));
document.getElementById('exportJsonBtn').onclick = () => window.open(getExportUrl('json'));
