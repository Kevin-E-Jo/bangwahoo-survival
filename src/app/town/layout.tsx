import type { ReactNode } from "react";
import { Gaegu, Noto_Sans_KR, IBM_Plex_Mono } from "next/font/google";
import styles from "./town.module.css";

// TownScene 전용 폰트/컬러 토큰. 블루프린트(docs/blueprint.html)의 비주얼
// 아이덴티티(따뜻한 파스텔, Gaegu/Noto Sans KR/IBM Plex Mono)를 이 서브트리
// 안에서만 적용한다 — 사이트 전역 레이아웃(Geist 폰트)은 건드리지 않는다.

const gaegu = Gaegu({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-display" });
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
});
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export default function TownLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.themeRoot} ${gaegu.variable} ${notoSansKr.variable} ${plexMono.variable}`}>
      {children}
    </div>
  );
}
