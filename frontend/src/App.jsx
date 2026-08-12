import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Home, Settings, Terminal, Shield, ShieldAlert, Siren, Gavel, Repeat2,
  PartyPopper, Tag, ChevronDown, Bell, Sparkles, Check, Plus, X,
  ExternalLink, Users, Activity, Clock, Wifi, WifiOff, Trash2, RefreshCw,
} from "lucide-react";

/* ------------------------------------------------------------------------
   design tokens — dark golden theme, pulled from the bot's avatar
   bg            #0F0B08
   panel         #1A140D
   panel-2       #241B10
   border        #3A2C17
   accent gold   #E8A33D   (matches guild_config.welcome_color default)
   accent bright #F4C463
   text          #F5EDE0
   text-muted    #A99A80
   danger        #E5636B
   success       #6FCF97
--------------------------------------------------------------------------*/

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
`;

const NAV_MAIN = [
  { id: "home", label: "Home", icon: Home },
  { id: "general", label: "General", icon: Settings },
  { id: "commands", label: "Commands", icon: Terminal },
];

const NAV_MODULES = [
  { id: "automod", label: "AutoMod", icon: Shield },
  { id: "antinuke", label: "Anti-Nuke", icon: ShieldAlert },
  { id: "antiraid", label: "Anti-Raid", icon: Siren },
  { id: "warnings", label: "Warnings", icon: Gavel },
  { id: "roles", label: "Reaction Roles", icon: Repeat2 },
  { id: "welcome", label: "Welcome & Leave", icon: PartyPopper },
  { id: "tags", label: "Tags", icon: Tag },
];

/* ---------------- shared bits ---------------- */

function Toggle({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1A140D]"
      style={{ backgroundColor: checked ? "#E8A33D" : "#3A2C17" }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-[#0F0B08] transition-transform duration-200"
        style={{ transform: checked ? "translateX(22px)" : "translateX(4px)" }}
      />
    </button>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border ${className}`} style={{ backgroundColor: "#1A140D", borderColor: "#3A2C17" }}>
      {children}
    </div>
  );
}

function SectionHeading({ eyebrow, title, desc, right }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="text-xs uppercase tracking-[0.16em] mb-2 font-medium" style={{ color: "#E8A33D", fontFamily: "'JetBrains Mono', monospace" }}>
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl mb-1" style={{ fontFamily: "'Fraunces', serif", color: "#F5EDE0", fontWeight: 500 }}>{title}</h1>
        {desc && <p style={{ color: "#A99A80" }} className="text-sm max-w-xl">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

function Row({ icon: Icon, title, desc, right, dot }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 border-b last:border-b-0" style={{ borderColor: "#3A2C17" }}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#241B10" }}>
            <Icon size={16} style={{ color: "#D8C7A6" }} />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div style={{ color: "#F5EDE0" }} className="text-sm font-medium truncate">{title}</div>
            {dot && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: "#E8A33D" }} />}
          </div>
          {desc && <div style={{ color: "#8A7C64" }} className="text-xs mt-0.5 truncate">{desc}</div>}
        </div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none text-sm rounded-lg pl-3 pr-8 py-2 border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] max-w-[11rem]"
        style={{ backgroundColor: "#241B10", borderColor: "#3A2C17", color: "#F5EDE0" }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#8A7C64" }} />
    </div>
  );
}

function TextField({ value, onChange, onBlur, placeholder, mono }) {
  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className="w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
      style={{ backgroundColor: "#241B10", borderColor: "#3A2C17", color: "#F5EDE0", fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit" }}
    />
  );
}

function StatCard({ label, value, icon: Icon, hint }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div style={{ color: "#8A7C64" }} className="text-xs uppercase tracking-wide font-medium">{label}</div>
          <div style={{ color: "#F5EDE0", fontFamily: "'Fraunces', serif" }} className="text-3xl mt-2">{value ?? "—"}</div>
          {hint && <div style={{ color: "#E8A33D" }} className="text-xs mt-1">{hint}</div>}
        </div>
        <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#241B10" }}>
          <Icon size={16} style={{ color: "#E8A33D" }} />
        </div>
      </div>
    </Card>
  );
}

