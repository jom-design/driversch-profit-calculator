import { useMemo, useState } from 'react'
import { AlertCircle, Archive, Check, ChevronDown, CircleHelp, ClipboardPaste, ShieldAlert, Trash2, X } from 'lucide-react'
import { createInboxItem, markInboxParsed, requestInboxReview, updateInboxDraft, confirmInboxItem, rejectInboxItem, hasRequiredReviewData, deleteInboxItem, setInboxFieldReviewed } from './inbox'
import { parseRideOffer } from './parser'
import type { InboxItem, RideOfferDraft, RideProvider } from './types'
import { detectBrowserCapabilities, type BrowserRuntimeLike } from '../platform/browserCapabilities'
import AndroidNotificationPanel from './AndroidNotificationPanel'
import NumericInput from '../components/NumericInput'
import { acceptNativeNotification, type NativeNotificationPayload } from './notificationBridge'
import './assistant-inbox.css'
import { t, translateMessage, type TranslationKey } from '../lib/i18n'

interface Props {
  locale: 'ar' | 'en'
  items: InboxItem[]
  onChange: (items: InboxItem[]) => void | Promise<boolean>
  onTransfer: (item: InboxItem) => void
}

const providerLabels: Record<RideProvider, string> = {
  uber: 'Uber', didi: 'DiDi', indrive: 'inDrive', unknown: 'غير محدد'
}
const statusLabels: Record<InboxItem['status'], string> = {
  received: 'وصل حديثًا', parsed: 'تم التحليل', 'needs-review': 'في انتظار المراجعة',
  confirmed: 'تم التأكيد', rejected: 'مرفوض', dismissed: 'محذوف', 'parse-error': 'تعذر التحليل', t���q�^