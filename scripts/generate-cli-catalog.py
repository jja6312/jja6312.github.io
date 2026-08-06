# -*- coding: utf-8 -*-
"""blog-db knowledge/oci-cli/_data → src/data/cliCatalog.json

v3: 콘솔 생성 마법사와 같은 경험 —
  - promote: CLI 스키마상 optional 이지만 콘솔에선 사실상 필수인 옵션을 필수로 승격
  - sections: 콘솔 마법사 순서의 필드 그룹 (기본 정보 → Placement → … )
  - advanced: tags·wait 등은 '고급'으로 접힘
실행: python scripts/generate-cli-catalog.py  (cc3/jja6312.github.io 에서)
"""
import json, re, glob, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
DATA = os.path.join(SITE, '..', 'blog-db', 'knowledge', 'oci-cli', '_data')
RECIPE = os.path.join(SITE, '..', 'blog-db', 'knowledge', 'oci-cli')
OUT = os.path.join(SITE, '.protected-cache', 'cliCatalog.json')

STRUCTURE = [
  ('02-compute', 'Compute', [
    ('Instances', ['instance', 'instance-maintenance-reboot', 'instance-configuration', 'instance-pool']),
    ('Dedicated Infrastructure', ['dedicated-vm-host', 'capacity-reservation', 'compute-cluster']),
    ('Images', ['custom-image']),
  ]),
  ('03-storage', 'Storage', [
    ('Block Storage', ['block-volume', 'boot-volume', 'volume-group', 'volume-backup-policy']),
    ('File Storage', ['file-system', 'mount-target', 'export']),
    ('Object Storage', ['bucket']),
  ]),
  ('04-network', 'Networking', [
    ('Virtual Cloud Networks', ['vcn', 'subnet', 'route-table', 'dhcp-options']),
    ('Security', ['security-list', 'nsg']),
    ('Gateways', ['internet-gateway', 'nat-gateway', 'service-gateway', 'drg', 'drg-attachment', 'local-peering-gateway', 'remote-peering-connection']),
    ('IP Management', ['public-ip']),
    ('Load Balancers', ['load-balancer', 'network-load-balancer']),
  ]),
  ('05-database', 'Database', [
    ('Autonomous Database', ['autonomous-database']),
    ('Oracle Base Database', ['base-db']),
    ('MySQL HeatWave', ['mysql']),
  ]),
  ('06-observability', 'Observability', [
    ('Monitoring', ['alarm']),
    ('Notifications', ['topic', 'subscription']),
  ]),
]

RES_LABEL = {
  'instance': 'Instance', 'instance-configuration': 'Instance Configuration', 'instance-pool': 'Instance Pool',
  'dedicated-vm-host': 'Dedicated VM Host', 'capacity-reservation': 'Capacity Reservation', 'compute-cluster': 'Compute Cluster',
  'custom-image': 'Custom Image', 'block-volume': 'Block Volume', 'boot-volume': 'Boot Volume', 'volume-group': 'Volume Group',
  'volume-backup-policy': 'Volume Backup Policy', 'file-system': 'File System', 'mount-target': 'Mount Target', 'export': 'Export',
  'bucket': 'Bucket', 'vcn': 'VCN', 'subnet': 'Subnet', 'route-table': 'Route Table', 'dhcp-options': 'DHCP Options',
  'security-list': 'Security List', 'nsg': 'Network Security Group', 'internet-gateway': 'Internet Gateway',
  'nat-gateway': 'NAT Gateway', 'service-gateway': 'Service Gateway', 'drg': 'DRG', 'drg-attachment': 'DRG Attachment',
  'local-peering-gateway': 'Local Peering Gateway', 'remote-peering-connection': 'Remote Peering Connection',
  'public-ip': 'Public IP', 'load-balancer': 'Load Balancer', 'network-load-balancer': 'Network Load Balancer',
  'autonomous-database': 'Autonomous Database', 'base-db': 'Base Database System', 'mysql': 'MySQL DB System',
  'alarm': 'Alarm', 'topic': 'Topic', 'subscription': 'Subscription',
}

