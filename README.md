# 모바일 청첩장

GitHub Pages에서 정적 호스팅하는 모바일 우선 청첩장입니다. 방문자는 별도 비밀번호를 입력하지 않고 청첩장을 열 수 있으며, 실제 본문과 이미지 데이터는 암호화된 단일 파일로 배포됩니다.

## 현재 화면 구성

본문은 다음 순서로 구성되어 있습니다.

1. 메인 사진과 신랑·신부 이름, 예식 일시 및 장소
2. 상단 섹션 메뉴
3. 우리의 이야기와 양가 가족 소개
4. `WEDDING DAY` 달력 및 실시간 카운트다운
5. 예식장 사진
6. 우리의 시간들 갤러리
7. 오시는 길
8. 마음 전하실 곳
9. 축하 메시지

상단 메뉴는 `Home`, `Story`, `Wedding Day`, `Gallery`, `Location` 순서이며, 메뉴를 누르면 외부 페이지로 이동하지 않고 해당 섹션으로 부드럽게 스크롤합니다. 갤러리를 비활성화하면 갤러리 본문과 상단 메뉴가 함께 숨겨집니다.

## 주요 기능

### 예식 안내

- 2026년 11월 달력과 예식일 강조 표시
- 예식 시각까지 남은 일·시간·분·초 실시간 계산
- 스크롤 진입 시 달력 날짜와 각 섹션에 가벼운 애니메이션 적용
- 시스템의 `prefers-reduced-motion` 설정을 존중하여 모션 최소화 지원

### 갤러리

- 모바일 기준 3열 정사각형 썸네일 배치
- 현재 갤러리 사진 5장 내장
- 사진을 누르면 현재 화면의 최대 80% 크기로 확대
- 확대 시 원본 비율 유지 및 가벼운 페이드·스케일 애니메이션 적용
- `×` 버튼, 바깥 배경, 사진 더블 클릭, `Esc` 키로 닫기
- 모바일 좌우 스와이프 및 PC 방향키로 이전·다음 사진 이동
- 갤러리 이미지의 EXIF 위치·기기 정보 제거

### 오시는 길

- Google Maps 임베드 지도
- 한 줄에 표시되는 지도·내비게이션 앱 아이콘 5개
  - 네이버지도
  - 카카오내비
  - 카카오맵
  - 티맵
  - 구글지도
- 모바일에서 각 앱의 딥링크 실행을 우선 시도하고, 실행할 수 없으면 웹 주소로 전환
- 예식장명·주소와 자동차·지하철·기차·버스 안내 제공

### 계좌 및 축하 메시지

- 신랑 측과 신부 측 계좌 패널을 동시에 열 수 없도록 상호 배타적으로 동작
- 계좌번호 복사 기능 및 안내 토스트 제공
- Firebase 기반 축하 메시지 작성·조회 기능

### 모바일 및 접근성

- 최대 480px 본문 폭을 기준으로 한 모바일 우선 레이아웃
- 모든 주요 이미지의 드래그 방지
- 갤러리 사진에 키보드 포커스와 확대 동작 제공
- 확대 화면에 dialog 역할, 대체 텍스트 및 닫기 버튼 레이블 제공
- 안전 영역(`safe-area-inset`)과 동적 뷰포트 높이(`dvh`) 대응

## 프로젝트 구조

```text
.
├── docs/
│   ├── index.html                 # 암호화 본문을 복호화해 iframe에 표시하는 진입점
│   ├── assets/invitation.enc      # 본문·스타일·스크립트·사진이 포함된 암호화 파일
│   ├── images/og-wedding.png      # 링크 공유용 Open Graph 이미지
│   ├── images/map-icons/          # 지도 앱 아이콘 원본
│   ├── favicon.ico
│   ├── robots.txt
│   └── .nojekyll
└── scripts/                       # 암호화 본문에 변경을 적용한 이력형 Node.js 스크립트
```

