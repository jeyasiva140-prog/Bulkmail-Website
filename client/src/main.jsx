import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = '/api';
function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('bulkmail_token') || '');
  const [adminEmail, setAdminEmail] = useState(() => sessionStorage.getItem('bulkmail_email') || '');
  const [active, setActive] = useState('compose');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientText, setRecipientText] = useState('');
  const [consent, setConsent] = useState(false);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ campaigns: 0, recipients: 0, sent: 0, failed: 0 });
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState('');

  const request = async (url, options = {}) => {
    const response = await fetch(`${API}${url}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Something went wrong.');
    return data;
  };

  const loadDashboard = async () => {
    if (!token) return;
    try {
      const [records, totals] = await Promise.all([request('/mail/history'), request('/mail/stats')]);
      setHistory(records); setStats(totals);
    } catch (error) {
      if (error.message.toLowerCase().includes('session') || error.message.toLowerCase().includes('sign in')) logout();
      else setNotice({ type: 'error', text: error.message });
    }
  };
  useEffect(() => { loadDashboard(); }, [token]);

  const recipients = useMemo(() => [...new Set(recipientText.split(/[\s,;]+/).map(item => item.trim().toLowerCase()).filter(Boolean))], [recipientText]);
  const filteredHistory = history.filter(item => `${item.subject} ${item.recipients?.map(r => r.email).join(' ')}`.toLowerCase().includes(search.toLowerCase()));

  async function login(event) {
    event.preventDefault(); setLoading(true); setNotice(null);
    try {
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: loginEmail, password: loginPassword }) });
      sessionStorage.setItem('bulkmail_token', data.token); sessionStorage.setItem('bulkmail_email', data.email);
      setToken(data.token); setAdminEmail(data.email); setLoginPassword(''); setNotice({ type: 'success', text: 'Welcome back. You are signed in.' });
    } catch (error) { setNotice({ type: 'error', text: error.message }); }
    finally { setLoading(false); }
  }
  function logout() {
    sessionStorage.removeItem('bulkmail_token'); sessionStorage.removeItem('bulkmail_email');
    setToken(''); setAdminEmail(''); setHistory([]); setStats({ campaigns: 0, recipients: 0, sent: 0, failed: 0 });
  }
  async function sendCampaign(event) {
    event.preventDefault(); setNotice(null);
    if (!subject.trim() || !body.trim() || recipients.length === 0) return setNotice({ type: 'error', text: 'Please complete the subject, message and recipient list.' });
    if (recipients.length > 50) return setNotice({ type: 'error', text: 'You can send to a maximum of 50 recipients per campaign.' });
    if (!consent) return setNotice({ type: 'error', text: 'Please confirm recipient consent before sending.' });
    setLoading(true);
    try {
      const result = await request('/mail/send', { method: 'POST', body: JSON.stringify({ subject, body, recipients, consent }) });
      setNotice({ type: result.failedCount ? 'warning' : 'success', text: `Campaign complete: ${result.sentCount} sent, ${result.failedCount} failed.` });
      setSubject(''); setBody(''); setRecipientText(''); setConsent(false); setActive('history'); await loadDashboard();
    } catch (error) { setNotice({ type: 'error', text: error.message }); }
    finally { setLoading(false); }
  }

  if (!token) return <div className="login-shell"><div className="login-art"><div className="brand-mark">B</div><p className="eyebrow">SMART EMAIL WORKSPACE</p><h1>Make every message<br/><span>count.</span></h1><p className="muted">Create, send and track email campaigns from one simple workspace.</p><div className="art-card"><div className="mail-icon">✉</div><div><b>Campaign ready</b><small>Compose · Deliver · Track</small></div><span className="live-dot"/></div></div><form className="login-card" onSubmit={login}><div className="mini-brand"><span className="brand-mark small">B</span><b>BulkMail</b></div><p className="eyebrow">ADMIN ACCESS</p><h2>Welcome back</h2><p className="muted">Sign in to manage your email campaigns.</p>{notice && <Notice notice={notice}/>}<label>Admin email<input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="admin@example.com" required autoComplete="username"/></label><label>Password<input type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Enter your password" required autoComplete="current-password"/></label><button className="primary full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in to dashboard'} <span>→</span></button><p className="form-foot">Your admin credentials are configured in your server environment.</p></form></div>;

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">B</span><span>BulkMail<small>CAMPAIGN STUDIO</small></span></div><div className="side-label">WORKSPACE</div><button className={`nav-item ${active==='compose'?'selected':''}`} onClick={()=>setActive('compose')}><span>✉</span> Compose email</button><button className={`nav-item ${active==='history'?'selected':''}`} onClick={()=>setActive('history')}><span>◷</span> Email history</button><button className={`nav-item ${active==='analytics'?'selected':''}`} onClick={()=>setActive('analytics')}><span>▥</span> Analytics</button><div className="sidebar-bottom"><div className="profile"><div className="avatar">{(adminEmail[0]||'A').toUpperCase()}</div><div><b>{adminEmail}</b><small>Administrator</small></div></div><button className="logout" onClick={logout}>↪ Sign out</button><small className="version">BULKMAIL · MERN EDITION</small></div></aside>
  <main className="main"><header className="topbar"><div><span className="eyebrow">WORKSPACE / {active.toUpperCase()}</span><h1>{active==='compose'?'Compose campaign':active==='history'?'Email history':'Campaign analytics'}</h1></div><div className="top-right"><span className="status-pill"><i/> System ready</span><div className="avatar small-avatar">{(adminEmail[0]||'A').toUpperCase()}</div></div></header>
  {notice && <Notice notice={notice} onClose={()=>setNotice(null)}/>}
  <section className="stats-grid"><Stat label="Campaigns" value={stats.campaigns||0} icon="✉" tone="violet"/><Stat label="Recipients" value={stats.recipients||0} icon="◎" tone="blue"/><Stat label="Successfully sent" value={stats.sent||0} icon="✓" tone="green"/><Stat label="Failed deliveries" value={stats.failed||0} icon="!" tone="orange"/></section>
  {active==='compose' && <section className="content-grid"><form className="panel compose-panel" onSubmit={sendCampaign}><div className="panel-head"><div><p className="eyebrow">NEW CAMPAIGN</p><h2>Prepare your message</h2><p className="muted">Write once and deliver individually to each recipient.</p></div><span className="step-badge">01 / COMPOSE</span></div><label>Campaign subject<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={180} placeholder="e.g. Product update – November" required/><small className="field-hint">Keep it clear and relevant.</small></label><label>Recipient emails<textarea className="recipient-box" value={recipientText} onChange={e=>setRecipientText(e.target.value)} placeholder={'alex@example.com\nsam@example.com\nteam@example.com'} required/><small className="field-hint">Separate addresses with commas, spaces or new lines. Up to 50 unique recipients.</small></label><div className="recipient-count"><span>{recipients.length} unique recipient{recipients.length===1?'':'s'}</span><span className={recipients.length>50?'danger-text':''}>Limit: 50</span></div><label>Email message<textarea className="message-box" value={body} onChange={e=>setBody(e.target.value)} placeholder="Hi there,\n\nWrite your email message here…\n\nBest regards" maxLength={20000} required/></label><label className="consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I confirm these recipients have agreed to receive this email, and I will respect unsubscribe/removal requests.</span></label><div className="form-actions"><span className="muted tiny">Emails are sent individually; recipient addresses are not exposed to others.</span><button className="primary" disabled={loading}>{loading?'Sending…':'Send campaign'} <span>↗</span></button></div></form><div className="right-column"><div className="panel preview-panel"><p className="eyebrow">DELIVERY PREVIEW</p><h3>Ready to send?</h3><div className="preview-icon">✉</div><p className="muted center">Your campaign will be delivered as separate emails to each valid recipient.</p><div className="preview-row"><span>Recipients</span><b>{recipients.length} / 50</b></div><div className="preview-row"><span>Subject</span><b className="truncate">{subject||'Not set'}</b></div><div className="preview-row"><span>Message</span><b>{body.length} characters</b></div><div className="privacy-note"><span>♧</span><p><b>Privacy first</b><small>Each recipient receives an individual message. No shared To/CC list.</small></p></div></div><div className="help-card"><span>✦</span><div><b>Good email practice</b><p>Only send to people who opted in. Keep your subject accurate and provide a clear way to request removal.</p></div></div></div></section>}
  {active==='history' && <section className="panel history-panel"><div className="panel-head"><div><p className="eyebrow">ACTIVITY LOG</p><h2>Previous campaigns</h2><p className="muted">A record of your recent email deliveries.</p></div><button className="secondary" onClick={loadDashboard}>↻ Refresh</button></div><div className="search-wrap"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search subject or recipient…"/></div>{filteredHistory.length===0?<Empty title="No campaigns yet" text="Your sent email campaigns will appear here."/>:<div className="table-wrap"><table><thead><tr><th>SUBJECT</th><th>RECIPIENTS</th><th>SENT</th><th>FAILED</th><th>DATE</th></tr></thead><tbody>{filteredHistory.map(item=><tr key={item._id}><td><b>{item.subject}</b><small>{item.body?.slice(0,70)}{item.body?.length>70?'…':''}</small></td><td>{item.totalRecipients}</td><td><span className="count-good">{item.sentCount}</span></td><td><span className="count-bad">{item.failedCount}</span></td><td>{new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}</section>}
  {active==='analytics' && <section className="analytics-grid"><div className="panel analytics-main"><p className="eyebrow">DELIVERY OVERVIEW</p><h2>Campaign performance</h2><p className="muted">Totals across all stored campaigns.</p><div className="big-number">{stats.recipients||0}<small>total recipients</small></div><div className="bar-track"><div className="bar-sent" style={{width:`${stats.recipients?stats.sent/stats.recipients*100:0}%`}}/></div><div className="legend"><span><i className="green-dot"/> Successfully sent <b>{stats.sent||0}</b></span><span><i className="orange-dot"/> Failed <b>{stats.failed||0}</b></span></div></div><div className="panel analytics-side"><p className="eyebrow">SUMMARY</p><h2>At a glance</h2><div className="summary-line"><span>Campaigns created</span><b>{stats.campaigns||0}</b></div><div className="summary-line"><span>Delivery success</span><b>{stats.recipients?`${Math.round(stats.sent/stats.recipients*100)}%`:'—'}</b></div><div className="summary-line"><span>Delivery failures</span><b>{stats.failed||0}</b></div><button className="secondary full" onClick={()=>setActive('history')}>View campaign history →</button></div></section>}
  <footer>BulkMail <span>·</span> Built with React, Express & MongoDB <span>·</span> Send responsibly</footer></main></div>;
}
function Stat({label,value,icon,tone}) { return <div className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value.toLocaleString()}</strong></div></div>; }
function Notice({notice,onClose}) { return <div className={`notice ${notice.type}`}><span>{notice.type==='success'?'✓':notice.type==='error'?'!':'•'}</span>{notice.text}{onClose&&<button onClick={onClose}>×</button>}</div>; }
function Empty({title,text}) { return <div className="empty"><span>✉</span><b>{title}</b><p>{text}</p></div>; }

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
