import { useEffect, useRef, useState } from 'react';

export default function SettingsPanel({ settings, onChange, onReset, onClearSavedGame, onClose }) {
  const dialogRef = useRef(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  };

  const checkbox = (key, label) => <label className="setting-toggle" key={key}>
    <input type="checkbox" checked={settings[key]} onChange={(event) => onChange({ [key]: event.target.checked })}/>
    <span>{label}</span>
  </label>;

  return <dialog className="settings-dialog" ref={dialogRef} aria-labelledby="settings-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <section className="folder-card settings-card">
      <div className="folder-tab tab-pink" aria-hidden="true"/>
      <header className="settings-heading"><div><p className="meta-line">YOUR PREFERENCES</p><h2 id="settings-title">Settings</h2></div><button className="button button-yellow settings-close" aria-label="Close settings" onClick={close}>×</button></header>

      <section className="settings-section" aria-labelledby="appearance-settings-title">
        <h3 id="appearance-settings-title">Appearance</h3>
        <label className="setting-select">Theme<select aria-label="Theme" value={settings.theme} onChange={(event) => onChange({ theme: event.target.value })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label className="setting-select">Board colour<select aria-label="Board colour" value={settings.boardColor} onChange={(event) => onChange({ boardColor: event.target.value })}><option value="purple">Purple</option><option value="green">Green</option><option value="slate">Slate</option></select></label>
        {checkbox('reduceMotion', 'Reduce motion')}
      </section>

      <section className="settings-section" aria-labelledby="board-settings-title">
        <h3 id="board-settings-title">Board</h3>
        {checkbox('showLegalDots', 'Show legal-move dots')}
        {checkbox('highlightLastMove', 'Highlight last move')}
        {checkbox('flipBoard', 'Flip board (Black at bottom)')}
        {checkbox('showCoordinates', 'Show coordinates')}
      </section>

      <section className="settings-section" aria-labelledby="pass-play-settings-title">
        <h3 id="pass-play-settings-title">Two-player defaults</h3>
        <label className="setting-select">Board orientation<select aria-label="Two-player orientation" value={settings.localOrientation} onChange={(event) => onChange({ localOrientation: event.target.value })}><option value="fixed">Fixed</option><option value="auto">Auto-flip after each move</option></select></label>
        {checkbox('localHintsAllowed', 'Allow hints in new two-player games')}
      </section>

      <section className="settings-section" aria-labelledby="engine-settings-title">
        <h3 id="engine-settings-title">Engine</h3>
        <label className="setting-select">AI opponent engine<select aria-label="AI opponent engine" value={settings.engineChoice} onChange={(event) => onChange({ engineChoice: event.target.value })}><option value="standard">Standard (Lite)</option><option value="strong">Strong (Full)</option></select></label>
        <label className="setting-select">Hint engine<select aria-label="Hint engine" value={settings.hintEngine} onChange={(event) => onChange({ hintEngine: event.target.value })}><option value="auto">Auto</option><option value="server">Server</option><option value="browser">Browser</option></select></label>
        <label className="setting-select">Hint time<select aria-label="Hint time" value={settings.hintTime} onChange={(event) => onChange({ hintTime: Number(event.target.value) })}><option value="2000">2 seconds</option><option value="4000">4 seconds</option><option value="6000">6 seconds</option></select></label>
        <label className="setting-select">Default difficulty<select aria-label="Default difficulty" value={settings.defaultDifficulty} onChange={(event) => onChange({ defaultDifficulty: event.target.value })}><option>Easy</option><option>Medium</option><option>Hard</option><option>Max</option></select></label>
      </section>

      <section className="settings-section settings-data" aria-labelledby="data-settings-title">
        <h3 id="data-settings-title">Data</h3>
        <button className="button button-outline" onClick={onReset}>Reset settings</button>
        {confirmClear ? <div className="clear-confirm" role="alertdialog" aria-labelledby="clear-game-title">
          <strong id="clear-game-title">Clear the current game?</strong><span>This ends the game and starts a fresh board.</span>
          <div><button className="button button-yellow" onClick={() => { onClearSavedGame(); setConfirmClear(false); }}>Clear game</button><button className="button button-outline" onClick={() => setConfirmClear(false)}>Cancel</button></div>
        </div> : <button className="button button-outline" onClick={() => setConfirmClear(true)}>Clear saved game</button>}
      </section>
    </section>
  </dialog>;
}
