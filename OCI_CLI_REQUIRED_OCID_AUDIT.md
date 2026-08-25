# OCI CLI 필수 OCID 동적 조회 전수표

- 생성 기준: Oracle OCI CLI 3.90.3 (v3.90.3, 4bdc3beb2d0b4a3187ef8392fff19537aba1178d)
- 필수 OCID 입력: 240회 / 48종
- 동적·전용 안전 조회: 228회
- 보안·제품 제약상 직접 입력: 12회
- 미분류: 0회

동적 조회는 정확한 이름이 1개일 때만 본 명령을 실행합니다. 0건 또는 중복(N건)이면 후보를 출력하고 종료합니다. 직접 입력 항목도 이유와 선행 LIST 경로를 함께 유지합니다.

## 직접 입력 유지 결정

| 리소스 | 동작 | 옵션 | 이유 |
|---|---|---|---|
| subscription-balance | list | `--subscription-id` | OneSubscription 목록의 id 자체가 선택 키이며 별도의 고유 이름 필드가 없습니다. Subscriptions LIST에서 확인한 ID를 직접 선택합니다. |
| compartment-resource-cleansing | custom | `--compartment-id` | 삭제 범위 보호를 위해 정리 대상 compartment OCID를 직접 입력하고 같은 OCID로 이중 확인합니다. |
| boot-volume-cross-copy | custom | `--compartment-id` | 복사 대상 tenancy의 정확한 compartment OCID를 policy 범위와 대조합니다. |
| boot-volume-cross-copy | custom | `--source-tenancy-id` | 원본 프로필과 별개인 cross-tenancy IAM 주체를 명시적으로 확인합니다. |
| boot-volume-cross-copy | custom | `--target-group-id` | 대상 tenancy Group OCID를 Admit/Endorse policy와 독립적으로 대조합니다. |
| boot-volume-cross-copy | custom | `--dest-tenancy-id` | 대상 tenancy OCID를 policy statement와 대조해야 하므로 직접 확인합니다. |
| boot-volume-cross-copy | custom | `--source-boot-volume-id` | 여러 원본 tenancy volume을 순회하므로 검증된 OCID 목록을 직접 입력합니다. |
| block-volume-cross-copy | custom | `--compartment-id` | 복사 대상 tenancy의 정확한 compartment OCID를 policy 범위와 대조합니다. |
| block-volume-cross-copy | custom | `--source-tenancy-id` | 원본 프로필과 별개인 cross-tenancy IAM 주체를 명시적으로 확인합니다. |
| block-volume-cross-copy | custom | `--target-group-id` | 대상 tenancy Group OCID를 Admit/Endorse policy와 독립적으로 대조합니다. |
| block-volume-cross-copy | custom | `--dest-tenancy-id` | 대상 tenancy OCID를 policy statement와 대조해야 하므로 직접 확인합니다. |
| block-volume-cross-copy | custom | `--source-volume-id` | 여러 원본 tenancy volume을 순회하므로 검증된 OCID 목록을 직접 입력합니다. |

## 전체 표

