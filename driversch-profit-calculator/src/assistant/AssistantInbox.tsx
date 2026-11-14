import { useMemo, useState } from 'react'
import { AlertCircle, Archive, Check, ChevronDown, CircleHelp, ClipboardPaste, ShieldAlert, Trash2, X } from 'lucide-react'
import { createInboxItem, markInboxParsed, requestInboxReview, updateInboxDraft, confirmInboxItem, rejectInboxItem, hasRequiredReviewData, deleteInboxItem } from './inbox'
import { parseRideOffer } from './parser'
import type { InboxItem, RideOfferDraft, RideProvider } from './types'
import { detectBrowserCapabilities, type BrowserRuntimeLike } from '../platform/browserCapabilities'
import './assistant-inbox.css'

interface Props {
  items: InboxItem[]
  onChange: (items: InboxItem[]) => void
  onTransfer: (item: InboxItem) => void
}

const providerLabels: Record<RideProvider, string> = {
  uber: 'Uber', didi: 'DiDi', indrive: 'inDrive', unknown: 'غير محدد'
}
const statusLabels: Record<InboxItem['status'], string> = {
  received: 'وصل حديثًا', parsed: 'تم التحليل', 'needs-review': 'في انتظار المراجعة',
  confirmed: 'تم التأكيد', rejected: 'مرفوض', dismissed: 'محذوف', 'parse-error': 'تعذر التحليل', transferred: 'تم النقل للحاسبة'
}
const fieldLabels: Record<'fare' | 'distanceKm' | 'pickupDistanceKm' | 'durationMinutes', string> = {
  fare: 'الأجرة المعروضة', distanceKm: 'مسافة الرحلة بالراكب',
  pickupDistanceKm: 'مسافة الوصول للراكب', durationMinutes: 'المدة المتوقعة'
���q�^