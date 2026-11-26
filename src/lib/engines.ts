/** 비드매트릭스의 세 분석 엔진. 메인·서비스 화면에서 같은 이름과 설명을 쓴다 (상단 메뉴 이름은 그대로) */
export type EngineId = "finder" | "atlas" | "insight";

export interface Engine {
  id: EngineId;
  /** "비드" 다음 글자. 화면에서는 "비드" + 민트색 나머지로 쓴다 */
  tail: string;
  name: string;
  /** 사이트 메뉴의 기능 이름 */
  area: string;
  tagline: string;
  desc: string;
  items: string[];
  href: string;
  cta: string;
}

export const ENGINES: Record<EngineId, Engine> = {
  finder: {
    id: "finder",
    tail: "파인더",
    name: "비드파인더",
    area: "입찰공고 찾기",
    tagline: "참가할 수 있는 공고를 찾습니다",
    desc: "나라장터·공동주택·누리장터 전 업종 공고를 영업일 하루 세 번 받아, 귀사 면허·지역·규모로 참가할 수 있는 공고만 골라 드립니다.",
    items: ["나라장터 공고", "공동주택 입찰공고", "누리장터 공고", "정정·취소 공고", "발주계획", "맞춤 공고 메일"],
    href: "/bids",
    cta: "비드파인더로 공고 찾기",
  },
  atlas: {
    id: "atlas",
    tail: "아틀라스",
    name: "비드아틀라스",
    area: "입찰 분석",
    tagline: "공고와 낙찰 흐름을 분석합니다",
    desc: "공고마다 항목별로 가중 평가해 점수와 등급을 매기고, 10년간의 낙찰 기록으로 발주처·업종·경쟁사의 사정율과 낙찰 흐름을 봅니다.",
    items: ["가능성 점수·등급", "최근 낙찰 결과", "발주처 분석", "업종별 분석", "경쟁사 투찰 성향", "우리 회사 진단"],
    href: "/awards",
    cta: "비드아틀라스로 분석하기",
  },
  insight: {
    id: "insight",
    tail: "인사이트",
    name: "비드인사이트",
    area: "입찰점수 예측",
    tagline: "입찰 점수와 낙찰 가능성을 예측합니다",
    desc: "공고 첨부를 모두 읽어 배점표를 판독하고, 항목별 예상 평가점수와 예상 예정가격, 이 공고의 직전 낙찰을 한 화면에 냅니다.",
    items: ["배점표 판독", "예상 평가점수", "예상 예정가격", "참가 예상 기업", "공동주택·누리장터 입찰 예측"],
    href: "/premium",
    cta: "비드인사이트로 예측하기",
  },
};

export const ENGINE_LIST: Engine[] = [ENGINES.finder, ENGINES.atlas, ENGINES.insight];
