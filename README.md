# Morph Studio

사진을 캐리커처·애니메이션·영화 포스터·수채화로 변환하는 웹 앱입니다. 원본과 결과 비교, 이미지 다운로드, 로딩 및 오류 안내를 제공합니다.

- 프론트엔드: HTML, CSS, JavaScript
- 백엔드: Node.js 22 이상, Express, Multer
- 이미지 편집: OpenAI `gpt-image-2.5-sunburst`

## 로컬 실행

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

기존 `.env`가 있으면 복사 명령을 생략하세요. 파일에 `OPENAI_API_KEY`를 입력하고 저장한 뒤 **http://localhost:3000**을 엽니다. 실제 키는 서버에서만 읽습니다. 키를 README나 소스에 넣지 마세요.

`IMAGE_PROVIDER=openai`는 실제 유료 이미지 편집을 호출합니다. 비용 없이 체험하려면 `.env`에서 `IMAGE_PROVIDER=demo`로 설정하세요. 설정 변경 후 서버를 재시작합니다. 일반 실행은 `npm.cmd start`, 종료는 Ctrl+C입니다. macOS/Linux에서는 npm과 `cp .env.example .env`를 사용합니다.

## 프로젝트 구조

```text
public/                 HTML·CSS·브라우저 JavaScript
src/index.js            Express 앱 및 Vercel 진입점
src/image-service.js    서버 전용 OpenAI 호출·스타일 프롬프트
scripts/serve.mjs       로컬 서버 실행
scripts/browser-check.mjs  Chrome 브라우저 테스트
tests/                  자동 테스트
.env.example            비밀 값 없는 환경 변수 예시
vercel.json             함수 실행 시간 설정
```

`POST /api/transform`은 multipart 필드 `image`(JPG·PNG·WEBP, 최대 4MiB)와 `style`(caricature / animation / poster / watercolor)을 받습니다. 결과는 JPEG 바이너리입니다. `GET /api/health`는 서버 상태를 반환합니다. 데모 모드에서는 원본 응답에 브라우저 필터를 적용합니다.

## 테스트

```powershell
npm.cmd test
npm.cmd run test:browser
```

브라우저 테스트는 설치된 Google Chrome을 사용합니다. 테스트는 실제 OpenAI 요청 없이 실행합니다. 로컬 테스트 기록은 [TEST-RESULTS.md](TEST-RESULTS.md)를 참고하세요.

## GitHub 업로드

`.env`, `node_modules/`, 개인 IDE 설정과 테스트 결과 파일은 Git에서 제외합니다. `.env.example`과 `package-lock.json`은 포함합니다.

1. [GitHub 새 저장소](https://github.com/new)에서 `morph-studio` 등의 이름으로 Repository를 만드세요. Private을 권장합니다. README, .gitignore, License 자동 생성 옵션은 선택하지 마세요.
2. 프로젝트 터미널에서 실행하세요. 로컬 Git 초기화·커밋이 이미 되어 있다면 해당 줄은 생략합니다.

```powershell
git init -b main
git add .
git diff --cached --name-only
git commit -m "feat: prepare Morph Studio for deployment"
git remote add origin https://github.com/YOUR_USERNAME/morph-studio.git
git push -u origin main
```

YOUR_USERNAME과 저장소 이름을 실제 값으로 바꾸세요. 푸시 시 Git Credential Manager의 브라우저 로그인 또는 권한 승인이 나타나면 본인 계정으로 완료합니다. GitHub 계정 비밀번호를 Git 비밀번호로 사용하지 마세요. 원격 주소 확인은 `git remote -v`, 비밀 파일 제외 확인은 `git check-ignore .env node_modules/`입니다.

## Vercel 배포

1. Vercel에서 GitHub 저장소를 Import합니다. Root Directory는 프로젝트 루트, Framework Preset은 Express로 선택하거나 자동 감지합니다.
2. 정적 Output Directory와 별도 Build Command는 지정하지 않습니다. `src/index.js`가 앱을 export하고 `public/`이 화면 파일을 제공합니다.
3. Node.js 22 이상을 선택합니다. 프로젝트 Environment Variables에 `IMAGE_PROVIDER=openai`, `OPENAI_API_KEY`를 등록한 뒤 배포합니다. 무료 데모 배포는 `IMAGE_PROVIDER=demo`로 설정합니다. 로컬 `.env`는 배포하지 않습니다.
4. 배포 후 `/api/health`, 업로드·변환·다운로드를 확인하세요.

`vercel.json`은 함수 실행 제한을 200초로 설정합니다. 서버 OpenAI 제한은 180초이며 프로젝트 플랜에서 이 시간을 허용해야 합니다. Vercel Functions의 요청·응답 4.5MB 제한을 고려해 앱은 각각 4MiB로 제한합니다. 더 큰 파일은 객체 저장소와 결과 URL 방식으로 확장해야 합니다.

공개 AI 서비스 전에는 인증·사용자별 요청 제한을 추가하세요. 업로드는 서버 메모리에서 처리하며 실제 AI 모드에서는 OpenAI로 전송됩니다. 현재 서버 검증은 MIME·시그니처 기반으로, 전체 디코딩과 픽셀 수 검증은 추가 과제입니다.

문서: [Vercel Express](https://vercel.com/docs/frameworks/backend/express), [함수 설정](https://vercel.com/docs/project-configuration/vercel-json), [OpenAI 이미지 편집](https://developers.openai.com/api/reference/resources/images/methods/edit).
