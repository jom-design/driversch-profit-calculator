# نتائج اختبار Android

## ما أضيف إلى المستودع
- مشروع Android Gradle.
- تطبيق WebView محلي باستخدام AndroidX WebViewAssetLoader.
- NotificationListenerService مع package allowlist.
- تفضيلات تشغيل كل مزود، مع تعطيل افتراضي.
- طابور إشعارات محلي مشفر.
- جسر JavaScript محدود إلى صندوق الرحلات الحالي.
- اختبارات Kotlin لوظائف package allowlist والتصفية والتطبيع.
- وظيفة GitHub Actions لبناء APK وتشغيل Kotlin unit tests وAndroid lint.

## حالة التحقق
لم يتم اعتماد أي نتيجة بناء أو اختبار Android قبل ظهور تشغيل GitHub Actions للـcommit الذي يحتوي هذه الملفات. كما لم يتم اختبار التطبيق على Emulator أو جهاز فعلي في بيئة التنفيذ الحالية.

| الفحص | الحالة |
|---|---|
| مصدر Kotlin وManifest | أضيف — ينتظر Android CI |
| Kotlin unit tests | أضيفت — تنتظر التشغيل |
| Android Lint | مضاف إلى CI — ينتظر التشغيل |
| Debug APK | CI سيحفظه كـArtifact عند نجاح البناء |
| Emulator | غير منفذ |
| جهاز Android فعلي | غير منفذ |
| إشعارات حقيقية من التطبيقات الثلاثة | غير مختبرة |

لا تعتبر هذه الوثيقة شهادة جاهزية إصدار. يتم تحديثها بعد قراءة سجلات CI الفعلية.
