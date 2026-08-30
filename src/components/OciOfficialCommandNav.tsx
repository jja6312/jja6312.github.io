import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  loadOfficialCliIndex,
  loadOfficialCliService,
  type OfficialCliCommand,
  type OfficialCliIndex,
  type OfficialCliServiceShard,
} from '../lib/oci-cli/officialCatalog'
import { sortOciConsoleCategories } from '../lib/ociConsoleNavigation'

interface CommandTreeNode {
  id: string
  label: string
  command?: OfficialCliCommand
  children: CommandTreeNode[]
}

function buildCommandTree(service: string, commands: OfficialCliCommand[]): CommandTreeNode[] {
  interface MutableNode { id: string; label: string; command?: OfficialCliCommand; children: Map<string, MutableNode> }
  const root = new Map<string, MutableNode>()
  for (const command of commands) {
    let level = root
    const trail: string[] = [service]
    command.segments.forEach((segment, index) => {
      trail.push(segment)
      let node = level.get(segment)
      if (!node) {
        node = { id: trail.join('/'), label: segment, children: new Map() }
        level.set(segment, node)
      }
      if (index === command.segments.length - 1) node.command = command
      level = node.children
    })
  }
  const freeze = (items: Map<string, MutableNode>): CommandTreeNode[] => [...items.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(node => ({ ...node, children: freeze(node.children) }))
  return freeze(root)
}

function TreeItems({ nodes, depth, openNodes, activePath, curatedPaths, onToggle, onSelect }: {
  nodes: CommandTreeNode[]
  depth: number
  openNodes: Set<string>
  activePath?: string
  curatedPaths: ReadonlyMap<string, unknown>
  onToggle: (id: string) => void
  onSelect: (command: OfficialCliCommand) => void
}) {
  return nodes.map(node => {
    const branch = node.children.length > 0
    const open = openNodes.has(node.id)
    const curated = node.command ? curatedPaths.has(node.command.path) : false
    return (
      <div key={node.id} className="oci-official-tree-node">
        <button type="button"
          className={`oci-official-tree-item${node.command?.path === activePath ? ' on' : ''}${curated ? ' curated' : ''}`}
          style={{ '--official-depth': depth } as CSSProperties}
          onClick={() => branch ? onToggle(node.id) : node.command && onSelect(node.command)}
          title={node.command?.help || node.label}>
          <span className={`caret${branch && open ? ' open' : ''}`} aria-hidden="true">{branch ? '▸' : '·'}</span>
          <span>{node.label}</span>
          {node.command && <span className={`oci-official-status${curated ? ' curated' : ''}`}>{curated ? '강화' : '공식'}</span>}
        </button>
        {branch && open && <TreeItems nodes={node.children} depth={depth + 1} openNodes={openNodes}
          activePath={activePath} curatedPaths={curatedPaths} onToggle={onToggle} onSelect={onSelect} />}
      </div>
    )
  })
}

export default function OciOfficialCommandNav({ activePath, curatedPaths, onSelect }: {
  activePath?: string
  curatedPaths: ReadonlyMap<string, unknown>
  onSelect: (command: OfficialCliCommand) => void
}) {
  const [index, setIndex] = useState<OfficialCliIndex | null>(null)
  const [shards, setShards] = useState<Record<string, OfficialCliServiceShard>>({})
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [activeService, setActiveService] = useState('')
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set())
  const [loadingService, setLoadingService] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    loadOfficialCliIndex()
      .then(value => { if (alive) setIndex(value) })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { alive = false }
  }, [])

  const serviceMap = useMemo(() => new Map(index?.services.map(service => [service.key, service]) ?? []), [index])
  const consoleGroups = useMemo(() => sortOciConsoleCategories(index?.groups ?? []), [index])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const searchResults = useMemo(() => {
    if (!index || !normalizedQuery) return []
    return index.commandIndex.filter(command => {
      const service = serviceMap.get(command.service)
      return command.path.toLocaleLowerCase().includes(normalizedQuery)
        || command.help.toLocaleLowerCase().includes(normalizedQuery)
        || service?.label.toLocaleLowerCase().includes(normalizedQuery)
    }).slice(0, 120)
  }, [index, normalizedQuery, serviceMap])

  const selectService = async (service: string, forceOpen = false) => {
    if (!forceOpen && activeService === service) { setActiveService(''); return }
    setActiveService(service)
    setError('')
    if (shards[service]) return
    setLoadingService(service)
    try {
      const shard = await loadOfficialCliService(service)
      setShards(current => ({ ...current, [service]: shard }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setLoadingService('') }
  }

  const selectSearchResult = async (path: string, service: string) => {
    await selectService(service, true)
    try {
      const shard = shards[service] ?? await loadOfficialCliService(service)
      setShards(current => current[service] ? current : ({ ...current, [service]: shard }))
      const command = shard.commands.find(item => item.path === path)
      if (!command) throw new Error(`공식 명령을 찾지 못했습니다: ${path}`)
      onSelect(command)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const tree = useMemo(() => activeService && shards[activeService]
    ? buildCommandTree(activeService, shards[activeService].commands)
    : [], [activeService, shards])
  const toggleNode = (id: string) => setOpenNodes(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <section className="oci-official-nav" aria-label="전체 공식 OCI CLI 명령">
      <div className="oci-official-heading">
        <span>OFFICIAL CLI</span>
        {index && <b>v{index.source.version}</b>}
      </div>
      {index && <div className="oci-official-totals">
        <span>{index.totals.services} services</span><span>{index.totals.commands.toLocaleString()} commands</span>
      </div>}
      <label className="oci-official-search">
        <span aria-hidden="true">⌕</span>
        <input value={query} onChange={event => setQuery(event.target.value)}
          placeholder="서비스·명령·설명 검색" aria-label="전체 공식 OCI CLI 검색" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="검색어 지우기">×</button>}
      </label>
      {error && <p className="oci-official-error">{error}</p>}
      {!index && !error && <p className="oci-official-loading">공식 명령 인덱스 불러오는 중…</p>}
      {index && normalizedQuery ? (
        <div className="oci-official-results">
          <div className="oci-official-result-count">{searchResults.length === 120 ? '상위 120개' : `${searchResults.length}개`} 결과</div>
          {searchResults.map(result => {
            const curated = curatedPaths.has(result.path)
            return <button type="button" key={result.path}
              className={`oci-official-result${activePath === result.path ? ' on' : ''}${curated ? ' curated' : ''}`}
              onClick={() => void selectSearchResult(result.path, result.service)}>
              <code>{result.path}</code>
              <span>{result.help || serviceMap.get(result.service)?.label}</span>
              <em>{curated ? '운영 강화' : '공식 수록'}</em>
            </button>
          })}
          {!searchResults.length && <p className="oci-official-empty">일치하는 공식 명령이 없습니다.</p>}
        </div>
      ) : index ? (
        <div className="oci-official-groups">
          {consoleGroups.map(group => {
            const open = openGroups.has(group.label)
            return <div key={group.label} className="oci-official-group">
              <button type="button" className="oci-official-group-toggle" onClick={() => setOpenGroups(current => {
                const next = new Set(current)
                if (next.has(group.label)) next.delete(group.label); else next.add(group.label)
                return next
              })} aria-expanded={open}>
                <span className={`caret${open ? ' open' : ''}`}>▸</span>
                <span>{group.label}</span><b>{group.services.length}</b>
              </button>
              {open && group.services.map(serviceKey => {
                const service = serviceMap.get(serviceKey)
                const selected = activeService === serviceKey
                return <div key={serviceKey} className="oci-official-service">
                  <button type="button" className={`oci-official-service-toggle${selected ? ' on' : ''}`}
                    onClick={() => void selectService(serviceKey)} aria-expanded={selected}>
                    <span className={`caret${selected ? ' open' : ''}`}>▸</span>
                    <span title={serviceKey}>{service?.label ?? serviceKey}</span><b>{service?.commandCount ?? 0}</b>
                  </button>
                  {selected && loadingService === serviceKey && <p className="oci-official-loading">명령 불러오는 중…</p>}
                  {selected && tree.length > 0 && <div className="oci-official-tree">
                    <TreeItems nodes={tree} depth={0} openNodes={openNodes} activePath={activePath}
                      curatedPaths={curatedPaths} onToggle={toggleNode} onSelect={onSelect} />
                  </div>}
                </div>
              })}
            </div>
          })}
        </div>
      ) : null}
    </section>
  )
}