# 항상 '고급'으로 보내는 옵션 (콘솔에서도 고급/태그 영역)
ADVANCED_ALWAYS = {
  '--freeform-tags', '--defined-tags', '--security-attributes', '--zpr-tags', '--locks',
  '--wait-for-state', '--max-wait-seconds', '--wait-interval-seconds', '--is-lock-override',
  '--extended-metadata',
}

# 리소스별 큐레이션 — 콘솔 생성 마법사의 섹션·순서를 그대로.
# promote: CLI optional 이지만 콘솔상 사실상 필수 → 필수 취급.
CURATION = {
  'instance': {
    'promote': ['--display-name', '--image-id', '--shape', '--subnet-id', '--metadata'],
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('Placement', ['--availability-domain', '--fault-domain', '--capacity-reservation-id', '--dedicated-vm-host-id', '--compute-cluster-id', '--cluster-placement-group-id']),
      ('이미지와 Shape', ['--image-id', '--source-details', '--shape', '--shape-config']),
      ('네트워킹 (VNIC)', ['--subnet-id', '--create-vnic-details', '--hostname-label']),
      ('SSH 키 (metadata.ssh_authorized_keys)', ['--metadata']),
      ('부트 볼륨·연결', ['--launch-volume-attachments', '--is-pv-encryption-in-transit-enabled']),
    ],
  },
  'vcn': {
    'promote': ['--display-name', '--cidr-block'],
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('CIDR', ['--cidr-block', '--cidr-blocks', '--is-ipv6-enabled', '--ipv6-private-cidr-blocks']),
      ('DNS', ['--dns-label']),
    ],
  },
  'subnet': {
    'promote': ['--display-name'],
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('네트워크', ['--vcn-id', '--cidr-block', '--availability-domain']),
      ('라우팅·보안·DNS', ['--route-table-id', '--security-list-ids', '--dhcp-options-id', '--dns-label']),
      ('접근 제어', ['--prohibit-public-ip-on-vnic', '--prohibit-internet-ingress']),
    ],
  },
  'autonomous-database': {
    'promote': ['--display-name', '--db-name', '--admin-password', '--db-workload', '--compute-count', '--data-storage-size-in-tbs'],
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id', '--db-name']),
      ('워크로드·컴퓨트', ['--db-workload', '--compute-model', '--compute-count', '--data-storage-size-in-tbs', '--is-auto-scaling-enabled', '--is-auto-scaling-for-storage-enabled', '--is-free-tier', '--is-dev-tier']),
      ('관리자 자격', ['--admin-password']),
      ('네트워크 접근', ['--subnet-id', '--nsg-ids', '--private-endpoint-label', '--whitelisted-ips', '--is-mtls-connection-required', '--is-access-control-enabled']),
      ('라이선스·버전', ['--license-model', '--db-version', '--database-edition']),
    ],
  },
  'mysql': {
    'promote': ['--display-name', '--admin-username', '--admin-password', '--data-storage-size-in-gbs'],
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id', '--description']),
      ('Shape·스토리지·HA', ['--shape-name', '--data-storage-size-in-gbs', '--is-highly-available', '--mysql-version']),
      ('관리자 자격', ['--admin-username', '--admin-password']),
      ('네트워크', ['--subnet-id', '--availability-domain', '--fault-domain', '--hostname-label', '--ip-address', '--port', '--port-x']),
      ('백업·유지보수', ['--backup-policy', '--maintenance', '--deletion-policy', '--crash-recovery']),
    ],
  },
  'base-db': {
    'promote': ['--display-name'],
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('Placement', ['--availability-domain', '--fault-domains']),
      ('DB 시스템', ['--shape', '--cpu-core-count', '--node-count', '--hostname', '--ssh-public-keys', '--db-system-options', '--cluster-name', '--time-zone']),
      ('스토리지', ['--initial-data-storage-size-in-gb', '--data-storage-percentage', '--storage-volume-performance-mode', '--sparse-diskgroup']),
      ('네트워크', ['--subnet-id', '--backup-subnet-id', '--nsg-ids', '--backup-network-nsg-ids', '--private-ip', '--domain']),
      ('암호화', ['--kms-key-id', '--kms-key-version-id']),
    ],
  },
  'block-volume': {
    'promote': ['--display-name', '--availability-domain', '--size-in-gbs'],
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('Placement·크기·성능', ['--availability-domain', '--size-in-gbs', '--vpus-per-gb', '--is-auto-tune-enabled', '--autotune-policies']),
      ('소스·백업·암호화', ['--source-details', '--volume-backup-id', '--backup-policy-id', '--kms-key-id']),
    ],
  },
  'bucket': {
    'promote': [],
    'sections': [
      ('기본 정보', ['--name', '--compartment-id', '--namespace-name']),
      ('설정', ['--public-access-type', '--storage-tier', '--versioning', '--auto-tiering', '--object-events-enabled']),
      ('암호화', ['--kms-key-id']),
    ],
  },
  'load-balancer': {
    'promote': ['--is-private'],
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('가시성·Shape', ['--is-private', '--shape-name', '--shape-details']),
      ('네트워크', ['--subnet-ids', '--network-security-group-ids', '--ip-mode', '--reserved-ips']),
      ('리스너·백엔드', ['--listeners', '--backend-sets', '--hostnames', '--certificates', '--ssl-cipher-suites', '--path-route-sets', '--rule-sets']),
    ],
  },
  'network-load-balancer': {
    'promote': ['--is-private'],
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('가시성·네트워크', ['--is-private', '--subnet-id', '--network-security-group-ids', '--nlb-ip-version', '--reserved-ips']),
      ('동작', ['--is-preserve-source-destination', '--is-symmetric-hash-enabled']),
      ('리스너·백엔드', ['--listeners', '--backend-sets']),
    ],
  },
  'file-system': {
    'promote': ['--display-name'],
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('Placement', ['--availability-domain']),
      ('소스·정책·암호화', ['--source-snapshot-id', '--filesystem-snapshot-policy-id', '--kms-key-id']),
    ],
  },
  'mount-target': {
    'promote': ['--display-name'],
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('Placement·네트워크', ['--availability-domain', '--subnet-id', '--hostname-label', '--ip-address', '--nsg-ids']),
      ('성능·인증', ['--requested-throughput', '--idmap-type', '--ldap-idmap', '--kerberos']),
    ],
  },
}

