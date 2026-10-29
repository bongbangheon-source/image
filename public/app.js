const $ = id => document.getElementById(id);
let file = null, originalUrl = null, resultUrl = null, resultBlob = null, selectedStyle = 'caricature', busy = false;
const input = $('file-input');
const announce = message => { $('status').textContent = message; };

fetch('/api/health').then(response => response.ok ? response.json() : null).then(health => {
  if (health?.provider !== 'demo') return;
  $('studio-badge').textContent = 'DEMO STUDIO';
  $('privacy-note').textContent = '♧ 데모 모드에서는 서버에서만 사진을 확인해요';
  $('demo-note').textContent = '필터 데모 모드 · 실제 AI 이미지 변환 결과가 아닙니다.';
}).catch(() => {});

function clearResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null; resultBlob = null;
  $('result-image').removeAttribute('src');
  $('result-layer').hidden = true; $('divider').hidden = true;
  $('compare-slider').disabled = true; $('download-button').disabled = true;
  document.querySelector('.label-after').hidden = true;
  $('result-badge').textContent = '원본 사진';
  $('preview-hint').textContent = '스타일을 선택하고 새로운 나를 만들어 보세요';
}

async function loadFile(candidate) {
  if (busy || !candidate) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(candidate.type)) { announce('JPG, PNG, WEBP 이미지 파일을 선택해 주세요.'); return; }
  if (candidate.size > 4 * 1024 * 1024) { announce('4MB 이하의 사진을 선택해 주세요.'); return; }
  let bitmap;
  try { bitmap = await createImageBitmap(candidate); } catch { announce('사진을 읽을 수 없어요. 다른 이미지를 선택해 주세요.'); return; }
  const dimensions = `${bitmap.width} × ${bitmap.height}`;
  bitmap.close();
  if (busy) return;
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  file = candidate; originalUrl = URL.createObjectURL(file);
  clearResult();
  $('original-image').src = originalUrl;
  $('empty-state').hidden = true; $('comparison').hidden = false;
  $('upload-title').textContent = candidate.name;
  $('upload-detail').textContent = `${dimensions} · 클릭해서 사진 바꾸기`;
  $('generate-button').disabled = false;
  announce('사진이 준비됐어요. 원하는 스타일을 선택해 주세요.');
}

input.addEventListener('change', () => { loadFile(input.files[0]); input.value = ''; });
$('dropzone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!busy) input.click(); } });
for (const name of ['dragenter', 'dragover']) $('dropzone').addEventListener(name, event => { event.preventDefault(); $('dropzone').classList.add('dragover'); });
for (const name of ['dragleave', 'drop']) $('dropzone').addEventListener(name, event => { event.preventDefault(); $('dropzone').classList.remove('dragover'); });
$('dropzone').addEventListener('drop', event => loadFile(event.dataTransfer.files[0]));
document.querySelectorAll('.style-option').forEach(button => button.addEventListener('click', () => {
  if (busy || selectedStyle === button.dataset.style) return;
  selectedStyle = button.dataset.style;
  document.querySelectorAll('.style-option').forEach(item => { const selected = item === button; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected)); });
  if (file) clearResult();
}));

$('generate-button').addEventListener('click', async () => {
  if (!file || busy) return;
  busy = true; $('loading').hidden = false; $('canvas-area').setAttribute('aria-busy', 'true');
  $('generate-button').disabled = true; input.disabled = true;
  document.querySelectorAll('.style-option, #sample-button, #empty-sample').forEach(button => button.disabled = true);
  clearResult(); announce('이미지를 변환하고 있어요.');
  try {
    const blob = await window.transformImage({ file, style: selectedStyle });
    const bitmap = await createImageBitmap(blob); bitmap.close();
    resultBlob = blob; resultUrl = URL.createObjectURL(blob);
    $('result-image').src = resultUrl; $('result-layer').hidden = false; $('divider').hidden = false;
    document.querySelector('.label-after').hidden = false;
    $('compare-slider').disabled = false; $('compare-slider').value = 50; updateSlider();
    $('download-button').disabled = false;
    $('result-badge').textContent = window.MORPH_RESULT_MODE === 'ai' ? '변환 완료' : '필터 데모';
    $('preview-hint').textContent = '↔ 슬라이더를 움직여 변화를 확인하세요';
    announce(window.MORPH_RESULT_MODE === 'ai' ? '변환이 완료됐어요.' : '서버 업로드와 필터 미리보기가 완료됐어요. 실제 AI 생성 결과는 아닙니다.');
  } catch (error) {
    announce(error.name === 'TimeoutError' ? '변환 시간이 초과됐어요. 다시 시도해 주세요.' : error instanceof TypeError ? '서버에 연결할 수 없어요. 서버 실행 상태와 인터넷 연결을 확인해 주세요.' : error.message || '이미지 변환에 실패했어요.');
  }
  finally {
    busy = false; $('loading').hidden = true; $('canvas-area').setAttribute('aria-busy', 'false');
    $('generate-button').disabled = false; input.disabled = false;
    document.querySelectorAll('.style-option, #sample-button, #empty-sample').forEach(button => button.disabled = false);
  }
});
function updateSlider() { const value = $('compare-slider').value; $('result-layer').style.clipPath = `inset(0 0 0 ${value}%)`; $('divider').style.left = `${value}%`; }
$('compare-slider').addEventListener('input', updateSlider);
$('download-button').addEventListener('click', () => {
  if (!resultUrl) return;
  const link = document.createElement('a'); link.href = resultUrl;
  const extension = { 'image/jpeg': 'jpg', 'image/webp': 'webp' }[resultBlob.type] || 'png';
  link.download = `morph-${selectedStyle}.${extension}`; document.body.appendChild(link); link.click(); link.remove();
  announce('이미지 다운로드를 시작했어요.');
});
async function loadSample() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="#e4d9f4"/><stop offset="1" stop-color="#c3d8cf"/></linearGradient></defs><path fill="url(#b)" d="M0 0h800v1000H0z"/><circle cx="650" cy="200" r="170" fill="#f7edce" opacity=".6"/><path d="M130 1000V850q0-250 270-250t270 250v150" fill="#77749d"/><path d="M335 580v110q65 70 130 0V580" fill="#e7b398"/><ellipse cx="400" cy="420" rx="170" ry="215" fill="#f4ccb0"/><path d="M230 470Q110 130 400 150Q680 100 570 470l-40-185q-140 90-260 10Z" fill="#423a4c"/><path d="M300 425q25-16 45 0m110 0q25-16 45 0" fill="none" stroke="#423a4c" stroke-width="12" stroke-linecap="round"/><path d="M350 530q50 40 100 0" fill="none" stroke="#b87373" stroke-width="10" stroke-linecap="round"/><circle cx="292" cy="488" r="27" fill="#eaa89e" opacity=".4"/><circle cx="508" cy="488" r="27" fill="#eaa89e" opacity=".4"/><path d="m595 100 15 35 35 15-35 15-15 35-15-35-35-15 35-15Z" fill="white"/></svg>`;
  const sampleUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    // Chrome cannot decode SVG blobs with createImageBitmap directly.
    const image = new Image();
    image.src = sampleUrl;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 1000;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error();
    await loadFile(new File([blob], 'morph-sample.png', { type: 'image/png' }));
  } catch { announce('샘플을 불러오지 못했어요. 사진을 직접 업로드해 주세요.'); }
  finally { URL.revokeObjectURL(sampleUrl); }
}
$('sample-button').addEventListener('click', loadSample); $('empty-sample').addEventListener('click', loadSample);
