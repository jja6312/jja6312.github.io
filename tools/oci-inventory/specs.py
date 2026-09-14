"""Reviewed configuration inventories. No data-plane contents or credential APIs.

Bindings identify LIST scope: compartment, tenancy, AD, or a discovered parent.
Unknown SDK signatures are reported as unsupported, never guessed at runtime.
"""
from dataclasses import dataclass

CLIENTS = {
    'iam': ('identity', 'IdentityClient'), 'network': ('core', 'VirtualNetworkClient'),
    'compute': ('core', 'ComputeClient'), 'cm': ('core', 'ComputeManagementClient'),
    'block': ('core', 'BlockstorageClient'), 'auto': ('autoscaling', 'AutoScalingClient'),
    'object': ('object_storage', 'ObjectStorageClient'), 'fss': ('file_storage', 'FileStorageClient'),
    'lb': ('load_balancer', 'LoadBalancerClient'), 'nlb': ('network_load_balancer', 'NetworkLoadBalancerClient'),
    'dns': ('dns', 'DnsClient'), 'db': ('database', 'DatabaseClient'),
    'mysql': ('mysql', 'DbSystemClient'), 'mysql_backup': ('mysql', 'DbBackupsClient'), 'mysql_config': ('mysql', 'MysqlaasClient'),
    'psql': ('psql', 'PostgresqlClient'), 'redis': ('redis', 'RedisClusterClient'),
    'oke': ('container_engine', 'ContainerEngineClient'), 'ci': ('container_instances', 'ContainerInstanceClient'),
    'fn': ('functions', 'FunctionsManagementClient'), 'api': ('apigateway', 'GatewayClient'),
    'deploy': ('apigateway', 'DeploymentClient'), 'devops': ('devops', 'DevopsClient'),
    'artifacts': ('artifacts', 'ArtifactsClient'), 'bastion': ('bastion', 'BastionClient'),
    'waf': ('waf', 'WafClient'), 'cert': ('certificates_management', 'CertificatesManagementClient'),
    'vault': ('key_management', 'KmsVaultClient'), 'secrets': ('vault', 'VaultsClient'),
    'kms': ('key_management', 'KmsManagementClient'),
    'cg': ('cloud_guard', 'CloudGuardClient'), 'monitor': ('monitoring', 'MonitoringClient'),
    'logging': ('logging', 'LoggingManagementClient'), 'ons': ('ons', 'NotificationControlPlaneClient'),
    'ons_data': ('ons', 'NotificationDataPlaneClient'), 'events': ('events', 'EventsClient'),
    'sch': ('sch', 'ServiceConnectorClient'), 'budget': ('budget', 'BudgetClient'),
    'quota': ('limits', 'QuotasClient'), 'scheduler': ('resource_scheduler', 'ScheduleClient'),
    'recovery': ('recovery', 'DatabaseRecoveryClient'), 'stream': ('streaming', 'StreamAdminClient'),
    'dataflow': ('data_flow', 'DataFlowClient'), 'ds': ('data_science', 'DataScienceClient'),
    'analytics': ('analytics', 'AnalyticsClient'), 'nosql': ('nosql', 'NosqlClient'),
    'search': ('resource_search', 'ResourceSearchClient'), 'domains': ('identity_domains', 'IdentityDomainsClient'),
    'osmh_source': ('os_management_hub', 'SoftwareSourceClient'),
    'osmh_profile': ('os_management_hub', 'OnboardingClient'),
    'osmh_instance': ('os_management_hub', 'ManagedInstanceClient'),
    'orm': ('resource_manager', 'ResourceManagerClient'),
    'la': ('log_analytics', 'LogAnalyticsClient'),
    'dashboard_group': ('dashboard_service', 'DashboardGroupClient'),
    'dashboard': ('dashboard_service', 'DashboardClient'),
    'email': ('email', 'EmailClient'), 'jms': ('jms', 'JavaManagementServiceClient'),
    'waa': ('waa', 'WaaClient'),
}

@dataclass(frozen=True)
class Spec:
    kind: str
    client: str
    listing: str
    get: str | None
    bindings: tuple
    group: int
    home: bool = False
    immutable: bool = False

SPECS: list[Spec] = []
def add(client, group, rows, *, home=False):
    for row in rows:
        kind, listing, get, *scope = row.split('|')
        bindings = tuple(tuple(x.split('=', 1)) for x in (scope[0] if scope else 'compartment_id=compartment').split(',') if x)
        SPECS.append(Spec(kind, client, listing, get or None, bindings, group, home, kind == 'Image'))

