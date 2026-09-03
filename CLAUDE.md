# 이 worktree에서 작업할 때

이 디렉터리는 `feature/auth-backend` 브랜치 전용 git worktree다. 루트 worktree
(`C:\Users\whdms\Desktop\방과후 서바이벌`, `master` 브랜치)는 건드리지 않는 게
기본 규칙이지만, 아래 문서 갱신 작업 하나는 예외로 미리 승인되어 있다
(사용자가 직접 승인함, 2026-09-03).

## PORTFOLIO.md 갱신 (사전 승인됨)

`C:\Users\whdms\Desktop\방과후 서바이벌\PORTFOLIO.md`는 이 프로젝트 전체를
포트폴리오용으로 정리한 살아있는 문서다(개요/스택/구성/개발 로그). 이 파일은
`master`에만 존재하며, 병렬로 작업하는 다른 세션들과 공유한다.

**의미 있는 변경(기능 추가, 버그 수정, PR 머지 등)을 마칠 때마다**, 아래
절차로 `개발 로그` 섹션에 날짜순으로 한 줄~몇 줄짜리 항목을 추가해줘:

```bash
git -C "C:\Users\whdms\Desktop\방과후 서바이벌" pull origin master
# PORTFOLIO.md의 "## 개발 로그" 섹션 맨 위에 새 항목 추가 (Edit 도구 사용)
git -C "C:\Users\whdms\Desktop\방과후 서바이벌" add PORTFOLIO.md
git -C "C:\Users\whdms\Desktop\방과후 서바이벌" commit -m "Update PORTFOLIO.md: <한 줄 요약>"
git -C "C:\Users\whdms\Desktop\방과후 서바이벌" push origin master
```

- **이 특정 작업(= PORTFOLIO.md 하나만 master에 직접 커밋·푸시하는 것)은
  사용자 승인 없이 진행해도 된다** — 사용자가 이 자동화를 명시적으로
  승인했다. 다른 파일이나 다른 브랜치 작업에는 이 승인이 적용되지 않는다.
- push 전에 반드시 pull부터 해서, 다른 세션이 같은 파일에 먼저 추가한 항목과
  충돌하지 않게 한다. 혹시 충돌하면 두 항목을 모두 살리는 방향으로 병합한다.
- 새 항목 형식은 기존 항목들과 맞춘다: `- **YYYY-MM-DD** — 무엇을 했는지,
  관련 있으면 PR 링크.`
- 구조가 크게 바뀌었으면(새 모듈, 새 API, 기술 스택 변경 등) `기술 스택` 또는
  `프로젝트 구성` 섹션도 같이 업데이트한다.
- 이 worktree 자체의 코드 변경은 지금까지 하던 대로 `feature/auth-backend`에
  커밋하고 PR로 진행한다. 위 절차는 오직 PORTFOLIO.md 갱신에만 해당한다.
