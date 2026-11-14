export type AppLocale = 'ar' | 'en'

const arToEn: Record<string,string> = {
'حاسبة عدالة المشاوير':'Driver Profit Calculator','مجاني 100%':'100% Free','حفظ محلي':'Saved locally',
'حاسبة المشوار':'Trip Calculator','المساعد الذكي':'Smart Assistant','الرحلات الملتقطة':'Captured Trips','سجل الرحلات':'Trip History','التقارير':'Reports','الإعدادات':'Settings',
'قرار أذكى • ربح أوضح':'Smarter decisions • Clearer profit','احسبها قبل ما تقبل المشوار':'Calculate before accepting a trip','اعرف تكلفة الرحلة وصافي ربحك الحقيقي في ثوانٍ.':'Know your trip cost and actual net profit in seconds.','القرار بيتحسب تلقائيًا':'Decision calculated automatically',
'نماذج جاهزة للاختبار السريع':'Quick test examples','اضغط لملء الحقول':'Select to fill the fields','بيانات العرض':'Offer details','بيانات المشوار المقترح':'Proposed trip details','تفريغ الحقول':'Clear fields',
'الأجرة المعروضة':'Displayed fare','نوع الأجرة':'Fare type','صافي للسائق':'Net to driver','إجمالي قبل العمولة':'Gross before commission','غير متأكد':'Not sure','نسبة عمولة التطبيق':'Platform commission rate',
'مسافة الوصول للراكب':'Pickup distance','مسافة الرحلة بالراكب':'Passenger trip distance','العودة الفارغة':'Empty return distance','الوقت الإجمالي':'Total time','مصروفات إضافية':'Extra expenses','ملاحظات اختيارية':'Optional notes',
'أي تفاصيل تساعدك في مراجعة الرحلة...':'Add details to help review this trip...','حدد نوع الأجرة قبل حفظ الرحلة. لن نفترض أن المبلغ صافي أو نخصم عمولة تلقائيًا.':'Choose the fare type before saving. We will not assume it is net or deduct commission automatically.','حفظ الرحلة في السجل':'Save trip to history',
'التحليل المالي':'Financial analysis','قرار الرحلة النهائي':'Trip decision','نطق القرار':'Speak decision','اقبل الرحلة':'Accept trip','راجع الرحلة':'Review trip','ارفض الرحلة':'Reject trip',
'ربح تقديري — أكد نوع الأجرة أولًا':'Estimated profit — confirm fare type first','صافي ربحك المتوقع':'Your estimated net profit','بعد الوقود والصيانة والمصروفات':'After fuel, maintenance and expenses',
'بيانات محفوظة على جهازك':'Data saved on your device','تصدير CSV':'Export CSV','لسه مفيش رحلات محفوظة':'No saved trips yet','احسب أول مشوار واحفظه علشان يظهر هنا.':'Calculate and save your first trip to see it here.',
'التاريخ':'Date','التطبيق':'Platform','الأجرة':'Fare','المسافة':'Distance','صافي الربح':'Net profit','القرار':'Decision','حذف':'Delete',
'ملخص السجل المحفوظ':'Saved history summary','التقارير والإحصائيات':'Reports & statistics','عدد الرحلات':'Trip count','إجمالي الأجرة الصافية':'Total net fare','إجمالي التشغيل':'Total operating cost','إجمالي المسافات':'Total distance','إجمالي الوقت':'Total time','مقارنة حسب التطبيق':'Platform comparison','متوسط الربح':'Average profit',
'تحكم في افتراضات الحساب':'Calculation assumptions','حفظ الإعدادات':'Save settings','سعر لتر البنزين':'Fuel price per liter','استهلاك السيارة لكل 100 كم':'Vehicle consumption per 100 km','الصيانة والإهلاك لكل كم':'Maintenance and depreciation per km','الحد الأدنى لصافي الرحلة':'Minimum net profit per trip','هدف الربح في الساعة':'Hourly profit target',
'عمولة التطبيقات (اختيارية)':'Platform commissions (optional)','كل تطبيق له نسبته المستقلة. القيمة 0% افتراضية حتى تُدخل نسبتك، وتُستخدم عند اختيار أجرة إجمالية':'Each platform has its own rate. Default is 0% until entered; used when gross fare is selected.',
'تصدير نسخة احتياطية':'Export backup','استيراد نسخة احتياطية':'Import backup','استعادة الافتراضي':'Restore defaults','البيانات محفوظة محليًا في هذا المتصفح باستخدام IndexedDB. مسح بيانات المتصفح قد يؤدي إلى حذفها؛ صدّر نسخة احتياطية بانتظام.':'Data is stored locally in this browser using IndexedDB. Clearing browser data may delete it; export backups regularly.',
'جارٍ استعادة صندوق الرحلات المحفوظ على هذا الجهاز…':'Restoring the trip inbox saved on this device…','إعادة محاولة الحفظ':'Retry saving',
'أمر صوتي':'Voice command','إيقاف الاستماع':'Stop listening','جارٍ الاستماع… تكلم الآن':'Listening… speak now','نفّذ الأمر':'Run command','تجاهل':'Dismiss','سمعت:':'Heard:','الأمر:':'Command:',
'التقاط إشعارات Android':'Capture Android notifications','ربط إشعارات الرحلات':'Connect trip notifications','تحديث الحالة':'Refresh status','فتح إعدادات إذن الإشعارات':'Open notification access settings',
'تأكيد العرض بعد المراجعة':'Confirm offer after review','نقل العرض المؤكد للحاسبة':'Transfer confirmed offer to calculator','المثال المرجعي':'Reference example','مشوار قصير وسط البلد':'Short city trip','مشوار أطراف القاهرة':'Outer-district trip','مشوار خاسر':'Unprofitable trip',
'ج.م':'EGP','كم':'km','دقيقة':'min'
}
const enToAr = Object.fromEntries(Object.entries(arToEn).map(([ar,en])=>[en,ar])) as Record<string,string>
const attributes = ['placeholder','title','aria-label']
export function translateText(value:string, locale:AppLocale):string {
  const trimmed=value.trim()
  const translated=(locale==='en'?arToEn:enToAr)[trimmed]
  return translated ? value.replace(trimmed,translated) : value
}
export function applyLocale(root:ParentNode, locale:AppLocale):void {
  const html=document.documentElement
  html.lang=locale
  html.dir=locale==='ar'?'rtl':'ltr'
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT)
  const nodes:Text[]=[]
  while(walker.nextNode()) nodes.push(walker.currentNode as Text)
  for(const node of nodes){
    const parent=node.parentElement
    if(!parent||parent.closest('script,style,textarea,input,pre,code,[contenteditable="true"]')) continue
    const next=translateText(node.nodeValue??'',locale)
    if(next!==node.nodeValue) node.nodeValue=next
  }
  if(root instanceof Element){
    for(const element of [root,...Array.from(root.querySelectorAll('*'))]){
      for(const name of attributes){
        const current=element.getAttribute(name)
        if(current){const next=translateText(current,locale);if(next!==current)element.setAttribute(name,next)}
      }
    }
  }
  document.title=locale==='ar'?'حاسبة عدالة المشاوير':'Driver Profit Calculator'
}
