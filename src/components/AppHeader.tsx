type AppHeaderProps = {
  message: string
  error: string
}

function AppHeader({ message, error }: AppHeaderProps) {
  return (
    <header className="flex flex-col gap-4 rounded-2xl border border-panel-border bg-panel-bg p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-4">
        <img src="/logo.png" alt="Sloploop logo" className="h-16 w-auto" />
        <div>
          <h1 className="m-0 text-[clamp(28px,4vw,44px)] leading-none font-bold">Sloploop</h1>
          <p className="mt-2 mb-0 text-app-muted">
            Loop crafting and clip cleanup for game audio in the browser.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-sm lg:items-end lg:text-right">
        <span>{message}</span>
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