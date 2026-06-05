"use client";

import { useEffect, useMemo, useState } from "react";
import { keepAuthInSessionOnly, supabase } from "../lib/supabase";

type Client = { id: string; full_name: string; phone: string; email: string | null; notes: string | null };
type Staff = { id: string; profile_id: string | null; name: string; role: string; active: boolean };
type Treatment = { id: string; category: string; treatment: string; variant: string; duration_minutes: number; default_price: number };
type Appointment = {
  id: string;
  starts_at: string;
  duration_minutes: number;
  status: string;
  client_id: string;
  staff_id: string | null;
  treatment_id: string | null;
  notes: string | null;
  paid_status: string;
  payment_method: string | null;
  final_price: number;
  clients?: Client;
  staff?: Staff;
  treatments?: Treatment;
};
type Profile = { id: string; username: string; auth_email: string; role: "admin" | "therapist" | "receptionist" };

const statuses = ["scheduled", "completed", "cancelled", "no_show"];
const paidStatuses = ["unpaid", "deposit_paid", "paid", "refunded"];
const paymentMethods = ["cash", "card", "bank_transfer", "voucher"];
const adminCreationPassword = "6871";
const usernameToAuthEmail = (username: string) => `${username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")}@users.lasertreat.local`;

export default function Page() {
  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "create">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberSession, setRememberSession] = useState(true);
  const [adminCode, setAdminCode] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState("appointments");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clientForm, setClientForm] = useState({ full_name: "", phone: "", email: "", notes: "" });
  const [staffForm, setStaffForm] = useState({ name: "", role: "Therapist", profile_id: "" });
  const [appointmentForm, setAppointmentForm] = useState({
    starts_at: new Date().toISOString().slice(0, 16),
    duration_minutes: 30,
    client_id: "",
    staff_id: "",
    treatment_id: "",
    status: "scheduled",
    final_price: 0,
    paid_status: "unpaid",
    payment_method: "card",
    notes: ""
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    void loadProfile(userId);
  }, [userId]);

  useEffect(() => {
    if (!profile) return;
    void refreshAll();
    const channel = supabase
      .channel("shared-clinic-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff" }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "treatments" }, refreshAll)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile]);

  useEffect(() => {
    const treatment = treatments.find((item) => item.id === appointmentForm.treatment_id);
    if (!treatment) return;
    setAppointmentForm((current) => ({
      ...current,
      duration_minutes: treatment.duration_minutes,
      final_price: Number(treatment.default_price)
    }));
  }, [appointmentForm.treatment_id, treatments]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      today: appointments.filter((appt) => appt.starts_at.slice(0, 10) === today && appt.status === "scheduled").length,
      clients: clients.length,
      staff: staff.filter((member) => member.active).length,
      unpaid: appointments.filter((appt) => ["unpaid", "deposit_paid"].includes(appt.paid_status) && appt.status !== "cancelled").length
    };
  }, [appointments, clients, staff]);
  const isAdmin = profile?.role === "admin";
  const isReceptionist = profile?.role === "receptionist";
  const currentStaffId = staff.find((member) => member.profile_id === profile?.id || member.name.trim().toLowerCase() === profile?.username)?.id;
  const canManageBookings = isAdmin || isReceptionist;
  const visibleTabs = isAdmin ? ["appointments", "clients", "staff", "treatments"] : ["appointments", "clients", "treatments"];

  async function loadProfile(id: string) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
    if (error) {
      setNotice("Profile missing. Ask an admin to create your user profile.");
      return;
    }
    setProfile(data as Profile);
  }

  async function refreshAll() {
    const [clientRes, staffRes, treatmentRes, appointmentRes] = await Promise.all([
      supabase.from("clients").select("*").order("full_name"),
      supabase.from("staff").select("*").order("name"),
      supabase.from("treatments").select("*").eq("active", true).order("category"),
      supabase
        .from("appointments")
        .select("*, clients(*), staff(*), treatments(*)")
        .order("starts_at", { ascending: true })
    ]);
    if (clientRes.data) setClients(clientRes.data);
    if (staffRes.data) setStaff(staffRes.data);
    if (treatmentRes.data) setTreatments(treatmentRes.data);
    if (appointmentRes.data) setAppointments(appointmentRes.data as Appointment[]);
    const profileRes = await supabase.from("profiles").select("*").order("username");
    if (profileRes.data) setProfiles(profileRes.data as Profile[]);
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToAuthEmail(username), password });
    setLoading(false);
    if (!error && !rememberSession) keepAuthInSessionOnly();
    if (error) setNotice(error.message);
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    const cleanUsername = username.trim().toLowerCase();
    const role = adminCode === adminCreationPassword ? "admin" : "therapist";
    const { data, error } = await supabase.auth.signUp({
      email: usernameToAuthEmail(cleanUsername),
      password,
      options: { data: { username: cleanUsername, role } }
    });
    if (error) {
      setLoading(false);
      return setNotice(error.message);
    }
    if (data.user) {
      const profileResult = await supabase.rpc("create_my_profile", {
        p_username: cleanUsername,
        p_admin_creation_password: adminCode
      });
      if (profileResult.error) setNotice(profileResult.error.message);
      else setNotice(role === "admin" ? "Admin account created" : "Staff account created");
    }
    if (!rememberSession) keepAuthInSessionOnly();
    setLoading(false);
  }

  async function addClient(event: React.FormEvent) {
    event.preventDefault();
    if (profile?.role === "therapist") return setNotice("Therapists can view clients but cannot create clients.");
    const { error } = await supabase.from("clients").insert(clientForm);
    if (error) return setNotice(error.message);
    setClientForm({ full_name: "", phone: "", email: "", notes: "" });
    setNotice("Client saved");
    await refreshAll();
  }

  async function addStaff(event: React.FormEvent) {
    event.preventDefault();
    if (!isAdmin) return setNotice("Only Admin can manage staff.");
    const { error } = await supabase.from("staff").insert({ ...staffForm, profile_id: staffForm.profile_id || null, active: true });
    if (error) return setNotice(error.message);
    setStaffForm({ name: "", role: "Therapist", profile_id: "" });
    setNotice("Staff saved");
    await refreshAll();
  }

  async function addAppointment(event: React.FormEvent) {
    event.preventDefault();
    if (!canManageBookings) return setNotice("Only Admin or Receptionist can create bookings.");
    const startsAt = new Date(appointmentForm.starts_at).toISOString();
    const { error } = await supabase.from("appointments").insert({
      ...appointmentForm,
      starts_at: startsAt,
      final_price: Number(appointmentForm.final_price),
      duration_minutes: Number(appointmentForm.duration_minutes)
    });
    if (error) return setNotice(error.message);
    setNotice("Appointment saved");
    await refreshAll();
  }

  async function updateAppointment(id: string, patch: Partial<Appointment>) {
    const appointment = appointments.find((item) => item.id === id);
    if (!isAdmin && !isReceptionist && appointment?.staff_id !== currentStaffId) {
      return setNotice("Therapists can only edit assigned appointments.");
    }
    const { error } = await supabase.from("appointments").update(patch).eq("id", id);
    if (error) return setNotice(error.message);
    await refreshAll();
  }

  async function removeAppointment(id: string) {
    if (!canManageBookings) return setNotice("Only Admin or Receptionist can delete bookings.");
    if (!confirm("Delete this appointment?")) return;
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) return setNotice(error.message);
    setNotice("Appointment deleted");
    await refreshAll();
  }

  if (!sessionReady) return <main className="login">Loading...</main>;

  if (!userId) {
    return (
      <main className="login">
        <form className="card" onSubmit={authMode === "login" ? login : createAccount}>
          <div className="brand">
            <h1>Laser Treat Esthetica</h1>
            <p>Shared clinic booking system</p>
          </div>
          {notice ? <p className="notice">{notice}</p> : null}
          <div className="tabs compact">
            <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Login</button>
            <button type="button" className={authMode === "create" ? "active" : ""} onClick={() => setAuthMode("create")}>Create User</button>
          </div>
          <div className="form">
            <label className="full">Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" autoCorrect="off" required /></label>
            <label className="full">Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
            <label className="check full"><input type="checkbox" checked={rememberSession} onChange={(event) => setRememberSession(event.target.checked)} /> Remember session</label>
            {authMode === "create" ? <label className="full">Admin creation password<input value={adminCode} onChange={(event) => setAdminCode(event.target.value)} type="password" placeholder="Only enter if creating Admin" /></label> : null}
            <button className="gold full" disabled={loading}>{loading ? "Please wait..." : authMode === "login" ? "Sign In" : "Create Account"}</button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="top">
        <div className="brand">
          <h1>Laser Treat Esthetica</h1>
          <p>Simple shared clinic database. Signed in as {profile?.username} ({profile?.role})</p>
        </div>
        <div className="top-actions">
          <button className="hamburger" aria-label="Open menu" onClick={() => setMenuOpen((open) => !open)}><span></span><span></span><span></span></button>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Logout</button>
        </div>
      </header>

      {notice ? <p className="notice">{notice}</p> : null}

      <section className="grid">
        <Stat label="Today's Appointments" value={stats.today} />
        <Stat label="Clients" value={stats.clients} />
        <Stat label="Active Staff" value={stats.staff} />
        <Stat label="Pending Payments" value={stats.unpaid} />
      </section>

      <nav className={`tabs main-nav ${menuOpen ? "open" : ""}`}>
        {visibleTabs.map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => { setTab(item); setMenuOpen(false); }}>
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>

      {tab === "appointments" ? (
        <section className="card">
          <h2>Appointments</h2>
          {canManageBookings ? <form className="form" onSubmit={addAppointment}>
            <label>Date & Time<input type="datetime-local" value={appointmentForm.starts_at} onChange={(event) => setAppointmentForm({ ...appointmentForm, starts_at: event.target.value })} required /></label>
            <label>Client<select value={appointmentForm.client_id} onChange={(event) => setAppointmentForm({ ...appointmentForm, client_id: event.target.value })} required><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.full_name}</option>)}</select></label>
            <label>Staff<select value={appointmentForm.staff_id} onChange={(event) => setAppointmentForm({ ...appointmentForm, staff_id: event.target.value })}><option value="">Unassigned</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label>Treatment<select value={appointmentForm.treatment_id} onChange={(event) => setAppointmentForm({ ...appointmentForm, treatment_id: event.target.value })}><option value="">Select treatment</option>{treatments.map((treatment) => <option key={treatment.id} value={treatment.id}>{treatment.category} / {treatment.treatment} / {treatment.variant}</option>)}</select></label>
            <label>Duration<input type="number" min="5" value={appointmentForm.duration_minutes} onChange={(event) => setAppointmentForm({ ...appointmentForm, duration_minutes: Number(event.target.value) })} /></label>
            {isAdmin ? <label>Price<input type="number" min="0" step="0.01" value={appointmentForm.final_price} onChange={(event) => setAppointmentForm({ ...appointmentForm, final_price: Number(event.target.value) })} /></label> : null}
            <label>Status<select value={appointmentForm.status} onChange={(event) => setAppointmentForm({ ...appointmentForm, status: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            {isAdmin ? <label>Paid Status<select value={appointmentForm.paid_status} onChange={(event) => setAppointmentForm({ ...appointmentForm, paid_status: event.target.value })}>{paidStatuses.map((status) => <option key={status}>{status}</option>)}</select></label> : null}
            {isAdmin ? <label>Payment Method<select value={appointmentForm.payment_method} onChange={(event) => setAppointmentForm({ ...appointmentForm, payment_method: event.target.value })}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label> : null}
            <label className="full">Notes<textarea value={appointmentForm.notes} onChange={(event) => setAppointmentForm({ ...appointmentForm, notes: event.target.value })} /></label>
            <button className="gold full">Add Appointment</button>
          </form> : <p className="notice">Therapists can view appointments and update assigned work.</p>}
          <div className="list" style={{ marginTop: 14 }}>
            {appointments.map((appt) => (
              <div className="row" key={appt.id}>
                <div>
                  <strong>{new Date(appt.starts_at).toLocaleString()} - {appt.clients?.full_name ?? "No client"}</strong>
                  <div className="meta">{appt.treatments ? `${appt.treatments.treatment} / ${appt.treatments.variant}` : "No treatment"} · {appt.staff?.name ?? "Unassigned"}{isAdmin ? ` · £${Number(appt.final_price).toFixed(2)}` : ""}</div>
                </div>
                <div className="actions">
                  <select value={appt.status} onChange={(event) => updateAppointment(appt.id, { status: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
                  {canManageBookings ? <button className="danger" onClick={() => removeAppointment(appt.id)}>Delete</button> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "clients" ? (
        <section className="card">
          <h2>Clients</h2>
          {profile?.role !== "therapist" ? <form className="form" onSubmit={addClient}>
            <label>Full Name<input value={clientForm.full_name} onChange={(event) => setClientForm({ ...clientForm, full_name: event.target.value })} required /></label>
            <label>Phone<input value={clientForm.phone} onChange={(event) => setClientForm({ ...clientForm, phone: event.target.value })} required /></label>
            <label>Email<input value={clientForm.email} onChange={(event) => setClientForm({ ...clientForm, email: event.target.value })} /></label>
            <label className="full">Notes<textarea value={clientForm.notes} onChange={(event) => setClientForm({ ...clientForm, notes: event.target.value })} /></label>
            <button className="gold full">Add Client</button>
          </form> : <p className="notice">Therapists can view clients. Ask Reception or Admin to create new client records.</p>}
          <SimpleList items={clients.map((client) => ({ title: client.full_name, meta: `${client.phone}${client.email ? ` · ${client.email}` : ""}` }))} />
        </section>
      ) : null}

      {tab === "staff" && isAdmin ? (
        <section className="card">
          <h2>Staff</h2>
          <form className="form" onSubmit={addStaff}>
            <label>Name<input value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} required /></label>
            <label>Role<select value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value })}><option>Admin</option><option>Therapist</option><option>Receptionist</option></select></label>
            <label className="full">Linked Login<select value={staffForm.profile_id} onChange={(event) => setStaffForm({ ...staffForm, profile_id: event.target.value })}><option value="">No linked login</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.username} ({item.role})</option>)}</select></label>
            <button className="gold full">Add Staff</button>
          </form>
          <SimpleList items={staff.map((member) => ({ title: member.name, meta: `${member.role} · ${member.active ? "Active" : "Inactive"}` }))} />
        </section>
      ) : null}

      {tab === "treatments" ? (
        <section className="card">
          <h2>Treatments</h2>
          <SimpleList items={treatments.map((treatment) => ({ title: `${treatment.treatment} / ${treatment.variant}`, meta: `${treatment.category} · ${treatment.duration_minutes} min · £${Number(treatment.default_price).toFixed(2)}` }))} />
        </section>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>;
}

function SimpleList({ items }: { items: { title: string; meta: string }[] }) {
  return (
    <div className="list" style={{ marginTop: 14 }}>
      {items.length ? items.map((item, index) => (
        <div className="row" key={`${item.title}-${index}`}>
          <div><strong>{item.title}</strong><div className="meta">{item.meta}</div></div>
        </div>
      )) : <div className="notice">Nothing added yet.</div>}
    </div>
  );
}
