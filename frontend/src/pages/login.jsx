import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import API_BASE_URL from '../config/api';
import '../styles/login.css';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: '', password: '' });
  const [remember, setRemember] = useState(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.email.trim() || !form.password) {
      setError('Please enter your username and password.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.email.trim(),
          password: form.password,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('Server returned an unexpected response.');
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Login failed.');
      }

      if (!data.token || !data.admin) {
        throw new Error('Admin access only.');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('admin', JSON.stringify(data.admin));

      const from = location.state?.from;
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lg-wrapper">
      {/* Floating Bokeh Effect Background */}
      <div className="lg-bokeh-container" aria-hidden="true">
        <div className="lg-bokeh lg-bokeh-1" />
        <div className="lg-bokeh lg-bokeh-2" />
        <div className="lg-bokeh lg-bokeh-3" />
        <div className="lg-bokeh lg-bokeh-4" />
        <div className="lg-bokeh lg-bokeh-5" />
        <div className="lg-bokeh lg-bokeh-6" />
      </div>

      <div className="lg-card">
        <div className="lg-brand">
          <h1>COE Login Form</h1>
        </div>

        {error && <p className="lg-error" role="alert">{error}</p>}

        <form className="lg-form" onSubmit={handleSubmit} noValidate>
          <div className="lg-field">
            <div className="lg-label-row">
              <Mail size={16} className="lg-icon" />
              <label htmlFor="email">Username</label>
            </div>
            <div className="lg-input-box">
              <input
                id="email"
                type="email"
                placeholder="Username"
                autoComplete="username"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="lg-field">
            <div className="lg-label-row">
              <Lock size={16} className="lg-icon" />
              <label htmlFor="password">Password</label>
            </div>
            <div className="lg-input-box">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
              <button
                type="button"
                className="lg-eye"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="lg-row">
            <label className="lg-checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="lg-checkbox-box" />
              Stay Signed In
            </label>
            <Link to="/forgot-password" className="lg-link">
              Forgot Password?
            </Link>
          </div>

          <div className="lg-submit-wrapper">
            <button type="submit" className="lg-submit" disabled={busy}>
              <span>{busy ? 'Logging In...' : 'Log In'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}