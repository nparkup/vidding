/**
 * 공고 업종 분류 (공고 검색 업종 타일과 같은 21개 업종). 공고 수집(nara/client)과 낙찰 수집(scripts/awards/collect.ts)이 같이 쓴다.
 * 이 파일은 서버 전용 모듈을 쓰지 않는다.
 */
import type { BizType, ServiceCategory } from "./types";
import { splitLicenses } from "./licenses";
import { CATEGORY_KEYWORDS } from "./nara/endpoints";

/** 공고명이 IT·교육·임차 등 다른 업종인데 키워드만 겹치는 경우를 거른다 */
const EXCLUDE = [
  "시스템", "솔루션", "플랫폼", "소프트웨어", "홈페이지", "전산", "네트워크", "클라우드", "데이터", "펌웨어", "레이더", "정보통신",
  "감리", "설계", "건설사업관리", "시뮬레이션", "개발", "연구", "컨설팅",
  "임차", "리스", "폐기물", "폐토사", "분뇨", "하수처리시설 청소", "세탁", "운송", "운반", "통학버스",
  "교육", "캠프", "교류", "연수", "탐방", "모니터링", "건강검진", "홍보", "축제 운영", "행사", "취사",
  "안전점검", "진단", "관제", "상수관망", "관측망", "바다숲", "스케이트장", "하천환경정비", "검색기", "정보보안", "보안합숙", "보안운송",
];
/** '유지관리'처럼 넓은 키워드일 때 투찰가능업종으로 한 번 더 확인 */
const FACILITY_LICENSE_HINT = ["건물위생", "소독", "시설경비", "경비업", "기계설비", "소방시설", "전기공사", "저수조", "조경", "근로자파견", "청소"];
const STRONG = ["청소", "미화", "경비", "방역", "소독", "해충방제", "시설관리", "시설물 관리", "시설물관리"];

/** 청소·시설관리 계열 용역인지 판별 (아니면 null) */
export function classifyFacility(rawTitle: string, licenseText = ""): ServiceCategory | null {
  // '청소년'의 '청소'를 청소 용역으로 오인하지 않도록 제거
  const title = rawTitle.replace(/청소년/g, "");
  if (EXCLUDE.some((k) => title.includes(k))) return null;
  const has = (c: ServiceCategory) => CATEGORY_KEYWORDS[c].some((k) => title.includes(k));
  const kinds = (["청소", "경비", "시설관리"] as ServiceCategory[]).filter(has);
  let cat: ServiceCategory | null = null;
  if (has("통합관리") || kinds.length >= 2) cat = "통합관리";
  else if (has("방역·소독")) cat = "방역·소독";
  else if (has("경비")) cat = "경비";
  else if (has("청소")) cat = "청소";
  else if (has("시설관리")) cat = "시설관리";
  if (!cat) return null;
  const strong = STRONG.some((k) => title.includes(k));
  const licenseOk = FACILITY_LICENSE_HINT.some((k) => licenseText.includes(k));
  if (!strong && !licenseOk) return null;
  return cat;
}


