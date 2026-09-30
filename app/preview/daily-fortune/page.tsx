import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// 예시 입력: 2005-12-23 08:37, 남성 / 기준일 2026-09-30.
// 아래 문장은 계산 단서에 맞춰 작성한 시안이며 Gemini 생성 결과가 아닙니다.
const clues = [
  {
    title: "맡은 일을 작게 나눠보세요",
    why: "예시 사주에서 오늘의 윗글자는 책임과 결단을 살펴보는 역할로 읽힙니다. 올해와 긴 흐름에서도 책임이라는 주제가 겹쳐, 오늘은 ‘무엇을 먼저 마칠지’를 점검하는 관점이 눈에 띕니다.",
    reference: "마감, 부탁, 약속이 여럿 있다면 전부 같은 무게로 받아들이지 않아도 됩니다. 실제로 오늘 끝내야 하는 일과 조정할 수 있는 일을 나누는 데 참고해 보세요.",
    action: "오늘 맡은 일 중 하나를 골라 ‘완료했다고 볼 기준’을 한 문장으로 적어보세요.",
    evidence: "일간 신금(辛)에 대한 오늘 정화(丁)의 십성은 편관입니다. 현재 대운 병술(丙戌)의 천간과 2026년 세운 병오(丙午)에서도 책임을 다루는 오행 관계가 계산됩니다.",
  },
  {
    title: "막힌 일에는 다른 방법을 하나 더",
    why: "오늘의 아랫글자에는 새로운 관점으로 배우고 도움받는 역할이 계산됩니다. 앞의 책임이라는 단서와 함께 보면, 혼자 더 밀어붙이기보다 해결 방법을 바꿔 살펴보는 제안으로 연결할 수 있습니다.",
    reference: "시작하기 어려운 일이나 같은 곳에서 막히는 문제가 있다면, 익숙한 방식만 고집하고 있는지 돌아보세요. 짧은 사례를 찾아보거나 다른 사람의 설명을 듣는 선택에 참고할 수 있습니다.",
    action: "막힌 문제 하나에 대해 평소와 다른 방법을 10분만 시험해보세요.",
    evidence: "오늘 미토(未)의 지장간 본기 기토(己)를 일간 신금(辛)에 대입하면 편인입니다. ‘새로운 관점으로 배우고 도움받는 힘’이라는 기존 계산 기준을 사용했습니다.",
  },
  {
    title: "생각을 구체적인 요청으로 옮겨보세요",
    why: "오늘의 글자와 태어난 사주의 시주 사이에 연결되는 짝이 있습니다. 이 단서를 앞의 두 관점과 이어 보면, 부담이나 아이디어를 마음속에만 두기보다 말과 실행 계획으로 정리해보는 참고점이 됩니다.",
    reference: "누군가와 일을 맞추거나 도움을 구할 때 ‘잘됐으면 좋겠다’는 바람만 말하고 있지는 않은지 살펴보세요. 필요한 도움과 가능한 다음 행동을 함께 설명하는 데 적용해볼 수 있습니다.",
    action: "누군가에게 전할 요청 하나를 ‘필요한 것 + 원하는 시점’으로 적어보세요.",
    evidence: "오늘의 천간 정(丁)과 예시 사주의 시주 천간 임(壬) 사이에 천간합이 계산됩니다. 합이 실제 협력이나 성공을 보장한다는 뜻은 아니며, 연결이라는 전통적 단서를 일상 제안으로 풀었습니다.",
  },
];

export default function DailyFortunePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return <main className="site-shell daily-page daily-clue-preview">
    <p className="eyebrow">구성 시안 · 예시 사주</p>
    <h1>오늘, 어디에<br />마음을 써볼까요?</h1>
    <p className="intro">2026년 9월 30일 · 오늘의 운세</p>
    <p className="prototype-note">예시 사주의 계산 단서에 맞춰 작성한 시안입니다. 내 계정이나 AI 호출을 사용하지 않습니다.</p>
    <div className="fortune-overview">
      <p className="step-kicker">오늘 눈에 띄는 흐름</p>
      <h2>책임은 작게 나누고,<br />방법은 조금 넓혀보세요.</h2>
      <p>책임을 다루는 흐름과 새로운 방법을 받아들이는 단서가 함께 보입니다. 아래 세 가지 중 오늘 내 상황에 맞는 것을 골라 참고해 보세요.</p>
    </div>
    <div className="fortune-clues">
      {clues.map((clue, index) => <article className="fortune-clue" key={clue.title}>
        <div className="fortune-clue-heading"><span>{String(index + 1).padStart(2, "0")}</span><h2>{clue.title}</h2></div>
        <div className="fortune-clue-body">
          <section><h3>왜 주목할 만한가요?</h3><p>{clue.why}</p></section>
          <section><h3>오늘 무엇에 참고할까요?</h3><p>{clue.reference}</p></section>
          <section className="fortune-clue-action"><h3>이렇게 해보세요</h3><p>{clue.action}</p></section>
          <details><summary>계산 근거 자세히 보기</summary><p>{clue.evidence}</p></details>
        </div>
      </article>)}
    </div>
    <p className="fortune-clue-footer">사주 해석은 오늘을 돌아보기 위한 참고입니다. 실제 일정과 상황에 맞춰 골라 활용해 주세요.</p>
  </main>;
}
