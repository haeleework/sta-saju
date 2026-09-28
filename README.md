# 사주 서비스 Starter

Agent와 함께 실제 제품 개발 과정을 연습하는 Starter 프로젝트입니다.

## 실행

```sh
npm install
npm run dev
```

실행 후 터미널에 표시된 주소를 브라우저에서 엽니다.

## 주요 문서

- `docs/PRD.md`: 무엇을 왜 만들지 기록합니다.
- `docs/specs/`: 기능이 어떻게 동작해야 하는지 기록합니다.
- `docs/status.md`: 현재 어디까지 진행됐는지 기록합니다.
- `AGENTS.md`: Agent가 작업할 때 따르는 기본 원칙입니다.
- `tests/`: 자동화된 검증을 관리합니다.

이번 기능의 명세는 [계정별 결과 저장](docs/specs/004-account-reading-storage.md), [십성·합충 심화 해석](docs/specs/010-ten-gods-and-pair-relations.md), [성별·대운·세운](docs/specs/011-gender-fortune-cycles.md)에 있습니다. 세 기능을 함께 사용할 때의 흐름과 남은 검증은 [통합 Spec](docs/specs/012-integrated-reading-and-account-storage.md)에 정리했습니다. 매일 운세는 [오늘의 운세 Spec](docs/specs/013-daily-fortune.md)을 따릅니다.

## 오늘의 운세 운영 준비

1. `sta-saju` Supabase 프로젝트에는 `20260928073640_daily_fortune.sql`과 `20260928073911_daily_fortune_source_index.sql`의 변경이 적용됐습니다. 실제 서로 다른 두 계정의 접근 제한과 동시 요청은 아직 확인해야 합니다.
2. Vercel 서버 환경변수에 `SUPABASE_SECRET_KEY`(브라우저에 절대 노출하지 않는 Supabase secret key)와 `CRON_SECRET`(예약 호출 인증값)을 설정합니다. 기존 `GEMINI_API_KEY`와 공개 Supabase URL·publishable key도 필요합니다. 값은 Git에 넣지 않습니다.
3. 프로덕션 배포 뒤 `vercel.json`의 예약 실행과 오전 9시 이후 첫 등록, 하루 30회 상한, 다음 날 본문 정리를 실제로 확인합니다. `CRON_SECRET`이 없으면 예약 경로는 401로 닫힙니다.

기존 `202609230001_create_saju_readings.sql`은 이미 운영 DB에 테이블로 존재하지만 Supabase 마이그레이션 기록에는 없습니다. 나중에 CLI `db push`를 사용하기 전, 기존 파일과 운영 DB의 기록을 먼저 맞춰야 중복 테이블 생성 오류를 피할 수 있습니다.

## 폴더 구조

```text
├── app/                 화면과 페이지
├── lib/saju/            사주 계산 기능
├── docs/
│   ├── PRD.md           제품 목표와 범위
│   ├── status.md        Spec별 진행 상태
│   └── specs/           기능별 요구사항
├── tests/               자동 Test
├── .agents/skills/      반복 작업 Skill
└── AGENTS.md            Agent 작업 원칙
```

이 프로젝트의 AGENTS.md, PRD, Specs, Tests, Status, Skill과 작업 환경을 조합해 Agent가 안정적으로 작업할 수 있는 Harness를 만들어갑니다.

## 작업 흐름

1. 서비스를 실행하고 현재 기능을 직접 확인합니다.
2. Agent와 대화하며 `docs/PRD.md`에 대상 사용자, 해결할 문제와 제품 범위를 작성합니다.
3. 구현할 기능 하나를 정하고 `docs/specs/001-feature-name.md` 형식으로 Spec을 작성합니다.
4. `docs/status.md`에 해당 Spec을 `- [ ]`로 추가합니다.
5. Spec을 기준으로 구현하고 Test와 실제 화면에서 결과를 확인합니다.
6. 구현과 검증이 모두 끝나면 `docs/status.md`의 항목을 `- [x]`로 변경합니다.
7. 다음 기능도 같은 과정을 반복한 뒤 Vercel에 배포하고 배포 주소에서 다시 확인합니다.

한 번에 여러 기능을 구현하지 말고 Spec 하나씩 완료하세요.
