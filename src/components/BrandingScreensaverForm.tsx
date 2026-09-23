import React, { useState, useEffect, useRef } from 'react';

/**
 * Screensaver branding form: upload a wallpaper image + set a pricelist text.
 * Stored server-side in data-server/branding.json and pushed to TVs via
 * /api/branding (and BRANDING_UPDATE WS broadcast).
 */
export const BrandingScreensaverForm: React.FC = () => {
  const [pricelist, setPricelist] = useState('');
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [hasWallpaper, setHasWallpaper] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/branding')
      .then((r) => r.json())
      .then((d) => {
        setPricelist(d.pricelist || '');
        setHasWallpaper(!!d.hasWallpaper);
      })
      .catch(() => {});
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setWallpaper(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricelist, wallpaper }),
      });
      const data = await res.json();
      setHasWallpaper(!!data.hasWallpaper);
      setMessage('✅ Screensaver tersimpan & dikirim ke TV.');
    } catch {
      setMessage('❌ Gagal menyimpan screensaver.');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-label-ts text-slate-600 uppercase font-bold mb-1">
          Daftar Harga (Pricelist)
        </label>
        <textarea
          value={pricelist}
          onChange={(e) => setPricelist(e.target.value)}
          rows={4}
          placeholder={'PS4: Rp 5.000/jam\nPS5: Rp 8.000/jam\nVIP Room: Rp 15.000/jam'}
          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
        />
      </div>

      <div>
        <label className="block text-xs font-label-ts text-slate-600 uppercase font-bold mb-1">
          Wallpaper Screensaver
        </label>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white cursor-pointer"
          />
          {hasWallpaper && !wallpaper && (
            <span className="text-xs text-emerald-600 font-semibold">Wallpaper aktif ✓</span>
          )}
        </div>
        {wallpaper && (
          <div className="mt-2">
            <img
              src={wallpaper}
              alt="preview"
              className="w-40 h-24 object-cover rounded-lg border border-slate-300"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
        >
          {saving ? 'Menyimpan...' : '💾 Simpan Screensaver'}
        </button>
        {message && <span className="text-xs font-semibold text-slate-600">{message}</span>}
      </div>
    </div>
  );
};
