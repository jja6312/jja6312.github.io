# -*- coding: utf-8 -*-
"""Generate the protected OCI CLI catalog from the pinned final Click tree.

Curated sections affect presentation order only. Required, optional,
conditional, deprecated, and relationship metadata stay faithful to the CLI.
"""
import json, re, glob, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from oci_cli_click import load_click_tree
from oci_cli_source import ensure_source, load_lock

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
DATA = os.path.join(SITE, '..', 'blog-db', 'knowledge', 'oci-cli', '_data')
RECIPE = os.path.join(SITE, '..', 'blog-db', 'knowledge', 'oci-cli')
OUT = os.path.join(SITE, '.protected-cache', 'cliCatalog.json')

SOURCE_LOCK = load_lock()
ensure_source()
CLICK_TREE = load_click_tree()
CLICK_COMMANDS = CLICK_TREE['commands']

STRUCTURE = [
  ('02-compute', 'Compute', [
    ('Instances', ['instance', 'instance-boot-volume-backup', 'instance-maintenance-reboot', 'instance-configuration', 'instance-pool']),
    ('Dedicated Infrastructure', ['dedicated-vm-host', 'capacity-reservation', 'compute-cluster']),
    ('Images', ['custom-image']),
  ]),
  ('03-storage', 'Storage', [
    ('Block Storage', ['block-volume', 'boot-volume', 'volume-group', 'volume-backup-policy']),
    ('File Storage', ['file-system', 'mount-target', 'export']),
    ('Object Storage', ['bucket', 'object-bulk-upload', 'object-sync']),
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
  ('06-identity-security', 'Identity & Security', [
    ('Identity', ['iam-user', 'iam-group', 'iam-policy']),
  ]),
  ('06-observability', 'Observability', [
    ('Monitoring', ['alarm']),
    ('Notifications', ['topic', 'subscription']),
  ]),
  ('07-governance', 'Governance & Administration', [
    ('Account Management', ['announcement']),
  ]),
  ('08-billing', 'Billing & Cost Management', [
    ('Billing', ['subscription-list', 'subscription-balance']),
  ]),
]

RES_LABEL = {
  'instance': 'Instance', 'instance-configuration': 'Instance Configuration', 'instance-pool': 'Instance Pool',
  'dedicated-vm-host': 'Dedicated VM Host', 'capacity-reservation': 'Capacity Reservation', 'compute-cluster': 'Compute Cluster',
  'custom-image': 'Custom Image', 'block-volume': 'Block Volume', 'boot-volume': 'Boot Volume', 'volume-group': 'Volume Group',
  'volume-backup-policy': 'Volume Backup Policy', 'file-system': 'File System', 'mount-target': 'Mount Target', 'export': 'Export',
  'bucket': 'Bucket', 'object-bulk-upload': 'Bulk Upload', 'object-sync': 'Object Sync',
  'vcn': 'VCN', 'subnet': 'Subnet', 'route-table': 'Route Table', 'dhcp-options': 'DHCP Options',
  'security-list': 'Security List', 'nsg': 'Network Security Group', 'internet-gateway': 'Internet Gateway',
  'nat-gateway': 'NAT Gateway', 'service-gateway': 'Service Gateway', 'drg': 'DRG', 'drg-attachment': 'DRG Attachment',
  'local-peering-gateway': 'Local Peering Gateway', 'remote-peering-connection': 'Remote Peering Connection',
  'public-ip': 'Public IP', 'load-balancer': 'Load Balancer', 'network-load-balancer': 'Network Load Balancer',
  'autonomous-database': 'Autonomous Database', 'base-db': 'Base Database System', 'mysql': 'MySQL DB System',
  'mysql-backup': 'MySQL Backup',
  'iam-user': 'Users', 'iam-group': 'Groups', 'iam-policy': 'Policies',
  'subscription-list': 'Subscriptions', 'subscription-balance': 'Subscription Balance',
  'alarm': 'Alarm', 'topic': 'Topic', 'subscription': 'Subscription', 'announcement': 'Announcements',
}

# 항상 '고급'으로 보내는 옵션 (콘솔에서도 고급/태그 영역)
ADVANCED_ALWAYS = {
  '--freeform-tags', '--defined-tags', '--security-attributes', '--zpr-tags', '--locks',
  '--wait-for-state', '--max-wait-seconds', '--wait-interval-seconds', '--is-lock-override',
  '--extended-metadata',
}

# 리소스별 큐레이션 — 표시 섹션과 순서만 조정하며 required 의미는 변경하지 않는다.
CURATION = {
  'instance': {
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('Placement', ['--availability-domain', '--fault-domain', '--capacity-reservation-id', '--dedicated-vm-host-id', '--compute-cluster-id', '--cluster-placement-group-id']),
      ('Shape와 부팅 소스', ['--shape', '--shape-config', '--image-id', '--source-details', '--source-boot-volume-id', '--boot-volume-size-in-gbs']),
      ('네트워킹 (VNIC)', ['--subnet-id', '--create-vnic-details', '--hostname-label']),
      ('SSH 키 (metadata.ssh_authorized_keys)', ['--metadata']),
      ('부트 볼륨·연결', ['--launch-volume-attachments', '--is-pv-encryption-in-transit-enabled']),
    ],
  },
  'vcn': {
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('CIDR', ['--cidr-block', '--cidr-blocks', '--is-ipv6-enabled', '--ipv6-private-cidr-blocks']),
      ('DNS', ['--dns-label']),
    ],
  },
  'subnet': {
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('네트워크', ['--vcn-id', '--cidr-block', '--availability-domain']),
      ('라우팅·보안·DNS', ['--route-table-id', '--security-list-ids', '--dhcp-options-id', '--dns-label']),
      ('접근 제어', ['--prohibit-public-ip-on-vnic', '--prohibit-internet-ingress']),
    ],
  },
  'autonomous-database': {
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id', '--db-name']),
      ('워크로드·컴퓨트', ['--db-workload', '--compute-model', '--compute-count', '--data-storage-size-in-tbs', '--is-auto-scaling-enabled', '--is-auto-scaling-for-storage-enabled', '--is-free-tier', '--is-dev-tier']),
      ('관리자 자격', ['--admin-password']),
      ('네트워크 접근', ['--subnet-id', '--nsg-ids', '--private-endpoint-label', '--whitelisted-ips', '--is-mtls-connection-required', '--is-access-control-enabled']),
      ('라이선스·버전', ['--license-model', '--db-version', '--database-edition']),
    ],
  },
  'mysql': {
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id', '--description']),
      ('Shape·스토리지·HA', ['--shape-name', '--data-storage-size-in-gbs', '--is-highly-available', '--mysql-version']),
      ('관리자 자격', ['--admin-username', '--admin-password']),
      ('네트워크', ['--subnet-id', '--availability-domain', '--fault-domain', '--hostname-label', '--ip-address', '--port', '--port-x']),
      ('백업·유지보수', ['--backup-policy', '--maintenance', '--deletion-policy', '--crash-recovery']),
    ],
  },
  'mysql-backup': {
    'sections': [
      ('대상 DB System', ['--lookup-compartment-id', '--db-system-id']),
      ('백업 정보', ['--display-name', '--description', '--backup-type', '--retention-in-days', '--soft-delete']),
      ('실행 환경', ['--profile', '--region']),
    ],
  },
  'base-db': {
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
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('Placement·크기·성능', ['--availability-domain', '--size-in-gbs', '--vpus-per-gb', '--is-auto-tune-enabled', '--autotune-policies']),
      ('소스·백업·암호화', ['--source-details', '--volume-backup-id', '--backup-policy-id', '--kms-key-id']),
    ],
  },
  'bucket': {
    'sections': [
      ('기본 정보', ['--name', '--compartment-id', '--namespace-name']),
      ('설정', ['--public-access-type', '--storage-tier', '--versioning', '--auto-tiering', '--object-events-enabled']),
      ('암호화', ['--kms-key-id']),
    ],
  },
  'object-bulk-upload': {
    'sections': [
      ('대상과 경로', ['--namespace', '--bucket-name', '--src-dir', '--prefix']),
      ('업로드 정책', ['--overwrite', '--no-overwrite', '--dry-run', '--verify-checksum', '--include', '--exclude', '--no-follow-symlinks']),
      ('전송 성능', ['--no-multipart', '--part-size', '--parallel-upload-count', '--disable-parallel-uploads']),
      ('객체 메타데이터', ['--metadata', '--content-type', '--content-language', '--content-encoding', '--cache-control', '--content-disposition']),
      ('암호화와 저장 계층', ['--storage-tier', '--encryption-key-file', '--opc-sse-kms-key-id']),
    ],
  },
  'object-sync': {
    'sections': [
      ('동기화 방향', ['--namespace', '--bucket-name', '--src-dir', '--dest-dir', '--prefix']),
      ('동기화 정책', ['--dry-run', '--delete', '--include', '--exclude', '--no-follow-symlinks']),
      ('전송 성능', ['--no-multipart', '--part-size', '--parallel-operations-count']),
      ('객체 메타데이터', ['--metadata', '--content-type', '--content-language', '--content-encoding', '--cache-control', '--content-disposition']),
      ('암호화와 저장 계층', ['--storage-tier', '--encryption-key-file']),
    ],
  },
  'load-balancer': {
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('가시성·Shape', ['--is-private', '--shape-name', '--shape-details']),
      ('네트워크', ['--subnet-ids', '--network-security-group-ids', '--ip-mode', '--reserved-ips']),
      ('리스너·백엔드', ['--listeners', '--backend-sets', '--hostnames', '--certificates', '--ssl-cipher-suites', '--path-route-sets', '--rule-sets']),
    ],
  },
  'network-load-balancer': {
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('가시성·네트워크', ['--is-private', '--subnet-id', '--network-security-group-ids', '--nlb-ip-version', '--reserved-ips']),
      ('동작', ['--is-preserve-source-destination', '--is-symmetric-hash-enabled']),
      ('리스너·백엔드', ['--listeners', '--backend-sets']),
    ],
  },
  'file-system': {
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('Placement', ['--availability-domain']),
      ('소스·정책·암호화', ['--source-snapshot-id', '--filesystem-snapshot-policy-id', '--kms-key-id']),
    ],
  },
  'mount-target': {
    'sections': [
      ('기본 정보', ['--display-name', '--compartment-id']),
      ('Placement·네트워크', ['--availability-domain', '--subnet-id', '--hostname-label', '--ip-address', '--nsg-ids']),
      ('성능·인증', ['--requested-throughput', '--idmap-type', '--ldap-idmap', '--kerberos']),
    ],
  },
}

