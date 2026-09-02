"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UpgradeType } from "@/lib/game-logic";
import { UpgradePanel, type UpgradeInfo } from "./UpgradePanel";
import { InventoryPanel } from "./InventoryPanel";
import { SignOutButton } from "./SignOutButton";
import { CoinIcon } from "./CoinIcon";
import styles from "./town.module.css";

interface InventoryEntry {
  itemKey: string;
  quantity: number;
}

interface TownProgress {
  currency: number;
  upgrades: Record<UpgradeType, UpgradeInfo>;
  inventory: InventoryEntry[];
}

export function TownScene() {
  const router = useRouter();
  const [progress, setProgress] = useState<TownProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/town/progress");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setLoadError("진행도를 불러오지 못했습니다.");
        return;
      }
      setProgress(await res.json());
    } catch {
      setLoadError("네트워크 오류로 진행도를 불러오지 못했습니다.");
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>방과후 서바이벌</p>
          <h1 className={styles.title}>마을</h1>
        </div>
        <SignOutButton />
      </header>

      {loadError && (
        <div className={styles.errorBanner}>
          {loadError}{" "}
          <button
            onClick={load}
            style={{ marginLeft: 8, textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
          >
            다시 시도
          </button>
        </div>
      )}

      <div className={styles.currencyCard}>
        <span className={styles.currencyIcon}>
          <CoinIcon />
        </span>
        <div>
          <div className={styles.currencyValue}>
            {progress ? progress.currency.toLocaleString("ko-KR") : <span className={styles.skeleton} style={{ display: "inline-block", width: 60, height: 20 }} />}
          </div>
          <div className={styles.currencyLabel}>보유 재화</div>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>무기 정비</h2>
        {progress ? (
          <UpgradePanel upgrades={progress.upgrades} onChanged={load} />
        ) : (
          <div className={styles.upgradeList}>
            {[0, 1].map((i) => (
              <div key={i} className={styles.skeleton} style={{ height: 64 }} />
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>인벤토리</h2>
        {progress ? (
          <InventoryPanel inventory={progress.inventory} onChanged={load} />
        ) : (
          <div className={styles.inventoryGrid}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.skeleton} style={{ height: 84 }} />
            ))}
          </div>
        )}
      </section>

      <button className={styles.runCta} onClick={() => router.push("/play")}>
        런 시작
      </button>
    </div>
  );
}
