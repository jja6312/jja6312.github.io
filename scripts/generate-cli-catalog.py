# -*- coding: utf-8 -*-
"""blog-db knowledge/oci-cli/_data → src/data/cliCatalog.json

v3: 콘솔 생성 마법사와 같은 경험 —
  - promote: CLI 스키마상 optional 이지만 콘솔에선 사실상 필수인 옵션을 필수로 승격
  - sections: 콘솔 마법사 순서의 필드 그룹 (기본 정보 → Placement → … )
  - advanced: tags·wait 등은 '고급'으로 접힘
실행: python scripts/generate-cli-catalog.py  (cc3/jja6312.github.io 에서)
"""
import json, re, glob, os, sys, io, importlib.util
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
DATA = os.path.join(SITE, '..', 'blog-db', 'knowledge', 'oci-cli', '_data')
RECIPE = os.path.join(SITE, '..', 'blog-db', 'knowledge', 'oci-cli')
OUT = os.path.join(SITE, '.protected-cache', 'cliCatalog.json')

_parser_spec = importlib.util.spec_from_file_location('parse_oci_cli', os.path.join(HERE, 'parse-oci-cli.py'))
_parser_module = importlib.util.module_from_spec(_parser_spec)
_parser_spec.loader.exec_module(_parser_module)
parse_cli_file = _parser_module.parse_file

