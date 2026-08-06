import { useState } from 'react'
import { SYNC_LABEL, useSyncedJson } from '../lib/scheduleDb'

interface ProvisioningCustomer {
  id: string
  customer: string
  tcsaSent: string
  tcsaApproved: string
  orderStatus: string
  salesMailConfirmed: string
  creditConfirmed: string
}
interface ProvisioningData { customers: ProvisioningCustomer[] }

const EMPTY: ProvisioningData = { customers: [] }
const DATE_FIELDS: { key: Exclude<keyof ProvisioningCustomer, 'id' | 'customer'>; label: string }[] = [
  { key: 'tcsaSent', label: 'TCSA 발송' },
  { key: 'tcsaApproved', label: 'TCSA 승인 완료' },
  { key: 'orderStatus', label: 'Order Status' },
  { key: 'salesMailConfirmed', label: '매출 메일 확인' },
  { key: 'creditConfirmed', label: '충전 확인' },
]

const todayLocalIso = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ProvisioningPage() {
  const { data, update, sync, writable } = useSyncedJson<ProvisioningData>(
    'provisioning/contracts.json', EMPTY, 'provisioning: 계약 진행 현황 갱신',
  )
  const [newCustomer, setNewCustomer] = useState('')

  const addCustomer = () => {
    const customer = newCustomer.trim()
    if (!customer || !writable) return
    update({
      customers: [...data.customers, {
        id: `customer-${Date.now()}`, customer,
        tcsaSent: '', tcsaApproved: '', orderStatus: '', salesMailConfirmed: '', creditConfirmed: '',
      }],
    })
    setNewCustomer('')
  }
  const patchCustomer = (id: string, patch: Partial<ProvisioningCustomer>) =>
    update({ customers: data.customers.map(item => item.id === id ? { ...item, ...patch } : item) })
  const removeCustomer = (item: ProvisioningCustomer) => {
    if (confirm(`${item.customer} 항목을 삭제할까요?`)) {
      update({ customers: data.customers.filter(customer => customer.id !== item.id) })
    }
  }

  return (
    <div className="provisioning-page">
      <div className="crumb"><span className="px">CLOUD CONTRACT</span> / PROVISIONING</div>
      <div className="provisioning-head">
        <div>
          <h1 className="sheet-h1">클라우드 계약 프로비저닝 관리</h1>
          <p className="prof-desc">고객사별 TCSA부터 충전 확인까지 정상 프로비저닝 진행일을 기록합니다.</p>
        </div>
        <span className="px sched-sync">{SYNC_LABEL[sync]}</span>
      </div>

      {!writable && (
        <div className="cross-note">자물쇠 3으로 암호화 현황을 열었습니다. 현재는 <b>읽기 전용</b>이며 날짜 수정에는 PAT가 필요합니다.</div>
      )}

      {writable && (
        <div className="provisioning-add card">
          <input className="cli-input" value={newCustomer} placeholder="고객사 이름"
            onChange={event => setNewCustomer(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') addCustomer() }} />
          <button className="submitbtn" onClick={addCustomer}>고객사 추가</button>
        </div>
      )}

      <div className="provisioning-table-wrap card">
        <table className="provisioning-table">
          <thead>
            <tr>
              <th>고객사 이름</th>
              {DATE_FIELDS.map(field => <th key={field.key}>{field.label}</th>)}
              {writable && <th aria-label="관리" />}
            </tr>
          </thead>
          <tbody>
            {data.customers.map(item => {
              const fullyComplete = DATE_FIELDS.every(field => !!item[field.key])
              return (
                <tr key={item.id} className={fullyComplete ? 'fully-complete' : ''}>
                <td className="provisioning-customer">
                  {writable ? (
                    <input className="provisioning-name-input" value={item.customer} aria-label={`${item.customer} 고객사 이름`}
                      onChange={event => patchCustomer(item.id, { customer: event.target.value })} />
                  ) : <b>{item.customer}</b>}
                </td>
                {DATE_FIELDS.map(field => (
                  <td key={field.key} className={item[field.key] ? 'complete' : ''}>
                    <div className="provisioning-date-control">
                      <input type="date" className="provisioning-date" value={item[field.key]} readOnly={!writable}
                        aria-label={`${item.customer} ${field.label}`}
                        onChange={event => patchCustomer(item.id, { [field.key]: event.target.value })} />
                      {writable && (
                        <button type="button" className="provisioning-today"
                          aria-label={`${item.customer} ${field.label} 오늘 날짜 입력`}
                          onClick={() => patchCustomer(item.id, { [field.key]: todayLocalIso() })}>Today</button>
                      )}
                    </div>
                  </td>
                ))}
                {writable && (
                  <td className="provisioning-actions">
                    <button className="kdel" title="고객사 삭제" onClick={() => removeCustomer(item)}>✕</button>
                  </td>
                )}
                </tr>
              )
            })}
            {data.customers.length === 0 && (
              <tr><td className="provisioning-empty" colSpan={DATE_FIELDS.length + 1 + (writable ? 1 : 0)}>등록된 고객사가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