NAMEISH = ('--display-name', '--name')

def recipe_cmd(res):
    p = os.path.join(RECIPE, 'ocicli_%s.md' % res)
    if not os.path.exists(p):
        return None
    txt = open(p, encoding='utf-8').read()
    m = re.search(r'\boci ([a-z0-9-]+ )+?(create|launch)\b', txt)
    return m.group(0) if m else None

def placeholder(name, typ):
    n = name.lstrip('-')
    if n.endswith('-id') or 'compartment' in n:
        return 'ocid1.' + n.replace('-id', '').replace('-', '') + '.oc1..xxxx'
    if n in ('display-name', 'name'):
        return 'my-resource'
    if typ == 'json':
        return '{ }'
    if 'cidr' in n:
        return '10.0.0.0/16'
    if 'shape' in n:
        return 'VM.Standard.E4.Flex'
    return ''

raw = {}
for f in glob.glob(os.path.join(DATA, '*.json')):
    d = json.load(open(f, encoding='utf-8'))
    if d.get('primary', {}).get('options'):
        raw[d['resource']] = d

def build_option(o):
    typ = o.get('type', 'str')
    choices = o.get('choices')
    if typ == 'bool' or (choices and set(map(str.lower, map(str, choices))) == {'true', 'false'}):
        choices = ['true', 'false']
    return {
        'name': o['name'], 'required': bool(o.get('required')),
        'type': 'json' if o.get('json') else typ, 'choices': choices,
        'help': (o.get('help') or '').strip()[:140],
        'placeholder': placeholder(o['name'], 'json' if o.get('json') else typ),
    }

