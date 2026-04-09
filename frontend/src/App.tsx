import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthMode, Locale, View, messages } from "./i18n";

type Heartbeat = { name: string; version: string };
type User = { username: string; email: string; full_name: string; disabled: boolean };
type TimeEntry = {
  id: number;
  project_name: string | null;
  activity_description: string | null;
  start_time: string;
  end_time: string | null;
  start_day: string;
  start_clock_time: string;
  end_day: string | null;
  end_clock_time: string | null;
  duration_hours: number;
  is_running: boolean;
};
type TimeEntryListResponse = {
  items: TimeEntry[];
  total: number;
  page: number;
  page_size: number;
  project_suggestions: string[];
  previous_project_name: string | null;
};
type ActiveTimeEntryResponse = { entry: TimeEntry | null; previous_project_name: string | null };
type TimeEntryFilters = { projectName: string; year: string; month: string; day: string };
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname || "localhost"}:8000`;
const MAILHOG_UI_URL =
  `${window.location.protocol}//${window.location.hostname || "localhost"}:8025`;
const TOKEN_STORAGE_KEY = "rworkspace.accessToken";
const LOCALE_STORAGE_KEY = "rworkspace.locale";
const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 50, 100];

function buildAuthHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function buildQueryString(filters: {
  projectName: string;
  year: string;
  month: string;
  day: string;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (filters.projectName.trim()) params.set("project_name", filters.projectName.trim());
  if (filters.year.trim()) params.set("year", filters.year.trim());
  if (filters.month.trim()) params.set("month", filters.month.trim());
  if (filters.day.trim()) params.set("day", filters.day.trim());
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("page_size", String(filters.pageSize));
  return params.toString();
}

function formatRunningDuration(startTimeIso: string, tick: number) {
  const elapsedMs = Math.max(new Date(tick).getTime() - new Date(startTimeIso).getTime(), 0);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatHours(value: number, locale: Locale) {
  return `${value.toLocaleString(locale === "de" ? "de-DE" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} h`;
}

function toDateTimeLocal(isoValue: string) {
  const date = new Date(isoValue);
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60000);
  return adjusted.toISOString().slice(0, 16);
}

function formatDateTimePreview(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    return saved === "de" || saved === "en" ? saved : "de";
  });
  const t = messages[locale];
  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("changeit");
  const [registerFullName, setRegisterFullName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeView, setActiveView] = useState<View>("time-tracking");
  const [accountFullName, setAccountFullName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteAccountLoading, setIsDeleteAccountLoading] = useState(false);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [projectFilter, setProjectFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [projectSuggestions, setProjectSuggestions] = useState<string[]>([]);
  const [previousProjectName, setPreviousProjectName] = useState("");
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [stopProjectName, setStopProjectName] = useState("");
  const [stopDescription, setStopDescription] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editProjectName, setEditProjectName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [timerTick, setTimerTick] = useState(Date.now());
  const [isTimeActionLoading, setIsTimeActionLoading] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallAvailable, setIsInstallAvailable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.title = t.appName;
  }, [locale, t.appName]);

  useEffect(() => {
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      setIsInstallAvailable(true);
    };
    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      setIsInstallAvailable(false);
      setIsStandalone(true);
      setStatusMessage(t.installSuccessHint);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [t.installSuccessHint]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/heartbeat`)
      .then(async (response) => {
        if (!response.ok) throw new Error(t.loadingHeartbeat);
        return response.json();
      })
      .then(setHeartbeat)
      .catch((err: Error) => setError(err.message));
  }, [t.loadingHeartbeat]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setActiveEntry(null);
      setTimeEntries([]);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return;
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    void loadCurrentUser(token).catch((err: Error) => {
      setToken("");
      setError(err.message);
    });
  }, [token, t.sessionExpired]);

  useEffect(() => {
    if (!token || !user) return;
    void refreshTimeTrackingData(token).catch((err: Error) => setError(err.message));
  }, [token, user, page, pageSize]);

  useEffect(() => {
    if (!activeEntry) return;
    const interval = window.setInterval(() => setTimerTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeEntry]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalEntries / pageSize)), [pageSize, totalEntries]);

  async function loadCurrentUser(currentToken: string) {
    const response = await fetch(`${API_BASE_URL}/api/me`, { headers: buildAuthHeaders(currentToken) });
    if (!response.ok) throw new Error(t.sessionExpired);
    const payload: User = await response.json();
    setUser(payload);
    setAccountFullName(payload.full_name);
    setAccountEmail(payload.email);
    return payload;
  }

  async function refreshTimeTrackingData(currentToken: string) {
    await Promise.all([loadActiveEntry(currentToken), loadTimeEntries(currentToken, page, pageSize)]);
  }

  async function loadActiveEntry(currentToken: string) {
    const response = await fetch(`${API_BASE_URL}/api/time-entries/active`, { headers: buildAuthHeaders(currentToken) });
    if (!response.ok) throw new Error(t.activeEntryFailed);
    const payload: ActiveTimeEntryResponse = await response.json();
    setActiveEntry(payload.entry);
    const rememberedProject = payload.previous_project_name ?? "";
    setPreviousProjectName(rememberedProject);
    setStopProjectName((currentValue) => currentValue || rememberedProject);
  }

  async function loadTimeEntries(currentToken: string, currentPage: number, currentPageSize: number, filters?: TimeEntryFilters) {
    setIsTableLoading(true);
    const appliedFilters = filters ?? { projectName: projectFilter, year: yearFilter, month: monthFilter, day: dayFilter };
    const query = buildQueryString({
      projectName: appliedFilters.projectName,
      year: appliedFilters.year,
      month: appliedFilters.month,
      day: appliedFilters.day,
      page: currentPage,
      pageSize: currentPageSize
    });
    try {
      const response = await fetch(`${API_BASE_URL}/api/time-entries?${query}`, { headers: buildAuthHeaders(currentToken) });
      if (!response.ok) throw new Error(t.entriesFailed);
      const payload: TimeEntryListResponse = await response.json();
      setTimeEntries(payload.items);
      setTotalEntries(payload.total);
      setProjectSuggestions(payload.project_suggestions);
      setPreviousProjectName(payload.previous_project_name ?? "");
      setStopProjectName((currentValue) => currentValue || payload.previous_project_name || "");
    } finally {
      setIsTableLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatusMessage("");
    setIsLoading(true);
    try {
      const body = new URLSearchParams({ username, password });
      const tokenResponse = await fetch(`${API_BASE_URL}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      if (!tokenResponse.ok) {
        setToken("");
        setError(t.loginFailed);
        return;
      }
      const tokenPayload = await tokenResponse.json();
      const accessToken = tokenPayload.access_token as string;
      await loadCurrentUser(accessToken);
      setToken(accessToken);
      setActiveView("time-tracking");
      setAuthMode("login");
    } catch (err) {
      setToken("");
      setError(err instanceof Error ? err.message : t.loginFailed);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatusMessage("");
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email: registerEmail, password, full_name: registerFullName })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: t.registrationFailed }));
        throw new Error(payload.detail ?? t.registrationFailed);
      }
      setStatusMessage(t.registered);
      setAuthMode("login");
      setRegisterFullName("");
      setRegisterEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.registrationFailed);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatusMessage("");
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: t.resetFailed }));
        throw new Error(payload.detail ?? t.resetFailed);
      }
      const payload = (await response.json()) as { message?: string };
      setStatusMessage(payload.message ?? t.resetSent);
      setResetEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.resetFailed);
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    setToken("");
    setUser(null);
    setPassword("changeit");
    setError("");
    setStatusMessage("");
    setPage(1);
    setIsDeleteDialogOpen(false);
  }

  async function handleUpdateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError("");
    setStatusMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/account/profile`, {
        method: "PUT",
        headers: { ...buildAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: accountFullName, email: accountEmail })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: t.profileFailed }));
        throw new Error(payload.detail ?? t.profileFailed);
      }
      const updatedUser = (await response.json()) as User;
      setUser(updatedUser);
      setAccountFullName(updatedUser.full_name);
      setAccountEmail(updatedUser.email);
      setStatusMessage(t.profileSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.profileFailed);
    }
  }

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError("");
    setStatusMessage("");
    const response = await fetch(`${API_BASE_URL}/api/account/password`, {
      method: "PUT",
      headers: { ...buildAuthHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: t.passwordSaved }));
      setError(payload.detail ?? t.passwordSaved);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setStatusMessage(t.passwordSaved);
  }

  async function handleDeleteAccount() {
    if (!token) return;
    setError("");
    setStatusMessage("");
    setIsDeleteAccountLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/account`, {
        method: "DELETE",
        headers: buildAuthHeaders(token)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: t.accountDeleteFailed }));
        throw new Error(payload.detail ?? t.accountDeleteFailed);
      }
      setIsDeleteDialogOpen(false);
      handleLogout();
      setStatusMessage(t.accountDeleted);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.accountDeleteFailed);
    } finally {
      setIsDeleteAccountLoading(false);
    }
  }

  async function handleStartTimeTracking() {
    if (!token) return;
    setError("");
    setStatusMessage("");
    setIsTimeActionLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/time-entries/start`, {
        method: "POST",
        headers: buildAuthHeaders(token)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: t.startFailed }));
        throw new Error(payload.detail ?? t.startFailed);
      }
      setStopProjectName(previousProjectName);
      setStopDescription("");
      await refreshTimeTrackingData(token);
      setStatusMessage(t.started);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.startFailed);
    } finally {
      setIsTimeActionLoading(false);
    }
  }

  async function handleStopTimeTracking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !activeEntry) return;
    if (!stopProjectName.trim()) {
      setError(t.projectRequired);
      return;
    }
    setError("");
    setStatusMessage("");
    setIsTimeActionLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/time-entries/${activeEntry.id}/stop`, {
        method: "POST",
        headers: { ...buildAuthHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: stopProjectName.trim(),
          activity_description: stopDescription.trim()
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: t.stopFailed }));
        throw new Error(payload.detail ?? t.stopFailed);
      }
      setStopDescription("");
      await refreshTimeTrackingData(token);
      setStatusMessage(t.stopped);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.stopFailed);
    } finally {
      setIsTimeActionLoading(false);
    }
  }

  async function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPage(1);
    await loadTimeEntries(token, 1, pageSize);
  }

  function handleClearFilters() {
    setProjectFilter("");
    setYearFilter("");
    setMonthFilter("");
    setDayFilter("");
    setPage(1);
    if (token) {
      void loadTimeEntries(token, 1, pageSize, { projectName: "", year: "", month: "", day: "" }).catch((err: Error) => setError(err.message));
    }
  }

  async function handleExportCsv() {
    if (!token) return;
    setError("");
    const query = buildQueryString({ projectName: projectFilter, year: yearFilter, month: monthFilter, day: dayFilter });
    const response = await fetch(`${API_BASE_URL}/api/time-entries/export?${query}`, { headers: buildAuthHeaders(token) });
    if (!response.ok) {
      setError(t.csvFailed);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "time-entries.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function beginEdit(entry: TimeEntry) {
    setError("");
    setStatusMessage("");
    setEditingEntryId(entry.id);
    setEditStartTime(toDateTimeLocal(entry.start_time));
    setEditEndTime(toDateTimeLocal(entry.end_time ?? entry.start_time));
    setEditProjectName(entry.project_name ?? "");
    setEditDescription(entry.activity_description ?? "");
  }

  async function handleSaveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || editingEntryId === null) return;
    setError("");
    setStatusMessage("");
    const startDate = new Date(editStartTime);
    const endDate = new Date(editEndTime);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError(t.invalidDateTime);
      return;
    }
    const response = await fetch(`${API_BASE_URL}/api/time-entries/${editingEntryId}`, {
      method: "PUT",
      headers: { ...buildAuthHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        project_name: editProjectName.trim(),
        activity_description: editDescription.trim()
      })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: t.entryUpdated }));
      setError(payload.detail ?? t.entryUpdated);
      return;
    }
    setEditingEntryId(null);
    setStatusMessage(t.entryUpdated);
    await refreshTimeTrackingData(token);
  }

  async function handleDeleteEntry(entryId: number) {
    if (!token || !window.confirm(t.deleteConfirm)) return;
    setError("");
    setStatusMessage("");
    const response = await fetch(`${API_BASE_URL}/api/time-entries/${entryId}`, {
      method: "DELETE",
      headers: buildAuthHeaders(token)
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: t.entryDeleted }));
      setError(payload.detail ?? t.entryDeleted);
      return;
    }
    if (editingEntryId === entryId) setEditingEntryId(null);
    setStatusMessage(t.entryDeleted);
    await refreshTimeTrackingData(token);
  }

  async function handleInstallApp() {
    if (!installPromptEvent) {
      setStatusMessage(window.isSecureContext ? t.installNotAvailable : t.installRequiresSecureContext);
      return;
    }
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setStatusMessage(t.installSuccessHint);
      setInstallPromptEvent(null);
      setIsInstallAvailable(false);
    }
  }

  const languageSelector = (
    <label className="language-control">
      <span>{t.language}</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label={t.language} title={t.tooltipLanguage}>
        <option value="de">{t.german}</option>
        <option value="en">{t.english}</option>
      </select>
    </label>
  );

  const installButton = !isStandalone ? (
    <button type="button" className="secondary-button" onClick={() => void handleInstallApp()} title={t.tooltipInstallApp}>
      {t.installApp}
    </button>
  ) : null;

  if (!token || !user) {
    return (
      <>
        <a className="skip-link" href="#main-content">
          {t.skipToContent}
        </a>
        <main className="login-shell" id="main-content">
          <section className="login-panel login-copy">
            <div className="top-row">
              <div className="badge">{t.secureEntry}</div>
              {languageSelector}
            </div>
            <h1>{t.appName}</h1>
            <p>{t.loginIntro}</p>
            <dl className="details">
              <div>
                <dt>{t.swaggerUi}</dt>
                <dd>
                  <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer" title={t.tooltipOpenSwagger}>
                    {`${API_BASE_URL}/docs`}
                  </a>
                </dd>
              </div>
              <div>
                <dt>{t.heartbeat}</dt>
                <dd>
                  <a href={`${API_BASE_URL}/api/heartbeat`} target="_blank" rel="noreferrer" title={t.tooltipOpenSwagger}>
                    {`${API_BASE_URL}/api/heartbeat`}
                  </a>
                </dd>
              </div>
              <div>
                <dt>{t.demoUser}</dt>
                <dd>admin / changeit</dd>
              </div>
            </dl>
            <section className="install-card" aria-live="polite">
              <strong>{isInstallAvailable ? t.installReady : t.installNotAvailable}</strong>
              <p className="muted">{window.isSecureContext ? t.installSuccessHint : t.installRequiresSecureContext}</p>
              {installButton}
            </section>
          </section>

          <section className="login-panel">
            <div className="menu-bar auth-tabs">
              <button type="button" className={authMode === "login" ? "menu-button menu-button-active" : "menu-button"} onClick={() => setAuthMode("login")}>{t.login}</button>
              <button type="button" className={authMode === "register" ? "menu-button menu-button-active" : "menu-button"} onClick={() => setAuthMode("register")}>{t.register}</button>
              <button type="button" className={authMode === "reset" ? "menu-button menu-button-active" : "menu-button"} onClick={() => setAuthMode("reset")}>{t.resetPassword}</button>
            </div>

            {authMode === "login" ? (
              <form className="auth-form" onSubmit={handleLogin}>
                <label>
                  {t.username}
                  <input value={username} onChange={(event) => setUsername(event.target.value)} title={t.tooltipUsername} autoComplete="username" required />
                </label>
                <label>
                  {t.password}
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} title={t.tooltipPassword} autoComplete="current-password" required />
                </label>
                <button type="submit" disabled={isLoading} title={t.tooltipSignIn}>{isLoading ? t.signingIn : t.signIn}</button>
              </form>
            ) : null}

            {authMode === "register" ? (
              <form className="auth-form" onSubmit={handleRegister}>
                <label>
                  {t.fullName}
                  <input value={registerFullName} onChange={(event) => setRegisterFullName(event.target.value)} title={t.tooltipFullName} autoComplete="name" required />
                </label>
                <label>
                  {t.username}
                  <input value={username} onChange={(event) => setUsername(event.target.value)} title={t.tooltipUsername} autoComplete="username" required />
                </label>
                <label>
                  {t.email}
                  <input type="email" value={registerEmail} onChange={(event) => setRegisterEmail(event.target.value)} title={t.tooltipEmail} autoComplete="email" required />
                </label>
                <label>
                  {t.password}
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} title={t.tooltipPassword} autoComplete="new-password" required />
                </label>
                <button type="submit" disabled={isLoading} title={t.tooltipRegister}>{t.createAccount}</button>
              </form>
            ) : null}

            {authMode === "reset" ? (
              <form className="auth-form" onSubmit={handleResetPassword}>
                <label>
                  {t.email}
                  <input type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} title={t.tooltipEmail} autoComplete="email" required />
                </label>
                <button type="submit" disabled={isLoading} title={t.tooltipResetPassword}>{t.sendReset}</button>
              </form>
            ) : null}

            {error ? <p className="error" role="alert">{error}</p> : null}
            {statusMessage ? <p className="result" role="status">{statusMessage}</p> : null}
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t.skipToContent}
      </a>
      <main className="shell" id="main-content">
        <section className="hero">
          <div className="top-row">
            <div className="badge">OAuth2 Workspace</div>
            {languageSelector}
          </div>
          <h1>{t.appName}</h1>
          <p>{t.workspaceIntro}</p>
          <div className="hero-actions">
            <button type="button" className="secondary-button" onClick={handleLogout} title={t.tooltipSignOut}>{t.signOut}</button>
          </div>
        </section>

        <nav className="card menu-bar" aria-label={t.mainNavigation}>
          <button type="button" className={activeView === "time-tracking" ? "menu-button menu-button-active" : "menu-button"} onClick={() => setActiveView("time-tracking")} title={t.tooltipTimeTracking}>{t.timeTracking}</button>
          <button type="button" className={activeView === "profile" ? "menu-button menu-button-active" : "menu-button"} onClick={() => setActiveView("profile")} title={t.tooltipProfile}>{t.profile}</button>
          <button type="button" className={activeView === "app-info" ? "menu-button menu-button-active" : "menu-button"} onClick={() => setActiveView("app-info")} title={t.tooltipAppInfo}>{t.appInfo}</button>
        </nav>

        {activeView === "time-tracking" ? (
          <>
            <section className="card time-panel">
              <div className="section-header">
                <div>
                  <h2>{t.timeTrackingTitle}</h2>
                  <p className="muted">{t.timeTrackingIntro}</p>
                </div>
                {activeEntry ? (
                  <div className="timer-badge" aria-live="polite">
                    <span className="sr-only">{t.runningDuration}: </span>
                    {formatRunningDuration(activeEntry.start_time, timerTick)}
                  </div>
                ) : null}
              </div>

              {activeEntry ? (
                <form className="auth-form stop-form" onSubmit={handleStopTimeTracking}>
                  <div className="info-grid">
                    <div className="details-item">
                      <span className="label">{t.start}</span>
                      <strong>{activeEntry.start_day} {activeEntry.start_clock_time}</strong>
                    </div>
                    <div className="details-item">
                      <span className="label">{t.runningDuration}</span>
                      <strong>{formatRunningDuration(activeEntry.start_time, timerTick)}</strong>
                    </div>
                  </div>
                  <label>
                    {t.project}
                    <input list="project-suggestions" value={stopProjectName} onChange={(event) => setStopProjectName(event.target.value)} placeholder={previousProjectName || t.projectPlaceholder} title={t.tooltipProject} required />
                  </label>
                  <label>
                    {t.activityDescription}
                    <textarea value={stopDescription} onChange={(event) => setStopDescription(event.target.value)} rows={4} placeholder={t.activityPlaceholder} title={t.tooltipActivity} />
                  </label>
                  <div className="inline-actions">
                    <button type="submit" disabled={isTimeActionLoading} title={t.tooltipStop}>{isTimeActionLoading ? t.stopping : t.stop}</button>
                  </div>
                </form>
              ) : (
                <div className="start-box">
                  <p>{t.noRunningEntry}{previousProjectName ? ` ${t.lastProject}: ${previousProjectName}.` : ""}</p>
                  <button type="button" onClick={handleStartTimeTracking} disabled={isTimeActionLoading} title={t.tooltipStart}>{isTimeActionLoading ? t.starting : t.start}</button>
                </div>
              )}
              <datalist id="project-suggestions">
                {projectSuggestions.map((project) => <option key={project} value={project} />)}
              </datalist>
            </section>

            <section className="card">
              <div className="section-header">
                <div>
                  <h2>{t.entries}</h2>
                  <p className="muted">{t.filtersIntro}</p>
                </div>
                <button type="button" className="secondary-button" onClick={handleExportCsv} title={t.tooltipExportCsv}>{t.exportCsv}</button>
              </div>
              <form className="filters-grid" onSubmit={handleApplyFilters}>
                <div className="filter-fields">
                  <label>
                    {t.projectName}
                    <input list="project-suggestions" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} placeholder={t.filterProjectPlaceholder} title={t.tooltipFilterProject} />
                  </label>
                  <label>
                    {t.year}
                    <input value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} placeholder="2026" title={t.tooltipFilterYear} />
                  </label>
                  <label>
                    {t.month}
                    <input value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} placeholder="4" title={t.tooltipFilterMonth} />
                  </label>
                  <label>
                    {t.day}
                    <input value={dayFilter} onChange={(event) => setDayFilter(event.target.value)} placeholder="9" title={t.tooltipFilterDay} />
                  </label>
                  <label>
                    {t.pageSize}
                    <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} title={t.tooltipPageSize}>
                      {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
                <div className="inline-actions filter-actions">
                  <button type="submit" title={t.tooltipApplyFilters}>{t.applyFilters}</button>
                  <button type="button" className="secondary-button" onClick={handleClearFilters} title={t.tooltipClearFilters}>{t.clearFilters}</button>
                </div>
              </form>

              {editingEntryId !== null ? (
                <form className="auth-form card editing-card" onSubmit={handleSaveEntry}>
                  <h3>{t.editEntry}</h3>
                  <label>
                    {t.startDateTime}
                    <input type="datetime-local" value={editStartTime} onChange={(event) => setEditStartTime(event.target.value)} required />
                    <span className="field-hint">{formatDateTimePreview(editStartTime) || t.dateFormatHint}</span>
                  </label>
                  <label>
                    {t.endDateTime}
                    <input type="datetime-local" value={editEndTime} onChange={(event) => setEditEndTime(event.target.value)} required />
                    <span className="field-hint">{formatDateTimePreview(editEndTime) || t.dateFormatHint}</span>
                  </label>
                  <label>
                    {t.project}
                    <input value={editProjectName} onChange={(event) => setEditProjectName(event.target.value)} />
                  </label>
                  <label>
                    {t.activityDescription}
                    <textarea rows={3} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
                  </label>
                  <div className="inline-actions">
                    <button type="submit">{t.saveChanges}</button>
                    <button type="button" className="secondary-button" onClick={() => setEditingEntryId(null)}>{t.cancel}</button>
                  </div>
                </form>
              ) : null}

              <div className="table-wrap">
                <table>
                  <caption className="sr-only">{t.entryTableCaption}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t.startDay}</th>
                      <th scope="col">{t.startTime}</th>
                      <th scope="col">{t.endDay}</th>
                      <th scope="col">{t.endTime}</th>
                      <th scope="col">{t.projectName}</th>
                      <th scope="col">{t.activityDescription}</th>
                      <th scope="col">{t.duration}</th>
                      <th scope="col">{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td data-label={t.startDay}>{entry.start_day}</td>
                        <td data-label={t.startTime}>{entry.start_clock_time}</td>
                        <td data-label={t.endDay}>{entry.end_day ?? "-"}</td>
                        <td data-label={t.endTime}>{entry.end_clock_time ?? "-"}</td>
                        <td data-label={t.projectName}>{entry.project_name ?? "-"}</td>
                        <td data-label={t.activityDescription}>{entry.activity_description ?? "-"}</td>
                        <td data-label={t.duration}>{formatHours(entry.duration_hours, locale)}</td>
                        <td data-label={t.actions}>
                          <div className="inline-actions compact-actions">
                            <button type="button" className="secondary-button" onClick={() => beginEdit(entry)} title={t.tooltipEditEntry}>{t.edit}</button>
                            <button type="button" className="secondary-button" onClick={() => void handleDeleteEntry(entry.id)} title={t.tooltipDeleteEntry}>{t.delete}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!isTableLoading && timeEntries.length === 0 ? <tr><td colSpan={8}>{t.noEntries}</td></tr> : null}
                  </tbody>
                </table>
                {isTableLoading ? <p className="muted">{t.loadingEntries}</p> : null}
              </div>

              <div className="pagination-bar">
                <span>{t.page} {page} {t.of} {totalPages} | {totalEntries} {t.results}</span>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} title={t.tooltipPreviousPage}>{t.previous}</button>
                  <button type="button" className="secondary-button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} title={t.tooltipNextPage}>{t.next}</button>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeView === "profile" ? (
          <>
            <section className="card">
              <div className="section-header">
                <div>
                  <h2>{t.personalDetails}</h2>
                  <p className="muted">{t.personalDetailsIntro}</p>
                </div>
              </div>
              <form className="auth-form profile-form" onSubmit={handleUpdateProfile}>
                <label>
                  {t.username}
                  <input value={user.username} disabled aria-readonly="true" />
                </label>
                <label>
                  {t.fullName}
                  <input value={accountFullName} onChange={(event) => setAccountFullName(event.target.value)} title={t.tooltipFullName} autoComplete="name" required />
                </label>
                <label>
                  {t.email}
                  <input type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} title={t.tooltipEmail} autoComplete="email" required />
                </label>
                <button type="submit" title={t.tooltipSaveProfile}>{t.saveProfile}</button>
              </form>
            </section>

            <section className="card profile-grid">
              <div>
                <h2>{t.updatePassword}</h2>
                <form className="auth-form" onSubmit={handleUpdatePassword}>
                  <label>
                    {t.currentPassword}
                    <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} title={t.tooltipCurrentPassword} autoComplete="current-password" required />
                  </label>
                  <label>
                    {t.newPassword}
                    <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} title={t.tooltipNewPassword} autoComplete="new-password" required />
                  </label>
                  <button type="submit" title={t.tooltipSavePassword}>{t.savePassword}</button>
                </form>
              </div>
              <div className="danger-zone">
                <h2>{t.deleteAccount}</h2>
                <p>{t.deleteAccountIntro}</p>
                <p className="muted">{t.deleteAccountWarning}</p>
                <button type="button" className="danger-button" onClick={() => setIsDeleteDialogOpen(true)} title={t.tooltipOpenDeleteDialog}>{t.openDeleteDialog}</button>
              </div>
            </section>
          </>
        ) : null}

        {activeView === "app-info" ? (
          <>
            <section className="card">
              <div className="section-header">
                <div>
                  <h2>{t.appInfo}</h2>
                  <p className="muted">{t.publicHeartbeat}</p>
                </div>
              </div>
              <div className="info-actions">
                <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer" title={t.tooltipOpenSwagger}>{t.openSwagger}</a>
                <a href={MAILHOG_UI_URL} target="_blank" rel="noreferrer">{t.openMailhog}</a>
                {installButton}
              </div>
            </section>

            <section className="card">
              <h2>{t.publicHeartbeat}</h2>
              {heartbeat ? (
                <dl className="details">
                  <div><dt>{t.name}</dt><dd>{heartbeat.name}</dd></div>
                  <div><dt>{t.version}</dt><dd>{heartbeat.version}</dd></div>
                </dl>
              ) : <p>{t.loadingHeartbeat}</p>}
            </section>
            <section className="card">
              <h2>{t.authenticatedSession}</h2>
              <div className="result">
                <p>{t.authenticatedAs} {user.full_name}</p>
                <p>{t.username}: {user.username}</p>
                <p>{t.email}: {user.email}</p>
              </div>
            </section>
          </>
        ) : null}

        {error ? <p className="error global-error" role="alert">{error}</p> : null}
        {statusMessage ? <p className="result" role="status">{statusMessage}</p> : null}
        <div className="sr-only" aria-live="polite">{activeEntry ? t.runningDuration : ""}</div>
      </main>

      {isDeleteDialogOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsDeleteDialogOpen(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-account-title">{t.confirmAccountDeletion}</h2>
            <p id="delete-account-description">{t.deleteAccountWarning}</p>
            <div className="inline-actions">
              <button type="button" className="secondary-button" onClick={() => setIsDeleteDialogOpen(false)}>{t.cancelDeletion}</button>
              <button type="button" className="danger-button" onClick={() => void handleDeleteAccount()} disabled={isDeleteAccountLoading} title={t.tooltipConfirmDeleteAccount}>{t.deleteAccount}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
