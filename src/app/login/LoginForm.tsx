"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/town";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  return (
    <>
      <button
        onClick={() => {
          if (googlePending) return;
          setGooglePending(true);
          signIn("google", { callbackUrl });
        }}
        disabled={googlePending}
        style={{
          width: "100%",
          padding: 12,
          marginTop: 16,
          cursor: googlePending ? "default" : "pointer",
          opacity: googlePending ? 0.6 : 1,
        }}
      >
        {googlePending ? "이동 중..." : "Google로 로그인"}
      </button>

      <hr style={{ margin: "24px 0" }} />

      {sent ? (
        <p>{email}로 로그인 링크를 보냈습니다. 메일함을 확인하세요.</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await signIn("email", { email, callbackUrl, redirect: false });
            setSent(true);
          }}
        >
          <input
            type="email"
            required
            placeholder="이메일 주소"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
          />
          <button type="submit" style={{ width: "100%", padding: 12, marginTop: 8, cursor: "pointer" }}>
            매직링크로 로그인
          </button>
        </form>
      )}
    </>
  );
}
