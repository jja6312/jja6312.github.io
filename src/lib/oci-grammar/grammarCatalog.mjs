// OCI 가 제공하는 쿼리/표현 "언어" 카탈로그(참조 지식 = 코드). 사용자 저장 스니펫은 blog-db.
// 콘텐츠는 공식문서 WebFetch 로 검증(2026-08 리서치 워크플로우). docUrl 은 fetch 성공분만.
// 정확도 원칙: verified=true 는 공식문서 본문 확인분. 미확인은 skeleton/examples 를 비운다.

/** @type {import('./grammarCatalog.d.mts').GrammarLang[]} */
export const GRAMMAR_LANGS = [
  {
    id: 'resource-search',
    label: '리소스 검색 (Search)',
    service: 'Resource Search',
    purpose: '테넌시 전 자원을 타입·태그·조건으로 찾는 선언형 질의',
    group: '핵심 (자주 씀)',
    runCli: 'oci search resource structured-search --query-text \'<질의>\'',
    docUrl: 'https://docs.oracle.com/en-us/iaas/Content/Search/Concepts/querysyntax.htm',
    skeleton: "query <type[, type...]> resources\n[return <field>|allAdditionalFields]\n[matching '<keywords>']\n[where <conditions>]\n[sorted by <field> asc|desc]",
    clauses: [
      'query <타입,...> resources — 검색 대상 타입 (전체는 all, 콤마로 다중)',
      '비교: = (대소문자 무시) · != · == (엄격) · !== · =~ (부분포함) · > >= < <=',
      '논리: && (AND) · || (OR) · IN (\'a\',\'b\',…) · 우선순위는 괄호 ()',
      'definedTags.namespace / .key / .value · freeformTags.key / .value · systemTags.*',
      "matching '<키워드>' — 구조화 질의 안의 free text 매칭",
      'sorted by <필드> asc|desc — 미지정 시 timeCreated desc 기본',
    ],
    examples: [
      "query instance, bootvolume, volume, bootvolumebackup, volumebackup, loadbalancer, mysqldbsystem, bucket, oceinstance resources\nwhere definedTags.namespace != 'GSIS'\n&& definedTags.namespace != 'SOTA'\n&& definedTags.namespace != 'mHME'\nsorted by timeCreated DESC",
      'query all resources sorted by timeCreated desc',
      "query all resources where (freeformTags.key = 'costcenter' && freeformTags.value = '1234')",
    ],
    verified: true,
  },
  {
    id: 'mql',
    label: '모니터링 쿼리 (MQL)',
    service: 'Monitoring',
    purpose: '메트릭 집계·알람 조건 표현식',
    group: '핵심 (자주 씀)',
    docUrl: 'https://docs.oracle.com/en-us/iaas/Content/Monitoring/Reference/mql.htm',
    skeleton: 'metricName[interval]{dimension = "value"}.groupingFunction().statistic() 비교연산자 threshold',
    clauses: [
      'metricName[interval] — 메트릭 + 집계창 (예: [1m] [5m] [1h] [1d])',
      '{dimension = "value"} — 차원 필터 (=~ 로 와일드카드 * · OR |)',
      'groupBy(dimension) / grouping() — 차원별 분할',
      '통계: mean·avg · sum · count · max · min · rate · percentile(p) · first · last · increment · absent(n)',
      '알람 비교: > >= < <= == != · in/not in (범위) · =~ (퍼지)',
      '산술 + - * / % 로 값 변환 (예: 100 - …mean())',
    ],
    examples: [
      'CpuUtilization[1m].mean() > 80',
      'CpuUtilization[1m]{availabilityDomain = "VeBZ:PHX-AD-1"}.groupBy(poolId).percentile(0.9) > 85',
      'CpuUtilization[1m]{resourceId = "<ocid>"}.groupBy(resourceId).absent(20)',
    ],
    verified: true,
  },
  {
    id: 'logging-search',
    label: '로깅 검색 (Search Logs)',
    service: 'Logging',
    purpose: 'Logging 에 저장된 audit·service·custom 로그 검색 (파이프 문법)',
    group: '핵심 (자주 씀)',
    runCli: 'oci logging-search search-logs',
    docUrl: 'https://docs.oracle.com/en-us/iaas/Content/Logging/Reference/query_language_specification.htm',
    skeleton: 'search "<compartmentOCID>[/<logGroup>[/<log>]]"\n| where <field> <op> <value> [and|or …]\n| summarize <aggFn>(<field>) as <alias> by <field>, rounddown(datetime, \'1m\') as timestamp\n| sort by <field> desc\n| top <N> by <field>',
    clauses: [
      'search "<OCID경로>" — 검색 범위(구획/로그그룹/로그). 반드시 맨 앞, 콤마로 다중',
      '| where <불린식> — = != > >= < <=, and/or/not(). where 키워드 생략 가능',
      "logContent = '*ERROR*' — 전체 본문 와일드카드 · contains_ci/contains_cs()",
      "| summarize <fn>(field) as alias by … — count/sum/avg/min/max, rounddown(datetime,'1m')",
      '| sort by · | top N by · | dedup · | select · | extend · | count',
      '필드 dot notation: data.message, data.request.URL',
    ],
    examples: [
      'search "application" | where level = \'ERROR\'',
      "search \"application\" | summarize count(impact) as impact by level, rounddown(datetime, '1m') as timestamp",
    ],
    verified: true,
  },
  {
    id: 'logging-analytics',
    label: '로깅 애널리틱스',
    service: 'Logging Analytics',
    purpose: '인덱싱된 로그를 분석 (Splunk SPL 유사 커맨드 파이프) — Logging Search 와 별개 서비스',
    group: '관측·분석',
    docUrl: 'https://docs.oracle.com/en-us/iaas/logging-analytics/doc/command-reference.html',
    skeleton: "* | '<field>' = '<value>'\n| where <expr>\n| link <field>[, <field>]\n| stats <fn>(<field>) as <alias> [by <field>]\n| eval <newField> = <expr>\n| sort <field> | head <N> | fields <field> | rename <old> as <new>",
    clauses: [
      "시작: * (전체) 또는 필드필터 'Log Source' = '…' · Severity = fatal",
      '| where <불린식> — regex 커맨드로 정규식 필터도',
      '| stats <fn>(field) as alias by … — count/sum/avg/distinctcount/values/earliest/latest/stddev/trend',
      '| link <field> — 로그를 상위 트랜잭션으로 그룹화 (이 언어의 핵심 기능)',
      '| eval <field> = <expr> — 계산 필드 (if(), unit(), substr() …)',
      '| timestats · eventstats · geostats · cluster · classify (ML)',
    ],
    examples: [
      '* | stats count by Severity',
      "'Log Source' = 'SAR CPU Logs' | rename Instance as CPU | link 'Host Name (Server)', CPU | stats avg('CPU Idle Time (%)') as 'CPU Idle Time (%)' | eval 'Load %' = 100 - 'CPU Idle Time (%)'",
    ],
    verified: true,
  },
  {
    id: 'apm-trace',
    label: 'APM Trace Explorer',
    service: 'Application Performance Monitoring',
    purpose: '분산 트레이스·스팬 조회 (SHOW 질의)',
    group: '관측·분석',
    docUrl: 'https://docs.oracle.com/en-us/iaas/application-performance-monitoring/doc/work-queries-trace-explorer.html',
    skeleton: 'SHOW (TRACES | SPANS) <dimension | 집계함수> [as "별칭"], …\n[WHERE <필터> [AND|OR …]]\n[GROUP BY <dimension>, …]\n[HAVING <집계식>]\n[ORDER BY <dimension> asc|desc]\n[FIRST <n> ROWS]\n[TIMESERIES [<n> minutes]]\n[BETWEEN <시간> AND <시간>]',
    clauses: [
      'SHOW (TRACES|SPANS) — 필수. 나머지 절은 선택',
      'dimension·집계함수 min()/max()/sum()/avg()/count(*) [as "별칭"]',
      'WHERE / GROUP BY / HAVING / ORDER BY / FIRST n ROWS',
      'TIMESERIES — 시계열, BETWEEN … AND … — 시간창',
    ],
    examples: [
      'show (traces) sum(PageResponseTime) as "Total Response Time", count(*) as "Traces"',
    ],
    verified: true,
  },
  {
    id: 'events-pattern',
    label: '이벤트 규칙 조건',
    service: 'Events',
    purpose: '이벤트 규칙의 매칭 조건 (JSON 패턴 — 정확일치·와일드카드·배열 3종만)',
    group: '관측·분석',
    docUrl: 'https://docs.oracle.com/en-us/iaas/Content/Events/Concepts/filterevents.htm',
    skeleton: '{\n  "eventType": "<type>" | ["<type1>", "<type2>"],\n  "data": {\n    "<field>": "<value>" | ["<v1>","<v2>"] | "<prefix>*",\n    "<nested>": { "<field>": "<value>" }\n  }\n}',
    clauses: [
      'eventType — 단일 문자열 또는 배열(any-of)',
      'data.<field> — 정확일치 · 배열(any-of) · 와일드카드(*) 3종만 지원',
      'prefix/exists/numeric-range 같은 별도 연산자는 없음',
      '실제 저장 시 condition 은 이스케이프된 JSON 문자열',
    ],
    examples: [
      '{\n  "eventType": [\n    "com.oraclecloud.objectstorage.deletebucket",\n    "com.oraclecloud.objectstorage.createbucket"\n  ],\n  "data": { "resourceName": "my_bucket*" }\n}',
    ],
    verified: true,
  },
  {
    id: 'nosql-sql',
    label: 'NoSQL SQL',
    service: 'NoSQL Database',
    purpose: 'NoSQL Database 의 SQL (풀 SQL 의 부분집합 — JOIN 없음)',
    group: '데이터·비용',
    docUrl: 'https://docs.oracle.com/en-us/iaas/nosql-database/doc/query-language-reference.html',
    skeleton: 'SELECT <expression> FROM <table>\n[WHERE <expression>]\n[GROUP BY <expression>]\n[ORDER BY <expression> <sort order>]\n[LIMIT <number>] [OFFSET <number>];',
    clauses: [
      'SELECT … FROM <table> — child table 미지원이라 JOIN 없음',
      'WHERE / GROUP BY / ORDER BY / LIMIT / OFFSET',
      'SELECT 절엔 집계 간 산술식만 (CASE 등 임의 식 불가)',
    ],
    examples: [
      'SELECT * FROM Users;',
      'SELECT id, firstname, lastname FROM Users WHERE firstname = "Taylor";',
    ],
    verified: true,
  },
  {
    id: 'usage-filter',
    label: '사용량·비용 필터',
    service: 'Cost Analysis / Usage API',
    purpose: '사용량/비용 조회 요청 (텍스트 언어 아님 — REST/SDK 구조화 요청)',
    group: '데이터·비용',
    docUrl: 'https://docs.oracle.com/en-us/iaas/tools/python/latest/api/usage_api/models/oci.usage_api.models.Filter.html',
    skeleton: 'Filter = { operator: "AND"|"OR"|"NOT", dimensions: [Dimension…], tags: [Tag…], filters: [Filter…] }\nRequest = { tenantId, timeUsageStarted, timeUsageEnded, granularity: HOURLY|DAILY|MONTHLY, queryType: USAGE|COST|…, groupBy: [service|skuName|region|…] }',
    clauses: [
      'Filter.operator — AND / OR / NOT (중첩 가능)',
      'groupBy — service · skuName · compartmentName · region · resourceId …',
      'granularity — HOURLY / DAILY / MONTHLY',
      'Cost Analysis 콘솔 UI 가 이 Usage API 위에 구성됨',
    ],
    examples: [],
    verified: true,
  },
]

/** 좌측 패널 그룹 순서. */
export const GRAMMAR_GROUPS = ['핵심 (자주 씀)', '관측·분석', '데이터·비용']

export function langById(id) { return GRAMMAR_LANGS.find(l => l.id === id) }

export const EMPTY_GRAMMAR_DB = { snippets: [] }