| 리소스 | 동작 | 필수 OCID | 처리 | 조회 경로 |
|---|---|---|---|---|
| alarm | get | `--alarm-id` | dynamic-exact-name | oci monitoring alarm list |
| alarm | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| alarm | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| alarm | create | `--metric-compartment-id` | dynamic-compartment | oci iam compartment list |
| alarm | update | `--alarm-id` | dynamic-exact-name | oci monitoring alarm list |
| alarm | delete | `--alarm-id` | dynamic-exact-name | oci monitoring alarm list |
| announcement | get | `--announcement-id` | dynamic-exact-name | oci announce announcements list |
| announcement | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| autonomous-database | get | `--autonomous-database-id` | dynamic-exact-name | oci db autonomous-database list |
| autonomous-database | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| autonomous-database | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| autonomous-database | update | `--autonomous-database-id` | dynamic-exact-name | oci db autonomous-database list |
| autonomous-database | delete | `--autonomous-database-id` | dynamic-exact-name | oci db autonomous-database list |
| base-db | get | `--db-system-id` | dynamic-exact-name | oci db system list |
| base-db | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| base-db | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| base-db | create | `--subnet-id` | dynamic-exact-name | oci network subnet list |
| base-db | update | `--db-system-id` | dynamic-exact-name | oci db system list |
| base-db | delete | `--db-system-id` | dynamic-exact-name | oci db system list |
| block-volume | get | `--volume-id` | dynamic-exact-name | oci bv volume list |
| block-volume | update | `--volume-id` | dynamic-exact-name | oci bv volume list |
| block-volume | delete | `--volume-id` | dynamic-exact-name | oci bv volume list |
| boot-volume | get | `--boot-volume-id` | dynamic-exact-name | oci bv boot-volume list |
| boot-volume | update | `--boot-volume-id` | dynamic-exact-name | oci bv boot-volume list |
| boot-volume | delete | `--boot-volume-id` | dynamic-exact-name | oci bv boot-volume list |
| bucket | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| bucket | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| capacity-reservation | get | `--capacity-reservation-id` | dynamic-exact-name | oci compute capacity-reservation list |
| capacity-reservation | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| capacity-reservation | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| capacity-reservation | update | `--capacity-reservation-id` | dynamic-exact-name | oci compute capacity-reservation list |
| capacity-reservation | delete | `--capacity-reservation-id` | dynamic-exact-name | oci compute capacity-reservation list |
| compute-cluster | get | `--compute-cluster-id` | dynamic-exact-name | oci compute compute-cluster list |
| compute-cluster | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| compute-cluster | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| compute-cluster | update | `--compute-cluster-id` | dynamic-exact-name | oci compute compute-cluster list |
| compute-cluster | delete | `--compute-cluster-id` | dynamic-exact-name | oci compute compute-cluster list |
| custom-image | get | `--image-id` | dynamic-exact-name | oci compute image list |
| custom-image | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| custom-image | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| custom-image | update | `--image-id` | dynamic-exact-name | oci compute image list |
| custom-image | delete | `--image-id` | dynamic-exact-name | oci compute image list |
| dedicated-vm-host | get | `--dedicated-vm-host-id` | dynamic-exact-name | oci compute dedicated-vm-host list |
| dedicated-vm-host | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| dedicated-vm-host | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| dedicated-vm-host | update | `--dedicated-vm-host-id` | dynamic-exact-name | oci compute dedicated-vm-host list |
| dedicated-vm-host | delete | `--dedicated-vm-host-id` | dynamic-exact-name | oci compute dedicated-vm-host list |
| dhcp-options | get | `--dhcp-id` | dynamic-exact-name | oci network dhcp-options list |
| dhcp-options | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| dhcp-options | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| dhcp-options | create | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| dhcp-options | update | `--dhcp-id` | dynamic-exact-name | oci network dhcp-options list |
| dhcp-options | delete | `--dhcp-id` | dynamic-exact-name | oci network dhcp-options list |
| drg-attachment | get | `--drg-attachment-id` | dynamic-exact-name | oci network drg-attachment list |
| drg-attachment | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| drg-attachment | create | `--drg-id` | dynamic-exact-name | oci network drg list |
| drg-attachment | update | `--drg-attachment-id` | dynamic-exact-name | oci network drg-attachment list |
| drg-attachment | delete | `--drg-attachment-id` | dynamic-exact-name | oci network drg-attachment list |
| drg | get | `--drg-id` | dynamic-exact-name | oci network drg list |
| drg | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| drg | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| drg | update | `--drg-id` | dynamic-exact-name | oci network drg list |
| drg | delete | `--drg-id` | dynamic-exact-name | oci network drg list |
| export | get | `--export-id` | dynamic-exact-name | oci fs export list |
| export | create | `--export-set-id` | dynamic-exact-name | oci fs export-set list |
| export | create | `--file-system-id` | dynamic-exact-name | oci fs file-system list |
| export | update | `--export-id` | dynamic-exact-name | oci fs export list |
| export | delete | `--export-id` | dynamic-exact-name | oci fs export list |
| file-system | get | `--file-system-id` | dynamic-exact-name | oci fs file-system list |
| file-system | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| file-system | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| file-system | update | `--file-system-id` | dynamic-exact-name | oci fs file-system list |
| file-system | delete | `--file-system-id` | dynamic-exact-name | oci fs file-system list |
| instance-configuration | get | `--instance-configuration-id` | dynamic-exact-name | oci compute-management instance-configuration list |
| instance-configuration | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| instance-configuration | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| instance-configuration | update | `--instance-configuration-id` | dynamic-exact-name | oci compute-management instance-configuration list |
| instance-configuration | delete | `--instance-configuration-id` | dynamic-exact-name | oci compute-management instance-configuration list |
| instance-pool | get | `--instance-pool-id` | dynamic-exact-name | oci compute-management instance-pool list |
| instance-pool | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| instance-pool | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| instance-pool | create | `--instance-configuration-id` | dynamic-exact-name | oci compute-management instance-configuration list |
| instance-pool | update | `--instance-pool-id` | dynamic-exact-name | oci compute-management instance-pool list |
| instance-pool | delete | `--instance-pool-id` | dynamic-exact-name | oci compute-management instance-pool list |
| instance | get | `--instance-id` | dynamic-exact-name | oci compute instance list |
| instance | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| instance | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| instance | create | `--subnet-id` | dynamic-exact-name | oci network subnet list |
| instance | update | `--instance-id` | dynamic-exact-name | oci compute instance list |
| instance | delete | `--instance-id` | dynamic-exact-name | oci compute instance list |
| internet-gateway | get | `--ig-id` | dynamic-exact-name | oci network internet-gateway list |
| internet-gateway | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| internet-gateway | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| internet-gateway | create | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| internet-gateway | update | `--ig-id` | dynamic-exact-name | oci network internet-gateway list |
| internet-gateway | delete | `--ig-id` | dynamic-exact-name | oci network internet-gateway list |
| load-balancer | get | `--load-balancer-id` | dynamic-exact-name | oci lb load-balancer list |
| load-balancer | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| load-balancer | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| load-balancer | create | `--subnet-ids` | dynamic-exact-name | oci network subnet list |
| load-balancer | update | `--load-balancer-id` | dynamic-exact-name | oci lb load-balancer list |
| load-balancer | delete | `--load-balancer-id` | dynamic-exact-name | oci lb load-balancer list |
| local-peering-gateway | get | `--local-peering-gateway-id` | dynamic-exact-name | oci network local-peering-gateway list |
| local-peering-gateway | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| local-peering-gateway | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| local-peering-gateway | create | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| local-peering-gateway | update | `--local-peering-gateway-id` | dynamic-exact-name | oci network local-peering-gateway list |
| local-peering-gateway | delete | `--local-peering-gateway-id` | dynamic-exact-name | oci network local-peering-gateway list |
| mount-target | get | `--mount-target-id` | dynamic-exact-name | oci fs mount-target list |
| mount-target | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| mount-target | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| mount-target | create | `--subnet-id` | dynamic-exact-name | oci network subnet list |
| mount-target | update | `--mount-target-id` | dynamic-exact-name | oci fs mount-target list |
| mount-target | delete | `--mount-target-id` | dynamic-exact-name | oci fs mount-target list |
| mysql-backup | get | `--backup-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| mysql-backup | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| mysql-backup | create | `--db-system-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| mysql-backup | update | `--backup-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| mysql-backup | delete | `--backup-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| mysql | get | `--db-system-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| mysql | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| mysql | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| mysql | create | `--subnet-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| mysql | update | `--db-system-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| mysql | delete | `--db-system-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| nat-gateway | get | `--nat-gateway-id` | dynamic-exact-name | oci network nat-gateway list |
| nat-gateway | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| nat-gateway | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| nat-gateway | create | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| nat-gateway | update | `--nat-gateway-id` | dynamic-exact-name | oci network nat-gateway list |
| nat-gateway | delete | `--nat-gateway-id` | dynamic-exact-name | oci network nat-gateway list |
| network-load-balancer | get | `--network-load-balancer-id` | dynamic-exact-name | oci nlb network-load-balancer list |
| network-load-balancer | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| network-load-balancer | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| network-load-balancer | create | `--subnet-id` | dynamic-exact-name | oci network subnet list |
| network-load-balancer | update | `--network-load-balancer-id` | dynamic-exact-name | oci nlb network-load-balancer list |
| network-load-balancer | delete | `--network-load-balancer-id` | dynamic-exact-name | oci nlb network-load-balancer list |
| nsg | get | `--nsg-id` | dynamic-exact-name | oci network nsg list |
| nsg | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| nsg | create | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| nsg | update | `--nsg-id` | dynamic-exact-name | oci network nsg list |
| nsg | delete | `--nsg-id` | dynamic-exact-name | oci network nsg list |
| public-ip | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| public-ip | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| public-ip | update | `--public-ip-id` | dynamic-exact-name | oci network public-ip list |
| public-ip | delete | `--public-ip-id` | dynamic-exact-name | oci network public-ip list |
| remote-peering-connection | get | `--remote-peering-connection-id` | dynamic-exact-name | oci network remote-peering-connection list |
| remote-peering-connection | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| remote-peering-connection | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| remote-peering-connection | create | `--drg-id` | dynamic-exact-name | oci network drg list |
| remote-peering-connection | update | `--remote-peering-connection-id` | dynamic-exact-name | oci network remote-peering-connection list |
| remote-peering-connection | delete | `--remote-peering-connection-id` | dynamic-exact-name | oci network remote-peering-connection list |
| route-table | get | `--rt-id` | dynamic-exact-name | oci network route-table list |
| route-table | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| route-table | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| route-table | create | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| route-table | update | `--rt-id` | dynamic-exact-name | oci network route-table list |
| route-table | delete | `--rt-id` | dynamic-exact-name | oci network route-table list |
| security-list | get | `--security-list-id` | dynamic-exact-name | oci network security-list list |
| security-list | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| security-list | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| security-list | create | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| security-list | update | `--security-list-id` | dynamic-exact-name | oci network security-list list |
| security-list | delete | `--security-list-id` | dynamic-exact-name | oci network security-list list |
| service-gateway | get | `--service-gateway-id` | dynamic-exact-name | oci network service-gateway list |
| service-gateway | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| service-gateway | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| service-gateway | create | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| service-gateway | update | `--service-gateway-id` | dynamic-exact-name | oci network service-gateway list |
| service-gateway | delete | `--service-gateway-id` | dynamic-exact-name | oci network service-gateway list |
| subnet | get | `--subnet-id` | dynamic-exact-name | oci network subnet list |
| subnet | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| subnet | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| subnet | create | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| subnet | update | `--subnet-id` | dynamic-exact-name | oci network subnet list |
| subnet | delete | `--subnet-id` | dynamic-exact-name | oci network subnet list |
| subscription-balance | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| subscription-balance | list | `--subscription-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
| subscription-list | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| subscription | get | `--subscription-id` | dynamic-exact-name | oci ons subscription list |
| subscription | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| subscription | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| subscription | create | `--topic-id` | dynamic-exact-name | oci ons topic list |
| subscription | update | `--subscription-id` | dynamic-exact-name | oci ons subscription list |
| subscription | delete | `--subscription-id` | dynamic-exact-name | oci ons subscription list |
| support-incident | get | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| support-incident | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| support-incident | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| support-incident | update | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| topic | get | `--topic-id` | dynamic-exact-name | oci ons topic list |
| topic | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| topic | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| topic | update | `--topic-id` | dynamic-exact-name | oci ons topic list |
| topic | delete | `--topic-id` | dynamic-exact-name | oci ons topic list |
| vcn | get | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| vcn | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| vcn | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| vcn | update | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| vcn | delete | `--vcn-id` | dynamic-exact-name | oci network vcn list |
| volume-backup-policy | get | `--policy-id` | dynamic-exact-name | oci bv volume-backup-policy list |
| volume-backup-policy | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| volume-backup-policy | update | `--policy-id` | dynamic-exact-name | oci bv volume-backup-policy list |
| volume-backup-policy | delete | `--policy-id` | dynamic-exact-name | oci bv volume-backup-policy list |
| volume-group | get | `--volume-group-id` | dynamic-exact-name | oci bv volume-group list |
| volume-group | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| volume-group | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| volume-group | update | `--volume-group-id` | dynamic-exact-name | oci bv volume-group list |
| volume-group | delete | `--volume-group-id` | dynamic-exact-name | oci bv volume-group list |
| compartment-resource-cleansing | custom | `--compartment-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
| iam-user-mfa-reset | custom | `--user-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-compartment | get | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| iam-compartment | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| iam-compartment | update | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| iam-compartment | delete | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| iam-user | get | `--user-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-user | update | `--user-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-user | delete | `--user-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-user | action:reset-password | `--user-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-user | action:assign-group | `--user-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-user | action:assign-group | `--group-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-user | action:upload-api-key | `--user-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-group | get | `--group-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-group | update | `--group-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-group | delete | `--group-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-policy | get | `--policy-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-policy | list | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| iam-policy | create | `--compartment-id` | dynamic-compartment | oci iam compartment list |
| iam-policy | update | `--policy-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| iam-policy | delete | `--policy-id` | dynamic-dedicated | 전용 0/1/N 안전 빌더 |
| instance-maintenance-reboot | custom | `--instance-id` | dynamic-exact-name | oci compute instance list |
| boot-volume-cross-copy | custom | `--compartment-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
| boot-volume-cross-copy | custom | `--source-tenancy-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
| boot-volume-cross-copy | custom | `--target-group-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
| boot-volume-cross-copy | custom | `--dest-tenancy-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
| boot-volume-cross-copy | custom | `--source-boot-volume-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
| block-volume-cross-copy | custom | `--compartment-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
| block-volume-cross-copy | custom | `--source-tenancy-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
| block-volume-cross-copy | custom | `--target-group-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
| block-volume-cross-copy | custom | `--dest-tenancy-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
| block-volume-cross-copy | custom | `--source-volume-id` | direct-only | 선행 LIST 확인 후 직접 입력 |