function Banner({ children, tone = "warn" }) {
  const colors = tone === "warn" ? { bg: "rgba(232,163,61,0.08)", border: "#4A3A1E", text: "#E8A33D" } : { bg: "rgba(229,99,107,0.08)", border: "#4A2226", text: "#E5636B" };
  return (
    <div className="rounded-xl border px-4 py-3 text-sm mb-6" style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}>
      {children}
    </div>
  );
}

/* ---------------- API layer ----------------
   Talks to dashboard.py (the Flask API defined alongside main-5.py).
   Configure the base URL + optional API key from the connection panel —
   they're kept in memory only for this session. */

function useApi() {
  const call = useCallback(async (path, opts = {}) => {
    const res = await fetch(path, {
      ...opts,
      credentials: "include", // send the session cookie set by /callback
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401) throw new Error("Not signed in");
    if (res.status === 403) throw new Error("You don't manage this server");
    if (!res.ok) throw new Error(`${opts.method || "GET"} ${path} → ${res.status}`);
    return res.status === 204 ? null : res.json();
  }, []);
  return call;
}

function useConnection() {
  const [status, setStatus] = useState("checking"); // checking | online | offline
  useEffect(() => {
    let cancelled = false;
    setStatus("checking");
    fetch("/api/health")
      .then((r) => r.json())
      .then((r) => !cancelled && setStatus(r?.ok ? "online" : "offline"))
      .catch(() => !cancelled && setStatus("offline"));
    return () => { cancelled = true; };
  }, []);
  return status;
}

/* Discord login state — /api/me reflects the signed session cookie set
   by dashboard.py's /callback route. */
function useAuth() {
  const [user, setUser] = useState(null);
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setUser(d.user); setGuilds(d.guilds || []); })
      .catch(() => { setUser(null); setGuilds([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const login = () => { window.location.href = "/login"; };
  const logout = () => {
    fetch("/logout", { method: "POST", credentials: "include" }).finally(refresh);
  };

  return { user, guilds, loading, login, logout, refresh };
}

/* ---------------- pages ---------------- */

function HomePage({ api, guildId }) {
  const [data, setData] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      api(`/api/guild/${guildId}/overview`),
      api(`/api/guild/${guildId}/warnings?limit=5`),
    ])
      .then(([overview, w]) => { setData(overview); setWarnings(w); })
      .catch((e) => setError(e.message));
  }, [api, guildId]);

  useEffect(load, [load]);

  return (
    <div>
      <div
        className="rounded-2xl p-8 mb-8 relative overflow-hidden border flex items-center gap-6"
        style={{
          borderColor: "#3A2C17",
          backgroundImage:
            "radial-gradient(60% 100% at 15% 0%, rgba(232,163,61,0.16) 0%, transparent 60%), radial-gradient(50% 80% at 90% 20%, rgba(244,196,99,0.08) 0%, transparent 60%), linear-gradient(180deg, #1A140D 0%, #140F09 100%)",
        }}
      >
        <img src="/heavenly-avatar.jpg" alt="" className="h-20 w-20 rounded-2xl object-cover border-2 shrink-0" style={{ borderColor: "#E8A33D" }} />
        <div>
          <div className="flex items-center gap-1.5 mb-2" style={{ color: "#E8A33D" }}>
            <Sparkles size={14} />
            <span className="text-xs uppercase tracking-[0.16em] font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {data?.name || "Loading server…"}
            </span>
          </div>
          <h1 style={{ fontFamily: "'Fraunces', serif", color: "#F8F1E4", fontWeight: 500 }} className="text-3xl mb-2">
            Heavenly is watching over this server.
          </h1>
          <p style={{ color: "#C2B49A" }} className="text-sm max-w-lg">
            {data ? `${(data.member_count ?? "—").toLocaleString?.() ?? data.member_count} members` : "Connect to load live stats."}
          </p>
        </div>
      </div>

      {error && <Banner tone="danger">Couldn't reach the dashboard API — {error}</Banner>}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Members" value={data?.member_count} icon={Users} />
        <StatCard label="Warnings issued" value={data?.warning_count} icon={Gavel} />
        <StatCard label="Active giveaways" value={data?.active_giveaways} icon={PartyPopper} />
        <StatCard label="Tags" value={data?.tag_count} icon={Tag} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 p-0 overflow-hidden">
          <div className="px-5 py-4 border-b" style={{ borderColor: "#3A2C17" }}>
            <div style={{ color: "#F5EDE0", fontFamily: "'Fraunces', serif" }} className="text-lg">Protection modules</div>
          </div>
          <Row icon={Shield} title="AutoMod" desc={data?.automod_on ? "Active" : "Turned off"} dot={data?.automod_on} right={<span className="text-xs" style={{ color: data?.automod_on ? "#6FCF97" : "#8A7C64" }}>{data?.automod_on ? "On" : "Off"}</span>} />
          <Row icon={ShieldAlert} title="Anti-Nuke" desc={data?.antinuke_on ? "Active" : "Turned off"} dot={data?.antinuke_on} right={<span className="text-xs" style={{ color: data?.antinuke_on ? "#6FCF97" : "#8A7C64" }}>{data?.antinuke_on ? "On" : "Off"}</span>} />
          <Row icon={Siren} title="Anti-Raid" desc={data?.antiraid_on ? "Active" : "Turned off"} dot={data?.antiraid_on} right={<span className="text-xs" style={{ color: data?.antiraid_on ? "#6FCF97" : "#8A7C64" }}>{data?.antiraid_on ? "On" : "Off"}</span>} />
        </Card>

        <Card className="lg:col-span-2 p-0 overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "#3A2C17" }}>
            <Activity size={14} style={{ color: "#E8A33D" }} />
            <div style={{ color: "#F5EDE0", fontFamily: "'Fraunces', serif" }} className="text-lg">Recent warnings</div>
          </div>
          {warnings.length === 0 && <div className="px-5 py-6 text-sm" style={{ color: "#8A7C64" }}>No warnings on record.</div>}
          {warnings.map((w) => (
            <div key={w.id} className="px-5 py-4 border-b last:border-b-0" style={{ borderColor: "#3A2C17" }}>
              <div className="text-sm" style={{ color: "#F5EDE0" }}>
                <span style={{ color: "#E8A33D" }} className="font-medium">User {w.user_id}</span> — {w.reason}
              </div>
              <div className="text-xs mt-1 flex items-center gap-1" style={{ color: "#7A6E58" }}>
                <Clock size={11} /> {w.created_at}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function GeneralPage({ api, guildId }) {
  const [config, setConfig] = useState(null);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    api(`/api/guild/${guildId}/config`).then(setConfig).catch(() => {});
    api(`/api/guild/${guildId}/channels`).then(setChannels).catch(() => {});
    api(`/api/guild/${guildId}/roles`).then(setRoles).catch(() => {});
  }, [api, guildId]);

  const save = (fields) => {
    setConfig((c) => ({ ...c, ...fields }));
    api(`/api/guild/${guildId}/config`, { method: "PUT", body: JSON.stringify(fields) }).catch(() => {});
  };

  if (!config) return <SectionHeading eyebrow="Setup" title="General" desc="Loading…" />;

  return (
    <div>
      <SectionHeading eyebrow="Setup" title="General" desc="Core config stored in guild_config — log channel and the role new members receive." />
      <Card className="p-0 overflow-hidden mb-6">
        <Row
          title="Log channel"
          desc="Where server event logs are posted (/setlogchannel)"
          right={<Select value={config.log_channel_id} onChange={(v) => save({ log_channel_id: Number(v) || null })} placeholder="Not set" options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))} />}
        />
        <Row
          title="Autorole"
          desc="Given automatically when a member joins"
          right={<Select value={config.autorole_id} onChange={(v) => save({ autorole_id: Number(v) || null })} placeholder="Disabled" options={roles.map((r) => ({ value: r.id, label: r.name }))} />}
        />
      </Card>
      <p className="text-xs" style={{ color: "#7A6E58" }}>Command prefix is fixed to <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>!</code> in code — slash commands (/) are the primary interface.</p>
    </div>
  );
}

