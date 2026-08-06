import { useState } from 'react'
import { SYNC_LABEL, useSyncedJson } from '../lib/scheduleDb'

interface ProvisioningCustomer {
  id: string
  customer: string
  tcsaSent: string
  tcsaApproved: string
  tcsaNumber: string
  orderDate: string
  orderAmount: string
  orderState: '' | 'open' | 'closed'
  salesMailConfirmed: string
  creditConfirmed: string
}
interface ProvisioningData { customers: ProvisioningCustomer[] }

const EMPTY: ProvisioningData = { customers: [] }
type ProvisioningDateKey = 'tcsaSent' | 'tcsaApproved' | 'orderDate' | 'salesMailConfirmed' | 'creditConfirmed'

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
        tcsaSent: '', tcsaApproved: '', tcsaNumber: '', orderDate: '', orderAmount: '', orderState: '',
        salesMailConfirmed: '', creditConfirmed: '',
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
  const dateControl = (item: ProvisioningCustomer, key: ProvisioningDateKey, label: string) => (
    <div className="provisioning-date-control">
      <input type="date" className="provisioning-date" value={item[key] ?? ''} readOnly={!writable}
        aria-label={`${item.customer} ${label}`}
        onChange={event => patchCustomer(item.id, { [key]: event.target.value })} />
      {writable && (
        <button type="button" className="provisioning-today"
          aria-label={`${item.customer} ${label} 오늘 날짜 입력`}
          onClick={() => patchCustomer(item.id, { [key]: todayLocalIso() })}>Today</button>
      )}
    </div>
  )

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
        <div className="cross-note">자물쇠 3으로 암호화 현황을 열었습니다. 현재는 <b>읽기 전용</b>이며 정보 수정에는 PAT가 필요합니다.</div>
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
              <th>TCSA 발송</th>
              <th>TCSA 승인 완료</th>
              <th>Order Status</th>
              <th>매출 메일 확인</th>
              <th>충전 확인</th>
              {writable && <th aria-label="관리" />}
            </tr>
          </thead>
          <tbody>
            {data.customers.map(item => {
              const tcsaApprovedComplete = !!item.tcsaApproved && !!item.tcsaNumber?.trim()
              const orderComplete = item.orderState === 'closed'
              const fullyComplete = !!item.tcsaSent && tcsaApprovedComplete && orderComplete
                && !!item.salesMailConfirmed && !!item.creditConfirmed
              return (
                <tr key={item.id} className={fullyComplete ? 'fully-complete' : ''}>
                <td className="provisioning-customer">
                  {writable ? (
                    <input className="provisioning-name-input" value={item.customer} aria-label={`${item.customer} 고객사 이름`}
                      onChange={event => patchCustomer(item.id, { customer: event.target.value })} />
                  ) : <b>{item.customer}</b>}
                </td>
                <td className={item.tcsaSent ? 'complete' : ''}>
                  {dateControl(item, 'tcsaSent', 'TCSA 발송')}
                </td>
                <td className={tcsaApprovedComplete ? 'complete' : item.tcsaApproved ? 'dated' : ''}>
                  <div className="provisioning-stage-control">
                    {dateControl(item, 'tcsaApproved', 'TCSA 승인 완료')}
                    <input className="provisioning-detail-input" value={item.tcsaNumber ?? ''} readOnly={!writable}
                      placeholder="TCSA_11974403397" aria-label={`${item.customer} TCSA 번호`}
                      onChange={event => patchCustomer(item.id, { tcsaNumber: event.target.value })} />
                  </div>
                </td>
                <td className={orderComplete ? 'complete' : item.orderDate ? 'dated' : ''}>
                  <div className="provisioning-stage-control">
                    {dateControl(item, 'orderDate', 'Order Status 날짜')}
                    <input className="provisioning-detail-input" value={item.orderAmount ?? ''} readOnly={!writable}
                      inputMode="decimal" placeholder="계약액" aria-label={`${item.customer} 계약액`}
                      onChange={event => patchCustomer(item.id, { orderAmount: event.target.value })} />
                    <select className={`provisioning-status ${item.orderState || 'unset'}`} value={item.orderState ?? ''}
                      disabled={!writable} aria-label={`${item.customer} Order 상태`}
                      onChange={event => patchCustomer(item.id, { orderState: event.target.value as ProvisioningCustomer['orderState'] })}>
                      <option value="">상태 선택</option>
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </td>
                <td className={item.salesMailConfirmed ? 'complete' : ''}>
                  {dateControl(item, 'salesMailConfirmed', '매출 메일 확인')}
                </td>
                <td className={item.creditConfirmed ? 'complete' : ''}>
                  {dateControl(item, 'creditConfirmed', '충전 확인')}
                </td>
                {writable && (
                  <td className="provisioning-actions">
                    <button className="kdel" title="고객사 삭제" onClick={() => removeCustomer(item)}>✕</button>
                  </td>
                )}
              </tr>
              )
            })}
            {data.customers.length === 0 && (
              <tr><td className="provisioning-empty" colSpan={6 + (writable ? 1 : 0)}>등록된 고객사가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
