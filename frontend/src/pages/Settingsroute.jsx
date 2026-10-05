// pages/SettingsRoute.jsx  – gives the Settings page its data from the layout
import React from 'react';
import { useOutletContext } from 'react-router-dom';
import SettingsPage from './Settings';

export default function SettingsRoute() {
  const { settings, settingsError, loadSettings, updateSettings } = useOutletContext();
  if (!settings) {
    return (
      <p className={`toast ${settingsError ? 'error' : ''}`}>
        {settingsError
          ? <>{settingsError} <button className="btn" onClick={loadSettings}>Retry</button></>
          : 'Loading settings…'}
      </p>
    );
  }
  return <SettingsPage settings={settings} onChange={updateSettings} />;
}