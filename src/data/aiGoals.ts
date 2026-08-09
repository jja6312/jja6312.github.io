// AI 추천 목표 — indivisual 학습기록 분석 + 사용자 방향 확정(코테 제외·멀티클라우드 자격증 트랙) 반영.
// 멀티에이전트(자격증 웹조사 2 + 재설계 + 적대검증 2)로 생성(2026-08). 갱신 시 이 파일만 교체.
export interface AiGoals {
  asOf: string
  diagnosis: { summary: string; level: string; strengths: string[]; gaps: string[] }
  longTerm: { horizon: string; headline: string; pillars: { name: string; detail: string }[] }
  midTerm: { horizon: string; headline: string; goals: { title: string; rationale: string; metric: string }[] }
  shortTerm: { horizon: string; headline: string; milestones: { period: string; focus: string; actions: string[]; outcome: string }[] }
}

export const AI_GOALS: AiGoals = {
  "asOf": "2026-08",
  "diagnosis": {
    "summary": "지렛대를 알고리즘 코딩테스트에서 '멀티클라우드 professional 스택 + K8s owning + 관측성 + 영어 + 가시성'으로 전면 재편하되, 타깃 직무를 하나로 확정한다. 주 타깃 = 벤더/컨설팅 pre-sales SA·솔루션 아키텍트(정지안의 16종 자격 넓이·마이그레이션 서사·영어가 그대로 무기이고 알고리즘 시험 없는 최적 정합 경로). 2차 타깃 = 인하우스 플랫폼/SRE이나, 대규모 scale-ops와 leetcode 아닌 실무 코딩/시스템설계 스크리닝이 남은 게이트라 depth 미확보 시 게이트아웃 리스크를 명시한다. 핵심 교정: 진단이 스스로 지목한 공백은 '깊이'인데 SAP·ACE는 또 넓이(paper)이므로, 유일한 depth-building 자격증인 CKA를 축으로 삼고 관측성·AI-DB 실증 각 1건을 2026으로 당겨 '종이 아님' 증거를 만든다. 확실한 값싼 카드(SAP·RHCSA)를 9월 먼저 은행에 넣고, 올해 무리인 GCP PCA·AZ-305는 정직하게 2027 초·조건부로 이연한다.",
    "level": "넓이 상위권 / 깊이 형성기 — 2년차·professional 2종 보유이나 K8s·영어·관측성·scale-ops는 0에 가까운 공백. 17번째 자격증의 한계신호는 첫 프로덕션 OKE 클러스터 1개·유효 영어점수 1개보다 작다",
    "strengths": [
      "OCI Architect Professional·AI Foundations·AI Vector Search Pro + AWS SAA + NCP Pro 등 16종으로 자격증 넓이 자체가 상위권 — 벤더/컨설팅 SA 진입 티켓으로 직접 전환",
      "Linux 중상 — RHCSA·CKA 실기 트러블슈팅(systemd·containerd·crictl·네트워크)에 그대로 득점 전환되는 실무 기반",
      "AWS SAP는 SAA 보유 + '거의 준비됨' 상태로 2주 스프린트면 취득 가능한 4종 중 가장 확실·값싼 확정 카드",
      "AWS→OCI 마이그레이션·삼성증권 HPC 온프렘→OCI PoC·CMP 풀스택 자동화·oci-cli PR#1057 merged 등 설계·구축·OSS 실전 이력",
      "OCI Pro·AWS Pro 설계 근육이 GCP PCA 도메인(IAM/VPC/LB/DR/7R)으로 전이"
    ],
    "gaps": [
      "K8s=0 — 개념만 있고 오브젝트 모델·kubeadm·etcd·NetworkPolicy hands-on 전무. CKA는 4종 중 유일하게 깊이를 만드는 자격증이자 최대 관문",
      "2026 계획이 CKA를 빼면 100% paper — 진단이 지목한 '깊이' 공백을 못 메우고 이미 상위권인 넓이만 두껍게 만들 위험(→ 관측성·AI-DB depth를 2026으로 당겨 방어)",
      "scale-ops=0 — MSP 구조적 한계로 프로덕션 대규모 운영은 인하우스 이직 전엔 해제 불가(chicken-and-egg). 인하우스 플랫폼 타깃은 이 게이트 + leetcode 아닌 실무 코딩/시스템설계 스크리닝 리스크가 상존 → 주 타깃을 벤더/컨설팅 SA로 트는 근거",
      "영어 유효성적 전무(과거 토스 IH 만료) — 글로벌 벤더 SA의 하드 게이트인데 lead-time가 길어 2027 착수는 점프를 통째 지연 → 2026 저강도 착수로 방어",
      "관측성/SLO=0 — Prometheus·Grafana·SLI/SLO 정의 경험 없음",
      "가시성 0 — 기술블로그·발표·referral 미가동으로 실력 대비 외부 시그널 부재",
      "RHCSA는 정보처리기사·리눅스마스터2급·Linux 중상 보유자에게 EX200이 현 레벨 이하라 넓이 신호 기여 낮고 CKA 준비가 그 Linux 실기를 이미 커버 = 가장 skippable 버퍼. 소요도 '1주'가 아니라 2~3주가 정직",
      "GCP PCA는 케이스스터디형 + GCP hands-on 0이라 8~12주 필요 → 올해 무리, 2027 Q1 이연. AZ-305 Expert는 AZ-900만 보유·AZ-104 선행 게이트까지 실질 2관문 + 4번째 클라우드라 로드맵 슬롯 미부여, 조건부로만 잔존"
    ]
  },
  "longTerm": {
    "horizon": "2029 (3년)",
    "headline": "알고리즘 시험 없는 멀티클라우드 SA-아키텍트 — 주 타깃=벤더/컨설팅 pre-sales SA·솔루션 아키텍트(넓이 자산화·영어 지렛대 최대·시험-free 정합), 2차=인하우스 플랫폼(단 실무 코딩스크린·scale-ops 게이트 리스크). professional 3종 넓이를 CKA(유일 depth 자격증)·AI인프라·관측성 깊이와 영어·가시성으로 받쳐 인하우스/벤더 점프",
    "pillars": [
      { "name": "1. 멀티클라우드 professional 3종 포트폴리오 완성", "detail": "OCI Architect Professional(보유) + AWS SAP-C02 + GCP PCA의 professional 3종을 축으로 '어느 클라우드든 설계 판단이 되는 아키텍트' 포지션 확립. 자격증은 깊이 신호가 아니라 벤더-SA 진입 티켓으로 역할을 재정의." },
      { "name": "2. Kubernetes owning (유일한 depth-building 자격증)", "detail": "CKA로 진입 후 CKAD/CKS로 확장. OKE 프로덕션 클러스터를 kubeadm·etcd 백업·RBAC·NetworkPolicy·Ingress/Gateway API·PV/PVC·HPA 수준에서 직접 운영·트러블슈팅하는 owning 역량. 4종 중 유일하게 종이 아닌 깊이를 만드는 자격." },
      { "name": "3. AI 인프라 마이그레이션 스파이크", "detail": "온프렘/타클라우드→OCI 마이그레이션(7R)과 AI-DB(Autonomous DB·Vector Search·Select AI)·HPC를 묶는 스파이크. 삼성증권 HPC PoC·AWS→OCI 경험을 'AI 워크로드 이전 전문' 서사로 확장." },
      { "name": "4. 관측성/SLO·플랫폼 엔지니어링", "detail": "Prometheus·Grafana·OCI Monitoring 기반 SLI/SLO 정의와 알람·대시보드를 설계·운영하는 SRE/플랫폼 역량. MSP식 사후대응을 넘어 신뢰성 설계로 이동." },
      { "name": "5. 영어 + 가시성 → 벤더/컨설팅 SA 점프", "detail": "영어 유효성적 재확보(하드 게이트) + 기술블로그·KOUG 발표·referral로 외부 시그널 축적. scale-ops 구조적 한계를 시험 없는 벤더/컨설팅 SA·아키텍트 이직으로 해제하는 최종 관문." },
      { "name": "6. (조건부) Azure 확장 — 시간 슬롯 미부여", "detail": "타깃 직무 JD가 Azure를 명시 요구하거나 Azure 딜이 배정되는 시점에만 AZ-104(실습형 administration)→AZ-305 순차 진행. 4번째 클라우드 Expert는 이미 가진 3개를 hands-on 깊이로 받치는 것보다 ROI가 낮으므로 트리거형 조건부로만 남긴다." }
    ]
  },
  "midTerm": {
    "horizon": "2027 (1년)",
    "headline": "2026 이연분과 depth를 3앵커(GCP PCA·OKE 프로덕션 운영·영어 유효점수)로 triage하고, 나머지(관측성 확장·AI-DB·OSS·IaC)는 opportunistic으로 강등해 낙관편향을 잘라낸다. 알고리즘 시험 없는 벤더/컨설팅 SA-아키텍트 트랙으로 인하우스 지원. GCP PCA는 2026 무리분을 정직하게 이연한 2027 Q1 항목",
    "goals": [
      { "title": "[앵커] GCP PCA 취득 (2026 이월 마무리, 2027 Q1)", "rationale": "2026 내 ACE까지만 현실적이라 PCA는 2027 Q1으로 정직하게 이연. 케이스스터디형이라 실습 시간이 필요하나 OCI Pro·AWS SAP 설계 근육 전이로 완주 가능. 완주 시 professional 3종 넓이 완성.", "metric": "2027 Q1(1~3월) 취득. 케이스스터디 4종(Altostrat Media·Cymbal Retail·EHR Healthcare·KnightMotives) 사전 숙지 + 모의 2회 80%+. 예상 80~110h" },
      { "title": "[앵커] OKE 프로덕션 운영 owning", "rationale": "CKA로 얻은 개념을 실제 클러스터 운영으로 전환해야 K8s가 이력서 한 줄이 아니라 owning 역량이 된다. 인하우스/벤더 SA 양쪽에서 유일하게 '종이 아님'을 증명하는 depth.", "metric": "사내/고객사 OKE 클러스터 2개+ 운영: etcd 백업 자동화(CronJob+etcdctl snapshot), NetworkPolicy 격리, Ingress+cert(lego) 적용, HPA·requests/limits 설정. 예상 120h" },
      { "title": "[앵커] 영어 유효점수 확보 + 시험 없는 SA/아키텍트 인하우스 지원", "rationale": "영어는 벤더/컨설팅 SA의 정량 하드 게이트이자 lead-time 긴 자산. 2026 저강도 착수를 이어 2027에 유효점수로 확정하고, 알고리즘 시험 없는 채널로 실제 지원해 scale-ops 한계를 해제.", "metric": "영어 유효성적 확보(OPIc IH+ 또는 TOEIC 850+) + 알고리즘 시험 없는 벤더/컨설팅 SA·아키텍트 3곳 지원 + KOUG 발표 1회/referral 가동. 예상 120h(영어 잔여 80h 포함)" },
      { "title": "[opportunistic] 관측성/SLO 스택 확장", "rationale": "2026에 당긴 SLO 1건을 서비스 3종으로 확장. 시간 여유가 있을 때만 진행하는 강등 항목(앵커 3종 우선).", "metric": "Prometheus+Grafana 또는 OCI Monitoring으로 서비스 3종 SLI/SLO 정의·대시보드·알람 룰 구축, 성능레포트 시스템과 연계. 예상 60h" },
      { "title": "[opportunistic] AI-DB 실기능 심화 + IaC 회사 표준 승격", "rationale": "2026 RAG PoC를 심화하고 CMP 풀스택 자동화를 사내 표준으로 승격해 조직 영향력 확보. 앵커 이후 여유분에만 커밋.", "metric": "Autonomous DB·Select AI·Vector Search 심화 PoC 1건 + full-stack+preset 모듈 사내 표준 승격·신규 고객 프로비저닝 2건+ 실적용. 예상 90h" },
      { "title": "[opportunistic] OSS 기능 PR (docstring 넘기)", "rationale": "기여 깊이가 docstring 수준 → 실제 기능/버그픽스 PR로 한 단계 상승. 글로벌 SA 트랙 신뢰 시그널이나 앵커보다 후순위.", "metric": "oci-cli 또는 openstacksdk에 비-docstring 기능/버그픽스 PR 1건 merged. 예상 40h" }
    ]
  },
  "shortTerm": {
    "horizon": "2026-09~12 (약 17주, 주 5h + 영어 1h 기준 · 자격증 스프린트 주간 초과 투입 · 3종 상한)",
    "headline": "확실한 값싼 카드(AWS SAP)·RHCSA를 9월 먼저 은행에 넣고 → 10~11월 CKA(유일 depth 자격증) 취득 → 관측성·AI-DB depth를 2026으로 당긴다. 확정 목표 = RHCSA·CKA·AWS SAP 3종, GCP ACE는 조건부 4번째. GCP PCA·AZ-305는 올해 무리라 정직하게 2027 초·조건부로 이연",
    "milestones": [
      { "period": "2026-09", "focus": "확실한 두 승부를 먼저 은행에 — RHCSA(2~3주 스프린트, skippable 버퍼) + AWS SAP(2주) 병행 + 영어 저강도 착수", "actions": [
        "응시 전 RHEL 버전(9 vs 10)·예약 가능일 사전 확인 후 RHCSA 실기 drill(2~3주): SELinux(semanage fcontext/port·restorecon·setsebool·ls -Z), firewalld(firewall-cmd zone/service/port), LVM(pvcreate·vgcreate·lvextend·xfs_growfs), systemd target·rd.break root 패스워드 재설정, nmcli IPv4/IPv6, /etc/fstab UUID·NFS·autofs, cron/at/systemd timer, dnf repo+flatpak(RHEL10 신규). RHEL10 EX200은 podman/컨테이너 도메인 제외 → 컨테이너 drill 금지, 150분 내 '재부팅 후 persist' 무결점 재현만 반복. RHCSA는 최우선 skippable 버퍼 — CKA 슬립 시 ACE가 아니라 RHCSA를 드롭",
        "AWS SAP-C02 2주 스프린트(거의 준비된 확정 카드): Organizations·Control Tower·SCP·RAM, Transit Gateway·Direct Connect·PrivateLink·Route53 라우팅정책, 7R 마이그레이션(MGN·DMS·DataSync·Snow·Migration Hub), DR(Aurora Global DB·DynamoDB Global Tables·S3 CRR·pilot light/warm standby·RPO/RTO), 교차계정 IAM role·KMS·Secrets Manager·GuardDuty·Security Hub, 비용(Savings Plans·Compute Optimizer). 기출/모의 2회(75문항·180분·750/1000)",
        "영어 저강도 착수(주 1h, lead-time 긴 하드 게이트 조기 확보): OPIc IH+ 또는 TOEIC 850+ 목표로 스피킹/리스닝 루틴 시작. 동시에 향후 2주 실투입 학습시간 로그 1개 실측(판별 실험: 주 실투입 h로 3종/4종 상한 재판정)"
      ], "outcome": "AWS SAP-C02 + RHCSA 두 확정승을 먼저 은행에 확보(professional 2→3단: OCI Pro·AWS Pro) + 영어 착수. CKA 본격 진입 준비" },
      { "period": "2026-10", "focus": "CKA 빌드 착수 — K8s=0에서 오브젝트 모델 기초 + 배점 최대 도메인(Troubleshooting 30%·Cluster Architecture 25%)", "actions": [
        "K8s 기초: kubectl 명령형+선언형, -o yaml --dry-run=client로 매니페스트 생성, Pod/Deployment/ReplicaSet 롤링업데이트·롤백·scale, Service(ClusterIP/NodePort/LoadBalancer), ConfigMap/Secret, kubectl explain/describe/logs/events",
        "Cluster Architecture: kubeadm 클러스터 부트스트랩·노드 join·kubeadm upgrade, static Pod(/etc/kubernetes/manifests), 컨트롤플레인(apiserver·scheduler·controller-manager·etcd), etcdctl snapshot save/restore(거의 매 시험 출제), RBAC(Role/ClusterRole·RoleBinding·ServiceAccount)",
        "Services & Networking: NetworkPolicy, Ingress + Gateway API(신규), CoreDNS, Pod-to-Pod 연결성 / Storage: PV·PVC·StorageClass 동적프로비저닝·accessModes·reclaimPolicy",
        "스케줄링: nodeSelector·node affinity·taint/toleration·requests/limits, Helm(install/upgrade)+Kustomize(overlay, 신규)"
      ], "outcome": "CKA 전 도메인 커버 + K8s 오브젝트 모델 hands-on 기본기 확보. killer.sh 1회차 진입" },
      { "period": "2026-11", "focus": "CKA 취득(유일 depth 자격증) + depth 당김 1 — 관측성/SLO '종이 아님' 증거 1건", "actions": [
        "Troubleshooting drill: node NotReady→systemctl status kubelet, crictl 컨테이너 점검, kubectl debug/top(metrics-server), kubeconfig context 전환. killer.sh 모의 2회차 + kubectl JSONPath·--sort-by 속도훈련 → CKA 응시(합격선 66%, ~17문항, 무료 재응시 1회, 문서 kubernetes.io+Helm+Gateway API 허용·Kustomize 불허)",
        "셀프 모의 판별 실험: SELinux semanage·LVM resize·rd.break를 문서 없이 150분 무결점 재현되는지로 RHCSA 잔여/드롭 최종 확정",
        "관측성/SLO depth 당김(2026 내 '종이 아님' 증거 1건): Prometheus+Grafana 또는 OCI Monitoring으로 서비스 1종 SLI/SLO 정의·대시보드·알람 룰 1건 구축, 기존 성능레포트 시스템과 연계"
      ], "outcome": "CKA 취득 → K8s owning 진입 + professional 3단(AWS 완성). 관측성 depth 첫 실증 1건 확보" },
      { "period": "2026-12", "focus": "depth 당김 2 — AI-DB RAG PoC(블로그화) + GCP ACE 조건부 + 2027 이연 정직 확정", "actions": [
        "AI-DB depth PoC: Autonomous DB + Select AI + Vector Search로 RAG PoC 1건 데모 → 기술블로그 1편화(가시성 겸함). AI Vector Search Pro 자격-실력 갭 해소",
        "GCP ACE 조건부(CKA·SAP가 예정보다 조기 완료된 경우에만 12월 착수, 아니면 2027 Q1 PCA와 묶어 이연): gcloud CLI·Cloud Shell·Console, IAM 사전정의 role·서비스계정·org/folder/project 계층·빌링, Compute Engine·MIG·GKE·Cloud Run, Cloud Storage(스토리지클래스·lifecycle)·Persistent Disk·Cloud SQL, VPC·방화벽·Cloud Load Balancing·Cloud DNS, Cloud Monitoring/Logging·BigQuery 기본(50문항·120분)",
        "2027 이연 정직 확정 — GCP PCA: 케이스스터디형 + GCP hands-on 0이라 8~12주 필요 → 2027 Q1(ACE로 잡은 gcloud 감 위에 착수). AZ-305: AZ-900만 보유·AZ-104 선행 게이트까지 실질 2관문 + 4번째 클라우드라 로드맵 시간 슬롯 미부여, Azure 요구 JD/딜 배정 시 AZ-104부터 조건부로만 진행"
      ], "outcome": "2026 연내 RHCSA·CKA·AWS SAP 3종 확정 + 관측성·AI-DB depth 각 1건(종이 아님 증거) + 영어 착수. GCP ACE는 조건부, GCP PCA·AZ-305는 무리 없이 2027 초·조건부로 정직하게 이연 확정" }
    ]
  },
}