`docs/index.html`은 `docs/assets/invitation.enc`를 가져와 브라우저 Web Crypto API로 복호화하고, gzip을 해제한 뒤 `iframe.srcdoc`으로 표시합니다. 배포 저장소에 평문 청첩장 HTML은 두지 않습니다.

> 암호화는 소스의 단순 노출을 줄이기 위한 배포 구조입니다. 브라우저가 최종 화면을 표시해야 하므로 DRM이나 완전한 접근 통제를 제공하는 방식은 아닙니다.

## 로컬 실행

파일을 직접 열면 브라우저의 로컬 파일 보안 정책 때문에 암호화 파일을 가져오지 못할 수 있습니다. 저장소 루트에서 정적 서버로 실행합니다.

```bash
python3 -m http.server 8000 --directory docs
```

브라우저에서 `http://localhost:8000`을 엽니다.

검토할 때는 다음 항목을 함께 확인합니다.

- 320px 안팎의 작은 모바일 화면에서 가로 넘침이 없는지
- 상단 메뉴가 올바른 섹션으로 이동하는지
- 카운트다운 숫자가 매초 갱신되는지
- 갤러리 확대·닫기·스와이프가 동작하는지
- 지도 앱 버튼이 모바일에서 앱 실행을 시도하는지
- 신랑 측·신부 측 계좌 패널이 동시에 열리지 않는지

## 암호화 본문 변경 방법

변경 스크립트는 Node.js 기본 모듈만 사용하며 별도 `npm install`이 필요하지 않습니다. 실행할 때 `INVITATION_PASSPHRASE` 환경 변수가 필요합니다.

```bash
INVITATION_PASSPHRASE='<배포 암호>' \
node scripts/<적용할-스크립트>.js docs/assets/invitation.enc
```

암호는 저장소나 README에 기록하지 않습니다. 스크립트는 다음 과정을 수행합니다.

1. AES-256-GCM 키 유도 및 암호문 복호화
2. gzip 본문 해제
3. 예상 문자열과 블록 개수를 검증한 뒤 HTML·CSS·JavaScript 수정
4. 수정 결과의 필수 문구·순서·개수 검증
5. 새 salt와 IV를 생성해 gzip 및 AES-256-GCM으로 재암호화

대부분의 스크립트는 특정 버전의 정확한 마크업을 대상으로 하는 이력형 마이그레이션입니다. 이미 적용된 스크립트를 무작정 다시 실행하면 중복 적용 대신 오류가 발생하도록 작성되어 있습니다. 최신 상태에서는 새 피드백 전용 스크립트를 추가하거나, 현재 암호화 본문과 대상 문자열을 먼저 확인해야 합니다.

### 갤러리 사진 교체

`replace-v3-gallery-photos.js`는 지정 폴더에서 파일명순으로 JPEG 5장을 읽고 기존 갤러리를 전부 교체합니다. JPEG 화질 데이터는 다시 인코딩하지 않고 EXIF APP1 메타데이터만 제거합니다.

```bash
INVITATION_PASSPHRASE='<배포 암호>' \
node scripts/replace-v3-gallery-photos.js \
  docs/assets/invitation.enc \
  '<JPEG 5장이 있는 폴더>'
```

정확히 5장의 `.jpg` 또는 `.jpeg` 파일이 있어야 합니다.

## 변경 스크립트 분류

