"use client";

import { useEffect, useRef } from "react";
import type Phaser from "phaser/dist/phaser.js";

/** BootScene부터 시작하는 Phaser 캔버스 마운트 지점. Next.js와는 세션
 * 쿠키로만 인증을 공유하고, 필요한 데이터는 각 씬이 API로 직접 조회한다
 * (JS 객체를 페이지 → 캔버스로 직접 넘기지 않는다). */
export function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: Phaser.Game | undefined;
    let cancelled = false;

    (async () => {
      const { createGame } = await import("@/game/config");
      if (cancelled || !containerRef.current) return;
      game = createGame(containerRef.current);
    })();

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        maxWidth: 960,
        aspectRatio: "16 / 9",
        margin: "0 auto",
        background: "#F2F3EC",
      }}
    />
  );
}
