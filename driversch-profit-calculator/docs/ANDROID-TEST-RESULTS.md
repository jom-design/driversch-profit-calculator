# نتائج اختبار Android

## النسخة التي تم التحقق منها
- Branch: `feat/full-driver-assistant-20261114`
- Commit: `150966f5e9951dee11be708f2d3b415b5221f275`
- GitHub Actions run #54: https://github.com/jom-design/driversch-profit-calculator/actions/runs/43583723631
- Result: **SUCCESS**

## النتائج الفعلية

| الفحص | النتيجة |
|---|---|
| `npm ci` | PASS |
| Assistant Node unit tests | 45/45 PASS |
| TypeScript `npx tsc -b` | PASS |
| Vite production build | PASS — 1,623 modules |
| Playwright Chromium E2E | PASS |
| RTL / Arabic language | PASS |
| axe accessibility scan | 0 violations |
| Six responsive viewports | No horizontal overflow |
| Android Kotlin unit tests | 3/3 PASS |
| Android `lintDebug` | PASS |
| Android `assembleDebug` | PASS |
| APK artifact upload | PASS |

اختبار المتصفح أكد استعادة البيانات والتصحيحات والمراجعات بعد Reload، واستعادة حالتي confirmed وtransferred، وإخفاء زر النقل بعد النقل، وبقاء `fareMode=unknown`، وعدم الكتابة التلقائية في سجل الرحلات، وعدم وجود page errors.

## APK Debug
تم إنشاء ورفع Artifact باسم:
`driver-profit-calculator-android-debug`

- Artifact ID: `14109507627`
- Size: 1,327,866 bytes
- SHA-256 of artifact ZIP: `ca78639e6976ef63988061dc650506b9bc12244b7ce4cadc1ce7025e8c88da21`
- Download: https://github.com/jom-design/driversch-profit-calculator/actions/runs/43583723631/artifacts/14109507627

الـArtifact يحتوي على APK Debug الناتج من Gradle. هذا ليس إصدارًا موقّعًا للنشر العام.

## حدود التحقق المتبقية
- لم يتم تشغيل التطبيق على Android Emulator في هذه المرحلة.
- لم يتم اختباره على جهاز Android فعلي.
- لم يتم اختبار إشعارات فعلية من حسابات Uber أو DiDi أو inDrive؛ اختبارات Kotlin غطت allowlist والتصفية والتطبيع بحمولات اختبار.
- Gradle 8.9 مثبت صراحةً في CI، لكن Gradle Wrapper لم يُضمّن بعد في المستودع. يجب إضافة Wrapper قبل اعتبار البناء المحلي مستقلًا تمامًا.
- يجب إجراء اختبار ميداني بموافقة السائق للتحقق من تنسيقات إشعارات كل تطبيق وإصداراته.

نجاح CI يثبت أن المصدر تم تجميعه وأن APK Debug تم إنتاجه، لكنه لا يثبت بعد سلوك NotificationListenerService على كل جهاز أو كل إصدار من تطبيقات النقل.
