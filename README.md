# 정지안의 업무허브

학습(개념→시나리오→채점) · 트러블슈팅 · TODO · 회의록을 담는 개인 허브.
https://jja6312.github.io

```
스택 ────── React + Vite + Tailwind + Zustand (HashRouter)
데이터 ──── blog-db (private repo) — 학습지는 Claude Code가 AUTHORING.md 규격으로 생성
배포 ────── GitHub Actions → GitHub Pages (main push 시 자동)
UI ──────── 도트픽셀 lite: 본문 Pretendard, 액센트 Galmuri11. dark/light 토큰 쌍
단축키 ──── Ctrl+K 팔레트 · d 테마 · c 댓글 · j/k 이동 · g 시퀀스 · ? 가이드
```

## 로드맵

- [x] Phase 1 — 골격 + 디자인 토큰 + 단축키 엔진 + 팔레트 + 다크모드
- [x] Phase 2(일부) — 학습지 뷰(개념 다이어그램·시나리오 채점·Lab 진도·댓글) *(정적 번들)*
- [ ] Phase 2 — blog-db PAT 연동 (comments/attempts/progress commit 동기화)
- [ ] Phase 3 — 복습 모드(간이 SRS) + XP 정산 고도화
- [ ] Phase 4 — 트러블슈팅 검색
- [ ] Phase 5 — TODO 칸반 (dnd-kit)
- [ ] Phase 6 — 연락처 + 회의록
