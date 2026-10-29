import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { styles, transformImage } from './image-service.js';

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const root = fileURLToPath(new URL('../public/', import.meta.url));
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 1, parts: 2, fieldSize: 100 },
  fileFilter(req, file, callback) {
    callback(allowedTypes.has(file.mimetype) ? null : invalid('JPG, PNG, WEBP 파일만 업로드할 수 있어요.', 415), true);
  }
});

// Do not trust the browser-supplied MIME type or filename.
function detectImageType(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.toString('ascii', 12, 16) === 'IHDR') return 'image/png';
  if (buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (buffer.length >= 16 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function createApp({ transform = transformImage } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.get('/api/health', (req, res) => res.json({ ok: true, provider: process.env.IMAGE_PROVIDER || 'openai', maxUploadBytes: MAX_UPLOAD_BYTES }));
  app.post('/api/transform', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.is('multipart/form-data')) return next(invalid('multipart/form-data 형식으로 전송해 주세요.', 415));
    next();
  }, upload.single('image'), async (req, res) => {
    if (!req.file) throw invalid('이미지 파일을 첨부해 주세요.');
    const style = req.body?.style;
    if (typeof style !== 'string' || !styles.has(style)) throw invalid('올바른 변환 스타일을 선택해 주세요.');
    const mimeType = detectImageType(req.file.buffer);
    if (!mimeType || mimeType !== req.file.mimetype) throw invalid('이미지 내용과 파일 형식을 확인해 주세요.', 415);
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    let result;
    try { result = await transform({ buffer: req.file.buffer, mimeType, style, signal: controller.signal }); }
    finally { res.off('close', onClose); }
    if (!Buffer.isBuffer(result.buffer) || !allowedTypes.has(result.mimeType)) throw new Error('Invalid provider response');
    if (result.buffer.length > MAX_UPLOAD_BYTES) throw invalid('결과 이미지가 너무 커요. 더 작은 크기로 다시 시도해 주세요.', 413);
    res.set('X-Morph-Mode', result.mode === 'demo' ? 'demo' : 'ai');
    res.type(result.mimeType).send(result.buffer);
  });
  // Explicit allowlist prevents serving .env, server source, or dependencies.
  for (const [route, filename] of Object.entries({ '/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/api.js': 'api.js', '/app.js': 'app.js' })) {
    app.get(route, (req, res) => res.sendFile(filename, { root }));
  }
  app.use((req, res) => res.status(404).json({ error: '요청한 경로를 찾을 수 없어요.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? '4MB 이하의 사진을 선택해 주세요.' : '이미지 한 장과 스타일 한 개만 전송해 주세요.' });
    }
    const status = error.status >= 400 && error.status <= 599 ? error.status : 500;
    res.status(status).json({ error: status === 500 ? '서버에서 이미지를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' : error.message });
  });
  return app;
}

// Vercel's Express entrypoint: import without opening a local listener.
export default createApp();