function CommandsPage({ api, guildId }) {
  const [cmds, setCmds] = useState([]);
  const [saving, setSaving] = useState(null);

  const load = useCallback(() => { api(`/api/guild/${guildId}/commands`).then(setCmds).catch(() => {}); }, [api, guildId]);
  useEffect(load, [load]);

  const toggle = (name) => {
    const next = cmds.map((c) => (c.command_name === name ? { ...c, enabled: !c.enabled } : c));
    setCmds(next);
    setSaving(name);
    const item = next.find((c) => c.command_name === name);
    api(`/api/guild/${guildId}/commands`, { method: "PUT", body: JSON.stringify({ commands: [item] }) })
      .finally(() => setSaving(null));
  };

  return (
    <div>
      <SectionHeading eyebrow="Setup" title="Commands" desc="Enable or disable individual command groups for this server (command_settings table)." />
      <Card className="p-0 overflow-hidden">
        {cmds.map((c) => (
          <Row
            key={c.command_name}
            title={`/${c.command_name}`}
            desc={c.description}
            right={
              <div className="flex items-center gap-2">
                {saving === c.command_name && <RefreshCw size={13} className="animate-spin" style={{ color: "#8A7C64" }} />}
                <Toggle checked={c.enabled} onChange={() => toggle(c.command_name)} label={c.command_name} />
              </div>
            }
          />
        ))}
        {cmds.length === 0 && <div className="px-5 py-6 text-sm" style={{ color: "#8A7C64" }}>No data yet — connect the API to load commands.</div>}
      </Card>
    </div>
  );
}

