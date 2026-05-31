type AppHeaderProps = {
  message: string
  error: string
  canChangeFile?: boolean
  onChangeFile?: () => void
}

function AppHeader({ message, error, canChangeFile = false, onChangeFile }: AppHeaderProps) {
  return (
    <header className="flex flex-col gap-4 rounded-2xl border border-panel-border bg-panel-bg p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-4">
        <img src="/logo.png" alt="Sloploop logo" className="h-16 w-auto" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="m-0 text-[clamp(28px,4vw,44px)] leading-none font-bold">Sloploop</h1>
            <a
              href="https://github.com/Flynsarmy/sloploop"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Sloploop on GitHub"
              title="Open Sloploop on GitHub"
              className="text-app-muted transition hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-orange"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-6 w-6 translate-y-[5px]"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0.5C5.372 0.5 0 5.873 0 12.5c0 5.303 3.438 9.8 8.205 11.387 0.6 0.113 0.82-0.258 0.82-0.577 0-0.286-0.012-1.232-0.017-2.233-3.338 0.725-4.043-1.416-4.043-1.416-0.546-1.387-1.333-1.757-1.333-1.757-1.09-0.744 0.083-0.729 0.083-0.729 1.205 0.084 1.84 1.237 1.84 1.237 1.07 1.833 2.807 1.303 3.492 0.997 0.108-0.775 0.42-1.303 0.763-1.603-2.665-0.304-5.467-1.333-5.467-5.931 0-1.31 0.468-2.381 1.235-3.221-0.124-0.303-0.535-1.526 0.117-3.176 0 0 1.007-0.322 3.3 1.23A11.498 11.498 0 0 1 12 6.307c1.02 0.005 2.047 0.138 3.006 0.404 2.291-1.553 3.297-1.23 3.297-1.23 0.653 1.65 0.242 2.873 0.119 3.176 0.77 0.84 1.233 1.911 1.233 3.221 0 4.609-2.807 5.624-5.479 5.921 0.431 0.372 0.815 1.103 0.815 2.222 0 1.606-0.015 2.898-0.015 3.293 0 0.322 0.216 0.696 0.825 0.578C20.565 22.296 24 17.801 24 12.5 24 5.873 18.627 0.5 12 0.5Z" />
              </svg>
            </a>
          </div>
          <p className="mt-2 mb-0 text-app-muted">
            Loop crafting and clip cleanup for game audio in the browser.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-sm lg:items-end lg:text-right">
        <span>{message}</span>
        {canChangeFile ? (
          <button
            type="button"
            onClick={onChangeFile}
            className="w-fit border-0 bg-transparent p-0 text-sm text-accent-orange underline underline-offset-2 transition hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-orange lg:self-end"
          >
            Change file
          </button>
        ) : null}
        {error ? (
          <span className="rounded-full border border-error-border bg-error-bg px-2.5 py-1 text-error-text">
            {error}
          </span>
        ) : null}
      </div>
    </header>
  )
}

export default AppHeader