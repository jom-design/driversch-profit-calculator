import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AR_TO_EN, t, translateMessage } from '../../src/lib/i18n.ts'

test('typed translation keys resolve in both locales', () => {
  assert.equal(t('اقبل الرحلة', 'ar'), 'اقبل الرحلة')
  assert.equal(t('اقبل الرحلة', 'en'), 'Accept trip')
})

test('navigation and key product areas translate in both directions', () => {
  assert.equal(translateMessage('حاسبة المشوار', 'en'), 'Trip Calculator')
  assert.equal(translateMessage('Trip Calculator', 'ar'), 'حاسبة المشوار')
  assert.equal(translateMessage('صندوق الرحلات', 'en'), 'Trip inbox')
  assert.equal(translateMessage('Settings', 'ar'), 'الإعدادات')
})

test('assistant, voice, OCR, notification and backup messages have translations', () => {
  for (const key of [
    'التقاط إشعارات Android',
    'إيقاف الاستماع',
    'جارٍ الاستماع… تكلم الآن',
    'لم تُمنح صلاحية الميكروفون. فعّلها من إعدادات الجهاز ثم حاول مرة أخرى.',
    'تعذرت قراءة الصورة؛ أضف البيانات يدويًا في عنصر الخطأ داخل صندوق المراجعة.',
    'تصدير نسخة احتياطية',
    'استيراد نسخة احتياطية',
    'إضافة عرض يدويًا أو لصق نص إشعار',
    'إضافة لصندوق المراجعة',
    'إعادة محاولة الحفظ',
    'الصق نص عرض رحلة في الأعلى لبدء المراجعة. لا توجد بيانات تجريبية محفوظة.',
    'العروض هنا لا تُحفظ في سجل الرحلات ولا تُرسل للحاسبة إلا بعد تأكيدك.',
    'القرار بيتحسب تلقائيًا',
    'المتصفح لا يستطيع قراءة إشعارات تطبيقات Android الأخرى تلقائيًا.',
    'المساعد الذكي لالتقاط الرحلات',
    'المعالجة تتم داخل المتصفح. لا يتم حفظ صورة الرحلة أو نصها الخام في سجل الرحلات.',
    'تحليل وإضافة للإنبوكس',
    'تفاصيل العرض',
    'تم نقل هذا العرض للحاسبة بالفعل. لن يظهر زر النقل مرة أخرى.',
    'صندوق الوارد فارغ',
    'عرض النص الأصلي للمراجعة',
    'عرض نص OCR للمراجعة فقط',
    'قراءة بموافقتك',
    'مطلوب مراجعة',
    'راجع البيانات المستخرجة',
    'راجعت هذه القيمة وأؤكدها',
    'حذف نهائي',
    'حفظ الرحلة في السجل',
    'خصوصيتك أولًا',
    'صافي للسائق',
    'إجمالي قبل العمولة',
    'الصيانة والإهلاك',
    'مسافة الرحلة',
    'مسافة الوصول',
    'ج.م',
    'كم',
    'دقيقة',
    'جنيه',
    'أخرى',
    'صافي'
  ]) assert.ok(AR_TO_EN[key], `Missing English translation for: ${key}`)
})

test('dynamic status messages translate without losing variable values', () => {
  assert.equal(translateMessage('عندك 3 عرض غير مؤكد', 'en'), 'You have 3 unconfirmed offers')
  assert.equal(translateMessage('آخر إشعار مؤهل: 10:30', 'en'), 'Last eligible notification: 10:30')
  assert.equal(translateMessage('تم تجاهل 2 سجل غير صالح داخل مخزن الإنبوكس. لم يتم حذف السجلات التالفة.', 'en'), 'Ignored 2 invalid inbox records. Corrupted records were not deleted.')
  assert.equal(translateMessage('سيتم استيراد 3 رحلة واستبدال السجل الحالي. هل تريد المتابعة؟', 'en'), 'Import 3 trips and replace the current history. Continue?')
  assert.equal(translateMessage('آخر رحلة: اقبل الرحلة · صافي الربح 90.00 EGP', 'en'), 'Last trip: Accept trip · Net profit 90.00 EGP')
  assert.equal(translateMessage('اقبل الرحلة. صافي الربح 90.00 EGP', 'en'), 'Accept the trip. Net profit 90.00 EGP')
})

