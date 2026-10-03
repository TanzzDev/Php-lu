-- =====================================================================
-- MDFlix — perbaikan data (bagian 6): perbarui email dukungan default
-- =====================================================================
-- Email dukungan default lama ('sultahnnazhirulasrofi@gmail.com') diganti
-- menjadi 'supportmdflix@gmail.com'. Migrasi 0004 hanya mengisi baris
-- 'support' pada app_settings sekali lewat "on conflict (key) do nothing",
-- sehingga instalasi yang sudah pernah dijalankan (database produksi yang
-- sudah ada) tidak ikut ter-update hanya dengan mengubah seed di 0004 —
-- migrasi ini melengkapi baris yang sudah lanjur ada di database tersebut.
--
-- Hanya field "email" yang disentuh; field lain (mis. "phone") dibiarkan
-- apa adanya bila admin sudah pernah menyesuaikannya sendiri lewat Admin
-- Console. Aman dijalankan berulang kali (idempotent) dan tidak berefek
-- sama sekali bila email sudah pernah diubah ke nilai lain oleh admin.
-- =====================================================================

update public.app_settings
   set value = jsonb_set(value, '{email}', '"supportmdflix@gmail.com"', true)
 where key = 'support'
   and value ->> 'email' = 'sultahnnazhirulasrofi@gmail.com';