add('compute',100,[
 'Instance|list_instances|get_instance','Image|list_images|get_image',
 'VnicAttachment|list_vnic_attachments|get_vnic_attachment',
 'VolumeAttachment|list_volume_attachments|get_volume_attachment',
 'BootVolumeAttachment|list_boot_volume_attachments|get_boot_volume_attachment|compartment_id=compartment,availability_domain=ad',
 'DedicatedVmHost|list_dedicated_vm_hosts|get_dedicated_vm_host',
 'ComputeCapacityReservation|list_compute_capacity_reservations|get_compute_capacity_reservation|compartment_id=compartment,availability_domain=ad',
])
add('cm',110,['InstancePool|list_instance_pools|get_instance_pool','InstanceConfiguration|list_instance_configurations|get_instance_configuration','ClusterNetwork|list_cluster_networks|get_cluster_network'])
add('auto',110,['AutoScalingConfiguration|list_auto_scaling_configurations|get_auto_scaling_configuration'])
add('block',200,[
 'Volume|list_volumes|get_volume','BootVolume|list_boot_volumes|get_boot_volume|compartment_id=compartment,availability_domain=ad',
 'VolumeBackup|list_volume_backups|get_volume_backup','BootVolumeBackup|list_boot_volume_backups|get_boot_volume_backup',
 'VolumeGroup|list_volume_groups|get_volume_group','VolumeGroupBackup|list_volume_group_backups|get_volume_group_backup',
 'VolumeBackupPolicy|list_volume_backup_policies|get_volume_backup_policy',
 'VolumeReplica|list_block_volume_replicas|get_block_volume_replica|compartment_id=compartment,availability_domain=ad',
 'BootVolumeReplica|list_boot_volume_replicas|get_boot_volume_replica|compartment_id=compartment,availability_domain=ad',
 'VolumeBackupPolicyAssignment|get_volume_backup_policy_asset_assignment|get_volume_backup_policy_assignment|asset_id=Volume.id',
 'BootVolumeBackupPolicyAssignment|get_volume_backup_policy_asset_assignment|get_volume_backup_policy_assignment|asset_id=BootVolume.id',
])
add('object',210,['Bucket|list_buckets|get_bucket|namespace_name=namespace,compartment_id=compartment'])
add('fss',220,[
 'FileSystem|list_file_systems|get_file_system|compartment_id=compartment,availability_domain=ad',
 'MountTarget|list_mount_targets|get_mount_target|compartment_id=compartment,availability_domain=ad',
 'ExportSet|list_export_sets|get_export_set|compartment_id=compartment,availability_domain=ad',
 'Export|list_exports|get_export','FileSystemSnapshot|list_snapshots|get_snapshot|file_system_id=FileSystem.id',
 'FileSystemSnapshotPolicy|list_filesystem_snapshot_policies|get_filesystem_snapshot_policy|compartment_id=compartment,availability_domain=ad',
 'FileSystemReplication|list_replications|get_replication|compartment_id=compartment,availability_domain=ad',
])
add('network',300,[
 'Vcn|list_vcns|get_vcn','Subnet|list_subnets|get_subnet',
 'RouteTable|list_route_tables|get_route_table','SecurityList|list_security_lists|get_security_list',
 'DhcpOptions|list_dhcp_options|get_dhcp_options','NetworkSecurityGroup|list_network_security_groups|get_network_security_group',
 'InternetGateway|list_internet_gateways|get_internet_gateway','NatGateway|list_nat_gateways|get_nat_gateway',
 'ServiceGateway|list_service_gateways|get_service_gateway','LocalPeeringGateway|list_local_peering_gateways|get_local_peering_gateway',
 'PublicIp|list_public_ips|get_public_ip|compartment_id=compartment,scope=#REGION',
 'PublicIp|list_public_ips|get_public_ip|compartment_id=compartment,scope=#AVAILABILITY_DOMAIN,availability_domain=ad',
 'PrivateIp|list_private_ips|get_private_ip|subnet_id=Subnet.id',
 'Drg|list_drgs|get_drg','DrgAttachment|list_drg_attachments|get_drg_attachment',
 'DrgRouteTable|list_drg_route_tables|get_drg_route_table|drg_id=Drg.id',
 'DrgRouteDistribution|list_drg_route_distributions|get_drg_route_distribution|drg_id=Drg.id',
 'RemotePeeringConnection|list_remote_peering_connections|get_remote_peering_connection',
 'Cpe|list_cpes|get_cpe','IPSecConnection|list_ip_sec_connections|get_ip_sec_connection',
 'IPSecTunnel|list_ip_sec_connection_tunnels|get_ip_sec_connection_tunnel|ipsc_id=IPSecConnection.id',
 'VirtualCircuit|list_virtual_circuits|get_virtual_circuit','CrossConnect|list_cross_connects|get_cross_connect',
 'CrossConnectGroup|list_cross_connect_groups|get_cross_connect_group','Vtap|list_vtaps|get_vtap',
 'CaptureFilter|list_capture_filters|get_capture_filter','PublicIpPool|list_public_ip_pools|get_public_ip_pool',
 'ByoipRange|list_byoip_ranges|get_byoip_range',
])
add('lb',330,['LoadBalancer|list_load_balancers|get_load_balancer'])
add('nlb',330,['NetworkLoadBalancer|list_network_load_balancers|get_network_load_balancer'])
add('dns',340,['DnsZone|list_zones|get_zone|compartment_id=compartment,scope=#GLOBAL','DnsZone|list_zones|get_zone|compartment_id=compartment,scope=#PRIVATE','DnsView|list_views|get_view','DnsResolver|list_resolvers|get_resolver','DnsSteeringPolicy|list_steering_policies|get_steering_policy','DnsSteeringPolicyAttachment|list_steering_policy_attachments|get_steering_policy_attachment'])
add('db',400,[
 'DbSystem|list_db_systems|get_db_system','DbHome|list_db_homes|get_db_home',
 'Database|list_databases|get_database|compartment_id=compartment,db_home_id=DbHome.id',
 'DbNode|list_db_nodes|get_db_node|compartment_id=compartment,db_system_id=DbSystem.id',
 'DbBackup|list_backups|get_backup','AutonomousDatabase|list_autonomous_databases|get_autonomous_database',
 'AutonomousDatabaseBackup|list_autonomous_database_backups|get_autonomous_database_backup|autonomous_database_id=AutonomousDatabase.id',
 'AutonomousContainerDatabase|list_autonomous_container_databases|get_autonomous_container_database',
 'AutonomousVmCluster|list_autonomous_vm_clusters|get_autonomous_vm_cluster',
 'CloudAutonomousVmCluster|list_cloud_autonomous_vm_clusters|get_cloud_autonomous_vm_cluster',
 'CloudVmCluster|list_cloud_vm_clusters|get_cloud_vm_cluster',
 'CloudExadataInfrastructure|list_cloud_exadata_infrastructures|get_cloud_exadata_infrastructure',
 'ExadataInfrastructure|list_exadata_infrastructures|get_exadata_infrastructure',
 'VmCluster|list_vm_clusters|get_vm_cluster','DatabaseSoftwareImage|list_database_software_images|get_database_software_image',
 'PluggableDatabase|list_pluggable_databases|get_pluggable_database|database_id=Database.id',
])
add('mysql',500,['MySqlDbSystem|list_db_systems|get_db_system'])
add('mysql_backup',500,['MySqlBackup|list_backups|get_backup'])
add('mysql_config',500,['MySqlConfiguration|list_configurations|get_configuration'])
add('psql',510,['PostgresqlDbSystem|list_db_systems|get_db_system','PostgresqlBackup|list_backups|get_backup','PostgresqlConfiguration|list_configurations|get_configuration'])
add('redis',520,['RedisCluster|list_redis_clusters|get_redis_cluster'])
add('nosql',530,['NoSqlTable|list_tables|get_table'])
add('analytics',600,['AnalyticsInstance|list_analytics_instances|get_analytics_instance'])
add('ds',610,['DataScienceProject|list_projects|get_project','DataScienceNotebookSession|list_notebook_sessions|get_notebook_session','DataScienceModel|list_models|get_model','DataScienceModelDeployment|list_model_deployments|get_model_deployment','DataScienceJob|list_jobs|get_job'])
add('dataflow',620,['DataFlowApplication|list_applications|get_application','DataFlowPool|list_pools|get_pool'])
add('oke',700,['Cluster|list_clusters|get_cluster','NodePool|list_node_pools|get_node_pool','VirtualNodePool|list_virtual_node_pools|get_virtual_node_pool','OkeAddon|list_addons|get_addon|cluster_id=Cluster.id','VirtualNode|list_virtual_nodes|get_virtual_node|virtual_node_pool_id=VirtualNodePool.id'])
add('ci',710,['ContainerInstance|list_container_instances|get_container_instance'])
add('fn',720,['FunctionsApplication|list_applications|get_application','FunctionsFunction|list_functions|get_function|application_id=FunctionsApplication.id'])
add('api',730,['ApiGateway|list_gateways|get_gateway'])
add('deploy',730,['ApiDeployment|list_deployments|get_deployment'])
add('devops',740,[
 'DevopsProject|list_projects|get_project','DevopsRepository|list_repositories|get_repository',
 'DevopsBuildPipeline|list_build_pipelines|get_build_pipeline',
 'DevopsBuildPipelineStage|list_build_pipeline_stages|get_build_pipeline_stage|build_pipeline_id=DevopsBuildPipeline.id',
 'DevopsDeployPipeline|list_deploy_pipelines|get_deploy_pipeline',
 'DevopsDeployStage|list_deploy_stages|get_deploy_stage|deploy_pipeline_id=DevopsDeployPipeline.id',
 'DevopsDeployArtifact|list_deploy_artifacts|get_deploy_artifact',
 'DevopsDeployEnvironment|list_deploy_environments|get_deploy_environment',
 'DevopsTrigger|list_triggers|get_trigger','DevopsConnection|list_connections|get_connection',
])
add('artifacts',750,['ContainerRepository|list_container_repositories|get_container_repository','ContainerImage|list_container_images|get_container_image','ArtifactRepository|list_repositories|get_repository'])
add('stream',760,['StreamPool|list_stream_pools|get_stream_pool','Stream|list_streams|get_stream'])
add('iam',800,[
 'Compartment|list_compartments|get_compartment|compartment_id=tenancy',
 'Policy|list_policies|get_policy','Domain|list_domains|get_domain',
 'User|list_users|get_user|compartment_id=tenancy','Group|list_groups|get_group|compartment_id=tenancy',
 'DynamicGroup|list_dynamic_groups|get_dynamic_group|compartment_id=tenancy',
 'UserGroupMembership|list_user_group_memberships|get_user_group_membership|compartment_id=tenancy,group_id=Group.id',
 'IdentityProvider|list_identity_providers|get_identity_provider|compartment_id=tenancy,protocol=#SAML2',
 'TagNamespace|list_tag_namespaces|get_tag_namespace','Tag|list_tags|get_tag|tag_namespace_id=TagNamespace.id',
 'TagDefault|list_tag_defaults|get_tag_default',
],home=True)
add('bastion',810,['Bastion|list_bastions|get_bastion'])
add('cert',820,['Certificate|list_certificates|get_certificate','CertificateAuthority|list_certificate_authorities|get_certificate_authority','CaBundle|list_ca_bundles|get_ca_bundle'])
add('vault',820,['Vault|list_vaults|get_vault'])
add('secrets',820,['VaultSecret|list_secrets|get_secret'])
add('kms',820,['Key|list_keys|get_key|compartment_id=compartment,_endpoint=Vault.management_endpoint'])
add('waf',830,['WebAppFirewall|list_web_app_firewalls|get_web_app_firewall','WebAppFirewallPolicy|list_web_app_firewall_policies|get_web_app_firewall_policy'])
add('cg',840,['CloudGuardTarget|list_targets|get_target','CloudGuardDetectorRecipe|list_detector_recipes|get_detector_recipe','CloudGuardResponderRecipe|list_responder_recipes|get_responder_recipe','CloudGuardManagedList|list_managed_lists|get_managed_list'])
add('monitor',900,['Alarm|list_alarms|get_alarm'])
add('logging',910,['LogGroup|list_log_groups|get_log_group','Log|list_logs|get_log|log_group_id=LogGroup.id','UnifiedAgentConfiguration|list_unified_agent_configurations|get_unified_agent_configuration'])
add('ons',920,['OnsTopic|list_topics|get_topic'])
add('ons_data',920,['OnsSubscription|list_subscriptions|get_subscription'])
add('events',930,['EventRule|list_rules|get_rule'])
add('sch',930,['ServiceConnector|list_service_connectors|get_service_connector'])
add('scheduler',930,['ResourceSchedule|list_schedules|get_schedule'])
add('budget',1200,['Budget|list_budgets|get_budget|compartment_id=tenancy','BudgetAlertRule|list_alert_rules|get_alert_rule|budget_id=Budget.id'],home=True)
add('quota',1300,['Quota|list_quotas|get_quota'],home=True)
add('recovery',410,['ProtectedDatabase|list_protected_databases|get_protected_database','ProtectionPolicy|list_protection_policies|get_protection_policy','RecoveryServiceSubnet|list_recovery_service_subnets|get_recovery_service_subnet'])
add('osmh_source',120,['OsmhSoftwareSource|list_software_sources|get_software_source'])
add('osmh_profile',120,['OsmhProfile|list_profiles|get_profile'])
add('osmh_instance',120,['OsmhManagedInstance|list_managed_instances|get_managed_instance'])
add('orm',770,['OrmStack|list_stacks|get_stack','OrmJob|list_jobs|get_job'])
add('la',940,['LogAnalyticsNamespace|list_namespaces|get_namespace|compartment_id=tenancy','LogAnalyticsEntity|list_log_analytics_entities|get_log_analytics_entity|namespace_name=LogAnalyticsNamespace.namespace_name,compartment_id=all_compartments'])
add('dashboard_group',950,['ConsoleDashboardGroup|list_dashboard_groups|get_dashboard_group'])
add('dashboard',950,['ConsoleDashboard|list_dashboards|get_dashboard|dashboard_group_id=ConsoleDashboardGroup.id'])
add('email',920,['EmailSender|list_senders|get_sender'])
add('jms',960,['JmsFleet|list_fleets|get_fleet'])
add('waa',330,['WebAppAcceleration|list_web_app_accelerations|get_web_app_acceleration','WebAppAccelerationPolicy|list_web_app_acceleration_policies|get_web_app_acceleration_policy'])
add('devops',740,['DevopsDeployment|list_deployments|get_deployment','DevopsBuildRun|list_build_runs|get_build_run'])