catalog = {'categories': [], 'commands': {}}
MANUAL_CATEGORY_RESOURCES = {'instance-maintenance-reboot'}
placed = set()
for cat_id, cat_label, groups in STRUCTURE:
    cat = {'id': cat_id, 'label': cat_label, 'groups': []}
    for glabel, resources in groups:
        rs = [r for r in resources if r in raw or r in MANUAL_CATEGORY_RESOURCES]
        if rs:
            cat['groups'].append({'label': glabel, 'resources': rs})
            placed.update(rs)
    catalog['categories'].append(cat)

for res, d in raw.items():
    if res not in placed:
        continue
    cmd = recipe_cmd(res)
    if not cmd:
        continue
    opts = {o['name']: build_option(o) for o in d['primary']['options']}
    cur = CURATION.get(res)
    promote = set(cur['promote']) if cur else set()

    # promote 적용 — 콘솔 기준 필수
    for name in promote:
        if name in opts:
            opts[name]['required'] = True
            opts[name]['console'] = True   # 표기용: 콘솔 기준 필수

    used = set()
    sections = []
    if cur:
        for label, names in cur['sections']:
            items = [opts[n] for n in names if n in opts]
            used.update(n for n in names if n in opts)
            if items:
                sections.append({'label': label, 'options': items})
        # 큐레이션에 빠졌지만 required 인 옵션 → 첫 섹션 뒤에 배치
        missing_req = [o for n, o in opts.items() if o['required'] and n not in used and n not in ADVANCED_ALWAYS]
        if missing_req:
            sections.insert(1, {'label': '필수 (기타)', 'options': missing_req})
            used.update(o['name'] for o in missing_req)
    else:
        # 휴리스틱: 기본 정보 → 필수 → 구성
        basic = [opts[n] for n in NAMEISH if n in opts] + ([opts['--compartment-id']] if '--compartment-id' in opts else [])
        used.update(o['name'] for o in basic)
        req = [o for n, o in opts.items() if o['required'] and n not in used and n not in ADVANCED_ALWAYS]
        used.update(o['name'] for o in req)
        rest = [o for n, o in opts.items() if n not in used and n not in ADVANCED_ALWAYS]
        used.update(o['name'] for o in rest)
        if basic: sections.append({'label': '기본 정보', 'options': basic})
        if req: sections.append({'label': '필수 구성', 'options': req})
        if rest: sections.append({'label': '구성', 'options': rest})

    advanced = [o for n, o in opts.items() if n not in used]
    catalog['commands'][res] = {
        'resource': res, 'label': RES_LABEL.get(res, res),
        'cmd': cmd, 'help': (d['primary'].get('help') or '').strip()[:200],
        'sections': sections, 'advanced': advanced,
    }

# ── 커스텀 레시피 (backbone 없음) ──
# 여러 명령을 묶거나 별도 조립이 필요한 작업은 CliBuilderPage 의 전용 빌더가 최종 명령을 만든다.
def _co(name, req, help, ph='', multi=False):
    o = {'name': name, 'required': req, 'type': 'str', 'choices': None, 'help': help, 'placeholder': ph}
    if multi:
        o['multi'] = True
    return o

