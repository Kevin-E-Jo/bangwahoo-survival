"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

// Phaser는 window/canvas에 의존하므로 서버에서 렌더링하지 않는다.
const PhaserGame = dynamic(() => import("./PhaserGame").then((m) => m.PhaserGame), {
  ssr: false,
  loading: () => <p style={{ textAlign: "center" }}>던전 로딩 중...</p>,
});

export function PlayHarness() {
  return (
    <main style={{ maxWidth: 960, margin: "40px auto", fontFamily: "sans-serif" }}>
      <PhaserGame />
      <p style={{ marginTop: 16, textAlign: "center" }}>
        <Link href="/town">마을로 돌아가기</Link>
      </p>
    </main>
  );
}
