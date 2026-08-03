#!/usr/bin/env node
// blog-db(learning/) → src/data/generated.json 변환기
//
// 목적: 학습지는 blog-db 의 md/json 에만 쓴다 (단일 소스). 이 스크립트가 사이트
// 데이터로 변환하고, 산출물(generated.json)은 커밋한다 — CI 는 blog-db 없이 빌드.
//
// 사용: npm run gen   (blog-db 는 cc3 워크스페이스의 형제 폴더 ../blog-db)
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB = resolve(SITE, '..', 'blog-db')
const LEARNING = join(DB, 'learning')
const OUT = join(SITE, 'src', 'data', 'generated.json')

if (!existsSync(LEARNING)) {
  console.error(`blog-db 를 찾을 수 없음: ${LEARNING} — cc3 워크스페이스에서 실행해야 한다`)
  process.exit(1)
}

/* ── 미니 YAML frontmatter 파서 (validate.mjs 와 동일 규칙) ── */
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const fm = {}
  let listKey = null
  for (const raw of m[1].split(/\r?\n/)) {
    const li = raw.match(/^\s+-\s+(.*)$/)
    if (li && listKey) { fm[listKey].push(li[1].trim()); continue }
    const kv = raw.match(/^([\w-]+):\s*(.*)$/)
    if (!kv) continue
    const [, k, vRaw] = kv
    const v = vRaw.trim()
    if (v === '') { fm[k] = []; listKey = k; continue }
    listKey = null
    if (v.startsWith('[')) fm[k] = v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    else if (v === 'true' || v === 'false') fm[k] = v === 'true'
    else if (/^\d+$/.test(v)) fm[k] = Number(v)
    else fm[k] = v
  }
  return fm
}

const stripAnchor = s => s.replace(/\s*\{#[^}]+\}\s*$/, '').trim()
const anchorOf = s => s.match(/\{#([^}]+)\}/)?.[1] ?? null

/** 섹션 md 에서 첫 <svg>…</svg> 를 다이어그램으로 분리 */
function splitDiagram(md) {
  const m = md.match(/<svg[\s\S]*?<\/svg>/)
  if (!m) return { diagram: '', body: md }
  return { diagram: m[0], body: (md.slice(0, m.index) + md.slice(m.index + m[0].length)).trim() }
}

/** "- [label](url)" 또는 "- label: url" 줄 → {label, url} */
function parseSources(md) {
  const out = []
  for (const line of md.split(/\r?\n/)) {
    const link = line.match(/^-\s+\[([^\]]+)\]\(([^)]+)\)/)
    if (link) { out.push({ label: link[1], url: link[2] }); continue }
    const plain = line.match(/^-\s+([^:]+):\s+(\S+)/)
    if (plain) {
      let url = plain[2]
      if (!url.startsWith('http')) url = 'https://' + url
      out.push({ label: plain[1].trim(), url })
    }
  }
  return out
}

/** 실습 섹션 → { situation, request, steps[] } */
function parseLab(md) {
  // 도입 blockquote: "> **상황** — …" / "> **요청** — …"
  const quote = md.split(/\r?\n/).filter(l => l.startsWith('>')).map(l => l.replace(/^>\s?/, '')).join('\n')
  const situMatch = quote.match(/\*\*상황\*\*\s*[—-]\s*([\s\S]*?)(?=\*\*요청\*\*|$)/)
  const reqMatch = quote.match(/\*\*요청\*\*\s*[—-]\s*([\s\S]*)/)
  const inline = s => marked.parseInline((s ?? '').replace(/\s*\n\s*/g, ' ').trim())

  const steps = []
  const parts = md.split(/^### /m).slice(1)
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const head = part.slice(0, nl)
    const id = anchorOf(head)
    if (!id) continue
    steps.push({
      id,
      title: stripAnchor(head).replace(/^단계\s*\d+\.\s*/, ''),
      body: marked.parse(part.slice(nl + 1).trim()),
    })
  }
  return { situation: inline(situMatch?.[1]), request: inline(reqMatch?.[1]), steps }
}

function buildSheet(dir, meta) {
  const md = readFileSync(join(dir, 'index.md'), 'utf8')
  const fm = parseFrontmatter(md)
  const scenarios = JSON.parse(readFileSync(join(dir, 'scenarios.json'), 'utf8')).scenarios

  const body = md.replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
  const sections = body.split(/^## /m).slice(1)

  const concepts = []
  let sources = []
  let lab = null
  for (const sec of sections) {
    const nl = sec.indexOf('\n')
    const head = sec.slice(0, nl)
    const content = sec.slice(nl + 1).trim()
    if (/^개념\s*\d/.test(head)) {
      const { diagram, body: rest } = splitDiagram(content)
      concepts.push({
        id: anchorOf(head) ?? `c${concepts.length + 1}`,
        title: stripAnchor(head),
        diagram,
        body: rest ? marked.parse(rest) : '',
      })
    } else if (/^공식 문서/.test(head)) {
      sources = parseSources(content)
    } else if (/^실습/.test(head)) {
      lab = parseLab(content)
    }
  }
  if (sources.length === 0 && Array.isArray(fm.sources))
    sources = fm.sources.map(u => ({ label: u.replace(/^https?:\/\//, ''), url: u }))

  return {
    curriculum: fm.curriculum,
    ...(fm.day ? { day: fm.day } : {}),
    ...(fm.topic ? { topic: fm.topic } : {}),
    ...(fm.level ? { level: fm.level } : {}),
    sheet: fm.sheet,
    title: fm.title,
    tags: fm.tags ?? [],
    difficulty: fm.difficulty ?? 1,
    estimated_minutes: fm.estimated_minutes ?? 60,
    goal: meta?.goal ?? '',
    concepts,
    ...(lab ? { lab } : {}),
    sources,
    scenarios,
  }
}

/* ── 실행 ── */
const curricula = []
const sheets = {}
for (const id of readdirSync(LEARNING)) {
  const dir = join(LEARNING, id)
  if (!statSync(dir).isDirectory()) continue
  const cur = JSON.parse(readFileSync(join(dir, 'curriculum.json'), 'utf8'))
  if (!cur.public) continue
  delete cur.$schema
  curricula.push(cur)
  const entries = (cur.mode === 'category' ? cur.topics : cur.days) ?? []
  for (const e of entries) {
    const sheetDir = join(dir, e.sheet)
    if (!existsSync(join(sheetDir, 'index.md'))) continue // planned
    sheets[e.sheet] = buildSheet(sheetDir, e)
  }
}

writeFileSync(OUT, JSON.stringify({ curricula, sheets }, null, 1) + '\n')
console.log(`generated.json — 커리큘럼 ${curricula.length}개 · 학습지 ${Object.keys(sheets).length}장`)
for (const c of curricula) console.log(`  - ${c.id} (${c.mode ?? 'sprint'})`)