function AutoModPage({ api, guildId }) {
  const [data, setData] = useState(null);
  const [newWord, setNewWord] = useState("");

  const load = useCallback(() => { api(`/api/guild/${guildId}/automod`).then(setData).catch(() => {}); }, [api, guildId]);
  useEffect(load, [load]);

  const patch = (fields) => {
    setData((d) => ({ ...d, ...fields }));
    api(`/api/guild/${guildId}/automod`, { method: "PUT", body: JSON.stringify(fields) }).catch(() => {});
  };

  const addWord = () => {
    const word = newWord.trim().toLowerCase();
    if (!word) return;
    setNewWord("");
    api(`/api/guild/${guildId}/automod/words`, { method: "POST", body: JSON.stringify({ word }) }).then(load).catch(() => {});
  };

  const removeWord = (word) => {
    api(`/api/guild/${guildId}/automod/words/${encodeURIComponent(word)}`, { method: "DELETE" }).then(load).catch(() => {});
  };

  if (!data) return <SectionHeading eyebrow="Module" title="AutoMod" desc="Loading…" />;

  return (
    <div>
      <SectionHeading eyebrow="Module" title="AutoMod" desc="Automatic message filtering — banned words, invite links, staff mentions." />
      <Card className="p-0 overflow-hidden mb-6">
        <Row icon={Shield} title="AutoMod enabled" right={<Toggle checked={data.automod_enabled} onChange={() => patch({ automod_enabled: !data.automod_enabled })} label="AutoMod" />} />
        <Row title="Block invite links" right={<Toggle checked={data.block_invites} onChange={() => patch({ block_invites: !data.block_invites })} label="Block invites" />} />
        <Row title="Block staff mentions" desc="Prevents mass-pinging staff-recognized roles" right={<Toggle checked={data.block_staff_mentions} onChange={() => patch({ block_staff_mentions: !data.block_staff_mentions })} label="Block staff mentions" />} />
      </Card>

      <Card className="p-5">
        <div className="text-xs uppercase tracking-wide mb-3 font-medium" style={{ color: "#8A7C64" }}>Banned words</div>
        <div className="flex gap-2 mb-4">
          <TextField value={newWord} onChange={setNewWord} placeholder="add a word…" mono />
          <button onClick={addWord} className="shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg" style={{ backgroundColor: "#E8A33D", color: "#0F0B08" }}>
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.banned_words.map((w) => (
            <span key={w} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border" style={{ borderColor: "#3A2C17", color: "#D8C7A6", fontFamily: "'JetBrains Mono', monospace" }}>
              {w}
              <button onClick={() => removeWord(w)} aria-label={`remove ${w}`}><X size={11} style={{ color: "#8A7C64" }} /></button>
            </span>
          ))}
          {data.banned_words.length === 0 && <span className="text-sm" style={{ color: "#8A7C64" }}>No banned words yet.</span>}
        </div>
      </Card>
    </div>
  );
}