test('financial decision and OCR interpolations translate without losing numbers', () => {
  assert.equal(translateMessage('صافي الربح أقل من الحد الأدنى 50.00 ج.م.', 'en'), 'Net profit is below the minimum target of EGP 50.00.')
  assert.equal(translateMessage('ثقة OCR: 87%', 'en'), 'OCR confidence: 87%')
  assert.equal(translateMessage('جاري قراءة الصورة 42%', 'en'), 'Reading image 42%')
  assert.equal(translateMessage('القيمة fuelPrice في الإعدادات ليست رقمًا صحيحًا', 'en'), 'Setting value fuelPrice is not a valid number.')
  assert.equal(translateMessage('عمولة Uber في الإعدادات ليست نسبة صحيحة من 0 إلى 100', 'en'), 'Uber commission in settings must be between 0 and 100.')
  assert.equal(translateMessage('بيانات الرحلة رقم 2 تالفة أو نتائجها المالية لا تطابق مدخلاتها؛ لم يتم استيراد أي بيانات.', 'en'), 'Trip #2 is corrupted or its financial results do not match its inputs; no data was imported.')
  assert.equal(translateMessage('الثقة: 100% · الدليل: تم الإدخال أو التصحيح يدويًا', 'en'), 'Confidence: 100% · Evidence: تم الإدخال أو التصحيح يدويًا')
})

test('unknown user content and mixed platform names remain unchanged', () => {
  assert.equal(translateMessage('Uber commission ١٥٪', 'en'), 'Uber commission ١٥٪')
  assert.equal(translateMessage('ملاحظة كتبها المستخدم', 'en'), 'ملاحظة كتبها المستخدم')
  const rawOcr = 'Uber 165 ج.م 22 كم 40 دقيقة'
  assert.equal(translateMessage(rawOcr, 'en'), rawOcr)
  assert.equal(translateMessage('165 كم', 'en'), '165 كم')
  assert.equal(translateMessage('165 جنيه', 'en'), '165 جنيه')
})

test('translation preserves surrounding whitespace and reversible exact keys', () => {
  assert.equal(translateMessage('  الإعدادات  ', 'en'), '  Settings  ')
  assert.equal(translateMessage('  Settings  ', 'ar'), '  الإعدادات  ')
})

test('all dictionary entries have non-empty values in both locales', () => {
  const values = Object.values(AR_TO_EN)
  assert.ok(Object.keys(AR_TO_EN).length >= 150)
  assert.ok(values.every(value => value.trim().length > 0))
  for (const key of Object.keys(AR_TO_EN)) {
    assert.equal(t(key, 'ar'), key)
    assert.equal(t(key, 'en'), AR_TO_EN[key])
  }
  assert.ok(values.length >= 150)
})


test('visible Arabic JSX copy across the source tree has dictionary coverage', () => {
  const root = fileURLToPath(new URL('../../src/', import.meta.url))
  const collect = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collect(path)
    return /\.(tsx|jsx)$/.test(entry.name) ? [path] : []
  })
  const missing = []
  for (const path of collect(root)) {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(/>([^<>]*[\u0600-\u06FF][^<>]*)</g)) {
      const copy = match[1].trim()
      if (!copy || copy.length > 220 || copy.startsWith('=') || copy.includes('{') || copy.includes('=>') || copy.includes(').join(')) continue
      if (/^(Uber|DiDi|inDrive|Android|Chrome|API|OCR|PNG|JPG)$/.test(copy)) continue
      if (!AR_TO_EN[copy]) missing.push({ path, copy })
    }
  }
  assert.deepEqual(missing, [])
})

test('every explicit React t() call references a real bilingual dictionary key', () => {
  const root = fileURLToPath(new URL('../../src/', import.meta.url))
  const collect = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collect(path)
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : []
  })
  const missing = []
  for (const path of collect(root)) {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(/\bt\('([^']+)'/g)) {
      if (!Object.hasOwn(AR_TO_EN, match[1])) missing.push({ path, key: match[1] })
    }
  }
  assert.deepEqual(missing, [])
})

test('no production source can reintroduce DOM-based translation', () => {
  const root = fileURLToPath(new URL('../../src/', import.meta.url))
  const collect = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collect(path)
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : []
  })
  for (const path of collect(root)) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /\bMutationObserver\b/, path)
    assert.doesNotMatch(source, /\bapplyLocale\b/, path)
    assert.doesNotMatch(source, /\btranslateText\b/, path)
  }
})