NAMEISH = ('--display-name', '--name')

# Required OCIDs are resolved through the target resource's official LIST
# command. Ambiguous option names are overridden per source resource below.
RESOURCE_ID_TARGETS = {
    '--alarm-id': 'alarm',
    '--announcement-id': 'announcement',
    '--autonomous-database-id': 'autonomous-database',
    '--backup-id': 'mysql-backup',
    '--boot-volume-id': 'boot-volume',
    '--capacity-reservation-id': 'capacity-reservation',
    '--compute-cluster-id': 'compute-cluster',
    '--db-system-id': 'base-db',
    '--dedicated-vm-host-id': 'dedicated-vm-host',
    '--dhcp-id': 'dhcp-options',
    '--drg-attachment-id': 'drg-attachment',
    '--drg-id': 'drg',
    '--export-id': 'export',
    '--export-set-id': 'export-set',
    '--file-system-id': 'file-system',
    '--group-id': 'iam-group',
    '--ig-id': 'internet-gateway',
    '--image-id': 'custom-image',
    '--instance-configuration-id': 'instance-configuration',
    '--instance-id': 'instance',
    '--instance-pool-id': 'instance-pool',
    '--load-balancer-id': 'load-balancer',
    '--local-peering-gateway-id': 'local-peering-gateway',
    '--mount-target-id': 'mount-target',
    '--nat-gateway-id': 'nat-gateway',
    '--network-load-balancer-id': 'network-load-balancer',
    '--nsg-id': 'nsg',
    '--policy-id': 'volume-backup-policy',
    '--public-ip-id': 'public-ip',
    '--remote-peering-connection-id': 'remote-peering-connection',
    '--rt-id': 'route-table',
    '--security-list-id': 'security-list',
    '--service-gateway-id': 'service-gateway',
    '--subnet-id': 'subnet',
    '--subnet-ids': 'subnet',
    '--subscription-id': 'subscription',
    '--topic-id': 'topic',
    '--user-id': 'iam-user',
    '--vcn-id': 'vcn',
    '--volume-group-id': 'volume-group',
    '--volume-id': 'block-volume',
}

RESOURCE_ID_TARGET_OVERRIDES = {
    ('mysql', '--db-system-id'): 'mysql',
    ('mysql-backup', '--db-system-id'): 'mysql',
    ('iam-policy', '--policy-id'): 'iam-policy',
}

LOOKUP_NAME_FIELDS = {
    'announcement': 'reference-ticket-number',
    'export': 'path',
    'iam-user': 'name',
    'iam-group': 'name',
    'iam-policy': 'name',
    'subscription': 'endpoint',
    'topic': 'name',
}

LOOKUP_LABELS = {
    'announcement': 'Announcement reference ticket number',
    'export': 'Export path',
    'export-set': 'Export Set 이름',
    'subscription': 'Subscription endpoint',
}

EXTERNAL_LOOKUP_COMMANDS = {
    'export-set': 'oci fs export-set list',
}

LOOKUP_REQUIRES_AD = {'export-set', 'file-system', 'mount-target'}

DIRECT_ONLY_LOOKUPS = {
    ('subscription-balance', '--subscription-id'): (
        'OneSubscription 목록의 id 자체가 선택 키이며 별도의 고유 이름 필드가 없습니다. '
        'Subscriptions LIST에서 확인한 ID를 직접 선택합니다.'
    ),
    ('compartment-resource-cleansing', '--compartment-id'): (
        '삭제 범위 보호를 위해 정리 대상 compartment OCID를 직접 입력하고 같은 OCID로 이중 확인합니다.'
    ),
    ('boot-volume-cross-copy', '--source-tenancy-id'): '원본 프로필과 별개인 cross-tenancy IAM 주체를 명시적으로 확인합니다.',
    ('boot-volume-cross-copy', '--dest-tenancy-id'): '대상 tenancy OCID를 policy statement와 대조해야 하므로 직접 확인합니다.',
    ('boot-volume-cross-copy', '--target-group-id'): '대상 tenancy Group OCID를 Admit/Endorse policy와 독립적으로 대조합니다.',
    ('boot-volume-cross-copy', '--compartment-id'): '복사 대상 tenancy의 정확한 compartment OCID를 policy 범위와 대조합니다.',
    ('boot-volume-cross-copy', '--source-boot-volume-id'): '여러 원본 tenancy volume을 순회하므로 검증된 OCID 목록을 직접 입력합니다.',
    ('block-volume-cross-copy', '--source-tenancy-id'): '원본 프로필과 별개인 cross-tenancy IAM 주체를 명시적으로 확인합니다.',
    ('block-volume-cross-copy', '--dest-tenancy-id'): '대상 tenancy OCID를 policy statement와 대조해야 하므로 직접 확인합니다.',
    ('block-volume-cross-copy', '--target-group-id'): '대상 tenancy Group OCID를 Admit/Endorse policy와 독립적으로 대조합니다.',
    ('block-volume-cross-copy', '--compartment-id'): '복사 대상 tenancy의 정확한 compartment OCID를 policy 범위와 대조합니다.',
    ('block-volume-cross-copy', '--source-volume-id'): '여러 원본 tenancy volume을 순회하므로 검증된 OCID 목록을 직접 입력합니다.',
}

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
    if typ == 'file':
        return './path/to/file'
    if typ == 'datetime':
        return '2026-08-30T23:18:00Z'
    if 'cidr' in n:
        return '10.0.0.0/16'
    if 'shape' in n:
        return 'VM.Standard.E4.Flex'
    return ''

