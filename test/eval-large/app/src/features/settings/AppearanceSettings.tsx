import { useAppStore, type Density, type Theme } from '../../store/app';

export function AppearanceSettings() {
  const theme = useAppStore((s) => s.theme);
  const density = useAppStore((s) => s.density);
  const showEstimates = useAppStore((s) => s.showEstimates);
  const { setTheme, setDensity, setShowEstimates } = useAppStore.getState();
  return (
    <div className="settings-form" data-testid="appearance">
      <fieldset className="field">
        <span className="field-label">Theme</span>
        <div className="row gap">
          {(['dark', 'light', 'system'] as Theme[]).map((t) => (
            <label key={t} className="row gap-sm">
              <input type="radio" name="theme" checked={theme === t} onChange={() => setTheme(t)} /> {t[0].toUpperCase() + t.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <span className="field-label">Density</span>
        <div className="row gap">
          {(['comfortable', 'compact'] as Density[]).map((d) => (
            <label key={d} className="row gap-sm">
              <input type="radio" name="density" checked={density === d} onChange={() => setDensity(d)} /> {d[0].toUpperCase() + d.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="row gap-sm">
        <input type="checkbox" checked={showEstimates} onChange={(e) => setShowEstimates(e.target.checked)} /> Show estimates on issues and cards
      </label>
    </div>
  );
}