/* ---------- 전 업종 분류 ---------- */
type Rule = [ServiceCategory, RegExp];
/** 투찰가능업종 → 업종 (먼저 나오는 업종이 대표) */
const LICENSE_RULES: Rule[] = [
  ["IT·소프트웨어", /소프트웨어|컴퓨터관련/],
  ["설계·감리·엔지니어링", /엔지니어링|감리|건축사|건설사업관리|측량|안전진단|기술사사무소|환경영향평가|문화재|매장유산/],
  ["연구·조사·컨설팅", /학술|연구용역|경영컨설팅/],
  ["폐기물·환경", /폐기물|석면|재활용|하수|분뇨|오수/],
  ["행사·홍보·교육", /행사|방송|영상|비디오|광고|인쇄|출판|공연|디자인/],
  ["운송·여행·임차", /여행|운송|화물|여객|시설대여|자동차대여|이사/],
  ["조경·산림", /조경|산림|숲|나무병원|식물보호/],
  ["소방·기계설비공사", /소방시설공사|기계설비|가스공사|냉동냉장|보일러/],
  ["전기·통신공사", /전기공사|정보통신공사|전기|통신/],
  ["건축·토목공사", /공사업|건설업|해체|철거/],
  ["의료·의약품", /의료기기|의약품|약국|의료/],
  ["식자재·급식", /식품|급식|농산물|축산물|수산물|양곡/],
];
/** 공고명 → 업종 */
const TITLE_RULES: Rule[] = [
  ["IT·소프트웨어", /시스템|소프트웨어|S\/W|SW|전산|정보화|홈페이지|플랫폼|클라우드|데이터|네트워크|디지털|AI|앱|서버|보안관제|웹/],
  ["설계·감리·엔지니어링", /설계|감리|건설사업관리|측량|안전진단|안전점검|정밀점검|내진|타당성|환경영향|지질|시굴|발굴/],
  ["연구·조사·컨설팅", /연구|조사|컨설팅|수립|계획|분석|평가|진단|검사|자문|기본구상/],
  ["폐기물·환경", /폐기물|폐자재|수거|재활용|석면|수질|대기|토양|하수|분뇨|준설|쓰레기/],
  ["행사·홍보·교육", /행사|축제|홍보|교육|캠프|프로그램|체험|공연|전시|유튜브|영상|광고|디자인|인쇄|제작|SNS|콘텐츠/],
  ["운송·여행·임차", /여행|수학여행|임차|리스|운송|운반|이전|이사|통학|차량|버스|셔틀/],
  ["조경·산림", /조경|숲가꾸기|가로수|산림|사방|방제|가지치기|벌채|녹지|재선충|수목/],
  ["소방·기계설비공사", /소방|기계설비|냉난방|환기|공조|배관|보일러|승강기|가스/],
  ["전기·통신공사", /전기|통신|CCTV|가로등|조명|태양광|변압|수배전/],
  ["의료·의약품", /의약품|의료|진료재료|주사|inj|mg|제세동|백신|치료/i],
  ["식자재·급식", /식재료|식자재|급식|부식|우유|쌀|간식|도시락/],
  ["컴퓨터·전산장비", /노트북|컴퓨터|PC|서버|모니터|태블릿|프린터|복합기|스토리지|네트워크 장비|전산장비/i],
];

const CATS_BY_BIZ: Record<"용역" | "공사" | "물품", ServiceCategory[]> = {
  용역: ["IT·소프트웨어", "설계·감리·엔지니어링", "연구·조사·컨설팅", "폐기물·환경", "행사·홍보·교육", "운송·여행·임차"],
  공사: ["전기·통신공사", "소방·기계설비공사", "조경·산림", "건축·토목공사"],
  물품: ["의료·의약품", "식자재·급식", "컴퓨터·전산장비"],
};
const FALLBACK: Record<"용역" | "공사" | "물품", ServiceCategory> = { 용역: "기타 용역", 공사: "건축·토목공사", 물품: "기타 물품" };

/**
 * 모든 공고를 업종으로 분류한다.
 * 용역은 청소·시설관리 판별을 먼저 하고, 나머지는 투찰가능업종 → 공고명 키워드 순으로 본다.
 */
export function classify(rawTitle: string, licenseText = "", biz: BizType = "용역"): ServiceCategory {
  const kind = biz === "외자" ? "물품" : biz;
  if (kind === "용역") {
    const f = classifyFacility(rawTitle, licenseText);
    if (f) return f;
  }
  if (kind === "물품" && /관급/.test(rawTitle)) return "관급자재";
  const allowed = CATS_BY_BIZ[kind];
  for (const lic of splitLicenses(licenseText)) {
    const hit = LICENSE_RULES.find(([c, re]) => allowed.includes(c) && re.test(lic));
    if (hit) return hit[0];
  }
  // '청소년'의 청소, '창조경제'의 조경처럼 다른 단어 속 키워드는 지운다
  const title = rawTitle.replace(/청소년|창조경제/g, "");
  const t = TITLE_RULES.find(([c, re]) => allowed.includes(c) && re.test(title));
  return t ? t[0] : FALLBACK[kind];
}
