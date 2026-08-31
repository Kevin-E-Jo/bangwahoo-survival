"use client";

import { signOut } from "next-auth/react";
import styles from "./town.module.css";

export function SignOutButton() {
  return (
    <button className={styles.signOut} onClick={() => signOut({ callbackUrl: "/login" })}>
      로그아웃
    </button>
  );
}
