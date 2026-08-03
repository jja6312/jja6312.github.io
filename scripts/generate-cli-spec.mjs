#!/usr/bin/env node
// blog-db/knowledge/oci-cli/_data (CLI 소스 AST 추출 백본) → src/data/cliSpec.json
// CLI 빌더 UI의 데이터. 명령 구문(verbatim)은 같은 폴더의 레시피 md에서 추출해 대조한다.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI_DIR = resolve(SITE, '..', 'blog-db', 'knowledge', 'oci-cli')
const DATA = join(CLI_DIR, '_data')
const OUT = join(SITE, 'src', 'data', 'cliSpec.json')

const CAT_LABEL = {
  '02-compute': 'Compute',
  '03-storage': 'Storage',
  '04-network': 'Network',
  '05-database': 'Oracle Database',
  '06-observability': 'Observability',
}

// 자주 쓰는 기본값 — dropdown 기본 선택/placeholder 프리필 (사용자 요구)
const DEFAULTS = {
  instance: { '--shape': 'VM.Standard.E4.Flex' },
  'block-volume': { '--size-in-gbs': '50' },
  bucket: { '--public-access-type': 'NoPublicAccess' },
  vcn: { '--cidr-blocks': '["10.0.0.0/16"]' },
  subnet: { '--prohibit-public-ip-on-vnic': true },
  'autonomous