raw = {}
for f in glob.glob(os.path.join(DATA, '*.json')):
    d = json.load(open(f, encoding='utf-8'))
    if d.get('cli_version') != SOURCE_LOCK['version']:
        raise RuntimeError('%s: cli_version must match pinned OCI CLI %s' % (os.path.basename(f), SOURCE_LOCK['version']))
    if d.get('source_tag') != SOURCE_LOCK['tag'] or d.get('source_commit') != SOURCE_LOCK['commit']:
        raise RuntimeError('%s: source tag/commit does not match the OCI CLI source lock' % os.path.basename(f))
    if d.get('source_kind') not in ('generated', 'manual-curation'):
        raise RuntimeError('%s: source_kind must be generated or manual-curation' % os.path.basename(f))
    if not d.get('primary') and d.get('commands'):
        d['primary'] = next((command for command in d['commands'] if command.get('verb') == 'create'), d['commands'][0])
    if d.get('primary', {}).get('options'):
        raw[d['resource']] = d

def build_option(o):
    typ = o.get('type', 'str')
    choices = o.get('choices')
    if o.get('flag'):
        choices = None
    elif typ == 'bool' or (choices and set(map(str.lower, map(str, choices))) == {'true', 'false'}):
        choices = ['true', 'false']
    option = {
        'name': o['name'], 'required': bool(o.get('required')),
        'requirement': 'required' if o.get('required') else 'optional',
        'type': 'json' if o.get('json') else typ, 'choices': choices,
        'help': (o.get('help') or '').strip()[:140],
        'placeholder': placeholder(o['name'], 'json' if o.get('json') else typ),
    }
    for key in ('checkbox', 'checkboxLabel', 'defaultValue', 'suggestions', 'multiSelect',
                'suggestionLabels', 'shellQuote', 'lookupOnly', 'displayLabel', 'conflictsWith'):
        if key in o:
            option[key] = o[key]
    if o.get('flag'):
        option['flag'] = True
    if o.get('multiple'):
        option['multiple'] = True
    if o.get('deprecated'):
        option['deprecated'] = True
        option['deprecation'] = (o.get('deprecation') or o.get('help') or 'Deprecated option.').strip()[:240]
    if o.get('placeholder'):
        option['placeholder'] = o['placeholder']
    return option

OPTION_RULES_BY_COMMAND = {
    'oci compute instance launch': [
        {
            'id': 'instance-boot-source', 'kind': 'oneOf',
            'options': ['--image-id', '--source-details', '--source-boot-volume-id'],
            'message': '부팅 소스는 Image, Source Details, 기존 Boot Volume 중 정확히 하나를 선택합니다.',
        },
        {
            'id': 'instance-boot-size-conflict', 'kind': 'mutuallyExclusive',
            'options': ['--source-details', '--source-boot-volume-id', '--boot-volume-size-in-gbs'],
            'message': 'Boot Volume 크기 단축 옵션은 Image 부팅에서만 사용합니다.',
        },
        {
            'id': 'instance-boot-size-requires-image', 'kind': 'requires',
            'when': '--boot-volume-size-in-gbs', 'requires': ['--image-id'],
            'message': '--boot-volume-size-in-gbs를 사용하려면 --image-id를 선택해야 합니다.',
        },
    ],
    'oci os object bulk-upload': [
        {
            'id': 'bulk-upload-overwrite-policy', 'kind': 'mutuallyExclusive',
            'options': ['--overwrite', '--no-overwrite'],
            'message': '--overwrite와 --no-overwrite는 함께 사용할 수 없습니다.',
        },
        {
            'id': 'bulk-upload-file-filter', 'kind': 'mutuallyExclusive',
            'options': ['--include', '--exclude'],
            'message': '--include와 --exclude는 함께 사용할 수 없습니다.',
        },
    ],
    'oci os object sync': [
        {
            'id': 'object-sync-direction', 'kind': 'oneOf',
            'options': ['--src-dir', '--dest-dir'],
            'message': '업로드는 --src-dir, 다운로드는 --dest-dir 중 정확히 하나를 지정합니다.',
        },
        {
            'id': 'object-sync-file-filter', 'kind': 'mutuallyExclusive',
            'options': ['--include', '--exclude'],
            'message': '--include와 --exclude는 함께 사용할 수 없습니다.',
        },
    ],
}

OPTION_NOTICES_BY_COMMAND = {
    'oci compute instance launch': [
        {
            'kind': 'notPublic', 'option': '--create-vnic-details',
            'replacements': ['--subnet-id', '--assign-public-ip', '--private-ip', '--nsg-ids', '--hostname-label'],
            'message': (f"OCI CLI {SOURCE_LOCK['version']}의 최종 launch 명령은 --create-vnic-details를 공개하지 않습니다. "
                        '필수 --subnet-id와 VNIC 개별 옵션을 사용합니다.'),
        },
    ],
}

# OCI CLI v3.90.2 `oci compute instance launch --generate-param-json-input
# source-details`의 공식 출력. sourceType별 object variant를 UI가 구조화 입력으로
# 렌더링한다. 일반 JSON 옵션은 아래 annotate_json_inputs()가 같은 공식 skeleton
# 생성 명령을 제공하므로 새 옵션도 `{ }` textarea로 퇴행하지 않는다.
INSTANCE_SOURCE_DETAILS_TEMPLATE = [
    'This parameter should actually be a JSON object rather than an array - pick one of the following object variants to use',
    {
        'bootVolumeId': 'string',
        'sourceType': 'bootVolume',
    },
    {
        'bootVolumeSizeInGBs': 0,
        'bootVolumeVpusPerGB': 0,
        'imageId': 'string',
        'instanceSourceImageFilterDetails': {
            'compartmentId': 'string',
            'definedTagsFilter': {
                'string1': {
                    'string1': {'string1': 'string', 'string2': 'string'},
                    'string2': {'string1': 'string', 'string2': 'string'},
                },
                'string2': {
                    'string1': {'string1': 'string', 'string2': 'string'},
                    'string2': {'string1': 'string', 'string2': 'string'},
                },
            },
            'operatingSystem': 'string',
            'operatingSystemVersion': 'string',
        },
        'kmsKeyId': 'string',
        'sourceType': 'image',
    },
]

# OCI CLI v3.90.2의 launch/update shape-config 공식 skeleton. Burstable은
# baselineOcpuUtilization으로 설정하며 UI에서는 공식 enum을 선택지로 제한한다.
INSTANCE_SHAPE_CONFIG_TEMPLATE = {
    'baselineOcpuUtilization': 'string',
    'localVolumeSizeInGBs': 0,
    'memoryInGBs': 0.0,
    'nvmes': 0,
    'ocpus': 0.0,
    'resourceManagement': 'string',
    'vcpus': 0,
}
INSTANCE_SHAPE_CONFIG_FIELD_CHOICES = {
    'baselineOcpuUtilization': [
        {'value': 'BASELINE_1_8', 'label': 'Burstable 12.5% (1/8 OCPU baseline)'},
        {'value': 'BASELINE_1_2', 'label': 'Burstable 50% (1/2 OCPU baseline)'},
        {'value': 'BASELINE_1_1', 'label': 'Burstable 끄기 · 100% OCPU'},
    ],
    'resourceManagement': [
        {'value': 'DYNAMIC', 'label': 'DYNAMIC'},
        {'value': 'STATIC', 'label': 'STATIC'},
    ],
}

