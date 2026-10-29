/* Same-origin Express endpoint. Never put an API key here. */
window.MORPH_CONFIG = { endpoint: '/api/transform', timeoutMs: 200000 };
window.MORPH_RESULT_MODE = 'demo';

window.transformImage = async function ({ file, style, signal }) {
  const { endpoint, timeoutMs } = window.MORPH_CONFIG;
  const data = new FormData();
  data.append('image', file);
  data.append('style', style);
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(endpoint, { method: 'POST', body: data, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || (response.status === 413 ? '4MB 이하의 사진을 선택해 주세요.' : '이미지 변환에 실패했어요. 잠시 후 다시 시도해 주세요.'));
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('서버가 올바른 이미지를 반환하지 않았어요.');
  window.MORPH_RESULT_MODE = response.headers.get('X-Morph-Mode') === 'demo' ? 'demo' : 'ai';
  return window.MORPH_RESULT_MODE === 'demo' ? createDemoImage(blob, style) : blob;
};

async function createDemoImage(file, style) {
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d');
    const filters = { caricature: 'saturate(1.65) contrast(1.2)', animation: 'saturate(1.4) contrast(1.05) brightness(1.12)', poster: 'sepia(.45) contrast(1.35) saturate(.8)', watercolor: 'saturate(.75) contrast(.85) brightness(1.15)' };
    ctx.filter = filters[style] || 'none';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
    if (style === 'poster') {
      const gradient = ctx.createLinearGradient(0, canvas.height * .5, 0, canvas.height);
      gradient.addColorStop(0, 'transparent'); gradient.addColorStop(1, '#171327eF');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff3d6'; ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(canvas.width * .065)}px Georgia`;
      ctx.fillText('THE MAIN CHARACTER', canvas.width / 2, canvas.height * .87, canvas.width * .9);
      ctx.font = `${Math.round(canvas.width * .023)}px sans-serif`;
      ctx.fillText('A STORY THAT STARTS WITH YOU', canvas.width / 2, canvas.height * .92);
    }
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('미리보기를 생성하지 못했어요.')), 'image/png'));
  } finally { bitmap.close(); }
}
