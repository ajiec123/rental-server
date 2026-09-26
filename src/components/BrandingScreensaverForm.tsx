import React, { useState, useEffect, useRef } from 'react';

/**
 * Screensaver wallpaper form: upload the rental's screensaver image shown on
 * every TV while on standby (no active session) — including over the HDMI
 * game feed when a session ends. Stored server-side in
 * data-server/branding.json and pushed to TVs via /api/branding
 * (BRANDING_UPDATE WS broadcast).
 */
export const BrandingScreensaverForm: React.FC = () => {
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [hasWallpaper, setHasWallpaper] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/branding')
      .then((r) => r.json())
      .then((d) => {
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
        body: JSON.stringify({ wallpaper }),
      });
      const data = await res.json();
      setHasWallpaper(!!data.hasWallpaper);
      setMessage('✅ Screensaver tersimpan & dikirim ke semua TV.');
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
          Wallpaper Screensaver (TV Standby)
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={onFileChange}
          className="text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white cursor-pointer"
        />
        {hasWallpaper && !wallpaper && (
          <span className="text-xs text-emerald-600 font-semibold ml-2">
            Wallpaper aktif ✓
          </span>
        )}
      </div>

      {wallpaper && (
        <div>
          <img
            src={wallpaper}
            alt="preview"
            className="w-56 h-32 object-cover rounded-lg border border-slate-300"
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !wallpaper}
          className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
        >
          {saving ? 'Menyimpan...' : '💾 Simpan Screensaver'}
        </button>
        {message && <span className="text-xs font-semibold text-slate-600">{message}</span>}
      </div>
    </div>
  );
};