STRUCTURE = [
  ('02-compute', 'Compute', [
    ('Instances', ['instance', 'instance-boot-volume-backup', 'instance-maintenance-reboot', 'instance-configuration', 'instance-pool']),
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
    ('MySQL HeatWave', ['mysql', 'mysql-backup']),
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
  'mysql-backup': 'MySQL Backup',
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
  'mysql-backup': {
    'promote': [],
    'sections': [
      ('대상 DB System', ['--lookup-compartment-id', '--db-system-id']),
      ('백업 정보', ['--display-name', '--description', '--backup-type', '--retention-in-days', '--soft-delete']),
      ('실행 환경', ['--profile', '--region']),
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
    if not d.get('primary') and d.get('commands'):
        d['primary'] = next((command for command in d['commands'] if command.get('verb') == 'create'), None)
    if d.get('primary', {}).get('options'):
        raw[d['resource']] = d

def build_option(o):
    typ = o.get('type', 'str')
    choices = o.get('choices')
    if typ == 'bool' or (choices and set(map(str.lower, map(str, choices))) == {'true', 'false'}):
        choices = ['true', 'false']
    option = {
        'name': o['name'], 'required': bool(o.get('required')),
        'type': 'json' if o.get('json') else typ, 'choices': choices,
        'help': (o.get('help') or '').strip()[:140],
        'placeholder': placeholder(o['name'], 'json' if o.get('json') else typ),
    }
    for key in ('flag', 'defaultValue', 'suggestions', 'shellQuote', 'lookupOnly', 'displayLabel'):
        if key in o:
            option[key] = o[key]
    if o.get('placeholder'):
        option['placeholder'] = o['placeholder']
    return option

def layout_command(res, command, curated=False):
    opts = {o['name']: build_option(o) for o in command['options']}
    cur = CURATION.get(res) if curated else None
    promote = set(cur['promote']) if cur else set()

    for name in promote:
        if name in opts:
            opts[name]['required'] = True
            opts[name]['console'] = True

    used = set()
    sections = []
    if cur:
        for label, names in cur['sections']:
            items = [opts[name] for name in names if name in opts]
            used.update(name for name in names if name in opts)
            if items:
                sections.append({'label': label, 'options': items})
        missing_req = [o for name, o in opts.items() if o['required'] and name not in used and name not in ADVANCED_ALWAYS]
        if missing_req:
            sections.insert(1, {'label': '필수 (기타)', 'options': missing_req})
            used.update(o['name'] for o in missing_req)
    else:
        basic = [opts[name] for name in NAMEISH if name in opts]
        if '--compartment-id' in opts:
            basic.append(opts['--compartment-id'])
        used.update(o['name'] for o in basic)
        required = [o for name, o in opts.items() if o['required'] and name not in used and name not in ADVANCED_ALWAYS]
        used.update(o['name'] for o in required)
        rest = [o for name, o in opts.items() if name not in used and name not in ADVANCED_ALWAYS]
        used.update(o['name'] for o in rest)
        if basic:
            sections.append({'label': '기본 정보', 'options': basic})
        if required:
            sections.append({'label': '필수 구성', 'options': required})
        if rest:
            sections.append({'label': '구성', 'options': rest})

    advanced = [o for name, o in opts.items() if name not in used]
    return sections, advanced

def find_operation(commands, group, operation):
    same_group = [command for command in commands if command.get('group') == group]
    prefixes = {'get': ('get',), 'list': ('list',), 'update': ('update',), 'delete': ('delete', 'terminate')}[operation]
    for prefix in prefixes:
        exact = next((command for command in same_group if command.get('verb') == prefix), None)
        if exact:
            return exact
        prefixed = sorted(
            (command for command in same_group if (command.get('verb') or '').startswith(prefix + '-')),
            key=lambda command: len(command['verb']),
        )
        if prefixed:
            return prefixed[0]
    return None

catalog = {'categories': [], 'commands': {}}
MANUAL_CATEGORY_RESOURCES = {'instance-maintenance-reboot', 'instance-boot-volume-backup'}
placed = set()
for cat_id, cat_label, groups in STRUCTURE:
    cat = {'id': cat_id, 'label': cat_label, 'groups': []}
    for glabel, resources in groups:
        rs = [r for r in resources if r in raw or r in MANUAL_CATEGORY_RESOURCES]
        if rs:
            cat['groups'].append({'label': glabel, 'resources': rs})
            placed.update(rs)
    catalog['categories'].append(cat)

source_cache = {}
for res, d in raw.items():
    if res not in placed:
        continue
    cmd = d.get('command') or recipe_cmd(res)
    if not cmd:
        continue
    sections, advanced = layout_command(res, d['primary'], curated=True)
    source_file = d.get('source_file')
    if d.get('commands'):
        source_commands = d['commands']
    elif source_file and os.path.exists(source_file):
        if source_file not in source_cache:
            source_cache[source_file] = parse_cli_file(source_file)
        source_commands = source_cache[source_file]
    else:
        source_commands = []
    prefix = cmd.rsplit(' ', 1)[0]
    operations = {}
    for operation in ('get', 'list', 'create', 'update', 'delete'):
        operation_source = d['primary'] if operation == 'create' else find_operation(
            source_commands, d['primary'].get('group'), operation,
        )
        if not operation_source:
            continue
        if res == 'instance' and operation == 'get':
            operation_source = {**operation_source, 'options': [dict(option) for option in operation_source['options']]}
            for option in operation_source['options']:
                if option['name'] == '--instance-id':
                    option['shellQuote'] = True
            operation_source['options'].extend([
                {
                    'name': '--profile', 'required': False, 'type': 'str', 'choices': None,
                    'help': 'OCI CLI 프로파일 이름 (~/.oci/config)', 'placeholder': 'DEFAULT', 'shellQuote': True,
                },
                {
                    'name': '--region', 'required': False, 'type': 'str', 'choices': None,
                    'help': '대상 인스턴스 리전', 'placeholder': 'ap-seoul-1', 'shellQuote': True,
                },
                {
                    'name': '--query', 'required': False, 'type': 'str', 'choices': None,
                    'help': 'JMESPath 조회식 — 자주 쓰는 항목을 선택하거나 직접 입력',
                    'placeholder': 'data."time-maintenance-reboot-due"',
                    'defaultValue': 'data."time-maintenance-reboot-due"', 'shellQuote': True,
                    'suggestions': [
                        'data."time-maintenance-reboot-due"', 'data."display-name"',
                        'data."lifecycle-state"', 'data.shape', 'data."availability-domain"', 'data.id',
                    ],
                },
                {
                    'name': '--raw-output', 'required': False, 'type': 'bool', 'choices': None,
                    'help': '조회 결과의 따옴표를 제거하고 원시 값만 출력', 'placeholder': '',
                    'flag': True, 'defaultValue': 'true',
                },
            ])
        if res == 'mysql' and operation == 'get':
            operation_source = {**operation_source, 'options': [dict(option) for option in operation_source['options']]}
            for option in operation_source['options']:
                if option['name'] == '--db-system-id':
                    option.update({
                        'placeholder': 'mysql-prod-01',
                        'shellQuote': True,
                        'help': ('동적 조회 시 DB System display name, 해제 시 DB System OCID. '
                                 'OCI GET의 실제 필수 인자는 이 항목 하나입니다.'),
                    })
            operation_source['options'].extend([
                {
                    'name': '--lookup-compartment-id', 'required': False, 'type': 'str', 'choices': None,
                    'help': 'DB System 이름을 조회할 컴파트먼트. 최종 GET 명령에는 전달되지 않습니다.',
                    'placeholder': 'prod', 'lookupOnly': True, 'displayLabel': '조회 범위 (compartment)',
                },
                {
                    'name': '--profile', 'required': False, 'type': 'str', 'choices': None,
                    'help': 'OCI CLI 프로파일 이름 (~/.oci/config)', 'placeholder': 'DEFAULT',
                    'defaultValue': 'DEFAULT', 'shellQuote': True,
                },
                {
                    'name': '--region', 'required': False, 'type': 'str', 'choices': None,
                    'help': '대상 MySQL DB System 리전', 'placeholder': 'ap-seoul-1',
                    'defaultValue': 'ap-seoul-1', 'shellQuote': True,
                },
            ])
        op_sections, op_advanced = layout_command(res, operation_source, curated=operation == 'create')
        if res == 'mysql' and operation == 'get':
            get_options = {option['name']: option for section in op_sections for option in section['options']}
            op_sections = [
                {'label': '대상 DB System', 'options': [
                    get_options['--lookup-compartment-id'], get_options['--db-system-id'],
                ]},
                {'label': '조건부 조회', 'options': [get_options['--if-none-match']]},
                {'label': '실행 환경', 'options': [get_options['--profile'], get_options['--region']]},
            ]
        if operation == 'create':
            operation_cmd = cmd
        else:
            actual_verb = 'terminate' if operation == 'delete' and operation_source['verb'].startswith('terminate') else operation
            operation_cmd = prefix + ' ' + actual_verb
        operations[operation] = {
            'cmd': operation_cmd,
            'help': (operation_source.get('help') or '').strip()[:200],
            'sections': op_sections,
            'advanced': op_advanced,
        }
    catalog['commands'][res] = {
        'resource': res, 'label': RES_LABEL.get(res, res),
        'cmd': cmd, 'help': (d['primary'].get('help') or '').strip()[:200],
        'sections': sections, 'advanced': advanced, 'operations': operations,
    }

# ── 커스텀 레시피 (backbone 없음) ──
# 여러 명령을 묶거나 별도 조립이 필요한 작업은 CliBuilderPage 의 전용 빌더가 최종 명령을 만든다.
def _co(name, req, help, ph='', multi=False, default=None, choices=None, flag=False):
    o = {'name': name, 'required': req, 'type': 'str', 'choices': None, 'help': help, 'placeholder': ph}
    if multi:
        o['multi'] = True
    if default is not None:
        o['defaultValue'] = default
    if choices is not None:
        o['choices'] = choices
    if flag:
        o['flag'] = True
    return o

def _compartment_cleanup():
    enabled = lambda name, help: _co(name, False, help, default='true', flag=True)
    return {
        'resource': 'compartment-resource-cleansing',
        'label': 'Compartment Resource Cleansing',
        'cmd': 'oci search resource structured-search',
        'compartmentCleanup': True,
        'help': ('특정 컴파트먼트에 속한 OCI 자원을 서비스 의존성 순서로 조회하고 정리하는 Bash 스크립트입니다. '
                 '기본 PREVIEW 모드는 삭제 명령만 보여주며, DELETE 모드는 같은 컴파트먼트 OCID를 확인란에 다시 입력해야 실행됩니다.'),
        'sections': [
            {'label': '대상 · 실행 안전장치', 'options': [
                _co('--compartment-id', True, '정리할 단일 컴파트먼트 OCID (테넌시 OCID는 거부)', 'ocid1.compartment.oc1..xxxx'),
                _co('--profile', True, 'OCI CLI 프로파일 이름 (~/.oci/config)', 'DEFAULT', default='DEFAULT'),
                _co('--region', True, '정리할 리전', 'ap-seoul-1', default='ap-seoul-1'),
                _co('--mode', True, 'PREVIEW는 조회/삭제 명령 출력만, DELETE는 실제 삭제', choices=['PREVIEW', 'DELETE'], default='PREVIEW'),
                _co('--confirm-compartment-id', False, 'DELETE 시 --compartment-id와 완전히 같은 OCID를 다시 입력', 'ocid1.compartment.oc1..xxxx'),
                _co('--log-analytics-namespace', False, 'Log Analytics namespace. 비워두면 Log Analytics 정리는 건너뜀', 'example_namespace'),
            ]},
            {'label': '정리 대상 서비스', 'options': [
                enabled('--cleanup-compute', '인스턴스 풀, 인스턴스 구성, 인스턴스, 커스텀 이미지'),
                enabled('--cleanup-load-balancers', 'Load Balancer와 Network Load Balancer'),
                enabled('--cleanup-databases', 'Autonomous DB, Base DB System, MySQL DB System'),
                enabled('--cleanup-storage', 'Object Storage, File Storage, Block/Boot Volume과 Volume Group'),
                enabled('--cleanup-storage-backups', 'Boot/Block/Volume Group 백업'),
                enabled('--cleanup-db-backups', 'Base DB, MySQL, Autonomous DB 백업'),
                enabled('--cleanup-logging', 'Logging의 Log와 Log Group'),
                enabled('--cleanup-log-analytics', 'Log Analytics entity와 해당 컴파트먼트 범위 저장 데이터'),
                enabled('--cleanup-network', 'DRG 연결, LPG/RPC, Gateway, Subnet, NSG, DRG, VCN'),
            ]},
        ],
        'advanced': [],
    }

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
        'help': ('GET 탭에서는 유지보수 재부팅을 연장할 수 있는 최대 시각을 조회하고, '
                 'UPDATE 탭에서는 실제 재부팅 달력을 변경합니다.'),
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

def _instance_boot_volume_backup():
    return {
        'resource': 'instance-boot-volume-backup',
        'label': 'Instance Boot Volume — Manual Backup',
        'cmd': 'oci bv boot-volume-backup create',
        'manualBackup': 'instance-boot-volume',
        'help': ('컴파트먼트 이름과 인스턴스 이름을 정확히 1개 OCID로 해석하고, 인스턴스의 AD와 연결된 Boot Volume을 찾아 수동 백업을 생성합니다. '
                 '동명이 여러 개이면 생성하지 않고 후보를 출력합니다.'),
        'sections': [
            {'label': '이름으로 대상 조회', 'options': [
                _co('--compartment-name', True, '테넌시 전체에서 정확히 일치하는 컴파트먼트 이름', 'prod'),
                _co('--instance-name', True, '해당 컴파트먼트에서 정확히 일치하는 인스턴스 display name', 'app-server-01'),
                _co('--profile', True, 'OCI CLI 프로파일 이름 (~/.oci/config)', 'DEFAULT', default='DEFAULT'),
                _co('--region', True, '대상 인스턴스와 Boot Volume 리전', 'ap-seoul-1', default='ap-seoul-1'),
            ]},
            {'label': '수동 백업 설정', 'options': [
                _co('--backup-display-name', False, '백업 이름. 비우면 <instance>-boot-manual-UTC시각', 'app-server-01-boot-manual-20260807-150000'),
                _co('--backup-type', True, 'FULL은 전체 백업, INCREMENTAL은 직전 백업 이후 변경분', choices=['FULL', 'INCREMENTAL'], default='FULL'),
                _co('--max-wait-seconds', True, 'AVAILABLE 상태를 기다릴 최대 시간(초)', '3600', default='3600'),
            ]},
        ],
        'advanced': [],
    }

EXTRA = {
    'compartment-resource-cleansing': _compartment_cleanup(),
    'instance-maintenance-reboot': _maintenance_reboot(),
    'instance-boot-volume-backup': _instance_boot_volume_backup(),
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