# These are children/configuration lists, not separately counted parent resources.
CHILDREN = {
 'NetworkSecurityGroup': [('network','list_network_security_group_security_rules','network_security_group_id','security_rules'),('network','list_network_security_group_vnics','network_security_group_id','vnics')],
 'DrgRouteTable': [('network','list_drg_route_rules','drg_route_table_id','route_rules')],
 'DrgRouteDistribution': [('network','list_drg_route_distribution_statements','drg_route_distribution_id','statements')],
 'DnsZone': [('dns','get_zone_records','zone_name_or_id','records')],
}
EXTRA = {
 'iam': {'get_tenancy','list_region_subscriptions','list_availability_domains','list_compartments','get_authentication_policy'},
 'search': {'list_resource_types','search_resources'}, 'object': {'get_namespace','get_object_lifecycle_policy','list_retention_rules','list_replication_policies'},
 'network': {'get_vnic','get_networking_topology','list_network_security_group_security_rules','list_network_security_group_vnics','list_drg_route_rules','list_drg_route_distribution_statements'},
 'monitor': {'list_metrics','summarize_metrics_data'},
 'domains': {'list_users','list_groups','list_apps','list_policies','list_rules','list_identity_providers','list_password_policies','list_authentication_factor_settings','list_dynamic_resource_groups','list_app_roles','get_user','get_group','get_app','get_policy','get_rule','get_password_policy','get_identity_provider'},
 'dns': {'get_zone_records'},
}
ALLOWLIST = {key: set(EXTRA.get(key, set())) for key in CLIENTS}
for spec in SPECS:
    ALLOWLIST[spec.client].add(spec.listing)
    if spec.get: ALLOWLIST[spec.client].add(spec.get)
