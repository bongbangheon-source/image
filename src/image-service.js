export const IMAGE_MODEL = 'gpt-image-2.5-sunburst';
export const OPENAI_TIMEOUT_MS = 180000;
const stylePrompts = {
  caricature: 'Create a playful professional caricature portrait with expressive, tastefully exaggerated facial features, clean ink outlines and rich colors. Keep the person clearly recognizable.',
  animation: 'Transform the photo into an original polished animated film illustration with expressive eyes, clean shapes, soft cel shading and cinematic lighting. Preserve recognizable facial features.',
  poster: 'Create an original cinematic movie poster featuring the person as the main character. Preserve their recognizable facial features. Use dramatic lighting, a cohesive color palette and a striking poster composition. Do not add titles, credits, logos or watermarks.',
  watercolor: 'Repaint the photo as an elegant watercolor portrait with translucent washes, subtle paper texture and delicate brushwork. Preserve the recognizable face and expression.'
};
export const styles = new Set(Object.keys(stylePrompts));
const fail = (message, status) => Object.assign(new Error(message), { status });

function upstreamError(status) {
  if (status === 401) return fail('OpenAI API 키 인증에 실패했어요. 서버의 API 키 설정을 확인해 주세요.', 503);
  if (status === 403) return fail('OpenAI 요청이 허용되지 않았어요. 모델 접근 권한과 조직 인증 상태를 확인해 주세요.', 403);
  if (status === 404) return fail('요청한 이미지 모델을 사용할 수 없어요. OpenAI 프로젝트의 모델 접근 권한을 확인해 주세요.', 503);
  if (status === 429) return fail('OpenAI 사용 한도 또는 요청 제한에 도달했어요. 결제·잔액을 확인하거나 잠시 후 다시 시도해 주세요.', 429);
  if (status === 400 || status === 422) return fail('OpenAI에서 이미지 편집 요청을 처리하지 못했어요. 사진을 바꾸거나 요청 조건을 확인해 주세요.', 400);
  return fail('OpenAI 이미지 서비스에 문제가 있어요. 잠시 후 다시 시도해 주세요.', 502);
}

// Native Node.js fetch + FormData: no SDK or API key is shipped to the browser.
// Injected dependencies allow request-contract tests without paid API calls.
export function createImageTransformer({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return async function ({ buffer, mimeType, style, signal }) {
    if (!styles.has(style)) throw fail('지원하지 않는 스타일이에요.', 400);
    const provider = env.IMAGE_PROVIDER || 'openai';
    if (provider === 'demo') return { buffer, mimeType, mode: 'demo' };
    if (provider !== 'openai') throw fail('서버의 이미지 제공자 설정을 확인해 주세요.', 503);
    const key = env.OPENAI_API_KEY?.trim();
    if (!key) throw fail('서버에 OPENAI_API_KEY가 설정되지 않았어요. .env 파일을 확인해 주세요.', 503);

    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mimeType];
    if (!extension) throw fail('지원하지 않는 이미지 형식이에요.', 415);
    const body = new FormData();
    body.append('model', IMAGE_MODEL);
    body.append('image[]', new Blob([buffer], { type: mimeType }), `original.${extension}`);
    body.append('prompt', `Edit the supplied photograph. Keep the same people, identity, age, skin tone and overall framing. ${stylePrompts[style]} Return a single finished image.`);
    body.append('n', '1');
    body.append('size', '1024x1024');
    body.append('quality', 'medium');
    body.append('output_format', 'jpeg');
    body.append('output_compression', '85');
    const timeout = AbortSignal.timeout(OPENAI_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await fetchImpl('https://api.openai.com/v1/images/edits', {
        method: 'POST', headers: { Authorization: `Bearer ${key}` }, body, signal: requestSignal
      });
      // Never forward upstream bodies: they can include sensitive diagnostic details.
      if (!response.ok) throw upstreamError(response.status);
      const payload = await response.json();
      const encoded = payload.data?.[0]?.b64_json;
      if (typeof encoded !== 'string' || !encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw fail('OpenAI에서 올바른 이미지 결과를 받지 못했어요.', 502);
      const result = Buffer.from(encoded, 'base64');
      if (result.length < 4 || result[0] !== 255 || result[1] !== 216 || result[2] !== 255) throw fail('OpenAI 이미지 결과 형식을 확인할 수 없어요.', 502);
      return { buffer: result, mimeType: 'image/jpeg', mode: 'ai' };
    } catch (error) {
      if (error.status) throw error;
      if (error.name === 'TimeoutError' || timeout.aborted) throw fail('이미지 생성 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.', 504);
      if (requestSignal.aborted) throw fail('이미지 변환 요청이 취소됐어요.', 499);
      throw fail('OpenAI 응답을 받지 못했어요. 서버의 인터넷 연결 상태를 확인해 주세요.', 502);
    }
  };
}

export const transformImage = createImageTransformer();
