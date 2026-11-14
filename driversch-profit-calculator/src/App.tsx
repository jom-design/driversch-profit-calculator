import { useEffect, useMemo, useState } from 'react'
import { Activity, Archive, Calculator, CarFront, Check, ChevronDown, Download, FileImage, Gauge, History, LayoutDashboard, Mic, MicOff, RotateCcw, Save, Settings as SettingsIcon, ShieldCheck, Trash2, Upload, Wallet, X } from 'lucide-react'
import { calculateTrip } from './lib/calculator'
import AssistantInbox from './assistant/AssistantInbox'
import type { InboxItem } from './assistant/types'
import { toCalculatorTripInput } from './assistant/calculatorTransfer'
import { ocrDraftToInboxItem } from './assistant/ocrAdapter'
import { markInboxParseError, markInboxTransferred } from './assistant/inbox'
import { deleteTrip, getSettings, getTrips, replaceAllTrips, saveSettings, saveTrip } from './lib/db'
import { readTripImage, type OcrDraft } from './lib/ocr'
import { DEFAULT_SETTINGS, EMPTY_TRIP, type AppName, type FareMode, type SavedTrip, type Settings, type TripInput } from './types'

type Page = 'calculator' | 'assistant' | 'inbox' | 'history' | 'reports' | 'settings'
const money = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`
const templates: {name:string; desc:string; trip:TripInput}[] = [
  { name:'المثال المرجعي', desc:'22 كم — 165 جنيه — 40 دقيقة', trip:{...EMPTY_TRIP} },
  { name:'مشوار قصير وسط البلد', desc:'5 كم — 70 جنيه', trip:{...EMPTY_TRIP, fare:70, passengerKm:5, totalMinutes:20} },
  { name:'مش���q�^