for children in CHILDREN.values():
    for client, method, _, _ in children: ALLOWLIST[client].add(method)

GROUPS = {100:'Compute',110:'ComputeManagement',200:'BlockStorage',210:'ObjectStorage',220:'FileStorage',300:'Network',330:'LoadBalancer',340:'DNS',400:'OracleDatabase',410:'Recovery',500:'MySQL',510:'PostgreSQL',520:'Cache',530:'NoSQL',600:'Analytics',610:'DataScience',620:'DataFlow',700:'OKE',710:'ContainerInstances',720:'Functions',730:'APIGateway',740:'DevOps',750:'Artifacts',760:'Streaming',800:'Identity',810:'Bastion',820:'KeysCertificates',830:'WAF',840:'CloudGuard',900:'Monitoring',910:'Logging',920:'Notifications',930:'Operations',1200:'Billing',1300:'Governance',9900:'Unmapped'}
def normalized(value): return ''.join(c for c in value.lower() if c.isalnum())
GROUPS.update({120:'OSManagement',770:'ResourceManager',940:'LogAnalytics',950:'Dashboards',960:'JavaManagement'})
BY_KIND = {normalized(s.kind): s for s in SPECS}
BY_KIND['vnic']=Spec('Vnic','network','get_vnic','get_vnic',(),300)
ALIASES = {'identitydomain':'domain','customerdnszone':'dnszone','containerrepo':'containerrepository','dynamicresourcegroup':'dynamicgroup','apigateway':'apigateway','ipsecconnection':'ipsecconnection','mysqldbsystem':'mysqldbsystem','databasesoftwareimage':'databasesoftwareimage'}
def find_spec(kind): return BY_KIND.get(ALIASES.get(normalized(kind), normalized(kind)))
