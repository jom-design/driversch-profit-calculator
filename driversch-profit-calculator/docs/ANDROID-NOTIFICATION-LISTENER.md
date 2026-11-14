# Android Notification Listener — تنفيذ أولي

## البنية
- تطبيق Android أصلي داخل `android/` يستضيف واجهة Vite الحالية محليًا داخل WebView.
- يستخدم AndroidX WebViewAssetLoader على نطاق محلي ثابت، ولا يحمّل واجهة التطبيق من موقع خارجي.
- جسر JavaScript محدود باسم `DriverAndroid`، ولا يكشف كائنات Android عامة.
- `NotificationCaptureService` يستقبل الإشعارات من Android فقط بعد منح إذن Notification Access يدويًا.

## التطبيقات المسموح بها
| التطبيق | Package ID | حالة التحقق |
|---|---|---|
| Uber Driver | `com.ubercab.driver` | مطابق لمعرّف تطبيق Uber Driver على Google Play |
| DiDi Driver | `com.didiglobal.driver` | مطابق لمعرّف تطبيق DiDi Driver على Google Play |
| inDrive | `sinet.startup.inDriver` | تطبيق inDrive الرسمي الموحّد الذي يتيح وضع السائق |

المصادر:
- https://play.google.com/store/apps/details?id=com.ubercab.driver
- https://play.google.com/store/apps/details?id=com.didiglobal.driver
- https://play.google.com/store/apps/details?id=sinet.startup.inDriver

لا تتم إضافة أي Package ID غير موجود في القائمة أعلاه. جميع التطبيقات معطلة افتراضيًا، ويجب على السائق تفعيل كل تطبيق على حدة.

## تدفق الاستقبال
1. Android يسلّم الإشعار إلى `NotificationCaptureService`.
2. يتم رفض أي package خارج القائمة أو غير مفعّل.
3. يستخرج العنوان والنص الظاهرين فقط، ثم يمرّران عبر بوابة كلمات خاصة بكل تطبيق.
4. يتم توليد هوية ثابتة من package + notification key، ثم تحويلها إلى SHA-256.
5. يخزن الإشعار مؤقتًا مشفرًا باستخدام AES-GCM ومفتاح Android Keystore.
6. عند فتح صندوق الرحلات، يقرأ الجسر الإشعارات المنتظرة.
7. تتحقق TypeScript من package والحقول والحجم والتاريخ، ثم تستخدم parser وصندوق المراجعة الحاليين.
8. لا يُقرّ الإشعار في الطابور الأصلي إلا بعد نجاح حفظ IndexedDB.

## الحدود
- لا توجد أفعال قبول أو رفض أو نقر في التطبيقات الخارجية.
- لا توجد AccessibilityService أو MediaProjection أو Voice في هذه المرحلة.
- لا يوجد اتصال شبكي لإرسال محتوى الإشعارات.
- النص الخام يُخزّن مؤقتًا مشفرًا لمدة أقصاها 6 ساعات، بحد أقصى 50 إشعارًا منتظرًا.
- يحتفظ التطبيق بآخر 200 معرّف تم استيراده لمنع تكرار تحديث الإشعار نفسه.
- كلمات التصفية لا تضمن اكتشاف كل صيغة إشعار؛ يجب مراجعة كل عنصر يدويًا.
- لا توجد حاليًا عينات إشعارات حقيقية من أجهزة السائقين؛ لذلك لم ندّعِ اكتمال parsing الخاص بكل إصدار.

## البناء
من جذر المستودع:
1. نفّذ `npm ci` داخل `driversch-profit-calculator/`.
2. نفّذ `npm run build`.
3. انسخ محتويات `driversch-profit-calculator/dist/` إلى `android/app/src/main/assets/`.
4. استخدم JDK 17 وGradle 8.9 ثم نفّذ:
   `gradle -p android :app:assembleDebug :app:testDebugUnitTest :app:lintDebug`.

GitHub Actions ينفّذ خطوات البناء وينشر APK Debug كـArtifact عند نجاحها. Gradle Wrapper لم يُضف بعد؛ يستخدم CI نسخة Gradle محددة صراحةً كحل مؤقت، ويجب استكمال Wrapper قبل اعتبار البناء المحلي مستقلًا بالكامل.
