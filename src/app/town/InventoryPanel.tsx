"use client";

import { useState } from "react";
import { TIER_SELL_PRICE } from "@/lib/game-logic";
import { itemLabel, TIER_LABELS } from "./content";
import styles from "./town.module.css";

interface InventoryEntry {
  itemKey: string;
  quantity: number;
}

const TIER_CLASS = {
  common: "tierCommon",
  uncommon: "tierUncommon",
  rare: "tierRare",
  legend: "tierLegend",
} as const;

const ERROR_MESSAGES: Record<string, string> = {
  insufficient_quantity: "보유 수량이 부족합니다.",
  unauthorized: "다시 로그인해주세요.",
  invalid_body: "요청이 올바르지 않습니다.",
  internal_error: "서버 오류가 발생했습니다.",
};

export function InventoryPanel({
  inventory,
  onChanged,
}: {
  inventory: InventoryEntry[];
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sell(itemKey: string, quantity: number) {
    setPending(itemKey);
    setError(null);
    try {
      const res = await fetch("/api/town/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey, quantity }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(ERROR_MESSAGES[body.error] ?? "판매에 실패했습니다.");
        return;
      }
      onChanged();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setPending(null);
    }
  }

  if (inventory.length === 0) {
    return <p className={styles.emptyState}>보유한 파츠가 없습니다. 던전에서 파밍해오세요.</p>;
  }

  return (
    <div>
      {error && <div className={styles.errorBanner}>{error}</div>}
      <div className={styles.inventoryGrid}>
        {inventory.map((item) => {
          const label = itemLabel(item.itemKey);
          // 카탈로그가 바뀌어 더 이상 존재하지 않는 itemKey(예: 이전 시즌
          // 드롭)가 DB에 남아있을 수 있으므로, itemLabel의 폴백 tier로
          // 안전하게 가격을 계산한다 — 알 수 없는 키에 대해 예외를 던지는
          // game-logic의 itemSellPrice(key)를 직접 쓰지 않는다.
          const unitPrice = TIER_SELL_PRICE[label.tier];
          const total = unitPrice * item.quantity;
          return (
            <div key={item.itemKey} className={`${styles.inventoryItem} ${styles[TIER_CLASS[label.tier]]}`}>
              <div className={styles.inventoryIcon} aria-hidden>
                {label.icon}
              </div>
              <div className={styles.inventoryName}>{label.name}</div>
              <div className={styles.inventoryQty}>×{item.quantity}</div>
              <button
                className={styles.sellButton}
                disabled={pending === item.itemKey}
                onClick={() => sell(item.itemKey, item.quantity)}
                title={`${TIER_LABELS[label.tier]} · 개당 ${unitPrice}원`}
              >
                {pending === item.itemKey ? "판매 중…" : `판매 (${total})`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