function ThresholdConfigPage({ api, guildId, table, title, icon: Icon, actionOptions, thresholdFields }) {
  const [data, setData] = useState(null);
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    api(`/api/guild/${guildId}/${table}`).then(setData).catch(() => {});
    api(`/api/guild/${guildId}/channels`).then(setChannels).catch(() => {});
  }, [api, guildId, table]);

  const patch = (fields) => {
    setData((d) => ({ ...d, ...fields }));
    api(`/api/guild/${guildId}/${table}`, { method: "PUT", body: JSON.stringify(fields) }).catch(() => {});
  };

  if (!data) return <SectionHeading eyebrow="Module" title={title} desc="Loading…" />;

  return (
    <div>
      <SectionHeading eyebrow="Module" title={title} desc={`Detects rapid destructive actions and responds automatically.`} />
      <Card className="p-0 overflow-hidden mb-6">
        <Row icon={Icon} title="Enabled" right={<Toggle checked={!!data.enabled} onChange={() => patch({ enabled: data.enabled ? 0 : 1 })} label="Enabled" />} />
        <Row title="Log channel" right={<Select value={data.log_channel_id} onChange={(v) => patch({ log_channel_id: Number(v) || null })} placeholder="Not set" options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))} />} />
        <Row title="Action" right={<Select value={data.action} onChange={(v) => patch({ action: v })} options={actionOptions} />} />
      </Card>
      <Card className="p-0 overflow-hidden">
        {thresholdFields.map(([key, label]) => (
          <Row key={key} title={label} right={<div className="w-20"><TextField value={data[key]} onChange={(v) => setData((d) => ({ ...d, [key]: v }))} onBlur={() => patch({ [key]: Number(data[key]) || 0 })} /></div>} />
        ))}
      </Card>
    </div>
  );
}

function WarningsPage({ api, guildId }) {
  const [warnings, setWarnings] = useState([]);
  useEffect(() => { api(`/api/guild/${guildId}/warnings?limit=50`).then(setWarnings).catch(() => {}); }, [api, guildId]);
  return (
    <div>
      <SectionHeading eyebrow="Module" title="Warnings" desc="Issued via /warn — read-only here, cleared with /warnings-clear in Discord." />
      <Card className="p-0 overflow-hidden">
        {warnings.map((w) => (
          <Row key={w.id} icon={Gavel} title={`User ${w.user_id}`} desc={w.reason} right={<span className="text-xs" style={{ color: "#7A6E58" }}>{w.created_at}</span>} />
        ))}
        {warnings.length === 0 && <div className="px-5 py-6 text-sm" style={{ color: "#8A7C64" }}>No warnings on record.</div>}
      </Card>
    </div>
  );
}

function ReactionRolesPage({ api, guildId }) {
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ message_id: "", emoji: "", role_id: "" });

  const load = useCallback(() => { api(`/api/guild/${guildId}/reaction-roles`).then(setRows).catch(() => {}); }, [api, guildId]);
  useEffect(load, [load]);
  useEffect(() => { api(`/api/guild/${guildId}/roles`).then(setRoles).catch(() => {}); }, [api, guildId]);

  const add = () => {
    if (!form.message_id || !form.emoji || !form.role_id) return;
    api(`/api/guild/${guildId}/reaction-roles`, {
      method: "POST",
      body: JSON.stringify({ message_id: Number(form.message_id), emoji: form.emoji, role_id: Number(form.role_id) }),
    }).then(() => { setForm({ message_id: "", emoji: "", role_id: "" }); load(); }).catch(() => {});
  };

  const remove = (messageId, emoji) => {
    api(`/api/guild/${guildId}/reaction-roles/${messageId}/${encodeURIComponent(emoji)}`, { method: "DELETE" }).then(load).catch(() => {});
  };

  return (
    <div>
      <SectionHeading eyebrow="Module" title="Reaction Roles" desc="Links an emoji on a message to a role (set up with /reactionrole add)." />
      <Card className="p-5 mb-6">
        <div className="text-xs uppercase tracking-wide mb-3 font-medium" style={{ color: "#8A7C64" }}>Add a link</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <TextField value={form.message_id} onChange={(v) => setForm((f) => ({ ...f, message_id: v }))} placeholder="Message ID" mono />
          <TextField value={form.emoji} onChange={(v) => setForm((f) => ({ ...f, emoji: v }))} placeholder="Emoji" />
          <Select value={form.role_id} onChange={(v) => setForm((f) => ({ ...f, role_id: v }))} placeholder="Choose a role" options={roles.map((r) => ({ value: r.id, label: r.name }))} />
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg" style={{ backgroundColor: "#E8A33D", color: "#0F0B08" }}>
          <Plus size={14} /> Link role
        </button>
      </Card>
      <Card className="p-0 overflow-hidden">
        {rows.map((r) => (
          <Row
            key={`${r.message_id}-${r.emoji}`}
            title={`${r.emoji}  →  role ${r.role_id}`}
            desc={`Message ${r.message_id}`}
            right={<button onClick={() => remove(r.message_id, r.emoji)} aria-label="remove"><Trash2 size={15} style={{ color: "#8A7C64" }} /></button>}
          />
        ))}
        {rows.length === 0 && <div className="px-5 py-6 text-sm" style={{ color: "#8A7C64" }}>No reaction roles set up yet.</div>}
      </Card>
    </div>
  );
}

