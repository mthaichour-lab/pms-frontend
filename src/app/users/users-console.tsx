'use client';
import { useEffect, useState, type FormEvent } from 'react';
import styles from '../products/products.module.css';
type User = { id: string; username: string; firstName?: string; lastName?: string; email?: string; enabled: boolean; roles: string[]; legalEntityIds?: string[]; branchIds?: string[]; poolIds?: string[]; delegationLevel?: number; maximumAmount?: string };
type Role = { id: string; label: string; privileges: string[] };
const blank = { username: '', firstName: '', lastName: '', email: '', password: '', enabled: true, roles: [] as string[], legalEntityIds: '', branchIds: '', poolIds: '', delegationLevel: 0, maximumAmount: '0' };
const list = (value: string) => [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, { method, headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail ?? data.title ?? 'Opération impossible');
  return data as T;
}
export function UsersConsole() {
  const [users, setUsers] = useState<User[]>([]), [roles, setRoles] = useState<Role[]>([]);
  const [draft, setDraft] = useState(blank), [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function load(query = '') {
    setBusy(true); setError('');
    try {
      const [people, catalog] = await Promise.all([request<{ items: User[] }>(`users?search=${encodeURIComponent(query)}&limit=100`), request<{ items: Role[] }>('roles')]);
      setUsers(people.items); setRoles(catalog.items);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Chargement impossible'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  function select(user: User) {
    setSelected(user.id); setMessage(''); setError('');
    setDraft({ ...blank, ...user, username: user.username, firstName: user.firstName ?? '', lastName: user.lastName ?? '', email: user.email ?? '', password: '', roles: user.roles, legalEntityIds: user.legalEntityIds?.join(', ') ?? '', branchIds: user.branchIds?.join(', ') ?? '', poolIds: user.poolIds?.join(', ') ?? '', delegationLevel: user.delegationLevel ?? 0, maximumAmount: user.maximumAmount ?? '0' });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    const body = { firstName: draft.firstName, lastName: draft.lastName, email: draft.email, enabled: draft.enabled, roles: draft.roles, delegationLevel: draft.delegationLevel, maximumAmount: draft.maximumAmount, legalEntityIds: list(draft.legalEntityIds), branchIds: list(draft.branchIds), poolIds: list(draft.poolIds), ...(!selected ? { username: draft.username, password: draft.password } : {}) };
    try {
      await request(selected ? `users/${selected}` : 'users', selected ? 'PUT' : 'POST', body);
      setDraft(blank); setSelected(undefined);
      await load(search); setMessage('Utilisateur enregistré. Les nouvelles habilitations seront prises en compte à sa prochaine connexion.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Enregistrement impossible'); }
    finally { setBusy(false); }
  }
  return <><p role="alert" hidden={!error} className={`${styles.notice} ${styles.error}`}>{error}</p><p role="status" hidden={!message} className={styles.notice}>{message}</p><div className={styles.grid} aria-busy={busy}>
    <section className={styles.card}><h2>Comptes de connexion</h2><form className={styles.form} onSubmit={event => { event.preventDefault(); void load(search); }}><label className={styles.field}>Rechercher un utilisateur<input value={search} onChange={event => setSearch(event.target.value)} /></label><button className={styles.button} disabled={busy}>Rechercher</button></form>
      <div className={styles.tableWrap} data-layout-scroll-region><table><thead><tr><th>Utilisateur</th><th>État</th><th>Rôles</th><th>Action</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.username}</td><td>{user.enabled ? 'Actif' : 'Désactivé'}</td><td>{user.roles.join(', ') || 'Aucun rôle'}</td><td><button type="button" className={styles.secondary} disabled={busy} onClick={() => select(user)}>Modifier</button></td></tr>)}</tbody></table></div>{!busy && !users.length && <p>Aucun utilisateur trouvé.</p>}
    </section><section className={styles.card}><h2>{selected ? 'Modifier les habilitations' : 'Créer un utilisateur'}</h2><form className={styles.form} onSubmit={save}><fieldset disabled={busy}>
      <label className={styles.field}>Identifiant de connexion<input required readOnly={!!selected} autoComplete="off" value={draft.username} onChange={e => setDraft({ ...draft, username: e.target.value })} /></label>
      <div className={styles.row}>{(['firstName', 'lastName'] as const).map((key, index) => <label key={key} className={styles.field}>{index === 0 ? 'Prénom' : 'Nom'}<input value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}</div>
      <label className={styles.field}>Adresse e-mail<input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></label>
      {!selected && <label className={styles.field}>Mot de passe temporaire<input type="password" required minLength={12} autoComplete="new-password" value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })} /><small>À changer lors de la première connexion.</small></label>}
      <fieldset><legend>Rôles et privilèges associés</legend>{roles.map(role => <label key={role.id} className={styles.field}><span><input type="checkbox" checked={draft.roles.includes(role.id)} onChange={e => setDraft({ ...draft, roles: e.target.checked ? [...draft.roles, role.id] : draft.roles.filter(id => id !== role.id) })} /> {role.label}</span><small>{role.privileges.join(' · ')}</small></label>)}</fieldset>
      <label className={styles.field}>Entités juridiques (séparées par virgules)<input value={draft.legalEntityIds} onChange={e => setDraft({ ...draft, legalEntityIds: e.target.value })} /></label>
      <label className={styles.field}>Agences autorisées<input value={draft.branchIds} onChange={e => setDraft({ ...draft, branchIds: e.target.value })} /></label>
      <label className={styles.field}>Pools autorisés<input value={draft.poolIds} onChange={e => setDraft({ ...draft, poolIds: e.target.value })} /></label>
      <div className={styles.row}><label className={styles.field}>Niveau de délégation<select value={draft.delegationLevel} onChange={e => setDraft({ ...draft, delegationLevel: Number(e.target.value) })}>{[0,1,2,3,4,5].map(level => <option key={level} value={level}>{level}</option>)}</select></label><label className={styles.field}>Plafond autorisé<input required inputMode="decimal" pattern="[0-9]+(\.[0-9]+)?" value={draft.maximumAmount} onChange={e => setDraft({ ...draft, maximumAmount: e.target.value })} /></label></div>
      <label><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /> Compte actif</label>
      <div className={styles.actions}><button className={styles.button} disabled={busy || !draft.roles.length}>{selected ? 'Enregistrer les modifications' : 'Créer le compte'}</button><button className={styles.secondary} type="button" onClick={() => { setSelected(undefined); setDraft(blank); }}>Nouveau / Annuler</button></div>
    </fieldset></form></section></div></>;
}
