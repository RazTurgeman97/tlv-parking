# חניונים בתל אביב — גרסת Google Maps

אתר סטטי (HTML/CSS/JS, בלי build) שמציג את 88 חניוני אחוזות החוף, 35 חניוני סנטרל פארק וחניון דיזנגוף סנטר על מפת Google, עם מחיר לשעה ותעריף ערב, מחירי אפליקציית סנטרל פארק, חיפוש לפי יעד, רשימה עם סינון ומיון, מצב בהיר/כהה, וניווט ב-Waze וב-Google Maps.

```
index.html            הדף
styles.css            עיצוב
app.js                הלוגיקה והמפה
config.js             מפתח API ו-Map ID  ← לערוך
data/lots.json        נתוני החניונים (עודכן 26.10.2026)
worker/               שרת קטן לזמינות בזמן אמת (אופציונלי)
```

## 1. מפתח Google Maps (חינם בשימוש אישי)

1. היכנסו ל-[Google Cloud Console](https://console.cloud.google.com/) וצרו פרויקט חדש.
2. Google דורשת לקשר חשבון חיוב (כרטיס אשראי) גם כשהשימוש בחינם.
3. ב-**APIs & Services → Library** הפעילו:
   - **Maps JavaScript API** (המפה)
   - **Geocoding API** (חיפוש כתובת יעד ודיוק מיקום חניוני אחוזות החוף)
4. ב-**APIs & Services → Credentials** לחצו **Create credentials → API key**.
5. **הגבילו את המפתח** (חשוב, כי המפתח גלוי בקוד האתר):
   - Application restrictions → **Websites** → הוסיפו את כתובת האתר, למשל `https://USERNAME.github.io/*`, ולבדיקות מקומיות `http://localhost:*/*`.
   - API restrictions → **Restrict key** → סמנו רק Maps JavaScript API ו-Geocoding API.
6. הדביקו את המפתח בקובץ `config.js` במקום `PASTE_YOUR_KEY_HERE`.

### להבטיח שלא יהיה חיוב
לכל שירות יש מכסה חינמית חודשית (למפה דינמית בערך 10,000 טעינות בחודש, ולחיפוש כתובות בערך 10,000 בקשות). שימוש אישי רחוק מזה מאוד. כדי שזה לא יוכל לחרוג גם בטעות:
- **APIs & Services → Maps JavaScript API → Quotas**: הגדירו מגבלה יומית, למשל 300 טעינות מפה ביום.
- אותו דבר ל-**Geocoding API**, למשל 300 בקשות ביום.
- **Billing → Budgets & alerts**: צרו תקציב של $1 עם התראה.

ברגע שמגיעים למכסה היומית, המפה פשוט מפסיקה להיטען עד למחרת. אין חיוב.

### Map ID (אופציונלי)
הקוד משתמש ב-`DEMO_MAP_ID`, שעובד לשימוש אישי. אם תרצו Map ID משלכם: **Google Maps Platform → Map Management → Create Map ID** (JavaScript, Vector), והדביקו אותו ב-`config.js`.

## 2. הרצה מקומית

הדפדפן לא טוען את `data/lots.json` מקובץ מקומי, אז צריך שרת קטן:

```bash
cd tlv-parking-gmaps
python3 -m http.server 8000
# פתחו http://localhost:8000
```

## 3. העלאה לאינטרנט (GitHub Pages, חינם)

```bash
cd tlv-parking-gmaps
git init && git add . && git commit -m "TLV parking map"
gh repo create tlv-parking --public --source=. --push
gh api -X POST repos/{owner}/tlv-parking/pages -f "source[branch]=main" -f "source[path]=/"
```

אחרי דקה האתר זמין ב-`https://USERNAME.github.io/tlv-parking/`. בטלפון: פתחו את הכתובת ובחרו "הוספה למסך הבית", והאתר ייפתח כמו אפליקציה.

אפשר גם לגרור את התיקייה ל-[Netlify Drop](https://app.netlify.com/drop).

## 4. זמינות בזמן אמת (אופציונלי)

התיקייה `worker/` היא Cloudflare Worker שמושך את מספר המקומות הפנויים בחניוני סנטרל פארק מהאתר שלהם, ושומר אותו בזיכרון לשתי דקות. האתר מושך ממנו כל שתי דקות, ובכרטיס מופיע "● X פנויים עכשיו" בירוק.

```bash
npm i -g wrangler
cd worker
wrangler login
wrangler deploy
```

את הכתובת שתקבלו (למשל `https://tlv-parking-live.USERNAME.workers.dev`) הדביקו ב-`LIVE_URL` בקובץ `config.js`. בתוכנית החינמית של Cloudflare יש 100,000 בקשות ביום.

ה-Worker קורא את הנתונים שמוטמעים בדף החיפוש של סנטרל פארק. אם הם ישנו את מבנה האתר, הוא יחזיר שגיאה, והאתר ימשיך להציג את הנתונים השמורים.

## עדכון נתונים

`data/lots.json` הוא תמונת מצב: מחירי ימי חול של סנטרל פארק ותעריפי אחוזות החוף מאוגוסט 2026. המחיר בשילוט בכניסה לחניון הוא המחייב. מיקומי חניוני אחוזות החוף מדויקים בפעם הראשונה שהמפה נטענת, לפי הכתובת הרשמית דרך Geocoding, ונשמרים בדפדפן.
