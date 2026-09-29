import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, KeyRound, User, Lock, AlertCircle, ArrowRight } from 'lucide-react';

export default function LoginScreen() {
  const { login, loginAsDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-box">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="brand-icon" style={{ width: 48, height: 48, fontSize: '1.4rem' }}>
            <Shield size={26} />
          </div>
        </div>

        <h2>QUICKRESCUE COMMAND CENTER</h2>
        <p className="subtitle">Disaster Ground Control & Emergency Response System</p>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            color: '#ef4444',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="inputEmail">Operator Email / Service ID</label>
            <input
              id="inputEmail"
              type="email"
              className="form-input"
              placeholder="e.g. operator@quickrescue.gov.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="inputPassword">Security Passcode / Token</label>
            <input
              id="inputPassword"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-tactical btn-tactical-primary btn-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Authenticating Terminal...' : 'Authenticate & Enter Command Center'}
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="demo-buttons-row">
          <button
            type="button"
            className="btn-demo"
            onClick={() => loginAsDemo('ADMIN')}
          >
            ⭐ Quick Login: Commander (Admin)
          </button>
          <button
            type="button"
            className="btn-demo"
            onClick={() => loginAsDemo('OPERATOR')}
          >
            📡 Quick Login: Operator
          </button>
        </div>
      </div>
    </div>
  );
}