| 분류 | 관련 스크립트 | 역할 |
|---|---|---|
| 초기 QA | `apply-qa-feedback.js` | QA 문구, 가족 소개, 교통 안내 등 초기 수정 |
| 지도 | `add-map-links.js`, `enable-mobile-map-apps.js`, `use-provided-map-icons.js`, `inline-map-icons.js` | 지도 서비스 추가, 앱 실행, 아이콘 적용 및 내장 |
| 계좌 | `make-account-panels-exclusive.js` | 신랑·신부 측 패널 중복 열림 방지 |
| 가족 소개 | `update-bride-father-name.js`, `style-family-lines.js`, `remove-chrysanthemum-spacing.js` | 고인 표기와 이름·정렬·간격 수정 |
| 공통 정리 | `apply-common-v2-cleanup.js` | 메뉴 이동 수정, 워터마크와 링크 복사 영역 제거 |
| 애니메이션 | `add-dubai-style-animations.js` | 스크롤 진입, 메인 사진 및 달력 애니메이션 |
| 달력·카운트다운 | `add-v3-date-calendar.js`, `apply-v3-visual-feedback.js`, `apply-v3-calendar-color-feedback.js`, `apply-v3-date-timer-feedback.js`, `restore-original-countdown-layout.js` | WEDDING DAY 달력과 시계 생성 및 피드백 반영 |
| 섹션 구성 | `reorder-v3-wedding-day.js`, `apply-v3-story-gallery-feedback.js` | 이야기·달력·예식장 사진 순서와 문구 정리 |
| 갤러리 | `replace-v3-gallery-photos.js`, `add-gallery-lightbox.js`, `apply-parking-gallery-grid-feedback.js`, `refine-countdown-gallery-lightbox.js`, `limit-gallery-lightbox-size.js` | 사진 교체, 3열 썸네일, 확대·닫기·스와이프와 80% 크기 제한 |
| 오시는 길 | `reorder-map-directions.js`, `update-v3-venue-parking-copy.js` | 지도·앱·예식장·교통 안내 순서와 문구 변경 |

## 검증

스크립트 파일과 Git 변경사항은 다음과 같이 기본 검사할 수 있습니다.

```bash
node --check scripts/<스크립트>.js
git diff --check
git status --short
```

암호화 파일은 일반 텍스트 diff가 불가능하므로, 변경 스크립트 내부 검증과 복호화 후 DOM 순서·필수 문구·이미지 개수·내장 JavaScript 구문 검사를 함께 사용합니다. 바이너리 크기가 크게 증가했을 때는 원본 사진이 중복으로 남았는지도 확인해야 합니다.

## 브랜치 운영

| 브랜치 | 용도 |
|---|---|
| `v1` | 최초 자동 열림 버전 보존 |
| `v2` | QA 수정과 공통 메뉴·화면 정리 버전 보존 |
| `v3` | 달력, 애니메이션, 새 갤러리와 최신 UX 변경 작업 브랜치 |
| `master` | GitHub Pages에 반영하는 배포 기준 브랜치 |

일반적인 반영 흐름은 다음과 같습니다.

```bash
git switch v3
git add <변경 파일>
git commit -m "변경 내용"
git push origin v3

git switch master
git merge --ff-only v3
git push origin master
```

`--ff-only`를 사용하면 master에 예상하지 못한 별도 커밋이 있을 때 병합을 중단하므로 기존 배포 이력을 덮어쓰는 실수를 줄일 수 있습니다. 병합 전에는 `git fetch origin`과 `git merge-base --is-ancestor origin/master v3`로 fast-forward 가능 여부를 확인합니다.

## 배포 및 보안 메모

- GitHub Pages 소스는 `master` 브랜치의 `/docs` 디렉터리를 기준으로 사용합니다.
- `.nojekyll`로 Jekyll 변환 없이 정적 파일을 그대로 제공합니다.
- `robots.txt`, 페이지 메타 태그 및 Open Graph 설정이 포함되어 있습니다.
- 청첩장에는 개인 연락처·계좌·사진이 포함될 수 있으므로 저장소 공개 범위와 공유 링크 대상을 주기적으로 점검해야 합니다.
- 사진을 교체할 때는 위치정보가 포함된 EXIF를 제거합니다.
- Firebase 설정과 읽기·쓰기 규칙은 클라이언트 코드와 별도로 Firebase Console에서도 검토해야 합니다.
- 지도 앱 딥링크는 모바일 OS와 앱 설치 여부에 따라 웹 fallback으로 열릴 수 있습니다.
