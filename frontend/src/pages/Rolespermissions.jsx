import { Fragment, useEffect, useRef, useState } from 'react';
import { createRole, deleteRole, getRoles, updateRolePermissions } from '../config/Roles';
import './RolesPermissions.css';

export default function RolesPermissions() {
  const [actions, setActions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const nameInput = useRef(null);

  const load = async (keepId) => {
    const data = await getRoles();
    setActions(data.actions);
    setGroups(data.groups);
    setRoles(data.roles);
    setSelectedId((cur) => {
      const want = keepId || cur;
      return data.roles.some((r) => r._id === want) ? want : data.roles[0]?._id || '';
    });
  };

  useEffect(() => {
    load()
      .catch((e) => setMsg({ ok: false, text: e.message }))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (adding) nameInput.current?.focus();
  }, [adding]);

  const role = roles.find((r) => r._id === selectedId) || null;

  // tick / untick boxes: shown at once, saved in the background, put back if the save fails
  const apply = async (changes) => {
    if (!role || !changes.length) return;
    setMsg(null);
    setRoles((list) =>
      list.map((r) => {
        if (r._id !== role._id) return r;
        const permissions = { ...r.permissions };
        changes.forEach((c) => {
          permissions[c.module] = { ...permissions[c.module], [c.action]: c.value };
        });
        return { ...r, permissions };
      })
    );
    try {
      const saved = await updateRolePermissions(role._id, changes);
      setRoles((list) => list.map((r) => (r._id === saved._id ? saved : r)));
    } catch (e) {
      setMsg({ ok: false, text: e.message });
      load().catch(() => {});
    }
  };

  const onBox = (moduleKey, actionKey, value) => {
    const current = role.permissions[moduleKey];
    const changes = [{ module: moduleKey, action: actionKey, value }];
    if (actionKey === 'view' && !value) {
      // without View nothing else makes sense: clear the row
      actions.forEach((a) => {
        if (a.key !== 'view' && current[a.key]) changes.push({ module: moduleKey, action: a.key, value: false });
      });
    } else if (actionKey !== 'view' && value && !current.view) {
      changes.push({ module: moduleKey, action: 'view', value: true }); // doing needs seeing
    }
    apply(changes);
  };

  const onToggleRow = (moduleKey) => {
    const current = role.permissions[moduleKey];
    const value = !actions.every((a) => current[a.key]); // all on -> all off, otherwise all on
    apply(
      actions.filter((a) => current[a.key] !== value).map((a) => ({ module: moduleKey, action: a.key, value }))
    );
  };

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) return nameInput.current?.focus();
    setBusy(true);
    setMsg(null);
    try {
      const created = await createRole(name);
      await load(created._id);
      setAdding(false);
      setNewName('');
      setMsg({ ok: true, text: `Role "${created.name}" added. Tick what it is allowed to do.` });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!role || !window.confirm(`Delete the role "${role.name}"?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await deleteRole(role._id);
      await load();
      setMsg({ ok: true, text: `Role "${role.name}" deleted.` });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rl-page">
      <div className="rl-head">
        <div>
          <h1>Roles &amp; permissions</h1>
          <p>
            Choose what each role can do in every module. Changes apply immediately to all staff with
            that role.
          </p>
        </div>
        <button type="button" className="rl-btn" onClick={() => setAdding(true)} disabled={adding}>
          + New role
        </button>
      </div>

      {adding && (
        <div className="rl-add">
          <label htmlFor="rl-new-name">Role name</label>
          <input
            id="rl-new-name"
            ref={nameInput}
            type="text"
            maxLength={60}
            placeholder="For example: Exam Cell Clerk"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreate();
              if (e.key === 'Escape') setAdding(false);
            }}
          />
          <button type="button" className="rl-btn primary" onClick={onCreate} disabled={busy}>
            {busy ? 'Adding…' : 'Add role'}
          </button>
          <button type="button" className="rl-btn" onClick={() => { setAdding(false); setNewName(''); }}>
            Cancel
          </button>
        </div>
      )}

      {msg && <p className={`rl-alert ${msg.ok ? 'ok' : 'error'}`}>{msg.text}</p>}

      <div className="rl-grid">
        {/* ---- roles ---- */}
        <section className="rl-card">
          <h3 className="rl-card-title">Roles</h3>
          <div className="rl-roles">
            {loading && <p className="rl-muted">Loading…</p>}
            {roles.map((r) => (
              <button
                key={r._id}
                type="button"
                className={`rl-role ${r._id === selectedId ? 'current' : ''}`}
                onClick={() => setSelectedId(r._id)}
                aria-pressed={r._id === selectedId}
              >
                <span>{r.name}</span>
                <b title={`${r.staffCount} active staff`}>{r.staffCount}</b>
              </button>
            ))}
          </div>
        </section>

        {/* ---- permissions of the selected role ---- */}
        <section className="rl-card">
          <div className="rl-card-title rl-card-head">
            <h3>{role ? role.name : 'Permissions'}</h3>
            {role && (
              <span className="rl-staff">
                {role.staffCount ? role.staff.join(', ') : 'No staff in this role'}
                {role.staffCount === 0 && (
                  <button type="button" className="rl-link" onClick={onDelete} disabled={busy}>
                    Delete role
                  </button>
                )}
              </span>
            )}
          </div>

          <div className="rl-table-wrap">
            <table className="rl-table">
              <thead>
                <tr>
                  <th>Module</th>
                  {actions.map((a) => (
                    <th key={a.key} className="c">{a.label}</th>
                  ))}
                  <th className="c">All</th>
                </tr>
              </thead>
              <tbody>
                {!role && (
                  <tr><td colSpan={actions.length + 2} className="rl-muted">{loading ? 'Loading…' : 'No roles yet.'}</td></tr>
                )}
                {role &&
                  groups.map((g) => (
                    <Fragment key={g.label}>
                      <tr className="rl-group">
                        <td colSpan={actions.length + 2}>{g.label}</td>
                      </tr>
                      {g.modules.map((m) => (
                        <tr key={m.key}>
                          <td>{m.name}</td>
                          {actions.map((a) => (
                            <td key={a.key} className="c">
                              <input
                                type="checkbox"
                                checked={!!role.permissions[m.key]?.[a.key]}
                                onChange={(e) => onBox(m.key, a.key, e.target.checked)}
                                aria-label={`${a.label}: ${m.name}`}
                              />
                            </td>
                          ))}
                          <td className="c">
                            <button type="button" className="rl-btn small" onClick={() => onToggleRow(m.key)}>
                              Toggle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}