function WelcomePage({ api, guildId }) {
  const [config, setConfig] = useState(null);
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    api(`/api/guild/${guildId}/config`).then(setConfig).catch(() => {});
    api(`/api/guild/${guildId}/channels`).then(setChannels).catch(() => {});
  }, [api, guildId]);

  const patch = (fields) => {
    setConfig((c) => ({ ...c, ...fields }));
  };
  const commit = (fields) => {
    api(`/api/guild/${guildId}/config`, { method: "PUT", body: JSON.stringify(fields) }).catch(() => {});
  };

  if (!config) return <SectionHeading eyebrow="Module" title="Welcome & Leave" desc="Loading…" />;

  return (
    <div>
      <SectionHeading eyebrow="Module" title="Welcome & Leave" desc="Greet new members and announce departures (/welcome, /leave set)." />
      <Card className="p-0 overflow-hidden mb-6">
        <Row title="Welcome channel" right={<Select value={config.welcome_channel_id} onChange={(v) => { patch({ welcome_channel_id: Number(v) }); commit({ welcome_channel_id: Number(v) || null }); }} placeholder="Not set" options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))} />} />
        <Row title="Welcome color" right={<div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border" style={{ backgroundColor: config.welcome_color, borderColor: "#3A2C17" }} /><TextField value={config.welcome_color} onChange={(v) => patch({ welcome_color: v })} onBlur={() => commit({ welcome_color: config.welcome_color })} mono /></div>} />
        <Row title="Show member count" right={<Toggle checked={!!config.welcome_show_count} onChange={() => { const v = config.welcome_show_count ? 0 : 1; patch({ welcome_show_count: v }); commit({ welcome_show_count: v }); }} label="Show count" />} />
      </Card>
      <Card className="p-5 mb-6">
        <div className="text-xs uppercase tracking-wide mb-2 font-medium" style={{ color: "#8A7C64" }}>Welcome message</div>
        <textarea
          value={config.welcome_message || ""}
          onChange={(e) => patch({ welcome_message: e.target.value })}
          onBlur={() => commit({ welcome_message: config.welcome_message })}
          rows={3}
          placeholder="Glad you're here, {member} — you're member #{count}."
          className="w-full text-sm rounded-lg px-3 py-2.5 border resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
          style={{ backgroundColor: "#241B10", borderColor: "#3A2C17", color: "#F5EDE0" }}
        />
      </Card>
      <Card className="p-0 overflow-hidden mb-6">
        <Row title="Leave channel" right={<Select value={config.leave_channel_id} onChange={(v) => { patch({ leave_channel_id: Number(v) }); commit({ leave_channel_id: Number(v) || null }); }} placeholder="Not set" options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))} />} />
      </Card>
      <Card className="p-5">
        <div className="text-xs uppercase tracking-wide mb-2 font-medium" style={{ color: "#8A7C64" }}>Leave message</div>
        <textarea
          value={config.leave_message || ""}
          onChange={(e) => patch({ leave_message: e.target.value })}
          onBlur={() => commit({ leave_message: config.leave_message })}
          rows={2}
          placeholder="{member} has left the server."
          className="w-full text-sm rounded-lg px-3 py-2.5 border resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
          style={{ backgroundColor: "#241B10", borderColor: "#3A2C17", color: "#F5EDE0" }}
        />
      </Card>
    </div>
  );
}