def _cross(kind, src_opt, label, src_ph):
    res = 'boot-volume-cross-copy' if kind == 'boot-volume' else 'block-volume-cross-copy'
    return {
        'resource': res, 'label': '%s — Cross-Tenancy Copy' % label,
        'cmd': 'oci bv %s create' % kind, 'crossCopy': kind,
        'help': ('다른 테넌시의 %s을 이 테넌시로 복사 — 여러 OCID 일괄(for 루프) + 원본 display name 유지. '
                 '선행: 원본 테넌시 Admit · 대상 테넌시 Endorse policy 필요.' % label),
        'sections': [
            {'label': '대상 테넌시 · 위치', 'options': [
                _co('--profile', True, '대상(이관받을) 테넌시의 CLI 프로파일 이름 (~/.oci/config)', 'DEFAULT'),
                _co('--region', True, '원본 = 대상 리전 (동일 리전 복사)', 'ap-seoul-1'),
                _co('--compartment-id', True, '대상 compartment OCID', 'ocid1.compartment.oc1..xxxx'),
            ]},
            {'label': 'IAM Policy 선행 (최초 1회 · Admit/Endorse)', 'options': [
                _co('--source-profile', True, '원본 테넌시 CLI 프로파일 (Admit policy 생성용)', 'OLD'),
                _co('--source-tenancy-id', True, '원본 테넌시 OCID', 'ocid1.tenancy.oc1..xxxx'),
                _co('--target-group-name', True, '대상 group 이름 — 대상 테넌시 Endorse 문장에 사용', 'VolumeCopiers'),
                _co('--target-group-id', True, '대상 group OCID — 원본 테넌시 Admit 문장의 Define group 에 사용', 'ocid1.group.oc1..xxxx'),
                _co('--policy-name', False, 'policy 이름 접두 (미입력 시 cross-tenancy-volume)', 'cross-tenancy-volume'),
                _co('--dest-tenancy-id', True, '대상 테넌시 OCID', 'ocid1.tenancy.oc1..xxxx'),
            ]},
            {'label': '원본 %s OCID (여러 개: 줄바꿈/콤마)' % label, 'options': [
                _co(src_opt, True, '원본 OCID — 여러 개 넣으면 for 루프로 순차 복사 후 원본 이름으로 rename', src_ph, multi=True),
            ]},
        ],
        'advanced': [],
    }

def _maintenance_reboot():
    return {
        'resource': 'instance-maintenance-reboot',
        'label': 'Instance Maintenance Reboot',
        'cmd': 'oci compute instance-maintenance-reboot get',
        'maintenanceReboot': True,
        'help': ('유지보수 재부팅을 연장할 수 있는 최대 시각을 조회하고 실제 재부팅 달력을 변경. '
                 '최종 명령에 최대 시각 조회와 달력 업데이트 명령이 함께 생성됩니다.'),
        'sections': [
            {'label': '인스턴스 · 실행 환경', 'options': [
                _co('--instance-id', True, '대상 Compute 인스턴스 OCID', 'ocid1.instance.oc1.ap-seoul-1.xxxx'),
                _co('--profile', True, 'OCI CLI 프로파일 이름 (~/.oci/config)', 'DEFAULT'),
                _co('--region', True, '대상 인스턴스 리전', 'ap-seoul-1'),
            ]},
            {'label': '재부팅 달력 업데이트', 'options': [
                _co('--time-maintenance-reboot-due', True,
                    '변경할 UTC 시각 (RFC 3339 / ISO 8601 형식)', '2026-08-30T23:18:00Z'),
            ]},
        ],
        'advanced': [],
    }

EXTRA = {
    'instance-maintenance-reboot': _maintenance_reboot(),
    'boot-volume-cross-copy': _cross('boot-volume', '--source-boot-volume-id', 'Boot Volume', 'ocid1.bootvolume.oc1.ap-seoul-1.xxxx'),
    'block-volume-cross-copy': _cross('volume', '--source-volume-id', 'Block Volume', 'ocid1.volume.oc1.ap-seoul-1.xxxx'),
}
# cross-copy는 최상위 레벨, maintenance reboot는 Compute > Instances에 렌더
catalog['commands'].update(EXTRA)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(catalog, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
n_cur = sum(1 for r in catalog['commands'] if r in CURATION)
print('cliCatalog v3 — 명령 %d (수동 큐레이션 %d · 휴리스틱 %d)'
      % (len(catalog['commands']), n_cur, len(catalog['commands']) - n_cur))
inst = catalog['commands']['instance']
print('instance sections:', [s['label'] + '(%d)' % len(s['options']) for s in inst['sections']])
print('instance advanced:', len(inst['advanced']))
