"use client";

import { useState } from "react";
import type { UpgradeType } from "@/lib/game-logic";
import { UPGRADE_LABELS } from "./content";
import styles from "./town.module.css";

export interface UpgradeInfo {
  level: number;
  maxLevel: number;
  nextCost: number | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  insufficient_funds: "재화가 부족합니다.",
  max_level_reached: "이미 최대 레벨입니다.",
  conflict_retry: "잠시 후 다시 시도해주세요.",
  unauthorized: "다시 로그인해주세요.",
  invalid_body: "요청이 올바르지 않습니다.",
  internal_error: "서버 오류가 발생했습니다.",
};

export function UpgradePanel({
  upgrades,
  onChanged,
}: {
  upgrades: Record<UpgradeType, UpgradeInfo>;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<UpgradeType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(type: UpgradeType) {
    setPending(type);
    setError(null);
    try {
      const res = await fetch("/api/town/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upgradeType: type }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(ERROR_MESSAGES[body.error] ?? "업그레이드에 실패했습니다.");
        return;
      }
      onChanged();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      {error && <div className={styles.errorBanner}>{error}</div>}
      <div className={styles.upgradeList}>
        {(Object.entries(upgrades) as [UpgradeType, UpgradeInfo][]).map(([type, info]) => {
          const label = UPGRADE_LABELS[type];
          const maxed = info.nextCost === null;
          return (
            <div key={type} className={styles.upgradeCard}>
              <span className={styles.upgradeIcon} aria-hidden>
                {label.icon}
              </span>
              <div className={styles.upgradeInfo}>
                <div className={styles.upgradeName}>{label.name}</div>
                <div className={styles.pips}>
                  {Array.from({ length: info.maxLevel }, (_, i) => (
                    <span key={i} className={`${styles.pip} ${i < info.level ? styles.pipFilled : ""}`} />
                  ))}
                </div>
              </div>
              {maxed ? (
                <span className={styles.upgradeButtonMax}>최대 레벨</span>
              ) : (
                <button
                  className={styles.upgradeButton}
                  disabled={pending === type}
                  onClick={() => buy(type)}
                >
                  {pending === type ? "처리 중…" : `강화 (${info.nextCost})`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