function TagsPage({ api, guildId }) {
  const [tags, setTags] = useState([]);
  useEffect(() => { api(`/api/guild/${guildId}/tags`).then(setTags).catch(() => {}); }, [api, guildId]);
  return (
    <div>
      <SectionHeading eyebrow="Module" title="Tags" desc="Custom canned responses — created with /tag create, shown here read-only." />
      <Card className="p-0 overflow-hidden">
        {tags.map((t) => (
          <Row key={t.name} icon={Tag} title={`/tag ${t.name}`} desc={t.content} right={<span className="text-xs" style={{ color: "#7A6E58" }}>by {t.creator_id ?? "unknown"}</span>} />
        ))}
        {tags.length === 0 && <div className="px-5 py-6 text-sm" style={{ color: "#8A7C64" }}>No tags yet.</div>}
      </Card>
    </div>
  );
}

/* ---------------- connection status ---------------- */

function StatusDot({ status }) {
  const dot = status === "online" ? "#6FCF97" : status === "offline" ? "#E5636B" : "#E8A33D";
  const label = status === "online" ? "Connected" : status === "offline" ? "Offline" : "Checking…";
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm" style={{ borderColor: "#3A2C17", color: "#F5EDE0" }}>
      {status === "online" ? <Wifi size={14} style={{ color: dot }} /> : <WifiOff size={14} style={{ color: dot }} />}
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

function LoginGate({ onLogin }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <img src="/heavenly-avatar.jpg" alt="" className="h-16 w-16 rounded-2xl object-cover border-2 mb-5" style={{ borderColor: "#E8A33D" }} />
      <h1 style={{ fontFamily: "'Fraunces', serif", color: "#F8F1E4" }} className="text-2xl mb-2">Sign in to manage your servers</h1>
      <p style={{ color: "#A99A80" }} className="text-sm max-w-sm mb-6">
        Log in with Discord — you'll only see servers where you have Manage Server permission and Heavenly is installed.
      </p>
      <button
        onClick={onLogin}
        className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg"
        style={{ backgroundColor: "#E8A33D", color: "#0F0B08" }}
      >
        <Sparkles size={15} /> Sign in with Discord
      </button>
    </div>
  );
}

