import test from 'node:test'
import assert from 'node:assert/strict'
import { AR_TO_EN, translateText } from '../../src/lib/i18n.ts'

test('navigation and key product areas translate in both directions', () => {
  assert.equal(translateText('حاسبة المشوار', 'en'), 'Trip Calculator')
  assert.equal(translateText('Trip Calculator', 'ar'), 'حاسبة المشوار')
  assert.equal(translateText('صندوق الرحلات', 'en'), 'Trip inbox')
  assert.equal(translateText('Settings', 'ar'), 'الإعدادات')
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
    'إجمالي قبل العمولة'
  ]) assert.ok(AR_TO_EN[key], `Missing English translation for: ${key}`)
})

test('dynamic status messages translate without losing variable values', () => {
  assert.equal(translateText('عندك 3 عرض غير مؤكد', 'en'), 'You have 3 unconfirmed offers')
  assert.equal(translateText('آخر إشعار مؤهل: 10:30', 'en'), 'Last eligible notification: 10:30')
})

test('unknown user content and mixed platform names remain unchanged', () => {
  assert.equal(translateText('Uber commission ١٥٪', 'en'), 'Uber commission ١٥٪')
  assert.equal(translateText('ملاحظة كتبها المستخدم', 'en'), 'ملاحظة كتبها المستخدم')
})

test('translation preserves surrounding whitespace and reversible exact keys', () => {
  assert.equal(translateText('  الإعدادات  ', 'en'), '  Settings  ')
  assert.equal(translateText('  Settings  ', 'ar'), '  الإعدادات  ')
})

test('all dictionary entries have non-empty unique English values', () => {
  const values = Object.values(AR_TO_EN)
  assert.ok(Object.keys(AR_TO_EN).length >= 150)
  assert.ok(values.every(value => value.trim().length > 0))
  assert.ok(values.length >= 150)
})