def annotate_json_inputs(command):
    """Give every complex option an actionable schema path, never a bare `{ }`."""
    command_path = command.get('cmd')
    if not command_path:
        return
    if command_path == 'oci compute instance launch':
        command['instanceLaunchPreflight'] = {
            'schema': 'oci-instance-launch-preflight/v2',
            'shapeListCommand': 'oci compute shape list',
            'imageListCommand': 'oci compute image list',
            'shapeDocs': 'https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/compute/shape/list.html',
            'imageDocs': 'https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/compute/image/list.html',
        }
    options = [
        option
        for section in command.get('sections', [])
        for option in section.get('options', [])
    ] + list(command.get('advanced', []))
    for option in options:
        if option.get('type') == 'json':
            option['placeholder'] = '구조화 입력기로 JSON 필드를 구성하세요.'
            option['jsonTemplateCommand'] = '%s --generate-param-json-input %s' % (
                command_path, option['name'].removeprefix('--'),
            )
        if command_path == 'oci compute instance launch' and option['name'] == '--source-details':
            option['jsonTemplate'] = INSTANCE_SOURCE_DETAILS_TEMPLATE
            option['jsonRules'] = {
                'discriminator': 'sourceType',
                'variants': {
                    'bootVolume': {
                        'required': ['bootVolumeId'],
                    },
                    'image': {
                        'requiredOneOf': [['imageId', 'instanceSourceImageFilterDetails']],
                    },
                },
            }
        if command_path in ('oci compute instance launch', 'oci compute instance update') and option['name'] == '--shape-config':
            option['jsonTemplate'] = INSTANCE_SHAPE_CONFIG_TEMPLATE
            option['jsonFieldChoices'] = INSTANCE_SHAPE_CONFIG_FIELD_CHOICES
            option['jsonNotice'] = ('Burstable은 지원 Shape에서만 사용할 수 있습니다. '
                                    'BASELINE_1_8은 12.5%, BASELINE_1_2는 50%, '
                                    'BASELINE_1_1은 Burstable 비활성입니다. 기존 SR-IOV 인스턴스를 '
                                    'Burstable로 전환할 때는 --launch-options의 networkType을 '
                                    'PARAVIRTUALIZED로 함께 변경해야 합니다.')
        if command_path == 'oci compute instance launch' and option['name'] == '--image-id':
            # 일반 exact-name 조회기는 platform image의 OS/버전/shape 선택을 표현하지
            # 못한다. 전용 조회 결과 picker가 최종 OCID를 확정하므로 본 명령에는 그대로 전달한다.
            option.pop('dynamicLookup', None)
            option['dynamicLookupImplementedBy'] = 'dedicated-builder'
            option['imagePicker'] = {
                'listCommand': 'oci compute image list',
                'shapeOption': '--shape',
                'docs': 'https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/compute/image/list.html',
                'note': ('현재 리전의 platform/custom image를 조회합니다. Shape를 먼저 입력하면 '
                         '호환 이미지로 제한합니다.'),
            }
        if command_path == 'oci compute instance launch' and option['name'] == '--shape':
            option['shapePicker'] = {
                'listCommand': 'oci compute shape list',
                'docs': 'https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/compute/shape/list.html',
                'note': ('Availability Domain에서 실제 사용 가능한 Shape를 조회하고 '
                         'AMD, Intel, Ampere 계열별 카드로 선택합니다.'),
            }

DEPRECATED_REPLACEMENTS = {
    ('oci bv volume create', '--size-in-mbs'): ['--size-in-gbs'],
    ('oci network vcn create', '--cidr-block'): ['--cidr-blocks'],
}

def add_conflict(options, left, right):
    if left not in options or right not in options:
        return
    for current, other in ((left, right), (right, left)):
        conflicts = options[current].setdefault('conflictsWith', [])
        if other not in conflicts:
            conflicts.append(other)

def annotate_option_relationships(command):
    options = {
        option['name']: option
        for section in command.get('sections', [])
        for option in section.get('options', [])
    }
    options.update({option['name']: option for option in command.get('advanced', [])})
    for option in options.values():
        option.setdefault('requirement', 'required' if option.get('required') else 'optional')
        replacement = DEPRECATED_REPLACEMENTS.get((command.get('cmd'), option['name']))
        if option.get('deprecated') and replacement:
            option['replacement'] = replacement
    add_conflict(options, '--all', '--limit')

    rules = []
    for original in OPTION_RULES_BY_COMMAND.get(command.get('cmd'), []):
        rule = json.loads(json.dumps(original))
        if rule['kind'] in ('oneOf', 'mutuallyExclusive'):
            names = rule['options']
            if not all(name in options for name in names):
                continue
            for index, left in enumerate(names):
                for right in names[index + 1:]:
                    add_conflict(options, left, right)
            if rule['kind'] == 'oneOf':
                for name in names:
                    if not options[name].get('required'):
                        options[name]['requirement'] = 'conditional'
        elif rule['kind'] == 'requires':
            if rule['when'] not in options or not all(name in options for name in rule['requires']):
                continue
        rules.append(rule)
    if rules:
        command['rules'] = rules
    notices = OPTION_NOTICES_BY_COMMAND.get(command.get('cmd'))
    if notices:
        command['optionNotices'] = json.loads(json.dumps(notices))

def layout_command(res, command, curated=False):
    opts = {o['name']: build_option(o) for o in command['options']}
    cur = CURATION.get(res) if curated else None

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
    prefixes = {
        'get': ('get',), 'list': ('list',), 'create': ('create',),
        'update': ('update',), 'delete': ('delete', 'terminate'),
    }[operation]
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