function ServerPicker({ guilds, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const current = guilds.find((g) => g.id === selected);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-sm" style={{ borderColor: "#3A2C17", color: "#F5EDE0" }}>
        {current?.icon_url ? (
          <img src={current.icon_url} alt="" className="h-5 w-5 rounded-full" />
        ) : (
          <span className="h-5 w-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: "#241B10", color: "#E8A33D" }}>
            {current?.name?.[0] ?? "?"}
          </span>
        )}
        <span className="font-medium max-w-[10rem] truncate">{current?.name || "Choose a server"}</span>
        <ChevronDown size={14} style={{ color: "#8A7C64" }} />
      </button>
      {open && (
        <div className="absolute mt-1.5 w-64 rounded-xl border shadow-xl overflow-hidden z-10" style={{ backgroundColor: "#1A140D", borderColor: "#3A2C17" }}>
          {guilds.length === 0 && <div className="px-4 py-3 text-sm" style={{ color: "#8A7C64" }}>No manageable servers found.</div>}
          {guilds.map((g) => (
            <button key={g.id} onClick={() => { onSelect(g.id); setOpen(false); }} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-[#241B10]" style={{ color: "#F5EDE0" }}>
              <span className="flex items-center gap-2.5 min-w-0">
                {g.icon_url ? <img src={g.icon_url} alt="" className="h-5 w-5 rounded-full shrink-0" /> : <span className="h-5 w-5 rounded-full shrink-0" style={{ backgroundColor: "#241B10" }} />}
                <span className="truncate">{g.name}</span>
              </span>
              {g.id === selected && <Check size={14} style={{ color: "#E8A33D" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium" style={{ backgroundColor: "#241B10", color: "#E8A33D" }}>
            {user.username?.[0]?.toUpperCase()}
          </div>
        )}
        <span className="text-sm hidden sm:block" style={{ color: "#F5EDE0" }}>{user.username}</span>
        <ChevronDown size={14} style={{ color: "#8A7C64" }} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-40 rounded-xl border shadow-xl overflow-hidden z-10" style={{ backgroundColor: "#1A140D", borderColor: "#3A2C17" }}>
          <button onClick={onLogout} className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#241B10]" style={{ color: "#E5636B" }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- shell ---------------- */

export default function App() {
  const [page, setPage] = useState("home");
  const status = useConnection();
  const api = useApi();
  const auth = useAuth();
  const [guildId, setGuildId] = useState(null);

  useEffect(() => {
    if (!guildId && auth.guilds.length > 0) setGuildId(auth.guilds[0].id);
  }, [auth.guilds, guildId]);

  const hasGuild = Boolean(guildId);

  const pageProps = { api, guildId };
  const pages = {
    home: <HomePage {...pageProps} />,
    general: <GeneralPage {...pageProps} />,
    commands: <CommandsPage {...pageProps} />,
    automod: <AutoModPage {...pageProps} />,
    antinuke: <ThresholdConfigPage {...pageProps} table="antinuke" title="Anti-Nuke" icon={ShieldAlert} actionOptions={[{ value: "kick", label: "Kick the nuker" }, { value: "ban", label: "Ban the nuker" }]} thresholdFields={[["ban_threshold", "Ban threshold"], ["channel_delete_threshold", "Channel-delete threshold"], ["role_delete_threshold", "Role-delete threshold"]]} />,
    antiraid: <ThresholdConfigPage {...pageProps} table="antiraid" title="Anti-Raid" icon={Siren} actionOptions={[{ value: "kick", label: "Kick raiders" }, { value: "ban", label: "Ban raiders" }, { value: "lockdown", label: "Lockdown server" }]} thresholdFields={[["join_threshold", "Join threshold"], ["join_window", "Join window (s)"], ["min_account_age_days", "Min. account age (days)"]]} />,
    warnings: <WarningsPage {...pageProps} />,
    roles: <ReactionRolesPage {...pageProps} />,
    welcome: <WelcomePage {...pageProps} />,
    tags: <TagsPage {...pageProps} />,
  };

  const NavItem = ({ item }) => {
    const active = page === item.id;
    const Icon = item.icon;
    return (
      <button
        onClick={() => setPage(item.id)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
        style={{ backgroundColor: active ? "#241B10" : "transparent", color: active ? "#E8A33D" : "#C2B49A" }}
      >
        <Icon size={16} />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen w-full flex" style={{ backgroundColor: "#0F0B08", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{FONTS}</style>

      <aside className="w-64 shrink-0 border-r flex flex-col" style={{ borderColor: "#3A2C17" }}>
        <div className="h-16 flex items-center gap-2.5 px-5 border-b" style={{ borderColor: "#3A2C17" }}>
          <img src="/heavenly-avatar.jpg" alt="Heavenly" className="h-8 w-8 rounded-lg object-cover border" style={{ borderColor: "#E8A33D" }} />
          <span style={{ fontFamily: "'Fraunces', serif", color: "#F8F1E4" }} className="text-lg">Heavenly</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_MAIN.map((item) => <NavItem key={item.id} item={item} />)}
          <div className="text-xs uppercase tracking-[0.14em] font-medium px-3 pt-5 pb-2" style={{ color: "#6B5F49", fontFamily: "'JetBrains Mono', monospace" }}>Modules</div>
          {NAV_MODULES.map((item) => <NavItem key={item.id} item={item} />)}
        </nav>
        <div className="p-3 border-t" style={{ borderColor: "#3A2C17" }}>
          <a href="#" className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#8A7C64" }}>
            <ExternalLink size={12} /> Documentation
          </a>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b flex items-center justify-between px-6 shrink-0" style={{ borderColor: "#3A2C17" }}>
          <div>
            {auth.user && <ServerPicker guilds={auth.guilds} selected={guildId} onSelect={setGuildId} />}
          </div>
          <div className="flex items-center gap-4">
            <button aria-label="Refresh" onClick={() => window.location.reload()} className="focus:outline-none">
              <RefreshCw size={16} style={{ color: "#8A7C64" }} />
            </button>
            <StatusDot status={status} />
            {auth.user && <UserMenu user={auth.user} onLogout={auth.logout} />}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-8 max-w-5xl w-full mx-auto">
          {auth.loading ? (
            <div className="text-sm" style={{ color: "#8A7C64" }}>Loading…</div>
          ) : !auth.user ? (
            <LoginGate onLogin={auth.login} />
          ) : !hasGuild ? (
            <Banner>No manageable servers found — make sure Heavenly is invited to a server you have Manage Server permission on.</Banner>
          ) : (
            pages[page]
          )}
        </main>
      </div>
    </div>
  );
}
