import { useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../services/api';
import { BaseModal } from './BaseModal';

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', minWidth: 0,
  padding: '9px 12px',
  background: 'var(--raised)',
  border: '1px solid var(--line-2)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--t1)',
  fontSize: 13,
  outline: 'none',
  transition: 'border-color 120ms',
  fontFamily: 'Geist, system-ui, sans-serif',
};

export function PasswordChangeModal({ isOpen, onClose }: PasswordChangeModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(handleClose, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Change Password"
      maxWidth="md"
      error={error}
      success={success}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>
            <Lock size={12} /> Current Password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            style={inputStyle}
            placeholder="Current password"
            disabled={loading || !!success}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--line-2)')}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>
            New Password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            style={inputStyle}
            placeholder="New password (min 6 characters)"
            disabled={loading || !!success}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--line-2)')}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            style={inputStyle}
            placeholder="Confirm new password"
            disabled={loading || !!success}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--line-2)')}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: '9px 0',
              background: 'var(--raised)',
              border: '1px solid var(--line-2)',
              color: 'var(--t2)',
              borderRadius: 'var(--r-sm)',
              fontSize: 13, fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              minWidth: 0,
              fontFamily: 'Geist, system-ui, sans-serif',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !!success}
            style={{
              flex: 1,
              padding: '9px 0',
              background: 'var(--accent)',
              border: 'none',
              color: '#000',
              borderRadius: 'var(--r-sm)',
              fontSize: 13, fontWeight: 600,
              cursor: (loading || !!success) ? 'not-allowed' : 'pointer',
              opacity: (loading || !!success) ? 0.5 : 1,
              minWidth: 0,
              fontFamily: 'Geist, system-ui, sans-serif',
              transition: 'opacity 120ms',
            }}
          >
            {loading ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
