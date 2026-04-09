import { FormEvent, useEffect, useMemo, useState } from "react";
import { Locale, View, messages } from "./i18n";

type Heartbeat = {
  name: string;
  version: string;
};

type User = {
  username: string;
  full_name: string;
  disabled: boolean;
};

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

type ActiveTimeEntryResponse = {
  entry: TimeEntry | null;
  previous_project_name: string | null;
};

const API_BASE_URL = "http://localhost:8000";
const TOKEN_STORAGE_KEY = "rworkspace.accessToken";
const LOCALE_STORAGE_KEY = "rworkspace.locale";
const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 50, 100];

function buildAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`
  };
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

  if (filters.projectName.trim()) {
    params.set("project_name", filters.projectName.trim());
  }
  if (filters.year.trim()) {
    params.set("year", filters.year.trim());
  }
  if (filters.month.trim()) {
    params.set("month", filters.month.trim());
  }
  if (filters.day.trim()) {
    params.set("day", filters.day.trim());
  }
  if (filters.page) {
    params.set("page", String(filters.page));
  }
  if (filters.pageSize) {
    params.set("page_size", String(filters.pageSize));
  }

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

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    return saved === "de" || saved === "en" ? saved : "de";
  });
  const t = messages[locale];
  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("changeit");
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeView, setActiveView] = useState<View>("sandbox");

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
  const [timerTick, setTimerTick] = useState(Date.now());
  const [isTimeActionLoading, setIsTimeActionLoading] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.title = t.appName;
  }, [locale, t.appName]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/heartbeat`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(t.loadingHeartbeat);
        }
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

    fetch(`${API_BASE_URL}/api/me`, {
      headers: buildAuthHeaders(token)
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(t.sessionExpired);
        }
        return response.json();
      })
      .then(setUser)
      .catch((err: Error) => {
        setToken("");
        setError(err.message);
      });
  }, [token, t.sessionExpired]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    void refreshTimeTrackingData(token).catch((err: Error) => {
      setError(err.message);
    });
  }, [token, user, page, pageSize]);

  useEffect(() => {
    if (!activeEntry) {
      return;
    }

    const interval = window.setInterval(() => {
      setTimerTick(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeEntry]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalEntries / pageSize)), [pageSize, totalEntries]);

  async function refreshTimeTrackingData(currentToken: string) {
    await Promise.all([loadActiveEntry(currentToken), loadTimeEntries(currentToken, page, pageSize)]);
  }

  async function loadActiveEntry(currentToken: string) {
    const response = await fetch(`${API_BASE_URL}/api/time-entries/active`, {
      headers: buildAuthHeaders(currentToken)
    });

    if (!response.ok) {
      throw new Error(t.activeEntryFailed);
    }

    const payload: ActiveTimeEntryResponse = await response.json();
    setActiveEntry(payload.entry);
    const rememberedProject = payload.previous_project_name ?? "";
    setPreviousProjectName(rememberedProject);
    setStopProjectName((currentValue) => currentValue || rememberedProject);
  }

  async function loadTimeEntries(currentToken: string, currentPage: number, currentPageSize: number) {
    setIsTableLoading(true);
    const query = buildQueryString({
      projectName: projectFilter,
      year: yearFilter,
      month: monthFilter,
      day: dayFilter,
      page: currentPage,
      pageSize: currentPageSize
    });

    try {
      const response = await fetch(`${API_BASE_URL}/api/time-entries?${query}`, {
        headers: buildAuthHeaders(currentToken)
      });

      if (!response.ok) {
        throw new Error(t.entriesFailed);
      }

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
    setIsLoading(true);

    try {
      const body = new URLSearchParams({
        username,
        password
      });

      const tokenResponse = await fetch(`${API_BASE_URL}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });

      if (!tokenResponse.ok) {
        setToken("");
        setError(t.loginFailed);
        return;
      }

      const tokenPayload = await tokenResponse.json();
      setToken(tokenPayload.access_token);
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    setToken("");
    setUser(null);
    setPassword("changeit");
    setError("");
    setPage(1);
  }

  async function handleStartTimeTracking() {
    if (!token) {
      return;
    }

    setError("");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t.startFailed);
    } finally {
      setIsTimeActionLoading(false);
    }
  }

  async function handleStopTimeTracking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !activeEntry) {
      return;
    }

    if (!stopProjectName.trim()) {
      setError(t.projectRequired);
      return;
    }

    setError("");
    setIsTimeActionLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/time-entries/${activeEntry.id}/stop`, {
        method: "POST",
        headers: {
          ...buildAuthHeaders(token),
          "Content-Type": "application/json"
        },
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t.stopFailed);
    } finally {
      setIsTimeActionLoading(false);
    }
  }

  async function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setPage(1);
    await loadTimeEntries(token, 1, pageSize);
  }

  async function handleExportCsv() {
    if (!token) {
      return;
    }

    const query = buildQueryString({
      projectName: projectFilter,
      year: yearFilter,
      month: monthFilter,
      day: dayFilter
    });

    const response = await fetch(`${API_BASE_URL}/api/time-entries/export?${query}`, {
      headers: buildAuthHeaders(token)
    });

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

  const languageSelector = (
    <label className="language-control">
      <span>{t.language}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t.language}
        title={t.tooltipLanguage}
      >
        <option value="de">{t.german}</option>
        <option value="en">{t.english}</option>
      </select>
    </label>
  );

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
                  http://localhost:8000/docs
                </a>
              </dd>
            </div>
            <div>
              <dt>{t.heartbeat}</dt>
              <dd>
                <a href={`${API_BASE_URL}/api/heartbeat`} target="_blank" rel="noreferrer" title={t.tooltipOpenSwagger}>
                  http://localhost:8000/api/heartbeat
                </a>
              </dd>
            </div>
            <div>
              <dt>{t.demoUser}</dt>
              <dd>admin / changeit</dd>
            </div>
          </dl>
        </section>

        <section className="login-panel">
          <h2>{t.login}</h2>
          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              {t.username}
              <input value={username} onChange={(event) => setUsername(event.target.value)} title={t.tooltipUsername} autoComplete="username" />
            </label>
            <label>
              {t.password}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                title={t.tooltipPassword}
                autoComplete="current-password"
              />
            </label>
            <button type="submit" disabled={isLoading} title={t.tooltipSignIn}>
              {isLoading ? t.signingIn : t.signIn}
            </button>
          </form>

          {error ? <p className="error" role="alert">{error}</p> : null}
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
          <a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer" title={t.tooltipOpenSwagger}>
            {t.openSwagger}
          </a>
          <button type="button" className="secondary-button" onClick={handleLogout} title={t.tooltipSignOut}>
            {t.signOut}
          </button>
        </div>
      </section>

      <nav className="card menu-bar" aria-label={t.mainNavigation}>
        <button
          type="button"
          className={activeView === "sandbox" ? "menu-button menu-button-active" : "menu-button"}
          onClick={() => setActiveView("sandbox")}
          title={t.tooltipSandbox}
        >
          {t.sandbox}
        </button>
        <button
          type="button"
          className={
            activeView === "time-tracking" ? "menu-button menu-button-active" : "menu-button"
          }
          onClick={() => setActiveView("time-tracking")}
          title={t.tooltipTimeTracking}
        >
          {t.timeTracking}
        </button>
      </nav>

      {activeView === "sandbox" ? (
        <>
          <section className="card">
            <h2>{t.publicHeartbeat}</h2>
            {heartbeat ? (
              <dl className="details">
                <div>
                  <dt>{t.name}</dt>
                  <dd>{heartbeat.name}</dd>
                </div>
                <div>
                  <dt>{t.version}</dt>
                  <dd>{heartbeat.version}</dd>
                </div>
              </dl>
            ) : (
              <p>{t.loadingHeartbeat}</p>
            )}
          </section>

          <section className="card">
            <h2>{t.authenticatedSession}</h2>
            <div className="result">
              <p>{t.authenticatedAs} {user.full_name}</p>
              <p>{t.username}: {user.username}</p>
            </div>
          </section>
        </>
      ) : (
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
                    <strong>
                      {activeEntry.start_day} {activeEntry.start_clock_time}
                    </strong>
                  </div>
                  <div className="details-item">
                    <span className="label">{t.runningDuration}</span>
                    <strong>{formatRunningDuration(activeEntry.start_time, timerTick)}</strong>
                  </div>
                </div>

                <label>
                  {t.project}
                  <input
                    list="project-suggestions"
                    value={stopProjectName}
                    onChange={(event) => setStopProjectName(event.target.value)}
                    placeholder={previousProjectName || t.projectPlaceholder}
                    title={t.tooltipProject}
                  />
                </label>

                <label>
                  {t.activityDescription}
                  <textarea
                    value={stopDescription}
                    onChange={(event) => setStopDescription(event.target.value)}
                    rows={4}
                    placeholder={t.activityPlaceholder}
                    title={t.tooltipActivity}
                  />
                </label>

                <div className="inline-actions">
                  <button type="submit" disabled={isTimeActionLoading} title={t.tooltipStop}>
                    {isTimeActionLoading ? t.stopping : t.stop}
                  </button>
                </div>
              </form>
            ) : (
              <div className="start-box">
                <p>
                  {t.noRunningEntry}
                  {previousProjectName ? ` ${t.lastProject}: ${previousProjectName}.` : ""}
                </p>
                <button type="button" onClick={handleStartTimeTracking} disabled={isTimeActionLoading} title={t.tooltipStart}>
                  {isTimeActionLoading ? t.starting : t.start}
                </button>
              </div>
            )}

            <datalist id="project-suggestions">
              {projectSuggestions.map((project) => (
                <option key={project} value={project} />
              ))}
            </datalist>
          </section>

          <section className="card">
            <div className="section-header">
              <div>
                <h2>{t.entries}</h2>
                <p className="muted">{t.filtersIntro}</p>
              </div>
              <button type="button" className="secondary-button" onClick={handleExportCsv} title={t.tooltipExportCsv}>
                {t.exportCsv}
              </button>
            </div>

            <form className="filters-grid" onSubmit={handleApplyFilters}>
              <label>
                {t.projectName}
                <input
                  list="project-suggestions"
                  value={projectFilter}
                  onChange={(event) => setProjectFilter(event.target.value)}
                  placeholder={t.filterProjectPlaceholder}
                  title={t.tooltipFilterProject}
                />
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
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  title={t.tooltipPageSize}
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <div className="inline-actions filter-actions">
                <button type="submit" title={t.tooltipApplyFilters}>{t.applyFilters}</button>
              </div>
            </form>

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
                    </tr>
                  ))}
                  {!isTableLoading && timeEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7}>{t.noEntries}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              {isTableLoading ? <p className="muted">{t.loadingEntries}</p> : null}
            </div>

            <div className="pagination-bar">
              <span>
                {t.page} {page} {t.of} {totalPages} | {totalEntries} {t.results}
              </span>
              <div className="inline-actions">
                <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} title={t.tooltipPreviousPage}>
                  {t.previous}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  title={t.tooltipNextPage}
                >
                  {t.next}
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {error ? <p className="error global-error" role="alert">{error}</p> : null}
      <div className="sr-only" aria-live="polite">
        {activeEntry ? t.runningDuration : ""}
      </div>
    </main>
    </>
  );
}