catalog = {
    'source': {
        key: SOURCE_LOCK[key]
        for key in ('repository', 'releaseUrl', 'tag', 'version', 'commit', 'tree', 'publishedAt', 'collectedAt')
    },
    'categories': [],
    'commands': {},
}
catalog['source'].update({
    'metadataCollector': 'final-click-tree',
    'click': CLICK_TREE['click'],
    'ociSdk': CLICK_TREE['ociSdk'],
    'publicCommands': len(CLICK_COMMANDS),
})
MANUAL_CATEGORY_RESOURCES = {
    'instance-maintenance-reboot', 'instance-boot-volume-backup',
    'iam-user', 'iam-group', 'iam-policy',
    'object-bulk-upload', 'object-sync',
}
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
    cmd = d.get('command') or recipe_cmd(res)
    if not cmd:
        continue
    source_file = d.get('source_file')
    if d.get('source_kind') == 'generated':
        if not source_file:
            raise RuntimeError('%s: generated resource is missing source_file' % res)
        primary = CLICK_COMMANDS.get(cmd)
        if not primary:
            raise RuntimeError('%s: public command %s not found in the pinned final Click tree' % (res, cmd))
        source_commands = [
            command for command in CLICK_COMMANDS.values()
            if command.get('group') == primary.get('group')
        ]
    elif d.get('commands'):
        source_commands = d['commands']
        primary = d['primary']
    else:
        raise RuntimeError('%s: no pinned source or curated commands' % res)
    sections, advanced = layout_command(res, primary, curated=True)
    prefix = cmd.rsplit(' ', 1)[0]
    operations = {}
    for operation in ('get', 'list', 'create', 'update', 'delete'):
        primary_verb = primary.get('verb')
        primary_is_create = operation == 'create' and primary_verb not in ('get', 'list', 'update', 'delete', 'terminate')
        operation_source = primary if primary_verb == operation or primary_is_create else find_operation(
            source_commands, primary.get('group'), operation,
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
                    'help': 'JMESPath 조회식 — 필요한 항목을 여러 개 선택하거나 직접 입력',
                    'placeholder': '선택하지 않으면 전체 응답 조회',
                    'shellQuote': True, 'multiSelect': True,
                    'suggestions': [
                        'data."time-maintenance-reboot-due"', 'data."display-name"',
                        'data."lifecycle-state"', 'data.shape', 'data."availability-domain"',
                        'data."fault-domain"', 'data.region', 'data."time-created"', 'data.id',
                    ],
                    'suggestionLabels': {
                        'data."time-maintenance-reboot-due"': '유지보수 재부팅 예정 시각',
                        'data."display-name"': '인스턴스 이름',
                        'data."lifecycle-state"': '상태',
                        'data.shape': 'Shape',
                        'data."availability-domain"': 'Availability Domain',
                        'data."fault-domain"': 'Fault Domain',
                        'data.region': 'Region',
                        'data."time-created"': '생성 시각',
                        'data.id': 'Instance OCID',
                    },
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
        if d.get('source_kind') == 'generated':
            operation_cmd = operation_source['path']
        elif operation == 'create':
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
    catalog_command = {
        'resource': res, 'label': RES_LABEL.get(res, res),
        'cmd': cmd, 'help': (primary.get('help') or '').strip()[:200],
        'sections': sections, 'advanced': advanced, 'operations': operations,
    }
    for metadata_key in ('preferredOperation', 'disableDynamic', 'rootTenancyLookup', 'safeCreateOnly'):
        if metadata_key in d:
            catalog_command[metadata_key] = d[metadata_key]
    catalog['commands'][res] = catalog_command

# ── 커스텀 레시피 (backbone 없음) ──
# 여러 명령을 묶거나 별도 조립이 필요한 작업은 CliBuilderPage 의 전용 빌더가 최종 명령을 만든다.
def _co(name, req, help, ph='', multi=False, default=None, choices=None, flag=False, typ='str'):
    o = {'name': name, 'required': req, 'type': 'bool' if flag else typ, 'choices': None, 'help': help, 'placeholder': ph}
    if multi:
        o['multi'] = True
    if default is not None:
        o['defaultValue'] = default
    if choices is not None:
        o['choices'] = choices
    if flag:
        o['flag'] = True
    return o

def _io(name, req, help, ph='', **metadata):
    """IAM 수동 큐레이션 옵션. OCI CLI 3.90.2 공식 cmdref 기준."""
    option = _co(
        name, req, help, ph,
        default=metadata.pop('default', None),
        choices=metadata.pop('choices', None),
        flag=metadata.pop('flag', False),
    )
    option.update(metadata)
    return option

def _execution_context():
    """OCI CLI v3.90.2 root/global options shared by every service command."""
    return {
        'source': {
            'kind': 'final-click-root',
            'tag': SOURCE_LOCK['tag'],
            'version': SOURCE_LOCK['version'],
            'commit': SOURCE_LOCK['commit'],
            'runtimeFile': 'oci_cli/cli_root.py',
        },
        'request': [
            _io('--profile', False, 'OCI config에서 사용할 프로필. 비우면 DEFAULT 또는 OCI_CLI_PROFILE을 사용합니다.',
                'DEFAULT', default='DEFAULT', shellQuote=True),
            _io('--region', False, '요청 리전. 비우면 선택한 프로필이나 OCI_CLI_REGION 값을 사용합니다.',
                'ap-seoul-1', shellQuote=True),
            _io('--auth', False, 'API 요청 인증 방식. 비우면 config의 API key 인증을 사용합니다.', choices=[
                'api_key', 'instance_principal', 'security_token', 'instance_obo_user',
                'resource_principal', 'oke_workload_identity',
            ]),
            _io('--endpoint', False, '서비스 endpoint 전체 URL. 지정하면 기본 리전 endpoint보다 우선합니다.',
                'https://iaas.ap-seoul-1.oraclecloud.com/20160918', shellQuote=True),
        ],
        'response': [
            _io('--output', False, '응답 출력 형식. 비우면 OCI CLI 기본 JSON을 사용합니다.', choices=['json', 'table']),
            _io('--query', False, '응답 JSON에 적용할 JMESPath query. 비우면 전체 응답을 표시합니다.',
                'data[].{Name:"display-name",Id:id}', shellQuote=True),
            _io('--raw-output', False, '단일 문자열 query 결과의 바깥 따옴표를 제거합니다.', flag=True),
        ],
    }

COMMON_CONTEXT_NAMES = {
    option['name']
    for group in ('request', 'response')
    for option in _execution_context()[group]
}

def lift_execution_context(surface):
    """Move global/root options out of resource forms while preserving curated defaults and controls."""
    overrides = {}
    sections = []
    for section in surface.get('sections', []):
        local_options = []
        for option in section.get('options', []):
            if option['name'] not in COMMON_CONTEXT_NAMES:
                local_options.append(option)
                continue
            lifted = dict(option)
            lifted['required'] = False
            lifted['requirement'] = 'optional'
            overrides[option['name']] = lifted
        if local_options:
            sections.append({**section, 'options': local_options})
    surface['sections'] = sections

    local_advanced = []
    for option in surface.get('advanced', []):
        if option['name'] not in COMMON_CONTEXT_NAMES:
            local_advanced.append(option)
            continue
        lifted = dict(option)
        lifted['required'] = False
        lifted['requirement'] = 'optional'
        overrides[option['name']] = lifted
    surface['advanced'] = local_advanced
    if overrides:
        surface['contextOverrides'] = overrides

def _iam_env():
    return [
        _io('--profile', False, 'OCI CLI 프로필 이름 (~/.oci/config)', 'DEFAULT', default='DEFAULT', shellQuote=True),
        _io('--region', False, 'IAM 요청을 보낼 리전. IAM 변경은 홈 리전에서 먼저 반영됩니다.', 'ap-seoul-1', default='ap-seoul-1', shellQuote=True),
    ]

def _iam_op(cmd, help_text, sections, advanced=None, **metadata):
    operation = {'cmd': cmd, 'help': help_text, 'sections': sections, 'advanced': advanced or []}
    operation.update(metadata)
    return operation

def _iam_user():
    user_id = _io('--user-id', True, '대상 User OCID. 동적 조회에서는 정확한 User 이름을 입력합니다.', 'operator@example.com', shellQuote=True)
    return {
        'resource': 'iam-user', 'label': 'Users', 'cmd': 'oci iam user create', 'iamResource': 'user',
        'preferredOperation': 'list',
        'help': ('Identity & Security > Identity > Users. User 생성 뒤에는 Group 할당과 Console password 또는 '
                 'API signing key 발급이 별도로 필요합니다.'),
        'sections': [], 'advanced': [],
        'operations': {
            'get': _iam_op('oci iam user get', 'User 한 명의 상세 정보를 조회합니다.', [
                {'label': '대상 User', 'options': [user_id]},
                {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'list': _iam_op('oci iam user list', '테넌시의 User를 이름·상태로 조회합니다.', [
                {'label': '조회 범위 · 필터', 'options': [
                    _io('--compartment-id', False, '비우면 프로필의 루트 테넌시. 동적 조회에서는 ROOT를 사용합니다.', 'ROOT', default='ROOT', shellQuote=True),
                    _io('--name', False, 'User 이름과 정확히 일치하는 결과만 조회', 'operator@example.com', shellQuote=True),
                    _io('--lifecycle-state', False, 'User 수명주기 상태', choices=['ACTIVE', 'CREATING', 'INACTIVE', 'DELETING', 'DELETED']),
                    _io('--all', False, '--limit과 함께 사용할 수 없는 전체 페이지 조회', flag=True, default='true'),
                    _io('--output', False, '결과 출력 형식', choices=['table', 'json'], default='table'),
                ]},
                {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'create': _iam_op('oci iam user create', '테넌시에 새 User를 생성합니다. 이름은 생성 후 변경할 수 없습니다.', [
                {'label': 'User 정보', 'options': [
                    _io('--name', True, '로그인에 사용할 고유 User 이름. 공백은 허용되지 않습니다.', 'operator@example.com', shellQuote=True),
                    _io('--description', True, 'User 설명. 빈 문자열도 허용됩니다.', 'OCI operations engineer', shellQuote=True),
                    _io('--email', False, 'Identity Domain 지원 테넌시에서는 User별 email이 필요합니다.', 'operator@example.com', shellQuote=True),
                ]},
                {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'update': _iam_op('oci iam user update', '변경 가능한 User 설명·email을 수정합니다.', [
                {'label': '대상 User', 'options': [user_id]},
                {'label': '변경 값', 'options': [
                    _io('--description', False, '새 User 설명', 'OCI operations engineer', shellQuote=True),
                    _io('--email', False, '새 email 주소', 'operator@example.com', shellQuote=True),
                    _io('--if-match', False, 'GET 응답의 ETag와 일치할 때만 수정', 'etag-value', shellQuote=True),
                    _io('--force', False, '변경 값 확인 프롬프트 없이 수정', flag=True),
                ]},
                {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'delete': _iam_op('oci iam user delete', 'User를 삭제합니다. 삭제 전에 Group·credential 영향을 확인하세요.', [
                {'label': '대상 User', 'options': [
                    user_id, _io('--if-match', False, 'GET 응답의 ETag와 일치할 때만 삭제', 'etag-value', shellQuote=True),
                    _io('--force', False, '확인 프롬프트 없이 삭제', flag=True),
                ]},
                {'label': '실행 환경', 'options': _iam_env()},
            ]),
        },
        'actions': {
            'reset-password': _iam_op(
                'oci iam user ui-password create-or-reset',
                'Classic IAM은 7일 유효 일회용 비밀번호를 반환하고, Identity Domain 테넌시는 비밀번호 재설정 email을 발송합니다.',
                [{'label': '대상 User', 'options': [user_id]}, {'label': '실행 환경', 'options': _iam_env()}],
                label='Password 초기화', icon='⌁', tone='warning',
            ),
            'assign-group': _iam_op(
                'oci iam group add-user', '정확히 조회된 User를 정확히 조회된 Group에 할당합니다.',
                [{'label': '할당 대상', 'options': [
                    user_id,
                    _io('--group-id', True, '할당할 Group OCID. 동적 조회에서는 정확한 Group 이름을 입력합니다.', 'OCI-Operators', shellQuote=True),
                ]}, {'label': '실행 환경', 'options': _iam_env()}],
                label='Group 할당', icon='↦', tone='create',
            ),
            'upload-api-key': _iam_op(
                'oci iam user api-key upload',
                'RSA PEM 공개키를 API signing key로 등록합니다. Compute SSH 공개키가 아니며 User당 최대 3개입니다.',
                [{'label': '대상 User', 'options': [user_id]}, {'label': '공개키', 'options': [
                    _io('--key-source', True, '공개키 파일 경로 또는 PEM 원문 중 하나를 선택', choices=['KEY_FILE', 'PEM_TEXT'], default='KEY_FILE', lookupOnly=True, displayLabel='공개키 입력 방식'),
                    _io('--key-file', False, 'Cloud Shell 또는 실행 호스트의 RSA PEM 공개키 파일 경로', '/home/opc/.oci/oci_api_key_public.pem', type='file', shellQuote=True),
                    _io('--key', False, 'RSA PEM 공개키 원문. KEY_FILE 대신 사용할 때만 입력합니다.', '-----BEGIN PUBLIC KEY-----', type='json', shellQuote=True),
                ]}, {'label': '실행 환경', 'options': _iam_env()}],
                label='API Key 발행', icon='⌘', tone='create',
            ),
        },
    }

def _iam_group():
    group_id = _io('--group-id', True, '대상 Group OCID. 동적 조회에서는 정확한 Group 이름을 입력합니다.', 'OCI-Operators', shellQuote=True)
    return {
        'resource': 'iam-group', 'label': 'Groups', 'cmd': 'oci iam group create', 'iamResource': 'group',
        'preferredOperation': 'list',
        'help': 'Identity & Security > Identity > Groups. Group은 Policy가 권한을 부여하는 주체입니다.',
        'sections': [], 'advanced': [],
        'operations': {
            'get': _iam_op('oci iam group get', 'Group 한 건을 조회합니다.', [
                {'label': '대상 Group', 'options': [group_id]}, {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'list': _iam_op('oci iam group list', '테넌시의 Group을 이름·상태로 조회합니다.', [
                {'label': '조회 범위 · 필터', 'options': [
                    _io('--compartment-id', False, '비우면 프로필의 루트 테넌시. 동적 조회에서는 ROOT를 사용합니다.', 'ROOT', default='ROOT', shellQuote=True),
                    _io('--name', False, 'Group 이름과 정확히 일치하는 결과만 조회', 'OCI-Operators', shellQuote=True),
                    _io('--lifecycle-state', False, 'Group 수명주기 상태', choices=['ACTIVE', 'CREATING', 'INACTIVE', 'DELETING', 'DELETED']),
                    _io('--all', False, '--limit과 함께 사용할 수 없는 전체 페이지 조회', flag=True, default='true'),
                    _io('--output', False, '결과 출력 형식', choices=['table', 'json'], default='table'),
                ]}, {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'create': _iam_op('oci iam group create', '테넌시에 고유 Group을 생성합니다. 이름은 생성 후 변경할 수 없습니다.', [
                {'label': 'Group 정보', 'options': [
                    _io('--name', True, '고유 Group 이름', 'OCI-Operators', shellQuote=True),
                    _io('--description', True, 'Group 설명. 빈 문자열도 허용됩니다.', 'OCI operations group', shellQuote=True),
                ]}, {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'update': _iam_op('oci iam group update', 'Group 설명을 수정합니다.', [
                {'label': '대상 Group', 'options': [group_id]},
                {'label': '변경 값', 'options': [
                    _io('--description', False, '새 Group 설명', 'OCI operations group', shellQuote=True),
                    _io('--if-match', False, 'GET 응답의 ETag와 일치할 때만 수정', 'etag-value', shellQuote=True),
                    _io('--force', False, '변경 값 확인 프롬프트 없이 수정', flag=True),
                ]},
                {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'delete': _iam_op('oci iam group delete', 'Group을 삭제합니다. Policy statement와 구성원 영향을 먼저 확인하세요.', [
                {'label': '대상 Group', 'options': [
                    group_id, _io('--if-match', False, 'GET 응답의 ETag와 일치할 때만 삭제', 'etag-value', shellQuote=True),
                    _io('--force', False, '확인 프롬프트 없이 삭제', flag=True),
                ]},
                {'label': '실행 환경', 'options': _iam_env()},
            ]),
        },
    }

def _iam_policy():
    policy_id = _io('--policy-id', True, '대상 Policy OCID. 동적 조회에서는 정확한 Policy 이름을 입력합니다.', 'OCI-Operators-Policy', shellQuote=True)
    lookup_scope = _io('--lookup-compartment-id', True, 'Policy 이름을 찾을 위치. ROOT, compartment 이름 또는 직접 OCID', 'ROOT', default='ROOT', lookupOnly=True, displayLabel='Policy 조회 위치')
    statements = _io('--statements', True, '한 개 이상의 Policy statement를 JSON 배열로 입력', '["Allow group OCI-Operators to inspect all-resources in tenancy"]', type='json', shellQuote=True)
    return {
        'resource': 'iam-policy', 'label': 'Policies', 'cmd': 'oci iam policy create', 'iamResource': 'policy',
        'preferredOperation': 'list',
        'compartmentSupportsRoot': True,
        'help': 'Identity & Security > Identity > Policies. Policy가 부착되는 compartment는 수정·삭제 관리 범위를 결정합니다.',
        'sections': [], 'advanced': [],
        'operations': {
            'get': _iam_op('oci iam policy get', 'Policy 한 건의 statement와 부착 위치를 조회합니다.', [
                {'label': '대상 Policy', 'options': [lookup_scope, policy_id]}, {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'list': _iam_op('oci iam policy list', '지정한 tenancy 또는 compartment에 부착된 Policy를 조회합니다.', [
                {'label': '조회 위치 · 필터', 'options': [
                    _io('--compartment-id', True, 'ROOT 또는 Policy가 부착된 compartment 이름/OCID', 'ROOT', default='ROOT', shellQuote=True),
                    _io('--name', False, 'Policy 이름과 정확히 일치하는 결과만 조회', 'OCI-Operators-Policy', shellQuote=True),
                    _io('--lifecycle-state', False, 'Policy 수명주기 상태', choices=['ACTIVE', 'CREATING', 'INACTIVE', 'DELETING', 'DELETED']),
                    _io('--all', False, '--limit과 함께 사용할 수 없는 전체 페이지 조회', flag=True, default='true'),
                    _io('--output', False, '결과 출력 형식', choices=['table', 'json'], default='table'),
                ]}, {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'create': _iam_op('oci iam policy create', '지정한 tenancy 또는 compartment에 Policy를 생성합니다.', [
                {'label': '부착 위치', 'options': [_io('--compartment-id', True, 'ROOT 또는 Policy를 부착할 compartment 이름/OCID', 'ROOT', default='ROOT', shellQuote=True)]},
                {'label': 'Policy 정보', 'options': [
                    _io('--name', True, '테넌시 안에서 고유하며 생성 후 변경할 수 없는 이름', 'OCI-Operators-Policy', shellQuote=True),
                    _io('--description', True, 'Policy 설명. 빈 문자열도 허용됩니다.', 'OCI operators permissions', shellQuote=True),
                    statements,
                ]}, {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'update': _iam_op('oci iam policy update', 'Policy description 또는 statement를 변경합니다.', [
                {'label': '대상 Policy', 'options': [lookup_scope, policy_id]},
                {'label': '변경 값', 'options': [
                    _io('--description', False, '새 Policy 설명', 'OCI operators permissions', shellQuote=True),
                    _io('--statements', False, '전체 statement JSON 배열. 기존 배열을 대체합니다.', '["Allow group OCI-Operators to inspect all-resources in tenancy"]', type='json', shellQuote=True),
                    _io('--version-date', False, 'Policy 평가 동작을 고정할 YYYY-MM-DD 버전 날짜', '2026-08-15', shellQuote=True),
                    _io('--if-match', False, 'GET 응답의 ETag와 일치할 때만 수정', 'etag-value', shellQuote=True),
                    _io('--force', False, '변경 값 확인 프롬프트 없이 수정', flag=True),
                ]}, {'label': '실행 환경', 'options': _iam_env()},
            ]),
            'delete': _iam_op('oci iam policy delete', 'Policy를 삭제하면 권한이 회수됩니다. 영향 대상을 먼저 확인하세요.', [
                {'label': '대상 Policy', 'options': [
                    lookup_scope, policy_id, _io('--if-match', False, 'GET 응답의 ETag와 일치할 때만 삭제', 'etag-value', shellQuote=True),
                    _io('--force', False, '확인 프롬프트 없이 삭제', flag=True),
                ]},
                {'label': '실행 환경', 'options': _iam_env()},
            ]),
        },
    }

def _iam_mfa_reset():
    return {
        'resource': 'iam-user-mfa-reset', 'label': 'IAM User — MFA Reset',
        'cmd': 'oci iam mfa-totp-device list', 'iamMfaReset': True,
        'help': ('기본 PREVIEW에서 User의 MFA TOTP 장치를 확인합니다. RESET은 확인용 User 이름이 일치할 때만 모든 장치를 삭제하며, '
                 '사용자는 다음 로그인 전에 Console에서 MFA를 다시 등록해야 합니다.'),
        'sections': [
            {'label': '대상 User', 'options': [
                _io('--user-lookup', True, 'User 이름 또는 OCID 선택', choices=['NAME', 'OCID'], default='NAME', lookupOnly=True, displayLabel='User 입력 방식'),
                _io('--user-id', True, 'NAME이면 정확한 User 이름, OCID이면 User OCID', 'operator@example.com', shellQuote=True),
            ]},
            {'label': '안전 실행', 'options': [
                _io('--mode', True, 'PREVIEW는 조회만, RESET은 장치를 삭제', choices=['PREVIEW', 'RESET'], default='PREVIEW', lookupOnly=True),
                _io('--confirm-user-name', False, 'RESET일 때 실제 User 이름을 다시 입력', 'operator@example.com', lookupOnly=True),
            ]},
            {'label': '실행 환경', 'options': _iam_env()},
        ],
        'advanced': [],
    }

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

def _all_subscription_balances():
    return {
        'resource': 'all-subscription-balances',
        'label': 'All Subscription Balances',
        'cmd': 'oci onesubscription organization-subscription organization-subscription list',
        'allSubscriptionBalances': True,
        'help': ('프로필에서 루트 테넌시 OCID를 자동 조회한 뒤, 테넌시의 모든 Subscription ID를 순회합니다. '
                 '각 Subscription의 계약액과 서비스 라인별 Funded, Used, Available 금액을 통화별로 출력합니다.'),
        'sections': [
            {'label': '실행 환경', 'options': [
                _co('--profile', True, 'OCI CLI 프로필 이름 (~/.oci/config)', 'DEFAULT', default='DEFAULT'),
                _co('--region', True, 'OneSubscription API를 호출할 OCI 리전', 'ap-seoul-1', default='ap-seoul-1'),
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
            {'label': '대상 인스턴스', 'options': [
                _co('--instance-id', True, '대상 Compute 인스턴스 OCID', 'ocid1.instance.oc1.ap-seoul-1.xxxx'),
                _co('--profile', True, 'OCI CLI 프로파일 이름 (~/.oci/config)', 'DEFAULT'),
                _co('--region', True, '대상 인스턴스 리전', 'ap-seoul-1'),
            ]},
            {'label': '재부팅 달력 업데이트', 'options': [
                _co('--time-maintenance-reboot-due', True,
                    '변경할 UTC 시각 (RFC 3339 / ISO 8601 형식)', '2026-08-30T23:18:00Z', typ='datetime'),
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
    'all-subscription-balances': _all_subscription_balances(),
    'iam-user-mfa-reset': _iam_mfa_reset(),
    'iam-user': _iam_user(),
    'iam-group': _iam_group(),
    'iam-policy': _iam_policy(),
    'instance-maintenance-reboot': _maintenance_reboot(),
    'instance-boot-volume-backup': _instance_boot_volume_backup(),
    'boot-volume-cross-copy': _cross('boot-volume', '--source-boot-volume-id', 'Boot Volume', 'ocid1.bootvolume.oc1.ap-seoul-1.xxxx'),
    'block-volume-cross-copy': _cross('volume', '--source-volume-id', 'Block Volume', 'ocid1.volume.oc1.ap-seoul-1.xxxx'),
}
# cross-copy는 최상위 레벨, maintenance reboot는 Compute > Instances에 렌더
catalog['commands'].update(EXTRA)
catalog['executionContext'] = _execution_context()

def surface_options(surface):
    return [
        option
        for section in surface.get('sections', [])
        for option in section.get('options', [])
    ] + surface.get('advanced', [])

def lookup_input(name, label, help_text, placeholder='', default=None, choices=None):
    option = {
        'name': name, 'required': False, 'requirement': 'optional',
        'type': 'choice' if choices else 'str', 'choices': choices,
        'help': help_text, 'placeholder': placeholder,
        'lookupOnly': True, 'displayLabel': label, 'shellQuote': True,
    }
    if default is not None:
        option['defaultValue'] = default
    return option

def target_list_command(target):
    external = EXTERNAL_LOOKUP_COMMANDS.get(target)
    if external:
        if external not in CLICK_COMMANDS:
            raise RuntimeError('Dynamic lookup command is absent from pinned Click tree: %s' % external)
        return external, CLICK_COMMANDS[external]
    target_command = catalog['commands'].get(target)
    target_list = (target_command or {}).get('operations', {}).get('list')
    if not target_list:
        raise RuntimeError('Dynamic lookup target has no LIST operation: %s' % target)
    official = CLICK_COMMANDS.get(target_list['cmd'])
    return target_list['cmd'], official or {'options': surface_options(target_list)}

def annotate_dynamic_lookups(resource, surface):
    options = surface_options(surface)
    option_names = {option['name'] for option in options}
    lookup_inputs = {option['name']: option for option in surface.get('lookupInputs', [])}
    for option in options:
        option_name = option['name']
        direct_reason = DIRECT_ONLY_LOOKUPS.get((resource, option_name))
        if direct_reason:
            option['directLookupReason'] = direct_reason
            continue
        if option_name == '--compartment-id':
            option['dynamicLookup'] = {
                'kind': 'compartment',
                'inputLabel': 'Compartment 이름 또는 OCID',
                'inputPlaceholder': 'prod, ROOT 또는 ocid1.compartment...',
                'note': '이름은 tenancy 전체에서 정확히 1개일 때만 OCID로 변환합니다.',
            }
            continue
        if option_name == '--metric-compartment-id':
            option['dynamicLookup'] = {
                'kind': 'compartment',
                'inputLabel': 'Metric compartment 이름 또는 OCID',
                'inputPlaceholder': 'prod 또는 ocid1.compartment...',
                'note': '이름은 tenancy 전체에서 정확히 1개일 때만 OCID로 변환합니다.',
            }
            continue
        target = RESOURCE_ID_TARGET_OVERRIDES.get((resource, option_name), RESOURCE_ID_TARGETS.get(option_name))
        if not target:
            continue
        if resource == 'iam-user-mfa-reset' and option_name == '--user-id':
            option['dynamicLookupImplementedBy'] = 'dedicated-builder'
            continue
        # Existing dedicated builders already implement exact 0/1/N lookup.
        if resource in {'mysql', 'mysql-backup', 'iam-user', 'iam-group', 'iam-policy'}:
            option['dynamicLookupImplementedBy'] = 'dedicated-builder'
            continue
        list_command, official_list = target_list_command(target)
        field = LOOKUP_NAME_FIELDS.get(target, 'display-name')
        label = LOOKUP_LABELS.get(target, RES_LABEL.get(target, target))
        tenancy_scope = target == 'announcement'
        scope_input = None if tenancy_scope else (
            '--compartment-id' if '--compartment-id' in option_names else '--lookup-compartment-id'
        )
        if scope_input == '--lookup-compartment-id' and scope_input not in lookup_inputs:
            lookup_inputs[scope_input] = lookup_input(
                scope_input, '조회 범위 (compartment)',
                '리소스 이름을 찾을 compartment 이름, ROOT 또는 OCID입니다. 최종 명령에는 전달되지 않습니다.',
                'prod 또는 ocid1.compartment...',
            )
        prerequisite_inputs = []
        if target in LOOKUP_REQUIRES_AD:
            ad_input = '--lookup-availability-domain'
            if ad_input not in lookup_inputs:
                lookup_inputs[ad_input] = lookup_input(
                    ad_input, '조회 Availability Domain',
                    'AD 번호(1~3) 또는 정확한 AD 이름입니다. 최종 명령에는 전달되지 않습니다.',
                    '1 또는 xxxx:AP-SEOUL-1-AD-1', default='1',
                )
            prerequisite_inputs.append({'input': ad_input, 'argument': '--availability-domain', 'kind': 'availabilityDomain'})
        if target == 'public-ip':
            scope_kind_input = '--lookup-scope'
            if scope_kind_input not in lookup_inputs:
                lookup_inputs[scope_kind_input] = lookup_input(
                    scope_kind_input, 'Public IP 조회 범위',
                    '대부분의 예약 Public IP는 REGION 범위에서 조회합니다.',
                    default='REGION', choices=['REGION', 'AVAILABILITY_DOMAIN'],
                )
            prerequisite_inputs.append({'input': scope_kind_input, 'argument': '--scope', 'kind': 'value'})
        option['dynamicLookup'] = {
            'kind': 'exactName',
            'target': target,
            'listCommand': list_command,
            'nameField': field,
            'inputLabel': label,
            'inputPlaceholder': '%s %s' % (label, '여러 개(줄바꿈)' if option_name.endswith('-ids') else '이름'),
            'note': '공식 LIST 결과에서 정확히 일치하는 %s이 1개일 때만 OCID로 변환합니다.' % field,
            'scope': 'tenancy' if tenancy_scope else 'compartment',
            'scopeInput': scope_input,
            'scopeArgument': '--compartment-id',
            'prerequisites': prerequisite_inputs,
            'multiple': option_name.endswith('-ids'),
            'supportsAll': bool(official_list and any(item['name'] == '--all' for item in official_list.get('options', []))),
        }
    if lookup_inputs:
        surface['lookupInputs'] = list(lookup_inputs.values())

def set_safe_preferred_operation(command):
    """Persist the same LIST > GET > mutation default enforced by the UI."""
    if command.get('maintenanceReboot'):
        command['preferredOperation'] = 'get'
        return
    operations = command.get('operations', {})
    for operation in ('list', 'get', 'create', 'update', 'delete'):
        if operation in operations:
            command['preferredOperation'] = operation
            return

for resource, command in catalog['commands'].items():
    set_safe_preferred_operation(command)
    annotate_dynamic_lookups(resource, command)
    annotate_option_relationships(command)
    for operation in command.get('operations', {}).values():
        annotate_dynamic_lookups(resource, operation)
        annotate_option_relationships(operation)
    for action in command.get('actions', {}).values():
        annotate_dynamic_lookups(resource, action)
        annotate_option_relationships(action)
    annotate_json_inputs(command)
    for operation in command.get('operations', {}).values():
        annotate_json_inputs(operation)
    for action in command.get('actions', {}).values():
        annotate_json_inputs(action)
    lift_execution_context(command)
    for operation in command.get('operations', {}).values():
        lift_execution_context(operation)
    for action in command.get('actions', {}).values():
        lift_execution_context(action)
    specification = raw.get(resource, {})
    provenance = {
        'kind': specification.get('source_kind', 'manual-curation'),
        'tag': SOURCE_LOCK['tag'],
        'version': SOURCE_LOCK['version'],
        'commit': SOURCE_LOCK['commit'],
    }
    if specification.get('source_file'):
        provenance['sourceFile'] = specification['source_file']
    command['source'] = provenance

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(catalog, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
n_cur = sum(1 for r in catalog['commands'] if r in CURATION)
print('cliCatalog v3 — 명령 %d (수동 큐레이션 %d · 휴리스틱 %d)'
      % (len(catalog['commands']), n_cur, len(catalog['commands']) - n_cur))
inst = catalog['commands']['instance']
print('instance sections:', [s['label'] + '(%d)' % len(s['options']) for s in inst['sections']])
print('instance advanced:', len(inst['advanced']))
