# Autopilot kuralları

Bu dosya, TASKS.md'deki işleri başında kimse yokken yapan Claude içindir. Hem terminaldeki `ap` hem uygulamadaki zamanlanmış görev bu kuralları kullanır.

## Genel
- Başında kimse yok: soru sorma, makul bir varsayımla karar ver ve varsayımını çıktıya yaz.
- Tüm çıktılar Türkçe.
- Sıradaki işi sen seçmezsin. `sira.ps1` seçer ve EYLEM, SATIR, GÖREV, TÜR, KLASÖR (ve süreli işlerde TUR, BİTİŞ, KALAN, GÜNLÜK) satırlarıyla verir. Sadece o işi yap.
- Göreli yollar KLASÖR'e göredir. Sonuç dosyaları `sonuclar/` altına yazılır.
- TASKS.md'de sadece sana verilen satırı değiştir; yeni görevleri dosyanın sonuna ekle. Başka satırlara dokunma.
- Kullanıcının ana klasöründe (ör. C:\Users\<kullanıcı>) ya da bir sürücü kökünde asla `git init` çalıştırma. Commit'i sadece zaten git reposu olan klasörlerde at.

## EYLEM: NORMAL (tek seferlik görev)
Önce: Görev metni bir çalışma süresi istiyorsa (ör. "48 saat çalış", "work 3 hours non-stop", "yarın sabaha kadar geliştir") veya bir UYARI satırı geldiyse, görevi şimdi yapma. Satırdaki tür etiketinin hemen arkasına `[süre: 48 saat]` biçiminde bir etiket ekle (sayı + dakika/saat/gün; "yarın sabaha kadar" gibi ifadeleri saate çevir) ve dur. Sistem onu süreli görev olarak çalıştıracak.

Değilse türe göre yap (tür etiketi yoksa en uygun türü sen seç):
- **[kod]** Tamamen uygula. Projede build/test varsa çalıştır ve hataları düzelt. Klasör git reposuysa açıklayıcı mesajla commit at.
- **[araştır]** WebSearch/WebFetch ve yerel dosyalarla kapsamlı araştır. `sonuclar/arastirma-<kısa-ad>.md` yaz: Özet (3-5 madde), Bulgular (detaylı), Kaynaklar (URL listesi; her iddia bir kaynağa bağlı), Açık sorular. Sonra TASKS.md'nin sonuna şu satırı ekle: `- [ ] [kontrol] sonuclar/arastirma-<kısa-ad>.md: iddiaları ve kaynakları doğrula`
- **[kontrol]** Hedefi (kod, doküman, iddia, araştırma) eleştirel gözle doğrula; kaynakları bağımsız kontrol et, gerekiyorsa kodu ve testleri çalıştır. `sonuclar/kontrol-<kısa-ad>.md` yaz: Sonuç (DOĞRU / KISMEN / YANLIŞ ya da GEÇTİ / KALDI), Sorunlar (her biri kanıtıyla), Öneriler. Hedefi kendin değiştirme; düzeltmeleri somut `- [ ] [kod] ...` veya `- [ ] [araştır] ...` görevleri olarak sona ekle. Bir kontrol sonucu için yeni [kontrol] görevi ekleme.

Bitince satırı `- [x]` yap ve sonuna ` → <çıktı dosyaları>` ekle. Yapamazsan `- [!]` yap ve sonuna ` — TAKILDI: <tek satır sebep>` ekle.

## EYLEM: DÖNGÜ (süreli görevin bir turu)
Kullanıcı bu görev için bir süre verdi ve şunu istiyor: iş bitmiş gibi görünse bile kapatma; süre dolana kadar kontrol et, düzelt ve yeni şeyler ekle.
- **Görevi kapatma.** Satırın kutucuğuna ve `[bitiş]`, `[tur]`, `[#id]` etiketlerine dokunma. Süreyi sistem takip eder; `[x]` yazarsan sistem geri açar.
- **GÜNLÜK dosyası turlar arası hafızandır.** Her tur yeni bir oturumla başlar; önceki turlarda ne yapıldığını sadece günlükten ve çıktılardan bilirsin.

**İlk tur (İLK TUR: evet)**
1. Günlüğü oluştur. Bölümler: Hedef (görevi kendi cümlelerinle), Ana çıktılar (dosya ve klasör yolları), Plan, Fikir havuzu (en az 10 somut madde), Bilinen sorunlar, Tur kayıtları.
2. Ana çıktıyı üret. kod: çalışan ilk sürüm. araştır: `sonuclar/arastirma-<kısa-ad>.md` tam rapor. kontrol: `sonuclar/kontrol-<kısa-ad>.md`.
3. Günlüğe "Tur 1" kaydını yaz (aşağıdaki biçimde).

**Sonraki turlar**
1. Günlüğü ve ana çıktıları oku.
2. **Kontrol et.** Var olanı eleştirel gözle incele:
   - kod: çalıştır, build/test, konsol hataları, kenar durumlar, mobil görünüm, erişilebilirlik, performans; önceki turlarda eklenenler hâlâ çalışıyor mu.
   - araştır: kaynakları bağımsız doğrula; ölü linkler, çelişen kaynaklar, eksik açılar, daha güncel veri.
   - kontrol: önceki turlarda bakılmayan kısımlara daha derin in.
3. **Düzelt.** Bulduğun sorunları gider. (kontrol türünde hedefi değiştirme; düzeltme görevlerini TASKS.md'nin sonuna ekle.)
4. **Geliştir.** Fikir havuzundan en değerli 1-3 maddeyi yap. kod: yeni özellik, animasyon, cila, test. araştır: derinleşme, yeni bölüm, karşılaştırma tablosu, görselleştirme, açık soruları kapatma. KALAN 1 saatten azsa yeni büyük iş başlatma; cila ve sağlamlaştırma yap.
5. **Günlüğü güncelle.** Tur kayıtlarına `### Tur N — <tarih saat>` başlığıyla ekle: Kontrol edilenler, Bulunan sorunlar, Düzeltilenler, Eklenenler. Fikir havuzundan yapılanları çıkar, yeni fikirler ekle; havuz hiç boşalmasın.
6. kod türündeysen ve klasör git reposuysa commit at.

Sınırlar: Sıfırdan yeniden yazma, çalışan şeyi silme. Şişirmek yerine derinlik ve kalite. Araştırmada her tur yeni rapor açma; tek ana raporu güncel tut ve sonuna "Sürüm notları" bölümü ekle. Bir engel çıkarsa (izin, erişim) günlükte "Bilinen sorunlar"a yaz ve başka bir iyileştirmeyle devam et; `[!]` işaretini sadece hiçbir şey yapılamıyorsa kullan.
Tur bitince dur. Sonraki tur otomatik gelir.

## EYLEM: BİTİR (süresi dolan görevin kapanışı)
1. Son bir kontrol turu yap, kritik sorunları düzelt. Yarım iş bırakma: yarım kalan özelliği ya tamamla ya geri al.
2. Günlüğe "Son durum" bölümü ekle: turların kısa özeti, çıktılar, bilinen sorunlar, sonra yapılabilecekler.
3. Satırı `- [x]` yap ve sonuna ` → <ana çıktılar>, <günlük dosyası>` ekle.
4. Görev araştır türündeyse TASKS.md'nin sonuna bağımsız bir kontrol görevi ekle: `- [ ] [kontrol] <rapor yolu>: iddiaları ve kaynakları doğrula`

## EYLEM: YOK
Yapılacak iş yok, dur.
